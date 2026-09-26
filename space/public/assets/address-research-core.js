import {ASSETS,validReference,nodeId,validateGraph,analyzeGraph} from './graph-core.js';
import {cluster,MODEL_VERSION} from './science.js';

export const RESEARCH_VERSION='bloch-address-research/1';
export function researchScope(url){
  const p=url.searchParams,network=p.get('network'),asset=p.get('asset')||{bitcoin:'BTC',ethereum:'ETH',bloch:'BLCH'}[network];
  if(url.search.length>512||[...p.keys()].some(k=>!['network','asset','query'].includes(k)||p.getAll(k).length!==1))throw new Error('invalid_parameters');
  let reference=(p.get('query')||'').trim();
  if(network!=='bitcoin'||reference.toLowerCase().startsWith('bc1'))reference=reference.toLowerCase();
  if(!Object.hasOwn(ASSETS,asset)||ASSETS[asset].network!==network||!validReference(network,'address',reference))throw new Error('invalid_address_or_asset');
  return {network,asset,reference};
}
export async function researchHash(value){
  const bytes=new TextEncoder().encode(JSON.stringify(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function verifyResearch(report){
  if(report?.version!==RESEARCH_VERSION)throw new Error('unsupported_research_report');
  const {report_sha256,...body}=report;
  if(!/^[0-9a-f]{64}$/.test(report_sha256)||await researchHash(body)!==report_sha256)throw new Error('research_integrity_mismatch');
  return report;
}
export function analyzeAddress(raw,scope){
  const graph=validateGraph(raw),kind=scope.network==='bloch'?'script':'address',id=nodeId(scope.network,kind,scope.reference);
  if(graph.network!==scope.network||graph.asset!==scope.asset||!graph.nodes.some(n=>n.id===id))throw new Error('research_scope_mismatch');
  const stats=analyzeGraph(graph);
  // Public results include counts and topology, never a per-reference risk or deviation score.
  const rows=stats.ranking.filter(n=>n.kind===kind).map(({id,reference,degree,incoming,outgoing,core,component,cycleGroup})=>({id,reference,degree,incoming,outgoing,core,component,cyclic:!!cycleGroup})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const root=rows.find(n=>n.id===id),flows=new Map(),transactions=new Set(),blocks=new Map();
  for(const e of graph.edges){
    if(e.from!==id&&e.to!==id)continue;
    transactions.add(e.txid);if(e.block.height!=null)blocks.set(e.block.height,(blocks.get(e.block.height)||0)+1);
    for(const direction of ['incoming','outgoing']){
      if((direction==='incoming'?e.to:e.from)!==id)continue;
      const key=direction+':'+e.kind,flow=flows.get(key)||{direction,kind:e.kind,events:0,amount_base_units:0n};
      flow.events++;flow.amount_base_units+=BigInt(e.amount);flows.set(key,flow);
    }
  }
  const features=['degree','incoming','outgoing','core'],fit=cluster(rows,features,3);
  const ml={...fit,model_version:MODEL_VERSION,method:'descriptive-k-means',features,cohort_kind:kind,cohort_size:rows.length,minimum_rows:9,
    note:'Standardized features and deterministic farthest-point initialization. Fitted only to comparable references in this bounded neighborhood. Transaction nodes are excluded. Group numbers have no order, identity, ownership or risk meaning. Amounts are not model inputs.'};
  if(fit.available){ml.members=fit.labels.map(({index,cluster})=>({id:rows[index].id,reference:rows[index].reference,cluster}));delete ml.labels;ml.reference_cluster=ml.members.find(n=>n.id===id)?.cluster??null;}
  return {graph,analytics:{root,reference_transactions:transactions.size,flows:[...flows.values()].map(f=>({...f,amount_base_units:f.amount_base_units.toString()})),
    neighborhood:{nodes:stats.nodes,references:rows.length,edges:stats.edges,components:stats.components,cyclic_components:stats.cycleGroups,max_core:stats.maxCore},
    event_types:stats.types.map(({kind,count,amount})=>({kind,events:count,amount_base_units:amount})),reference_block_activity:[...blocks].sort((a,b)=>a[0]-b[0]),degree_histogram:stats.histogram,rows,
    note:'Counts describe this source sample. Degree counts distinct neighboring graph nodes; UTXO neighbors are transactions. Input and output amounts are separate evidence types and must not be added as transferred volume. Missing blocks are unknown, not zero activity.'},ml};
}
