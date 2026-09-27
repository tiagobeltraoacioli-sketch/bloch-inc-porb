import test from 'node:test';
import assert from 'node:assert/strict';
import {compareSavedCapture,SAVED_CAPTURE_FILE_BYTES} from '../space/public/assets/address-research-import.js';
import {researchHash} from '../space/public/assets/address-research-core.js';
import {collectResearch,researchSelection} from '../space/public/assets/address-research-bundle.js';
import {researchReport,researchFixture} from './address_research_fixture.js';
const report=async(asset='USDT',options={})=>(await researchReport(asset,options)).body;
async function edit(raw,change){const {report_sha256,...body}=structuredClone(raw);change(body);return {...body,report_sha256:await researchHash(body)};}
const latest=raw=>edit(raw,r=>{r.retrieved_at='2026-09-27T12:00:00.000Z';if(r.modules.ledger.status==='available')r.modules.ledger.data.wallet.balance.base_units=(BigInt(r.modules.ledger.data.wallet.balance.base_units)+3n).toString();});
const bundle=()=>collectResearch(researchSelection('ETH_ALL',researchFixture().reference),asset=>report(asset),{now:()=> '2026-09-26T12:02:00.000Z'});
test('saved single reports compare all five assets with exact deltas, immutable originals and imported provenance',async()=>{
 for(const asset of ['BTC','ETH','USDT','USDC','BLCH']){
  const before=await report(asset),current=await latest(before),original=JSON.stringify(current),comparison=await compareSavedCapture(JSON.stringify(before,null,2),current);
  assert.equal(comparison.scope.asset,asset);assert.equal(comparison.balance.delta_base_units,'3');assert.equal(comparison.before.imported_from.sha256,before.report_sha256);assert.equal(comparison.before.imported_from.version,before.version);assert.equal(comparison.before.report_sha256,before.report_sha256);assert.equal(comparison.after.report_sha256,current.report_sha256);
  const {comparison_sha256,...body}=comparison;assert.equal(await researchHash(body),comparison_sha256);assert.equal(JSON.stringify(current),original);assert.match(comparison.coverage,/not source authenticity/);
  if(['BTC','BLCH'].includes(asset))assert.equal(comparison.graph.unchanged,before.modules.graph.data.edges.length);
 }
});
test('saved bundles verify every child and bind the selected asset to the original bundle digest',async()=>{
 const saved=await bundle();
 for(const item of saved.results){const current=await latest(item.report),comparison=await compareSavedCapture(JSON.stringify(saved),current);assert.equal(comparison.scope.asset,item.asset);assert.equal(comparison.before.report_sha256,item.report.report_sha256);assert.equal(comparison.before.imported_from.sha256,saved.bundle_sha256);}
 const current=await latest(saved.results[1].report),bad=structuredClone(saved);bad.results[2].report.coverage='changed';delete bad.bundle_sha256;bad.bundle_sha256=await researchHash(bad);
 await assert.rejects(()=>compareSavedCapture(JSON.stringify(bad),current),/integrity/);
 await assert.rejects(()=>compareSavedCapture(JSON.stringify({...saved,coverage:'changed'}),current),/integrity/);
});
test('different references, assets and unavailable bundle entries cannot be used as a baseline',async()=>{
 const before=await report(),current=await latest(before);
 await assert.rejects(async()=>compareSavedCapture(JSON.stringify(await report('USDC')),current),/scope_mismatch/);
 await assert.rejects(async()=>compareSavedCapture(JSON.stringify(await report('USDT',{reference:'0x'+'a'.repeat(40)})),current),/scope_mismatch/);
 const saved=await collectResearch(researchSelection('ETH_ALL',before.scope.reference),asset=>asset==='USDT'?Promise.reject(new Error('source_unavailable')):report(asset),{now:()=> '2026-09-26T12:02:00Z'});
 await assert.rejects(()=>compareSavedCapture(JSON.stringify(saved),current),/asset_unavailable/);
 const btc=await latest(await report('BTC'));await assert.rejects(()=>compareSavedCapture(JSON.stringify(saved),btc),/scope_mismatch/);
});
test('files need real UTC dates and a distinct capture no newer than the displayed report',async()=>{
 const before=await report(),current=await latest(before);
 await assert.rejects(()=>compareSavedCapture(JSON.stringify(current),current),/unchanged/);
 await assert.rejects(()=>compareSavedCapture(JSON.stringify(current),before),/newer_than_current/);
 for(const time of ['2026-02-31T01:00:00Z','09/26/2026']){const invalid=await edit(before,r=>{r.retrieved_at=time;});await assert.rejects(()=>compareSavedCapture(JSON.stringify(invalid),current),/invalid_time/);}
});
test('malformed, oversized and tampered inputs fail without creating a comparison',async()=>{
 const before=await report(),current=await latest(before);
 await assert.rejects(()=>compareSavedCapture('{',current),/invalid_json/);
 for(const value of [null,[],{version:'unknown'},{version:'bloch-address-capture-comparison/1'}])await assert.rejects(()=>compareSavedCapture(JSON.stringify(value),current),/unsupported/);
 await assert.rejects(()=>compareSavedCapture(' '.repeat(SAVED_CAPTURE_FILE_BYTES+1),current),/file_limit/);
 await assert.rejects(()=>compareSavedCapture(JSON.stringify({...before,padding:'x'.repeat(2800101)}),current),/response_limit/);
 await assert.rejects(()=>compareSavedCapture(JSON.stringify({...before,coverage:'altered'}),current),/integrity/);
 const graph=await edit(before,r=>{r.modules.graph.data.edges[0].amount='1e3';});await assert.rejects(()=>compareSavedCapture(JSON.stringify(graph),current),/Invalid evidence/);
});
test('partial saved captures retain unknown modules and literal source text rather than fabricated evidence',async()=>{
 const before=await report('USDC',{graphUnavailable:true}),current=await latest(before),comparison=await compareSavedCapture(JSON.stringify(before),current);
 assert.equal(comparison.graph.status,'unavailable');assert.equal(comparison.balance.status,'available');assert.equal(comparison.availability.find(m=>m.module==='graph').before,'unavailable');
 const text='<img src=x onerror=alert(1)>',literal=await edit(before,r=>{r.modules.ledger.data.wallet.observation.source_id=text;});assert.equal((await compareSavedCapture(JSON.stringify(literal),current)).balance.before.observation.source_id,text);
});
