import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleAccount} from '../space/chain/accounts.js';

function setup(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(readFileSync(new URL('../space/migrations/0001_accounts.sql',import.meta.url),'utf8'));
  function statement(sql,args=[]){return {bind(...values){return statement(sql,values);},async first(){return db.prepare(sql).get(...args)||null;},async run(){const result=db.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}};}
  const env={SPACE_AUTH_PEPPER:'only-a-test-pepper',SPACE_DB:{prepare:statement,async batch(statements){db.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}}};
  const call=async(path,method='GET',body=null,cookie='',origin='https://bloch.space')=>{
    const headers={'cookie':cookie,'CF-Connecting-IP':'127.0.0.1'};
    if(method!=='GET')Object.assign(headers,{'content-type':'application/json','x-space-action':'1',origin});
    return handleAccount({env,request:new Request(`https://bloch.space/api/${path}`,{method,headers,body:body?JSON.stringify(body):undefined})});
  };
  return {call,db};
}
const credentials={email:'researcher@example.test',password:'a very long test password 123'};
test('account lifecycle protects private data, scopes preferences, revokes sessions and recovers securely',async()=>{
  const {call,db}=setup();assert.equal((await call('porb/preview')).status,401);
  assert.equal((await call('account/register','POST',credentials,'','https://evil.example')).status,403);
  const registration=await call('account/register','POST',credentials);assert.equal(registration.status,200);
  const cookie=registration.headers.get('set-cookie').split(';')[0],registered=await registration.json();assert.match(registration.headers.get('set-cookie'),/HttpOnly/);assert.match(registration.headers.get('set-cookie'),/Secure/);assert.equal(registered.recovery_code.length,64);assert.equal(registered.live_score_access,false);
  const persisted=db.prepare('SELECT * FROM space_accounts').get();assert.notEqual(persisted.password_hash,credentials.password);assert.notEqual(persisted.recovery_hash,registered.recovery_code);
  assert.equal((await call('account/login','POST',{...credentials,password:'an incorrect password here'})).status,401);
  const workspace={network:'ethereum',view:'ml',range:'48'};assert.equal((await call('account/workspace','POST',workspace,cookie)).status,200);
  assert.deepEqual((await (await call('account/workspace','GET',null,cookie)).json()).workspace,workspace);
  const other=await call('account/register','POST',{...credentials,email:'other@example.test'}),otherCookie=other.headers.get('set-cookie').split(';')[0];assert.equal((await (await call('account/workspace','GET',null,otherCookie)).json()).workspace,null);
  const preview=await (await call('porb/preview','GET',null,cookie)).json();assert.equal(preview.mode,'synthetic_demo');assert.equal(preview.live_scores,false);assert.equal((await call('porb/score','GET',null,cookie)).status,403);
  const recovered=await call('account/recover','POST',{...credentials,password:'my replacement password 456',recovery:registered.recovery_code});assert.equal(recovered.status,200);
  assert.equal((await (await call('account/session','GET',null,cookie)).json()).authenticated,false);
  assert.equal((await call('account/recover','POST',{...credentials,recovery:registered.recovery_code})).status,401);
  const newCookie=recovered.headers.get('set-cookie').split(';')[0];assert.equal((await call('account/delete','DELETE',{password:'my replacement password 456'},newCookie)).status,200);
  assert.equal(db.prepare('SELECT count(*) n FROM space_workspace WHERE account_id=?').get(persisted.id).n,0);assert.equal(db.prepare('SELECT count(*) n FROM space_sessions WHERE account_id=?').get(persisted.id).n,0);
  assert.equal((await (await call('account/session','GET',null,newCookie)).json()).authenticated,false);db.close();
});
test('expired and forged sessions fail closed; logout revokes the server token',async()=>{
  const {call,db}=setup(),registration=await call('account/register','POST',credentials),cookie=registration.headers.get('set-cookie').split(';')[0];
  assert.equal((await (await call('account/session','GET',null,'__Host-space_session='+'a'.repeat(64))).json()).authenticated,false);
  await call('account/logout','POST',null,cookie);assert.equal((await call('porb/preview','GET',null,cookie)).status,401);
  const login=await call('account/login','POST',credentials),newCookie=login.headers.get('set-cookie').split(';')[0];db.exec('UPDATE space_sessions SET expires_at=0');assert.equal((await call('porb/preview','GET',null,newCookie)).status,401);db.close();
});
test('durable auth budgets and input bounds reject excess attempts',async()=>{
  const {call,db}=setup();for(let i=0;i<20;i++)assert.equal((await call('account/login','POST',{email:'bad',password:'x'})).status,400);
  const limited=await call('account/login','POST',credentials);assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'3600');db.close();
});
test('unconfigured authentication reports unavailable without exposing private previews',async()=>{
  const response=await handleAccount({request:new Request('https://bloch.space/api/porb/preview'),env:{}});assert.equal(response.status,503);assert.match(response.headers.get('cache-control'),/no-store/);
});
