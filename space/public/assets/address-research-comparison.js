import {researchScope,verifyResearch,researchHash} from './address-research-core.js';
import {validateGraph,nodeId} from './graph-core.js';

export const COMPARISON_VERSION='bloch-address-capture-comparison/1';
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const units=value=>typeof value==='string'&&/^(0|[1-9][0-9]{0,99})$/.test(value);
const modules=['ledger','graph','analytics','machine_learning','forecast'];
const event=edge=>({id:edge.id,from:edge.from,to:edge.to,kind:edge.kind,amount_base_units:edge.amount,transaction:edge.txid,block:edge.block,finality:edge.finality});
async function checked(raw){
  if(bytes(raw)>2800100)throw new Error('research_response_limit');
  const report=await verifyResearch(structuredClone(raw));
  const scope=researchScope(new URL('https://bloch.space/api/research?'+new URLSearchParams({network:report.scope.network,asset:report.scope.asset,query:report.scope.reference})));
  if(scope.reference!==report.scope.reference||!Number.isFinite(Date.parse(report.retrieved_at)))throw new Error('research_scope_mismatch');
  for(const key of modules)if(!['available','unavailable','unsupported'].includes(report.modules?.[key]?.status))throw new Error('research_module_invalid');
  return report;
}
function evidence(report){
  if(report.modules.graph.status!=='available')return null;
  const graph=validateGraph(report.modules.graph.data),s=report.scope;
  if(graph.network!==s.network||graph.asset!==s.asset||!graph.nodes.some(n=>n.id===nodeId(s.network,s.network==='bloch'?'script':'address',s.reference)))throw new Error('research_scope_mismatch');
  return graph;
}
function balance(report){
  if(report.modules.ledger.status!=='available')return null;
  const wallet=report.modules.ledger.data?.wallet,s=report.scope,value=wallet?.balance;
  if(wallet?.asset!==s.asset||wallet.network!==s.network+'-mainnet'||!units(value?.base_units)||typeof value.unit!=='string'||!value.unit.trim()||value.unit.length>80)return null;
  try{if(researchScope(new URL('https://bloch.space/api/research?'+new URLSearchParams({network:s.network,asset:s.asset,query:wallet.address}))).reference!==s.reference)return null;}catch{return null;}
  return {base_units:value.base_units,unit:value.unit,block:value.block??null,observation:wallet.observation??null};
}
export async function compareAddressReports(beforeRaw,afterRaw){
  const [before,after]=await Promise.all([checked(beforeRaw),checked(afterRaw)]);
  if(['network','asset','reference'].some(key=>before.scope[key]!==after.scope[key]))throw new Error('research_scope_mismatch');
  const oldGraph=evidence(before),newGraph=evidence(after),oldBalance=balance(before),newBalance=balance(after);
  const balanceResult=oldBalance&&newBalance&&oldBalance.unit===newBalance.unit
    ?{status:'available',before:oldBalance,after:newBalance,delta_base_units:(BigInt(newBalance.base_units)-BigInt(oldBalance.base_units)).toString()}
    :{status:'unavailable',reason:'Comparable exact balances with the same unit are required in both captures.'};
  let graph={status:'unavailable',reason:'Usable graph evidence is required in both captures. Missing evidence is not an empty graph.'};
  if(oldGraph&&newGraph){
    const old=new Map(oldGraph.edges.map(e=>[e.id,event(e)])),next=new Map(newGraph.edges.map(e=>[e.id,event(e)])),added=[],removed=[],changed=[];
    for(const [id,value]of next){if(!old.has(id))added.push(value);else if(JSON.stringify(old.get(id))!==JSON.stringify(value))changed.push({id,before:old.get(id),after:value});}
    for(const [id,value]of old)if(!next.has(id))removed.push(value);
    for(const rows of [added,removed,changed])rows.sort((a,b)=>a.id.localeCompare(b.id));
    graph={status:'available',before:{events:old.size,observations:oldGraph.observations},after:{events:next.size,observations:newGraph.observations},only_after:added,only_before:removed,changed,unchanged:next.size-added.length-changed.length};
  }
  const body={version:COMPARISON_VERSION,scope:before.scope,
    before:{report_sha256:before.report_sha256,retrieved_at:before.retrieved_at,coverage:before.coverage},after:{report_sha256:after.report_sha256,retrieved_at:after.retrieved_at,coverage:after.coverage},
    coverage:'Differences between two bounded source captures, not complete chain activity, traced flows, proof of a reorganization or an aligned snapshot. Records seen only before or after may reflect different source windows. A balance difference is not transferred volume. ML group numbers are not comparable across fits.',
    availability:modules.map(module=>({module,before:before.modules[module].status,after:after.modules[module].status})),balance:balanceResult,graph};
  if(bytes(body)>8500000)throw new Error('research_comparison_response_limit');
  return {...body,comparison_sha256:await researchHash(body)};
}
