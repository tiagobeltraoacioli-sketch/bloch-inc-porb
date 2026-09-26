import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceProfile,balanceProfile} from '../graphus/assets/evidence_profile.js';
import {sample} from './system_map_fixture.mjs';
test('all five evidence profiles preserve exact typed amounts and missing time instead of inventing chronology',()=>{
  for(const asset of ['BTC','ETH','USDT','USDC','BLCH']){
    const graph=sample(asset),profile=evidenceProfile(graph);assert.equal(profile.records,graph.edges.length);
    for(const group of profile.record_types)assert.equal(group.base_units,String(graph.edges.filter(e=>e.kind===group.kind).reduce((n,e)=>n+BigInt(e.amount_base_units),0n)));
    assert.equal(profile.temporal.records_without_timestamp,asset==='BLCH'?graph.edges.length:0);
    if(asset==='BLCH')assert.equal(profile.temporal.first_observed_at,null);
    assert.deepEqual(profile,evidenceProfile({...graph,nodes:graph.nodes.slice().reverse(),edges:graph.edges.slice().reverse()}));
  }
  const graph=sample('ETH');graph.edges[0].block_number=104;graph.edges[1].block_time=null;graph.edges[2].amount_base_units='0';const profile=evidenceProfile(graph);
  assert.equal(profile.blocks.heights_without_records,3);assert.equal(profile.structure.zero_amount_records,1);assert.equal(profile.temporal.records_without_timestamp,1);
});
test('balance sample metrics retain precision and distinguish shared anchors, zero totals and incomparable units',()=>{
  const hash='a'.repeat(64),record={asset:'ETH',network:'ethereum-mainnet',decimals:18,unit:'wei',block:{height:100,hash},retrievedAt:'2026-09-25T00:00:00Z'};
  const records=[{...record,baseUnits:'90071992547409930000'},{...record,baseUnits:'30023997515803310000'}],p=balanceProfile(records);
  assert.equal(p.total_base_units,'120095990063213240000');assert.equal(p.largest_share,.75);assert.equal(p.concentration_hhi,.625);assert.equal(p.shared_block_anchor,true);
  assert.equal(balanceProfile([{...records[0],block:null},records[1]]).shared_block_anchor,false);
  assert.equal(balanceProfile([{...record,baseUnits:'0'}]).concentration_hhi,null);
  assert.throws(()=>balanceProfile([records[0],{...records[1],asset:'USDT'}]),/share asset/);
});
