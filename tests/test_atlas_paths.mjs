import test from 'node:test';
import assert from 'node:assert/strict';
import {traceAtlasPaths,pathParameters,PATH_LIMITS} from '../graphus/assets/atlas_paths.js';
import {ASSETS} from '../graphus/assets/atlas_registry.js';
import {mergePage} from '../portal/data.js';
import {digest} from '../portal/security.js';
import {setup,credentials} from './porb_helpers.mjs';
import {pathSource} from './atlas_paths_fixture.js';
import {sample} from './system_map_fixture.mjs';

const graph=asset=>mergePage(null,pathSource(asset),asset||'ETH');
const query=g=>({from:g.nodes.find(n=>n.address.endsWith('01')).id,to:g.nodes.find(n=>n.address.endsWith('04')).id});
test('ordered paths retain exact events, deterministic hop order, source lineage and reproducible report hashes',async()=>{
  const g=graph(),r=await traceAtlasPaths(g,query(g));
  assert.deepEqual(r.paths.map(p=>p.steps.map(e=>e.event_id)),[['d'],['a','e'],['f','c'],['a','b','c']]);
  assert.equal(r.paths[3].duration_seconds,120);assert.deepEqual(r.paths[3].steps.map(e=>e.gap_seconds),[null,60,60]);
  assert.equal(r.paths[0].steps[0].amount_base_units,'900719925474099312345');assert.ok(!Object.hasOwn(r.paths[0],'total_value'));
  assert.equal(r.provenance.dataset_sha256,await digest(JSON.stringify(g)));assert.equal(r.search.complete_within_query,true);
  const {report_sha256,...body}=r;assert.equal(report_sha256,await digest(JSON.stringify(body)));assert.deepEqual(await traceAtlasPaths(g,query(g)),r);
  const shuffled=structuredClone(g);shuffled.edges.reverse();shuffled.nodes.reverse();assert.deepEqual((await traceAtlasPaths(shuffled,query(g))).paths,r.paths);
});
test('result limits disclose real omitted paths, while an exactly full result remains complete',async()=>{
  const g=graph(),p=query(g),limited=await traceAtlasPaths(g,{...p,max_paths:1}),exact=await traceAtlasPaths(g,{...p,max_paths:4});
  assert.equal(limited.paths.length,1);assert.equal(limited.search.stop_reason,'path_limit');assert.equal(limited.search.complete_within_query,false);
  assert.equal(exact.paths.length,4);assert.equal(exact.search.truncated,false);
  assert.equal((await traceAtlasPaths(g,{...p,max_hops:1})).paths.length,1);
});
test('time windows, exact per-event minimums, step gaps and total duration constrain every path',async()=>{
  const g=graph(),p=query(g);
  assert.deepEqual((await traceAtlasPaths(g,{...p,minimum:'900719925474099312345'})).paths.map(p=>p.steps.map(e=>e.event_id)),[['d'],['a','e'],['a','b','c']]);
  assert.equal((await traceAtlasPaths(g,{...p,minimum:'900719925474099312346'})).paths.length,0);
  const range=await traceAtlasPaths(g,{...p,start:'2026-09-24T12:01:00Z',end:'2026-09-24T12:02:00Z'});assert.deepEqual(range.paths.map(p=>p.steps.map(e=>e.event_id)),[['f','c']]);assert.equal(range.coverage.excluded.outside_window,2);
  assert.equal((await traceAtlasPaths(g,{...p,max_gap_seconds:59})).paths.length,1);
  assert.deepEqual((await traceAtlasPaths(g,{...p,max_gap_seconds:60,max_duration_seconds:60})).paths.map(p=>p.steps.map(e=>e.event_id)),[['d'],['f','c']]);
});
test('same-time, reverse-block and repeated-reference steps cannot establish temporal paths',async()=>{
  const g=graph(),p=query(g);g.edges=g.edges.filter(e=>['a','e'].includes(e.event_id));g.edges[1].block_time=g.edges[0].block_time;
  assert.equal((await traceAtlasPaths(g,p)).paths.length,0);
  g.edges[1].block_number=99;g.edges[1].block_hash='0x'+'9'.repeat(64);g.edges[1].block_time='2026-09-24T12:01:00Z';assert.equal((await traceAtlasPaths(g,p)).search.pruned.block_order,1);
  const cycle=graph();cycle.edges=cycle.edges.filter(e=>['a','b','c'].includes(e.event_id));cycle.edges[1].to=p.from;
  const r=await traceAtlasPaths(cycle,p);assert.equal(r.paths.length,0);assert.equal(r.search.pruned.repeated_reference,1);
});
test('missing/invalid timestamps, self events and unsupported kinds have separate exclusion counts',async()=>{
  const g=graph();delete g.edges[0].block_time;g.edges[1].block_time='2026-02-30T00:00:00Z';g.edges[2].to=g.edges[2].from;g.edges[3].kind='unsupported';
  const r=await traceAtlasPaths(g,query(g));assert.deepEqual(r.coverage.excluded,{unsupported_kind:1,unsupported_endpoint:0,missing_timestamp:1,invalid_timestamp:1,outside_window:0,below_minimum:0,self_event:1});
  assert.equal(r.coverage.eligible_records,2);
});
test('zero-address intermediaries are not traversed, but direct endpoint observations remain available',async()=>{
  const g=graph(),p=query(g),n=g.nodes.find(n=>n.address.endsWith('02')),zero='ETH:address:0x'+'0'.repeat(40),old=n.id;n.id=zero;n.address='0x'+'0'.repeat(40);
  for(const e of g.edges){if(e.from===old)e.from=zero;if(e.to===old)e.to=zero;}
  const r=await traceAtlasPaths(g,p);assert.deepEqual(r.paths.map(p=>p.steps.map(e=>e.event_id)),[['d'],['f','c']]);assert.equal(r.search.pruned.zero_address_intermediary,1);
  assert.equal((await traceAtlasPaths(g,{from:p.from,to:zero})).paths.length,1);
});
test('UTXO assets have an explicit applicability boundary; token contracts and network identity are checked',async()=>{
  for(const asset of ['BTC','BLCH']){const g=mergePage(null,sample(asset),asset),r=await traceAtlasPaths(g,{from:g.nodes[0].id,to:g.nodes[1].id});assert.equal(r.state,'not_applicable');assert.deepEqual(r.paths,[]);assert.equal(r.search.complete_within_query,false);}
  for(const asset of ['USDT','USDC']){const g=graph(asset);g.snapshots[0].scope.contract=ASSETS[asset].contract;assert.equal((await traceAtlasPaths(g,query(g))).paths.length,4);g.snapshots[0].scope.contract='0x'+'a'.repeat(40);await assert.rejects(traceAtlasPaths(g,query(g)),/path_contract_mismatch/);}
  const g=graph();g.network='bitcoin-mainnet';await assert.rejects(traceAtlasPaths(g,query(g)),/invalid_path_dataset/);
  await assert.rejects(traceAtlasPaths({...g,asset:'constructor',network:undefined},query(g)),/invalid_path_dataset/);
  const typed=graph(),p=query(typed),n=typed.nodes.find(n=>n.address.endsWith('02')),old=n.id;n.kind='transaction';n.txid='0x'+'a'.repeat(64);n.id='ETH:transaction:'+n.txid;delete n.address;
  for(const e of typed.edges){if(e.from===old)e.from=n.id;if(e.to===old)e.to=n.id;}
  const r=await traceAtlasPaths(typed,p);assert.equal(r.paths.length,2);assert.equal(r.coverage.excluded.unsupported_endpoint,3);
});
test('tampered digests, conflicting blocks, duplicate events and invalid parameters fail closed',async()=>{
  const g=graph(),p=query(g);await assert.rejects(traceAtlasPaths(g,p,{dataset_sha256:'0'.repeat(64)}),/integrity/);
  for(const patch of [{max_hops:7},{max_paths:21},{max_gap_seconds:60,max_duration_seconds:59},{minimum:'1e18'},{minimum:'-1'},{start:'2026-02-30T12:00:00Z'},{start:'2026-09-24T12:00:00+01:00'},{from:p.from,to:p.from},{unexpected:1}])assert.throws(()=>pathParameters({...p,...patch}));
  await assert.rejects(traceAtlasPaths(g,{...p,to:p.to.toUpperCase()}),/unobserved/);
  const conflict=structuredClone(g);conflict.edges[4].block_hash='0x'+'a'.repeat(64);await assert.rejects(traceAtlasPaths(conflict,p),/inconsistent_path_block/);
  const badTime=structuredClone(g);badTime.edges[4].block_time='2026-09-24T12:02:01Z';await assert.rejects(traceAtlasPaths(badTime,p),/inconsistent_path_block/);
  const duplicate=structuredClone(g);duplicate.edges.push(duplicate.edges[0]);await assert.rejects(traceAtlasPaths(duplicate,p),/invalid_path_record/);
});
test('candidate-expansion bounds stop dense searches and disclose incomplete no-path results',async()=>{
  const g=graph(),id=value=>g.nodes.find(n=>n.address==='0x'+value.toString(16).padStart(40,'0')).id,template=g.edges[0];g.edges=[];
  g.snapshots[0].anchor={height:105,hash:'0x'+(105).toString(16).padStart(64,'0')};
  for(let layer=0;layer<6;layer++){const from=layer===0?[1]:Array.from({length:6},(_,i)=>2+(layer-1)*6+i),to=Array.from({length:6},(_,i)=>2+layer*6+i);for(const a of from)for(const b of to)g.edges.push({...template,event_id:`${layer}:${a}:${b}`,from:id(a),to:id(b),block_number:100+layer,block_hash:'0x'+(100+layer).toString(16).padStart(64,'0'),block_time:new Date(Date.UTC(2026,8,24,12,layer)).toISOString()});}
  const r=await traceAtlasPaths(g,{from:id(1),to:id(40),max_hops:6});assert.equal(r.paths.length,0);assert.equal(r.search.expansions,PATH_LIMITS.expansions);assert.equal(r.search.stop_reason,'expansion_limit');assert.equal(r.search.complete_within_query,false);
});
test('private paths enforce scope, tenant, manifest integrity and query boundaries without upstream requests',async()=>{
  const h=await setup();try{
    const cookie=await h.login(),response=await h.call('/v1/analyses','POST',{asset:'ETH',pages:1},cookie,{fetcher:async()=>Response.json(pathSource())});assert.equal(response.status,201);const run=await response.json(),path='/v1/atlas/paths?'+new URLSearchParams({analysis:run.id,...query(run.graph)}),before=h.calls();
    assert.equal((await h.call(path)).status,401);
    const key=async scopes=>(await(await h.call('/keys','POST',{label:'Path fixture',days:1,password:credentials.password,scopes},cookie)).json()).key;
    assert.equal((await h.call(path,'GET',undefined,await key(['analyses:read']))).status,403);
    assert.equal((await h.call(path,'GET',undefined,await key(['scores:read']))).status,403);
    const r=await h.call(path,'GET',undefined,await key(['analyses:read','scores:read']));assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);const report=await r.json();assert.equal(report.paths.length,4);assert.equal(report.provenance.analysis_id,run.id);assert.equal(h.calls(),before);
    assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='atlas.paths.read'").get().n,1);
    assert.equal((await h.call(path+'&max_hops=1&max_hops=2','GET',undefined,cookie)).status,400);assert.equal((await h.call(path+'&extra=1','GET',undefined,cookie)).status,400);
    assert.equal((await h.call(path+'&max_hops=1e0','GET',undefined,cookie)).status,400);assert.equal((await h.call(path,'POST',{},cookie)).status,405);
    assert.equal((await h.call(path,'GET',undefined,cookie,{headers:{'x-porb-tenant':crypto.randomUUID()}})).status,409);
    h.sqlite.prepare('UPDATE analyses SET digest=? WHERE id=?').run('0'.repeat(64),run.id);assert.equal((await h.call(path,'GET',undefined,cookie)).status,409);
    h.sqlite.prepare('UPDATE analyses SET digest=? WHERE id=?').run(run.digest,run.id);const altered=structuredClone(run);altered.graph.edges[0].amount_base_units='1';h.sqlite.prepare('UPDATE analysis_parts SET payload=? WHERE analysis_id=? AND part=0').run(JSON.stringify(altered),run.id);assert.equal((await h.call(path,'GET',undefined,cookie)).status,409);
    const other=crypto.randomUUID();h.sqlite.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(other,'Other path tenant','research',Date.now());h.sqlite.prepare('UPDATE analyses SET tenant_id=? WHERE id=?').run(other,run.id);assert.equal((await h.call(path,'GET',undefined,cookie)).status,404);assert.equal(h.calls(),before);
  }finally{h.sqlite.close();}
});
test('private path reads have a separate 20-per-minute organization budget',async()=>{
  const h=await setup();try{const cookie=await h.login(),run=await(await h.call('/v1/analyses','POST',{asset:'ETH',pages:1},cookie,{fetcher:async()=>Response.json(pathSource())})).json(),path='/v1/atlas/paths?'+new URLSearchParams({analysis:run.id,...query(run.graph)});
    for(let i=0;i<20;i++)assert.equal((await h.call(path,'GET',undefined,cookie)).status,200);const r=await h.call(path,'GET',undefined,cookie);assert.equal(r.status,429);assert.ok(Number(r.headers.get('retry-after'))>0);
  }finally{h.sqlite.close();}
});
