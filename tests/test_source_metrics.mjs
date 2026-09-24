import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {summarizeObservation,compareTokenAnchors}=require('../graphus/assets/source_metrics.js');

test('token balance and log anchors require the same contract and reject same-height conflicts',()=>{
  const contract='0x'+'a'.repeat(40);
  const wallet={balance:{contract,block:{height:100,hash:'0x'+'b'.repeat(64)}}};
  const activity={contract:contract.toUpperCase().replace('0X','0x'),
    observation:{finalized_head:{height:100,hash:'0x'+'b'.repeat(64)}}};
  const same=compareTokenAnchors(wallet,activity);
  assert.equal(same.status,'same_source_anchor');
  assert.equal(same.height_difference,0);
  activity.observation.finalized_head={height:102,hash:'0x'+'c'.repeat(64)};
  const separate=compareTokenAnchors(wallet,activity);
  assert.equal(separate.status,'separate_source_anchors');
  assert.equal(separate.height_difference,2);
  activity.observation.finalized_head.height=100;
  assert.throws(()=>compareTokenAnchors(wallet,activity),/Conflicting finalized anchor/);
  activity.contract='0x'+'d'.repeat(40);
  assert.throws(()=>compareTokenAnchors(wallet,activity),/Token contract mismatch/);
});

test('UTXO input references and created outputs stay separate exact sums',()=>{
  const result=summarizeObservation({asset:'BTC',address:'root',
    nodes:[{id:'root',kind:'address',address:'root'},
      {id:'tx',kind:'transaction',block:{height:800000}},
      {id:'peer',kind:'address',address:'peer'}],
    edges:[{from:'root',to:'tx',kind:'observed_input_prevout',amount_base_units:'9007199254740993'},
      {from:'tx',to:'peer',kind:'created_output',amount_base_units:'9007199254740992'}],
    activity:{confirmed_tx_count:25},observation:{source_id:'esplora',coverage:'first_page'},
  });
  assert.equal(result.transaction_records,1);
  assert.equal(result.returned_edges,2);
  assert.equal(result.observed_other_identifiers,1);
  assert.deepEqual(result.block_range,{from:800000,to:800000});
  assert.equal(result.groups.observed_input_prevout.base_units,'9007199254740993');
  assert.equal(result.groups.created_output.base_units,'9007199254740992');
  assert.equal(result.source_reported_confirmed_tx_count,25);
  assert.equal('total_volume' in result,false);
});

test('Bloch script observations do not become address peers or transfer volume',()=>{
  const result=summarizeObservation({asset:'BLCH',address:'script',
    nodes:[{id:'script',kind:'script_hash',address:'script'},
      {id:'tx',kind:'transaction',block:{height:100}}],
    edges:[{from:'tx',to:'script',kind:'observed_created_output',amount_base_units:'300'},
      {from:'script',to:'tx',kind:'observed_spent_outpoint_reference',amount_base_units:'200'}],
    observation:{source_id:'bloch-indexer',coverage:'bounded_history'},
  });
  assert.equal(result.observed_other_identifiers,0);
  assert.equal(result.groups.observed_created_output.base_units,'300');
  assert.equal(result.groups.observed_spent_outpoint_reference.base_units,'200');
});

test('ERC-20 self logs are counted once and excluded from peer count',()=>{
  const result=summarizeObservation({asset:'USDC',address:'0xroot',nodes:[],edges:[],
    tokenActivity:{events:[
      {direction:'incoming',from:'0xpeer',to:'0xroot',amount_base_units:'700',block_number:12},
      {direction:'self',from:'0xroot',to:'0xroot',amount_base_units:'50',block_number:13},
    ]},tokenObservation:{source_id:'rpc',block_window:{from:10,to:13}},
  });
  assert.equal(result.returned_events,2);
  assert.equal(result.observed_other_identifiers,1);
  assert.equal(result.groups.incoming.base_units,'700');
  assert.equal(result.groups.self.base_units,'50');
  assert.equal(result.groups.outgoing.base_units,'0');
  assert.equal(result.block_activity.total_blocks,4);
  assert.equal(result.block_activity.active_blocks,2);
  assert.deepEqual(result.block_activity.busiest_block,{height:12,count:1});
  assert.equal(result.block_activity.buckets.find(bucket=>bucket.from===13).groups.self.base_units,'50');
});

test('ERC-20 peer ledger separates exact incoming and outgoing observations',()=>{
  const data={asset:'USDT',address:'0xroot',nodes:[],edges:[],
    tokenActivity:{events:[
      {direction:'incoming',from:'0xpeer',to:'0xroot',amount_base_units:'9007199254740993',block_number:20},
      {direction:'outgoing',from:'0xroot',to:'0xpeer',amount_base_units:'7',block_number:23},
      {direction:'self',from:'0xroot',to:'0xroot',amount_base_units:'3',block_number:24},
    ]},tokenObservation:{block_window:{from:20,to:24}},
  };
  const result=summarizeObservation(data);
  assert.equal(result.peer_activity.length,1);
  assert.deepEqual(result.peer_activity[0],{
    address:'0xpeer',event_count:2,
    incoming:{count:1,base_units:'9007199254740993'},
    outgoing:{count:1,base_units:'7'},first_block:20,last_block:23,
  });
  assert.equal(result.groups.self.base_units,'3');
  data.tokenActivity.events[0].to='0xother';
  assert.throws(()=>summarizeObservation(data),/Invalid token direction/);
});

test('ERC-20 block timeline preserves exact amounts, empty windows, and bounded scope',()=>{
  const data={asset:'USDT',address:'0xroot',nodes:[],edges:[],
    tokenActivity:{events:[
      {direction:'incoming',from:'0xpeer',to:'0xroot',amount_base_units:'9007199254740993',block_number:102},
      {direction:'outgoing',from:'0xroot',to:'0xpeer',amount_base_units:'5',block_number:102},
      {direction:'incoming',from:'0xpeer',to:'0xroot',amount_base_units:'7',block_number:117},
    ]},tokenObservation:{block_window:{from:100,to:115}},
  };
  assert.throws(()=>summarizeObservation(data),/Token event outside block window/);
  data.tokenObservation.block_window.to=119;
  const result=summarizeObservation(data);
  assert.equal(result.block_activity.total_blocks,20);
  assert.equal(result.block_activity.active_blocks,2);
  assert.deepEqual(result.block_activity.busiest_block,{height:102,count:2});
  assert.equal(result.block_activity.buckets[0].groups.incoming.base_units,'9007199254740993');
  assert.equal(result.block_activity.buckets.reduce((sum,bucket)=>sum+bucket.count,0),3);
  assert.equal(result.block_activity.buckets.filter(bucket=>bucket.count===0).length,5);
  data.tokenActivity.events=[];
  const empty=summarizeObservation(data);
  assert.equal(empty.block_activity.active_blocks,0);
  assert.equal(empty.block_activity.buckets.length,7);
  data.tokenObservation.block_window.to=164;
  assert.throws(()=>summarizeObservation(data),/Invalid token block window/);
});

test('native ETH balance-only view remains explicit and malformed amounts fail closed',()=>{
  const eth=summarizeObservation({asset:'ETH',address:'0xroot',nodes:[],edges:[],balance:{block:{height:12}},observation:{}});
  assert.equal(eth.kind,'balance_only');
  assert.deepEqual(eth.block_range,{from:12,to:12});
  assert.equal(summarizeObservation({asset:'USDC',address:'0xroot',nodes:[],edges:[],balance:{block:{height:12}},observation:{}}).kind,'balance_only');
  assert.throws(()=>summarizeObservation({asset:'BTC',address:'root',nodes:[],edges:[{kind:'created_output',amount_base_units:'1.5'}]}),/Invalid source amount/);
});
