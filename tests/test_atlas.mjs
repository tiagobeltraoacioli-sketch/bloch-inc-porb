import test from 'node:test';
import assert from 'node:assert/strict';
import {sample} from './system_map_fixture.mjs';
import {evidencePacket,mergeEvidence} from '../graphus/assets/system_evidence.js';
import {analyzeAtlas,atlasCsv} from '../graphus/assets/atlas_engine.js';
import {atlasSchema,FIELDS} from '../graphus/assets/atlas_registry.js';
import {regression,evaluateHoldout,distributionDrift} from '../graphus/assets/atlas_statistics.js';
import {atlasPublicRoute} from '../graphus/chain/atlas-api.js';

const now='2026-09-25T12:00:00Z';
const packet=async(asset='ETH')=>evidencePacket(sample(asset),asset);
test('84 executable fields cover all five assets with exact typed amounts, provenance and explicit protected states',async()=>{
  assert.equal(FIELDS.length,84);assert.equal(new Set(FIELDS.map(f=>f.name)).size,84);
  for(const asset of Object.keys(atlasSchema().assets)){
    const p=await packet(asset),r=await analyzeAtlas(p,{now});assert.equal(Object.keys(r.fields).length,84);assert.equal(r.records.length,25);
    assert.equal(r.fields.volume_by_asset.value.groups[0].base_units,String(25n*9007199254740993123456789n));
    assert.equal(r.fields.snapshot_digest.value.dataset_sha256,p.dataset_sha256);
    assert.equal(r.fields.aml_score.state,'gated');assert.equal(r.fields.private_annotation.state,'private');assert.equal(r.fields.private_annotation.value,null);
    assert.equal(r.fields.contract_address.state,['USDT','USDC'].includes(asset)?'available':'not_applicable');
    assert.equal(r.fields.asset_decimals.value,{BTC:8,ETH:18,USDT:6,USDC:6,BLCH:8}[asset]);
    assert.deepEqual(r,await analyzeAtlas(p,{now}));assert.match(atlasCsv(r),/"amount_raw"/);
    if(asset==='BLCH'){assert.equal(r.daily.length,0);assert.equal(r.fields.activity_1h_24h_7d.state,'unavailable');assert.equal(r.observation.records_without_timestamp,25);}
  }
});
test('directed paths, fan counts, strictly chronological cycles and dwell retain event evidence',async()=>{
  const raw=sample(),[a,b]=raw.nodes,c={id:'ETH:address:0x'+'e'.repeat(40),kind:'address',address:'0x'+'e'.repeat(40)};raw.nodes.push(c);
  raw.edges=raw.edges.slice(0,4).map((e,i)=>({...e,from:[a,b,c,b][i].id,to:[b,c,a,a][i].id,amount_base_units:String(i+1),block_time:`2026-09-24T0${i+1}:00:00Z`}));
  const r=await analyzeAtlas(await evidencePacket(raw,'ETH'),{reference:a.address,now});
  assert.equal(r.fields.counterparty_count.value.count,2);assert.equal(r.fields.inbound_outbound_count.value.incoming,2);
  assert.equal(r.fields.path_hop_count.value.reachable.find(n=>n.id===c.id).hops,2);
  assert.ok(r.fields.cycle_candidate.value.candidates.some(p=>p.hops===3));
  const reversed=structuredClone(raw);reversed.edges.forEach((e,i)=>e.block_time=`2026-09-24T0${4-i}:00:00Z`);
  assert.equal((await analyzeAtlas(await evidencePacket(reversed,'ETH'),{reference:a.id,now})).fields.cycle_candidate.value.candidates.length,0);
  const rb=await analyzeAtlas(await evidencePacket(raw,'ETH'),{reference:b.id,now});
  assert.equal(rb.fields.dwell_time.value.n,2);assert.equal(rb.fields.pass_through_candidate.value.total,1);
});
test('time bands are disjoint, same-transaction logs do not create gaps, and missing days never become zero observations',async()=>{
  const raw=sample();raw.edges=raw.edges.slice(0,6);
  const dates=['2026-09-18T00:00:00Z','2026-09-24T00:00:00Z','2026-09-24T23:00:00Z','2026-09-24T23:30:00Z','2026-09-25T00:00:00Z',null];
  raw.edges.forEach((e,i)=>{if(dates[i])e.block_time=dates[i];else delete e.block_time;});
  const r=await analyzeAtlas(await evidencePacket(raw,'ETH'),{now,end:'2026-09-25T00:00:00Z'});
  assert.deepEqual(r.fields.activity_1h_24h_7d.value.bands.map(b=>b.count),[2,1,1]);
  assert.equal(r.fields.activity_1h_24h_7d.value.outside_bands,1);assert.equal(r.observation.excluded_missing_timestamps,1);
  assert.equal(r.daily.find(d=>d.day==='2026-09-20').events,null);assert.equal(r.daily.find(d=>d.day==='2026-09-20').exact_totals,null);
  assert.equal(r.fields.fit_diagnostics.value.n,3);
  const zero=sample();zero.edges.forEach(e=>e.amount_base_units='0');const z=await analyzeAtlas(await evidencePacket(zero,'ETH'),{now});
  assert.equal(z.fields.value_concentration.value[0].largest_event_share,null);assert.equal(z.daily[0].exact_totals[0].base_units,'0');
});
test('UTXO types, reference case, empty selections and missing time filters preserve semantics',async()=>{
  const p=await packet('BTC');const address=p.dataset.nodes[1].address;
  const r=await analyzeAtlas(p,{reference:address,now});assert.equal(r.fields.dwell_time.state,'not_applicable');assert.equal(r.fields.counterparty_count.value.semantics,'adjacent transaction references');
  await assert.rejects(analyzeAtlas(p,{reference:address.toLowerCase()}),/Reference is not present/);
  const empty=await analyzeAtlas(p,{minimum:'999999999999999999999999999999',now});assert.equal(empty.records.length,0);assert.ok(empty.fields.data_quality_flags.value.includes('empty_selection'));
  const noTime=await analyzeAtlas(await packet('BLCH'),{start:'2026-09-24T00:00:00Z',now});assert.equal(noTime.records.length,0);assert.equal(noTime.observation.excluded_missing_timestamps,25);
});
test('retained head observations support honest sampling lag and BTC capture depths; pinned contracts cannot drift',async()=>{
  const raw=sample('BTC');Object.assign(raw.scope,{source_head_height:105,source_head_hash:'f'.repeat(64),source_head_kind:'best-chain',adapter_version:'graphus-network-1.1.0'});
  const r=await analyzeAtlas(await evidencePacket(raw,'BTC'),{now});assert.equal(r.fields.source_lag.value.blocks,5);assert.equal(r.fields.confirmations.value.minimum_at_capture,6);assert.equal(r.fields.confirmations.value.current_depth,null);
  assert.deepEqual(r.fields.parse_version.value.source_adapters,['graphus-network-1.1.0']);
  const token=sample('USDT');token.scope.contract='0x'+'1'.repeat(40);await assert.rejects(analyzeAtlas(await evidencePacket(token,'USDT')),/pinned asset/);
  await assert.rejects(analyzeAtlas(await packet(),{start:'2026-02-30T00:00:00Z'}),/valid ISO UTC/);
});
test('baseline detects conflicts without asserting a canonical reorg and input digests cannot be forged',async()=>{
  const p=await packet(),r=await analyzeAtlas(p,{baseline:p,now});assert.equal(r.comparison.counts.shared,25);assert.equal(r.drift.psi,0);
  const newer=sample();newer.anchor.hash='0x'+'1'.repeat(64);newer.edges.forEach(e=>e.block_hash=newer.anchor.hash);
  const conflict=await analyzeAtlas(await evidencePacket(newer,'ETH'),{baseline:p,now});assert.equal(conflict.comparison.conflicting_blocks.length,1);assert.equal(conflict.fields.reorg_revision.value.canonical_revision,null);
  const tampered=structuredClone(p);tampered.dataset.edges[0].amount_base_units='1';await assert.rejects(analyzeAtlas(tampered),/digest mismatch/);
  await assert.rejects(analyzeAtlas(p,{start:'2026-09-26T00:00:00Z',end:'2026-09-20T00:00:00Z'}),/Start/);
  await assert.rejects(analyzeAtlas(p,{unknown:true}),/Unexpected/);
  const merged=await mergeEvidence(p,await evidencePacket(sample('ETH',1),'ETH',{cursor:'99'}));assert.equal((await analyzeAtlas(merged,{now})).provenance.snapshots.length,2);
});
test('regression reports residual uncertainty, constant responses and conservative intervals',()=>{
  const r=regression([{x:0,y:1},{x:1,y:3},{x:2,y:5}]);assert.equal(r.slope,2);assert.equal(r.intercept,1);assert.equal(r.r_squared,1);assert.equal(r.slope_interval_95.lower,2);
  assert.equal(regression([{x:0,y:2},{x:1,y:2},{x:2,y:2}]).r_squared,null);
  assert.equal(regression([{x:0,y:1}]).available,false);assert.equal(distributionDrift([1,2,3],[1,2,3]).psi,0);
});
const evaluation=()=>({schema_version:1,label_origin:'synthetic',model_version:'test-model',training_cutoff:'2026-01-01T00:00:00Z',training_entities:['train'],review_capacity:2,threshold:.5,rows:[.9,.8,.4,.1].map((probability,i)=>({id:String(i),entity:`test-${i}`,observed_at:'2026-01-02T00:00:00Z',probability,label:[1,0,1,0][i]}))});
test('holdout evaluation computes review precision, error burden and calibration without releasing an AML model',()=>{
  const e=evaluateHoldout(evaluation());assert.equal(e.precision_at_review_capacity.precision,.5);assert.equal(e.recall_and_false_positive_rate.recall,.5);assert.equal(e.recall_and_false_positive_rate.false_positive_rate,.5);assert.ok(Math.abs(e.calibration_and_drift.brier_score-.255)<1e-10);assert.equal(e.release_approved,false);
  for(const change of [e=>e.rows[0].entity='train',e=>e.rows[0].observed_at=e.training_cutoff,e=>e.rows[0].probability=1.1,e=>e.rows[0].id=e.rows[1].id,e=>e.review_capacity=5]){const bad=evaluation();change(bad);assert.throws(()=>evaluateHoldout(bad));}
  const absent=evaluation();absent.rows.forEach(r=>r.label=1);assert.equal(evaluateHoldout(absent).recall_and_false_positive_rate.false_positive_rate,null);
});
test('public API bounds parameters before fetch, supports schema/CORS and preserves upstream failures',async()=>{
  let calls=0;const graph=async()=>{calls++;return {status:200,body:sample()};};
  const req=(q,method='GET')=>new Request('https://example.test/api/atlas/analyze'+q,{method});
  for(const q of ['?asset=SOL','?asset=ETH&asset=BTC','?asset=ETH&max_hops=99','?asset=ETH&url=http://bad','?asset=ETH&minimum=-1','?asset=ETH&kind=created_output','?asset=ETH&start=yesterday'])assert.equal((await atlasPublicRoute('atlas/analyze',req(q),graph)).status,400);
  assert.equal(calls,0);const response=await atlasPublicRoute('atlas/analyze',req('?asset=ETH'),graph);assert.equal(response.status,200);assert.equal((await response.json()).records.length,25);
  assert.equal((await atlasPublicRoute('atlas/analyze',req('?asset=ETH','POST'),graph)).status,405);
  assert.equal((await atlasPublicRoute('atlas/analyze',req('','OPTIONS'),graph)).status,204);
  assert.equal((await atlasPublicRoute('atlas/schema',req(''),graph)).headers.get('access-control-allow-origin'),'*');
  assert.equal((await atlasPublicRoute('atlas/analyze',req('?asset=ETH'),async()=>({status:503,body:{error:'source_unavailable'}}))).status,503);
});
