import test from 'node:test';
import assert from 'node:assert/strict';
import {MODULES,CONNECTIONS,ASSETS,LAYERS,matchesModule,actionLinks,effectiveAsset} from '../graphus/assets/system_modules.js';
import {evidencePacket,fetchEvidence} from '../graphus/assets/system_evidence.js';

import {sample} from './system_map_fixture.mjs';
test('module contracts resolve every dependency and active action stays on an approved product route',()=>{
  const ids=new Set(MODULES.map(n=>n.id));assert.equal(ids.size,MODULES.length);assert.deepEqual(new Set(MODULES.map(n=>n.layer)),new Set(LAYERS));
  for(const edge of CONNECTIONS){assert.ok(ids.has(edge.from)&&ids.has(edge.to));assert.ok(edge.contract.length>10);}
  for(const node of MODULES){assert.ok(LAYERS.includes(node.layer));assert.ok(node.inputs.length&&node.outputs.length&&node.limits);assert.ok(node.assets.every(asset=>ASSETS.includes(asset)));
    for(const action of actionLinks(node,'BLCH')){const url=new URL(action.href,'https://bloch-graphus.xyz/');assert.ok(['bloch-graphus.xyz','bloch.space','rednblue.space','aml-blochinc.xyz'].includes(url.hostname));assert.equal(url.protocol,'https:');}
  }
  assert.equal(effectiveAsset(MODULES.find(n=>n.id==='usdt-source'),'BTC'),'USDT');
  assert.equal(MODULES.find(n=>n.id==='list-normal').status,'prototype');assert.equal(MODULES.find(n=>n.id==='review').status,'design');
});
test('asset, implementation and AML filters combine without exposing unrelated modules',()=>{
  const nodes=MODULES.filter(n=>matchesModule(n,{asset:'BTC',category:'aml',status:'available'}));assert.ok(nodes.length>=2);assert.ok(nodes.every(n=>n.category==='aml'&&n.status==='available'));
  assert.ok(MODULES.filter(n=>matchesModule(n,{query:'isolation'})).some(n=>n.id==='ml'));
  assert.equal(MODULES.filter(n=>matchesModule(n,{query:'<script>'})).length,0);
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
