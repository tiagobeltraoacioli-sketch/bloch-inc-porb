import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setup,credentials} from './porb_helpers.mjs';
import {timelineSource} from './atlas_timeline_fixture.js';
import {compareTimelineWindows,timelineComparisonCsv} from '../graphus/assets/atlas_timeline_compare.js';
import {retainWindowComparison,windowParametersFromComparison,windowReportParameters} from '../graphus/assets/atlas_window_record.js';
import {digest} from '../portal/security.js';
const base='/v1/atlas/reports';
const declarations={title:'Retained time windows',purpose:'Synthetic window review',lawful_basis:'Test declaration',source_licence:'Synthetic fixture',retention_days:30};
async function fixture(h,asset='ETH'){
  const cookie=await h.login(),call=(path,method='GET',body)=>h.call(path,method,body,cookie);
  const run=await(await h.call('/v1/analyses','POST',{asset,pages:1},cookie,{fetcher:async()=>Response.json(timelineSource(asset))})).json();
  const timeline=await(await call('/v1/atlas/timeline?analysis='+run.id)).json();
  async function input(source={analysis:run.id},query=''){
    const comparison=await compareTimelineWindows(timeline,{first:0,last:0,query},{first:1,last:2,query}),parameters=windowParametersFromComparison(comparison,source),report=await retainWindowComparison(comparison,parameters);
    return {report,body:{...declarations,request_id:crypto.randomUUID(),kind:'window_comparison',parameters,expected_report_sha256:report.report_sha256}};
  }
  async function save(input){const response=await call(base,'POST',input.body);assert.equal(response.status,201,JSON.stringify(await response.clone().json()));return response.json();}
  async function parent(){const response=await call(base,'POST',{...declarations,request_id:crypto.randomUUID(),kind:'timeline',parameters:{analysis:run.id,...timeline.parameters},expected_report_sha256:timeline.report_sha256});assert.equal(response.status,201);return response.json();}
  return {cookie,call,run,timeline,input,save,parent};
}
test('window records retain the exact child, copied parameters and both hash layers',async()=>{
  const h=await setup();try{
    const f=await fixture(h),input=await f.input(),child=input.report.comparison,{report_sha256,...body}=input.report;
    assert.equal(await digest(JSON.stringify(body)),report_sha256);assert.equal(child.provenance.timeline_report_sha256,f.timeline.report_sha256);
    const parameters=structuredClone(input.body.parameters),value=structuredClone(child),pending=retainWindowComparison(value,parameters);value.baseline.events[0].amount_base_units='999';parameters.baseline.last=1;
    assert.deepEqual(await pending,input.report);
    await assert.rejects(()=>retainWindowComparison(value,input.body.parameters),/integrity_failed/);
    await assert.rejects(()=>retainWindowComparison(child,{...input.body.parameters,analysis:crypto.randomUUID()}),/source_mismatch/);
    await assert.rejects(()=>retainWindowComparison(child,{...input.body.parameters,baseline:{first:0,last:0,query:'different'},comparison:{first:1,last:2,query:'different'}}),/parameters_mismatch/);
    for(const parameters of [{},{...input.body.parameters,extra:true},{...input.body.parameters,timeline_report:crypto.randomUUID()},{...input.body.parameters,baseline:{first:0,last:1}},{...input.body.parameters,baseline:{first:0,last:0,query:'different'}},{...input.body.parameters,comparison:{first:1,last:366}}])assert.throws(()=>windowReportParameters(parameters));
  }finally{h.sqlite.close();}
});
test('live-source window reports for ETH and both tokens replay independently after source deletion',async()=>{
  for(const asset of ['ETH','USDT','USDC']){const h=await setup();try{
    const f=await fixture(h,asset),input=await f.input(),calls=h.calls(),row=await f.save(input);assert.equal(row.kind,'window_comparison');assert.equal(row.summary.baseline_events,27);assert.equal(row.summary.comparison_events,1);assert.equal(row.summary.equal_durations,false);
    h.sqlite.prepare('DELETE FROM analyses WHERE id=?').run(f.run.id);const response=await f.call(base+'/'+row.id+'/export'),value=await response.json();assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.deepEqual(value.report,input.report);assert.equal(value.payload_sha256,await digest(JSON.stringify(input.report)));assert.equal(timelineComparisonCsv(value.report.comparison),timelineComparisonCsv(input.report.comparison));
    const retry=await f.call(base,'POST',input.body);assert.equal(retry.status,200);assert.equal((await retry.json()).id,row.id);assert.equal((await f.call(base,'POST',{...input.body,title:'Changed request title'})).status,409);assert.equal(h.calls(),calls);assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='atlas.report.create'").get().n,1);
  }finally{h.sqlite.close();}}
});
test('saved-timeline sources preserve filtered and empty windows after both ancestors are removed',async()=>{
  const h=await setup();try{
    const f=await fixture(h),parent=await f.parent();h.sqlite.prepare('DELETE FROM analyses WHERE id=?').run(f.run.id);
    for(const query of ['time-27','not-observed']){const input=await f.input({timeline_report:parent.id},query),row=await f.save(input),value=await(await f.call(base+'/'+row.id)).json();assert.deepEqual(value.report,input.report);assert.equal(value.report.comparison.baseline.observed_events,0);assert.equal(value.report.comparison.comparison.observed_events,query==='time-27'?1:0);}
    const input=await f.input({timeline_report:parent.id}),row=await f.save(input);assert.equal((await f.call(base+'/'+parent.id,'DELETE',{payload_sha256:parent.payload_sha256})).status,200);assert.deepEqual((await(await f.call(base+'/'+row.id)).json()).report,input.report);assert.equal((await f.call(base,'POST',input.body)).status,200);assert.equal((await f.call(base,'POST',{...input.body,request_id:crypto.randomUUID()})).status,404);
  }finally{h.sqlite.close();}
});
test('window recomputation rejects changed previews, corrupt evidence, extra data and wrong report sources',async()=>{
  const h=await setup();try{
    const f=await fixture(h),input=await f.input();assert.equal((await f.call(base,'POST',{...input.body,report:{}})).status,400);assert.equal((await f.call(base,'POST',{...input.body,report:input.report})).status,413);
    assert.equal((await f.call(base,'POST',{...input.body,expected_report_sha256:'f'.repeat(64)})).status,409);
    const row=await f.save(input);assert.equal((await f.call(base,'POST',{...input.body,request_id:crypto.randomUUID(),parameters:{timeline_report:row.id,baseline:{first:0,last:0},comparison:{first:1,last:2}}})).status,422);
    const parent=await f.parent(),saved=await f.input({timeline_report:parent.id});h.sqlite.prepare('UPDATE atlas_report_parts SET payload=? WHERE report_id=?').run('{}',parent.id);assert.equal((await f.call(base,'POST',saved.body)).status,409);
    h.sqlite.prepare('UPDATE analyses SET digest=? WHERE id=?').run('e'.repeat(64),f.run.id);assert.equal((await f.call(base,'POST',{...input.body,request_id:crypto.randomUUID()})).status,409);
  }finally{h.sqlite.close();}
});
test('saved-source deletion between verification and commit cannot create a retained child or orphan chunks',async()=>{
  const h=await setup();try{
    const f=await fixture(h),parent=await f.parent(),input=await f.input({timeline_report:parent.id}),batch=h.db.batch.bind(h.db);
    h.db.batch=async statements=>{h.sqlite.prepare('DELETE FROM atlas_reports WHERE id=?').run(parent.id);return batch(statements);};
    const response=await f.call(base,'POST',input.body);assert.equal(response.status,409);assert.equal((await response.json()).error,'window_source_changed_or_capacity');assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_reports').get().n,0);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_report_parts').get().n,0);assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='atlas.report.create'").get().n,1);
  }finally{h.sqlite.close();}
});
test('retained windows enforce all scopes, tenant ownership and viewer write restrictions',async()=>{
  const h=await setup();try{
    const f=await fixture(h),input=await f.input(),row=await f.save(input),parent=await f.parent(),saved=await f.input({timeline_report:parent.id});
    assert.equal((await h.call(base+'/'+row.id)).status,401);
    for(const missing of ['cases:read','analyses:read','scores:read','cases:write']){const key=await(await h.call('/keys','POST',{label:'Window report scope',days:1,password:credentials.password,scopes:['cases:read','analyses:read','scores:read','cases:write'].filter(s=>s!==missing)},f.cookie)).json();assert.equal((await h.call(base,'POST',input.body,key.key)).status,403);assert.equal((await h.call(base+'/'+row.id,'GET',undefined,key.key)).status,missing==='cases:write'?200:403);}
    h.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=?').run('viewer',h.tenant);assert.equal((await f.call(base+'/'+row.id)).status,200);assert.equal((await f.call(base,'POST',saved.body)).status,403);assert.equal((await f.call(base+'/'+row.id,'DELETE',{payload_sha256:row.payload_sha256})).status,403);
    h.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=?').run('owner',h.tenant);const other=crypto.randomUUID();h.sqlite.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(other,'Other window organization','research',Date.now());h.sqlite.prepare('UPDATE atlas_reports SET tenant_id=? WHERE id=?').run(other,parent.id);assert.equal((await f.call(base,'POST',saved.body)).status,404);
  }finally{h.sqlite.close();}
});
test('window dossiers, reviews, expiry, nested corruption and purge preserve the existing evidence contract',async()=>{
  const h=await setup();try{
    const f=await fixture(h),input=await f.input(),row=await f.save(input),caseRow=await(await f.call('/v1/cases','POST',{title:'Window comparison dossier'})).json(),path='/v1/atlas/cases/'+caseRow.id;
    assert.equal((await f.call(path+'/reports','POST',{report_id:row.id,payload_sha256:row.payload_sha256})).status,201);
    const review=await(await f.call('/v1/atlas/records','POST',{kind:'review',subject:row.review_subject,body:'Synthetic windows await review',purpose:'Test review scope',lawful_basis:'Test declaration',source_licence:'Synthetic fixture',status:'open',retention_days:1})).json();
    h.sqlite.prepare('DELETE FROM analyses').run();const bundle=await(await f.call(path+'/export')).json();assert.deepEqual(bundle.links[0].report.report,input.report);assert.equal(bundle.links[0].records[0].id,review.id);const {bundle_sha256,...content}=bundle;assert.equal(await digest(JSON.stringify(content)),bundle_sha256);
    // Even rehashed outer bytes cannot conceal a changed inner comparison.
    const broken=structuredClone(input.report);broken.comparison.baseline.events[0].amount_base_units='999';delete broken.report_sha256;broken.report_sha256=await digest(JSON.stringify(broken));const payload=JSON.stringify(broken);
    h.sqlite.prepare('UPDATE atlas_report_parts SET payload=? WHERE report_id=?').run(payload,row.id);h.sqlite.prepare('UPDATE atlas_reports SET report_sha256=?,payload_sha256=?,payload_bytes=? WHERE id=?').run(broken.report_sha256,await digest(payload),Buffer.byteLength(payload),row.id);assert.equal((await f.call(base+'/'+row.id)).status,409);
    h.sqlite.prepare('UPDATE atlas_reports SET expires_at=0 WHERE id=?').run(row.id);assert.equal((await f.call(base+'/'+row.id)).status,404);assert.equal((await f.call(base,'POST',input.body)).status,409);const expired=await(await f.call(path+'/export')).json();assert.equal(expired.complete,false);assert.equal(expired.links[0].report,null);assert.deepEqual(expired.links[0].records,[]);await f.call('/v1/atlas/purge','POST',{});assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_report_parts').get().n,0);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_case_reports').get().n,1);
  }finally{h.sqlite.close();}
});
test('migration 0010 preserves every prior report kind, multipart payloads, links and review history',async()=>{
  const h=await setup({migrationThrough:'0009'});try{
    const f=await fixture(h),timeline=await f.parent(),saved=[timeline];
    for(const kind of ['paths','motifs','comparison']){const parameters=kind==='paths'?{analysis:f.run.id,from:f.run.graph.nodes[0].id,to:f.run.graph.nodes[3].id}:kind==='motifs'?{analysis:f.run.id,reference:f.run.graph.nodes[0].id}:{baseline:f.run.id,current:f.run.id};const preview=await(await f.call('/v1/atlas/'+(kind==='comparison'?'compare':kind)+'?'+new URLSearchParams(parameters))).json(),response=await f.call(base,'POST',{...declarations,request_id:crypto.randomUUID(),kind,parameters,expected_report_sha256:preview.report_sha256});assert.equal(response.status,201);saved.push(await response.json());}
    // Force valid multipart storage without changing a calculation's bytes.
    const payload=h.sqlite.prepare('SELECT payload FROM atlas_report_parts WHERE report_id=?').get(timeline.id).payload;h.sqlite.prepare('UPDATE atlas_report_parts SET payload=? WHERE report_id=?').run(payload.slice(0,100),timeline.id);h.sqlite.prepare('INSERT INTO atlas_report_parts VALUES(?,?,?)').run(timeline.id,1,payload.slice(100));h.sqlite.prepare('UPDATE atlas_reports SET part_count=2 WHERE id=?').run(timeline.id);
    const caseRow=await(await f.call('/v1/cases','POST',{title:'Pre-window report dossier'})).json();for(const row of saved){assert.equal((await f.call('/v1/atlas/cases/'+caseRow.id+'/reports','POST',{report_id:row.id,payload_sha256:row.payload_sha256})).status,201);await f.call('/v1/atlas/records','POST',{kind:'review',subject:row.review_subject,body:'Existing review text',purpose:'Migration preservation',lawful_basis:'Test declaration',source_licence:'Synthetic fixture',status:'open',retention_days:1});}
    const tables=['atlas_reports','atlas_report_parts','atlas_case_reports','atlas_records','atlas_record_versions','audit'],snapshot=()=>JSON.stringify(tables.map(table=>h.sqlite.prepare('SELECT * FROM '+table+' ORDER BY rowid').all())),before=snapshot(),migration=readFileSync(new URL('../portal/migrations/0010_atlas_window_comparison_reports.sql',import.meta.url),'utf8');
    h.sqlite.exec('BEGIN');assert.throws(()=>h.sqlite.exec(migration+'\nSELECT * FROM missing_migration_fixture;'));h.sqlite.exec('ROLLBACK');assert.equal(snapshot(),before);h.sqlite.exec('BEGIN');h.sqlite.exec(migration);h.sqlite.exec('COMMIT');assert.equal(snapshot(),before);assert.deepEqual(h.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(h.sqlite.prepare('PRAGMA foreign_key_list(atlas_report_parts)').get().table,'atlas_reports');
    for(const row of saved)assert.equal((await f.call(base+'/'+row.id+'/export')).status,200);assert.equal((await(await f.call('/v1/atlas/cases/'+caseRow.id+'/export')).json()).links.length,4);await f.save(await f.input({timeline_report:timeline.id}));
  }finally{h.sqlite.close();}
});
