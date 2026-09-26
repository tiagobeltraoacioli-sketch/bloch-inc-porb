import test from 'node:test';
import assert from 'node:assert/strict';
import {scanAtlasMotifs,motifParameters,MOTIF_LIMITS} from '../graphus/assets/atlas_motifs.js';
import {mergePage} from '../portal/data.js';
import {ASSETS} from '../graphus/assets/atlas_registry.js';
import {setup,credentials} from './porb_helpers.mjs';
import {sample} from './system_map_fixture.mjs';
import {motifSource} from './atlas_motifs_fixture.js';
import {digest} from '../portal/security.js';
const graph=asset=>mergePage(null,motifSource(asset),asset||'ETH'),parameters=(g,type='cycles')=>({reference:g.nodes[0].id,type});

test('cycles retain ordered exact evidence, deterministic results, provenance and a reproducible digest',async()=>{
  const g=graph(),r=await scanAtlasMotifs(g,parameters(g));assert.deepEqual(r.motifs.map(m=>m.events.map(e=>e.event_id)),[['a','b'],['a','c','d']]);
  assert.deepEqual(r.motifs.map(m=>m.hops),[2,3]);assert.equal(r.motifs[1].duration_seconds,120);assert.deepEqual(r.motifs[1].events.map(e=>e.gap_seconds),[null,60,60]);assert.equal(r.motifs[0].references[0],r.motifs[0].references.at(-1));
  assert.equal(r.motifs[0].events[0].amount_base_units,'900719925474099312345');assert.ok(!Object.hasOwn(r.motifs[0],'observed_total_base_units'));
  assert.equal(r.provenance.dataset_sha256,await digest(JSON.stringify(g)));const {report_sha256,...value}=r;assert.equal(report_sha256,await digest(JSON.stringify(value)));assert.deepEqual(await scanAtlasMotifs(g,parameters(g)),r);
  const shuffled=structuredClone(g);shuffled.nodes.reverse();shuffled.edges.reverse();assert.deepEqual((await scanAtlasMotifs(shuffled,parameters(g))).motifs,r.motifs);
});

test('pass-through uses every qualifying distinct-endpoint pair without conserved-value or nearest-prior claims',async()=>{
  const g=graph(),r=await scanAtlasMotifs(g,parameters(g,'pass_through'));
  assert.ok(r.motifs.some(m=>m.events.map(e=>e.event_id).join(',')==='e,a'));assert.ok(r.motifs.some(m=>m.events.map(e=>e.event_id).join(',')==='b,g'));
  for(const m of r.motifs){assert.equal(new Set(m.references).size,3);assert.equal(m.ordered,true);assert.ok(m.events[1].block_number>m.events[0].block_number);assert.ok(!Object.hasOwn(m,'observed_total_base_units'));}
  assert.equal((await scanAtlasMotifs(g,{...parameters(g,'pass_through'),window_seconds:59})).motifs.length,0);
});

test('fan and repeated-pair windows keep half-open UTC boundaries, every event and exact directional sums',async()=>{
  const g=graph(),incoming=await scanAtlasMotifs(g,parameters(g,'fan_in')),outgoing=await scanAtlasMotifs(g,parameters(g,'fan_out')),repeated=await scanAtlasMotifs(g,parameters(g,'repeated_pair'));
  assert.equal(incoming.motifs.length,1);assert.deepEqual(incoming.motifs[0].events.map(e=>e.event_id),['b','d','f']);assert.equal(incoming.motifs[0].observed_total_base_units,(3n*900719925474099312345n).toString());assert.equal(incoming.motifs[0].window.start,'2026-09-24T12:00:00.000Z');
  assert.equal(outgoing.motifs[0].counterparties.length,3);assert.equal(outgoing.motifs[0].events.length,4);assert.equal(outgoing.motifs[0].ordered,false);assert.ok(outgoing.motifs[0].events.every(e=>e.gap_seconds===null));
  assert.equal(repeated.motifs.length,1);assert.deepEqual(repeated.motifs[0].events.map(e=>e.event_id),['g','i']);assert.equal(repeated.motifs[0].direction,'outgoing');assert.equal(repeated.motifs[0].observed_total_base_units,(2n*900719925474099312345n).toString());
  assert.equal((await scanAtlasMotifs(g,{...parameters(g,'repeated_pair'),min_events:3})).motifs.length,0);
  assert.equal((await scanAtlasMotifs(g,{...parameters(g,'fan_out'),min_counterparties:4})).motifs.length,0);
  assert.equal((await scanAtlasMotifs(g,{...parameters(g,'repeated_pair'),window_seconds:60})).motifs.length,0);
});

test('result caps disclose an additional match while an exactly full search remains complete',async()=>{
  const g=graph();const limited=await scanAtlasMotifs(g,{...parameters(g),max_results:1}),exact=await scanAtlasMotifs(g,{...parameters(g),max_results:2});
  assert.equal(limited.motifs.length,1);assert.equal(limited.search.stop_reason,'result_limit');assert.equal(limited.search.complete_within_query,false);assert.equal(exact.search.truncated,false);
  const groups=await scanAtlasMotifs(g,{...parameters(g,'repeated_pair'),reference:g.nodes[1].id});assert.equal(groups.search.complete_within_query,true);
});

test('UTC windows, exact integer thresholds, cycle depth and strict chronological block order constrain results',async()=>{
  const g=graph();assert.equal((await scanAtlasMotifs(g,{...parameters(g),max_hops:2})).motifs.length,1);
  assert.equal((await scanAtlasMotifs(g,{...parameters(g),window_seconds:59})).motifs.length,0);
  const window=await scanAtlasMotifs(g,{...parameters(g,'fan_in'),start:'2026-09-24T12:00:00Z',end:'2026-09-24T12:03:00Z'});assert.equal(window.motifs[0].events.length,3);assert.equal(window.coverage.excluded.outside_window,4);assert.equal(window.motifs[0].window.query_clipped,true);
  assert.equal((await scanAtlasMotifs(g,{...parameters(g),minimum:'900719925474099312346'})).motifs.length,0);
  const equal=graph();equal.edges=equal.edges.filter(e=>['a','b'].includes(e.event_id));equal.edges[1].block_time=equal.edges[0].block_time;assert.equal((await scanAtlasMotifs(equal,parameters(equal))).motifs.length,0);
  equal.edges[1].block_number=98;equal.edges[1].block_hash='0x'+(98).toString(16).padStart(64,'0');equal.edges[1].block_time='2026-09-24T12:01:00Z';assert.equal((await scanAtlasMotifs(equal,parameters(equal))).search.pruned.block_order,1);
});

test('zero endpoints, self events, unsupported kinds, missing time and missing token positions are disclosed',async()=>{
  const g=graph();delete g.edges[0].block_time;g.edges[1].to=g.edges[1].from;g.edges[2].kind='unsupported';g.edges[3].block_time='2026-02-30T12:00:00Z';
  const n=g.nodes[3],old=n.id;n.address='0x'+'0'.repeat(40);n.id='ETH:address:'+n.address;g.edges[4].from=n.id;
  const r=await scanAtlasMotifs(g,parameters(g));assert.deepEqual(r.coverage.excluded,{unsupported_kind:1,unsupported_endpoint:0,missing_timestamp:1,invalid_timestamp:1,outside_window:0,below_minimum:0,self_event:1,zero_address:1,missing_event_position:0});
  const zero=await scanAtlasMotifs(g,{reference:n.id});assert.equal(zero.state,'not_applicable');assert.equal(zero.search.complete_within_query,false);
  const token=graph('USDC');delete token.edges[0].position;assert.equal((await scanAtlasMotifs(token,parameters(token))).coverage.excluded.missing_event_position,1);assert.equal(old.endsWith('04'),true);
});

test('duplicate transfer identities and conflicting transaction/block claims fail closed for native and token events',async()=>{
  const g=graph();g.edges[1].txid=g.edges[0].txid;await assert.rejects(scanAtlasMotifs(g,parameters(g)),/duplicate_motif_transfer/);
  const token=graph('USDT');token.edges[1].txid=token.edges[0].txid;token.edges[1].position=token.edges[0].position;await assert.rejects(scanAtlasMotifs(token,parameters(token)),/duplicate_motif_transfer/);
  token.edges[1].position=1;await assert.rejects(scanAtlasMotifs(token,parameters(token)),/inconsistent_motif_transaction/);
  token.edges[1].block_number=token.edges[0].block_number;token.edges[1].block_hash=token.edges[0].block_hash;token.edges[1].block_time=token.edges[0].block_time;assert.equal((await scanAtlasMotifs(token,parameters(token,'repeated_pair'))).state,'available');
  const conflict=graph();conflict.edges[2].block_hash='0x'+'f'.repeat(64);await assert.rejects(scanAtlasMotifs(conflict,parameters(conflict)),/inconsistent_motif_block/);
});

test('source integrity, asset contracts, applicability and malformed parameters remain explicit',async()=>{
  const g=graph();await assert.rejects(scanAtlasMotifs(g,parameters(g),{dataset_sha256:'0'.repeat(64)}),/integrity/);
  for(const asset of ['BTC','BLCH']){const g=mergePage(null,sample(asset),asset),r=await scanAtlasMotifs(g,parameters(g));assert.equal(r.state,'not_applicable');assert.equal(r.motifs.length,0);assert.equal(r.search.expansions,0);}
  for(const asset of ['USDT','USDC']){const g=graph(asset);g.snapshots[0].scope.contract=ASSETS[asset].contract;assert.equal((await scanAtlasMotifs(g,parameters(g))).motifs.length,2);g.snapshots[0].scope.contract='0x'+'f'.repeat(40);await assert.rejects(scanAtlasMotifs(g,parameters(g)),/motif_contract_mismatch/);}
  for(const patch of [{reference:''},{type:'risk'},{max_hops:1},{max_results:21},{window_seconds:604801},{min_events:101},{min_counterparties:1},{minimum:'-1'},{minimum:'1e18'},{start:'2026-02-30T12:00:00Z'},{end:'2026-09-24T12:00:00+01:00'},{unrecognized:true}])assert.throws(()=>motifParameters({...parameters(g),...patch}));
  await assert.rejects(scanAtlasMotifs(g,{reference:'unobserved'}),/unobserved/);assert.equal((await scanAtlasMotifs(g,parameters(g),{imported:true,selection:{parent:'test'}})).provenance.imported,true);
});

test('dense cycle searches stop at the expansion limit and keep a no-result report explicitly incomplete',async()=>{
  const g=graph(),id=n=>g.nodes[n-1].id,template=g.edges[0];g.edges=[];let sequence=0;
  for(let layer=0;layer<6;layer++){const from=layer===0?[1]:Array.from({length:6},(_,i)=>2+(layer-1)*6+i),to=Array.from({length:6},(_,i)=>2+layer*6+i);
    for(const a of from)for(const b of to){sequence++;g.edges.push({...template,event_id:'dense-'+sequence,txid:'0x'+sequence.toString(16).padStart(64,'0'),from:id(a),to:id(b),position:sequence,block_number:100+layer,block_hash:'0x'+(100+layer).toString(16).padStart(64,'0'),block_time:new Date(Date.UTC(2026,8,24,12,layer)).toISOString()});}}
  const r=await scanAtlasMotifs(g,{...parameters(g),max_hops:6});assert.equal(r.motifs.length,0);assert.equal(r.search.expansions,MOTIF_LIMITS.expansions);assert.equal(r.search.stop_reason,'expansion_limit');assert.equal(r.search.complete_within_query,false);
});

test('private motif queries verify retained evidence and enforce scopes, tenant pinning, audit and query budgets',async()=>{
  const h=await setup();try{
    const cookie=await h.login(),run=await(await h.call('/v1/analyses','POST',{asset:'ETH',pages:1},cookie,{fetcher:async()=>Response.json(motifSource())})).json(),path='/v1/atlas/motifs?'+new URLSearchParams({analysis:run.id,...parameters(run.graph)}),before=h.calls();
    assert.equal((await h.call(path)).status,401);const response=await h.call(path,'GET',undefined,cookie);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);const report=await response.json();assert.equal(report.provenance.analysis_id,run.id);assert.equal(report.motifs.length,2);assert.equal(h.calls(),before);
    assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='atlas.motifs.read'").get().n,1);
    for(const scopes of [['analyses:read'],['scores:read']]){const key=await(await h.call('/keys','POST',{label:'Motif read',days:1,password:credentials.password,scopes},cookie)).json();assert.equal((await h.call(path,'GET',undefined,key.key)).status,403);}
    assert.equal((await h.call(path+'&unexpected=1','GET',undefined,cookie)).status,400);assert.equal((await h.call(path+'&type=cycles','GET',undefined,cookie)).status,400);assert.equal((await h.call(path,'POST',{},cookie)).status,405);
    const other=crypto.randomUUID();assert.equal((await h.call(path,'GET',undefined,cookie,{headers:{'x-porb-tenant':other}})).status,409);
    h.sqlite.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(other,'Other motif organization','research',Date.now());h.sqlite.prepare('UPDATE analyses SET tenant_id=? WHERE id=?').run(other,run.id);assert.equal((await h.call(path,'GET',undefined,cookie)).status,404);h.sqlite.prepare('UPDATE analyses SET tenant_id=? WHERE id=?').run(h.tenant,run.id);
    for(let i=0;i<18;i++)assert.equal((await h.call(path,'GET',undefined,cookie)).status,200);assert.equal((await h.call(path,'GET',undefined,cookie)).status,429);
  }finally{h.sqlite.close();}
});

test('tampered saved analysis manifests cannot feed the motif API',async()=>{
  const h=await setup();try{
    const cookie=await h.login(),run=await(await h.call('/v1/analyses','POST',{asset:'ETH',pages:1},cookie,{fetcher:async()=>Response.json(motifSource())})).json();h.sqlite.prepare('UPDATE analyses SET digest=? WHERE id=?').run('f'.repeat(64),run.id);
    assert.equal((await h.call('/v1/atlas/motifs?'+new URLSearchParams({analysis:run.id,...parameters(run.graph)}),'GET',undefined,cookie)).status,409);
  }finally{h.sqlite.close();}
});
