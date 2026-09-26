import {principalOf,authorize} from './security.js';

// Public code assets contain no tenant content. Score fixtures require a session too.
export async function modulePage(context,{scores=false}={}){
  const url=new URL(context.request.url),asset=url.pathname.includes('/assets/');
  if(scores||!asset){
    let principal=null;
    try{if(context.env.PORB_DB)principal=await principalOf(context.request,context.env);if(principal)authorize(principal,scores?'scores:read':'data:read');}catch{principal=null;}
    if(principal?.type!=='session')return new Response(null,{status:302,headers:{location:new URL('/portal/?view=modules'+(scores?'&module=aml':''),url).href,'cache-control':'no-store, private','x-robots-tag':'noindex, nofollow'}});
  }
  const upstream=await context.next(),response=new Response(upstream.body,upstream);
  response.headers.set('cache-control','no-store, private');
  response.headers.set('x-frame-options','SAMEORIGIN');
  response.headers.set('x-robots-tag','noindex, nofollow');
  response.headers.set('content-security-policy',"default-src 'self'; img-src 'self' data: blob:; script-src 'self'; worker-src 'self'; style-src 'self'; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; frame-ancestors 'self'; base-uri 'self'; form-action 'none'");
  return response;
}
