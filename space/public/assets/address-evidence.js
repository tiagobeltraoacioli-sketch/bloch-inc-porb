import {validateGraph,nodeId} from './graph-core.js';
import {RESEARCH_VERSION} from './address-research-core.js';

export const ADDRESS_EVIDENCE_VERSION='bloch-address-evidence/1';
export const EVIDENCE_LIMITS=Object.freeze({connections_per_page:8,events_per_page:10,csv_bytes:16000000});
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const compare=(a,b)=>a<b?-1:a>b?1:0;
const supportedKinds=asset=>asset==='ETH'?['native_value','executed_transaction']:['USDT','USDC'].includes(asset)?['erc20_transfer']:['input','output'];
const height=value=>{
  if(value==null||value==='')return null;
  check((typeof value==='number'&&Number.isSafeInteger(value)||typeof value==='string'&&/^(0|[1-9][0-9]{0,15})$/.test(value))&&Number.isSafeInteger(Number(value))&&Number(value)>=0,'Use a nonnegative whole block height.');
  return Number(value);
};
const direction=(edge,focus)=>edge.from===focus&&edge.to===focus?'self':edge.to===focus?'incoming':'outgoing';
export const evidenceConnectionKey=edge=>JSON.stringify([edge.from,edge.to,edge.kind]);
const csvCell=value=>{const s=String(value??'');return '"'+(/^[\s]*[=+@-]|^[\t\r\n]/.test(s)?"'":'')+s.replaceAll('"','""')+'"';};

// The caller verifies the report hash before mounting. A private copy fixes this view
// to that observation; browsing references never requests or merges another source.
export function createAddressEvidence(report){
  check(report?.version===RESEARCH_VERSION&&/^[a-f0-9]{64}$/.test(report.report_sha256||''),'A verified address research report is required.');
  check(report.modules?.graph?.status==='available','Graph evidence is unavailable in this report.');
  const graph=validateGraph(structuredClone(report.modules.graph.data)),scope={...report.scope},reportHash=report.report_sha256;
  const rootId=nodeId(scope.network,scope.network==='bloch'?'script':'address',scope.reference),nodes=new Map(graph.nodes.map(n=>[n.id,n])),sources=new Map(graph.observations.map(o=>[o.id,o]));
  check(graph.network===scope.network&&graph.asset===scope.asset&&nodes.has(rootId),'The graph does not match the researched address and asset.');
  const kinds=supportedKinds(graph.asset);
  const resolve=value=>{
    if(value==null||value==='')return rootId;
    if(nodes.has(value))return value;
    const matches=graph.nodes.filter(n=>n.reference===value);check(matches.length===1,'Choose one exact reference from this captured graph.');return matches[0].id;
  };
  function query(input={}){
    check(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).every(k=>['focus','direction','kind','minimum','min_block','max_block','search'].includes(k)),'Unknown evidence filter.');
    const filters={focus:resolve(input.focus),direction:input.direction??'all',kind:input.kind??'all',minimum:input.minimum??'0',min_block:height(input.min_block),max_block:height(input.max_block),search:(input.search??'')};
    check(['all','incoming','outgoing','self'].includes(filters.direction),'Choose an observed event direction.');
    check(filters.kind==='all'||kinds.includes(filters.kind),'Choose an event type supported by this asset.');
    check(typeof filters.minimum==='string'&&/^(0|[1-9][0-9]{0,99})$/.test(filters.minimum),'Use a nonnegative integer amount in base units.');
    check(filters.min_block==null||filters.max_block==null||filters.min_block<=filters.max_block,'The first block must not exceed the last block.');
    check(typeof filters.search==='string'&&filters.search.length<=200,'Event search is limited to 200 characters.');filters.search=filters.search.trim().toLowerCase();
    const minimum=BigInt(filters.minimum),incident=graph.edges.filter(e=>e.from===filters.focus||e.to===filters.focus);
    const events=incident.filter(e=>(filters.direction==='all'||direction(e,filters.focus)===filters.direction)&&(filters.kind==='all'||e.kind===filters.kind)&&BigInt(e.amount)>=minimum&&
      (filters.min_block==null||e.block.height!=null&&e.block.height>=filters.min_block)&&(filters.max_block==null||e.block.height!=null&&e.block.height<=filters.max_block)&&
      (!filters.search||[e.id,e.from,e.to,e.txid,e.block.hash||''].some(v=>v.toLowerCase().includes(filters.search))))
      .sort((a,b)=>compare(a.block.height??Infinity,b.block.height??Infinity)||compare(a.block.index??Infinity,b.block.index??Infinity)||compare(a.block.log??Infinity,b.block.log??Infinity)||compare(a.id,b.id));
    const groups=new Map(),counts={incoming:0,outgoing:0,self:0},neighbors=new Set(),types=new Map();
    for(const event of events){
      const d=direction(event,filters.focus),key=evidenceConnectionKey(event),group=groups.get(key)||{key,from:event.from,to:event.to,kind:event.kind,direction:d,events:0,amount_base_units:0n,event_ids:[]};
      group.events++;group.amount_base_units+=BigInt(event.amount);group.event_ids.push(event.id);groups.set(key,group);counts[d]++;
      for(const id of [event.from,event.to])if(id!==filters.focus)neighbors.add(id);
      const typeKey=d+':'+event.kind,type=types.get(typeKey)||{direction:d,kind:event.kind,events:0,amount_base_units:0n};type.events++;type.amount_base_units+=BigInt(event.amount);types.set(typeKey,type);
    }
    return {version:ADDRESS_EVIDENCE_VERSION,report_sha256:reportHash,scope:{...scope},filters,focus:{...nodes.get(filters.focus)},
      summary:{sample_events:graph.edges.length,incident_events:incident.length,matching_events:events.length,neighbors:neighbors.size,connections:groups.size,...counts,unknown_block_events:incident.filter(e=>e.block.height==null).length},
      totals:[...types.values()].map(t=>({...t,amount_base_units:t.amount_base_units.toString()})),
      connections:[...groups.values()].map(g=>({...g,amount_base_units:g.amount_base_units.toString()})).sort((a,b)=>compare(a.key,b.key)),
      events:events.map(e=>({...e,block:{...e.block},sources:[...e.sources],direction:direction(e,filters.focus)}))};
  }
  function csv(input={},connection=null){
    const view=query(input);check(connection===null||view.connections.some(c=>c.key===connection),'The selected connection is no longer in this view.');
    const headers=['view_version','report_sha256','network','asset','searched_reference','focused_node','direction_filter','kind_filter','minimum_base_units','first_block','last_block','event_search','selected_connection','event_id','direction','from_node','from_reference','to_node','to_reference','event_kind','amount_base_units','transaction','block_height','block_hash','transaction_index','log_index','finality','source_observations'];
    const rows=[headers.map(csvCell).join(',')];let bytes=new TextEncoder().encode(rows[0]).length;
    for(const e of view.events){
      if(connection!==null&&evidenceConnectionKey(e)!==connection)continue;
      const f=view.filters,row=[ADDRESS_EVIDENCE_VERSION,reportHash,scope.network,scope.asset,scope.reference,f.focus,f.direction,f.kind,f.minimum,f.min_block,f.max_block,f.search,connection,e.id,e.direction,e.from,nodes.get(e.from).reference,e.to,nodes.get(e.to).reference,e.kind,e.amount,e.txid,e.block.height,e.block.hash,e.block.index,e.block.log,e.finality,JSON.stringify(e.sources.map(id=>sources.get(id)))].map(csvCell).join(',');
      bytes+=2+new TextEncoder().encode(row).length;check(bytes<=EVIDENCE_LIMITS.csv_bytes,'The complete CSV exceeds 16 MB. Narrow the evidence filters before exporting.');rows.push(row);
    }
    return rows.join('\r\n');
  }
  return {rootId,kinds:[...kinds],nodes:graph.nodes.map(n=>({...n})),query,csv,observation:id=>structuredClone(sources.get(id))};
}
