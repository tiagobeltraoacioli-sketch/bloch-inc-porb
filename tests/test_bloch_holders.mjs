import test from 'node:test';
import assert from 'node:assert/strict';
import {queryBlochHolders} from '../graphus/chain/bloch-holders.js';

const first='a'.repeat(64), second='b'.repeat(64), tip='c'.repeat(64);
const holders={
  holders:[
    {rank:1,script_hash:first,balance_sat:'90',utxo_count:2},
    {rank:2,script_hash:second,balance_sat:'10',utxo_count:1},
  ],returned:2,total_script_hashes_with_balance:2,indexed_total_sat:'100',
  as_of_height:100,as_of_slot:120,chain_tip:tip,
};
const health={ok:true,live_head_available:true,lag_slots:0,
  verification:'consensus replay and state-root verification',
  indexed_to_height:100,indexed_to_slot:120,chain_tip:tip,source:'archival-1'};
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});

test('ranked Bloch scripts require a matching source anchor and indexed total',async()=>{
  const fetcher=url=>Promise.resolve(response(url.includes('/holders?')?holders:health));
  const result=await queryBlochHolders({fetcher,now:()=>new Date('2026-09-24T12:00:00Z')});
  assert.equal(result.status,200);
  assert.equal(result.body.coverage.positive_script_hashes_in_index,2);
  assert.equal(result.body.anchor.block_id,tip);
  assert.deepEqual(result.body.holders.map(row=>row.balance_sat),['90','10']);
  assert.equal(result.body.independent_verification,false);
});

test('moving source tip fails closed after a second check',async()=>{
  let calls=0;
  const fetcher=url=>{calls++;return Promise.resolve(response(url.includes('/holders?')?holders:{...health,chain_tip:first}));};
  const result=await queryBlochHolders({fetcher});
  assert.equal(result.status,503);
  assert.equal(result.body.error,'bloch_indexer_anchor_changed');
  assert.equal(calls,4);
});

test('inconsistent indexed balance totals are rejected',async()=>{
  const fetcher=url=>Promise.resolve(response(url.includes('/holders?')?{...holders,indexed_total_sat:'101'}:health));
  const result=await queryBlochHolders({fetcher});
  assert.equal(result.status,503);
});
