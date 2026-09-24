import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {summarizeObservation}=require('../graphus/assets/source_metrics.js');

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
});

test('native ETH balance-only view remains explicit and malformed amounts fail closed',()=>{
  const eth=summarizeObservation({asset:'ETH',address:'0xroot',nodes:[],edges:[],balance:{block:{height:12}},observation:{}});
  assert.equal(eth.kind,'balance_only');
  assert.deepEqual(eth.block_range,{from:12,to:12});
  assert.equal(summarizeObservation({asset:'USDC',address:'0xroot',nodes:[],edges:[],balance:{block:{height:12}},observation:{}}).kind,'balance_only');
  assert.throws(()=>summarizeObservation({asset:'BTC',address:'root',nodes:[],edges:[{kind:'created_output',amount_base_units:'1.5'}]}),/Invalid source amount/);
});
