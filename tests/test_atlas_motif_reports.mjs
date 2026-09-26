import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setup,credentials} from './porb_helpers.mjs';
import {motifSource} from './atlas_motifs_fixture.js';
import {pathSource} from './atlas_paths_fixture.js';
import {scanAtlasMotifs,MOTIF_TYPES} from '../graphus/assets/atlas_motifs.js';
import {digest} from '../portal/security.js';

const base='/v1/atlas/reports';
async function fixture(h){
  const cookie=await h.login(),call=(path,method='GET',body)=>h.call(path,method,body,cookie),source=motifSource();
  source.nodes.push({id:'ETH:address:0x'+'0'.repeat(40),address:'0x'+'0'.repeat(40),kind:'address'});
  const run=await(await h.call('/v1/analyses','POST',{asset:'ETH',pages:1},cookie,{fetcher:async()=>Response.json(source)})).json();
  async function query(parameters={}){
    parameters={analysis:run.id,reference:run.graph.nodes.find(node=>node.address?.endsWith('01')).id,max_results:20,...parameters};
    const response=await call('/v1/atlas/motifs?'+new URLSearchParams(parameters));assert.equal(response.status,200);const preview=await response.json();
    return {preview,body:{request_id:crypto.randomUUID(),kind:'motifs',title:'Retained pattern evidence',purpose:'Synthetic evidence review',lawful_basis:'Test declaration',source_licence:'Synthetic fixture',retention_days:30,parameters,expected_report_sha256:preview.report_sha256}};
  }
  async function save(input){const response=await call(base,'POST',input.body);assert.equal(response.status,201,JSON.stringify(await response.clone().json()));return response.json();}
  return {cookie,call,run,query,save};
}
test('all five motif kinds save exact verified evidence, replay after source deletion and export original digests',async()=>{
  const h=await setup();try{
    const f=await fixture(h),calls=h.calls(),saved=[];
    for(const type of MOTIF_TYPES){const input=await f.query({type}),row=await f.save(input);saved.push({input,row});
      assert.equal(row.kind,'motifs');assert.equal(row.summary.type,type);assert.equal(row.summary.motifs,input.preview.motifs.length);assert.equal(row.summary.reference,input.body.parameters.reference);assert.ok(row.summary.complete_within_query);
    }
    h.sqlite.prepare('DELETE FROM analyses WHERE id=?').run(f.run.id);
    for(const {input,row} of saved){const response=await f.call(base+'/'+row.id+'/export');assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);const value=await response.json();
      assert.deepEqual(value.report,input.preview);assert.equal(value.payload_sha256,await digest(JSON.stringify(input.preview)));assert.equal(value.integrity.verified,true);
      const replay=await f.call(base,'POST',input.body);assert.equal(replay.status,200);assert.equal((await replay.json()).id,row.id);
    }
    assert.equal(h.calls(),calls);assert.equal((await(await f.call(base)).json()).reports.length,5);
    assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='atlas.report.create'").get().n,5);
  }finally{h.sqlite.close();}
});
test('truncated, empty and not-applicable motif reports retain their distinct coverage states',async()=>{
  const h=await setup();try{
    const f=await fixture(h),limited=await f.query({max_results:1}),empty=await f.query({minimum:'900719925474099312346'}),na=await f.query({reference:'ETH:address:0x'+'0'.repeat(40)});
    for(const input of [limited,empty,na]){const row=await f.save(input),value=await(await f.call(base+'/'+row.id)).json();assert.deepEqual(value.report,input.preview);assert.equal(row.summary.complete_within_query,input.preview.search.complete_within_query);}
    assert.equal(limited.preview.search.stop_reason,'result_limit');assert.equal(empty.preview.motifs.length,0);assert.equal(empty.preview.search.complete_within_query,true);assert.equal(na.preview.state,'not_applicable');assert.equal(na.preview.search.complete_within_query,false);
  }finally{h.sqlite.close();}
});
test('motif saves reject client content, invalid typed parameters, stale previews and corrupted source manifests',async()=>{
  const h=await setup();try{
    const f=await fixture(h),{body}=await f.query();
    for(const input of [{...body,report:{}},{...body,parameters:{...body.parameters,extra:true}},{...body,parameters:{...body.parameters,max_hops:'3'}},{...body,parameters:{...body.parameters,type:'invented'}},{...body,parameters:{...body.parameters,analysis:'invalid'}}])assert.equal((await f.call(base,'POST',input)).status,400);
    assert.equal((await f.call(base,'POST',{...body,parameters:{...body.parameters,max_results:1}})).status,409);
    h.sqlite.prepare('UPDATE analyses SET digest=? WHERE id=?').run('f'.repeat(64),f.run.id);assert.equal((await f.call(base,'POST',body)).status,409);
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_reports').get().n,0);
  }finally{h.sqlite.close();}
});
test('motif reports enforce read/write scopes, tenant boundaries and viewer restrictions throughout retention',async()=>{
  const h=await setup();try{
    const f=await fixture(h),input=await f.query(),row=await f.save(input),path=base+'/'+row.id;
    for(const missing of ['cases:read','analyses:read','scores:read']){const scopes=['cases:read','analyses:read','scores:read','cases:write'].filter(s=>s!==missing),key=await(await h.call('/keys','POST',{label:'Motif report scope',days:1,password:credentials.password,scopes},f.cookie)).json();assert.equal((await h.call(base,'POST',input.body,key.key)).status,403);assert.equal((await h.call(path,'GET',undefined,key.key)).status,403);}
    assert.equal((await h.call(path,'GET',undefined,f.cookie,{headers:{'x-porb-tenant':crypto.randomUUID()}})).status,409);
    h.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=?').run('viewer',h.tenant);assert.equal((await f.call(path)).status,200);assert.equal((await f.call(base,'POST',input.body)).status,403);assert.equal((await f.call(path,'DELETE',{payload_sha256:row.payload_sha256})).status,403);
    h.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=?').run('owner',h.tenant);
    const other=crypto.randomUUID();h.sqlite.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(other,'Other motif tenant','research',Date.now());h.sqlite.prepare('UPDATE analyses SET tenant_id=? WHERE id=?').run(other,f.run.id);
    assert.equal((await f.call(base,'POST',{...input.body,request_id:crypto.randomUUID()})).status,404);h.sqlite.prepare('UPDATE atlas_reports SET tenant_id=? WHERE id=?').run(other,row.id);assert.equal((await f.call(path)).status,404);
  }finally{h.sqlite.close();}
});
test('retained motif dossiers preserve exact events and reviews after source retention, and disclose report expiry',async()=>{
  const h=await setup();try{
    const f=await fixture(h),input=await f.query(),row=await f.save(input),caseRow=await(await f.call('/v1/cases','POST',{title:'Retained motif investigation'})).json(),path='/v1/atlas/cases/'+caseRow.id;
    assert.equal((await f.call(path+'/reports','POST',{report_id:row.id,payload_sha256:row.payload_sha256})).status,201);
    const review=await(await f.call('/v1/atlas/records','POST',{kind:'review',subject:row.review_subject,body:'Synthetic motif review',purpose:'Test review scope',lawful_basis:'Test declaration',source_licence:'Synthetic fixture',status:'open',retention_days:1})).json();
    h.sqlite.prepare('DELETE FROM analyses WHERE id=?').run(f.run.id);const bundle=await(await f.call(path+'/export')).json();assert.equal(bundle.complete,true);assert.deepEqual(bundle.links[0].report.report,input.preview);assert.equal(bundle.links[0].records[0].id,review.id);
    const {bundle_sha256,...content}=bundle;assert.equal(await digest(JSON.stringify(content)),bundle_sha256);
    const queue=await(await f.call('/v1/atlas/reviews')).json();assert.ok(JSON.stringify(queue).includes(row.id));
    h.sqlite.prepare('UPDATE atlas_reports SET expires_at=? WHERE id=?').run(Date.now()-1,row.id);assert.equal((await f.call(base+'/'+row.id)).status,404);const expired=await(await f.call(path+'/export')).json();assert.equal(expired.complete,false);assert.equal(expired.links[0].report,null);assert.deepEqual(expired.links[0].records,[]);
    await f.call('/v1/atlas/purge','POST',{});assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_report_parts').get().n,0);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_case_reports').get().n,1);
  }finally{h.sqlite.close();}
});
test('manifest kind, summary and parameters cannot contradict a checksum-verified motif payload',async()=>{
  const h=await setup();try{
    const f=await fixture(h),input=await f.query(),row=await f.save(input),original=h.sqlite.prepare('SELECT * FROM atlas_reports WHERE id=?').get(row.id);
    for(const [column,value] of [['kind','paths'],['summary_json','{}'],['parameters_json','{}']]){h.sqlite.prepare(`UPDATE atlas_reports SET ${column}=? WHERE id=?`).run(value,row.id);const response=await f.call(base+'/'+row.id+'/export');assert.equal(response.status,409);assert.equal((await response.json()).error,'report_integrity_failed');h.sqlite.prepare(`UPDATE atlas_reports SET ${column}=? WHERE id=?`).run(original[column],row.id);}
    h.sqlite.prepare('UPDATE atlas_report_parts SET payload=? WHERE report_id=?').run('{}',row.id);assert.equal((await f.call(base+'/'+row.id)).status,409);
  }finally{h.sqlite.close();}
});
test('oversized motif exports are not silently shortened to fit retained-report storage',async()=>{
  const h=await setup();try{
    const f=await fixture(h),input=await f.query({type:'pass_through',max_results:20}),r=f.run;
    const initial=await scanAtlasMotifs(r.graph,input.preview.parameters,{dataset_sha256:r.digest,analysis_id:r.id});
    r.graph.snapshots[0].scope.fixture_padding='x'.repeat(6001000-JSON.stringify(initial).length);r.digest=await digest(JSON.stringify(r.graph));
    assert.ok(JSON.stringify(r.graph).length<6000000);const preview=await scanAtlasMotifs(r.graph,input.preview.parameters,{dataset_sha256:r.digest,analysis_id:r.id});assert.ok(JSON.stringify(preview).length>6000000);
    h.sqlite.prepare('UPDATE analyses SET digest=? WHERE id=?').run(r.digest,r.id);h.sqlite.prepare('DELETE FROM analysis_parts WHERE analysis_id=?').run(r.id);const payload=JSON.stringify(r);
    for(let part=0;part*200000<payload.length;part++)h.sqlite.prepare('INSERT INTO analysis_parts VALUES(?,?,?)').run(r.id,part,payload.slice(part*200000,(part+1)*200000));
    const response=await f.call(base,'POST',{...input.body,expected_report_sha256:preview.report_sha256});assert.equal(response.status,422);assert.equal((await response.json()).error,'report_storage_capacity');assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_reports').get().n,0);
  }finally{h.sqlite.close();}
});
test('motif report retries are atomic and a payload-write failure leaves no metadata or creation audit',async()=>{
  const h=await setup();try{
    const f=await fixture(h),input=await f.query(),responses=await Promise.all([f.call(base,'POST',input.body),f.call(base,'POST',input.body)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,201]);
    h.sqlite.exec("CREATE TRIGGER motif_write_failure BEFORE INSERT ON atlas_report_parts BEGIN SELECT RAISE(ABORT,'fixture'); END");assert.equal((await f.call(base,'POST',{...input.body,request_id:crypto.randomUUID()})).status,503);
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_reports').get().n,1);assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='atlas.report.create'").get().n,1);
  }finally{h.sqlite.close();}
});
test('migration 0008 preserves existing reports, multipart payloads, links, reviews and audits with foreign keys enabled',async()=>{
  const h=await setup({migrationThrough:'0007'});try{
    assert.equal(h.sqlite.prepare('PRAGMA foreign_keys').get().foreign_keys,1);const cookie=await h.login(),call=(path,method='GET',body)=>h.call(path,method,body,cookie),saved=[];
    for(const kind of ['paths','comparison']){const run=await(await h.call('/v1/analyses','POST',{asset:'ETH',pages:kind==='paths'?1:8},cookie,kind==='paths'?{fetcher:async()=>Response.json(pathSource())}:{})).json();
      const parameters=kind==='paths'?{analysis:run.id,from:run.graph.nodes[0].id,to:run.graph.nodes[3].id}:{baseline:run.id,current:run.id};const preview=await(await call('/v1/atlas/'+(kind==='paths'?'paths':'compare')+'?'+new URLSearchParams(parameters))).json();
      const response=await call(base,'POST',{request_id:crypto.randomUUID(),kind,title:'Pre-migration report',purpose:'Migration preservation test',lawful_basis:'Test declaration',source_licence:'Synthetic fixture',retention_days:30,parameters,expected_report_sha256:preview.report_sha256});assert.equal(response.status,201);saved.push(await response.json());
    }
    assert.ok(saved[1].part_count>1);const caseRow=await(await call('/v1/cases','POST',{title:'Existing linked evidence'})).json();await call('/v1/atlas/cases/'+caseRow.id+'/reports','POST',{report_id:saved[0].id,payload_sha256:saved[0].payload_sha256});
    await call('/v1/atlas/records','POST',{kind:'review',subject:saved[0].review_subject,body:'Existing review text',purpose:'Migration preservation',lawful_basis:'Test declaration',source_licence:'Synthetic fixture',status:'open',retention_days:1});
    const tables=['atlas_reports','atlas_report_parts','atlas_case_reports','atlas_records','atlas_record_versions','audit'],snapshot=()=>JSON.stringify(tables.map(table=>h.sqlite.prepare('SELECT * FROM '+table+' ORDER BY rowid').all())),before=snapshot();
    const migration=readFileSync(new URL('../portal/migrations/0008_atlas_motif_reports.sql',import.meta.url),'utf8');
    h.sqlite.exec('BEGIN');assert.throws(()=>h.sqlite.exec(migration+'\nSELECT * FROM deliberate_missing_migration_fixture;'));h.sqlite.exec('ROLLBACK');assert.equal(snapshot(),before);
    h.sqlite.exec('BEGIN');h.sqlite.exec(migration);h.sqlite.exec('COMMIT');assert.equal(snapshot(),before);assert.deepEqual(h.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.equal(h.sqlite.prepare('PRAGMA foreign_key_list(atlas_report_parts)').get().table,'atlas_reports');assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='index' AND name IN ('atlas_reports_tenant','atlas_reports_expiry')").get().n,2);
    for(const row of saved)assert.equal((await call(base+'/'+row.id+'/export')).status,200);
    assert.equal((await call('/v1/atlas/cases/'+caseRow.id+'/export')).status,200);
    await call(base+'/'+saved[0].id,'DELETE',{payload_sha256:saved[0].payload_sha256});assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_report_parts WHERE report_id=?').get(saved[0].id).n,0);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_case_reports').get().n,1);
    const f=await fixture(h);await f.save(await f.query());
  }finally{h.sqlite.close();}
});
