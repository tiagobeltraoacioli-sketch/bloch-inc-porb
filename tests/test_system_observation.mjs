import test from 'node:test';
import assert from 'node:assert/strict';
import {sample} from './system_map_fixture.mjs';
import {evidencePacket,mergeEvidence} from '../graphus/assets/system_evidence.js';
import {MODULES,ASSETS} from '../graphus/assets/system_modules.js';
import {summarizeSample,sampleForModule,supportsCapturedSample} from '../graphus/assets/system_observation.js';
const module=id=>MODULES.find(node=>node.id===id);

test('observation summaries preserve committed source metadata and do not expose mutable datasets',async()=>{
  assert.equal(summarizeSample(null),null);
  for(const asset of ASSETS){
    const first=await evidencePacket(sample(asset),asset),second=await evidencePacket(sample(asset,1),asset,{cursor:first.pagination.next_cursor});
    const packet=await mergeEvidence(first,second),summary=summarizeSample(packet);
    assert.equal(summary.asset,asset);assert.equal(summary.records,50);assert.equal(summary.pages,2);
    assert.equal(summary.missing_timestamps,asset==='BLCH'?50:0);
    assert.equal(summary.dataset_sha256,packet.dataset_sha256);
    assert.equal(summary.source,packet.dataset.source);assert.equal(summary.retrieved_at,packet.dataset.retrieved_at);
    assert.equal(summary.anchor.hash,packet.dataset.anchor.hash);assert.equal(summary.anchor.height,packet.dataset.anchor.height);
    assert.equal(summary.nodes,undefined);assert.equal(summary.edges,undefined);
    summary.anchor.hash='changed';assert.notEqual(packet.dataset.anchor.hash,'changed');
  }
});

test('sample context respects asset selection and excludes private, unrelated and research modules',async()=>{
  for(const asset of ASSETS){
    const observation={phase:'ready',sample:summarizeSample(await evidencePacket(sample(asset),asset))};
    assert.equal(sampleForModule(module('events'),observation,asset)?.asset,asset);
    assert.equal(sampleForModule(module(`${asset.toLowerCase()}-source`),observation)?.asset,asset);
    assert.equal(sampleForModule(module('events'),observation,ASSETS.find(other=>other!==asset)),null);
    for(const id of ['ml','scores','blue','official-source','list-normal','balances','review','api-keys','space-source'])assert.equal(sampleForModule(module(id),observation),null,id);
    for(const node of MODULES.filter(node=>!node.assets.includes(asset)))assert.equal(sampleForModule(node,observation),null);
    // Failed/canceled continuation preserves a committed page without claiming a successful refresh.
    assert.equal(sampleForModule(module('quality'),{...observation,phase:'error'}).dataset_sha256,observation.sample.dataset_sha256);
    assert.equal(sampleForModule(module('quality'),{...observation,phase:'canceled'}).records,25);
  }
  assert.equal(supportsCapturedSample(module('ml')),false);
  assert.equal(sampleForModule(module('events'),{phase:'collecting',sample:null}),null);
});
