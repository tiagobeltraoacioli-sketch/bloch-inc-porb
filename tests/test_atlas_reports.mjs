import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,credentials} from './porb_helpers.mjs';
import {pathSource} from './atlas_paths_fixture.js';
import {digest} from '../portal/security.js';
import {compareAnalyses} from '../portal/atlas-comparison.js';

const base='/v1/atlas/reports';
async function fixture(h,kind='paths',pages=1){
  const cookie=await h.login(),run=await(await h.call('/v1/analyses','POST',{asset:'ETH',pages},cookie,kind==='paths'?{fetcher:async()=>Response.json(pathSource())}:{})).json();
  const parameters=kind==='paths'?{analysis:run.id,from:run.graph.nodes.find(n=>n.address.endsWith('01')).id,to:run.graph.nodes.find(n=>n.address.endsWith('04')).id}:{baseline:run.id,current:run.id};
  const preview=await(await h.call('/v1/atlas/'+(kind==='paths'?'paths':'compare')+'?'+new URLSearchParams(parameters),'GET',undefined,cookie)).json();
  const body={request_id:crypto.randomUUID(),kind,title:'Saved calculation',purpose:'Source evidence review',lawful_basis:'Test declaration',source_licence:'Test fixture only',retention_days:30,parameters,expected_report_sha256:preview.report_sha256};
  const call=(path=base,method='GET',input)=>h.call(path,method,input,cookie);
  return {cookie,run,preview,body,call};
}
test('durable path reports reproduce verified previews, survive analysis retention and replay without new evidence reads',async()=>{
  const h=await setup();try{
    const f=await fixture(h),calls=h.calls(),response=await f.call(base,'POST',f.body);assert.equal(response.status,201);
    const saved=await response.json();assert.equal(saved.summary.paths,4);assert.equal(saved.duplicate,false);assert.equal(saved.review_subject,'atlas-report:'+saved.id);assert.ok(!Object.hasOwn(saved,'request_digest'));
    h.sqlite.prepare('DELETE FROM analyses WHERE id=?').run(f.run.id);
    const exported=await f.call(base+'/'+saved.id+'/export');assert.equal(exported.status,200);assert.match(exported.headers.get('content-disposition'),/attachment/);assert.match(exported.headers.get('cache-control'),/no-store/);
    const value=await exported.json();assert.deepEqual(value.report,f.preview);assert.equal(value.integrity.verified,true);assert.equal(await digest(JSON.stringify(value.report)),saved.payload_sha256);assert.equal(value.report.paths[0].steps[0].amount_base_units,'900719925474099312345');
    const retried=await f.call(base,'POST',f.body);assert.equal(retried.status,200);assert.equal((await retried.json()).id,saved.id);assert.equal(h.calls(),calls);
    assert.equal((await f.call(base,'POST',{...f.body,title:'A different title'})).status,409);
    const list=await(await f.call()).json();assert.equal(list.reports.length,1);assert.equal(list.retention.retained,1);assert.ok(!Object.hasOwn(list.reports[0],'report'));
    assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='atlas.report.create'").get().n,1);
  }finally{h.sqlite.close();}
});
test('comparison reports retain all chunks, exact deltas and two independent digests',async()=>{
  const h=await setup();try{
    const f=await fixture(h,'comparison',8),response=await f.call(base,'POST',f.body);assert.equal(response.status,201);
    const saved=await response.json();assert.ok(saved.part_count>1);assert.equal(saved.summary.events,312);
    const value=await(await f.call(base+'/'+saved.id)).json();assert.deepEqual(value.report,f.preview);assert.equal(value.report.amounts[0].amount_base_units.delta,'0');
    const {report_sha256,...report}=value.report;assert.equal(await digest(JSON.stringify(report)),report_sha256);
    h.sqlite.prepare('DELETE FROM atlas_report_parts WHERE report_id=? AND part=1').run(saved.id);
    assert.equal((await f.call(base+'/'+saved.id)).status,409);
  }finally{h.sqlite.close();}
});
test('client payloads, unreviewed previews, invalid bounds and tampered source manifests cannot create reports',async()=>{
  const h=await setup();try{
    const f=await fixture(h);
    for(const body of [{...f.body,report:{}},{...f.body,retention_days:0},{...f.body,retention_days:366},{...f.body,parameters:{...f.body.parameters,extra:true}},{...f.body,title:'  '}])assert.equal((await f.call(base,'POST',body)).status,400);
    assert.equal((await f.call(base,'POST',{...f.body,expected_report_sha256:'0'.repeat(64)})).status,409);
    assert.equal((await f.call(base,'POST',{...f.body,parameters:{...f.body.parameters,max_paths:1}})).status,409);
    h.sqlite.prepare('UPDATE analyses SET digest=? WHERE id=?').run('f'.repeat(64),f.run.id);
    assert.equal((await f.call(base,'POST',f.body)).status,409);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_reports').get().n,0);
  }finally{h.sqlite.close();}
});
test('saved reports require every read scope and write scope, enforce tenant pinning and remain read-only for viewers',async()=>{
  const h=await setup();try{
    const f=await fixture(h),saved=await(await f.call(base,'POST',f.body)).json(),path=base+'/'+saved.id;
    assert.equal((await h.call(base)).status,401);
    const scopes=['cases:read','analyses:read','scores:read'];
    for(const omitted of scopes){const key=await(await h.call('/keys','POST',{label:'Report read test',days:1,password:credentials.password,scopes:scopes.filter(s=>s!==omitted)},f.cookie)).json();assert.equal((await h.call(path,'GET',undefined,key.key)).status,403);}
    const key=await(await h.call('/keys','POST',{label:'Report read test',days:1,password:credentials.password,scopes},f.cookie)).json();assert.equal((await h.call(path,'GET',undefined,key.key)).status,200);assert.equal((await h.call(base,'POST',f.body,key.key)).status,403);
    assert.equal((await h.call(path,'GET',undefined,f.cookie,{headers:{'x-porb-tenant':crypto.randomUUID()}})).status,409);
    h.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=?').run('viewer',h.tenant);assert.equal((await f.call(path)).status,200);assert.equal((await f.call(path,'DELETE',{payload_sha256:saved.payload_sha256})).status,403);
    const other=crypto.randomUUID();h.sqlite.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(other,'Other test tenant','research',Date.now());h.sqlite.prepare('UPDATE atlas_reports SET tenant_id=? WHERE id=?').run(other,saved.id);
    assert.equal((await f.call(path)).status,404);assert.equal((await(await f.call()).json()).reports.length,0);
  }finally{h.sqlite.close();}
});
test('payload corruption, inner hash corruption and manifest mismatch fail closed on reads and exports',async()=>{
  const h=await setup();try{
    const f=await fixture(h),saved=await(await f.call(base,'POST',f.body)).json(),path=base+'/'+saved.id,raw=JSON.stringify(f.preview);
    h.sqlite.prepare('UPDATE atlas_report_parts SET payload=? WHERE report_id=?').run(raw.replace('900719925474099312345','900719925474099312346'),saved.id);
    assert.equal((await f.call(path+'/export')).status,409);
    const corrupted={...f.preview,report_sha256:'f'.repeat(64)},payload=JSON.stringify(corrupted);
    h.sqlite.prepare('UPDATE atlas_report_parts SET payload=? WHERE report_id=?').run(payload,saved.id);h.sqlite.prepare('UPDATE atlas_reports SET payload_sha256=? WHERE id=?').run(await digest(payload),saved.id);assert.equal((await f.call(path)).status,409);
    h.sqlite.prepare('UPDATE atlas_report_parts SET payload=? WHERE report_id=?').run(raw,saved.id);h.sqlite.prepare('UPDATE atlas_reports SET payload_sha256=?,asset=? WHERE id=?').run(saved.payload_sha256,'BTC',saved.id);assert.equal((await f.call(path)).status,409);
  }finally{h.sqlite.close();}
});
test('expiry hides data immediately, counts toward capacity, and administrative purge cascades payloads but keeps audit',async()=>{
  const h=await setup();try{
    const f=await fixture(h),saved=await(await f.call(base,'POST',f.body)).json();
    h.sqlite.prepare('UPDATE atlas_reports SET expires_at=? WHERE id=?').run(Date.now()-1,saved.id);
    const list=await(await f.call()).json();assert.equal(list.reports.length,0);assert.equal(list.retention.expired,1);assert.equal(list.retention.retained,1);
    assert.equal((await f.call(base+'/'+saved.id)).status,404);assert.equal((await f.call(base+'/'+saved.id+'/export')).status,404);assert.equal((await f.call(base,'POST',f.body)).status,409);
    const columns=h.sqlite.prepare('PRAGMA table_info(atlas_reports)').all().map(row=>row.name),original=h.sqlite.prepare('SELECT * FROM atlas_reports').get();
    for(let i=0;i<19;i++)h.sqlite.prepare(`INSERT INTO atlas_reports(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...columns.map(key=>key==='id'||key==='request_id'?crypto.randomUUID():original[key]));
    assert.equal((await f.call(base,'POST',{...f.body,request_id:crypto.randomUUID()})).status,409);
    const purged=await(await f.call('/v1/atlas/purge','POST',{})).json();assert.equal(purged.deleted_reports,20);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_report_parts').get().n,0);assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='atlas.report.create'").get().n,1);
  }finally{h.sqlite.close();}
});
test('deletion requires the exact retained digest and save retries do not consume the six-new-requests budget',async()=>{
  const h=await setup();try{
    const f=await fixture(h);let saved;
    for(let i=0;i<6;i++){const body={...f.body,request_id:crypto.randomUUID()},response=await f.call(base,'POST',body);assert.equal(response.status,201);saved=await response.json();assert.equal((await f.call(base,'POST',body)).status,200);}
    const limited=await f.call(base,'POST',f.body);assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);
    assert.equal((await f.call(base+'/'+saved.id,'DELETE',{payload_sha256:'0'.repeat(64)})).status,409);
    assert.equal((await f.call(base+'/'+saved.id,'DELETE',{payload_sha256:saved.payload_sha256})).status,200);
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_report_parts WHERE report_id=?').get(saved.id).n,0);assert.equal((await f.call(base+'/'+saved.id)).status,404);
    assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='atlas.report.delete'").get().n,1);
  }finally{h.sqlite.close();}
});
test('concurrent retries create one atomic report, and failed chunk writes roll back metadata and audit',async()=>{
  const h=await setup();try{
    const f=await fixture(h),responses=await Promise.all([f.call(base,'POST',f.body),f.call(base,'POST',f.body)]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,201]);const values=await Promise.all(responses.map(r=>r.json()));assert.equal(values[0].id,values[1].id);
    h.sqlite.exec("CREATE TRIGGER fail_report_part BEFORE INSERT ON atlas_report_parts BEGIN SELECT RAISE(ABORT,'fixture-write-failure'); END");
    assert.equal((await f.call(base,'POST',{...f.body,request_id:crypto.randomUUID()})).status,503);
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_reports').get().n,1);assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='atlas.report.create'").get().n,1);
  }finally{h.sqlite.close();}
});
test('reports beyond the storage bound fail without truncating or persisting partial evidence',async()=>{
  const h=await setup();try{
    const f=await fixture(h,'comparison');f.run.graph.snapshots[0].scope.fixture_padding='x'.repeat(3100000);f.run.digest=await digest(JSON.stringify(f.run.graph));
    const payload=JSON.stringify(f.run);h.sqlite.prepare('UPDATE analyses SET digest=? WHERE id=?').run(f.run.digest,f.run.id);h.sqlite.prepare('DELETE FROM analysis_parts WHERE analysis_id=?').run(f.run.id);
    for(let i=0;i*200000<payload.length;i++)h.sqlite.prepare('INSERT INTO analysis_parts(analysis_id,part,payload) VALUES(?,?,?)').run(f.run.id,i,payload.slice(i*200000,(i+1)*200000));
    const report=await compareAnalyses(f.run,f.run);assert.ok(JSON.stringify(report).length>6000000);
    const response=await f.call(base,'POST',{...f.body,expected_report_sha256:report.report_sha256});assert.equal(response.status,422);assert.equal((await response.json()).error,'report_storage_capacity');
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_reports').get().n,0);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_report_parts').get().n,0);
  }finally{h.sqlite.close();}
});
test('UTF-8 report chunks preserve non-BMP source text at a SQL part boundary',async()=>{
  const h=await setup();try{
    const f=await fixture(h,'comparison'),scope=f.run.graph.snapshots[0].scope;scope.fixture_note='marker';f.run.digest=await digest(JSON.stringify(f.run.graph));
    const initial=JSON.stringify(await compareAnalyses(f.run,f.run)),offset=initial.indexOf('marker');assert.ok(offset>0&&offset<199999);
    scope.fixture_note='x'.repeat(199999-offset)+'🔎 evidence';f.run.digest=await digest(JSON.stringify(f.run.graph));
    const report=await compareAnalyses(f.run,f.run);assert.equal(JSON.stringify(report).indexOf('🔎'),199999);
    h.sqlite.prepare('UPDATE analyses SET digest=? WHERE id=?').run(f.run.digest,f.run.id);h.sqlite.prepare('UPDATE analysis_parts SET payload=? WHERE analysis_id=? AND part=0').run(JSON.stringify(f.run),f.run.id);
    const response=await f.call(base,'POST',{...f.body,expected_report_sha256:report.report_sha256});assert.equal(response.status,201);const saved=await response.json();assert.ok(saved.part_count>1);
    const exported=await f.call(base+'/'+saved.id+'/export');assert.equal(exported.status,200);assert.deepEqual((await exported.json()).report,report);
  }finally{h.sqlite.close();}
});
