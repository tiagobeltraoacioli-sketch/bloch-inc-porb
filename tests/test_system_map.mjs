import test from 'node:test';
import assert from 'node:assert/strict';
import {MODULES,CONNECTIONS,ASSETS,LAYERS,matchesModule,actionLinks,effectiveAsset} from '../graphus/assets/system_modules.js';
import {evidencePacket,fetchEvidence,mergeEvidence,selectRecords,filteredEvidence,compareEvidence} from '../graphus/assets/system_evidence.js';

import {sample} from './system_map_fixture.mjs';
test('module contracts resolve every dependency and active action stays on an approved product route',()=>{
  const ids=new Set(MODULES.map(n=>n.id));assert.equal(ids.size,MODULES.length);assert.deepEqual(new Set(MODULES.map(n=>n.layer)),new Set(LAYERS));
  for(const edge of CONNECTIONS){assert.ok(ids.has(edge.from)&&ids.has(edge.to));assert.ok(edge.contract.length>10);}
  for(const node of MODULES){assert.ok(LAYERS.includes(node.layer));assert.ok(node.inputs.length&&node.outputs.length&&node.limits);assert.ok(node.assets.every(asset=>ASSETS.includes(asset)));
    for(const action of actionLinks(node,'BLCH')){const url=new URL(action.href,'https://bloch-graphus.xyz/');assert.ok(['bloch-graphus.xyz','bloch.space','rednblue.space','aml-blochinc.xyz'].includes(url.hostname));assert.equal(url.protocol,'https:');}
  }
  assert.equal(effectiveAsset(MODULES.find(n=>n.id==='usdt-source'),'BTC'),'USDT');
  assert.equal(MODULES.find(n=>n.id==='list-normal').status,'prototype');assert.equal(MODULES.find(n=>n.id==='review').status,'available');
});
test('asset, implementation and AML filters combine without exposing unrelated modules',()=>{
  const nodes=MODULES.filter(n=>matchesModule(n,{asset:'BTC',category:'aml',status:'available'}));assert.ok(nodes.length>=2);assert.ok(nodes.every(n=>n.category==='aml'&&n.status==='available'));
  assert.ok(MODULES.filter(n=>matchesModule(n,{query:'isolation'})).some(n=>n.id==='ml'));
  assert.equal(MODULES.filter(n=>matchesModule(n,{query:'<script>'})).length,0);
  assert.ok(MODULES.filter(n=>matchesModule(n,{layer:'DELIVER'})).every(n=>n.layer==='DELIVER'));
  assert.equal(MODULES.filter(n=>matchesModule(n,{layer:'SOURCE',query:'Integration API keys'})).length,0);
});
test('evidence preserves exact amounts, strips unapproved fields and exposes reproducible digests without inferred scores',async()=>{
  const raw=sample();raw.owner='PRIVATE NAME';raw.aml_score=99;raw.nodes[0].owner='PRIVATE NAME';raw.edges[0].aml_score=99;
  const packet=await evidencePacket(raw,'ETH'),again=await evidencePacket(sample(),'ETH');
  assert.equal(packet.dataset.edges[0].amount_base_units,'9007199254740993123456789');assert.equal(packet.dataset_sha256,again.dataset_sha256);
  assert.ok(!JSON.stringify(packet).includes('PRIVATE NAME'));assert.equal(packet.aml_score_included,false);assert.equal(packet.diagnostics.records,25);assert.equal(packet.diagnostics.records_without_timestamp,0);
  assert.equal(globalThis.GraphusAnalytics.fromCollection(packet).edges.length,25);
  const bloch=await evidencePacket(sample('BLCH'),'BLCH');assert.equal(bloch.diagnostics.records_without_timestamp,25);
});
test('evidence rejects mismatches, conflicting anchors, missing event IDs and synthetic source modes',async()=>{
  await assert.rejects(evidencePacket(sample(),'BTC'),/mismatch/);
  const conflict=sample();conflict.edges[0].block_hash='0x'+'f'.repeat(64);await assert.rejects(evidencePacket(conflict,'ETH'),/Conflicting/);
  const missing=sample();delete missing.edges[0].event_id;await assert.rejects(evidencePacket(missing,'ETH'),/event identity/);
  await assert.rejects(evidencePacket({...sample(),status:'synthetic'},'ETH'),/mismatch/);
  const unsafe=sample();unsafe.edges[0].amount_base_units=9007199254740992;await assert.rejects(evidencePacket(unsafe,'ETH'),/integer/);
});
test('capture uses only its fixed public endpoint, rejects source failures and bounds bytes',async()=>{
  let called;const packet=await fetchEvidence('ETH',{fetcher:async url=>{called=url;return Response.json(sample());}});assert.equal(called,'/api/chain/network?asset=ETH');assert.equal(packet.dataset.asset,'ETH');
  await assert.rejects(fetchEvidence('ETH',{fetcher:async()=>new Response('',{status:503})}),/503/);
  await assert.rejects(fetchEvidence('ETH',{fetcher:async()=>new Response('x'.repeat(3_000_001))}),/3 MB/);
  await assert.rejects(fetchEvidence('https://example.test'),/Unsupported/);
});

test('historical cursors are bounded and bound to returned anchors',async()=>{
  let url;const p=await fetchEvidence('ETH',{cursor:'99',fetcher:async path=>{url=path;return Response.json(sample('ETH',1));}});
  assert.equal(url,'/api/chain/network?asset=ETH&cursor=99');assert.equal(p.pagination.next_cursor,'98');
  await assert.rejects(evidencePacket({...sample(),next_cursor:'98'},'ETH',{cursor:'99'}),/anchor mismatch/);
  await assert.rejects(fetchEvidence('ETH',{cursor:'https://example.test'}),/Invalid source cursor/);
  const cycle=sample();cycle.next_cursor='100';await assert.rejects(evidencePacket(cycle,'ETH'),/earlier block/);
  const newer=sample();newer.edges[0].block_number=101;await assert.rejects(evidencePacket(newer,'ETH'),/newer than/);
});

test('page merges deduplicate complete events, preserve baselines and reject conflicts atomically',async()=>{
  const raw=sample('BLCH'),base=await evidencePacket(raw,'BLCH'),before=JSON.stringify(base),later=sample('BLCH',1);
  later.nodes.push(raw.nodes[2]);later.edges.push(raw.edges[0]);
  const page=await evidencePacket(later,'BLCH',{cursor:base.pagination.next_cursor}),combined=await mergeEvidence(base,page);
  assert.equal(combined.diagnostics.records,50);assert.equal(combined.diagnostics.source_pages,2);assert.equal(combined.collection.duplicate_records_omitted,1);assert.equal(JSON.stringify(base),before);
  const conflicting=structuredClone(page);conflicting.dataset.edges.at(-1).outpoint={txid:'f'.repeat(64),vout:1};await assert.rejects(mergeEvidence(base,conflicting),/Conflicting source event/);assert.equal(JSON.stringify(base),before);
  await assert.rejects(mergeEvidence(combined,page),/Unexpected source page/);
  const reorg=structuredClone(page);reorg.dataset.snapshots[0].anchor.hash='e'.repeat(64);await assert.rejects(mergeEvidence(base,reorg),/Conflicting source block/);
});

test('eight-page limit and terminal cursors work without replacing committed data',async()=>{
  let packet=await evidencePacket(sample(),'ETH');
  for(let i=1;i<8;i++)packet=await mergeEvidence(packet,await evidencePacket(sample('ETH',i),'ETH',{cursor:packet.pagination.next_cursor}));
  assert.equal(packet.pagination.next_cursor,null);assert.equal(packet.diagnostics.source_pages,8);assert.equal(packet.diagnostics.records,200);
  const copy=structuredClone(packet);copy.pagination.next_cursor='92';
  await assert.rejects(mergeEvidence(copy,await evidencePacket(sample('ETH',8),'ETH',{cursor:'92'})),/capacity/);assert.equal(packet.diagnostics.records,200);
});

test('record capacity rejects the incoming page without truncating either source page',async()=>{
  const first=sample(),second=sample('ETH',1);
  first.edges=Array.from({length:3500},(_,i)=>({...first.edges[0],event_id:`first:${i}`,position:i}));
  second.edges=Array.from({length:501},(_,i)=>({...second.edges[0],event_id:`second:${i}`,position:i}));
  const baseline=await evidencePacket(first,'ETH'),page=await evidencePacket(second,'ETH',{cursor:'99'}),digest=baseline.dataset_sha256;
  await assert.rejects(mergeEvidence(baseline,page),/capacity/);
  assert.equal(baseline.dataset_sha256,digest);assert.equal(baseline.dataset.edges.length,3500);assert.equal(page.dataset.edges.length,501);
});

test('filters compare exact integers, directions and combined bounds; subset exports retain parent lineage',async()=>{
  const raw=sample(),exact=BigInt(raw.edges[0].amount_base_units);raw.edges[0].amount_base_units=(exact+1n).toString();const packet=await evidencePacket(raw,'ETH');
  const options={minimum:(exact+1n).toString(),maxBlock:'100',minBlock:'100',query:raw.nodes[1].address.toUpperCase(),direction:'incoming',kind:'native_value'};
  const selected=selectRecords(packet,options);assert.equal(selected.rows.length,1);
  assert.equal(selectRecords(packet,{maximum:exact.toString()}).rows.length,24);
  assert.throws(()=>selectRecords(packet,{minimum:'1e10'}),/unsigned integer/);assert.throws(()=>selectRecords(packet,{minimum:'2',maximum:'1'}),/must not exceed/);
  assert.throws(()=>selectRecords(packet,{minBlock:'101',maxBlock:'100'}),/must not exceed/);assert.throws(()=>selectRecords(packet,{query:'partial',direction:'incoming'}),/exact graph reference/);
  const subset=await filteredEvidence(packet,options);assert.equal(subset.diagnostics.records,1);assert.equal(subset.selection.parent_dataset_sha256,packet.dataset_sha256);assert.equal(subset.dataset.snapshots.length,1);assert.equal(globalThis.GraphusAnalytics.fromCollection(subset).edges.length,1);
  const btc=await evidencePacket(sample('BTC'),'BTC');assert.equal(selectRecords(btc,{query:btc.dataset.nodes[0].address.toLowerCase()}).rows.length,0);assert.equal(selectRecords(btc,{query:btc.dataset.edges[0].txid.toUpperCase()}).rows.length,25);
});

test('comparison separates changed observations and disjoint sample coverage from conflicting anchors',async()=>{
  const baseline=await evidencePacket(sample(),'ETH'),extended=await mergeEvidence(baseline,await evidencePacket(sample('ETH',1),'ETH',{cursor:'99'}));
  const comparison=compareEvidence(baseline,extended);assert.deepEqual(comparison.counts,{only_current:25,only_baseline:0,changed:0,shared:25});assert.match(comparison.interpretation,/not a time-based/);
  const changed=sample();changed.edges[0].amount_base_units='1';changed.edges.splice(1,1);const diff=compareEvidence(baseline,await evidencePacket(changed,'ETH'));assert.deepEqual(diff.counts,{only_current:0,only_baseline:1,changed:1,shared:23});
  const reorg=sample();reorg.anchor.hash='0x'+'f'.repeat(64);reorg.edges.forEach(e=>e.block_hash=reorg.anchor.hash);assert.equal(compareEvidence(baseline,await evidencePacket(reorg,'ETH')).conflicting_blocks.length,1);
  assert.throws(()=>compareEvidence(baseline,{...baseline,dataset:{...baseline.dataset,asset:'BTC'}}),/different assets/);
});
