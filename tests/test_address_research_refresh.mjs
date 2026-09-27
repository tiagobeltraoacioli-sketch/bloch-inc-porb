import assert from 'node:assert/strict';
import test from 'node:test';
import {refreshSingleResearch,BUNDLE_LIMITS} from '../space/public/assets/address-research-bundle.js';
import {researchHash,verifyResearch} from '../space/public/assets/address-research-core.js';
import {researchReport} from './address_research_fixture.js';

const report=async(asset='USDT',options={})=>(await researchReport(asset,options)).body;
async function revised(asset,options={}){
  const {report_sha256,...body}=await report(asset,options);body.retrieved_at='2026-09-27T18:00:00Z';
  if(body.modules.ledger.status==='available')body.modules.ledger.data.wallet.balance.base_units=(BigInt(body.modules.ledger.data.wallet.balance.base_units)+1n).toString();
  return {...body,report_sha256:await researchHash(body)};
}
test('single refresh collects exactly the same asset and reference for all five assets and preserves original bytes',async()=>{
  for(const asset of ['BTC','ETH','USDT','USDC','BLCH']){
    const original=await report(asset),before=JSON.stringify(original),replacement=await revised(asset),calls=[];
    const next=await refreshSingleResearch(original,async(selected,scope)=>{calls.push(selected);assert.equal(scope.reference,original.scope.reference);assert.equal(scope.network,original.scope.network);assert.deepEqual(scope.assets,[asset]);return replacement;});
    assert.deepEqual(calls,[asset]);assert.deepEqual(next,replacement);assert.equal(JSON.stringify(original),before);await verifyResearch(next);
    assert.equal(BigInt(next.modules.ledger.data.wallet.balance.base_units)-BigInt(original.modules.ledger.data.wallet.balance.base_units),1n);
    replacement.modules.ledger.data.wallet.balance.base_units='0';assert.notEqual(next.modules.ledger.data.wallet.balance.base_units,'0','The returned capture is isolated from caller mutation');
  }
});
test('partial replacements remove old graph or ledger data and an identical capture keeps its original identity',async()=>{
  const original=await report();
  for(const options of [{graphUnavailable:true},{ledgerUnavailable:true}]){
    const replacement=await revised('USDT',options),next=await refreshSingleResearch(original,async()=>replacement);
    assert.deepEqual(next,replacement);const unavailable=options.graphUnavailable?'graph':'ledger';assert.equal(next.modules[unavailable].status,'unavailable');assert.equal(next.modules[unavailable].data,undefined);
  }
  assert.deepEqual(await refreshSingleResearch(original,async()=>original),original);
});
test('failed, mismatched, corrupt and oversized updates leave the current capture intact',async()=>{
  const original=await report(),before=JSON.stringify(original),corrupt=await revised('USDT');corrupt.coverage='altered';
  const wrong=await report('USDT',{reference:'0x'+'f'.repeat(40)}),large=await report();large.padding='\u{1f600}'.repeat(Math.ceil(BUNDLE_LIMITS.report_bytes/4));
  for(const request of [async()=>{throw Object.assign(new Error('upstream detail'),{status:429});},async()=>report('USDC'),async()=>wrong,async()=>corrupt,async()=>large]){
    await assert.rejects(()=>refreshSingleResearch(original,request));assert.equal(JSON.stringify(original),before);
  }
  let calls=0;await assert.rejects(()=>refreshSingleResearch(corrupt,async()=>{calls++;return original;}),/integrity_mismatch/);assert.equal(calls,0);
});
test('cancelled single refreshes never return late reports and pre-cancelled refreshes make no source request',async()=>{
  const original=await report(),controller=new AbortController();let finish,started;
  const arrived=new Promise(resolve=>{started=resolve;}),pending=refreshSingleResearch(original,()=>{started();return new Promise(resolve=>{finish=resolve;});},{signal:controller.signal});
  await arrived;controller.abort();finish(await revised('USDT'));await assert.rejects(()=>pending,{name:'AbortError'});
  let calls=0;await assert.rejects(()=>refreshSingleResearch(original,()=>{calls++;},{signal:controller.signal}),{name:'AbortError'});assert.equal(calls,0);await verifyResearch(original);
});
