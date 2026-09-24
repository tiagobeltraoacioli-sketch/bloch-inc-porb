import test from 'node:test';
import assert from 'node:assert/strict';
import {graphusSnapshot,validHolders} from '../space/chain/graphus.js';
const holder={anchor:{height:100},coverage:{indexed_total_sat:'100'},holders:[{rank:1,script_hash:'a'.repeat(64),balance_sat:'100',utxo_count:1}]};
test('Graphus ranking validation checks identifiers, ordering and indexed balance totals',()=>{
  assert.equal(validHolders(holder),true);assert.equal(validHolders({...holder,coverage:{indexed_total_sat:'99'}}),false);
  assert.equal(validHolders({...holder,holders:[...holder.holders,{...holder.holders[0],rank:2}]}),false);
  assert.equal(validHolders({...holder,holders:[{...holder.holders[0],balance_sat:'not-an-amount'}]}),false);
});
test('Graphus uses only fixed URLs and keeps optional ranking failure distinct',async()=>{
  const calls=[],fetcher=async url=>{calls.push(url);return new Response(JSON.stringify(url.endsWith('/manifest')?{initial_assets:[{asset:'BLCH'}]}:holder),{headers:{'content-type':'application/json'}});};
  const result=await graphusSnapshot('bloch',fetcher);assert.equal(result.status,200);assert.equal(result.body.holders.holders.length,1);assert.ok(calls.every(u=>u.startsWith('https://bloch-graphus.xyz/api/')));
  assert.equal((await graphusSnapshot('https://evil.example',fetcher)).status,400);
  const partial=await graphusSnapshot('bloch',async url=>url.endsWith('/manifest')?fetcher(url):new Response('unavailable',{status:503}));
  assert.equal(partial.status,200);assert.equal(partial.body.holders,null);assert.equal(partial.body.holders_status,'unavailable');
});
