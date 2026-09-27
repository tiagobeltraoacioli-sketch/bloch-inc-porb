import test from 'node:test';
import assert from 'node:assert/strict';
import {openSavedResearch} from '../space/public/assets/address-research-reader.js';
import {SAVED_CAPTURE_FILE_BYTES,compareSavedCapture} from '../space/public/assets/address-research-import.js';
import {researchHash} from '../space/public/assets/address-research-core.js';
import {collectResearch,researchSelection} from '../space/public/assets/address-research-bundle.js';
import {researchReport,researchFixture,RESEARCH_AMOUNT} from './address_research_fixture.js';
const report=async(asset='USDT',options={})=>(await researchReport(asset,options)).body;
async function edit(raw,change){const copy=structuredClone(raw),key=raw.bundle_sha256?'bundle_sha256':'report_sha256';delete copy[key];change(copy);copy[key]=await researchHash(copy);return copy;}
const bundle=()=>collectResearch(researchSelection('ETH_ALL',researchFixture().reference),report,{now:()=> '2026-09-26T12:02:00.000Z'});

test('saved research opens all five assets with original exact amounts, model results and digests',async()=>{
  for(const asset of ['BTC','ETH','USDT','USDC','BLCH']){
    const saved=await report(asset),opened=await openSavedResearch(JSON.stringify(saved,null,2));
    assert.deepEqual(opened,saved);assert.notEqual(opened,saved);assert.equal(opened.modules.ledger.data.wallet.balance.base_units,RESEARCH_AMOUNT);
    if(asset!=='ETH')assert.equal(opened.modules.machine_learning.status,'available');else assert.equal(opened.modules.graph.status,'unsupported');
  }
});
test('stored captures are independently usable with missing modules and unavailable ML',async()=>{
  for(const options of [{graphUnavailable:true},{ledgerUnavailable:true},{count:2},{count:1}]){
    const saved=await report('USDC',options);assert.deepEqual(await openSavedResearch(JSON.stringify(saved)),saved);
  }
});
test('complete, partial and entirely unavailable bundles retain all child statuses',async()=>{
  for(const failed of [[],['ETH','USDC'],['ETH','USDT','USDC']]){
    const saved=await collectResearch(researchSelection('ETH_ALL',researchFixture().reference),asset=>failed.includes(asset)?Promise.reject(new Error('source_unavailable')):report(asset));
    assert.deepEqual(await openSavedResearch(JSON.stringify(saved,null,2)),saved);
  }
});
test('every bundle child must pass integrity and structural checks before any tab is exposed',async()=>{
  const saved=await bundle();
  const broken=await edit(saved,b=>{b.results[2].report.modules.machine_learning.data.centers=null;});
  await assert.rejects(()=>openSavedResearch(JSON.stringify(broken)),/integrity/);
  broken.results[2].report=await edit(broken.results[2].report,()=>{});const signed=await edit(broken,()=>{});
  await assert.rejects(()=>openSavedResearch(JSON.stringify(signed)),/schema_mismatch/);
  const invalidTime=await edit(saved,b=>{b.assembled_at='2026-02-31T12:00:00Z';});await assert.rejects(()=>openSavedResearch(JSON.stringify(invalidTime)),/invalid_time/);
});
test('rehashing malformed modules cannot create renderable source, graph or model findings',async()=>{
  const saved=await report();
  for(const change of [
    r=>{r.modules.ledger.data.wallet.address='0x'+'a'.repeat(40);},
    r=>{r.modules.ledger.data.wallet.balance.base_units='1e18';},
    r=>{r.modules.graph.data.edges[0].amount='-1';},
    r=>{r.modules.analytics.data.root.reference='0x'+'a'.repeat(40);},
    r=>{r.modules.analytics.data.rows.push(r.modules.analytics.data.rows[0]);},
    r=>{delete r.modules.analytics.data.rows[1].id;delete r.modules.analytics.data.rows[1].reference;},
    r=>{r.modules.analytics.data.flows=null;},
    r=>{r.modules.machine_learning.data.k=1000000000;},
    r=>{r.modules.machine_learning.data.centers[0][0]=null;},
    r=>{r.modules.machine_learning.data.members[0].cluster=99;},
    r=>{delete r.modules.machine_learning.data.members[1].id;delete r.modules.machine_learning.data.members[1].reference;},
    r=>{r.modules.machine_learning.data.reference_cluster=99;},
    r=>{r.modules.forecast={status:'available',data:{}};},
    r=>{r.modules.score={status:'available',data:{red:100}};},
    r=>{delete r.modules.analytics;},
    r=>{r.scope.asset='ETH_ALL';},
  ])await assert.rejects(async()=>openSavedResearch(JSON.stringify(await edit(saved,change))));
});
test('malformed, unsupported, oversized or corrupt files and invalid dates are rejected',async()=>{
  const saved=await report();
  await assert.rejects(()=>openSavedResearch('{'),/invalid_json/);
  for(const raw of [null,[],{version:'bloch-address-capture-comparison/1'},{version:'private-analysis'}])await assert.rejects(()=>openSavedResearch(JSON.stringify(raw)),/unsupported/);
  await assert.rejects(()=>openSavedResearch('é'.repeat(SAVED_CAPTURE_FILE_BYTES/2+1)),/file_limit/);
  await assert.rejects(()=>openSavedResearch(JSON.stringify({...saved,coverage:'tampered'})),/integrity/);
  await assert.rejects(()=>openSavedResearch(JSON.stringify({...saved,padding:'x'.repeat(2800101)})),/response_limit/);
  for(const value of ['2026-02-31T01:00:00Z','2026-09-26T12:00:00-03:00','invalid'])await assert.rejects(async()=>openSavedResearch(JSON.stringify(await edit(saved,r=>{r.retrieved_at=value;}))),/invalid_time/);
});
test('two saved files can be compared with no live report, preserving both original captures',async()=>{
  const before=await report(),latest=await edit(before,r=>{r.retrieved_at='2026-09-27T12:00:00Z';r.modules.ledger.data.wallet.balance.base_units=(BigInt(RESEARCH_AMOUNT)+1n).toString();});
  const current=await openSavedResearch(JSON.stringify(latest)),original=JSON.stringify(current),comparison=await compareSavedCapture(JSON.stringify(before),current);
  assert.equal(comparison.balance.delta_base_units,'1');assert.equal(comparison.before.report_sha256,before.report_sha256);assert.equal(comparison.after.report_sha256,current.report_sha256);assert.equal(JSON.stringify(current),original);
});
