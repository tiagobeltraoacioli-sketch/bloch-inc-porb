import {handlePublicBlochAILink} from '../blochai-public-links/worker.js';
import {handlePublicAssistant} from './assistant.js';
import {ASSISTANT_ASSET_VERSION} from './catalog.js';
import {handleWorkspaceProxy} from './workspace-proxy.js';

const pdfAssets=new Set(['blochai-pdf.js','blochai-pdf-lib.js','blochai-fontkit.js','BlochAI-DejaVuSans.ttf','pdf-lib-LICENSE.txt','fontkit-LICENSE.txt','DejaVu-LICENSE.txt'].map(name=>'/blochai-pdf/'+name));
// Published CLI releases keep their address; a new release only adds a file.
const cliFile=/^\/cli\/(?:qentl-\d+\.\d+\.\d+(?:\.post\d+)?-py3-none-any\.whl|SHA256SUMS\.txt|install\.sh)$/;
const pages=new Set(['/','/index.html','/blochai-public.css','/favicon.svg','/bloch-symbol.svg','/bloch-inc-logo-dark.png']);
const paths={has:path=>pages.has(path)||cliFile.test(path)};
// qentl.ai shows the same landing page; every other path belongs to the workspace.
const workspaceEntry='/workspace',inviteScript='/qentl-invite.js',inviteTag='<script src="/qentl-invite.js"></script>';
const productHosts=new Set(['blochai.xyz','qentl.com','qentl.ai']);
const ecosystemHosts=new Set(['bloch-graphus.xyz','bloch.space','blochl1.com']);
const securityHeaders={'x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY','permissions-policy':'camera=(), microphone=(), geolocation=()','content-security-policy':"default-src 'none'; img-src 'self'; style-src 'self'; script-src 'none'; connect-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
const plain=(message,status)=>new Response(message,{status,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store',...securityHeaders}});

export async function handlePublicBlochAI({request,env={},fetcher=fetch,createRewriter}){
  const url=new URL(request.url);
  const workspaceHost=url.origin==='https://qentl.ai'&&env.ENABLE_QENTL_WORKSPACE==='true';
  if(workspaceHost&&!(paths.has(url.pathname)||url.pathname===inviteScript))return handleWorkspaceProxy({request,env,fetcher,entry:workspaceEntry});
  if(url.protocol==='https:'&&!url.port&&ecosystemHosts.has(url.hostname)){
    if(url.pathname.startsWith('/api/blochai/'))return handlePublicAssistant({request,env,fetcher});
    if(['/blochai-assistant.js','/blochai-assistant.css'].includes(url.pathname)||pdfAssets.has(url.pathname)){
      if(!['GET','HEAD'].includes(request.method))return plain('Method not allowed',405);
      if(url.search&&(pdfAssets.has(url.pathname)||url.search!==`?v=${ASSISTANT_ASSET_VERSION}`))return plain('Not found',404);
      if(!env.ASSETS)return plain('Site unavailable',503);
      const asset=await env.ASSETS.fetch(new Request(`https://blochai.xyz${url.pathname}`,{method:request.method})),response=new Response(asset.body,asset);
      for(const [key,value]of Object.entries(securityHeaders))response.headers.set(key,value);
      response.headers.delete('set-cookie');response.headers.delete('access-control-allow-origin');response.headers.delete('access-control-allow-credentials');response.headers.set('cache-control',pdfAssets.has(url.pathname)?'public, max-age=300':'public, no-cache, max-age=0, must-revalidate');return response;
    }
    if(url.pathname.startsWith('/blochai-assistant.js')||url.pathname.startsWith('/blochai-assistant.css'))return plain('Not found',404);
    return handlePublicBlochAILink({request,env,fetcher,createRewriter});
  }
  if(url.protocol!=='https:'||!productHosts.has(url.hostname)||url.port)return plain('Not found',404);
  if(!['GET','HEAD'].includes(request.method))return plain('Method not allowed',405);
  if(!paths.has(url.pathname)&&!(workspaceHost&&url.pathname===inviteScript))return plain('Not found',404);
  if(!env.ASSETS)return plain('Site unavailable',503);
  const assetRequest=new Request(request);assetRequest.headers.delete('cookie');assetRequest.headers.delete('authorization');
  const asset=await env.ASSETS.fetch(assetRequest),landing=workspaceHost&&['/','/index.html'].includes(url.pathname);
  // Earlier invitations point at https://qentl.ai/#invite=…; one same-origin script forwards them to the workspace.
  const response=landing&&asset.ok&&request.method==='GET'?new Response((await asset.text()).replace('</head>',inviteTag+'</head>'),asset):new Response(asset.body,asset);
  for(const [key,value]of Object.entries(securityHeaders))response.headers.set(key,value);
  if(landing){response.headers.set('content-security-policy',securityHeaders['content-security-policy'].replace("script-src 'none'","script-src 'self'"));response.headers.delete('content-length');response.headers.delete('etag');}
  response.headers.delete('set-cookie');response.headers.delete('access-control-allow-origin');response.headers.delete('access-control-allow-credentials');
  response.headers.set('cache-control','public, max-age=300');return response;
}
export default {fetch(request,env){return handlePublicBlochAI({request,env});}};
