import test from 'node:test';
import assert from 'node:assert/strict';
import {formatBaseUnits,graphStatistics,deriveChainInsights} from '../deploy/blochai-public/chain-insights.js';

const now=Date.parse('2026-09-28T23:20:00Z');
const source=(id='network_overview',extra={})=>({id,title:id,status:'available',retrieved_at:'2026-09-28T23:19:00Z',observed_at:'2026-09-28T23:18:00Z',...extra});
const guide=extra=>({network:'bitcoin',sources:[source(),source('network_graph')],facts:[],transactions:[],graph:{nodes:[],edges:[]},...extra});
test('base-unit conversion stays exact beyond Number precision and across coin decimal scales',()=>{
  assert.equal(formatBaseUnits('9007199254740993123','BTC'),'90071992547.40993123 BTC');
  assert.equal(formatBaseUnits('1','ETH'),'0.000000000000000001 ETH');assert.equal(formatBaseUnits('1234000000000000000','ETH'),'1.234 ETH');assert.equal(formatBaseUnits('100000000','BLCH'),'1 BLCH');assert.equal(formatBaseUnits('0','BTC'),'0 BTC');
  for(const value of ['01','-1','1.0','1e18',1,'9'.repeat(79),'NaN'])assert.equal(formatBaseUnits(value,'BTC'),null);assert.equal(formatBaseUnits('1','DOGE'),null);
});
test('graph metrics deduplicate directed records, exclude self-links and preserve isolated components',()=>{
  const graph={nodes:['a','b','c','d'].map(id=>({id})),edges:[{source:'a',target:'b'},{source:'a',target:'b'},{source:'b',target:'a'},{source:'b',target:'c'},{source:'a',target:'a'}]};
  assert.deepEqual(graphStatistics(graph),{nodes:4,records:5,unique_directed_connections:3,self_loops:1,duplicate_directed_records:1,density:'0.250000',max_in_degree:1,max_out_degree:2,isolated_nodes:1,weak_components:2});
  assert.equal(graphStatistics({nodes:[{id:'one'}],edges:[]}).density,null);assert.equal(graphStatistics({nodes:[{id:'a'},{id:'a'}],edges:[]}),null);assert.equal(graphStatistics({nodes:[{id:'a'}],edges:[{source:'a',target:'missing'}]}),null);
});
test('amount insights preserve subject source and do not aggregate UTXO inputs/outputs',()=>{
  const item=guide({sources:[source('address_observation')],facts:[{label:'Observed address balance',value:'11360942',unit:'sat'},{label:'Transaction input total',value:'90000000',unit:'sat'},{label:'Transaction output total',value:'89000000',unit:'sat'}]});
  const result=deriveChainInsights(item,{now});const amount=result.insights.find(item=>item.id==='exact_amount');assert.match(amount.text,/0\.11360942 BTC \(11360942 sat\)/);assert.deepEqual(amount.source_ids,['address_observation']);assert.doesNotMatch(JSON.stringify(result),/179000000|1\.79 BTC|transfer volume|risk score/);assert.equal(item.facts.length,3);
});
test('checkpoint distance requires matching overview heights, never slot arithmetic or cross-source subtraction',()=>{
  const context=guide({facts:[{label:'Observed head height',value:'105',unit:'blocks'},{label:'Observed head slot',value:'900',unit:'slots'},{label:'Reported finalized height',value:'100',unit:'blocks'}]});
  assert.match(deriveChainInsights(context,{now}).insights.find(item=>item.id==='checkpoint_gap').text,/5 blocks apart/);
  context.sources=[source('transaction_observation')];assert.equal(deriveChainInsights(context,{now}).insights.some(item=>item.id==='checkpoint_gap'),false);
  context.sources=[source()];context.facts[2].value='110';const invalid=deriveChainInsights(context,{now}).insights.find(item=>item.id==='checkpoint_gap');assert.equal(invalid.status,'partial');assert.match(invalid.text,/reorganization is not inferred/);assert.doesNotMatch(invalid.text,/-5 blocks apart/);
});
test('freshness separates retrieval from observation and does not equate missing/future timestamps to fresh data',()=>{
  const result=deriveChainInsights(guide({sources:[source(),source('network_graph',{observed_at:null,retrieved_at:'2026-09-29T00:00:00Z',status:'unavailable'})]}),{now});
  const age=result.insights.find(item=>item.id==='source_freshness');assert.equal(age.status,'partial');assert.match(age.text,/retrieval age 1m 0s; observation age 2m 0s/);assert.match(age.text,/ahead of the comparison clock/);assert.match(age.text,/observation age unknown/);
  const coverage=result.insights.find(item=>item.id==='source_coverage');assert.equal(coverage.status,'partial');assert.match(coverage.text,/1 of 2 public sources are available/);assert.match(coverage.text,/unknown, not zero/);
});
test('transaction diagnostics count only bounded same-network records and describe source status',()=>{
  const tx={hash:'a'.repeat(64),asset:'BTC',status:'confirmed'},result=deriveChainInsights(guide({transactions:[tx,{...tx},{hash:'b'.repeat(64),asset:'ETH',status:'successful'}]}),{now});
  const item=result.insights.find(item=>item.id==='transaction_sample');assert.equal(item.status,'partial');assert.match(item.text,/1 distinct transaction references across 2 supported displayed records/);assert.match(item.text,/1 unsupported/);assert.match(item.text,/source-reported states/);
});
test('Bitcoin fee comparison needs complete input/output fields and never adds both sides as volume',()=>{
  const context=guide({sources:[source('transaction_observation')],facts:[{label:'Complete input record total',value:'10000',unit:'sat'},{label:'Complete output record total',value:'9500',unit:'sat'},{label:'Derived input-output fee',value:'500',unit:'sat'},{label:'Transaction fee',value:'500',unit:'sat'}]});
  const good=deriveChainInsights(context,{now}).insights.find(item=>item.id==='fee_consistency');assert.equal(good.status,'available');assert.match(good.text,/0\.000005 BTC/);assert.doesNotMatch(good.text,/19500/);
  context.facts[3].value='600';assert.equal(deriveChainInsights(context,{now}).insights.find(item=>item.id==='fee_consistency').status,'partial');context.facts.shift();assert.equal(deriveChainInsights(context,{now}).insights.some(item=>item.id==='fee_consistency'),false);
});
test('Ethereum execution fee uses exact matched fields and keeps value and blob fees separate',()=>{
  const context=guide({network:'ethereum',sources:[source('transaction_observation')],facts:[{label:'Execution gas used',value:'21000',unit:'gas'},{label:'Effective execution gas price',value:'1000000000',unit:'wei/gas'},{label:'Derived execution gas fee',value:'21000000000000',unit:'wei'}]});
  const item=deriveChainInsights(context,{now}).insights.find(item=>item.id==='fee_consistency');assert.match(item.text,/0\.000021 ETH/);assert.match(item.text,/Blob fees remain separate/);assert.equal(item.status,'available');context.facts[2].value='1';assert.equal(deriveChainInsights(context,{now}).insights.find(item=>item.id==='fee_consistency').status,'partial');
});
test('insight output is bounded, source-linked and does not mutate original snapshot',()=>{
  const value=guide({sources:[source(),source('network_graph',{status:'unavailable'})],facts:[{label:'Observed address balance',value:'1',unit:'sat'},{label:'Observed head height',value:'100',unit:'blocks'},{label:'Reported finalized height',value:'90',unit:'blocks'}],graph:{nodes:[{id:'a'},{id:'b'}],edges:[{source:'a',target:'b'}]},transactions:[{hash:'a'.repeat(64),asset:'BTC',status:'confirmed'}]}),before=JSON.stringify(value),result=deriveChainInsights(value,{now});
  assert.equal(JSON.stringify(value),before);assert.ok(result.insights.length<=8);assert.ok(result.facts.length<=4);for(const item of result.insights){assert.ok(item.text.length<=600);assert.ok(item.source_ids.every(id=>value.sources.some(source=>source.id===id)));assert.ok(['available','partial','unavailable'].includes(item.status));}
});
