import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setup,credentials} from './porb_helpers.mjs';
import {timelineSource} from './atlas_timeline_fixture.js';
import {sample} from './system_map_fixture.mjs';
import {motifSource} from './atlas_motifs_fixture.js';
import {pathSource} from './atlas_paths_fixture.js';
import {exploreAtlasTimeline,timelineCsv} from '../graphus/assets/atlas_timeline.js';
import {digest} from '../portal/security.js';
const base='/v1/atlas/reports';
async function fixture(h,asset='ETH',source=timelineSource(asset)){
  const cookie=await h.login(),call=(path,method='GET',body)=>h.call(path,method,body,cookie);
  const response=await h.call('/v1/analyses','POST',{asset,pages:1},cookie,{fetcher:async()=>Response.json(source)});assert.equal(response.status,201);const run=await response.json();
  async function query(parameters={}){
    parameters={analysis:run.id,...parameters};const response=await call('/v1/atlas/timeline?'+new URLSearchParams(parameters));assert.equal(response.status,200);const preview=await response.json();
    return {preview,body:{request_id:crypto.randomUUID(),kind:'timeline',title:'Retained activity evidence',purpose:'Synthetic activity review',lawful_basis:'Test declaration',source_licence:'Synthetic fixture',retention_days:30,parameters,expected_report_sha256:preview.report_sha256}};
  }
  async function save(input){const response=await call(base,'POST',input.body);assert.equal(response.status,201,JSON.stringify(await response.clone().json()));return response.json();}
  return {cookie,call,run,query,save};
}
test('all five assets retain exact timeline evidence and replay after source deletion without collection',async()=>{
  for(const asset of ['ETH','USDT','USDC','BTC','BLCH']){const h=await setup();try{
    const f=await fixture(h,asset,['BTC','BLCH'].includes(asset)?sample(asset):timelineSource(asset)),input=await f.query(),calls=h.calls(),row=await f.save(input);
    assert.equal(row.kind,'timeline');assert.equal(row.summary.events,input.preview.events.length);assert.equal(row.summary.buckets,input.preview.buckets.length);assert.equal(row.summary.interval,input.preview.window.interval);assert.equal(row.summary.state,input.preview.state);
    h.sqlite.prepare('DELETE FROM analyses WHERE id=?').run(f.run.id);const response=await f.call(base+'/'+row.id+'/export');assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);const value=await response.json();
    assert.deepEqual(value.report,input.preview);assert.equal(value.payload_sha256,await digest(JSON.stringify(input.preview)));assert.equal(value.integrity.verified,true);assert.equal(timelineCsv(value.report),timelineCsv(input.preview));
    const replay=await f.call(base,'POST',input.body);assert.equal(replay.status,200);assert.equal((await replay.json()).id,row.id);assert.equal(h.calls(),calls);
    assert.equal((await f.call(base,'POST',{...input.body,title:'Changed request content'})).status,409);
    assert.equal((await(await f.call(base)).json()).reports.length,1);assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='atlas.report.create'").get().n,1);
  }finally{h.sqlite.close();}}
});
test('retained timelines distinguish unknown bins, empty windows, unavailable filters and absent source time',async()=>{
  const h=await setup();try{
    const f=await fixture(h),inputs=[await f.query(),await f.query({start:'2026-09-25T12:00:02Z'}),await f.query({minimum:'900719925474099312346'}),await f.query({reference:f.run.graph.nodes[0].id,direction:'self',interval:'minute'})];
    const untimed=timelineSource();for(const event of untimed.edges)delete event.block_time;const noTime=await fixture(h,'ETH',untimed);inputs.push(await noTime.query());
    for(const input of inputs){const row=await f.save(input),value=await(await f.call(base+'/'+row.id)).json();assert.deepEqual(value.report,input.preview);assert.equal(row.summary.state,input.preview.state);}
    assert.equal(inputs[0].preview.buckets[2].observed_events,null);assert.equal(inputs[1].preview.state,'available');assert.equal(inputs[1].preview.events.length,0);assert.equal(inputs[2].preview.state,'unavailable');assert.equal(inputs[2].preview.window.start,null);assert.equal(inputs[3].preview.events.length,1);assert.equal(inputs[3].preview.events[0].direction,'self');assert.equal(inputs[4].preview.coverage.excluded.missing_timestamp,30);assert.deepEqual(inputs[4].preview.buckets,[]);
  }finally{h.sqlite.close();}
});
test('timeline saves require typed parameters and exact recomputation from uncorrupted source evidence',async()=>{
  const h=await setup();try{
    const f=await fixture(h),{body}=await f.query();
    for(const input of [{...body,report:{}},{...body,parameters:{...body.parameters,extra:true}},{...body,parameters:{...body.parameters,minimum:1}},{...body,parameters:{...body.parameters,interval:'week'}},{...body,parameters:{...body.parameters,direction:'incoming'}},{...body,parameters:{...body.parameters,analysis:'invalid'}},{...body,parameters:{...body.parameters,start:'2026-02-30T00:00:00Z'}}])assert.equal((await f.call(base,'POST',input)).status,400);
    assert.equal((await f.call(base,'POST',{...body,parameters:{...body.parameters,minimum:'1'}})).status,409);
    assert.equal((await f.call(base,'POST',{...body,parameters:{...body.parameters,interval:'minute'}})).status,422);
    h.sqlite.prepare('UPDATE analyses SET digest=? WHERE id=?').run('f'.repeat(64),f.run.id);assert.equal((await f.call(base,'POST',body)).status,409);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_reports').get().n,0);
  }finally{h.sqlite.close();}
});
test('timeline retention enforces scopes, tenant isolation, viewer reads and write restrictions',async()=>{
  const h=await setup();try{
    const f=await fixture(h),input=await f.query(),row=await f.save(input),path=base+'/'+row.id;
    for(const missing of ['cases:read','analyses:read','scores:read','cases:write']){const scopes=['cases:read','analyses:read','scores:read','cases:write'].filter(s=>s!==missing),key=await(await h.call('/keys','POST',{label:'Timeline report scope',days:1,password:credentials.password,scopes},f.cookie)).json();assert.equal((await h.call(base,'POST',input.body,key.key)).status,403);assert.equal((await h.call(path,'GET',undefined,key.key)).status,missing==='cases:write'?200:403);}
    assert.equal((await h.call(path,'GET',undefined,f.cookie,{headers:{'x-porb-tenant':crypto.randomUUID()}})).status,409);
    h.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=?').run('viewer',h.tenant);assert.equal((await f.call(path+'/export')).status,200);assert.equal((await f.call(base,'POST',input.body)).status,403);assert.equal((await f.call(path,'DELETE',{payload_sha256:row.payload_sha256})).status,403);
    h.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=?').run('owner',h.tenant);const other=crypto.randomUUID();h.sqlite.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(other,'Other timeline tenant','research',Date.now());h.sqlite.prepare('UPDATE analyses SET tenant_id=? WHERE id=?').run(other,f.run.id);assert.equal((await f.call(base,'POST',{...input.body,request_id:crypto.randomUUID()})).status,404);h.sqlite.prepare('UPDATE atlas_reports SET tenant_id=? WHERE id=?').run(other,row.id);assert.equal((await f.call(path)).status,404);
  }finally{h.sqlite.close();}
});
test('timeline dossiers and current reviews survive source deletion, disclose expiry and preserve attachment identity after purge',async()=>{
  const h=await setup();try{
    const f=await fixture(h),input=await f.query(),row=await f.save(input),caseRow=await(await f.call('/v1/cases','POST',{title:'Retained activity investigation'})).json(),path='/v1/atlas/cases/'+caseRow.id;
    assert.equal((await f.call(path+'/reports','POST',{report_id:row.id,payload_sha256:row.payload_sha256})).status,201);
    const review=await(await f.call('/v1/atlas/records','POST',{kind:'review',subject:row.review_subject,body:'Synthetic timeline review',purpose:'Test review scope',lawful_basis:'Test declaration',source_licence:'Synthetic fixture',status:'open',retention_days:1})).json();
    h.sqlite.prepare('DELETE FROM analyses WHERE id=?').run(f.run.id);const bundle=await(await f.call(path+'/export')).json();assert.equal(bundle.complete,true);assert.deepEqual(bundle.links[0].report.report,input.preview);assert.equal(bundle.links[0].records[0].id,review.id);const {bundle_sha256,...content}=bundle;assert.equal(await digest(JSON.stringify(content)),bundle_sha256);
    const queue=await(await f.call('/v1/atlas/reviews')).json();assert.ok(JSON.stringify(queue).includes(row.id));
    h.sqlite.prepare('UPDATE atlas_reports SET expires_at=? WHERE id=?').run(Date.now()-1,row.id);assert.equal((await f.call(base+'/'+row.id)).status,404);assert.equal((await f.call(base,'POST',input.body)).status,409);const expired=await(await f.call(path+'/export')).json();assert.equal(expired.complete,false);assert.equal(expired.links[0].report,null);assert.deepEqual(expired.links[0].records,[]);
    const list=await(await f.call(base)).json();assert.equal(list.retention.expired,1);assert.equal(list.reports.length,0);await f.call('/v1/atlas/purge','POST',{});assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_report_parts').get().n,0);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_case_reports').get().n,1);
  }finally{h.sqlite.close();}
});
test('timeline payload, kind, summary and parameters must agree before inspection, export or attachment',async()=>{
  const h=await setup();try{
    const f=await fixture(h),input=await f.query(),row=await f.save(input),original=h.sqlite.prepare('SELECT * FROM atlas_reports WHERE id=?').get(row.id),caseRow=await(await f.call('/v1/cases','POST',{title:'Integrity verification dossier'})).json();
    for(const [column,value] of [['kind','motifs'],['summary_json','{}'],['parameters_json','{}']]){h.sqlite.prepare(`UPDATE atlas_reports SET ${column}=? WHERE id=?`).run(value,row.id);const response=await f.call(base+'/'+row.id+'/export');assert.equal(response.status,409);assert.equal((await response.json()).error,'report_integrity_failed');h.sqlite.prepare(`UPDATE atlas_reports SET ${column}=? WHERE id=?`).run(original[column],row.id);}
    h.sqlite.prepare('UPDATE atlas_report_parts SET payload=? WHERE report_id=?').run('{}',row.id);assert.equal((await f.call(base+'/'+row.id)).status,409);assert.equal((await f.call('/v1/atlas/cases/'+caseRow.id+'/reports','POST',{report_id:row.id,payload_sha256:row.payload_sha256})).status,409);
  }finally{h.sqlite.close();}
});
test('timelines above retained storage capacity fail without truncation or partial writes',async()=>{
  const h=await setup();try{
    const f=await fixture(h),input=await f.query(),r=f.run;
    r.graph.snapshots[0].scope.fixture_padding='x'.repeat(6001000-JSON.stringify(input.preview).length);r.digest=await digest(JSON.stringify(r.graph));assert.ok(JSON.stringify(r.graph).length<6000000);
    const preview=await exploreAtlasTimeline(r.graph,input.preview.parameters,{dataset_sha256:r.digest,analysis_id:r.id});assert.ok(JSON.stringify(preview).length>6000000);
    h.sqlite.prepare('UPDATE analyses SET digest=? WHERE id=?').run(r.digest,r.id);h.sqlite.prepare('DELETE FROM analysis_parts WHERE analysis_id=?').run(r.id);const payload=JSON.stringify(r);for(let part=0;part*200000<payload.length;part++)h.sqlite.prepare('INSERT INTO analysis_parts VALUES(?,?,?)').run(r.id,part,payload.slice(part*200000,(part+1)*200000));
    const response=await f.call(base,'POST',{...input.body,expected_report_sha256:preview.report_sha256});assert.equal(response.status,422);assert.equal((await response.json()).error,'report_storage_capacity');assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_reports').get().n,0);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_report_parts').get().n,0);
  }finally{h.sqlite.close();}
});
test('migration 0009 preserves all three prior report kinds and multipart evidence, with rollback and foreign keys enabled',async()=>{
  const h=await setup({migrationThrough:'0008'});try{
    assert.equal(h.sqlite.prepare('PRAGMA foreign_keys').get().foreign_keys,1);const cookie=await h.login(),call=(path,method='GET',body)=>h.call(path,method,body,cookie),saved=[];
    for(const kind of ['paths','comparison','motifs']){const run=await(await h.call('/v1/analyses','POST',{asset:'ETH',pages:kind==='comparison'?8:1},cookie,kind==='comparison'?{}:{fetcher:async()=>Response.json(kind==='paths'?pathSource():motifSource())})).json();
      const parameters=kind==='comparison'?{baseline:run.id,current:run.id}:kind==='paths'?{analysis:run.id,from:run.graph.nodes[0].id,to:run.graph.nodes[3].id}:{analysis:run.id,reference:run.graph.nodes[0].id};const preview=await(await call('/v1/atlas/'+(kind==='comparison'?'compare':kind)+'?'+new URLSearchParams(parameters))).json();
      const response=await call(base,'POST',{request_id:crypto.randomUUID(),kind,title:'Pre-timeline migration report',purpose:'Migration preservation test',lawful_basis:'Test declaration',source_licence:'Synthetic fixture',retention_days:30,parameters,expected_report_sha256:preview.report_sha256});assert.equal(response.status,201);saved.push(await response.json());
    }
    assert.ok(saved[1].part_count>1);const caseRow=await(await call('/v1/cases','POST',{title:'Existing linked evidence'})).json();for(const row of saved){await call('/v1/atlas/cases/'+caseRow.id+'/reports','POST',{report_id:row.id,payload_sha256:row.payload_sha256});await call('/v1/atlas/records','POST',{kind:'review',subject:row.review_subject,body:'Existing review text',purpose:'Migration preservation',lawful_basis:'Test declaration',source_licence:'Synthetic fixture',status:'open',retention_days:1});}
    const tables=['atlas_reports','atlas_report_parts','atlas_case_reports','atlas_records','atlas_record_versions','audit'],snapshot=()=>JSON.stringify(tables.map(table=>h.sqlite.prepare('SELECT * FROM '+table+' ORDER BY rowid').all())),before=snapshot(),migration=readFileSync(new URL('../portal/migrations/0009_atlas_timeline_reports.sql',import.meta.url),'utf8');
    h.sqlite.exec('BEGIN');assert.throws(()=>h.sqlite.exec(migration+'\nSELECT * FROM deliberate_missing_migration_fixture;'));h.sqlite.exec('ROLLBACK');assert.equal(snapshot(),before);
    h.sqlite.exec('BEGIN');h.sqlite.exec(migration);h.sqlite.exec('COMMIT');assert.equal(snapshot(),before);assert.deepEqual(h.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(h.sqlite.prepare('PRAGMA foreign_key_list(atlas_report_parts)').get().table,'atlas_reports');assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='index' AND name IN ('atlas_reports_tenant','atlas_reports_expiry')").get().n,2);
    for(const row of saved)assert.equal((await call(base+'/'+row.id+'/export')).status,200);assert.equal((await(await call('/v1/atlas/cases/'+caseRow.id+'/export')).json()).links.length,3);
    await call(base+'/'+saved[0].id,'DELETE',{payload_sha256:saved[0].payload_sha256});assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_report_parts WHERE report_id=?').get(saved[0].id).n,0);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_case_reports').get().n,3);const f=await fixture(h);await f.save(await f.query());
  }finally{h.sqlite.close();}
});
