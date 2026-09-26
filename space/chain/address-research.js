import {handleExplore} from './explorer.js';
import {handleGraph} from './graph.js';
import {researchScope,analyzeAddress,researchHash,RESEARCH_VERSION} from '../public/assets/address-research-core.js';

const unavailable=reason=>({status:'unavailable',reason});
export async function handleResearch(url,{env={},fetcher=fetch,explore=handleExplore,graph=handleGraph,now=()=>new Date().toISOString()}={}){
  let scope;try{scope=researchScope(url);}catch(error){return {status:400,body:{error:error.message}};}
  const {network,asset,reference}=scope,params=new URLSearchParams({network,asset,query:reference}),deadline=AbortSignal.timeout(45000);
  const boundedFetch=(input,init={})=>fetcher(input,{...init,signal:init.signal?AbortSignal.any([deadline,init.signal]):deadline});
  const [walletResult,graphResult]=await Promise.allSettled([
    explore(new URL('https://bloch.space/api/address?'+params),{env,fetcher:boundedFetch,now}),
    asset==='ETH'?Promise.resolve(null):graph(new URL('https://bloch.space/api/graph?'+params+'&kind=address'),{env,fetcher:boundedFetch}),
  ]);
  let ledger=unavailable('The address source could not return a consistent observation.'),evidence=unavailable('The graph source could not return a consistent observation.'),analytics=unavailable('Graph evidence is unavailable.'),machine_learning=unavailable('Graph evidence is unavailable.');
  if(walletResult.status==='fulfilled'&&walletResult.value?.status===200){
    const data=walletResult.value.body,wallet=data?.wallet;
    try{const observed=researchScope(new URL('https://bloch.space/api/research?'+new URLSearchParams({network,asset:wallet.asset,query:wallet.address})));
      if(observed.reference===reference&&observed.asset===asset&&wallet.network===network+'-mainnet')ledger={status:'available',data};
    }catch{/* A mismatched record is never attributed to the searched reference. */}
  }
  if(asset==='ETH')evidence={status:'unsupported',reason:'Native ETH address history requires an index that this source does not provide. Balance and nonce remain independently usable; select USDT/USDC for bounded token logs.'};
  else if(graphResult.status==='fulfilled'&&graphResult.value?.status===200){
    try{const result=analyzeAddress(graphResult.value.body,scope);evidence={status:'available',data:result.graph};analytics={status:'available',data:result.analytics};machine_learning={status:result.ml.available?'available':'unavailable',reason:result.ml.reason||null,data:result.ml};}
    catch{/* Invalid evidence must not produce graph or model findings. */}
  }
  if(ledger.status!=='available'&&evidence.status!=='available')return {status:502,body:{error:'address_research_unavailable',modules:{ledger,evidence}}};
  const body={version:RESEARCH_VERSION,scope,retrieved_at:now(),coverage:'One bounded address observation and one bounded graph page. Sources may have different anchors and retrieval times. No complete-history or common-snapshot claim.',
    modules:{ledger,graph:evidence,analytics,machine_learning,forecast:unavailable('A sparse address event sample does not establish consecutive time coverage for forecast evaluation. Network-level forecasts are available separately in the research workspace.')}};
  // The shared gateway has a 3 MiB response limit. Refuse oversized reports, never silently drop evidence.
  if(new TextEncoder().encode(JSON.stringify(body)).length>2800000)return {status:422,body:{error:'address_research_response_limit'}};
  return {status:200,body:{...body,report_sha256:await researchHash(body)}};
}
