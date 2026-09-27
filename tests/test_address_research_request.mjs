import test from 'node:test';
import assert from 'node:assert/strict';
import {createResearchClient,researchRetrySeconds} from '../space/public/assets/address-research-request.js';
import {onRequest} from '../site/functions/api/research.js';
import {setup} from './porb_helpers.mjs';
import {researchReport,researchFixture} from './address_research_fixture.js';
const reference=researchFixture().reference,url='https://bloch.space/api/research?'+new URLSearchParams({network:'ethereum',asset:'USDT',query:reference});
const start=Date.parse('2026-09-27T20:00:00Z');

test('successful research uses one bounded, uncached GET and preserves the original report',async()=>{
  const original=(await researchReport()).body;let calls=0;
  const client=createResearchClient({fetcher:async(target,options)=>{calls++;assert.equal(target,url);assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');assert.equal(options.credentials,'same-origin');assert.deepEqual(options.headers,{accept:'application/json'});assert.ok(options.signal);return Response.json(original);}});
  assert.deepEqual(await client.request(url),original);assert.equal(calls,1);assert.equal(client.remaining(),0);
});
test('HTML errors retain HTTP status and retry hints without parsing or exposing upstream content',async()=>{
  let now=start,calls=0,canceled=0;
  const client=createResearchClient({now:()=>now,fetcher:async()=>{calls++;return {ok:false,status:502,headers:new Headers({'retry-after':'12'}),body:{cancel:async()=>{canceled++;}},json:()=>{throw new Error('must_not_parse');}};}});
  await assert.rejects(()=>client.request(url),e=>e.status===502&&e.retryUntil===start+12000&&e.message==='address_research_unavailable');assert.equal(canceled,1);assert.equal(client.remaining(),12);
  for(let i=0;i<3;i++)await assert.rejects(()=>client.request(url),e=>e.status===502);assert.equal(calls,1,'Paused attempts make no HTTP request');
  now+=12000;assert.equal(client.remaining(),0);assert.equal(calls,1,'An elapsed deadline never triggers a request');
  await assert.rejects(()=>client.request(url));assert.equal(calls,2,'Only another explicit call retries');
});
test('retry parsing supports bounded seconds, HTTP dates, clock skew, zero and rate-limit defaults',()=>{
  for(const status of [429,502,503,504]){
    assert.equal(researchRetrySeconds(new Headers({'retry-after':'37'}),status,start),37);
    assert.equal(researchRetrySeconds(new Headers({'retry-after':'0'}),status,start),0);
    assert.equal(researchRetrySeconds(new Headers({'retry-after':'Sun, 27 Sep 2026 20:01:00 GMT'}),status,start),60);
    assert.equal(researchRetrySeconds(new Headers({'retry-after':'Sun, 27 Sep 2026 20:01:00 GMT',date:'Sun, 27 Sep 2026 20:00:30 GMT'}),status,start-3600000),30);
    assert.equal(researchRetrySeconds(new Headers({'retry-after':'Sun, 27 Sep 2026 19:00:00 GMT'}),status,start),0);
    for(const value of ['', '-1','1.5','in 5 minutes','9999999','86401','Tue, 31 Feb 2026 20:01:00 GMT'])assert.equal(researchRetrySeconds(new Headers({'retry-after':value}),status,start),status===429?60:0);
  }
  for(const status of [200,302,400,401,403,404])assert.equal(researchRetrySeconds(new Headers({'retry-after':'60'}),status,start),0);
});
test('concurrent replies preserve the longest pause and a success never releases it early',async()=>{
  const finish=[],client=createResearchClient({now:()=>start,fetcher:()=>new Promise(resolve=>finish.push(resolve))});
  const first=client.request(url).catch(e=>e),second=client.request(url).catch(e=>e),third=client.request(url);
  finish[0](new Response('private HTML',{status:429,headers:{'retry-after':'40'}}));assert.equal((await first).status,429);
  finish[1](new Response('more private HTML',{status:503,headers:{'retry-after':'10'}}));await second;
  finish[2](Response.json({captured:true}));assert.deepEqual(await third,{captured:true});assert.equal(client.remaining(),40);
});
test('authentication, redirects, malformed success and missing retry hints never expose response text',async()=>{
  for(const status of [302,400,401,403,404,500,502]){
    const client=createResearchClient({fetcher:async()=>new Response('<html>upstream secret</html>',{status})});
    await assert.rejects(()=>client.request(url),e=>e.status===status&&!e.message.includes('secret'));assert.equal(client.remaining(),0);
  }
  const client=createResearchClient({fetcher:async()=>new Response('<html>upstream secret</html>')});await assert.rejects(()=>client.request(url),/unsupported_research_report/);
});
test('stream and declared byte limits reject complete oversized responses and cancel their bodies',async()=>{
  for(const declared of [false,true]){
    let canceled=false;
    const stream=new ReadableStream({start(c){if(!declared)c.enqueue(new Uint8Array(3*1024*1024+1));},cancel(){canceled=true;}});
    const client=createResearchClient({fetcher:async()=>new Response(stream,{headers:declared?{'content-length':String(3*1024*1024+1)}:{}})});
    await assert.rejects(()=>client.request(url),/research_response_limit/);assert.equal(canceled,true);
  }
});
test('pre-cancel, in-flight reset and body-read timeout cannot recreate a stale wait or report',async()=>{
  let calls=0,finish;const controller=new AbortController();controller.abort();
  const client=createResearchClient({fetcher:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
  await assert.rejects(()=>client.request(url,{signal:controller.signal}),{name:'AbortError'});assert.equal(calls,0);
  const pending=client.request(url);client.reset();finish(new Response('late failure',{status:429,headers:{'retry-after':'60'}}));await assert.rejects(()=>pending,{name:'AbortError'});assert.equal(client.remaining(),0);
  let canceled=false;const timeout=createResearchClient({timeoutMs:10,fetcher:async()=>new Response(new ReadableStream({cancel(){canceled=true;}}))});await assert.rejects(()=>timeout.request(url),{name:'TimeoutError'});assert.equal(canceled,true);
});
test('public and authenticated research gateways sanitize HTML failures and preserve bounded retry timing',async()=>{
  const h=await setup(),cookie=await h.login();
  try{
    for(const status of [429,502,503,504]){
      const fetcher=async()=>new Response('<html>private source detail</html>',{status,headers:{'retry-after':'Sun, 27 Sep 2026 20:01:00 GMT',date:'Sun, 27 Sep 2026 20:00:00 GMT'}});
      const publicResponse=await onRequest({request:new Request(url,{headers:{'cf-connecting-ip':'request-test-'+status}}),fetcher});
      assert.equal(publicResponse.status,status);assert.equal(publicResponse.headers.get('retry-after'),'60');assert.match(publicResponse.headers.get('cache-control'),/no-store/);assert.deepEqual(await publicResponse.json(),{error:'address_research_unavailable'});
      const privateResponse=await h.call('/v1/space/research?'+new URL(url).searchParams,'GET',undefined,cookie,{fetcher});assert.equal(privateResponse.status,status);assert.equal(privateResponse.headers.get('retry-after'),'60');assert.deepEqual(await privateResponse.json(),{error:'address_research_unavailable'});
    }
  }finally{h.sqlite.close();}
});
