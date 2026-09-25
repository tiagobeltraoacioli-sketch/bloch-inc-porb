import {principalOf} from '../../../portal/security.js';

export async function onRequest(context){
  const url=new URL(context.request.url);
  if(!url.pathname.includes('/assets/')){
    let principal=null;
    try{if(context.env.PORB_DB)principal=await principalOf(context.request,context.env);}catch{}
    if(principal?.type!=='session')return Response.redirect(new URL('/portal/?view=modules',url),302);
  }
  const response=new Response(await context.next());
  response.headers.set('cache-control','no-store, private');
  response.headers.set('x-frame-options','SAMEORIGIN');
  response.headers.set('content-security-policy',"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'self'; base-uri 'self'; form-action 'none'");
  return response;
}
