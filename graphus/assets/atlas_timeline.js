import {prepareTemporalEvidence,PathError} from './atlas_paths.js';
import {utcTimestamp} from './atlas_statistics.js';

export const TIMELINE_VERSION='graphus-atlas-timeline-1.0.0';
export const TIMELINE_LIMITS=Object.freeze({nodes:1200,records:4000,pages:8,buckets:366,response_bytes:8000000});
export const TIMELINE_KINDS=Object.freeze({BTC:['observed_input_prevout','created_output'],BLCH:['observed_spent_outpoint_reference','observed_created_output'],ETH:['native_value'],USDT:['erc20_transfer'],USDC:['erc20_transfer']});
const intervals={minute:60000,hour:3600000,day:86400000},encoder=new TextEncoder();
export class TimelineError extends PathError {}
const check=(ok,code,status=400)=>{if(!ok)throw new TimelineError(code,status);};
const order=(a,b)=>a<b?-1:a>b?1:0;
const sha=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const iso=time=>time===null?null:new Date(time).toISOString();
const exact=(edge,utxo)=>({...Object.fromEntries(['event_id','from','to','kind','amount_base_units','txid','position','block_number','block_hash','block_time'].map(key=>[key,edge[key]??null])),outpoint:utxo&&edge.outpoint?{txid:edge.outpoint.txid,vout:edge.outpoint.vout}:null});
export function timelineParameters(input={}){
  check(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).every(key=>['reference','direction','kind','minimum','interval','start','end'].includes(key)),'unexpected_timeline_parameters');
  const p={reference:input.reference??null,direction:input.direction??'all',kind:input.kind??'all',minimum:input.minimum??'0',interval:input.interval??'auto',start:input.start??null,end:input.end??null};
  check(p.reference===null||typeof p.reference==='string'&&p.reference.length>0&&p.reference.length<=200,'invalid_timeline_reference');
  check(['all','incoming','outgoing','self'].includes(p.direction)&&(p.direction==='all'||p.reference!==null),'timeline_direction_requires_reference');
  check(typeof p.kind==='string'&&p.kind.length>0&&p.kind.length<=80,'invalid_timeline_kind');
  check(['auto',...Object.keys(intervals)].includes(p.interval),'invalid_timeline_interval');
  check(typeof p.minimum==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(p.minimum),'invalid_timeline_minimum');
  for(const key of ['start','end'])if(p[key]!==null){const time=utcTimestamp(p[key]);check(time!==null&&time>=0,'invalid_timeline_utc_range');p[key]=iso(time);}
  check(!p.start||!p.end||utcTimestamp(p.start)<=utcTimestamp(p.end),'invalid_timeline_utc_range');return p;
}
export function timelineTotals(events){
  const groups=new Map();for(const event of events){const key=JSON.stringify([event.kind,event.direction]);if(!groups.has(key))groups.set(key,{kind:event.kind,direction:event.direction,events:0,total:0n});const group=groups.get(key);group.events++;group.total+=BigInt(event.amount_base_units);}
  return [...groups.values()].sort((a,b)=>order(a.kind,b.kind)||order(a.direction,b.direction)).map(({total,...group})=>({...group,observed_total_base_units:total.toString()}));
}
export async function exploreAtlasTimeline(graph,input={},context={}){
  const p=timelineParameters(input);let prepared;
  try{prepared=await prepareTemporalEvidence(graph,{minimum:'0',start:null,end:null},context);}catch(error){if(error instanceof PathError)throw new TimelineError(error.message.replaceAll('path','timeline'),error.status);throw error;}
  const {asset,nodes,datasetHash}=prepared,kinds=TIMELINE_KINDS[graph.asset];
  check(p.reference===null||nodes.has(p.reference),'timeline_reference_unobserved',404);check(p.kind==='all'||kinds.includes(p.kind),'invalid_timeline_kind');
  const excluded={unsupported_kind:0,unsupported_endpoint:0,missing_event_position:0,other_reference:0,other_direction:0,other_kind:0,missing_timestamp:0,invalid_timestamp:0,below_minimum:0,outside_window:0},candidates=[],identities=new Set(),outpoints=new Set(),transactions=new Map();
  for(const edge of graph.edges){
    if(!kinds.includes(edge.kind)){excluded.unsupported_kind++;continue;}
    const from=nodes.get(edge.from),to=nodes.get(edge.to),inputKind=kinds[0]===edge.kind,referenceKind=node=>['address','script_hash'].includes(node.kind),transactionKind=node=>node.kind==='transaction'&&typeof node.txid==='string'&&node.txid.toLowerCase()===edge.txid.toLowerCase();
    const endpoints=asset.standard==='UTXO'?(inputKind?referenceKind(from)&&transactionKind(to):transactionKind(from)&&referenceKind(to)):[from,to].every(node=>node.kind==='address'&&/^0x[a-f0-9]{40}$/i.test(node.address));
    if(!endpoints){excluded.unsupported_endpoint++;continue;}
    if((asset.contract||asset.standard==='UTXO')&&edge.position===undefined){excluded.missing_event_position++;continue;}
    const tx=edge.txid.toLowerCase(),identity=JSON.stringify([tx,edge.kind,asset.standard==='UTXO'||asset.contract?edge.position:null]);
    check(!identities.has(identity),'duplicate_timeline_event',422);identities.add(identity);
    if(asset.standard==='UTXO'&&edge.outpoint!==undefined&&edge.outpoint!==null){
      const point=edge.outpoint;check(typeof point==='object'&&typeof point.txid==='string'&&/^(0x)?[a-f0-9]{64}$/i.test(point.txid)&&Number.isSafeInteger(point.vout)&&point.vout>=0&&(inputKind||point.txid.toLowerCase()===tx),'invalid_timeline_outpoint',422);
      const key=JSON.stringify([tx,edge.kind,point.txid.toLowerCase(),point.vout]);check(!outpoints.has(key),'duplicate_timeline_outpoint',422);outpoints.add(key);
    }
    check(!transactions.has(tx)||transactions.get(tx)===edge.block_number,'inconsistent_timeline_transaction',422);transactions.set(tx,edge.block_number);
    const direction=p.reference===null?'observed':edge.from===p.reference&&edge.to===p.reference?'self':edge.to===p.reference?'incoming':'outgoing';
    const time=utcTimestamp(edge.block_time),reason=p.reference!==null&&edge.from!==p.reference&&edge.to!==p.reference?'other_reference':p.direction!=='all'&&direction!==p.direction?'other_direction':p.kind!=='all'&&edge.kind!==p.kind?'other_kind':edge.block_time===null||edge.block_time===undefined?'missing_timestamp':time===null||time<0?'invalid_timestamp':BigInt(edge.amount_base_units)<BigInt(p.minimum)?'below_minimum':null;
    if(reason){excluded[reason]++;continue;}candidates.push({edge,time,direction});
  }
  candidates.sort((a,b)=>a.time-b.time||order(a.edge.event_id,b.edge.event_id));
  let start=p.start?utcTimestamp(p.start):candidates[0]?.time??(p.end?utcTimestamp(p.end):null),end=p.end?utcTimestamp(p.end):candidates.at(-1)?.time??start;
  if(start!==null&&end!==null&&start>end){if(p.start===null)start=end;else if(p.end===null)end=start;}
  const count=step=>start===null?0:Math.floor(end/step)-Math.floor(start/step)+1;
  const interval=p.interval==='auto'?Object.keys(intervals).find(key=>count(intervals[key])<=TIMELINE_LIMITS.buckets):p.interval;
  check(interval&&count(intervals[interval])<=TIMELINE_LIMITS.buckets,'timeline_bucket_capacity',422);
  const step=intervals[interval],origin=start===null?null:Math.floor(start/step)*step,buckets=Array.from({length:count(step)},(_,index)=>{const time=origin+index*step;return {index,start:iso(time),end_exclusive:iso(time+step),query_start:iso(Math.max(time,start)),query_end_inclusive:iso(Math.min(time+step-1,end)),query_clipped:start>time||end<time+step-1,state:'unknown',observed_events:null,groups:[]};}),events=[];
  const bucketEvents=buckets.map(()=>[]);
  for(const {edge,time,direction} of candidates){if(time<start||time>end){excluded.outside_window++;continue;}const event={...exact(edge,asset.standard==='UTXO'),direction,bucket_index:Math.floor((time-origin)/step)};events.push(event);bucketEvents[event.bucket_index].push(event);}
  for(const bucket of buckets){const rows=bucketEvents[bucket.index];if(rows.length){bucket.state='observed';bucket.observed_events=rows.length;bucket.groups=timelineTotals(rows);}}
  const notes=['Buckets are half-open UTC intervals aligned to the Unix epoch. Query dates are inclusive; clipped bucket bounds are disclosed.',
    'Counts and sums describe returned events only. Empty buckets have unknown source coverage, not a zero chain-activity finding. No bucket is claimed complete.',
    'Amounts remain exact base-unit strings, grouped by event type and recorded direction. UTXO input references and created outputs are never added as transferred volume.',
    'UTXO outpoint evidence is retained when supplied. Missing outpoints are not reconstructed from event position; supplied outpoints cannot repeat within the same transaction and event kind.',
    'Direction is relative to an optional exact reference. Self events count once in their own group; without a reference, direction is observed. Zero-value and mint/burn observations remain eligible.',
    'Equal-time events sort by event ID for reproducibility. This ordering does not establish an execution sequence, ownership or continuity of funds.',
    'Exclusions count each record under its first applicable reason. Dates and observation totals do not replace the source coverage and omissions.',
    'SHA-256 verifies JSON.stringify(report without report_sha256) in returned property order, not independent source truth or canonical history.'];
  if(context.imported)notes.push('Imported source claims have not been independently verified.');
  if(asset.contract&&graph.snapshots.some(snapshot=>!snapshot.scope?.contract))notes.push('Some source pages lack token contract metadata. Asset identity relies on the declared capture and configured adapter.');
  const report={version:TIMELINE_VERSION,state:candidates.length?'available':'unavailable',reason:candidates.length?null:'No valid timed observations match the non-time filters. No timestamp or activity is inferred.',asset:graph.asset,network:graph.network,asset_id:asset.id,unit:asset.unit,decimals:asset.decimals,parameters:p,
    provenance:{dataset_sha256:datasetHash,analysis_id:context.analysis_id??null,source:graph.source,snapshots:graph.snapshots,coverage:graph.coverage??null,imported:Boolean(context.imported),parent_selection:context.selection??null,independent_verification:false},
    window:{start:iso(start),end_inclusive:iso(end),interval,interval_seconds:step/1000,alignment:'unix-epoch-utc',buckets:buckets.length},
    coverage:{records:graph.edges.length,timed_candidates:candidates.length,returned_records:events.length,excluded,complete_history:false},groups:timelineTotals(events),buckets,events,limits:TIMELINE_LIMITS,notes};
  const serialized=JSON.stringify(report);check(encoder.encode(serialized).length+100<=TIMELINE_LIMITS.response_bytes,'timeline_report_capacity',422);return {...report,report_sha256:await sha(serialized)};
}

export function timelineView(report,{first=0,last=report.buckets.length-1,query=''}={}){
  const max=report.buckets.length-1;check(Number.isInteger(first)&&Number.isInteger(last)&&(max<0?first===0&&last===-1:first>=0&&last>=first&&last<=max),'invalid_timeline_selection');
  const text=String(query).trim().toLowerCase(),events=report.events.filter(event=>event.bucket_index>=first&&event.bucket_index<=last&&(!text||[event.event_id,event.from,event.to,event.txid].some(value=>value.toLowerCase().includes(text))));
  return {selection:{first_bucket:first,last_bucket:last,start:report.buckets[first]?.query_start??null,end_inclusive:report.buckets[last]?.query_end_inclusive??null,event_search:text},events,groups:timelineTotals(events)};
}
export function timelineCsv(report,selection={}){
  const view=timelineView(report,selection),csv=value=>'"'+String(value??'').replace(/^[\s]*[=+@-]/,match=>"'"+match).replaceAll('"','""')+'"';
  const headers=['timeline_report_sha256','dataset_sha256','asset','unit','selected_start_utc','selected_end_utc_inclusive','event_search','event_id','block_time','kind','direction','from','to','amount_base_units','transaction_id','position','block_height','block_hash','bucket_start_utc'];
  const rows=view.events.map(event=>[report.report_sha256,report.provenance.dataset_sha256,report.asset,report.unit,view.selection.start,view.selection.end_inclusive,view.selection.event_search,event.event_id,event.block_time,event.kind,event.direction,event.from,event.to,event.amount_base_units,event.txid,event.position,event.block_number,event.block_hash,report.buckets[event.bucket_index].start]);
  return [headers,...rows].map(row=>row.map(csv).join(',')).join('\r\n');
}
