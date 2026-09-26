import {prepareTemporalEvidence,PathError} from './atlas_paths.js';
import {utcTimestamp} from './atlas_statistics.js';

export const MOTIF_VERSION='graphus-atlas-motifs-1.0.0';
export const MOTIF_TYPES=['cycles','pass_through','fan_in','fan_out','repeated_pair'];
export const MOTIF_LIMITS=Object.freeze({nodes:1200,records:4000,pages:8,hops:6,results:20,expansions:20000,seconds:604800,response_bytes:8000000});
export class MotifError extends PathError {}
const check=(ok,code,status=400)=>{if(!ok)throw new MotifError(code,status);};
const sha=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const order=(a,b)=>a<b?-1:a>b?1:0;
const compare=(a,b)=>a.time-b.time||order(a.edge.event_id,b.edge.event_id);
const zero=id=>/:address:0x0{40}$/i.test(id);
const exact=e=>Object.fromEntries(['event_id','from','to','kind','amount_base_units','txid','position','block_number','block_hash','block_time'].map(key=>[key,e[key]??null]));

export function motifParameters(input){
  check(input&&Object.keys(input).every(key=>['reference','type','max_hops','max_results','window_seconds','min_counterparties','min_events','minimum','start','end'].includes(key)),'unexpected_motif_parameters');
  const p={reference:input.reference,type:input.type??'cycles',max_hops:input.max_hops??4,max_results:input.max_results??10,
    window_seconds:input.window_seconds??3600,min_counterparties:input.min_counterparties??3,min_events:input.min_events??2,minimum:input.minimum??'0',start:input.start??null,end:input.end??null};
  check(typeof p.reference==='string'&&p.reference.length>0&&p.reference.length<=200,'motif_reference_required');
  check(MOTIF_TYPES.includes(p.type),'invalid_motif_type');
  for(const [key,min,max] of [['max_hops',2,6],['max_results',1,20],['window_seconds',1,604800],['min_counterparties',2,20],['min_events',2,100]])check(Number.isSafeInteger(p[key])&&p[key]>=min&&p[key]<=max,'invalid_motif_limits');
  check(typeof p.minimum==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(p.minimum),'invalid_motif_minimum');
  check((p.start===null||utcTimestamp(p.start)!==null)&&(p.end===null||utcTimestamp(p.end)!==null)&&(!p.start||!p.end||utcTimestamp(p.start)<=utcTimestamp(p.end)),'invalid_motif_utc_range');
  if(p.start)p.start=new Date(utcTimestamp(p.start)).toISOString();if(p.end)p.end=new Date(utcTimestamp(p.end)).toISOString();return p;
}

export async function scanAtlasMotifs(graph,input,context={}){
  const p=motifParameters(input);let prepared;
  try{prepared=await prepareTemporalEvidence(graph,p,context);}catch(error){if(error instanceof PathError)throw new MotifError(error.message.replaceAll('path','motif'),error.status);throw error;}
  const {asset,nodes,datasetHash}=prepared,reference=nodes.get(p.reference);
  check(reference,'motif_reference_unobserved',404);
  if(asset.standard!=='UTXO')check(reference.kind==='address'&&/^0x[a-f0-9]{40}$/i.test(reference.address),'motif_address_reference_required',422);
  const applicable=asset.standard!=='UTXO'&&!zero(p.reference),excluded={...prepared.excluded,zero_address:0,missing_event_position:0},eligible=[],transactions=new Map(),identities=new Set();
  for(const item of prepared.eligible){
    const e=item.edge;if(zero(e.from)||zero(e.to)){excluded.zero_address++;continue;}
    if(asset.contract&&e.position===undefined){excluded.missing_event_position++;continue;}
    // One native-value observation per transaction, or one token observation per
    // transaction/log position. Distinct event labels cannot manufacture repeats.
    const tx=e.txid.toLowerCase(),identity=asset.contract?tx+':'+e.position:tx,block=transactions.get(tx);
    check(!identities.has(identity),'duplicate_motif_transfer',422);identities.add(identity);
    check(block===undefined||block===e.block_number,'inconsistent_motif_transaction',422);transactions.set(tx,e.block_number);eligible.push(item);
  }
  eligible.sort(compare);
  const adjacency=new Map(),neighbors=new Map();
  for(const item of eligible){const e=item.edge;if(!adjacency.has(e.from))adjacency.set(e.from,[]);adjacency.get(e.from).push(item);
    for(const [a,b] of [[e.from,e.to],[e.to,e.from]]){if(!neighbors.has(a))neighbors.set(a,new Set());neighbors.get(a).add(b);}}
  const motifs=[],pruned={time_order:0,block_order:0,window:0,repeated_reference:0},windowMs=p.window_seconds*1000;
  let expansions=0,stop=null;
  const consume=()=>{if(expansions>=MOTIF_LIMITS.expansions){stop='expansion_limit';return false;}expansions++;return true;};
  function append(items,references,extra={}){
    if(motifs.length>=p.max_results){stop='result_limit';return false;}
    const ordered=['cycles','pass_through'].includes(p.type),first=items[0].time,last=items.at(-1).time;
    const peers=[...new Set(items.flatMap(({edge})=>[edge.from,edge.to]).filter(id=>id!==p.reference))].sort(order);
    motifs.push({index:motifs.length+1,type:p.type,reference:p.reference,ordered,started_at:new Date(first).toISOString(),ended_at:new Date(last).toISOString(),duration_seconds:(last-first)/1000,
      references,counterparties:peers,high_degree_references:[...new Set(references)].filter(id=>(neighbors.get(id)?.size||0)>=10).map(id=>({id,neighbors:neighbors.get(id).size})),...extra,
      events:items.map((item,i)=>({...exact(item.edge),gap_seconds:ordered&&i?(item.time-items[i-1].time)/1000:null}))});return true;
  }
  if(applicable&&p.type==='cycles'){
    const queue=[{node:p.reference,references:[p.reference],items:[],first:null,last:null,height:null}];let head=0;
    search:while(head<queue.length){const state=queue[head++];if(state.items.length>=p.max_hops)continue;
      for(const item of adjacency.get(state.node)||[]){if(!consume())break search;const {edge:e,time}=item;
        if(state.last!==null&&time<=state.last){pruned.time_order++;continue;}
        if(state.height!==null&&e.block_number<=state.height){pruned.block_order++;continue;}
        if(state.first!==null&&time-state.first>windowMs){pruned.window++;continue;}
        if(e.to===p.reference&&state.items.length){if(!append([...state.items,item],[...state.references,p.reference],{hops:state.items.length+1}))break search;}
        else if(state.references.includes(e.to)){pruned.repeated_reference++;}
        else if(state.items.length+1<p.max_hops)queue.push({node:e.to,references:[...state.references,e.to],items:[...state.items,item],first:state.first??time,last:time,height:e.block_number});
      }
    }
  }else if(applicable&&p.type==='pass_through'){
    const incoming=eligible.filter(item=>item.edge.to===p.reference),outgoing=adjacency.get(p.reference)||[];
    search:for(const a of incoming)for(const b of outgoing){if(!consume())break search;
      if(b.time<=a.time){pruned.time_order++;continue;}if(b.edge.block_number<=a.edge.block_number){pruned.block_order++;continue;}
      if(b.time-a.time>windowMs){pruned.window++;continue;}if(a.edge.from===b.edge.to){pruned.repeated_reference++;continue;}
      if(!append([a,b],[a.edge.from,p.reference,b.edge.to],{hops:2}))break search;
    }
  }else if(applicable){
    const groups=new Map();
    for(const item of eligible){consume();const e=item.edge,incoming=e.to===p.reference,outgoing=e.from===p.reference;
      if(!(p.type==='fan_in'?incoming:p.type==='fan_out'?outgoing:incoming||outgoing))continue;
      const start=Math.floor(item.time/windowMs)*windowMs,direction=incoming?'incoming':'outgoing',peer=incoming?e.from:e.to;
      const key=JSON.stringify([start,direction,p.type==='repeated_pair'?peer:null]);if(!groups.has(key))groups.set(key,{start,direction,peer,items:[]});groups.get(key).items.push(item);
    }
    const sorted=[...groups.values()].sort((a,b)=>a.start-b.start||order(a.direction,b.direction)||order(a.peer,b.peer));
    for(const group of sorted){const peers=[...new Set(group.items.map(item=>group.direction==='incoming'?item.edge.from:item.edge.to))].sort(order);
      if(p.type==='repeated_pair'?group.items.length<p.min_events:peers.length<p.min_counterparties)continue;
      if(!append(group.items,[p.reference,...peers],{direction:group.direction,window:{start:new Date(group.start).toISOString(),end_exclusive:new Date(group.start+windowMs).toISOString(),
        query_clipped:Boolean(p.start&&utcTimestamp(p.start)>group.start||p.end&&utcTimestamp(p.end)<group.start+windowMs-1)},
        observed_total_base_units:group.items.reduce((sum,item)=>sum+BigInt(item.edge.amount_base_units),0n).toString()}))break;
    }
  }
  const notes=['Motifs describe returned observations, not ownership, intent, AML risk or continuity of the same funds.',
    'Cycles and pass-through pairs require strictly increasing block timestamps and heights; equal-time and within-block order is not inferred.',
    'Cycles return to the selected reference with distinct intermediate references. Pass-through pairs have distinct source, middle and destination references; the same event may support several candidates.',
    'Fan and repeated-pair groups use non-overlapping UTC bins aligned to the Unix epoch. Bins are half-open; boundary-spanning shapes are not searched. Query clipping is disclosed separately from unknown source coverage. These groups do not imply event order.',
    'Repeated pairs count event identities in one direction, not repeated owners or conserved transfers. Fan/repeated sums count returned events only; amounts across sequence steps are never added.',
    'Self events, zero-address endpoints, unsupported event types and invalid/missing times are excluded. Token events require a log position; duplicate transfer identities fail closed.',
    'Result order is deterministic: cycles by hop count and time/event traversal, pairs by incoming/outgoing time and event ID, groups by UTC bin, direction and peer. It is not a risk ranking.',
    'Neighbor counts use eligible sample events. Ten or more neighbors is a structural caveat, not an attribution to a service.',
    'No result describes only this capture, parameters and search bounds. Full-chain absence, finality and source truth are not established.'];
  if(context.imported)notes.push('Imported source claims have not been independently verified.');
  if(asset.contract&&graph.snapshots.some(snapshot=>!snapshot.scope?.contract))notes.push('Some pages omit token contract metadata; asset identity relies on the declared capture and configured adapter.');
  if(p.minimum==='0')notes.push('Zero-value observations remain eligible. Set a positive minimum to exclude them.');
  const report={version:MOTIF_VERSION,state:applicable?'available':'not_applicable',reason:applicable?null:asset.standard==='UTXO'?'BTC and BLCH input/output references do not establish direct account senders. Account-transfer motifs are not calculated.':'The zero address is a mint/burn marker and is not used as a motif reference.',
    asset:graph.asset,network:graph.network,asset_id:asset.id,unit:asset.unit,decimals:asset.decimals,parameters:p,
    provenance:{dataset_sha256:datasetHash,analysis_id:context.analysis_id??null,source:graph.source,snapshots:graph.snapshots,coverage:graph.coverage??null,imported:Boolean(context.imported),parent_selection:context.selection??null,independent_verification:false},
    coverage:{records:graph.edges.length,eligible_records:applicable?eligible.length:0,excluded,complete_history:false},
    search:{expansions,pruned,returned_motifs:motifs.length,truncated:stop!==null,stop_reason:stop,complete_within_query:applicable&&stop===null,limits:MOTIF_LIMITS},motifs,notes};
  const serialized=JSON.stringify(report);check(new TextEncoder().encode(serialized).length+100<=MOTIF_LIMITS.response_bytes,'motif_report_capacity',422);
  return {...report,report_sha256:await sha(serialized)};
}
