import test from 'node:test';
import assert from 'node:assert/strict';
import {exploreAtlasTimeline,timelineParameters,timelineView,timelineCsv} from '../graphus/assets/atlas_timeline.js';
import {mergePage} from '../portal/data.js';
import {digest} from '../portal/security.js';
import {setup,credentials} from './porb_helpers.mjs';
import {timelineSource} from './atlas_timeline_fixture.js';
import {sample} from './system_map_fixture.mjs';
import {ASSETS} from '../graphus/assets/atlas_registry.js';
const graph=asset=>mergePage(null,timelineSource(asset),asset||'ETH');

test('timeline bins preserve complete deterministic evidence, integer totals, input provenance and report checksum',async()=>{
  const g=graph(),original=JSON.stringify(g),r=await exploreAtlasTimeline(g);
  assert.equal(r.window.interval,'hour');assert.equal(r.buckets.length,25);assert.equal(r.buckets[0].observed_events,27);assert.equal(r.buckets[1].observed_events,1);assert.equal(r.buckets[2].observed_events,null);assert.equal(r.buckets[2].state,'unknown');assert.deepEqual(r.buckets[2].groups,[]);
  assert.equal(r.events.length,30);assert.equal(r.groups[0].observed_total_base_units,(29n*900719925474099312345n).toString());assert.equal(r.events[0].amount_base_units,'0');assert.equal(r.events[27].bucket_index,1);assert.equal(r.coverage.complete_history,false);
  const {report_sha256,...body}=r;assert.equal(report_sha256,await digest(JSON.stringify(body)));assert.equal(r.provenance.dataset_sha256,await digest(original));assert.deepEqual(await exploreAtlasTimeline(g),r);assert.equal(JSON.stringify(g),original);
  g.edges.reverse();assert.deepEqual((await exploreAtlasTimeline(g)).events,r.events);
});

test('half-open bins and inclusive UTC query ends retain exact boundary events and disclose clipped bins',async()=>{
  const g=graph(),r=await exploreAtlasTimeline(g,{interval:'minute',start:'2026-09-24T12:00:01Z',end:'2026-09-24T12:01:00Z'});
  assert.equal(r.buckets.length,2);assert.equal(r.events.length,25);assert.equal(r.buckets[0].observed_events,24);assert.equal(r.buckets[1].observed_events,1);assert.equal(r.events.at(-1).event_id,'time-25');
  assert.equal(r.buckets[1].start,r.buckets[0].end_exclusive);assert.equal(r.buckets[1].query_end_inclusive,r.buckets[1].query_start);assert.ok(r.buckets.every(bucket=>bucket.query_clipped));assert.equal(r.coverage.excluded.outside_window,5);
  const empty=await exploreAtlasTimeline(g,{start:'2026-09-25T12:00:02Z'});assert.equal(empty.events.length,0);assert.equal(empty.buckets.length,1);assert.equal(empty.buckets[0].observed_events,null);
  const before=await exploreAtlasTimeline(g,{end:'2026-09-23T12:00:00Z'});assert.equal(before.events.length,0);assert.equal(before.window.start,before.window.end_inclusive);
});

test('reference, direction, event kind and exact minimum filters keep self observations separate and counted once',async()=>{
  const g=graph(),reference=g.nodes[0].id,all=await exploreAtlasTimeline(g,{reference});
  assert.equal(all.groups.find(group=>group.direction==='self').events,1);assert.equal(all.events.filter(event=>event.event_id==='time-29').length,1);
  for(const direction of ['incoming','outgoing','self']){const r=await exploreAtlasTimeline(g,{reference,direction});assert.ok(r.events.every(event=>event.direction===direction));assert.ok(!r.events.some(event=>event.direction==='self')||direction==='self');}
  const min=await exploreAtlasTimeline(g,{minimum:'900719925474099312345'});assert.equal(min.events.length,29);assert.equal(min.coverage.excluded.below_minimum,1);
  assert.equal((await exploreAtlasTimeline(g,{minimum:'900719925474099312346'})).events.length,0);await assert.rejects(exploreAtlasTimeline(g,{reference:'missing'}),/unobserved/);await assert.rejects(exploreAtlasTimeline(g,{kind:'created_output'}),/invalid_timeline_kind/);
});

test('missing and invalid timestamps are explicit, unsupported records are excluded, and untimed captures never receive fabricated dates',async()=>{
  const g=graph();delete g.edges[0].block_time;g.edges[1].block_time='2026-02-30T00:00:00Z';g.edges[2].kind='unsupported';g.edges[3].from=g.nodes[3].id;
  const r=await exploreAtlasTimeline(g);assert.equal(r.coverage.excluded.missing_timestamp,1);assert.equal(r.coverage.excluded.invalid_timestamp,1);assert.equal(r.coverage.excluded.unsupported_kind,1);assert.equal(r.events.length+Object.values(r.coverage.excluded).reduce((a,b)=>a+b,0),g.edges.length);
  for(const event of g.edges)delete event.block_time;const empty=await exploreAtlasTimeline(g);assert.equal(empty.state,'unavailable');assert.equal(empty.window.start,null);assert.equal(empty.window.end_inclusive,null);assert.deepEqual(empty.buckets,[]);assert.deepEqual(empty.events,[]);
  assert.deepEqual(timelineView(empty).events,[]);assert.equal(timelineCsv(empty).split('\r\n').length,1);
});

test('BTC and BLCH retain input/output semantics, outpoints and separate sums when source time exists',async()=>{
  for(const asset of ['BTC','BLCH']){const g=mergePage(null,sample(asset),asset);g.edges.push({...g.edges[0],event_id:'synthetic-input',from:g.nodes[0].id,to:g.nodes.find(node=>node.kind==='transaction').id,kind:asset==='BTC'?'observed_input_prevout':'observed_spent_outpoint_reference',position:0,outpoint:{txid:'c'.repeat(64),vout:1}});for(const edge of g.edges)edge.block_time='2026-09-24T12:00:00Z';const r=await exploreAtlasTimeline(g);
    assert.equal(r.events.length,g.edges.length);assert.equal(r.groups.length,2);assert.equal(r.state,'available');assert.equal(r.groups.reduce((n,row)=>n+row.events,0),g.edges.length);assert.equal(Object.hasOwn(r,'observed_total_base_units'),false);
    for(const group of r.groups)assert.equal(group.observed_total_base_units,g.edges.filter(edge=>edge.kind===group.kind).reduce((sum,edge)=>sum+BigInt(edge.amount_base_units),0n).toString());
    assert.deepEqual(r.events.find(event=>event.event_id==='synthetic-input').outpoint,{txid:'c'.repeat(64),vout:1});
    const transaction=g.nodes.find(node=>node.kind==='transaction'),selected=await exploreAtlasTimeline(g,{reference:transaction.id});assert.ok(selected.groups.some(group=>group.direction==='incoming'));assert.ok(selected.groups.some(group=>group.direction==='outgoing'));
    const input=await exploreAtlasTimeline(g,{kind:r.groups[0].kind});assert.ok(input.events.every(event=>event.kind===r.groups[0].kind));
    for(const edge of g.edges)delete edge.block_time;assert.equal((await exploreAtlasTimeline(g)).state,'unavailable');
  }
});

test('duplicate movement identities and conflicting transactions/blocks reject aggregation even outside requested filters',async()=>{
  let g=graph();g.edges.push({...g.edges[0],event_id:'different label'});await assert.rejects(exploreAtlasTimeline(g,{minimum:'1'}),/duplicate_timeline_event/);
  g=graph('USDC');g.edges[1].txid=g.edges[0].txid;g.edges[1].position=g.edges[0].position;await assert.rejects(exploreAtlasTimeline(g),/duplicate_timeline_event/);
  g.edges[1].position=1;await assert.rejects(exploreAtlasTimeline(g),/inconsistent_timeline_transaction/);
  g=graph();g.edges[1].block_number=g.edges[0].block_number;await assert.rejects(exploreAtlasTimeline(g),/inconsistent_timeline_block/);
  g=graph();g.edges[1].event_id=g.edges[0].event_id;await assert.rejects(exploreAtlasTimeline(g),/invalid_timeline_record/);
  for(const asset of ['BTC','BLCH']){const g=mergePage(null,sample(asset),asset);g.edges[0].outpoint={txid:g.edges[0].txid,vout:0};g.edges[1].outpoint={...g.edges[0].outpoint};await assert.rejects(exploreAtlasTimeline(g),/duplicate_timeline_outpoint/);g.edges[1].outpoint.vout=-1;await assert.rejects(exploreAtlasTimeline(g),/invalid_timeline_outpoint/);}
});

test('token asset binding, retained digests, missing positions and imported provenance remain explicit',async()=>{
  for(const asset of ['USDT','USDC']){const g=graph(asset);g.snapshots[0].scope.contract=ASSETS[asset].contract;const r=await exploreAtlasTimeline(g,{}, {imported:true,selection:{parent:'synthetic'}});assert.equal(r.provenance.imported,true);assert.deepEqual(r.provenance.parent_selection,{parent:'synthetic'});assert.equal(r.asset_id,ASSETS[asset].id);
    delete g.edges[0].position;assert.equal((await exploreAtlasTimeline(g)).coverage.excluded.missing_event_position,1);
    g.snapshots[0].scope.contract='0x'+'f'.repeat(40);await assert.rejects(exploreAtlasTimeline(g),/timeline_contract_mismatch/);
  }
  await assert.rejects(exploreAtlasTimeline(graph(),{}, {dataset_sha256:'0'.repeat(64)}),/timeline_dataset_integrity_failed/);
});

test('interval capacity and invalid parameters fail without silent bin coarsening or partial event output',async()=>{
  await assert.rejects(exploreAtlasTimeline(graph(),{interval:'minute'}),/timeline_bucket_capacity/);
  const r=await exploreAtlasTimeline(graph(),{interval:'day',start:'2026-01-01T00:00:00Z',end:'2027-01-01T23:59:59Z'});assert.equal(r.buckets.length,366);
  await assert.rejects(exploreAtlasTimeline(graph(),{interval:'auto',start:'2026-01-01T00:00:00Z',end:'2027-01-02T00:00:00Z'}),/timeline_bucket_capacity/);
  for(const value of [[],12,{reference:''},{direction:'incoming'},{direction:'risk'},{minimum:'01'},{minimum:'-1'},{interval:'week'},{start:'2026-02-30T00:00:00Z'},{start:'2026-01-01'},{start:'2026-09-24T12:00:00+01:00'},{start:'2026-01-02T00:00:00Z',end:'2026-01-01T00:00:00Z'},{extra:1}])assert.throws(()=>timelineParameters(value));
  const g=graph();g.coverage='x'.repeat(6000000);await assert.rejects(exploreAtlasTimeline(g),/timeline_dataset_capacity/);
  await assert.rejects(exploreAtlasTimeline(graph(),{}, {selection:{label:'x'.repeat(8000000)}}),/timeline_report_capacity/);
});

test('timeline view and CSV retain all matching pages, exact values, safe text and original calculation identity',async()=>{
  const g=graph();g.edges[0].event_id='=SUM(1,2)';const r=await exploreAtlasTimeline(g),original=JSON.stringify(r),view=timelineView(r,{first:0,last:0});assert.equal(view.events.length,27);assert.equal(timelineCsv(r,{first:0,last:0}).split('\r\n').length,28);
  const csv=timelineCsv(r);assert.match(csv,/"'=SUM\(1,2\)"/);assert.ok(csv.includes('900719925474099312345'));assert.ok(csv.includes(r.report_sha256));assert.ok(csv.includes(r.provenance.dataset_sha256));
  assert.equal(timelineView(r,{query:'TIME-29'}).events.length,1);assert.equal(timelineView(r,{first:2,last:2}).events.length,0);assert.equal(JSON.stringify(r),original);assert.throws(()=>timelineView(r,{first:10,last:9}));
});

test('private timelines enforce tenant/key scopes, no-store, organization pinning, audit and a separate query budget without source collection',async()=>{
  const h=await setup();try{const cookie=await h.login(),run=await(await h.call('/v1/analyses','POST',{asset:'ETH',pages:1},cookie,{fetcher:async()=>Response.json(timelineSource())})).json(),path='/v1/atlas/timeline?analysis='+run.id,before=h.calls();
    assert.equal((await h.call(path)).status,401);const response=await h.call(path,'GET',undefined,cookie),r=await response.json();assert.equal(response.status,200);assert.equal(r.events.length,30);assert.equal(r.provenance.analysis_id,run.id);assert.equal(r.provenance.dataset_sha256,run.digest);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(h.calls(),before);
    assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='atlas.timeline.read'").get().n,1);
    for(const scopes of [['analyses:read'],['scores:read'],['analyses:read','scores:read']]){const key=await(await h.call('/keys','POST',{label:'Timeline fixture',days:1,password:credentials.password,scopes},cookie)).json();assert.equal((await h.call(path,'GET',undefined,key.key)).status,scopes.length===2?200:403);}
    for(const extra of ['&unexpected=1','&interval=hour&interval=day','&minimum=-1'])assert.equal((await h.call(path+extra,'GET',undefined,cookie)).status,400);
    assert.equal((await h.call(path,'POST',{},cookie)).status,405);assert.equal((await h.call(path,'GET',undefined,cookie,{headers:{'x-porb-tenant':crypto.randomUUID()}})).status,409);
    h.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=?').run('viewer',h.tenant);assert.equal((await h.call(path,'GET',undefined,cookie)).status,200);
    const other=crypto.randomUUID();h.sqlite.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(other,'Other timeline fixture','research',Date.now());h.sqlite.prepare('UPDATE analyses SET tenant_id=? WHERE id=?').run(other,run.id);assert.equal((await h.call(path,'GET',undefined,cookie)).status,404);h.sqlite.prepare('UPDATE analyses SET tenant_id=? WHERE id=?').run(h.tenant,run.id);
    for(let i=0;i<16;i++)assert.equal((await h.call(path,'GET',undefined,cookie)).status,200);const limited=await h.call(path,'GET',undefined,cookie);assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);
  }finally{h.sqlite.close();}
});

test('saved timeline inputs fail closed after deletion, payload/manifest corruption or incomplete source identities',async()=>{
  const h=await setup();try{const cookie=await h.login(),run=await(await h.call('/v1/analyses','POST',{asset:'ETH',pages:1},cookie,{fetcher:async()=>Response.json(timelineSource())})).json(),path='/v1/atlas/timeline?analysis='+run.id;
    h.sqlite.prepare('UPDATE analyses SET digest=? WHERE id=?').run('f'.repeat(64),run.id);assert.equal((await h.call(path,'GET',undefined,cookie)).status,409);h.sqlite.prepare('DELETE FROM analyses WHERE id=?').run(run.id);assert.equal((await h.call(path,'GET',undefined,cookie)).status,404);
  }finally{h.sqlite.close();}
});
