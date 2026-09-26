import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonEventRows,comparisonEventCsv} from '../site/portal/atlas-comparison-view.js';

const observation=(from,to,amount='900719925474099312345')=>({from,to,kind:'native_value',amount_base_units:amount,txid:'0xEXACT',position:null,block_number:100,block_hash:'0xBLOCK',block_time:null});
const report=()=>({asset:'ETH',reference:null,report_sha256:'f'.repeat(64),baseline:{id:'baseline-id'},current:{id:'current-id'},counts:{shared:1,changed:1,only_baseline:1,only_current:1},events:[
  {event_id:'changed-endpoints',status:'changed',changed_fields:['from','to','amount_base_units'],baseline:observation('old-from','old-to'),current:observation('new-from','new-to','900719925474099312346')},
  {event_id:'same-self',status:'shared',changed_fields:[],baseline:observation('self','self'),current:observation('self','self')},
  {event_id:'baseline-event',status:'only_baseline',changed_fields:[],baseline:observation('old-from','baseline-peer'),current:null},
  {event_id:'current-event',status:'only_current',changed_fields:[],baseline:null,current:observation('new-from','current-peer')}
]});
test('comparison view filters retain exact reference matches from either side of changed events without changing the report',()=>{
  const r=report(),original=structuredClone(r);
  for(const reference of ['old-from','old-to','new-from','new-to'])assert.equal(comparisonEventRows(r,{reference,category:'changed'})[0].event_id,'changed-endpoints');
  assert.deepEqual(comparisonEventRows(r,{reference:'old-from'}).map(row=>row.event_id),['changed-endpoints','baseline-event']);
  assert.deepEqual(comparisonEventRows(r,{reference:'new-from'}).map(row=>row.event_id),['changed-endpoints','current-event']);
  assert.equal(comparisonEventRows(r,{reference:'self'}).length,1);assert.equal(comparisonEventRows(r,{reference:'old'}).length,0);assert.equal(comparisonEventRows(r,{reference:'OLD-FROM'}).length,0);
  assert.equal(comparisonEventRows(r,{category:'only_current',search:'CURRENT-PEER 0xexact'}).length,1);assert.equal(comparisonEventRows(r,{search:'current-peer baseline-event'}).length,0);
  assert.equal(comparisonEventRows(r,{search:'900719925474099312346'}).length,1);assert.deepEqual(r,original);
});
test('comparison CSV preserves original identity and exact amounts while recording view filters and protecting formula-like values',()=>{
  const r=report();r.events[0].event_id='=SUM(1,2)';r.events[0].baseline.txid='\t@external';r.events[0].current.txid='quoted "value"\nsecond line';r.reference='original-scope';
  const value=comparisonEventCsv(r,{reference:' new-to ',category:'changed',search:'900719925474099312346'});
  assert.match(value,/"report_sha256","baseline_id","current_id","asset","reference","view_reference","view_category","view_search"/);
  assert.ok(value.includes('"original-scope","new-to","changed","900719925474099312346"'));assert.ok(value.includes('"\'=SUM(1,2)"'));assert.ok(value.includes('"\'\t@external"'));
  assert.ok(value.includes('"900719925474099312345"'));assert.ok(value.includes('"900719925474099312346"'));assert.ok(value.includes('"quoted ""value""\nsecond line"'));assert.ok(value.includes(r.report_sha256));
  assert.equal(comparisonEventCsv(r,{reference:'absent'}).split('\r\n').length,1);
});
test('comparison CSV includes matching events across all UI pages and leaves absent side fields empty',()=>{
  const r=report();r.events=Array.from({length:45},(_,i)=>({...r.events[3],event_id:'event-'+i}));
  const value=comparisonEventCsv(r,{category:'only_current'});assert.equal(value.split('\r\n').length,46);assert.ok(value.includes('"event-44"'));assert.ok(value.includes('"only_current","","","","","","","","","","","new-from"'));
  assert.equal(comparisonEventRows(r,{}).length,45);assert.equal(r.events.length,45);
});
