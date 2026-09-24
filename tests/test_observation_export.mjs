import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
require('../graphus/assets/source_metrics.js');
const {buildObservationBundle}=require('../graphus/assets/observation_export.js');
const EXPORTED_AT='2026-09-24T05:00:00.000Z';

test('Bitcoin export preserves exact returned evidence and excludes injected score fields',()=>{
  const data={status:'source-reported',network:'bitcoin-mainnet',asset:'BTC',address:'bc1qexample',
    aml_score:99,secret:'do-not-export',
    balance:{base_units:'9007199254740993',unit:'sat',scope:'source_confirmed_address_aggregate',block:null,score:99},
    observation:{source_id:'esplora',retrieved_at:'2026-09-24T04:59:00Z',coverage:'first_page',
      limitations:['bounded page'],internal_token:'do-not-export'},
    nodes:[{id:'root',kind:'address',address:'bc1qexample',risk_label:'do-not-export'},
      {id:'tx',kind:'transaction',txid:'a'.repeat(64),block:{height:900000,hash:'b'.repeat(64)}}],
    edges:[{from:'root',to:'tx',kind:'observed_input_prevout',amount_base_units:'9007199254740993',
      txid:'a'.repeat(64),position:0,private_note:'do-not-export'}],
    activity:{confirmed_tx_count:1,mempool_tx_count:0,score:99},
  };
  const bundle=buildObservationBundle(data,EXPORTED_AT);
  const json=JSON.stringify(bundle);
  assert.equal(bundle.schema_version,1);
  assert.equal(bundle.exported_at,EXPORTED_AT);
  assert.equal(bundle.balance.base_units,'9007199254740993');
  assert.equal(bundle.records.edges[0].amount_base_units,'9007199254740993');
  assert.equal(bundle.metrics.groups.observed_input_prevout.base_units,'9007199254740993');
  assert.equal(bundle.independent_verification,false);
  assert.equal(bundle.aml_score_included,false);
  assert.equal(json.includes('do-not-export'),false);
  assert.equal(json.includes('risk_label'),false);
  assert.equal(json.includes('aml_score":99'),false);
});

test('Token export keeps separate anchors and bounded logs without implying history coverage',()=>{
  const address='0x'+'a'.repeat(40);
  const peer='0x'+'b'.repeat(40);
  const event={event_id:'0x'+'c'.repeat(64)+':2',block_number:100,block_hash:'0x'+'d'.repeat(64),
    transaction_hash:'0x'+'c'.repeat(64),transaction_index:1,log_index:2,from:peer,to:address,
    direction:'incoming',amount_base_units:'9007199254740993',score:93};
  const data={status:'source-reported',network:'ethereum-mainnet',asset:'USDC',address,
    balance:{base_units:'20',unit:'token-base-unit',scope:'source_reported_finalized_block',decimals:6,
      contract:'0x'+'e'.repeat(40),block:{height:99,hash:'0x'+'f'.repeat(64)}},
    observation:{source_id:'rpc',retrieved_at:'2026-09-24T04:58:00Z',coverage:'single balance'},
    nodes:[{id:'root',kind:'address',address},{id:'peer',kind:'address',address:peer}],
    edges:[{from:'peer',to:'root',kind:'erc20_transfer_log',event_id:event.event_id,
      amount_base_units:event.amount_base_units,block_number:100,transaction_hash:event.transaction_hash}],
    tokenActivity:{event_count:1,events:[event]},tokenActivityContract:'0x'+'e'.repeat(40),
    tokenObservation:{source_id:'rpc',retrieved_at:'2026-09-24T04:59:00Z',coverage:'64 blocks',
      finalized_head:{height:100,hash:'0x'+'d'.repeat(64)},
      window_end_anchor:{height:100,hash:'0x'+'d'.repeat(64)},block_window:{from:37,to:100,width:64}},
    tokenAnchorComparison:{status:'separate_source_anchors',height_difference:1,
      balance:{height:99,hash:'0x'+'f'.repeat(64)},logs:{height:100,hash:'0x'+'d'.repeat(64)}},
  };
  const bundle=buildObservationBundle(data,EXPORTED_AT);
  assert.equal(bundle.token_logs.event_count,1);
  assert.equal(bundle.token_logs.events[0].amount_base_units,'9007199254740993');
  assert.equal(bundle.token_logs.anchor_comparison.status,'separate_source_anchors');
  assert.equal(bundle.token_logs.source.block_window.width,64);
  assert.equal(bundle.token_logs.source.window_end_anchor.hash,'0x'+'d'.repeat(64));
  assert.equal(JSON.stringify(bundle).includes('"score":93'),false);
  delete data.tokenActivity;
  const balanceOnly=buildObservationBundle(data,EXPORTED_AT);
  assert.equal('token_logs' in balanceOnly,false);
  assert.equal(balanceOnly.metrics.kind,'balance_only');
});

test('Export rejects unbounded or non-source observations',()=>{
  assert.throws(()=>buildObservationBundle({status:'synthetic',asset:'BTC',address:'x',nodes:[],edges:[]},EXPORTED_AT),/No bounded/);
  assert.throws(()=>buildObservationBundle({status:'source-reported',asset:'BTC',address:'x',nodes:[],edges:Array(513).fill({})},EXPORTED_AT),/Unbounded/);
});
