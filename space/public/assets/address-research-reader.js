import {RESEARCH_VERSION,verifyResearch} from './address-research-core.js';
import {BUNDLE_VERSION,BUNDLE_LIMITS,researchSelection,verifyResearchBundle} from './address-research-bundle.js';
import {SAVED_CAPTURE_FILE_BYTES} from './address-research-import.js';
import {validateGraph,nodeId,LIMITS} from './graph-core.js';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,names)=>object(value)&&JSON.stringify(Object.keys(value).sort())===JSON.stringify(names.slice().sort());
const text=(value,max=2000)=>typeof value==='string'&&value.length<=max;
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const units=value=>typeof value==='string'&&/^(0|[1-9][0-9]{0,99})$/.test(value);
const list=(value,max,check)=>Array.isArray(value)&&value.length<=max&&value.every(check);
const check=(ok,error='saved_research_schema_mismatch')=>{if(!ok)throw new Error(error);};
const utc=value=>text(value,24)&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===(value.includes('.')?value:value.replace('Z','.000Z'));
const names=['ledger','graph','analytics','machine_learning','forecast'];
const features=['degree','incoming','outgoing','core'];

// Validate the stored contract without recomputing analytics or fitting a model.
// A checksum is only internal consistency; a local file has no source attestation.
async function checkedReport(report){
  check(new TextEncoder().encode(JSON.stringify(report)).length<=BUNDLE_LIMITS.report_bytes,'research_response_limit');
  await verifyResearch(report);
  check(keys(report,['version','scope','retrieved_at','coverage','modules','report_sha256'])&&keys(report.scope,['network','asset','reference']));
  check(utc(report.retrieved_at),'saved_capture_invalid_time');check(text(report.coverage));
  const s=report.scope,selection=researchSelection(s.asset,s.reference,s.network);
  check(selection.assets.length===1&&selection.assets[0]===s.asset&&selection.reference===s.reference,'research_scope_mismatch');check(keys(report.modules,names));
  const m=report.modules;
  for(const name of names){
    const module=m[name];check(object(module)&&Object.keys(module).every(key=>['status','reason','data'].includes(key))&&['available','unavailable','unsupported'].includes(module.status));
    check(module.reason==null||text(module.reason));
    if(module.status==='available')check(object(module.data));else check(text(module.reason));
  }
  check(m.forecast.status==='unavailable'&&m.forecast.data===undefined);
  check(['available','unavailable'].includes(m.ledger.status)&&['available','unavailable'].includes(m.analytics.status)&&['available','unavailable'].includes(m.machine_learning.status));
  check(m.graph.status!=='unsupported'||s.asset==='ETH');
  check(m.ledger.status==='available'||m.graph.status==='available');
  if(m.ledger.status==='available'){
    const d=m.ledger.data,w=d.wallet;
    check(object(w)&&w.asset===s.asset&&w.network===s.network+'-mainnet','research_scope_mismatch');
    check(researchSelection(s.asset,w.address,s.network).reference===s.reference,'research_scope_mismatch');
    check(object(w.balance)&&units(w.balance.base_units)&&text(w.balance.unit,80)&&w.balance.unit.length>0);
    check(w.balance.scope==null||text(w.balance.scope));check(w.activity==null||object(w.activity));check(w.observation==null||object(w.observation));
  }
  let graph,refs,root;
  if(m.graph.status==='available'){
    graph=validateGraph(m.graph.data);root=nodeId(s.network,s.network==='bloch'?'script':'address',s.reference);
    check(graph.network===s.network&&graph.asset===s.asset&&graph.nodes.some(n=>n.id===root),'research_scope_mismatch');
    check(list(m.graph.data.warnings,100,v=>text(v,1000)));
    refs=new Map(graph.nodes.filter(n=>n.kind!=='transaction').map(n=>[n.id,n]));
  }
  if(m.analytics.status==='available'){
    check(!!graph);const a=m.analytics.data;
    const row=r=>object(r)&&refs.has(r.id)&&refs.get(r.id).reference===r.reference&&features.every(key=>integer(r[key]))&&integer(r.component)&&typeof r.cyclic==='boolean';
    check(list(a.rows,LIMITS.nodes,row)&&a.rows.length===refs.size&&new Set(a.rows.map(r=>r.id)).size===refs.size);
    check(row(a.root)&&a.root.id===root&&JSON.stringify(a.root)===JSON.stringify(a.rows.find(r=>r.id===root)));
    check(object(a.neighborhood)&&['nodes','references','edges','components','cyclic_components','max_core'].every(key=>integer(a.neighborhood[key]))&&integer(a.reference_transactions)&&text(a.note));
    const kind=s.network==='ethereum'?['erc20_transfer','native_value','executed_transaction']:['input','output'];
    const flow=f=>object(f)&&kind.includes(f.kind)&&integer(f.events)&&units(f.amount_base_units);
    check(list(a.flows,6,f=>flow(f)&&['incoming','outgoing'].includes(f.direction))&&list(a.event_types,3,flow));
    const pair=p=>Array.isArray(p)&&p.length===2&&p.every(integer);
    check(list(a.reference_block_activity,LIMITS.edges,pair)&&list(a.degree_histogram,LIMITS.nodes,pair));
  }
  const model=m.machine_learning.data;
  if(model!==undefined){
    check(!!graph&&object(model)&&typeof model.available==='boolean'&&model.available===(m.machine_learning.status==='available'));
    check(model.method==='descriptive-k-means'&&text(model.model_version,100)&&text(model.note)&&JSON.stringify(model.features)===JSON.stringify(features));
    check(model.cohort_kind===(s.network==='bloch'?'script':'address')&&model.cohort_size===refs.size&&model.minimum_rows===9);
    if(model.available){
      check(m.analytics.status==='available'&&integer(model.k)&&model.k>=2&&model.k<=3&&model.cohort_size>=9);
      check(list(model.centers,3,c=>Array.isArray(c)&&c.length===features.length&&c.every(Number.isFinite))&&model.centers.length===model.k);
      check(list(model.members,LIMITS.nodes,r=>object(r)&&refs.has(r.id)&&refs.get(r.id).reference===r.reference&&integer(r.cluster)&&r.cluster<model.k)&&model.members.length===refs.size&&new Set(model.members.map(r=>r.id)).size===refs.size);
      check(model.reference_cluster===model.members.find(r=>r.id===root)?.cluster);
    }else check(model.members===undefined&&model.centers===undefined&&text(model.reason));
  }else check(m.machine_learning.status==='unavailable');
  return report;
}

export async function openSavedResearch(contents){
  check(typeof contents==='string'&&new TextEncoder().encode(contents).length<=SAVED_CAPTURE_FILE_BYTES,'saved_capture_file_limit');
  let raw;try{raw=JSON.parse(contents);}catch{throw new Error('saved_capture_invalid_json');}
  if(raw?.version===RESEARCH_VERSION)return checkedReport(raw);
  check(raw?.version===BUNDLE_VERSION,'unsupported_saved_capture');
  const bundle=await verifyResearchBundle(raw);check(utc(bundle.assembled_at),'saved_capture_invalid_time');
  // Validate every available child before exposing even the first asset tab.
  for(const item of bundle.results)if(item.status==='available')await checkedReport(item.report);
  return bundle;
}
