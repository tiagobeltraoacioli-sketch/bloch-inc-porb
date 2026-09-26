import assert from 'node:assert/strict';
import test from 'node:test';
import {handleResearch} from '../space/chain/address-research.js';
import {researchScope,analyzeAddress,verifyResearch,researchHash} from '../space/public/assets/address-research-core.js';
import {onRequest} from '../site/functions/api/research.js';
import {researchFixture,researchReport,RESEARCH_AMOUNT} from './address_research_fixture.js';
const requestUrl=(asset='USDT',overrides={})=>{const f=researchFixture(asset);return new URL('https://rednblue.space/api/research?'+new URLSearchParams({network:f.network,asset,query:f.reference,...overrides}));};

test('address research validates and normalizes a single chain and asset before any source request',async()=>{
  let reads=0;const explore=async()=>{reads++;throw new Error('must_not_read');};
  for(const query of ['network=ethereum&asset=BTC&query=abc','network=bitcoin&query=abc','network=ethereum&asset=USDT&query='+researchFixture().reference+'&url=https://private.example','network=ethereum&network=bitcoin&query='+researchFixture().reference])assert.equal((await handleResearch(new URL('https://bloch.space/api/research?'+query),{explore})).status,400);
  assert.equal(reads,0);
  assert.equal(researchScope(requestUrl('USDT',{query:'  '+researchFixture().reference.toUpperCase()+'  '})).reference,researchFixture().reference);
  const btc=researchFixture('BTC');assert.equal(researchScope(requestUrl('BTC')).reference,btc.reference);
  assert.throws(()=>researchScope(requestUrl('BLCH',{query:'0x'+'a'.repeat(64)})));
});
test('unified research preserves exact UTXO/token amounts, root incidence and only comparable ML cohorts',async()=>{
  for(const asset of ['BTC','BLCH','USDT','USDC']){
    const response=await researchReport(asset);assert.equal(response.status,200);const report=await verifyResearch(response.body),{analytics,machine_learning,graph,ledger}=report.modules;
    assert.equal(graph.data.asset,asset);assert.equal(ledger.data.wallet.balance.base_units,RESEARCH_AMOUNT);
    assert.equal(analytics.data.root.outgoing,7);assert.equal(analytics.data.root.incoming,0);assert.equal(analytics.data.reference_transactions,7);
    assert.equal(analytics.data.flows[0].amount_base_units,(7n*BigInt(RESEARCH_AMOUNT)).toString());
    assert.equal(machine_learning.status,'available');assert.equal(machine_learning.data.cohort_size,12);assert.equal(machine_learning.data.members.length,12);assert.ok(machine_learning.data.members.every(m=>!m.id.includes(':transaction:')));
    assert.equal(analytics.data.neighborhood.nodes,['BTC','BLCH'].includes(asset)?23:12);assert.equal(analytics.data.rows.some(r=>'rank' in r||'red' in r||'score' in r),false);
    assert.equal(report.modules.forecast.status,'unavailable');assert.notEqual(ledger.data.wallet.observation.retrieved_at,graph.data.observations[0].at);
    const second=await researchReport(asset);assert.equal(report.report_sha256,second.body.report_sha256);
    const reordered=structuredClone(graph.data);reordered.nodes.reverse();reordered.edges.reverse();const a=analyzeAddress(reordered,report.scope);assert.deepEqual(a.ml.members,machine_learning.data.members);
  }
});
test('partial source failures retain usable data; native ETH history and small cohorts remain explicitly unavailable',async()=>{
  let result=await researchReport('USDC',{ledgerUnavailable:true});assert.equal(result.status,200);assert.equal(result.body.modules.ledger.status,'unavailable');assert.equal(result.body.modules.machine_learning.status,'available');
  result=await researchReport('BTC',{graphUnavailable:true});assert.equal(result.body.modules.ledger.status,'available');assert.equal(result.body.modules.analytics.status,'unavailable');
  assert.equal((await researchReport('BTC',{graphUnavailable:true,ledgerUnavailable:true})).status,502);
  result=await researchReport('ETH');assert.equal(result.body.modules.graph.status,'unsupported');assert.equal(result.body.modules.ledger.status,'available');assert.equal(result.body.modules.machine_learning.status,'unavailable');
  result=await researchReport('USDT',{count:8});assert.equal(result.body.modules.machine_learning.status,'unavailable');assert.match(result.body.modules.machine_learning.reason,/9 complete/);assert.equal(result.body.modules.analytics.status,'available');
  result=await researchReport('BLCH',{count:1});assert.equal(result.body.modules.analytics.data.flows.length,0);assert.equal(result.body.modules.analytics.data.root.degree,0);
});
test('mismatched/corrupted graph or ledger records cannot produce findings and report edits invalidate the digest',async()=>{
  const fixture=researchFixture(),url=requestUrl();
  const explore=async()=>({status:200,body:fixture.data});
  const graph=structuredClone(fixture.graph);graph.edges[0].amount='1e18';
  let response=await handleResearch(url,{explore,graph:async()=>({status:200,body:graph})});assert.equal(response.body.modules.graph.status,'unavailable');assert.equal(response.body.modules.machine_learning.status,'unavailable');
  response=await handleResearch(url,{explore,graph:async()=>({status:200,body:researchFixture('USDC').graph})});assert.equal(response.body.modules.graph.status,'unavailable');
  const wrong=structuredClone(fixture.data);wrong.wallet.address='0x'+'f'.repeat(40);
  response=await handleResearch(url,{explore:async()=>({status:200,body:wrong}),graph:async()=>({status:200,body:fixture.graph})});assert.equal(response.body.modules.ledger.status,'unavailable');
  wrong.wallet.address=fixture.reference;wrong.wallet.asset='USDC';response=await handleResearch(url,{explore:async()=>({status:200,body:wrong}),graph:async()=>({status:200,body:fixture.graph})});assert.equal(response.body.modules.ledger.status,'unavailable');
  const report=(await researchReport()).body;report.modules.analytics.data.root.degree++;await assert.rejects(()=>verifyResearch(report),/integrity/);
  assert.throws(()=>analyzeAddress(fixture.graph,{network:'ethereum',asset:'USDT',reference:'0x'+'a'.repeat(40)}),/scope_mismatch/);
});
test('public rednblue research proxies only the fixed endpoint without credentials and fails closed on redirects or corrupted bodies',async()=>{
  const body=(await researchReport()).body,request=new Request(requestUrl(),{headers:{cookie:'tenant=private',authorization:'Bearer private','x-porb-tenant':'secret','CF-Connecting-IP':'test-proxy'}});
  const reply=await onRequest({request,fetcher:async(url,init)=>{assert.equal(new URL(url).origin,'https://bloch.space');assert.equal(new URL(url).pathname,'/api/research');assert.deepEqual(init.headers,{accept:'application/json'});assert.equal(init.redirect,'manual');assert.ok(init.signal);return Response.json(body);}});
  assert.equal(reply.status,200);assert.match(reply.headers.get('cache-control'),/no-store/);assert.equal(reply.headers.get('access-control-allow-origin'),null);
  for(const make of [()=>new Response(null,{status:302,headers:{location:'https://private.example'}}),()=>Response.json({...body,report_sha256:'a'.repeat(64)})])assert.equal((await onRequest({request,fetcher:async()=>make()})).status,502);
  const wrong=structuredClone(body);delete wrong.report_sha256;wrong.scope.asset='USDC';wrong.report_sha256=await researchHash(wrong);assert.equal((await onRequest({request,fetcher:async()=>Response.json(wrong)})).status,502);
  const busy=await onRequest({request,fetcher:async()=>Response.json({error:'busy'},{status:429,headers:{'retry-after':'31'}})});assert.equal(busy.status,429);assert.equal(busy.headers.get('retry-after'),'31');
  assert.equal((await onRequest({request:new Request(requestUrl(),{method:'POST'})})).status,405);
  assert.equal((await onRequest({request:new Request(requestUrl('BTC',{query:'bad'}))})).status,400);
});
test('address research rejects overlarge complete reports instead of dropping evidence',async()=>{
  const fixture=researchFixture();fixture.data.note='x'.repeat(2800000);
  const response=await handleResearch(requestUrl(),{explore:async()=>({status:200,body:fixture.data}),graph:async()=>({status:200,body:fixture.graph})});assert.equal(response.status,422);assert.equal(response.body.error,'address_research_response_limit');
});
