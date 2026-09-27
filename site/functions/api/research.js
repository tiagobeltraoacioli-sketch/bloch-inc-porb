import {researchScope,verifyResearch} from '../../../space/public/assets/address-research-core.js';
import {readPublicJson} from '../../../graphus/chain/network-graph.js';
import {researchRetrySeconds} from '../../../space/public/assets/address-research-request.js';

let started=0,total=0;const visitors=new Map();
export async function onRequest({request,fetcher=fetch}){
  const reply=(body,status=200,extra={})=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...extra}});
  if(request.method!=='GET')return reply({error:'read_only'},405,{allow:'GET'});
  let scope;try{scope=researchScope(new URL(request.url));}catch(error){return reply({error:error.message},400);}
  const now=Date.now();if(now-started>=60000){started=now;total=0;visitors.clear();}
  const visitor=request.headers.get('CF-Connecting-IP')||'unknown',count=visitors.get(visitor)||0;
  if(total>=300||count>=30)return reply({error:'read_budget_exceeded'},429,{'retry-after':'60'});
  total++;visitors.set(visitor,count+1);
  const url=new URL('https://bloch.space/api/research');url.search=new URLSearchParams({network:scope.network,asset:scope.asset,query:scope.reference}).toString();
  let status=200,retry=0;
  try{
    const data=await readPublicJson(async(input,init)=>{
      const response=await fetcher(input,{...init,redirect:'manual',signal:AbortSignal.timeout(55000),headers:{accept:'application/json'}});status=response.status;
      if(![200,400,422,429,502,503,504].includes(status))throw new Error('source_unavailable');
      retry=researchRetrySeconds(response.headers,status);
      if(!response.ok){response.body?.cancel().catch(()=>{});return Response.json({error:'address_research_unavailable'});}
      return response;
    },url.href);
    if(status!==200)return reply({error:'address_research_unavailable'},status,retry||status===429?{'retry-after':String(retry)}:{});
    await verifyResearch(data);
    if(data.scope.network!==scope.network||data.scope.asset!==scope.asset||data.scope.reference!==scope.reference)throw new Error('scope_mismatch');
    return reply(data);
  }catch{return reply({error:'address_research_unavailable'},502);}
}
