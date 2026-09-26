import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,credentials} from './porb_helpers.mjs';
const ref='0x'+(40).toString(16).padStart(40,'0');
const create=async(s,cookie)=>{const r=await s.call('/v1/analyses','POST',{asset:'ETH',pages:1},cookie);assert.equal(r.status,201);return r.json();};
const makeKey=async(s,cookie,scopes)=>(await(await s.call('/keys','POST',{label:'Research API fixture',days:1,password:credentials.password,scopes},cookie)).json()).key;
test('batch research normalizes, deduplicates and bounds ordered results without fetching source data',async t=>{
  const s=await setup();t.after(()=>s.sqlite.close());const cookie=await s.login();await create(s,cookie);await create(s,cookie);
  const before=s.calls(),path='/v1/references/batch',key=await makeKey(s,cookie,['analyses:read','scores:read']);
  const result=await s.call(path,'POST',{asset:'ETH',references:[ref,ref.toUpperCase(),'0x'+'f'.repeat(40)],runs_per_reference:1},key);
  assert.equal(result.status,200);assert.equal(result.headers.get('x-porb-api-version'),'1.2');const b=await result.json();assert.equal(b.requested,3);assert.equal(b.unique_references,2);assert.equal(b.items[0].observations.length,1);assert.equal(b.items[1].observations.length,0);assert.equal(s.calls(),before);
  for(const body of [{asset:'ETH',references:[]},{asset:'ETH',references:Array(26).fill(ref)},{asset:'ETH',references:[ref],runs_per_reference:6},{asset:'ETH',references:[ref],tenant_id:s.tenant}])assert.equal((await s.call(path,'POST',body,key)).status,400);
  assert.equal((await s.call(path,'POST',{asset:'ETH',references:[ref]})).status,401);
  const other=crypto.randomUUID();s.sqlite.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(other,'Separate API tenant','research',Date.now());s.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?)').run(other,s.owner,'owner');
  const switched=await s.call('/auth/organization','POST',{id:other},cookie),otherCookie=switched.headers.get('set-cookie').split(';')[0];
  const empty=await(await s.call(path,'POST',{asset:'ETH',references:[ref]},otherCookie)).json();assert.equal(empty.items[0].observations.length,0);assert.equal(empty.index.retained,0);
});
test('capabilities, profiles and ML APIs enforce key scopes and revocation and preserve legacy model state',async t=>{
  const s=await setup();t.after(()=>s.sqlite.close());const cookie=await s.login(),run=await create(s,cookie),base=`/v1/analyses/${run.id}`;
  const dataKey=await makeKey(s,cookie,['data:read']),readKey=await makeKey(s,cookie,['analyses:read','scores:read']);
  const caps=await(await s.call('/v1/capabilities','GET',undefined,dataKey)).json();assert.deepEqual(caps.granted_scopes,['data:read']);assert.equal(caps.limits.collection_pages,8);
  assert.equal((await s.call('/v1/capabilities','GET',undefined,readKey)).status,403);
  for(const route of ['/profile','/ml','/neighbors?reference='+ref]){
    assert.equal((await s.call(base+route,'GET',undefined,dataKey)).status,403);
    const r=await s.call(base+route,'GET',undefined,readKey);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/private/);assert.equal((await r.json()).dataset_digest,run.digest);
  }
  const ml=await(await s.call(base+'/ml','GET',undefined,readKey)).json();assert.equal(ml.neighborhood.available,true);assert.equal(ml.neighborhood.model.neighbors,10);
  const nearby=await(await s.call(base+'/neighbors?reference='+ref.toUpperCase(),'GET',undefined,readKey)).json();assert.equal(nearby.neighborhood.nearest.length,3);
  assert.equal((await s.call(base+'/neighbors?reference='+ref+'&reference='+ref,'GET',undefined,readKey)).status,400);
  assert.equal((await s.call(base+'/neighbors?reference=0x'+'f'.repeat(40),'GET',undefined,readKey)).status,404);
  const legacy=structuredClone(run);delete legacy.scores.neighborhood;delete legacy.scores.evidence_profile;legacy.scores.rows.forEach(r=>delete r.neighborhood);
  s.sqlite.prepare('DELETE FROM analysis_parts WHERE analysis_id=?').run(run.id);s.sqlite.prepare('INSERT INTO analysis_parts VALUES(?,?,?)').run(run.id,0,JSON.stringify(legacy));
  assert.equal((await(await s.call(base+'/ml','GET',undefined,readKey)).json()).neighborhood.available,false);assert.equal((await(await s.call(base+'/profile','GET',undefined,readKey)).json()).profile.records,39);
  const otherId=crypto.randomUUID();assert.equal((await s.call(`/v1/analyses/${otherId}/profile`,'GET',undefined,readKey)).status,404);
  s.sqlite.prepare('UPDATE api_keys SET revoked_at=?').run(Date.now());assert.equal((await s.call(base+'/ml','GET',undefined,readKey)).status,401);
});

test('portal-generated keys accept all existing scopes and reject invented scopes',async t=>{
  const s=await setup();t.after(()=>s.sqlite.close());const cookie=await s.login();
  const scopes=['data:read','analyses:read','scores:read','analyses:write','cases:read','cases:write','watchlists:read','watchlists:write'];
  const key=await makeKey(s,cookie,scopes);assert.match(key,/^porb_[a-f0-9]{64}$/);
  const capabilities=await(await s.call('/v1/capabilities','GET',undefined,key)).json();assert.deepEqual(capabilities.granted_scopes,scopes);
  const bad=await s.call('/keys','POST',{label:'Invalid scope fixture',days:1,password:credentials.password,scopes:['administrator:all']},cookie);assert.equal(bad.status,400);
});
