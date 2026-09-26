import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {setup,credentials} from './porb_helpers.mjs';
import {digest} from '../portal/security.js';

const base='/v1/atlas/records',day=86400000;
const body=(change={})=>({kind:'review',subject:'Synthetic review scope',body:'Initial observation <script>not executable</script>',purpose:'Fixture investigation',lawful_basis:'Test declaration',source_licence:'Synthetic fixture only',status:'open',retention_days:30,...change});
const fixture=async h=>{const cookie=await h.login();const call=(path,method='GET',value)=>h.call(path,method,value,cookie);return {cookie,call,record:await(await call(base,'POST',body())).json()};};
const assignment=(h,record,change={})=>({revision:record.revision,assignee_id:h.owner,priority:'high',due_at:record.created_at+day,...change});
function member(h,role='analyst'){const id=crypto.randomUUID();h.sqlite.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id,'reviewer-'+id+'@example.test','unused','unused','unused',Date.now());h.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?)').run(h.tenant,id,role);return id;}

test('assignment and decisions preserve exact revisions, actor IDs, expiry and a reproducible export checksum',async()=>{
  const h=await setup();try{
    const f=await fixture(h),path=base+'/'+f.record.id;
    const assigned=await(await f.call(path+'/assignment','POST',assignment(h,f.record))).json();assert.equal(assigned.revision,2);assert.equal(assigned.expires_at,f.record.expires_at);assert.equal(assigned.status,'open');
    const updated=await f.call(path,'POST',body({revision:2,status:'reviewed',body:'Reviewed with an explicit limitation'}));assert.equal(updated.status,200);
    const response=await f.call(path+'/history');assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
    const {history_sha256,...history}=await response.json();assert.equal(await digest(JSON.stringify(history)),history_sha256);assert.equal(history.complete,true);assert.equal(history.missing_revisions,0);
    assert.deepEqual(history.versions.map(version=>version.record.revision),[1,2,3]);assert.equal(history.versions[0].record.body,body().body);assert.equal(history.versions[1].record.status,'open');assert.equal(history.versions[2].record.status,'reviewed');assert.ok(history.versions.every(version=>version.record.updated_by===h.owner));
    assert.equal((await f.call(path,'POST',body({revision:2}))).status,409);assert.equal((await f.call(path+'/assignment','POST',assignment(h,f.record))).status,409);
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_record_versions').get().n,3);
  }finally{h.sqlite.close();}
});

test('competing assignments admit one revision and one audit; revoked reviewers and non-review records are rejected',async()=>{
  const h=await setup();try{
    const f=await fixture(h),path=base+'/'+f.record.id+'/assignment',actor=member(h);
    const responses=await Promise.all([f.call(path,'POST',assignment(h,f.record,{assignee_id:actor})),f.call(path,'POST',assignment(h,f.record,{priority:'low'}))]);assert.deepEqual(responses.map(row=>row.status).sort(),[200,409]);
    assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='atlas.review.assign'").get().n,1);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_record_versions').get().n,2);
    h.sqlite.prepare('UPDATE memberships SET role=? WHERE user_id=?').run('viewer',actor);
    assert.equal((await f.call(path,'POST',assignment(h,f.record,{revision:2,assignee_id:actor}))).status,409);
    const note=await(await f.call(base,'POST',body({kind:'annotation'}))).json();assert.equal((await f.call(base+'/'+note.id+'/assignment','POST',assignment(h,note))).status,409);
    for(const change of [{due_at:f.record.expires_at+1},{due_at:f.record.created_at-1},{assignee_id:crypto.randomUUID()}])assert.equal((await f.call(path,'POST',assignment(h,f.record,{revision:2,...change}))).status,409);
    for(const change of [{priority:'risk'},{due_at:1.5},{assignee_id:'owner'},{revision:0},{extra:'ignored'}])assert.equal((await f.call(path,'POST',assignment(h,f.record,{revision:2,...change}))).status,400);
  }finally{h.sqlite.close();}
});

test('queue orders human priorities and deadlines, includes corrections and marks departed reviewers unavailable',async()=>{
  const h=await setup();try{
    const f=await fixture(h),actor=member(h),other=await(await f.call(base,'POST',body({kind:'correction',subject:'Disputed source'}))).json();
    await f.call(base+'/'+f.record.id+'/assignment','POST',assignment(h,f.record,{priority:'low',assignee_id:actor}));
    await f.call(base+'/'+other.id+'/assignment','POST',assignment(h,other));
    await f.call(base,'POST',body({kind:'processing'}));
    let queue=await(await f.call('/v1/atlas/reviews')).json();assert.deepEqual(queue.items.map(row=>row.id),[other.id,f.record.id]);assert.equal(queue.items[1].assignee.id,actor);assert.equal(queue.items[1].assignee_unavailable,false);
    h.sqlite.prepare('DELETE FROM memberships WHERE user_id=?').run(actor);queue=await(await f.call('/v1/atlas/reviews')).json();assert.equal(queue.items[1].assignee,null);assert.equal(queue.items[1].assignee_unavailable,true);assert.equal(queue.reviewers.length,1);
    assert.equal((await f.call('/v1/atlas/reviews?unexpected=1')).status,400);
  }finally{h.sqlite.close();}
});

test('history and assignments enforce authentication, tenant pinning, read and write scopes, and viewer restrictions',async()=>{
  const h=await setup();try{
    const f=await fixture(h),path=base+'/'+f.record.id;
    for(const route of ['/v1/atlas/reviews',path+'/history'])assert.equal((await h.call(route)).status,401);
    const key=async scopes=>(await(await h.call('/keys','POST',{label:'Review test',days:1,password:credentials.password,scopes},f.cookie)).json()).key;
    const reading=await key(['cases:read']),writing=await key(['cases:write']);
    assert.equal((await h.call(path+'/history','GET',undefined,reading)).status,200);assert.equal((await h.call(path+'/history','GET',undefined,writing)).status,403);
    assert.equal((await h.call(path+'/assignment','POST',assignment(h,f.record),reading)).status,403);assert.equal((await h.call(path+'/assignment','POST',assignment(h,f.record),writing)).status,403);
    const other=crypto.randomUUID();h.sqlite.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(other,'Other organization','research',Date.now());
    assert.equal((await h.call(path+'/history','GET',undefined,f.cookie,{headers:{'x-porb-tenant':other}})).status,409);
    h.sqlite.prepare('UPDATE atlas_records SET tenant_id=? WHERE id=?').run(other,f.record.id);assert.equal((await f.call(path+'/history')).status,404);assert.equal((await f.call(path+'/assignment','POST',assignment(h,f.record))).status,409);
    h.sqlite.prepare('UPDATE atlas_records SET tenant_id=? WHERE id=?').run(h.tenant,f.record.id);h.sqlite.prepare('UPDATE memberships SET role=? WHERE user_id=?').run('viewer',h.owner);
    assert.equal((await f.call(path+'/history')).status,200);assert.equal((await f.call('/v1/atlas/reviews')).status,200);assert.equal((await f.call(path+'/assignment','POST',assignment(h,f.record))).status,403);
  }finally{h.sqlite.close();}
});

test('extending retention never revives expired versions; purge and deletion remove only authorized history',async()=>{
  const h=await setup(),clock=Date.now;try{
    const f=await fixture(h),start=clock(),first=await(await f.call(base,'POST',body({retention_days:1}))).json(),path=base+'/'+first.id;
    Date.now=()=>start+day/4;
    assert.equal((await f.call(path,'POST',body({revision:1,retention_days:30}))).status,200);
    Date.now=()=>start+day+10000;const cookie=await h.login(),call=(route,method='GET',value)=>h.call(route,method,value,cookie);
    const history=await(await call(path+'/history')).json();assert.equal(history.complete,false);assert.equal(history.missing_revisions,1);assert.deepEqual(history.versions.map(row=>row.record.revision),[2]);
    const purged=await(await call('/v1/atlas/purge','POST',{})).json();assert.equal(purged.deleted_versions,1);assert.equal(purged.deleted,0);
    assert.equal((await call(path,'DELETE',{revision:2})).status,200);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_record_versions WHERE record_id=?').get(first.id).n,0);assert.equal((await call(path+'/history')).status,404);
    Date.now=()=>start+31*day;const finalCookie=await h.login();assert.equal((await h.call(base+'/'+f.record.id+'/history','GET',undefined,finalCookie)).status,404);
    assert.equal((await(await h.call('/v1/atlas/reviews','GET',undefined,finalCookie)).json()).items.length,0);
  }finally{Date.now=clock;h.sqlite.close();}
});

test('shorter retention respects the existing deadline; changing kind clears workflow while retaining earlier history',async()=>{
  const h=await setup();try{
    const f=await fixture(h),path=base+'/'+f.record.id;
    await f.call(path+'/assignment','POST',assignment(h,f.record,{due_at:f.record.created_at+10*day}));
    assert.equal((await f.call(path,'POST',body({revision:2,retention_days:1}))).status,409);
    const update=await(await f.call(path,'POST',body({revision:2,retention_days:1,kind:'annotation'}))).json();assert.equal(update.assignee_id,null);assert.equal(update.due_at,null);assert.equal(update.priority,'normal');
    const history=await(await f.call(path+'/history')).json();assert.equal(history.versions[1].record.assignee_id,h.owner);assert.equal(history.expires_at,update.expires_at);assert.equal((await(await f.call('/v1/atlas/reviews')).json()).items.length,0);
  }finally{h.sqlite.close();}
});

test('history capacity counts retained physical snapshots and audit failures roll back record and trigger together',async()=>{
  const h=await setup();try{
    const f=await fixture(h),path=base+'/'+f.record.id;
    h.sqlite.exec("CREATE TRIGGER fail_review_audit BEFORE INSERT ON audit WHEN NEW.action='atlas.review.assign' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END");
    assert.equal((await f.call(path+'/assignment','POST',assignment(h,f.record))).status,503);assert.equal(h.sqlite.prepare('SELECT revision FROM atlas_records WHERE id=?').get(f.record.id).revision,1);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_record_versions').get().n,1);h.sqlite.exec('DROP TRIGGER fail_review_audit');
    for(let revision=2;revision<=100;revision++)h.sqlite.prepare('UPDATE atlas_records SET revision=? WHERE id=?').run(revision,f.record.id);
    assert.equal((await f.call(path+'/assignment','POST',assignment(h,f.record,{revision:100}))).status,409);assert.equal((await f.call(path,'POST',body({revision:100}))).status,409);
    assert.equal((await(await f.call(path+'/history')).json()).versions.length,100);
  }finally{h.sqlite.close();}
});

test('migration baselines preserve current decisions without inventing missing revisions or authors',()=>{
  const db=new DatabaseSync(':memory:');try{
    const dir=new URL('../portal/migrations/',import.meta.url);for(const name of readdirSync(dir).filter(name=>name.endsWith('.sql')&&!name.startsWith('0007')).sort())db.exec(readFileSync(new URL(name,dir),'utf8'));
    db.exec("INSERT INTO tenants VALUES('tenant','Fixture','research',1); INSERT INTO atlas_records(id,tenant_id,kind,subject,body,purpose,lawful_basis,source_licence,status,revision,created_by,created_at,updated_at,expires_at) VALUES('record','tenant','review','scope','decision','purpose','basis','rights','reviewed',7,'original-author',1,2,9999999999999)");
    db.exec(readFileSync(new URL('0007_atlas_review_workflow.sql',dir),'utf8'));
    const rows=db.prepare('SELECT * FROM atlas_record_versions').all();assert.equal(rows.length,1);assert.equal(rows[0].revision,7);assert.equal(rows[0].origin,'migration_baseline');assert.equal(JSON.parse(rows[0].snapshot_json).updated_by,null);assert.equal(JSON.parse(rows[0].snapshot_json).body,'decision');
  }finally{db.close();}
});

test('concurrent edits and inconsistent current snapshots cannot produce a mixed history export',async()=>{
  const h=await setup();try{
    const f=await fixture(h),path=base+'/'+f.record.id,prepare=h.db.prepare;let changed=false;
    h.db.prepare=sql=>{const wrap=stmt=>({bind(...args){return wrap(stmt.bind(...args));},first:()=>stmt.first(),run:()=>stmt.run(),async all(){const rows=await stmt.all();if(!changed&&sql.includes('SELECT revision,origin,snapshot_json')){changed=true;h.sqlite.prepare('UPDATE atlas_records SET revision=revision+1,body=? WHERE id=?').run('Concurrent correction',f.record.id);}return rows;}});return wrap(prepare(sql));};
    const response=await f.call(path+'/history');assert.equal(response.status,409);assert.equal((await response.json()).error,'record_changed_retry');h.db.prepare=prepare;
    h.sqlite.prepare('UPDATE atlas_record_versions SET snapshot_json=? WHERE record_id=? AND revision=2').run('{"broken":true}',f.record.id);assert.equal((await f.call(path+'/history')).status,409);
  }finally{h.sqlite.close();}
});

test('queue evidence context obeys every evidence scope and disappears when reports are deleted',async()=>{
  const h=await setup();try{
    const f=await fixture(h),run=await(await f.call('/v1/analyses','POST',{asset:'ETH',pages:1})).json(),parameters={baseline:run.id,current:run.id};
    const preview=await(await f.call('/v1/atlas/compare?'+new URLSearchParams(parameters))).json();
    const report=await(await f.call('/v1/atlas/reports','POST',{request_id:crypto.randomUUID(),kind:'comparison',title:'Scoped queue evidence',purpose:'Fixture review',lawful_basis:'Test declaration',source_licence:'Synthetic fixture',retention_days:30,parameters,expected_report_sha256:preview.report_sha256})).json();
    const investigation=await(await f.call('/v1/cases','POST',{title:'Scoped investigation'})).json();await f.call('/v1/atlas/cases/'+investigation.id+'/reports','POST',{report_id:report.id,payload_sha256:report.payload_sha256});
    const review=await(await f.call(base,'POST',body({subject:report.review_subject}))).json();
    const item=async access=>(await(await h.call('/v1/atlas/reviews','GET',undefined,access)).json()).items.find(item=>item.id===review.id);
    const full=await item(f.cookie);assert.equal(full.report.id,report.id);assert.deepEqual(full.cases,[{id:investigation.id,title:investigation.title,status:'open'}]);
    for(const scopes of [['cases:read'],['cases:read','scores:read'],['cases:read','analyses:read']]){
      const key=await(await f.call('/keys','POST',{label:'Scoped queue',days:1,password:credentials.password,scopes})).json();const limited=await item(key.key);assert.equal(limited.report,null);assert.deepEqual(limited.cases,[]);
    }
    await f.call('/v1/atlas/reports/'+report.id,'DELETE',{payload_sha256:report.payload_sha256});const unavailable=await item(f.cookie);assert.equal(unavailable.report,null);assert.deepEqual(unavailable.cases,[]);assert.equal(unavailable.body,body().body);
  }finally{h.sqlite.close();}
});

test('history is bounded by a tenant read budget and checks expiry while the export is assembled',async()=>{
  const h=await setup(),clock=Date.now;try{
    const f=await fixture(h),path=base+'/'+f.record.id+'/history',prepare=h.db.prepare;let expired=false;
    h.db.prepare=sql=>{const wrap=stmt=>({bind(...args){return wrap(stmt.bind(...args));},first:()=>stmt.first(),run:()=>stmt.run(),async all(){const rows=await stmt.all();if(!expired&&sql.includes('SELECT revision,origin,snapshot_json')){expired=true;Date.now=()=>f.record.expires_at+1;}return rows;}});return wrap(prepare(sql));};
    const response=await f.call(path);assert.equal(response.status,409);assert.equal((await response.json()).error,'record_changed_retry');h.db.prepare=prepare;Date.now=clock;
    for(let i=0;i<29;i++)assert.equal((await f.call(path)).status,200);const limited=await f.call(path);assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);
  }finally{Date.now=clock;h.sqlite.close();}
});
