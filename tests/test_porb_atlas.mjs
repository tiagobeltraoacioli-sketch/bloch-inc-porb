import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './porb_helpers.mjs';
import {officialReferenceParser,officialReferences,OFFICIAL_SOURCES,OFFICIAL_TTL} from '../portal/atlas-sources.js';

const document=(id,n=110)=>id==='un-consolidated'?`<CONSOLIDATED_LIST><INDIVIDUALS>${Array.from({length:n},(_,i)=>`<INDIVIDUAL><REFERENCE_NUMBER>QDi.${i+1}</REFERENCE_NUMBER><FIRST_NAME>DISCARDED</FIRST_NAME></INDIVIDUAL>`).join('')}</INDIVIDUALS></CONSOLIDATED_LIST>`:id==='uk-sanctions'?`<Designations>${Array.from({length:n},(_,i)=>`<Designation><UniqueID>RUS${i+1}</UniqueID><Name>DISCARDED</Name></Designation>`).join('')}</Designations>`:`<export xmlns="test">${Array.from({length:n},(_,i)=>`<sanctionEntity euReferenceNumber="EU.${i+1}.1"><nameAlias wholeName="DISCARDED"/></sanctionEntity>`).join('')}</export>`;
test('streaming official XML reference extraction handles arbitrary chunk boundaries without retaining identities',()=>{
  for(const id of Object.keys(OFFICIAL_SOURCES)){const p=officialReferenceParser(id);for(const c of '\uFEFF<?xml version="1.0"?>'+document(id))p.write(c);assert.equal(p.finish().length,110);assert.ok(!JSON.stringify(p.finish()).includes('DISCARDED'));}
  for(const bad of ['<!DOCTYPE X [<!ENTITY e SYSTEM "file:///secret">]>'+document('un-consolidated'),'<CONSOLIDATED_LIST><INDIVIDUAL></CONSOLIDATED_LIST>',document('un-consolidated').replace('QDi.1','<nested/>'),document('un-consolidated').slice(0,-5),document('un-consolidated').replace('QDi.2','QDi.1')]){assert.throws(()=>{const p=officialReferenceParser('un-consolidated');p.write(bad);p.finish();});}
});
test('official snapshots digest exact bytes, cache within expiry, reject invalid/redirected sources and never serve failed refreshes',async()=>{
  let calls=0,fail=false;const fetcher=async()=>{calls++;return fail?new Response('unavailable',{status:503}):new Response(document('un-consolidated'));};
  const a=await officialReferences('un-consolidated',fetcher,1000),b=await officialReferences('un-consolidated',fetcher,1001);assert.deepEqual(a,b);assert.equal(calls,1);assert.match(a.metadata.sha256,/^[a-f0-9]{64}$/);
  fail=true;await assert.rejects(officialReferences('un-consolidated',fetcher,1000+OFFICIAL_TTL),/unavailable/);assert.equal(calls,2);
  fail=false;await officialReferences('un-consolidated',fetcher,1001+OFFICIAL_TTL);assert.equal(calls,3);
  await assert.rejects(officialReferences('uk-sanctions',async()=>new Response('',{status:302,headers:{location:'https://evil.test'}})),/redirect/);
  await assert.rejects(officialReferences('uk-sanctions',async()=>new Response(document('uk-sanctions'),{headers:{'content-length':'999999999'}})),/capacity/);
});
const record=()=>({kind:'annotation',subject:'ETH source snapshot',body:'Private test observation',purpose:'Bounded descriptive research',lawful_basis:'Documented test basis',source_licence:'Review publisher terms before reuse',status:'open',retention_days:30});
test('pinned Atlas organization context rejects stale reads and writes after a session organization switch',async()=>{
  const h=await setup(),cookie=await h.login(),headers={'x-porb-tenant':crypto.randomUUID()};
  assert.equal((await h.call('/v1/atlas/private','GET',undefined,cookie,{headers})).status,409);
  const response=await h.call('/v1/atlas/records','POST',record(),cookie,{headers});
  assert.equal(response.status,409);assert.equal((await response.json()).error,'organization_changed_reload');
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_records').get().n,0);
  assert.equal((await h.call('/v1/atlas/records','POST',record(),cookie,{headers:{'x-porb-tenant':h.tenant}})).status,201);
  h.sqlite.close();
});
test('private Atlas records enforce authentication, tenant isolation, expiry, revision conflicts, audit and purge',async()=>{
  const h=await setup(),cookie=await h.login();
  assert.equal((await h.call('/v1/atlas/private')).status,401);
  const created=await h.call('/v1/atlas/records','POST',record(),cookie);assert.equal(created.status,201);const row=await created.json();assert.equal(row.revision,1);
  const data=await(await h.call('/v1/atlas/private','GET',undefined,cookie)).json();assert.equal(data.records.length,1);assert.equal(data.account_identity.id,h.owner);assert.ok(data.access_audit.some(a=>a.action==='atlas.record.create'));
  assert.equal((await h.call(`/v1/atlas/records/${row.id}`,'POST',{...record(),revision:1,body:'Corrected'},cookie)).status,200);
  assert.equal((await h.call(`/v1/atlas/records/${row.id}`,'POST',{...record(),revision:1,body:'Lost update'},cookie)).status,409);
  const other=crypto.randomUUID();h.sqlite.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(other,'Other organization','research',Date.now());h.sqlite.prepare('UPDATE atlas_records SET tenant_id=? WHERE id=?').run(other,row.id);
  assert.equal((await(await h.call('/v1/atlas/private','GET',undefined,cookie)).json()).records.length,0);
  assert.equal((await h.call(`/v1/atlas/records/${row.id}`,'DELETE',{revision:2},cookie)).status,409);
  h.sqlite.prepare('UPDATE atlas_records SET tenant_id=?,expires_at=? WHERE id=?').run(h.tenant,Date.now()-1,row.id);
  assert.equal((await(await h.call('/v1/atlas/private','GET',undefined,cookie)).json()).records.length,0);
  assert.equal((await h.call(`/v1/atlas/records/${row.id}`,'POST',{...record(),revision:2},cookie)).status,409);
  assert.equal((await(await h.call('/v1/atlas/purge','POST',{},cookie)).json()).deleted,1);
  h.sqlite.close();
});
test('read scopes, viewer restrictions and source reference queries keep governance and findings private',async()=>{
  const h=await setup(),cookie=await h.login();
  h.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=?').run('viewer',h.tenant);
  assert.equal((await h.call('/v1/atlas/records','POST',record(),cookie)).status,403);assert.equal((await h.call('/v1/atlas/purge','POST',{},cookie)).status,403);
  const data=await(await h.call('/v1/atlas/private','GET',undefined,cookie)).json();assert.equal(data.access_audit,null);
  const fetched=await h.call('/v1/atlas/sources','POST',{source:'un-consolidated',references:['QDi.1','QDi.999']},cookie,{fetcher:async()=>new Response(document('un-consolidated'))});
  assert.equal(fetched.status,200);const lookup=await fetched.json();assert.deepEqual(lookup.results.map(r=>r.present_in_snapshot),[true,false]);assert.ok(!JSON.stringify(lookup).includes('DISCARDED'));
  assert.equal((await h.call('/v1/atlas/sources','POST',{source:'un-consolidated',references:['a name']},cookie)).status,400);
  h.sqlite.close();
});
test('delegated tokens require reviewed exact scope, reveal one score, and obey revocation, expiry and issuer membership',async()=>{
  const h=await setup(),cookie=await h.login(),analysis=await(await h.call('/v1/analyses','POST',{asset:'ETH',pages:1},cookie)).json(),node=analysis.scores.rows[0];
  const request={analysis_id:analysis.id,node_id:node.id,review_record_id:crypto.randomUUID(),named_grantee:'Named test recipient',purpose:'Private descriptive evidence review',lifetime_days:1};
  assert.equal((await h.call('/v1/atlas/grants','POST',request,cookie)).status,409);
  const review=await(await h.call('/v1/atlas/records','POST',{...record(),kind:'review',subject:`${analysis.id}:${node.id}`,status:'reviewed'},cookie)).json();
  request.review_record_id=review.id;
  const created=await h.call('/v1/atlas/grants','POST',request,cookie);assert.equal(created.status,201);const grant=await created.json();
  const options={headers:{authorization:'Bearer '+grant.token}},path=`/v1/atlas/delegated/${grant.id}`;
  const response=await h.call(path,'GET',undefined,'',options);assert.equal(response.status,200);const body=await response.json();
  assert.equal(body.score.id,node.id);assert.equal(body.score.red,node.red);assert.equal(body.score.neighborhood,undefined);assert.equal(body.aml_score,false);assert.equal(body.graph,undefined);
  assert.equal((await h.call('/v1/analyses','GET',undefined,'',options)).status,401);
  h.sqlite.prepare('UPDATE atlas_records SET status=? WHERE id=?').run('open',review.id);assert.equal((await h.call(path,'GET',undefined,'',options)).status,401);
  h.sqlite.prepare('UPDATE atlas_records SET status=? WHERE id=?').run('reviewed',review.id);
  h.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=?').run('viewer',h.tenant);assert.equal((await h.call(path,'GET',undefined,'',options)).status,401);
  h.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=?').run('owner',h.tenant);
  assert.equal((await h.call(`/v1/atlas/grants/${grant.id}/revoke`,'POST',{},cookie)).status,200);assert.equal((await h.call(path,'GET',undefined,'',options)).status,401);
  const another=await(await h.call('/v1/atlas/grants','POST',request,cookie)).json();h.sqlite.prepare('UPDATE atlas_score_grants SET expires_at=? WHERE id=?').run(Date.now()-1,another.id);
  assert.equal((await h.call(`/v1/atlas/delegated/${another.id}`,'GET',undefined,'',{headers:{authorization:'Bearer '+another.token}})).status,401);
  h.sqlite.close();
});
