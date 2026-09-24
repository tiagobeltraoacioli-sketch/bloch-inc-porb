import test from 'node:test';
import assert from 'node:assert/strict';
import {describe,correlation,histogram,dataset,rolling,walkForward,cluster,analyze} from '../space/public/assets/science.js';

test('statistics exclude missing values without converting them into zeros',()=>{
  const s=describe([1,2,3,4,5,null,NaN]);assert.equal(s.n,5);assert.equal(s.missing,2);assert.equal(s.mean,3);assert.equal(s.median,3);assert.equal(s.std,Math.sqrt(2.5));
  assert.equal(describe([]).mean,null);assert.equal(correlation([1,1,1],[2,3,4]),null);assert.equal(correlation([1,2,3],[3,2,1]),-1);
  assert.equal(histogram([0,1,2,3,4],4).reduce((s,b)=>s+b.count,0),5);assert.equal(histogram([2,2])[0].count,2);
});
test('Bloch gaps and changed reporting coverage break model training and rolling windows',()=>{
  const data={points:[...Array.from({length:26},(_,i)=>({at:i*1000,connections:10+i,reporting_nodes:2})),{at:26000,connections:null,reporting_nodes:2},{at:27000,connections:40,reporting_nodes:2},{at:28000,connections:50,reporting_nodes:3}]};
  const d=dataset('bloch',data);assert.notEqual(d.rows[25].group,d.rows[27].group);assert.notEqual(d.rows[27].group,d.rows[28].group);assert.equal(rolling(d.rows,'connections')[28].average,null);assert.equal(walkForward(d.rows,'connections').available,false);
});
test('walk-forward evaluation uses only preceding observations and compares an aligned baseline',()=>{
  const rows=Array.from({length:48},(_,i)=>({group:0,label:String(i),value:10+i*.1+Math.sin(i)}));
  const a=walkForward(rows,'value');const changed=rows.map(r=>({...r}));changed[47].value=10000;const b=walkForward(changed,'value');
  assert.equal(a.points[0].prediction,b.points[0].prediction);assert.equal(a.points.at(-1).prediction,b.points.at(-1).prediction);assert.equal(a.points[0].baseline,rows[35].value);assert.equal(a.evaluation_rows,12);assert.ok(Number.isFinite(a.mae));assert.ok(Number.isFinite(a.baseline_mae));
  assert.equal(walkForward(rows.slice(0,12),'value').available,false);
});
test('constant series avoid invented correlation, cluster separation, and model skill',()=>{
  const rows=Array.from({length:30},(_,i)=>({group:0,label:String(i),value:5,other:5}));
  assert.equal(cluster(rows,['value','other']).available,false);const v=walkForward(rows,'value');assert.equal(v.mae,0);assert.equal(v.baseline_mae,0);assert.equal(v.skill,null);
});
test('k-means is deterministic and identifies separated structural populations',()=>{
  const rows=Array.from({length:30},(_,i)=>({x:i<15?i*.01:100+i*.01,y:i<15?0:100}));const a=cluster(rows,['x','y'],2),b=cluster(rows,['x','y'],2);
  assert.deepEqual(a,b);assert.equal(a.k,2);assert.notEqual(a.labels[0].cluster,a.labels[29].cluster);
});
test('Ethereum derived units leave exact source values intact and report provenance',()=>{
  const data={source:'test-rpc',retrieved_at:'2026-09-24T00:00:00Z',fee_history:{oldest_height:'123',gas_used_ratio:[.5,.8,.7],base_fee_wei:['1000000000','2000000000','3000000000']}};
  const report=analyze('ethereum',data,'fee');assert.equal(report.rows[0].fee,1);assert.equal(data.fee_history.base_fee_wei[0],'1000000000');assert.equal(report.statistics.mean,2);assert.equal(report.provenance.source,'test-rpc');
});
