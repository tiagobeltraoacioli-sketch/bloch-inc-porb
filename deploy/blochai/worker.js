import {PortalError,requireValue,principalOf,budget,json} from '../../portal/security.js';
import {blochaiRoute} from '../../portal/blochai.js';

const assetHeaders={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY','permissions-policy':'camera=(), microphone=(), geolocation=()','content-security-policy':"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'"};

export async function handleBlochAI({request,env={},fetcher=fetch}){
  const url=new URL(request.url),requestId=crypto.randomUUID();let response;
  try{
    requireValue(url.protocol==='https:'&&url.hostname==='rednblue.space'&&!url.port,'not_found',404);
    if(url.pathname==='/blochai')return new Response(null,{status:308,headers:{location:'/blochai/',...assetHeaders}});
    if(url.pathname.startsWith('/blochai/')){
      requireValue(['GET','HEAD'].includes(request.method),'method_not_allowed',405);
      requireValue(env.ASSETS,'blochai_assets_unavailable',503);const asset=await env.ASSETS.fetch(request);response=new Response(asset.body,asset);for(const [key,value]of Object.entries(assetHeaders))response.headers.set(key,value);
    }else{
      requireValue(['/api/porb/v1/blochai/status','/api/porb/v1/blochai/tasks','/api/porb/v1/blochai/research'].includes(url.pathname)||['/api/porb/v1/blochai/tasks/','/api/porb/v1/blochai/research/'].some(prefix=>url.pathname.startsWith(prefix)),'not_found',404);
      requireValue(['GET','POST','DELETE'].includes(request.method),'method_not_allowed',405);requireValue(!url.search,'unexpected_parameters');
      const origin=request.headers.get('origin');requireValue(!origin||origin===url.origin,'cross_origin_request_denied',403);
      requireValue(!request.headers.has('authorization'),'browser_session_required',403);
      if(request.method!=='GET')requireValue(request.headers.get('origin')===url.origin&&request.headers.get('x-porb-action')==='1','same_origin_action_required',403);
      requireValue(env.PORB_DB&&typeof env.PORB_AUTH_PEPPER==='string'&&env.PORB_AUTH_PEPPER.length>=32,'portal_unavailable',503);
      const principal=await principalOf(request,env);requireValue(principal,'authentication_required',401);requireValue(principal.type==='session','browser_session_required',403);
      await budget(env,`blochai-requests:${principal.id}`,120,60);
      response=await blochaiRoute(url.pathname.replace(/^\/api\/porb/,''),request,env,principal,fetcher);
    }
  }catch(error){const status=error instanceof PortalError?error.status:503;response=json({error:error instanceof PortalError?error.message:'blochai_request_failed'},status,status===429?{'retry-after':String(error.retryAfter||60)}:{});}
  response.headers.set('x-request-id',requestId);return response;
}
export default {fetch(request,env){return handleBlochAI({request,env});}};
