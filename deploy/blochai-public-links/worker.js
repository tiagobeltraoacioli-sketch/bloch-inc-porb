import {publicPortals,assistantMarkup,ASSISTANT_ASSET_VERSION} from '../blochai-public/catalog.js';
const missing=()=>new Response('Not found',{status:404,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
const marked=(response,marker)=>{const output=new Response(response.body,response);output.headers.set('x-blochai-integration',marker);return output;};

export async function handlePublicBlochAILink({request,env={},fetcher=fetch,createRewriter=()=>new HTMLRewriter()}){
  const url=new URL(request.url);if(url.protocol!=='https:'||!Object.hasOwn(publicPortals,url.hostname)||url.port)return missing();
  const response=await fetcher(request);
  const allowedPath=url.pathname==='/'||(url.hostname==='bloch.space'&&url.pathname==='/app/');
  if(env.ENABLE_PUBLIC_LINK!=='true')return marked(response,'passthrough-disabled');
  if(request.method!=='GET')return marked(response,'passthrough-method');
  if(!allowedPath)return marked(response,'passthrough-path');
  if(!response.ok)return marked(response,'passthrough-status');
  if(!response.headers.get('content-type')?.toLowerCase().includes('text/html'))return marked(response,'passthrough-content');
  const assistant=env.ENABLE_PUBLIC_ASSISTANT==='true';
  const content=assistant?assistantMarkup(url.hostname):'<aside class="blochai-public-entry" aria-label="BlochAI"><a class="blochai-public-link" href="https://blochai.xyz/" rel="noreferrer">BlochAI</a></aside>';
  const style=`<link rel="stylesheet" href="/blochai-assistant.css?v=${ASSISTANT_ASSET_VERSION}">`;
  let inserted=false,styled=false;
  const transformed=createRewriter().on('head',{element(element){element.append(style,{html:true});styled=true;}}).on('body',{element(element){element.onEndTag(end=>{if(!inserted){end.before(`${styled?'':style}${content}`,{html:true});inserted=true;}});}}).onDocument({end(end){if(!inserted){end.append(`${styled?'':style}${content}`,{html:true});inserted=true;}}}).transform(response);
  const output=marked(transformed,assistant?'scoped-assistant-v1':'rewritten-v4');output.headers.delete('content-length');output.headers.delete('etag');output.headers.delete('content-md5');return output;
}
export default {fetch(request,env){return handlePublicBlochAILink({request,env});}};
