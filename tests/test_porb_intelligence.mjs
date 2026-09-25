import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setup,credentials,sourceGraph} from './porb_helpers.mjs';
import {digest,random} from '../portal/security.js';
import {referenceOf} from '../portal/intelligence.js';
import {MODULE_ROUTES} from '../portal/modules.js';
import {onRequest as moduleMiddleware} from '../site/functions/graphus/_middleware.js';
const address='0x'+(40).toString(16).padStart(40,'0');
async function ok(response,status=200){assert.equal(response.status,status,await response.clone().text());assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('x-request-id'),/^[a-f0-9-]{36}$/);return response.json();}
async function create(s,cookie){return ok(await s.call('/v1/analyses','POST',{asset:'ETH',pages:2},cookie),201);}
async function key(s,cookie,scopes){return (await ok(await s.call('/keys','POST',{label:'Intelligence test',days:1,scopes,password:credentials.password},cookie),201)).key;}
async function otherTenant(s,cookie){const tenant=crypto.randomUUID();s.sqlite.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(tenant,'Separate tenant','bank',Date.now());s.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?)').run(tenant,s.owner,'owner');const r=await s.call('/auth/organization','POST',{id:tenant},cookie);return r.headers.get('set-cookie').split(';')[0];}

test('exact reference index, normalization, stable pagination, legacy indexing and tenant isolation',async t=>{
  const s=await setup();t.after(()=>s.sqlite.close());const cookie=await s.login(),a=await create(s,cookie),b=await create(s,cookie);
  s.sqlite.prepare('UPDATE analyses SET created_at=100').run();
  const query='/v1/references?asset=ETH&reference='+address.toUpperCase()+'&limit=1';
  const first=await ok(await s.call(query,'GET',undefined,cookie)),second=await ok(await s.call(query+'&cursor='+first.next_cursor,'GET',undefined,cookie));
  assert.equal(first.items.length,1);assert.equal(second.items.length,1);assert.notEqual(first.items[0].id,second.items[0].id);assert.equal(second.next_cursor,null);assert.equal(first.items[0].score.incoming_base_units,'1560000000000000000000');assert.deepEqual(first.index,{retained:2,indexed:2});
  for(const bad of ['&limit=2','&token=secret','&cursor=bad'])assert.equal((await s.call(query+bad,'GET',undefined,cookie)).status,400);
  assert.equal((await s.call('/v1/references?asset=ETH&reference=%3Cscript%3E','GET',undefined,cookie)).status,400);
  s.sqlite.prepare('DELETE FROM analysis_references WHERE analysis_id=?').run(a.id);s.sqlite.prepare('UPDATE analyses SET indexed_at=NULL WHERE id=?').run(a.id);
  assert.equal((await ok(await s.call(query,'GET',undefined,cookie))).index.indexed,1);await ok(await s.call('/v1/analyses/'+a.id,'GET',undefined,cookie));assert.equal((await ok(await s.call(query,'GET',undefined,cookie))).index.indexed,2);
  const other=await otherTenant(s,cookie);assert.deepEqual((await ok(await s.call(query,'GET',undefined,other))).items,[]);
  assert.equal(referenceOf('BTC','1BoatSLRHtKNngkdXEeobR76b53LETtpyT'),'1BoatSLRHtKNngkdXEeobR76b53LETtpyT');assert.throws(()=>referenceOf('BTC','bC1abcdef123456789'));
});

test('evidence keeps exact records and verifiable digest after analysis retention; deduplication and close state',async t=>{
  const s=await setup();t.after(()=>s.sqlite.close());const cookie=await s.login(),run=await create(s,cookie),c=await ok(await s.call('/v1/cases','POST',{title:'Source observations'},cookie),201),body={analysis_id:run.id,node_id:'ETH:address:'+address};
  const packet=await ok(await s.call(`/v1/cases/${c.id}/evidence`,'POST',body,cookie),201);assert.equal(packet.snapshot.records_total,78);assert.equal(packet.snapshot.records_returned,78);assert.equal(packet.digest,await digest(JSON.stringify(packet.snapshot)));assert.equal(packet.snapshot.edges[0].amount_base_units,run.graph.edges[0].amount_base_units);
  const repeated=await ok(await s.call(`/v1/cases/${c.id}/evidence`,'POST',body,cookie));assert.equal(repeated.id,packet.id);assert.equal(repeated.duplicate,true);
  await ok(await s.call(`/v1/cases/${c.id}/status`,'POST',{status:'closed'},cookie));assert.equal((await s.call(`/v1/cases/${c.id}/evidence`,'POST',body,cookie)).status,409);
  s.sqlite.prepare('DELETE FROM analyses WHERE id=?').run(run.id);assert.equal(s.sqlite.prepare('SELECT count(*) AS n FROM analysis_references').get().n,0);
  const exported=await ok(await s.call(`/v1/cases/${c.id}/export`,'GET',undefined,cookie));assert.equal(exported.evidence[0].digest,packet.digest);assert.deepEqual(exported.evidence[0].snapshot,packet.snapshot);
  const other=await otherTenant(s,cookie);for(const suffix of ['', '/export'])assert.equal((await s.call(`/v1/cases/${c.id}${suffix}`,'GET',undefined,other)).status,404);
  assert.equal((await s.call(`/v1/cases/${c.id}`,'DELETE',{},other)).status,404);
});

test('evidence declares truncation and never accepts client-supplied scores or foreign analysis',async t=>{
  const s=await setup();t.after(()=>s.sqlite.close());const cookie=await s.login(),run=await ok(await s.call('/v1/analyses','POST',{asset:'ETH',pages:4},cookie),201),c=await ok(await s.call('/v1/cases','POST',{title:'Truncated sample'},cookie),201);
  const body={analysis_id:run.id,node_id:'ETH:address:'+address};const packet=await ok(await s.call(`/v1/cases/${c.id}/evidence`,'POST',body,cookie),201);assert.equal(packet.snapshot.records_total,156);assert.equal(packet.snapshot.records_returned,100);assert.equal(packet.snapshot.truncated,true);
  assert.equal((await s.call(`/v1/cases/${c.id}/evidence`,'POST',{...body,score:99},cookie)).status,400);
  const other=await otherTenant(s,cookie),foreign=await ok(await s.call('/v1/cases','POST',{title:'Other case'},other),201);assert.equal((await s.call(`/v1/cases/${foreign.id}/evidence`,'POST',body,other)).status,404);
});

test('watchlists evaluate on collection, manual evaluation is idempotent, reviewing and removal are isolated',async t=>{
  const s=await setup();t.after(()=>s.sqlite.close());const cookie=await s.login(),entry=await ok(await s.call('/v1/watchlists','POST',{asset:'ETH',reference:address},cookie),201);
  assert.equal((await ok(await s.call('/v1/watchlists','POST',{asset:'ETH',reference:address.toUpperCase()},cookie))).id,entry.id);
  const run=await create(s,cookie),inbox=await ok(await s.call('/v1/observations','GET',undefined,cookie));assert.equal(inbox.items.length,1);const event=inbox.items[0];assert.equal(event.observation.incoming_events,78);assert.equal(event.observation.dataset_digest,run.digest);
  const evaluated=await ok(await s.call('/v1/watchlists/evaluate','POST',{analysis_id:run.id},cookie));assert.equal(evaluated.observations_created,0);
  await ok(await s.call(`/v1/observations/${event.id}/review`,'POST',{},cookie));assert.ok((await ok(await s.call('/v1/observations','GET',undefined,cookie))).items[0].reviewed_at);
  const next=await create(s,cookie);assert.equal((await ok(await s.call('/v1/observations','GET',undefined,cookie))).items.length,2);
  const before=await ok(await s.call('/v1/watchlists','POST',{asset:'ETH',reference:'0x'+'1'.padStart(40,'0')},cookie),201);assert.ok(before.id);
  assert.equal((await ok(await s.call('/v1/watchlists/evaluate','POST',{analysis_id:next.id},cookie))).observations_created,1);
  const other=await otherTenant(s,cookie);assert.deepEqual((await ok(await s.call('/v1/observations','GET',undefined,other))).items,[]);assert.equal((await s.call(`/v1/observations/${event.id}/review`,'POST',{},other)).status,404);assert.equal((await s.call(`/v1/watchlists/${entry.id}`,'DELETE',{},other)).status,404);
});

test('new scopes cannot leak scores; viewer cannot mutate any investigation or watchlist',async t=>{
  const s=await setup();t.after(()=>s.sqlite.close());const cookie=await s.login(),run=await create(s,cookie),c=await ok(await s.call('/v1/cases','POST',{title:'Permission test'},cookie),201),restricted=await key(s,cookie,['cases:read','watchlists:read']);
  await ok(await s.call('/v1/cases','GET',undefined,restricted));assert.equal((await s.call(`/v1/cases/${c.id}`,'GET',undefined,restricted)).status,403);assert.equal((await s.call('/v1/observations','GET',undefined,restricted)).status,403);assert.equal((await s.call('/v1/references?asset=ETH&reference='+address,'GET',undefined,restricted)).status,403);
  s.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=? AND user_id=?').run('viewer',s.tenant,s.owner);
  for(const [path,body] of [['/v1/cases',{title:'Forbidden'}],[`/v1/cases/${c.id}/status`,{status:'closed'}],[`/v1/cases/${c.id}/evidence`,{analysis_id:run.id,node_id:run.scores.rows[0].id}],['/v1/watchlists',{asset:'ETH',reference:address}],['/v1/watchlists/evaluate',{analysis_id:run.id}]])assert.equal((await s.call(path,'POST',body,cookie)).status,403);
  assert.equal((await s.call(`/v1/cases/${c.id}`,'DELETE',{},cookie)).status,403);assert.equal((await s.call('/v1/cases','GET',undefined,restricted)).status,401);
});

test('module gateway uses fixed sources, requires permission, preserves failures and never forwards secrets',async t=>{
  const s=await setup();t.after(()=>s.sqlite.close());const cookie=await s.login(),restricted=await key(s,cookie,['scores:read']),dataKey=await key(s,cookie,['data:read']);let requests=0;
  const fetcher=async(url,options)=>{requests++;assert.equal(new URL(url).origin,'https://bloch-graphus.xyz');assert.equal(options.redirect,'manual');assert.ok(!options.headers.authorization&&!options.headers.cookie);return Response.json(sourceGraph());};
  const path='/v1/graphus/chain/network?asset=ETH';assert.equal((await s.call(path,'GET',undefined,'',{fetcher})).status,401);assert.equal((await s.call(path,'GET',undefined,restricted,{fetcher})).status,403);assert.equal(requests,0);
  await ok(await s.call(path,'GET',undefined,dataKey,{fetcher}));assert.equal(requests,1);
  assert.equal((await s.call(path+'&url=https://attacker.test','GET',undefined,dataKey,{fetcher})).status,400);assert.equal((await s.call('/v1/graphus/auth/google','GET',undefined,dataKey,{fetcher})).status,404);
  assert.equal((await s.call('/v1/graphus/constructor','GET',undefined,dataKey,{fetcher})).status,404);
  const failure=await s.call(path,'GET',undefined,dataKey,{fetcher:async()=>Response.json({error:'unsupported_source'}, {status:422})});assert.equal(failure.status,422);assert.equal((await failure.json()).error,'unsupported_source');
  assert.equal((await s.call(path,'GET',undefined,dataKey,{fetcher:async()=>new Response(null,{status:302,headers:{location:'https://attacker.test'}})})).status,502);
  const anonymous=await moduleMiddleware({request:new Request('https://rednblue.space/graphus/map.html'),env:s.env,next:async()=>new Response('private module')});assert.equal(anonymous.status,302);
  const page=await moduleMiddleware({request:new Request('https://rednblue.space/graphus/map.html',{headers:{cookie}}),env:s.env,next:async()=>new Response('module')});assert.equal(page.status,200);assert.equal(page.headers.get('x-frame-options'),'SAMEORIGIN');
});

test('OpenAPI exposes each mounted Graphus route and requires authentication on every documented operation',async t=>{
  const s=await setup();t.after(()=>s.sqlite.close());const doc=JSON.parse(readFileSync(new URL('../site/developers/openapi.json',import.meta.url)));
  assert.equal(doc.openapi,'3.1.0');for(const route of Object.keys(MODULE_ROUTES))assert.ok(doc.paths['/v1/graphus/'+route]);
  for(const [path,methods] of Object.entries(doc.paths))for(const [method,op] of Object.entries(methods)){
    assert.ok(op['x-required-scopes'].length);assert.deepEqual(op.security,[{PartnerKey:[]}]);assert.ok(op.operationId);
    const resolved=path.replaceAll('{id}',crypto.randomUUID());const response=await s.call(resolved,method.toUpperCase(),method==='get'?undefined:{});assert.equal(response.status,401,method+' '+path);
  }
  assert.equal(s.calls(),0);
});
