import assert from 'node:assert/strict';
import test from 'node:test';
import {compareAddressReports} from '../space/public/assets/address-research-comparison.js';
import {researchHash} from '../space/public/assets/address-research-core.js';
import {researchReport} from './address_research_fixture.js';
const report=async(asset='USDT',options={})=>(await researchReport(asset,options)).body;
async function edit(raw,fn){const copy=structuredClone(raw);delete copy.report_sha256;fn(copy);return {...copy,report_sha256:await researchHash(copy)};}
test('capture comparison preserves exact signed balance differences, provenance and report integrity',async()=>{
 const before=await report(),after=await edit(before,r=>{r.modules.ledger.data.wallet.balance.base_units='1';r.retrieved_at='2026-09-27T04:00:00Z';}),copy=JSON.stringify(before),result=await compareAddressReports(before,after);
 assert.equal(result.balance.delta_base_units,(1n-BigInt(before.modules.ledger.data.wallet.balance.base_units)).toString());assert.equal(result.before.report_sha256,before.report_sha256);assert.equal(result.after.report_sha256,after.report_sha256);assert.equal(result.graph.unchanged,before.modules.graph.data.edges.length);assert.equal(JSON.stringify(before),copy);
 const {comparison_sha256,...body}=result;assert.equal(await researchHash(body),comparison_sha256);assert.match(result.coverage,/not complete chain activity/);assert.ok(!Object.hasOwn(result,'scores'));
});
test('capture comparison distinguishes missing, changed and unchanged source records without treating recapture UUIDs as new activity',async()=>{
 const before=await report(),after=await edit(before,r=>{const g=r.modules.graph.data;g.edges.shift();g.edges[0].amount='3';g.edges.push({...g.edges[1],id:'new-source-record'});g.observations[0].id='new-capture';g.observations[0].at='2026-09-27T04:00:00Z';for(const e of g.edges)e.sources=['new-capture'];});
 const comparison=await compareAddressReports(before,after),g=comparison.graph;
 assert.equal(g.only_before.length,1);assert.equal(g.only_after.length,1);assert.equal(g.changed.length,1);assert.equal(g.changed[0].after.amount_base_units,'3');assert.equal(g.unchanged,before.modules.graph.data.edges.length-2);assert.notEqual(g.before.observations[0].id,g.after.observations[0].id);
});
test('unavailable modules remain unavailable, native ETH is explicit, and UTXO event types remain separate',async()=>{
 const before=await report(),partial=await report('USDT',{graphUnavailable:true}),result=await compareAddressReports(before,partial);assert.equal(result.graph.status,'unavailable');assert.equal(result.balance.status,'available');assert.equal(result.availability.find(m=>m.module==='graph').after,'unavailable');
 const eth=await report('ETH');assert.equal((await compareAddressReports(eth,eth)).graph.status,'unavailable');
 const btc=await report('BTC'),changed=await edit(btc,r=>{r.modules.graph.data.edges[0].amount='1';});assert.equal((await compareAddressReports(btc,changed)).graph.changed[0].after.kind,'input');
 const unavailable=await report('USDT',{ledgerUnavailable:true});assert.equal((await compareAddressReports(before,unavailable)).balance.status,'unavailable');
});
test('mismatched scope, altered hashes, invalid graphs and incompatible balance units cannot create comparisons',async()=>{
 const before=await report();
 await assert.rejects(()=>compareAddressReports(before,{...before,retrieved_at:'edited'}),/integrity/);
 await assert.rejects(()=>compareAddressReports(before,{}));
 const other=await report('USDC');await assert.rejects(()=>compareAddressReports(before,other),/scope_mismatch/);
 const invalid=await edit(before,r=>{r.modules.graph.data.edges[0].amount='1e18';});await assert.rejects(()=>compareAddressReports(before,invalid),/Invalid evidence/);
 const incompatible=await edit(before,r=>{r.modules.ledger.data.wallet.balance.unit='different unit';});assert.equal((await compareAddressReports(before,incompatible)).balance.status,'unavailable');
 const missingUnit=await edit(before,r=>{r.modules.ledger.data.wallet.balance.unit='';});assert.equal((await compareAddressReports(missingUnit,missingUnit)).balance.status,'unavailable');
});
