import test from 'node:test';
import assert from 'node:assert/strict';
import {neighborBaseline} from '../portal/neighbors.js';
test('nearest-neighbor baseline separates a sparse feature outlier and is order/scale invariant',()=>{
  const rows=Array.from({length:30},(_,i)=>({id:`n${String(i).padStart(2,'0')}`,features:{x:i===29?1000:i,y:5}})),a=neighborBaseline(rows,['x','y']);
  assert.equal(a.available,true);assert.equal(a.rows.at(-1).percentile,100);assert.ok(a.rows.at(-1).mean_distance>a.rows[10].mean_distance);
  assert.deepEqual(a,neighborBaseline(rows.slice().reverse(),['x','y']));
  const b=neighborBaseline(rows.map(r=>({...r,features:{x:r.features.x*10+100,y:7}})),['x','y']);
  for(let i=0;i<rows.length;i++){assert.ok(Math.abs(a.rows[i].mean_distance-b.rows[i].mean_distance)<1e-10);assert.equal(a.rows[i].nearest.length,3);assert.ok(a.rows[i].nearest.every(n=>n.id!==a.rows[i].id));}
  assert.equal(neighborBaseline(rows.slice(0,5),['x','y']).available,false);
  assert.equal(neighborBaseline(rows.map(r=>({...r,features:{x:1,y:1}})),['x','y']).available,false);
  assert.throws(()=>neighborBaseline(rows.map(r=>({...r,features:{x:NaN,y:1}})),['x','y']),/invalid_neighbor/);
});
