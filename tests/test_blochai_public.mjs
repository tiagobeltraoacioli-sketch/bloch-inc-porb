import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {handlePublicBlochAI} from '../deploy/blochai-public/worker.js';
import {handlePublicBlochAILink} from '../deploy/blochai-public-links/worker.js';
import {ASSISTANT_ASSET_VERSION,assistantMarkup} from '../deploy/blochai-public/catalog.js';

test('public hub serves static assets without credentials, scripts, cookies or connections',async()=>{
  let assetCalls=0;const env={ASSETS:{async fetch(request){assetCalls++;assert.equal(request.headers.has('cookie'),false);assert.equal(request.headers.has('authorization'),false);return new Response('public content',{headers:{'content-type':'text/html','set-cookie':'unexpected=value','access-control-allow-origin':'*'}});}}};
  const response=await handlePublicBlochAI({request:new Request('https://blochai.xyz/',{headers:{cookie:'private=ignored',authorization:'Bearer ignored'}}),env});
  assert.equal(response.status,200);assert.equal(assetCalls,1);assert.equal(response.headers.has('set-cookie'),false);assert.equal(response.headers.has('access-control-allow-origin'),false);assert.match(response.headers.get('content-security-policy'),/script-src 'none'; connect-src 'none'/);assert.equal(await response.text(),'public content');
});
test('public hub has no inference, session or mutable endpoints and rejects the private hostname',async()=>{
  let reads=0;const env={ASSETS:{fetch(){reads++;throw new Error('unexpected asset access');}}};
  for(const path of ['/api/porb/auth/session','/api/porb/v1/blochai/status','/api/porb/v1/blochai/tasks','/portal/','/unknown'])assert.equal((await handlePublicBlochAI({request:new Request(`https://blochai.xyz${path}`),env})).status,404);
  for(const method of ['POST','PUT','DELETE','OPTIONS'])assert.equal((await handlePublicBlochAI({request:new Request('https://blochai.xyz/',{method}),env})).status,405);
  for(const origin of ['https://rednblue.space','https://blochai.xyz.attacker.test','http://blochai.xyz'])assert.equal((await handlePublicBlochAI({request:new Request(origin+'/'),env})).status,404);
  assert.equal(reads,0);
});
test('assistant assets pair a release version with revalidation and reject unknown asset queries',async()=>{
  let reads=0;const env={ASSETS:{async fetch(request){reads++;assert.equal(new URL(request.url).search,'');assert.equal(request.headers.has('cookie'),false);return new Response('asset');}}};
  for(const host of ['bloch-graphus.xyz','bloch.space','blochl1.com'])for(const asset of ['/blochai-assistant.css','/blochai-assistant.js']){
    for(const query of ['',`?v=${ASSISTANT_ASSET_VERSION}`]){const response=await handlePublicBlochAI({request:new Request(`https://${host}${asset}${query}`),env});assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-cache.*max-age=0.*must-revalidate/);}
    const before=reads;for(const suffix of ['?v=old',`?v=${ASSISTANT_ASSET_VERSION}&extra=1`,`?v=${ASSISTANT_ASSET_VERSION}&v=${ASSISTANT_ASSET_VERSION}`,'?other=1','.unexpected'])assert.equal((await handlePublicBlochAI({request:new Request(`https://${host}${asset}${suffix}`),env})).status,404);assert.equal(reads,before);
  }
  for(const host of ['blochl1.com','bloch-graphus.xyz','bloch.space']){const markup=assistantMarkup(host);assert.match(markup,/>Qentl\.ai <span/);assert.match(markup,/href="https:\/\/qentl\.ai\/"/);assert.doesNotMatch(markup,/>BlochAI|Close BlochAI|About BlochAI/);}
  assert.match(assistantMarkup('blochl1.com'),new RegExp(`/blochai-assistant\\.js\\?v=${ASSISTANT_ASSET_VERSION}`));
  assert.equal((await handlePublicBlochAI({request:new Request(`https://blochl1.com/blochai-pdf/blochai-pdf.js?v=${ASSISTANT_ASSET_VERSION}`),env})).status,404);
});
test('Qentl domains share the brand hub and preserve private data boundaries',async()=>{
  const html=readFileSync(new URL('../site/blochai-public/index.html',import.meta.url),'utf8');
  for(const host of ['qentl.com','qentl.ai','blochai.xyz','bloch-graphus.xyz','bloch.space','blochl1.com'])assert.ok(html.includes(`https://${host}`));
  assert.doesNotMatch(html,/rednblue\.space|Rednblue/);
  assert.match(html,/<title>Qentl — Quantum Entanglement, by Bloch Inc\.<\/title>/);
  assert.match(html,/<link rel="canonical" href="https:\/\/qentl.com\/">/);
  assert.doesNotMatch(html,/<(?:script|form|input|textarea|iframe)\b/i);
  assert.match(html,/macOS and Windows builds are in validation/);
  assert.match(html,/id="cli"/);assert.match(html,/pipx install https:\/\/qentl\.ai\/cli\/qentl-0\.6\.1\.post4-py3-none-any\.whl/);assert.match(html,/curl -fsSL https:\/\/qentl\.ai\/cli\/install\.sh \| sh/);assert.match(html,/class="header-link" href="https:\/\/qentl\.ai\/workspace">Workspace/);
  const sums=readFileSync(new URL('../site/blochai-public/cli/SHA256SUMS.txt',import.meta.url),'utf8'),wheel=readFileSync(new URL('../site/blochai-public/cli/qentl-0.6.1.post4-py3-none-any.whl',import.meta.url));
  const digest=createHash('sha256').update(wheel).digest('hex');assert.ok(sums.split('\n').includes(digest+'  qentl-0.6.1.post4-py3-none-any.whl'));
  const installer=readFileSync(new URL('../site/blochai-public/cli/install.sh',import.meta.url),'utf8');
  assert.ok(installer.includes('SHA256='+digest+'\n'));assert.ok(installer.includes('VERSION=0.6.1.post4\n'));assert.match(installer,/--only-binary=:all:/);assert.doesNotMatch(installer,/sudo |[^\x00-\x7f]/);
  assert.match(html,/Qwen3.5/);assert.match(html,/14B/);assert.match(html,/PLANNED/);assert.match(html,/program is not active/);
  assert.match(html,/not an online count/);assert.match(html,/out of shared training/);
  const env={ASSETS:{fetch:async()=>new Response(html)}};
  for(const host of ['qentl.com','qentl.ai','blochai.xyz']){
    const response=await handlePublicBlochAI({request:new Request(`https://${host}/`),env});
    assert.equal(response.status,200);assert.equal(await response.text(),html);
    assert.equal((await handlePublicBlochAI({request:new Request(`https://${host}/cli/qentl-0.6.1.post4-py3-none-any.whl`),env})).status,200);
    assert.equal((await handlePublicBlochAI({request:new Request(`https://${host}/api/jobs`),env})).status,404);
    assert.equal((await handlePublicBlochAI({request:new Request(`https://${host}/`,{method:'POST'}),env})).status,405);
  }
  for(const host of ['qentl.com.evil.test','qentl.ai.evil.test'])assert.equal((await handlePublicBlochAI({request:new Request(`https://${host}/`),env})).status,404);
  const config=readFileSync(new URL('../deploy/blochai-public/wrangler.toml',import.meta.url),'utf8');
  assert.doesNotMatch(config,/PORB_DB|binding = "BLOCHAI_API_TOKEN"|rednblue/);
  for(const host of ['qentl.com','qentl.ai'])assert.ok(config.includes(`pattern = "${host}", custom_domain = true`));
});
test('optional public link handler passes through the exact request and response without broadening hosts',async()=>{
  for(const host of ['rednblue.space','blochai.xyz','bloch-grapus.xyz','attacker.test']){
    const response=await handlePublicBlochAILink({request:new Request(`https://${host}/`),fetcher:()=>{throw new Error('unexpected fetch');}});assert.equal(response.status,404);
  }
  for(const item of [{path:'/',enabled:false,type:'text/html',method:'GET'},{path:'/api/overview',enabled:true,type:'application/json',method:'GET'},{path:'/',enabled:true,type:'application/json',method:'GET'},{path:'/',enabled:true,type:'text/html',method:'HEAD'}]){
    const request=new Request('https://bloch.space'+item.path,{method:item.method,headers:{cookie:'origin-only=value'}}),upstream=new Response('unchanged',{headers:{'content-type':item.type,'x-origin':'preserved','set-cookie':'public-origin=value'}});
    const response=await handlePublicBlochAILink({request,env:{ENABLE_PUBLIC_LINK:String(item.enabled)},fetcher:async forwarded=>{assert.equal(forwarded,request);assert.equal(new URL(forwarded.url).host,'bloch.space');return upstream;},createRewriter:()=>{throw new Error('unexpected rewrite');}});
    assert.equal(await response.text(),'unchanged');assert.equal(response.headers.get('set-cookie'),'public-origin=value');assert.match(response.headers.get('x-blochai-integration'),/^passthrough-/);
  }
});
test('public page passthrough explicitly avoids recursive front-door routing',()=>{
  const config=readFileSync(new URL('../deploy/blochai-public/wrangler.toml',import.meta.url),'utf8');
  assert.match(config,/compatibility_flags\s*=\s*\["global_fetch_private_origin"\]/);
  assert.doesNotMatch(config,/"global_fetch_strictly_public"/);
});
test('enabled public root insertion is a fixed public link and preserves origin security headers',async()=>{
  let insertions=[];
  const createRewriter=()=>{
    const handlers=new Map();return {on(selector,handler){handlers.set(selector,handler);return this;},onDocument(handler){handlers.set('document',handler);return this;},transform(response){let callback;handlers.get('head').element({append(){}});handlers.get('body').element({onEndTag(fn){callback=fn;}});callback({before(content,options){insertions.push({content,options});}});handlers.get('document').end({append(){throw new Error('document fallback must not duplicate navigation link');}});return response;}};
  };
  const upstream=new Response('<html>Public origin</html>',{headers:{'content-type':'text/html','content-security-policy':"script-src 'self'",etag:'stale','content-length':'33'}});
  const response=await handlePublicBlochAI({request:new Request('https://bloch-graphus.xyz/'),env:{ENABLE_PUBLIC_LINK:'true'},fetcher:async()=>upstream,createRewriter});
  assert.equal(insertions.length,1);assert.match(insertions[0].content,/href="https:\/\/qentl.ai\/"/);assert.doesNotMatch(insertions[0].content,/script|\/api\/|rednblue|cookie/i);assert.deepEqual(insertions[0].options,{html:true});assert.equal(response.headers.get('content-security-policy'),"script-src 'self'");assert.equal(response.headers.has('etag'),false);assert.equal(response.headers.has('content-length'),false);
});
test('Bloch Space app gets an exact-path integration while other app and API paths stay untouched',async()=>{
  const html='<html><body><div id="root"></div></body></html>';let count=0;
  const createRewriter=()=>{const handlers=new Map();return {on(selector,handler){handlers.set(selector,handler);return this;},onDocument(handler){handlers.set('document',handler);return this;},transform(response){let callback;handlers.get('body').element({onEndTag(fn){callback=fn;}});callback({before(content){assert.match(content,/https:\/\/qentl.ai\//);count++;}});handlers.get('document').end({append(){throw new Error('document fallback must not duplicate body link');}});return response;}};};
  const request=origin=>new Request(origin),env={ENABLE_PUBLIC_LINK:'true'},fetcher=async()=>new Response(html,{headers:{'content-type':'text/html'}});
  for(const path of ['/app/','/app/?network=bloch&view=overview']){
    const response=await handlePublicBlochAI({request:request('https://bloch.space'+path),env,fetcher,createRewriter});assert.equal(response.headers.get('x-blochai-integration'),'rewritten-v4');
  }
  assert.equal(count,2);
  for(const url of ['https://blochl1.com/app/','https://bloch-graphus.xyz/app/','https://bloch.space/app/other','https://bloch.space/api/overview']){
    const response=await handlePublicBlochAI({request:request(url),env,fetcher,createRewriter});assert.equal(response.headers.get('x-blochai-integration'),'passthrough-path');assert.equal(await response.text(),html);
  }
  assert.equal(count,2);
});
