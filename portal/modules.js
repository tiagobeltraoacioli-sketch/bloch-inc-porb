import {authorize,budget,json,requireValue,PortalError} from './security.js';
import {readPublicJson} from '../graphus/chain/network-graph.js';

// Fixed public, read-only adapters. Never forward a session, key or tenant data upstream.
export const MODULE_ROUTES={
  'system/map':[],
  'daas/manifest':[],
  'chain/network':['asset','cursor'],
  'chain/wallet':['asset','network','address'],
  'chain/activity':['asset','address','to_block','expected_hash'],
  'chain/transaction-receipt':['hash','expected_block','expected_hash','expected_index'],
  'chain/bloch-history':['address','cursor'],
  'chain/holders':['asset'],
  'chain/balances':['asset','addresses'],
};
export function moduleQuery(path){const route=path.replace('/v1/graphus/','');return Object.hasOwn(MODULE_ROUTES,route)?MODULE_ROUTES[route]:undefined;}
export async function moduleRoute(path,request,env,principal,fetcher){
  if(!path.startsWith('/v1/graphus/'))return null;
  authorize(principal,'data:read');requireValue(request.method==='GET','read_only',405);
  const route=path.slice('/v1/graphus/'.length);requireValue(Object.hasOwn(MODULE_ROUTES,route),'module_unavailable',404);
  const url=new URL(request.url);requireValue(url.search.length<=2200&&[...url.searchParams].every(([k,v])=>MODULE_ROUTES[route].includes(k)&&v.length<=1700&&url.searchParams.getAll(k).length===1),'invalid_module_query');
  await budget(env,`modules:${principal.tenant_id}`,60,60);
  const upstream=new URL(`/api/${route}`,'https://bloch-graphus.xyz');upstream.search=url.search;
  let status=200,retryAfter='60';
  try{
    const content=await readPublicJson(async(u,options)=>{
      const response=await fetcher(u,{...options,signal:AbortSignal.timeout(55000),redirect:'manual',headers:{accept:'application/json','user-agent':'BI-PoRB/1.1 public-module-connector'}});
      status=response.status;requireValue(status>=200&&status<300||[400,404,422,429,502,503,504].includes(status),'module_source_unavailable',502);
      const retry=response.headers.get('retry-after');if(retry&&/^[0-9]{1,5}$/.test(retry))retryAfter=retry;
      return response.ok?response:new Response(response.body,{headers:response.headers,status:200});
    },upstream.href);
    return json(content,status,status===429?{'retry-after':retryAfter}:{});
  }catch(error){if(error instanceof PortalError)throw error;throw new PortalError('module_source_unavailable',502);}
}
