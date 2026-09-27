import {researchScope,verifyResearch,researchHash} from './address-research-core.js';

export const BUNDLE_VERSION='bloch-address-research-bundle/1';
export const ETHEREUM_SELECTION='ETH_ALL';
export const ETHEREUM_ASSETS=Object.freeze(['ETH','USDT','USDC']);
export const BUNDLE_LIMITS=Object.freeze({report_bytes:2800100,bundle_bytes:8500000});
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&JSON.stringify(Object.keys(value).sort())===JSON.stringify(keys.slice().sort());

export function researchSelection(selection,reference,network){
  const assets=selection===ETHEREUM_SELECTION?[...ETHEREUM_ASSETS]:[selection];
  const expected={BTC:'bitcoin',ETH:'ethereum',USDT:'ethereum',USDC:'ethereum',BLCH:'bloch'}[assets[0]];
  const scope=researchScope(new URL('https://bloch.space/api/research?'+new URLSearchParams({network:network??expected,asset:assets[0],query:reference})));
  return {network:scope.network,reference:scope.reference,selection,assets};
}

async function checkedReport(raw,scope,asset){
  check(bytes(raw)<=BUNDLE_LIMITS.report_bytes,'research_response_limit');
  const report=await verifyResearch(structuredClone(raw));
  check(report.scope?.network===scope.network&&report.scope?.reference===scope.reference&&report.scope?.asset===asset,'research_scope_mismatch');
  return report;
}
function failure(error){
  if(error?.status===401||error?.status===403)return 'access_unavailable';
  if(error?.status===429||/rate_limit/i.test(error?.message||''))return 'rate_limited';
  if(['AbortError','TimeoutError'].includes(error?.name))return 'source_timeout';
  if(['research_scope_mismatch','research_integrity_mismatch','unsupported_research_report','research_response_limit'].includes(error?.message))return error.message;
  return 'source_unavailable';
}

// One existing bounded request per asset. This never joins chain histories or
// organization records; each child keeps its own capture, model and checksum.
export async function collectResearch(selection,request,{signal,now=()=>new Date().toISOString()}={}){
  const scope=researchSelection(selection.selection,selection.reference,selection.network);
  signal?.throwIfAborted();
  if(scope.assets.length===1){
    const report=await checkedReport(await request(scope.assets[0],scope),scope,scope.assets[0]);signal?.throwIfAborted();return report;
  }
  const results=await Promise.all(scope.assets.map(async asset=>{
    try{return {asset,status:'available',report:await checkedReport(await request(asset,scope),scope,asset)};}
    catch(error){return {asset,status:'unavailable',error:failure(error)};}
  }));
  signal?.throwIfAborted();
  const body={version:BUNDLE_VERSION,scope:{network:scope.network,reference:scope.reference,assets:scope.assets},assembled_at:now(),
    coverage:'Three independent bounded asset queries for one Ethereum reference. Retrieval times and block anchors may differ. No synchronized snapshot, combined balance, ownership or complete-history claim.',results};
  check(bytes(body)<=BUNDLE_LIMITS.bundle_bytes,'research_bundle_response_limit');
  const bundle={...body,bundle_sha256:await researchHash(body)};signal?.throwIfAborted();return bundle;
}

export async function verifyResearchBundle(raw){
  check(raw?.version===BUNDLE_VERSION,'unsupported_research_bundle');
  check(bytes(raw)<=BUNDLE_LIMITS.bundle_bytes,'research_bundle_response_limit');
  const bundle=structuredClone(raw),{bundle_sha256,...body}=bundle;
  check(/^[a-f0-9]{64}$/.test(bundle_sha256||'')&&await researchHash(body)===bundle_sha256,'research_bundle_integrity_mismatch');
  check(exactKeys(bundle,['version','scope','assembled_at','coverage','results','bundle_sha256'])&&exactKeys(bundle.scope,['network','reference','assets']),'research_bundle_schema_mismatch');
  check(typeof bundle.assembled_at==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(bundle.assembled_at)&&Number.isFinite(Date.parse(bundle.assembled_at))&&typeof bundle.coverage==='string'&&bundle.coverage.length<=2000,'research_bundle_schema_mismatch');
  const scope=researchSelection(ETHEREUM_SELECTION,bundle.scope?.reference,bundle.scope?.network);
  check(bundle.scope?.network==='ethereum'&&JSON.stringify(bundle.scope.assets)===JSON.stringify(ETHEREUM_ASSETS),'research_bundle_scope_mismatch');
  check(Array.isArray(bundle.results)&&bundle.results.length===3,'research_bundle_results_mismatch');
  for(const [i,result]of bundle.results.entries()){
    check(result.asset===ETHEREUM_ASSETS[i],'research_bundle_results_mismatch');
    if(result.status==='available'){check(exactKeys(result,['asset','status','report']),'research_bundle_result_mismatch');await checkedReport(result.report,scope,result.asset);}
    else check(result.status==='unavailable'&&exactKeys(result,['asset','status','error'])&&['access_unavailable','rate_limited','source_timeout','source_unavailable','research_scope_mismatch','research_integrity_mismatch','unsupported_research_report','research_response_limit'].includes(result.error),'research_bundle_result_mismatch');
  }
  return bundle;
}
