import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {sample} from './system_map_fixture.mjs';
import {evidencePacket,mergeEvidence,filteredEvidence,validateEvidenceCollection} from '../graphus/assets/system_evidence.js';
const require=createRequire(import.meta.url),I=require('../graphus/assets/network_inspector.js'),A=globalThis.GraphusAnalytics;
async function rehash(packet){packet.dataset_sha256=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(packet.dataset)))).toString('hex');return packet;}

test('saved collections round-trip all five assets, merged provenance and filtered lineage',async()=>{
  for(const asset of ['BTC','ETH','BLCH','USDT','USDC']){
    const first=await evidencePacket(sample(asset),asset),second=await evidencePacket(sample(asset,1),asset,{cursor:first.pagination.next_cursor}),full=await mergeEvidence(first,second);
    assert.deepEqual(await validateEvidenceCollection(full),full);
    const filtered=await filteredEvidence(full,{minBlock:'100',maxBlock:'100'});assert.equal(filtered.dataset.edges.length,25);assert.deepEqual(await validateEvidenceCollection(filtered),filtered);
    const clone=await validateEvidenceCollection(full);clone.dataset.edges[0].amount_base_units='1';assert.notEqual(full.dataset.edges[0].amount_base_units,'1');
  }
});
test('saved evidence rejects changed bytes, missing digests and inconsistent diagnostics',async()=>{
  const packet=await evidencePacket(sample(),'ETH'),changed=structuredClone(packet);changed.dataset.edges[0].amount_base_units='1';await assert.rejects(validateEvidenceCollection(changed),/digest mismatch/);
  await assert.rejects(validateEvidenceCollection({...packet,dataset_sha256:undefined}),/dataset digest/);
  await assert.rejects(validateEvidenceCollection({...packet,diagnostics:{...packet.diagnostics,records:999}}),/diagnostics/);
  await assert.rejects(validateEvidenceCollection({...packet,aml_score_included:true}),/metadata/);
  await assert.rejects(validateEvidenceCollection({...packet,private_label:'unapproved'}),/Unexpected packet/);
});
test('a matching digest does not bypass source, event and snapshot validation',async()=>{
  const packet=await evidencePacket(sample(),'ETH');
  const unexpected=structuredClone(packet);unexpected.dataset.nodes[0].owner='UNAPPROVED TEST LABEL';await assert.rejects(validateEvidenceCollection(await rehash(unexpected)),/Unexpected or invalid/);
  const mismatch=structuredClone(packet);mismatch.dataset.network='another-network';await assert.rejects(validateEvidenceCollection(await rehash(mismatch)),/mismatch/);
  const snapshots=structuredClone(packet);snapshots.dataset.snapshots[0].source='another-source';await assert.rejects(validateEvidenceCollection(await rehash(snapshots)),/snapshot/);
  const counts=structuredClone(packet);counts.dataset.snapshots[0].records=0;await assert.rejects(validateEvidenceCollection(await rehash(counts)),/cannot cover/);
  const anchors=structuredClone(packet);anchors.dataset.snapshots[0].anchor={...anchors.dataset.snapshots[0].anchor,hash:'0x'+'f'.repeat(64)};await assert.rejects(validateEvidenceCollection(await rehash(anchors)),/anchor differs/);
  const invalid=structuredClone(packet);invalid.dataset.edges[0].position=-1;await assert.rejects(validateEvidenceCollection(await rehash(invalid)),/invalid.*event/);
});
test('filtered imports enforce saved filters and reject extension metadata',async()=>{
  const packet=await filteredEvidence(await evidencePacket(sample(),'ETH'),{minBlock:'100'});
  await assert.rejects(validateEvidenceCollection({...packet,pagination:{next_cursor:'99',requested_cursors:[null]}}),/pagination/);
  const altered=structuredClone(packet);altered.selection.filters.minBlock='101';await assert.rejects(validateEvidenceCollection(altered),/saved filters/);
  const invalid=structuredClone(packet);invalid.selection.filters.minimum='1e3';await assert.rejects(validateEvidenceCollection(invalid),/unsigned integer/);
});
test('saved evidence bounds pages and files while allowing empty source observations',async()=>{
  const packet=await evidencePacket(sample(),'ETH');
  const pages=structuredClone(packet);pages.dataset.snapshots=Array(9).fill(pages.dataset.snapshots[0]);await assert.rejects(validateEvidenceCollection(pages),/eight source snapshots/);
  await assert.rejects(validateEvidenceCollection({...packet,padding:'x'.repeat(6_000_001)}),/6 MB/);
  const empty=await evidencePacket({...sample(),edges:[],nodes:[]},'ETH');assert.deepEqual(await validateEvidenceCollection(empty),empty);
});
test('reference details count unique incident records, self references and exact amounts separately',()=>{
  const raw=sample();raw.edges=raw.edges.slice(0,3);raw.edges[1].from=raw.nodes[1].id;raw.edges[1].to=raw.nodes[0].id;raw.edges[2].to=raw.nodes[0].id;delete raw.edges[2].block_time;
  const info=I.inspect(A.normalize(raw),raw.nodes[0].id);
  assert.equal(info.records,3);assert.equal(info.self_records,1);assert.equal(info.records_without_timestamp,1);assert.equal(info.peers.length,1);assert.equal(info.peers[0].records,2);
  assert.deepEqual(info.groups.map(g=>[g.direction,g.base_units]),[['incoming','9007199254740993123456789'],['outgoing','9007199254740993123456789'],['self','9007199254740993123456789']]);
  const bloch=sample('BLCH'),utxo=I.inspect(A.normalize(bloch),bloch.nodes[2].id);assert.equal(utxo.groups[0].kind,'observed_created_output');assert.equal(utxo.groups[0].base_units,(25n*9007199254740993123456789n).toString());assert.equal(utxo.records_without_timestamp,25);
  assert.throws(()=>I.inspect(A.normalize(raw),'missing'),/Unknown/);
});
test('reference search preserves Bitcoin base58 case and accepts EVM address case',()=>{
  const btc=A.normalize(sample('BTC')).nodes[0],eth=A.normalize(sample()).nodes[0];assert.equal(I.matches(btc,btc.label,'BTC'),true);assert.equal(I.matches(btc,btc.label.toLowerCase(),'BTC'),false);assert.equal(I.matches(eth,eth.label.toUpperCase(),'ETH'),true);
});
