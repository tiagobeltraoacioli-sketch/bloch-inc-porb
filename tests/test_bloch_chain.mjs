import assert from 'node:assert/strict';
import test from 'node:test';
import {queryBlochScriptHash} from '../graphus/chain/bloch-chain.js';
import {queryChainWallet} from '../graphus/chain/real-chain.js';

const hash='4cc4f2fc217206107ccecf277663678b9fce6891000000000000000000000000';
const txid='a'.repeat(64);
const head={slot:100,height:80,finalized_height:70,state_root:'b'.repeat(64)};
const observed=new Date('2026-09-23T12:00:00.000Z');

function source({amount='99997806',utxoCount=10,events=[{
  kind:'created',transaction_id:txid,txid,vout:0,value_sat:'99997806',slot:90,height:75,block_id:'c'.repeat(64),
}],historyFails=false,corroboration='corroborated'}={}){
  return async (url,init)=>{
    if(url.endsWith('/rpc')){
      const call=JSON.parse(init.body);
      const result=call.method==='getchaininfo'?head:{script_hash:hash,balance_sat:amount,utxo_count:utxoCount,corroboration:{level:corroboration,archival_witnesses:2,of:2}};
      return Response.json({jsonrpc:'2.0',id:call.id,result});
    }
    if(historyFails)return new Response('unavailable',{status:503});
    return Response.json({script_hash:hash,events,as_of_slot:100,total:events.length,next_cursor:null,source:'archival-indexer'});
  };
}

test('Bloch lookup reports exact source balance, head boundary and bounded observed events',async()=>{
  const result=await queryBlochScriptHash({address:hash,fetcher:source(),now:()=>observed});
  assert.equal(result.status,200);
  assert.equal(result.body.status,'source-reported');
  assert.equal(result.body.balance.base_units,'99997806');
  assert.equal(result.body.balance.block,null);
  assert.equal(result.body.observation.head_before_balance.slot,100);
  assert.equal(result.body.observation.corroboration.level,'corroborated');
  assert.equal(result.body.observation.retrieved_at,observed.toISOString());
  assert.equal(result.body.edges.length,1);
  assert.equal(result.body.edges[0].kind,'observed_created_output');
  assert.equal(result.body.independent_verification,false);
});

test('positive Bloch balance survives unavailable optional history with explicit coverage',async()=>{
  const result=await queryBlochScriptHash({address:hash,fetcher:source({historyFails:true})});
  assert.equal(result.status,200);
  assert.equal(result.body.observation.coverage,'balance_only_history_unavailable');
  assert.deepEqual(result.body.edges,[]);
});

test('zero on an arbitrary Bloch hash is indeterminate without prior history evidence',async()=>{
  const result=await queryBlochScriptHash({address:hash,fetcher:source({amount:'0',utxoCount:0,events:[]})});
  assert.equal(result.status,422);
  assert.equal(result.body.error,'indeterminate_bloch_script_hash');
});

test('zero on a previously used Bloch script hash keeps a source-reported zero',async()=>{
  const result=await queryBlochScriptHash({address:hash,fetcher:source({amount:'0',utxoCount:0})});
  assert.equal(result.status,200);
  assert.equal(result.body.balance.base_units,'0');
});

test('malformed or mismatched Bloch data never becomes a displayed balance',async()=>{
  assert.equal((await queryBlochScriptHash({address:'a'.repeat(63),fetcher:source()})).status,400);
  const bad=await queryBlochScriptHash({address:hash,fetcher:source({amount:'1.2'})});
  assert.equal(bad.status,502);
  assert.equal(bad.body.error,'bloch_source_unavailable');
});

test('chain wallet dispatch accepts BLCH only on Bloch network',async()=>{
  const ok=await queryChainWallet({network:'bloch',asset:'BLCH',address:hash,fetcher:source()});
  assert.equal(ok.status,200);
  const wrong=await queryChainWallet({network:'ethereum',asset:'BLCH',address:hash,fetcher:source()});
  assert.equal(wrong.status,400);
});
