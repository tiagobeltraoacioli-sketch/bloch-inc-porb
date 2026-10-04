import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handlePublicBlochAI} from '../deploy/blochai-public/worker.js';
import {handleWorkspaceProxy} from '../deploy/blochai-public/workspace-proxy.js';

const secret='a'.repeat(64),env={ENABLE_QENTL_WORKSPACE:'true',QENTL_ORIGIN_SECRET:secret};
const origin='https://qentl-workspace.posternlabs.com';
const proxy=(request,fetcher,configuration=env)=>handlePublicBlochAI({request,env:configuration,fetcher});

test('workspace is opt-in and disabled Qentl keeps the existing public landing behavior',async()=>{
  for(const flag of [undefined,'false','TRUE',true]){
    let calls=0;
    const configuration={...env,ENABLE_QENTL_WORKSPACE:flag,ASSETS:{async fetch(){calls++;return new Response('old landing');}}};
    const response=await proxy(new Request('https://qentl.ai/'),()=>{throw new Error('No origin access expected');},configuration);
    assert.equal(response.status,200);assert.equal(await response.text(),'old landing');assert.equal(calls,1);
    assert.equal((await proxy(new Request('https://qentl.ai/api/login',{method:'POST'}),null,configuration)).status,405);
  }
  const config=readFileSync(new URL('../deploy/blochai-public/wrangler.toml',import.meta.url),'utf8');
  assert.doesNotMatch(config,/QENTL_ORIGIN_SECRET/);
});

test('enabling workspace does not change other product domains or accept similar hostnames',async()=>{
  const configuration={...env,ASSETS:{fetch:async()=>new Response('public landing')}};
  for(const host of ['qentl.com','blochai.xyz']){
    const response=await proxy(new Request('https://'+host+'/'),()=>{throw new Error('No workspace fetch');},configuration);
    assert.equal(await response.text(),'public landing');
    assert.equal((await proxy(new Request('https://'+host+'/api/session'),null,configuration)).status,404);
  }
  for(const url of ['http://qentl.ai/','https://qentl.ai.evil.test/','https://qentl.ai:8443/','https://qentl-workspace.posternlabs.com/']){
    assert.equal((await proxy(new Request(url),()=>{throw new Error('Wrong host reached fetch');})).status,404);
  }
});

test('missing or malformed origin secrets fail closed without a backend request',async()=>{
  for(const value of [undefined,'','short','g'.repeat(64),secret+'\n']){
    const response=await proxy(new Request('https://qentl.ai/'),()=>{throw new Error('Unexpected request');},{...env,QENTL_ORIGIN_SECRET:value});
    assert.equal(response.status,503);assert.equal((await response.json()).error,'Qentl workspace is temporarily unavailable.');
  }
});

test('POST keeps exact path, query, cookies, authorization and CSRF origin while overwriting spoofed transport headers',async()=>{
  const payload=JSON.stringify({email:'synthetic@example.test',password:'synthetic-test-fixture'});
  let observed;
  const request=new Request('https://qentl.ai/api/login?mode=native&mode=second#invite=must-not-forward',{method:'POST',body:payload,headers:{
    'content-type':'application/json','content-length':String(new TextEncoder().encode(payload).length),
    cookie:'__Host-qentl_session=synthetic-session',authorization:'Bearer synthetic-native-token',origin:'https://qentl.ai',
    'x-blochai-action':'1','x-qentl-origin':'attacker','x-forwarded-proto':'http','x-forwarded-host':'attacker.test',
    'x-forwarded-for':'127.0.0.1',forwarded:'host=evil.test','x-real-ip':'127.0.0.1',
    connection:'keep-alive, x-client-hop','x-client-hop':'must-remove',host:'attacker.test'}});
  const response=await proxy(request,async(url,init)=>{
    observed={url,init,body:await new Response(init.body).text()};
    return Response.json({account:'synthetic'});
  });
  assert.equal(response.status,200);assert.equal(observed.url,origin+'/api/login?mode=native&mode=second');
  assert.equal(observed.body,payload);assert.equal(observed.init.method,'POST');assert.equal(observed.init.redirect,'manual');
  assert.equal(observed.init.cache,'no-store');assert.equal(observed.init.headers.get('cookie'),'__Host-qentl_session=synthetic-session');
  assert.equal(observed.init.headers.get('authorization'),'Bearer synthetic-native-token');
  assert.equal(observed.init.headers.get('origin'),'https://qentl.ai');assert.equal(observed.init.headers.get('x-blochai-action'),'1');
  assert.equal(observed.init.headers.get('x-qentl-origin'),secret);assert.equal(observed.init.headers.get('x-forwarded-proto'),'https');
  for(const name of ['host','forwarded','x-forwarded-host','x-forwarded-for','x-real-ip','connection','x-client-hop','content-length'])assert.equal(observed.init.headers.has(name),false);
  assert(!observed.url.includes('invite'));assert(!observed.body.includes(secret));
});

test('foreign Origin is preserved for backend CSRF rejection, never promoted by the proxy',async()=>{
  const response=await proxy(new Request('https://qentl.ai/api/login',{method:'POST',headers:{origin:'https://evil.test'}}),async(url,init)=>{
    assert.equal(init.headers.get('origin'),'https://evil.test');return Response.json({error:'Rejected origin'},{status:403});
  });
  assert.equal(response.status,403);assert.equal((await response.json()).error,'Rejected origin');
});

test('double-slash and absolute-looking paths cannot replace the fixed upstream origin',async()=>{
  for(const path of ['//evil.test/path','/https://evil.test/path','/%2f%2fevil.test/path']){
    const response=await proxy(new Request('https://qentl.ai'+path+'?url=https%3A%2F%2F169.254.169.254'),async(url)=>{
      const actual=new URL(url);assert.equal(actual.origin,origin);assert.equal(actual.pathname,path);return new Response('ok');
    });
    assert.equal(response.status,200);
  }
});

test('unsupported methods and connection upgrades never reach the backend',async()=>{
  for(const method of ['PUT','DELETE','PATCH','OPTIONS']){
    const response=await proxy(new Request('https://qentl.ai/api/jobs',{method}),()=>{throw new Error('No fetch');});
    assert.equal(response.status,405);assert.equal(response.headers.get('allow'),'GET, HEAD, POST');
  }
  for(const headers of [{upgrade:'websocket'},{'sec-websocket-key':'synthetic'}]){
    assert.equal((await proxy(new Request('https://qentl.ai/',{headers}),()=>{throw new Error('No upgrade');})).status,400);
  }
});

test('oversized, ambiguous or malformed Content-Length is rejected before fetch',async()=>{
  for(const value of [String(30*1024*1024+1),'1, 1','-1','Infinity','0x20','1e2','999999999999999999999']){
    const request=new Request('https://qentl.ai/api/projects/p/syncs/s/changes',{method:'POST',headers:{'content-length':value}});
    assert.equal((await proxy(request,()=>{throw new Error('No request should be sent');})).status,413);
  }
});

test('chunked and falsely small bodies are counted as streams without buffering the entire upload',async()=>{
  for(const declared of [null,'1']){
    let reads=0;
    const source=new ReadableStream({pull(controller){reads++;controller.enqueue(new Uint8Array(1024*1024));if(reads===32)controller.close();}});
    const request=new Request('https://qentl.ai/api/projects/p/folder-import',{method:'POST',body:source,duplex:'half',
      headers:declared===null?{}:{'content-length':declared}});
    const response=await proxy(request,async(url,init)=>{
      let count=0;const reader=init.body.getReader();
      while(true){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;assert(count<=30*1024*1024);}
      throw new Error('Over-limit body must not finish');
    });
    assert.equal(response.status,413);assert(reads<=32);
  }
});

test('responses preserve payload streams, security policy and separate session cookies while disabling caching and CORS',async()=>{
  const upstream=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1,2,3]));controller.close();}}),{
    headers:{'content-type':'application/octet-stream','content-security-policy':"default-src 'self'",'cache-control':'public, max-age=99999',
      'access-control-allow-origin':'*','access-control-allow-credentials':'true','x-qentl-origin':secret,'x-debug-credential':secret,'x-forwarded-host':'internal',
      refresh:'0;url=https://evil.test'}});
  upstream.headers.append('set-cookie','__Host-qentl_session=synthetic; Secure; HttpOnly; Path=/; SameSite=Strict');
  upstream.headers.append('set-cookie','second=synthetic; Secure; Path=/');
  const cookies=upstream.headers.getSetCookie();
  const response=await proxy(new Request('https://qentl.ai/api/projects/p/export.zip'),async()=>upstream);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()),new Uint8Array([1,2,3]));
  assert.equal(response.headers.get('content-security-policy'),"default-src 'self'");assert.deepEqual(response.headers.getSetCookie(),cookies);
  assert.equal(response.headers.get('cache-control'),'private, no-store, max-age=0');
  for(const name of ['cdn-cache-control','cloudflare-cdn-cache-control'])assert.equal(response.headers.get(name),'no-store');
  for(const name of ['x-qentl-origin','x-debug-credential','x-forwarded-host','refresh','access-control-allow-origin','access-control-allow-credentials'])assert.equal(response.headers.has(name),false);
  assert(!JSON.stringify([...response.headers]).includes(secret));
});

test('HEAD forwards its method and returns no response body',async()=>{
  const response=await proxy(new Request('https://qentl.ai/app.js',{method:'HEAD'}),async(url,init)=>{
    assert.equal(init.method,'HEAD');assert.equal(init.body,undefined);return new Response('unexpected fake body',{headers:{'content-type':'text/javascript'}});
  });
  assert.equal(response.status,200);assert.equal(await response.text(),'');
});

test('same-site redirects are returned without following and internal-origin redirects are rewritten to the public hostname',async()=>{
  for(const location of ['/login?next=project','https://qentl.ai/login',origin+'/login#section']){
    let count=0;
    const response=await proxy(new Request('https://qentl.ai/path'),async(url,init)=>{count++;assert.equal(init.redirect,'manual');return new Response(null,{status:307,headers:{location}});});
    assert.equal(response.status,307);assert.equal(count,1);assert.equal(new URL(response.headers.get('location')).origin,'https://qentl.ai');
  }
});

test('external or credential-bearing redirects are rejected without forwarding origin secrets',async()=>{
  for(const location of ['https://evil.test/','//evil.test/','http://qentl.ai/','https://user:pass@qentl.ai/','https://qentl.ai/?leak='+secret]){
    let count=0;
    const response=await proxy(new Request('https://qentl.ai/'),async()=>{count++;return new Response('do not leak',{status:302,headers:{location}});});
    assert.equal(response.status,503);assert.equal(count,1);assert.equal(response.headers.has('location'),false);assert(!((await response.text()).includes(secret)));
  }
});

test('backend errors and exceptions produce a generic 503 without leaking headers or diagnostic bodies',async()=>{
  for(const fetcher of [async()=>{throw new Error('diagnostic '+secret);},async()=>new Response('private traceback '+secret,{status:500,headers:{'x-origin-detail':secret,'set-cookie':'invalid=should-not-return'}})]){
    const response=await proxy(new Request('https://qentl.ai/api/session'),fetcher);
    assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'Qentl workspace is temporarily unavailable.'});
    assert.equal(response.headers.has('x-origin-detail'),false);assert.equal(response.headers.has('set-cookie'),false);
  }
  const source=readFileSync(new URL('../deploy/blochai-public/workspace-proxy.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/console\.|\.json\(\)|\.text\(\)|\.arrayBuffer\(\)/);
});

test('direct handler also enforces the exact public authority and feature flag',async()=>{
  assert.equal((await handleWorkspaceProxy({request:new Request('https://evil.test/'),env})).status,404);
  assert.equal((await handleWorkspaceProxy({request:new Request('https://qentl.ai/'),env:{QENTL_ORIGIN_SECRET:secret}})).status,503);
});
