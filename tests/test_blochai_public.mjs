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
test('the ecosystem sites expose no AI routes: assistant, PDF and task paths answer 404 without reaching assets or origin',async()=>{
  let reads=0,fetched=0;const env={ENABLE_PUBLIC_LINK:'true',ENABLE_PUBLIC_ASSISTANT:'true',ASSETS:{async fetch(){reads++;return new Response('asset');}}};
  const fetcher=async()=>{fetched++;return new Response('origin');};
  for(const host of ['bloch-graphus.xyz','bloch.space','blochl1.com'])
    for(const path of ['/blochai-assistant.js','/blochai-assistant.css',`/blochai-assistant.js?v=${ASSISTANT_ASSET_VERSION}`,'/blochai-pdf/blochai-pdf.js','/api/blochai/tasks','/api/blochai/tasks/abc'])
      for(const method of ['GET','POST'])assert.equal((await handlePublicBlochAI({request:new Request(`https://${host}${path}`,{method}),env,fetcher})).status,404,host+path);
  assert.equal(reads,0);assert.equal(fetched,0);
});
test('Qentl domains share the brand hub and preserve private data boundaries',async()=>{
  const html=readFileSync(new URL('../site/blochai-public/index.html',import.meta.url),'utf8');
  for(const host of ['qentl.com','qentl.ai','blochai.xyz'])assert.ok(html.includes(`https://${host}`));
  // The ecosystem sites no longer carry Qentl or other AI features, so the hub does not point to them.
  assert.doesNotMatch(html,/bloch-graphus\.xyz|bloch\.space|blochl1\.com|#ecosystem|new identity of BlochAI/);
  assert.doesNotMatch(html,/rednblue\.space|Rednblue/);
  assert.match(html,/<title>Qentl — Quantum Entanglement<\/title>/);
  assert.doesNotMatch(html,/Bloch|blochinc|bloch-inc|bloch-symbol/);  // the Qentl site does not present a parent company
  assert.match(html,/<link rel="canonical" href="https:\/\/qentl.com\/">/);
  assert.doesNotMatch(html,/<(?:script|form|input|textarea|iframe)\b/i);
  assert.match(html,/macOS and Windows builds are in validation/);
  assert.match(html,/id="cli"/);assert.match(html,/pipx install https:\/\/qentl\.ai\/cli\/qentl-0\.6\.1\.post6-py3-none-any\.whl/);assert.match(html,/curl -fsSL https:\/\/qentl\.ai\/cli\/install\.sh \| sh/);assert.match(html,/class="header-link" href="https:\/\/qentl\.ai\/workspace">Workspace/);
  const sums=readFileSync(new URL('../site/blochai-public/cli/SHA256SUMS.txt',import.meta.url),'utf8'),wheel=readFileSync(new URL('../site/blochai-public/cli/qentl-0.6.1.post6-py3-none-any.whl',import.meta.url));
  const digest=createHash('sha256').update(wheel).digest('hex');assert.ok(sums.split('\n').includes(digest+'  qentl-0.6.1.post6-py3-none-any.whl'));
  const installer=readFileSync(new URL('../site/blochai-public/cli/install.sh',import.meta.url),'utf8');
  assert.ok(installer.includes('SHA256='+digest+'\n'));assert.ok(installer.includes('VERSION=0.6.1.post6\n'));assert.match(installer,/--only-binary=:all:/);assert.doesNotMatch(installer,/sudo |[^\x00-\x7f]/);
  assert.match(html,/Qwen3.5/);assert.match(html,/14B/);assert.doesNotMatch(html,/Earn BLCH|Connect your GPU|contributor program|PLANNED|payout/i);  // no GPU contributor or reward plan is announced
  assert.match(html,/not an online count/);assert.match(html,/out of shared training/);
  const env={ASSETS:{fetch:async()=>new Response(html)}};
  for(const host of ['qentl.com','qentl.ai','blochai.xyz']){
    const response=await handlePublicBlochAI({request:new Request(`https://${host}/`),env});
    assert.equal(response.status,200);assert.equal(await response.text(),html);
    assert.equal((await handlePublicBlochAI({request:new Request(`https://${host}/cli/qentl-0.6.1.post6-py3-none-any.whl`),env})).status,200);
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
test('ecosystem pages pass through unchanged: no Qentl link, assistant or rewriting, even with the old flags on',async()=>{
  const html='<html><head></head><body><div id="root"></div></body></html>',seen=[];
  const fetcher=async request=>{seen.push(request.url);return new Response(html,{headers:{'content-type':'text/html','content-security-policy':"script-src 'self'",etag:'origin'}});};
  const env={ENABLE_PUBLIC_LINK:'true',ENABLE_PUBLIC_ASSISTANT:'true'};
  for(const url of ['https://bloch-graphus.xyz/','https://bloch.space/','https://bloch.space/app/','https://blochl1.com/','https://bloch.space/api/overview']){
    const response=await handlePublicBlochAI({request:new Request(url),env,fetcher});const body=await response.text();
    assert.equal(body,html);assert.doesNotMatch(body,/qentl|blochai/i);assert.equal(response.headers.has('x-blochai-integration'),false);
    assert.equal(response.headers.get('etag'),'origin');assert.equal(response.headers.get('content-security-policy'),"script-src 'self'");
  }
  assert.deepEqual(seen,['https://bloch-graphus.xyz/','https://bloch.space/','https://bloch.space/app/','https://blochl1.com/','https://bloch.space/api/overview']);
});
