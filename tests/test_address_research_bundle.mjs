import assert from 'node:assert/strict';
import test from 'node:test';
import {researchSelection,collectResearch,verifyResearchBundle,BUNDLE_VERSION,BUNDLE_LIMITS} from '../space/public/assets/address-research-bundle.js';
import {researchHash} from '../space/public/assets/address-research-core.js';
import {researchReport,researchFixture,RESEARCH_AMOUNT} from './address_research_fixture.js';

const reference=researchFixture('ETH').reference,scope=()=>researchSelection('ETH_ALL',reference),now=()=> '2026-09-27T01:00:00Z';
const report=async asset=>(await researchReport(asset)).body;
const collect=callback=>collectResearch(scope(),callback||report,{now});
const rehash=async value=>{const {bundle_sha256,...body}=value;return {...body,bundle_sha256:await researchHash(body)};};

test('selection validates one chain reference and expands only the three allowlisted Ethereum assets',()=>{
  assert.deepEqual(researchSelection('ETH_ALL',reference.toUpperCase()),{network:'ethereum',reference,selection:'ETH_ALL',assets:['ETH','USDT','USDC']});
  const btc=researchFixture('BTC').reference;assert.equal(researchSelection('BTC',btc).reference,btc);assert.deepEqual(researchSelection('USDC',reference).assets,['USDC']);
  for(const args of [['ALL',reference],['ETH_ALL',reference,'bitcoin'],['ETH_ALL',btc],['BTC',reference],['USDT',reference,'bloch'],['ETH_ALL','<script>']])assert.throws(()=>researchSelection(...args));
});
test('three independent queries start together and preserve exact child reports in deterministic asset order',async()=>{
  const calls=[],finish={},source=new Map(await Promise.all(['ETH','USDT','USDC'].map(async asset=>[asset,await report(asset)])));
  const pending=collect((asset,requestScope)=>{calls.push({asset,scope:requestScope});return new Promise(resolve=>{finish[asset]=()=>resolve(source.get(asset));});});
  assert.deepEqual(calls.map(c=>c.asset),['ETH','USDT','USDC']);assert.ok(calls.every(c=>c.scope.reference===reference));
  finish.USDC();finish.ETH();finish.USDT();const bundle=await pending;
  assert.equal(bundle.version,BUNDLE_VERSION);assert.deepEqual(bundle.results.map(r=>r.asset),['ETH','USDT','USDC']);assert.equal(bundle.assembled_at,now());
  for(const item of bundle.results){assert.deepEqual(item.report,source.get(item.asset));assert.equal(item.report.modules.ledger.data.wallet.balance.base_units,RESEARCH_AMOUNT);}
  assert.equal(bundle.results[0].report.modules.graph.status,'unsupported');assert.equal(bundle.results[1].report.modules.machine_learning.status,'available');
  assert.equal(Object.hasOwn(bundle,'balance'),false);assert.equal(Object.hasOwn(bundle,'scores'),false);assert.deepEqual(await verifyResearchBundle(bundle),bundle);
  source.get('USDT').modules.ledger.data.wallet.balance.base_units='1';assert.equal(bundle.results[1].report.modules.ledger.data.wallet.balance.base_units,RESEARCH_AMOUNT);
});
test('one failed asset retains the other reports and errors never carry private or upstream content',async()=>{
  const bundle=await collect(asset=>{if(asset==='USDT'){const error=new Error('private upstream note');error.status=429;throw error;}return report(asset);});
  assert.deepEqual(bundle.results[1],{asset:'USDT',status:'unavailable',error:'rate_limited'});assert.equal(bundle.results[0].status,'available');assert.equal(bundle.results[2].status,'available');assert.ok(!JSON.stringify(bundle).includes('private upstream note'));await verifyResearchBundle(bundle);
  const failed=await collect(()=>{throw new Error('sensitive source context');});assert.ok(failed.results.every(r=>r.status==='unavailable'&&r.error==='source_unavailable'));await verifyResearchBundle(failed);assert.ok(!JSON.stringify(failed).includes('sensitive'));
  const denied=await collect(()=>{const error=new Error('forbidden');error.status=403;throw error;});assert.ok(denied.results.every(r=>r.error==='access_unavailable'));
});
test('source scope and hash mismatches cannot be shown under another asset or reference',async()=>{
  const bundle=await collect(async asset=>{
    if(asset==='ETH')return report('USDT');
    if(asset==='USDT')return (await researchReport(asset,{reference:'0x'+'e'.repeat(40)})).body;
    const value=await report(asset);value.modules.ledger.data.wallet.balance.base_units='1';return value;
  });
  assert.deepEqual(bundle.results.map(r=>r.error),['research_scope_mismatch','research_scope_mismatch','research_integrity_mismatch']);await verifyResearchBundle(bundle);
});
test('single-asset queries retain their original contract and fail on an unavailable or mismatched source',async()=>{
  const expected=await report('BTC');assert.deepEqual(await collectResearch(researchSelection('BTC',expected.scope.reference),async asset=>{assert.equal(asset,'BTC');return expected;}),expected);
  await assert.rejects(()=>collectResearch(researchSelection('USDT',reference),()=>report('USDC')),/scope_mismatch/);
  await assert.rejects(()=>collectResearch(researchSelection('ETH',reference),()=>{throw new Error('source_failed');}),/source_failed/);
});
test('aborted searches never assemble late reports and pre-aborted queries make no requests',async()=>{
  const controller=new AbortController(),finish=[];
  const pending=collectResearch(scope(),asset=>new Promise(resolve=>finish.push(async()=>resolve(await report(asset)))),{signal:controller.signal,now});
  controller.abort();await Promise.all(finish.map(done=>done()));await assert.rejects(()=>pending,{name:'AbortError'});
  let calls=0;await assert.rejects(()=>collectResearch(scope(),()=>{calls++;},{signal:controller.signal}),{name:'AbortError'});assert.equal(calls,0);
});
test('UTF-8 response limits reject a complete oversized child without truncating other assets',async()=>{
  const bundle=await collect(async asset=>{const value=await report(asset);if(asset==='USDT')value.padding='\u{1f600}'.repeat(Math.ceil(BUNDLE_LIMITS.report_bytes/4));return value;});
  assert.equal(bundle.results[1].error,'research_response_limit');assert.equal(bundle.results[2].status,'available');await verifyResearchBundle(bundle);
  await assert.rejects(()=>verifyResearchBundle({version:BUNDLE_VERSION,padding:'x'.repeat(BUNDLE_LIMITS.bundle_bytes)}),/response_limit/);
});
test('bundle verification rejects reordered, omitted, mutated and contradictory observations even after a wrapper rehash',async()=>{
  const original=await collect();const altered=structuredClone(original);altered.results[0].report.scope.asset='USDT';await assert.rejects(()=>verifyResearchBundle(altered),/bundle_integrity/);
  const mutations=[
    b=>b.results.reverse(),b=>b.results.pop(),b=>b.scope.assets.reverse(),b=>b.scope.network='bitcoin',b=>b.scope.reference='0x'+'a'.repeat(40),
    b=>b.results[0].report.modules.ledger.data.wallet.balance.base_units='1',b=>b.results[1].extra='unsupported',b=>b.extra='unsupported',
    b=>b.results[0]={asset:'ETH',status:'unavailable',error:'source_unavailable',report:b.results[0].report},b=>b.assembled_at='not-a-date',
  ];
  for(const mutate of mutations){const b=structuredClone(original);mutate(b);await assert.rejects(()=>rehash(b).then(verifyResearchBundle));}
});
