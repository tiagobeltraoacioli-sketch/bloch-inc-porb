import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,credentials} from './porb_helpers.mjs';
import {pathSource} from './atlas_paths_fixture.js';
import {digest} from '../portal/security.js';

async function fixture(h){
  const cookie=await h.login(),call=(path,method='GET',body)=>h.call(path,method,body,cookie);
  const run=await(await h.call('/v1/analyses','POST',{asset:'ETH',pages:1},cookie,{fetcher:async()=>Response.json(pathSource())})).json();
  const parameters={analysis:run.id,from:run.graph.nodes.find(n=>n.address.endsWith('01')).id,to:run.graph.nodes.find(n=>n.address.endsWith('04')).id};
  const preview=await(await call('/v1/atlas/paths?'+new URLSearchParams(parameters))).json();
  const report=await(await call('/v1/atlas/reports','POST',{request_id:crypto.randomUUID(),kind:'paths',title:'Saved test paths',purpose:'Fixture review',lawful_basis:'Test declaration',source_licence:'Synthetic fixture',retention_days:30,parameters,expected_report_sha256:preview.report_sha256})).json();
  const investigation=await(await call('/v1/cases','POST',{title:'Atlas dossier fixture'})).json(),base='/v1/atlas/cases/'+investigation.id,body={report_id:report.id,payload_sha256:report.payload_sha256};
  return {cookie,call,run,report,preview,investigation,base,body};
}
const governance=(subject,kind='review',status='open')=>({kind,subject,body:'Synthetic retained decision',purpose:'Fixture review',lawful_basis:'Test declaration',source_licence:'Synthetic fixture',retention_days:1,status});

test('investigation links verify the exact payload, deduplicate atomically and export retained reports with current reviews',async()=>{
  const h=await setup();try{
    const f=await fixture(h),calls=h.calls(),responses=await Promise.all([f.call(f.base+'/reports','POST',f.body),f.call(f.base+'/reports','POST',f.body)]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,201]);const links=await Promise.all(responses.map(r=>r.json()));assert.equal(links[0].id,links[1].id);
    const review=await(await f.call('/v1/atlas/records','POST',governance(f.report.review_subject))).json();
    await f.call('/v1/atlas/records','POST',governance('unrelated report','review','reviewed'));
    h.sqlite.prepare('DELETE FROM analyses WHERE id=?').run(f.run.id);
    const manifest=await(await f.call(f.base)).json();assert.equal(manifest.links.length,1);assert.equal(manifest.links[0].records.length,1);assert.equal(manifest.links[0].records[0].status,'open');assert.equal(manifest.case.reference_snapshots,0);
    const response=await f.call(f.base+'/export');assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/attachment/);assert.match(response.headers.get('cache-control'),/no-store/);
    const bundle=await response.json();assert.equal(bundle.complete,true);assert.equal(bundle.expires_at,review.expires_at);assert.deepEqual(bundle.links[0].report.report,f.preview);assert.equal(bundle.links[0].report.integrity.verified,true);
    const {bundle_sha256,...content}=bundle;assert.equal(await digest(JSON.stringify(content)),bundle_sha256);assert.equal(h.calls(),calls);
    assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='atlas.case.report.attach'").get().n,1);assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='atlas.case.export'").get().n,1);
  }finally{h.sqlite.close();}
});
test('all read scopes, mutation scope, tenant ownership, organization pinning and closed investigations are enforced',async()=>{
  const h=await setup();try{
    const f=await fixture(h);assert.equal((await h.call(f.base)).status,401);
    for(const missing of ['cases:read','analyses:read','scores:read']){const scopes=['cases:read','analyses:read','scores:read'].filter(s=>s!==missing),key=await(await h.call('/keys','POST',{label:'Dossier read test',days:1,password:credentials.password,scopes},f.cookie)).json();assert.equal((await h.call(f.base,'GET',undefined,key.key)).status,403);}
    const other=crypto.randomUUID();h.sqlite.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(other,'Other test organization','research',Date.now());
    h.sqlite.prepare('UPDATE cases SET tenant_id=? WHERE id=?').run(other,f.investigation.id);assert.equal((await f.call(f.base)).status,404);assert.equal((await f.call(f.base+'/reports','POST',f.body)).status,404);
    h.sqlite.prepare('UPDATE cases SET tenant_id=? WHERE id=?').run(h.tenant,f.investigation.id);h.sqlite.prepare('UPDATE atlas_reports SET tenant_id=? WHERE id=?').run(other,f.report.id);assert.equal((await f.call(f.base+'/reports','POST',f.body)).status,404);h.sqlite.prepare('UPDATE atlas_reports SET tenant_id=? WHERE id=?').run(h.tenant,f.report.id);
    assert.equal((await h.call(f.base,'GET',undefined,f.cookie,{headers:{'x-porb-tenant':other}})).status,409);
    const link=await(await f.call(f.base+'/reports','POST',f.body)).json();
    h.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=?').run('viewer',h.tenant);assert.equal((await f.call(f.base+'/export')).status,200);assert.equal((await f.call(f.base+'/reports','POST',f.body)).status,403);assert.equal((await f.call(f.base+'/reports/'+link.id,'DELETE',{payload_sha256:link.payload_sha256})).status,403);
    h.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=?').run('owner',h.tenant);await f.call('/v1/cases/'+f.investigation.id+'/status','POST',{status:'closed'});
    assert.equal((await f.call(f.base+'/export')).status,200);assert.equal((await f.call(f.base+'/reports','POST',f.body)).status,409);assert.equal((await f.call(f.base+'/reports/'+link.id,'DELETE',{payload_sha256:link.payload_sha256})).status,409);
  }finally{h.sqlite.close();}
});
test('expired or deleted reports retain only attachment identifiers and explicitly incomplete bundles; expired reviews disappear',async()=>{
  const h=await setup();try{
    const f=await fixture(h);await f.call(f.base+'/reports','POST',f.body);
    const review=await(await f.call('/v1/atlas/records','POST',governance(f.report.review_subject,'correction'))).json();h.sqlite.prepare('UPDATE atlas_records SET expires_at=? WHERE id=?').run(Date.now()-1,review.id);
    assert.equal((await(await f.call(f.base+'/export')).json()).links[0].records.length,0);
    h.sqlite.prepare('UPDATE atlas_reports SET expires_at=? WHERE id=?').run(Date.now()-1,f.report.id);
    const expired=await(await f.call(f.base+'/export')).json();assert.equal(expired.complete,false);assert.equal(expired.reports_unavailable,1);assert.equal(expired.expires_at,null);assert.equal(expired.links[0].report,null);assert.deepEqual(expired.links[0].records,[]);assert.ok(!JSON.stringify(expired).includes('Saved test paths'));
    await f.call('/v1/atlas/purge','POST',{});assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_case_reports').get().n,1);assert.equal((await(await f.call(f.base)).json()).links[0].availability,'unavailable');
    await f.call('/v1/cases/'+f.investigation.id,'DELETE',{});assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_case_reports').get().n,0);
  }finally{h.sqlite.close();}
});
test('corruption and attachment digest mismatch block exports and writes without silently dropping evidence',async()=>{
  const h=await setup();try{
    const f=await fixture(h);assert.equal((await f.call(f.base+'/reports','POST',{...f.body,payload_sha256:'0'.repeat(64)})).status,409);assert.equal((await f.call(f.base+'/reports','POST',{...f.body,report:{}})).status,400);
    await f.call(f.base+'/reports','POST',f.body);h.sqlite.prepare('UPDATE atlas_report_parts SET payload=? WHERE report_id=?').run('{}',f.report.id);
    assert.equal((await f.call(f.base+'/export')).status,409);assert.equal((await f.call(f.base+'/reports','POST',f.body)).status,409);
    h.sqlite.prepare('UPDATE atlas_case_reports SET payload_sha256=?').run('f'.repeat(64));assert.equal((await f.call(f.base)).status,409);
    assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='atlas.case.export'").get().n,0);
  }finally{h.sqlite.close();}
});
test('removing a link preserves the source report, checks digest and records only actual mutations',async()=>{
  const h=await setup();try{
    const f=await fixture(h),link=await(await f.call(f.base+'/reports','POST',f.body)).json(),path=f.base+'/reports/'+link.id;
    assert.equal((await f.call(path,'DELETE',{payload_sha256:'0'.repeat(64)})).status,409);assert.equal((await f.call(path,'DELETE',{payload_sha256:link.payload_sha256})).status,200);assert.equal((await f.call(path,'DELETE',{payload_sha256:link.payload_sha256})).status,409);
    assert.equal((await f.call('/v1/atlas/reports/'+f.report.id)).status,200);assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='atlas.case.report.detach'").get().n,1);
  }finally{h.sqlite.close();}
});
test('link capacity counts unavailable reports and bundle size is rejected before reading oversized contents',async()=>{
  const h=await setup();try{
    const f=await fixture(h);
    for(let i=0;i<20;i++)h.sqlite.prepare('INSERT INTO atlas_case_reports VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),f.investigation.id,crypto.randomUUID(),'0'.repeat(64),h.owner,Date.now());
    assert.equal((await f.call(f.base+'/reports','POST',f.body)).status,409);h.sqlite.prepare('DELETE FROM atlas_case_reports WHERE case_id=?').run(f.investigation.id);
    await f.call(f.base+'/reports','POST',f.body);
    const columns=h.sqlite.prepare('PRAGMA table_info(atlas_reports)').all().map(row=>row.name),original=h.sqlite.prepare('SELECT * FROM atlas_reports').get();h.sqlite.prepare('UPDATE atlas_reports SET payload_bytes=? WHERE id=?').run(6000000,f.report.id);
    for(let i=0;i<2;i++){const id=crypto.randomUUID();h.sqlite.prepare(`INSERT INTO atlas_reports(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...columns.map(key=>key==='id'?id:key==='request_id'?crypto.randomUUID():key==='payload_bytes'?6000000:original[key]));h.sqlite.prepare('INSERT INTO atlas_case_reports VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),f.investigation.id,id,original.payload_sha256,h.owner,Date.now());}
    const response=await f.call(f.base+'/export');assert.equal(response.status,422);assert.equal((await response.json()).error,'case_bundle_capacity');
  }finally{h.sqlite.close();}
});
test('a review edited during verification rejects a mixed-revision bundle',async()=>{
  const h=await setup();try{
    const f=await fixture(h);await f.call(f.base+'/reports','POST',f.body);const review=await(await f.call('/v1/atlas/records','POST',governance(f.report.review_subject))).json();
    const original=h.db.prepare;let changed=false;
    h.db.prepare=sql=>{const wrap=statement=>({bind(...args){return wrap(statement.bind(...args));},first:()=>statement.first(),run:()=>statement.run(),async all(){const value=await statement.all();if(!changed&&sql.includes('SELECT p.part,p.payload')){changed=true;h.sqlite.prepare('UPDATE atlas_records SET revision=revision+1,status=? WHERE id=?').run('reviewed',review.id);}return value;}});return wrap(original(sql));};
    const response=await f.call(f.base+'/export');assert.equal(response.status,409);assert.equal((await response.json()).error,'case_changed_retry');
    assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='atlas.case.export'").get().n,0);
  }finally{h.sqlite.close();}
});
test('an audit failure rolls back attachment and case timestamp together; export requests have a tenant budget',async()=>{
  const h=await setup();try{
    const f=await fixture(h),before=h.sqlite.prepare('SELECT updated_at FROM cases WHERE id=?').get(f.investigation.id).updated_at;
    h.sqlite.exec("CREATE TRIGGER fail_attach_audit BEFORE INSERT ON audit WHEN NEW.action='atlas.case.report.attach' BEGIN SELECT RAISE(ABORT,'fixture-audit-failure'); END");
    assert.equal((await f.call(f.base+'/reports','POST',f.body)).status,503);assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_case_reports').get().n,0);assert.equal(h.sqlite.prepare('SELECT updated_at FROM cases WHERE id=?').get(f.investigation.id).updated_at,before);
    for(let i=0;i<6;i++)assert.equal((await f.call(f.base+'/export')).status,200);const limited=await f.call(f.base+'/export');assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);
  }finally{h.sqlite.close();}
});
test('report expiry during verification cannot return a stale complete dossier',async()=>{
  const h=await setup();try{
    const f=await fixture(h);await f.call(f.base+'/reports','POST',f.body);
    const original=h.db.prepare;let expired=false;
    h.db.prepare=sql=>{const wrap=statement=>({bind(...args){return wrap(statement.bind(...args));},first:()=>statement.first(),run:()=>statement.run(),async all(){const result=await statement.all();if(!expired&&sql.includes('SELECT p.part,p.payload')){expired=true;h.sqlite.prepare('UPDATE atlas_reports SET expires_at=? WHERE id=?').run(Date.now()-1,f.report.id);}return result;}});return wrap(original(sql));};
    const response=await f.call(f.base+'/export');assert.equal(response.status,409);assert.equal((await response.json()).error,'case_changed_retry');
    assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='atlas.case.export'").get().n,0);
  }finally{h.sqlite.close();}
});
