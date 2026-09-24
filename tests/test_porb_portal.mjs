import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,credentials} from './porb_helpers.mjs';
import {random,digest} from '../portal/security.js';
import {handlePortal} from '../portal/router.js';

test('private endpoints fail closed, refuse CSRF and never send unauthenticated source requests',async()=>{
  const s=await setup();
  assert.equal((await s.call('/v1/overview')).status,401);assert.equal((await s.call('/v1/analyses')).status,401);assert.equal(s.calls(),0);
  assert.equal((await s.call('/auth/login','POST',credentials,'',{origin:'https://attacker.example'})).status,403);
  assert.equal((await s.call('/auth/register','POST',credentials)).status,401);
  assert.equal((await s.call('/auth/login','POST',{...credentials,password:'not the correct password'})).status,401);
  const cookie=await s.login();assert.match(cookie,/^__Host-porb_session=/);
  const r=await s.call('/auth/session','GET',undefined,cookie);assert.match(r.headers.get('cache-control'),/no-store/);assert.equal((await r.json()).organization.role,'owner');
  s.sqlite.exec('UPDATE sessions SET expires_at=0');assert.equal((await s.call('/v1/analyses','GET',undefined,cookie)).status,401);
  const unavailable=await handlePortal({request:new Request('https://rednblue.space/api/porb/v1/analyses')});assert.equal(unavailable.status,503);s.sqlite.close();
});
test('invitations bind email and role, expire, are single-use and cannot elevate an existing membership',async()=>{
  const s=await setup(),owner=await s.login();
  const r=await s.call('/invitations','POST',{email:'viewer@example.test',role:'viewer',password:credentials.password},owner);assert.equal(r.status,201);
  const invitation=await r.json(),token=new URL(invitation.invitation_url).hash.split('=')[1];assert.ok(!invitation.invitation_url.includes('?'));
  assert.notEqual(s.sqlite.prepare('SELECT token_hash FROM invitations WHERE id=?').get(invitation.id).token_hash,token);
  const body={email:'viewer@example.test',password:'viewer password for test 123456',invitation:token};
  assert.equal((await s.call('/auth/accept-invite','POST',{...body,email:'other@example.test'})).status,401);
  const accepted=await s.call('/auth/accept-invite','POST',body);assert.equal(accepted.status,200);const viewer=accepted.headers.get('set-cookie').split(';')[0],recovery=(await accepted.json()).recovery_code;assert.equal(recovery.length,64);
  assert.equal((await s.call('/auth/accept-invite','POST',body)).status,401);
  assert.equal((await s.call('/v1/analyses','POST',{asset:'ETH',pages:1},viewer)).status,403);
  assert.equal((await s.call('/keys','GET',undefined,viewer)).status,403);
  assert.equal((await s.call('/invitations','POST',{email:body.email,role:'admin',password:credentials.password},owner)).status,409);
  const expired=random();s.sqlite.prepare('INSERT INTO invitations(id,tenant_id,email,role,token_hash,created_at,expires_at) VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),s.tenant,'expired@example.test','analyst',await digest(expired),0,1);
  assert.equal((await s.call('/auth/accept-invite','POST',{...body,email:'expired@example.test',invitation:expired})).status,401);s.sqlite.close();
});
test('API keys enforce scope, tenant isolation, expiry and immediate revocation; saved analyses are reproducible',async()=>{
  const s=await setup(),owner=await s.login();
  const creation=await s.call('/v1/analyses','POST',{asset:'ETH',pages:2},owner);assert.equal(creation.status,201);const analysis=await creation.json();assert.equal(analysis.records,78);assert.ok(analysis.scores.rows.some(r=>r.red!==null));
  assert.equal((await s.call('/v1/analyses?token=leak','GET',undefined,owner)).status,400);
  const keyRequest={label:'Test integration',days:30,scopes:['analyses:read','scores:read'],password:credentials.password};
  assert.equal((await s.call('/keys','POST',{...keyRequest,password:'incorrect long password'},owner)).status,401);
  const made=await s.call('/keys','POST',keyRequest,owner);assert.equal(made.status,201);const key=await made.json();
  const persisted=s.sqlite.prepare('SELECT * FROM api_keys WHERE id=?').get(key.id);assert.notEqual(persisted.key_hash,key.key);
  const saved=await (await s.call(`/v1/analyses/${analysis.id}`,'GET',undefined,key.key)).json();assert.deepEqual(saved,analysis);
  assert.equal((await s.call('/v1/overview','GET',undefined,key.key)).status,403);assert.equal((await s.call('/keys','GET',undefined,key.key)).status,403);
  const tenant2=crypto.randomUUID();s.sqlite.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(tenant2,'Second tenant','bank',Date.now());s.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?)').run(tenant2,s.owner,'owner');
  const switched=await s.call('/auth/organization','POST',{id:tenant2},owner),otherCookie=switched.headers.get('set-cookie').split(';')[0];
  assert.equal((await s.call(`/v1/analyses/${analysis.id}`,'GET',undefined,otherCookie)).status,404);
  assert.equal((await s.call(`/keys/${key.id}`,'DELETE',{password:credentials.password},otherCookie)).status,404);
  assert.equal((await (await s.call('/v1/analyses','GET',undefined,otherCookie)).json()).analyses.length,0);
  s.sqlite.prepare('UPDATE api_keys SET expires_at=0 WHERE id=?').run(key.id);assert.equal((await s.call('/v1/analyses','GET',undefined,key.key)).status,401);
  s.sqlite.prepare('UPDATE api_keys SET expires_at=? WHERE id=?').run(Date.now()+100000,key.id);
  const back=await s.call('/auth/organization','POST',{id:s.tenant},otherCookie),backCookie=back.headers.get('set-cookie').split(';')[0];
  assert.equal((await s.call(`/keys/${key.id}`,'DELETE',{password:credentials.password},backCookie)).status,200);assert.equal((await s.call('/v1/analyses','GET',undefined,key.key)).status,401);s.sqlite.close();
});
test('recovery rotates one-time secrets and revokes both sessions and API keys',async()=>{
  const s=await setup(),owner=await s.login();
  const key=await (await s.call('/keys','POST',{label:'Recovery test',days:1,scopes:['scores:read'],password:credentials.password},owner)).json();
  const next={email:credentials.email,password:'replacement password test 123456789',recovery:'initial-recovery'};
  const recovered=await s.call('/auth/recover','POST',next);assert.equal(recovered.status,200);const body=await recovered.json();assert.equal(body.recovery_code.length,64);
  assert.equal((await s.call('/v1/model','GET',undefined,owner)).status,401);assert.equal((await s.call('/v1/model','GET',undefined,key.key)).status,401);
  assert.equal((await s.call('/auth/recover','POST',next)).status,401);assert.equal((await s.call('/auth/login','POST',credentials)).status,401);
  const newCookie=await s.login(next);assert.equal((await s.call('/auth/logout','POST',{},newCookie)).status,200);assert.equal((await s.call('/v1/model','GET',undefined,newCookie)).status,401);s.sqlite.close();
});
test('durable authentication budgets and body bounds constrain abuse',async()=>{
  const s=await setup();for(let i=0;i<30;i++)assert.equal((await s.call('/auth/login','POST',{email:'bad',password:'x'})).status,400);
  assert.equal((await s.call('/auth/login','POST',credentials)).status,429);
  const response=await handlePortal({env:s.env,request:new Request('https://rednblue.space/api/porb/auth/login',{method:'POST',headers:{origin:'https://rednblue.space','x-porb-action':'1','content-type':'application/json','cf-connecting-ip':'different'},body:JSON.stringify({email:'x'.repeat(9000)})})});assert.equal(response.status,413);s.sqlite.close();
});

test('concurrent invitation acceptance creates exactly one membership and session',async()=>{
  const s=await setup(),owner=await s.login(),r=await s.call('/invitations','POST',{email:'race@example.test',role:'analyst',password:credentials.password},owner),invite=await r.json();
  const body={email:'race@example.test',password:'concurrent invite password 12345',invitation:new URL(invite.invitation_url).hash.split('=')[1]};
  const responses=await Promise.all([s.call('/auth/accept-invite','POST',body),s.call('/auth/accept-invite','POST',body)]);
  assert.equal(responses.filter(r=>r.status===200).length,1);assert.ok(responses.every(r=>[200,401,409].includes(r.status)));
  const user=s.sqlite.prepare('SELECT id FROM users WHERE email=?').get(body.email);assert.equal(s.sqlite.prepare('SELECT count(*) n FROM memberships WHERE user_id=?').get(user.id).n,1);assert.equal(s.sqlite.prepare('SELECT count(*) n FROM sessions WHERE user_id=?').get(user.id).n,1);s.sqlite.close();
});

test('password changes preserve the current session only, rotate recovery and revoke keys',async()=>{
  const s=await setup(),owner=await s.login(),other=await s.login(),key=await (await s.call('/keys','POST',{label:'Password test',days:1,scopes:['scores:read'],password:credentials.password},owner)).json();
  const r=await s.call('/auth/password','POST',{password:credentials.password,new_password:'changed password test 123456789'},owner);assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0],body=await r.json();assert.equal(body.recovery_code.length,64);
  assert.equal((await s.call('/v1/model','GET',undefined,owner)).status,401);assert.equal((await s.call('/v1/model','GET',undefined,other)).status,401);assert.equal((await s.call('/v1/model','GET',undefined,key.key)).status,401);assert.equal((await s.call('/v1/model','GET',undefined,cookie)).status,200);
  assert.equal((await s.call('/auth/login','POST',credentials)).status,401);s.sqlite.close();
});
