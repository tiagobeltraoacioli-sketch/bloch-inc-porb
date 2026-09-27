import assert from 'node:assert/strict';
import test from 'node:test';
import {createAddressEvidence,evidenceConnectionKey,ADDRESS_EVIDENCE_VERSION} from '../space/public/assets/address-evidence.js';
import {researchReport,researchFixture,RESEARCH_AMOUNT} from './address_research_fixture.js';
import {handleResearch} from '../space/chain/address-research.js';
import {verifyResearch} from '../space/public/assets/address-research-core.js';
async function custom(fixture){const url=new URL('https://bloch.space/api/research?'+new URLSearchParams({network:fixture.network,asset:fixture.asset,query:fixture.reference}));const result=await handleResearch(url,{explore:async()=>({status:200,body:fixture.data}),graph:async()=>({status:200,body:fixture.graph})});assert.equal(result.status,200);return verifyResearch(result.body);}
const report=async(asset='USDT',options={})=>verifyResearch((await researchReport(asset,options)).body);

test('address evidence keeps exact typed directional connections and self events without double counting',async()=>{
  const original=await report('USDT',{fanout:true,repeated:15,self:true}),before=JSON.stringify(original),model=createAddressEvidence(original),view=model.query();
  assert.equal(view.version,ADDRESS_EVIDENCE_VERSION);assert.equal(view.summary.matching_events,27);assert.equal(view.summary.self,1);assert.equal(view.summary.outgoing,26);assert.equal(view.summary.incoming,0);assert.equal(view.summary.neighbors,11);
  assert.equal(view.connections.find(c=>c.events===16).amount_base_units,(BigInt(RESEARCH_AMOUNT)*16n).toString());
  assert.equal(view.connections.find(c=>c.direction==='self').amount_base_units,'0');assert.equal(view.events.filter(e=>e.id==='self-event').length,1);
  assert.equal(model.query({direction:'self'}).summary.matching_events,1);assert.equal(model.query({direction:'outgoing'}).summary.matching_events,26);
  assert.equal(model.query({minimum:(BigInt(RESEARCH_AMOUNT)+1n).toString()}).events.length,0);assert.equal(model.query({minimum:RESEARCH_AMOUNT}).events.length,26);assert.equal(JSON.stringify(original),before);
});
test('evidence focus traverses UTXO transaction boundaries without inventing direct address transfers',async()=>{
  for(const asset of ['BTC','BLCH']){
    const model=createAddressEvidence(await report(asset)),root=model.query(),event=root.events[0],transaction=model.query({focus:event.to});
    assert.equal(root.focus.kind,asset==='BTC'?'address':'script');assert.equal(root.summary.outgoing,7);assert.ok(root.connections.every(c=>c.kind==='input'&&c.from===root.focus.id));
    assert.equal(transaction.focus.kind,'transaction');assert.equal(transaction.summary.incoming,1);assert.equal(transaction.summary.outgoing,1);assert.deepEqual(transaction.totals.map(t=>t.kind),['input','output']);
    const output=transaction.events.find(e=>e.kind==='output');assert.equal(model.query({focus:output.to,direction:'incoming'}).events[0].kind,'output');
    assert.throws(()=>model.query({kind:'erc20_transfer'}));
  }
});
test('block bounds exclude unknown heights explicitly; filters combine without broadening the source',async()=>{
  const model=createAddressEvidence(await report('USDC',{self:true}));
  assert.equal(model.query().summary.unknown_block_events,1);assert.equal(model.query({min_block:100,max_block:'100'}).summary.matching_events,7);
  assert.equal(model.query({min_block:101}).events.length,0);assert.equal(model.query({max_block:99}).events.length,0);
  const event=model.query().events[0];assert.equal(model.query({search:event.txid.toUpperCase(),kind:'erc20_transfer',direction:'outgoing',minimum:RESEARCH_AMOUNT}).events.length,1);
  assert.equal(model.query({search:' absent '}).events.length,0);
  for(const bad of [{focus:'unobserved'},{direction:'both'},{minimum:'1.2'},{minimum:'1e3'},{minimum:0},{minimum:'-1'},{minimum:'01'},{min_block:-1},{min_block:'1.5'},{min_block:'9007199254740992'},{min_block:101,max_block:100},{search:'x'.repeat(201)},{cursor:'unbounded'}])assert.throws(()=>model.query(bad));
});
test('all-page and connection CSV preserve filters, source observations and the original report digest',async()=>{
  const original=await report('USDT',{count:36,fanout:true,repeated:21}),model=createAddressEvidence(original),view=model.query(),csv=model.csv();
  assert.equal(view.events.length,56);assert.equal(view.connections.length,35);assert.equal(csv.split('\r\n').length,57);assert.match(csv,new RegExp(original.report_sha256));assert.match(csv,/synthetic-address-research/);assert.match(csv,/2026-09-26T12:00:00Z/);assert.match(csv,/SYNTHETIC ADDRESS RESEARCH FIXTURE/);
  const connection=view.connections.find(c=>c.events===22),one=model.csv({},connection.key);assert.equal(one.split('\r\n').length,23);assert.ok(view.events.filter(e=>evidenceConnectionKey(e)===connection.key).every(e=>one.includes('"'+e.id+'"')));
  const filtered=model.csv({search:'repeated-'});assert.equal(filtered.split('\r\n').length,22);assert.match(filtered,/"repeated-"/);assert.equal(model.csv({minimum:'9'.repeat(99)}).split('\r\n').length,1);
  assert.throws(()=>model.csv({direction:'incoming'},connection.key),/no longer/);
});
test('CSV quotes hostile source values and formula prefixes without altering source evidence',async()=>{
  const fixture=researchFixture('USDT');fixture.graph.edges[0].id='=HYPERLINK("https://example.test","x")';fixture.graph.edges[0].finality='line one,\nline "two"';
  const original=await custom(fixture),model=createAddressEvidence(original),view=model.query({search:'=hyperlink'}),csv=model.csv({search:'=hyperlink'});
  assert.equal(view.events.length,1);assert.equal(view.events[0].id,fixture.graph.edges[0].id);assert.ok(csv.includes('"\'=hyperlink"'));assert.ok(csv.includes('"\'=HYPERLINK(""https://example.test"",""x"")"'));assert.ok(csv.includes('"line one,\nline ""two"""'));
});
test('view snapshots survive caller edits and fail closed on corrupt or mismatched graph scope',async()=>{
  const original=await report(),model=createAddressEvidence(original),before=model.csv();original.modules.graph.data.edges[0].amount='1';original.scope.asset='USDC';original.report_sha256='0'.repeat(64);assert.equal(model.csv(),before);
  assert.throws(()=>createAddressEvidence(original),/does not match/);
  const native=await report('ETH');assert.throws(()=>createAddressEvidence(native),/unavailable/);
  const corrupt=await report();corrupt.modules.graph.data.edges[0].sources=['unknown'];assert.throws(()=>createAddressEvidence(corrupt),/provenance/);
  const empty=createAddressEvidence(await report('BLCH',{count:1}));assert.equal(empty.query().events.length,0);assert.equal(empty.csv().split('\r\n').length,1);
});
test('large provenance exports fail as a whole at the CSV limit and remain usable with a narrower query',async()=>{
  const fixture=researchFixture('USDT',{repeated:4000});fixture.graph.observations[0].anchor={source_note:'x'.repeat(3800)};
  const model=createAddressEvidence(await custom(fixture));assert.throws(()=>model.csv(),/exceeds 16 MB/);assert.equal(model.csv({search:'event-1'}).split('\r\n').length,2);
});
