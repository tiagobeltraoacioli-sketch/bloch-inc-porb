import test from 'node:test';
import assert from 'node:assert/strict';
import {searchGraph,visibleGraph,queryLinks} from '../site/portal/explorer.js';

const nodes=Array.from({length:201},(_,i)=>({id:`ETH:address:0x${i.toString(16).padStart(40,'0')}`,address:`0x${i.toString(16).padStart(40,'0')}`,kind:'address'}));
const graph={asset:'ETH',nodes,edges:nodes.slice(1).map((n,i)=>({from:nodes[0].id,to:n.id,txid:`0x${i.toString(16).padStart(64,'0')}`,event_id:String(i),amount_base_units:'9999999999999999999999999999999'}))};

test('search reaches references outside drawing cap and transaction hashes on account-chain records',()=>{
  const target=nodes.at(-1),baseline=visibleGraph(graph,null);
  assert.equal(baseline.nodes.length,160);assert.ok(!baseline.nodes.includes(target));
  assert.equal(searchGraph(graph,target.address.toUpperCase())[0].id,target.id);
  assert.equal(searchGraph(graph,graph.edges[3].txid)[0].type,'transaction');
  assert.equal(searchGraph(graph,'no-match').length,0);
  const selected=visibleGraph(graph,{type:'node',id:target.id},true);
  assert.deepEqual(new Set(selected.nodes.map(n=>n.id)),new Set([nodes[0].id,target.id]));
  assert.equal(selected.connections[0].records[0].amount_base_units,'9999999999999999999999999999999');
});

test('transaction selection retains endpoints; directed connections preserve parallel records and self-loops',()=>{
  const edge=graph.edges[0],loop={...edge,from:edge.to,event_id:'loop'},parallel={...edge,event_id:'other'};
  const sample={...graph,edges:[edge,loop,parallel]},view=visibleGraph(sample,{type:'transaction',id:edge.txid},true);
  assert.equal(view.nodes.length,2);assert.equal(view.connections.length,2);
  assert.equal(view.connections.find(e=>e.from===edge.from).records.length,2);
});

test('search respects Bitcoin base58 case and external queries carry only public references',()=>{
  const address='1BoatSLRHtKNngkdXEeobR76b53LETtpyT',btc={asset:'BTC',nodes:[{id:'btc',address,kind:'address'}],edges:[]};
  assert.equal(searchGraph(btc,address).length,1);assert.equal(searchGraph(btc,address.toLowerCase()).length,0);
  assert.equal(searchGraph({...btc,nodes:[{id:'bech',address:'bc1qabcdef1234',kind:'address'}]},'ABCDEF').length,1);
  const links=queryLinks('BTC',address);assert.equal(links.length,2);
  for(const [,href] of links){const url=new URL(href);assert.equal(url.origin,'https://bloch-graphus.xyz');assert.deepEqual([...url.searchParams.keys()],['asset','address']);}
  assert.deepEqual(queryLinks('ETH','<script>alert(1)</script>'),[]);
  assert.deepEqual(queryLinks('ETH','javascript:alert(1)'),[]);
  assert.equal(queryLinks('BLCH','a'.repeat(64))[0][1].includes('address='),true);
});
