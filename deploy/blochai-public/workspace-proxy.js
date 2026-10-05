// Private workspace transport. Configuration and origin credentials are never
// taken from a request URL, forwarded header, or response redirect.
const ORIGIN='https://qentl-workspace.posternlabs.com';
const PUBLIC_ORIGIN='https://qentl.ai';
const MAX_REQUEST_BYTES=30*1024*1024;
const METHODS=new Set(['GET','HEAD','POST']);
const HOP_HEADERS=new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
const ERROR_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store, max-age=0',
  'cdn-cache-control':'no-store','cloudflare-cdn-cache-control':'no-store','x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; frame-ancestors 'none'"};
const failure=(status=503,message='Qentl workspace is temporarily unavailable.')=>
  new Response(JSON.stringify({error:message}),{status,headers:ERROR_HEADERS});

function stripTransportHeaders(headers){
  const nominated=(headers.get('connection')||'').split(',').map(value=>value.trim().toLowerCase());
  for(const name of [...HOP_HEADERS,...nominated])if(name)headers.delete(name);
  for(const name of [...headers.keys()]){
    if(name==='forwarded'||name.startsWith('x-forwarded-')||['x-real-ip','x-original-url','x-rewrite-url','x-original-host','x-qentl-origin'].includes(name))headers.delete(name);
  }
}

function safeLocation(value,requestUrl,secret){
  if(value.includes(secret))return null;
  let redirect;
  try{redirect=new URL(value,requestUrl);}catch{return null;}
  if(redirect.username||redirect.password||redirect.protocol!=='https:')return null;
  if(redirect.origin!==PUBLIC_ORIGIN&&redirect.origin!==ORIGIN)return null;
  return PUBLIC_ORIGIN+redirect.pathname+redirect.search+redirect.hash;
}

function discard(response){
  // No response body or error message is logged, buffered, or reflected.
  response?.body?.cancel().catch(()=>{});
}

export async function handleWorkspaceProxy({request,env={},fetcher=fetch,entry=null}){
  const incoming=new URL(request.url);
  if(incoming.origin!==PUBLIC_ORIGIN||incoming.username||incoming.password)return failure(404,'Not found.');
  if(env.ENABLE_QENTL_WORKSPACE!=='true')return failure(503);
  if(!METHODS.has(request.method)){
    const response=failure(405,'Method not allowed.');response.headers.set('allow','GET, HEAD, POST');return response;
  }
  if(request.headers.has('upgrade')||request.headers.has('sec-websocket-key'))return failure(400,'Connection upgrades are not supported.');
  const secret=env.QENTL_ORIGIN_SECRET;
  if(typeof secret!=='string'||!/^[a-f0-9]{64}$/i.test(secret))return failure();
  const length=request.headers.get('content-length');
  if(length!==null&&(!/^\d{1,10}$/.test(length)||Number(length)>MAX_REQUEST_BYTES))return failure(413,'Request exceeds the 30 MiB limit.');
  if(request.method!=='POST'&&(request.body||Number(length)>0))return failure(400,'A body is not supported for this method.');

  // Assign path and query separately so even //host/path cannot change origin.
  // The public entry path is the workspace application's own root document.
  const target=new URL(ORIGIN);target.pathname=entry!==null&&incoming.pathname===entry?'/':incoming.pathname;target.search=incoming.search;
  const headers=new Headers(request.headers);stripTransportHeaders(headers);headers.delete('host');
  headers.set('x-qentl-origin',secret);headers.set('x-forwarded-proto','https');
  headers.set('cache-control','no-store');
  const controller=new AbortController();let tooLarge=false;
  const cancelled=()=>controller.abort();
  if(request.signal?.aborted)controller.abort();
  else request.signal?.addEventListener('abort',cancelled,{once:true});
  const timer=setTimeout(()=>controller.abort(),90000);
  let body;
  if(request.method==='POST'&&request.body){
    let received=0;
    body=request.body.pipeThrough(new TransformStream({transform(chunk,stream){
      if(chunk.byteLength>MAX_REQUEST_BYTES-received){tooLarge=true;controller.abort();throw new Error('Request size limit exceeded.');}
      received+=chunk.byteLength;stream.enqueue(chunk);
    }}));
    // A bounded stream may no longer expose a fixed length to the runtime.
    // The origin also enforces its per-route byte and receive-time bounds.
    headers.delete('content-length');
  }
  try{
    const upstream=await fetcher(target.toString(),{method:request.method,headers,
      ...(body?{body,duplex:'half'}:{}),redirect:'manual',cache:'no-store',signal:controller.signal});
    if(tooLarge){discard(upstream);return failure(413,'Request exceeds the 30 MiB limit.');}
    if(upstream.status>=500||upstream.status===101){discard(upstream);return failure();}
    const location=upstream.headers.get('location');
    const redirect=location===null?null:safeLocation(location,incoming.href,secret);
    if(location!==null&&redirect===null){discard(upstream);return failure();}
    const responseHeaders=new Headers(upstream.headers);stripTransportHeaders(responseHeaders);
    for(const [name,value]of [...responseHeaders]){
      if(name.startsWith('access-control-')||name==='refresh'||value.includes(secret))responseHeaders.delete(name);
    }
    if(redirect!==null)responseHeaders.set('location',redirect);
    responseHeaders.set('cache-control','private, no-store, max-age=0');
    responseHeaders.set('cdn-cache-control','no-store');responseHeaders.set('cloudflare-cdn-cache-control','no-store');
    responseHeaders.set('referrer-policy','no-referrer');responseHeaders.set('x-content-type-options','nosniff');
    if(request.method==='HEAD')discard(upstream);
    return new Response(request.method==='HEAD'?null:upstream.body,{status:upstream.status,statusText:upstream.statusText,headers:responseHeaders});
  }catch{
    return tooLarge?failure(413,'Request exceeds the 30 MiB limit.'):failure();
  }finally{
    clearTimeout(timer);request.signal?.removeEventListener('abort',cancelled);
  }
}
