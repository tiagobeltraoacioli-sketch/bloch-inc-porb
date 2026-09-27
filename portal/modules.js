import {authorize,budget,json,requireValue,PortalError} from './security.js';
import {readPublicJson} from '../graphus/chain/network-graph.js';
import {researchRetrySeconds} from '../space/public/assets/address-research-request.js';

// Fixed public, read-only adapters. Never forward a session, key or tenant data upstream.
export const MODULE_ROUTES={
  'system/map':[],
  'daas/manifest':[],
  'atlas/schema':[],
  'atlas/analyze':['asset','cursor','reference','start','end','max_hops','kind','minimum'],
  'chain/network':['asset','cursor'],
  'chain/wallet':['asset','network','address'],
  'chain/activity':['asset','address','to_block','expected_hash'],
  'chain/transaction-receipt':['hash','expected_block','expected_hash','expected_index'],
  'chain/bloch-history':['address','cursor'],
  'chain/holders':['asset'],
  'chain/balances':['asset','addresses'],
};
export const SPACE_ROUTES={
  overview:['network'],series:['network','range'],intelligence:['network'],validators:['network','offset'],
  graphus:['network'],graph:['network','asset','kind','query','cursor'],
  research:['network','query','asset'],address:['network','query','asset'],block:['network','query','offset'],tx:['network','query'],history:['network','query','cursor'],
};
function target(path){
  for(const [prefix,origin,routes] of [['/v1/graphus/','https://bloch-graphus.xyz',MODULE_ROUTES],['/v1/space/','https://bloch.space',SPACE_ROUTES]])if(path.startsWith(prefix))return {route:path.slice(prefix.length),origin,routes};
  return null;
}
export function moduleQuery(path){const value=target(path);return value&&Object.hasOwn(value.routes,value.route)?value.routes[value.route]:undefined;}
export async function moduleRoute(path,request,env,principal,fetcher){
  const value=target(path);if(!value)return null;
  authorize(principal,'data:read');requireValue(request.method==='GET','read_only',405);
  const {route,origin,routes}=value;requireValue(Object.hasOwn(routes,route),'module_unavailable',404);
  const url=new URL(request.url);requireValue(url.search.length<=2200&&[...url.searchParams].every(([k,v])=>routes[route].includes(k)&&v.length<=1700&&url.searchParams.getAll(k).length===1),'invalid_module_query');
  await budget(env,`modules:${principal.tenant_id}`,60,60);
  const upstream=new URL(`/api/${route}`,origin);upstream.search=url.search;
  let status=200,retryAfter='60';const research=origin==='https://bloch.space'&&route==='research';
  try{
    const content=await readPublicJson(async(u,options)=>{
      const response=await fetcher(u,{...options,signal:AbortSignal.timeout(55000),redirect:'manual',headers:{accept:'application/json','user-agent':'BI-PoRB/1.1 public-module-connector'}});
      status=response.status;requireValue(status>=200&&status<300||[400,404,422,429,502,503,504].includes(status),'module_source_unavailable',502);
      if(research){retryAfter=String(researchRetrySeconds(response.headers,status));if(!response.ok){response.body?.cancel().catch(()=>{});return Response.json({error:'address_research_unavailable'});}}
      const retry=response.headers.get('retry-after');if(!research&&retry&&/^[0-9]{1,5}$/.test(retry))retryAfter=retry;
      return response.ok?response:new Response(response.body,{headers:response.headers,status:200});
    },upstream.href);
    return json(content,status,status===429||research&&Number(retryAfter)>0?{'retry-after':retryAfter}:{});
  }catch(error){if(error instanceof PortalError)throw error;throw new PortalError('module_source_unavailable',502);}
}
