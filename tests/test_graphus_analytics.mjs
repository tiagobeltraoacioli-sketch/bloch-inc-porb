import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const A=require('../graphus/assets/analytics_engine.js');

const graph=(edges=[],ids=['a','b','c','isolated'])=>A.normalize({asset:'ETH',status:'synthetic',
  nodes:ids.map(id=>({id,kind:'address'})),edges:edges.map(([from,to,amount,block],i)=>({from,to,
    amount_base_units:amount,block_number:block,kind:'native_value',event_id:`e${i}`}))});

test('parallel events, self links and isolated nodes preserve distinct graph semantics',()=>{
  const data=graph([['a','b','9007199254740993',1],['a','b','9',1],['b','c','3',2],['a','a','2',null]]);
  const stats=A.analyze(data);
  assert.equal(stats.nodes,4);assert.equal(stats.components,2);assert.equal(stats.density,2/12);
  assert.equal(stats.ranking.find(r=>r.id==='a').degree,1);
  assert.equal(stats.ranking.find(r=>r.id==='a').outgoing,3);
  assert.equal(stats.ranking.find(r=>r.id==='a').incoming,1);
  assert.equal(stats.groups[0].amount,'9007199254741007');assert.equal(stats.unknownBlocks,1);
  assert.ok(Math.abs(stats.ranking.reduce((sum,r)=>sum+r.rank,0)-1)<1e-9);
  const withoutDuplicate=A.analyze(graph([['a','b','1',1],['b','c','1',2],['a','a','1',null]]));
  for(const r of stats.ranking)assert.equal(r.rank,withoutDuplicate.ranking.find(n=>n.id===r.id).rank);
});
test('filters retain exact integer thresholds, exclude unknown blocks only for a bounded window, and do not mutate',()=>{
  const data=graph([['a','b','9007199254740993',10],['b','c','9007199254740992',11],['a','c','7',null]]);
  assert.equal(A.filterGraph(data,{minimum:'9007199254740993'}).edges.length,1);
  assert.equal(A.filterGraph(data,{minBlock:10,maxBlock:10}).edges.length,1);
  assert.equal(A.filterGraph(data).edges.length,3);
  assert.equal(A.filterGraph(data,{focus:'c',direction:'outgoing'}).edges.length,0);
  assert.equal(data.edges.length,3);
  const empty=A.analyze(A.filterGraph(data,{minBlock:100}));
  assert.equal(empty.nodes,0);assert.equal(empty.components,0);assert.equal(empty.density,0);
});
test('path search follows direction, step limits and filtered records, including cycles',()=>{
  const data=graph([['a','b','1',1],['b','a','1',2],['b','c','1',3]]);
  assert.deepEqual(A.findPath(data,'a','c',2).map(e=>e.id),['e0','e2']);
  assert.equal(A.findPath(data,'a','c',1),null);assert.equal(A.findPath(data,'c','a'),null);
  assert.deepEqual(A.findPath(data,'a','a'),[]);assert.equal(A.findPath(data,'missing','missing'),null);
  assert.equal(A.findPath(A.filterGraph(data,{maxBlock:2}),'a','c'),null);
});
test('each asset generates deterministic fixtures and UTXO graphs never assert direct senders',()=>{
  for(const asset of Object.keys(A.DECIMALS)){
    const one=A.fixture(asset);assert.deepEqual(one,A.fixture(asset));assert.equal(one.status,'synthetic');
    assert.equal(one.edges.length,864);assert.ok(one.nodes.length>=144);
    if(['BTC','BLCH'].includes(asset)){
      const kinds=new Map(one.nodes.map(n=>[n.id,n.kind]));
      for(const edge of one.edges)assert.notEqual(kinds.get(edge.from)==='transaction',kinds.get(edge.to)==='transaction');
    }
  }
});
test('imports reject malformed, oversized and inconsistent evidence; large exact sums remain representable',()=>{
  const data=graph();assert.throws(()=>A.normalize({...data,nodes:[...data.nodes,data.nodes[0]]}),/duplicate/);
  assert.throws(()=>graph([['a','missing','1',1]]),/connection/);
  assert.throws(()=>graph([['a','b','1e10',1]]),/amount/);
  assert.throws(()=>graph([['a','b','1',-1]]),/block/);
  assert.throws(()=>A.fromBundle({kind:'unknown'}),/Constellation/);
  assert.throws(()=>A.normalize({...data,nodes:Array(1201).fill({id:'x',kind:'address'})}),/bounded/);
  const sum=A.analyze(graph([['a','b','9'.repeat(78),1],['a','b','9'.repeat(78),2]])).groups[0].amount;
  assert.equal(BigInt(sum),2n*BigInt('9'.repeat(78)));assert.ok(A.format(sum,'ETH').length>60);
  assert.throws(()=>A.normalize({asset:'BTC',status:'synthetic',nodes:[{id:'a',kind:'address'},{id:'b',kind:'address'}],edges:[{from:'a',to:'b',kind:'created_output',amount_base_units:'1'}]}),/UTXO/);
});
test('Constellation imports use ERC20 logs once, preserving self transfers and empty ETH graphs',()=>{
  const address='0x'+'a'.repeat(40),peer='0x'+'b'.repeat(40);
  const bundle={schema_version:1,kind:'graphus_public_chain_observation',status:'source-reported',
    query:{asset:'USDC',address},source:{source_id:'balance-rpc'},records:{nodes:[],edges:[]},
    token_logs:{source:{source_id:'log-rpc',coverage:'64 blocks'},events:[
      {event_id:'one',from:address,to:peer,amount_base_units:'9007199254740993',block_number:100},
      {event_id:'self',from:address,to:address,amount_base_units:'3',block_number:100},
    ]}};
  const imported=A.fromBundle(bundle);assert.equal(imported.edges.length,2);assert.equal(imported.nodes.length,2);
  assert.equal(imported.source,'log-rpc');assert.equal(A.analyze(imported).groups[0].amount,'9007199254740996');
  bundle.token_logs.events.push({...bundle.token_logs.events[0]});assert.throws(()=>A.fromBundle(bundle),/duplicate/);
  delete bundle.token_logs;bundle.query.asset='ETH';bundle.records.nodes=[{id:address,kind:'address',address}];
  const empty=A.analyze(A.fromBundle(bundle));assert.equal(empty.connections,0);assert.equal(empty.nodes,1);
});
const balances=(values,total=values.reduce((sum,v)=>sum+BigInt(v),0n).toString(),count=values.length)=>({
  status:'source-reported',asset:'BLCH',source:'indexer',retrieved_at:'2026-09-24T00:00:00Z',anchor:{height:10,block_id:'a'.repeat(64)},
  coverage:{returned:values.length,positive_script_hashes_in_index:count,indexed_total_sat:total},
  holders:values.map((v,i)=>({script_hash:(i+1).toString(16).padStart(64,'0'),balance_sat:v,utxo_count:1})),
});
test('balance Gini, HHI and Lorenz use exact amounts and an explicit returned subset denominator',()=>{
  const equal=A.holderStats(balances(['100','100','100','100']));
  assert.equal(equal.gini,0);assert.equal(equal.hhi,.25);assert.equal(equal.complete,true);
  const unequal=A.holderStats(balances(['100','300'],'1000',8));
  assert.equal(unequal.complete,false);assert.equal(unequal.returnedShare,.4);
  assert.equal(unequal.gini,.25);assert.equal(unequal.hhi,.625);assert.equal(unequal.top1,.75);
  assert.deepEqual(unequal.lorenz,[{x:0,y:0},{x:.5,y:.25},{x:1,y:1}]);
  assert.equal(A.holderStats(balances(['9007199254740993','9007199254740992'])).sum,'18014398509481985');
  assert.throws(()=>A.holderStats(balances(['200'],'100')),/reconcile/);
  assert.throws(()=>A.holderStats(balances(['200'],'201')),/reconcile/);
  const empty=A.holderStats(balances([]));assert.equal(empty.gini,null);assert.equal(empty.hhi,null);
});
test('CSV quotes source strings and neutralizes spreadsheet formulas without altering positive amounts',()=>{
  assert.equal(A.csv([['=SUM(1,2)','a"b','9007199254740993','line\nnext']]),'"\'=SUM(1,2)","a""b","9007199254740993","line\nnext"');
});
