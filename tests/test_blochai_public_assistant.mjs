import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handlePublicAssistant} from '../deploy/blochai-public/assistant.js';
import {handlePublicBlochAI} from '../deploy/blochai-public/worker.js';

const migration=readFileSync(new URL('../deploy/blochai-public/migrations/0001_public_assistant.sql',import.meta.url),'utf8'),host='bloch-graphus.xyz',id='a'.repeat(64);
function setup(){
  const sql=new DatabaseSync(':memory:');sql.exec(migration);let requests=[],next=1;
  const db={prepare(query){let values=[];return {bind(...args){values=args;return this;},async first(){return sql.prepare(query).get(...values)||null;},async run(){return sql.prepare(query).run(...values);}};},async batch(items){return Promise.all(items.map(item=>item.run()));}};
  const env={ENABLE_PUBLIC_ASSISTANT:'true',BLOCHAI_PUBLIC_DB:db,PUBLIC_BLOCHAI_API_TOKEN:'public-only-token-'.repeat(3),PUBLIC_BLOCHAI_IP_HASH_KEY:'private-hash-key-'.repeat(3),PUBLIC_BLOCHAI_API_URL:'https://blochai-origin.posternlabs.com'};
  const fetcher=async(url,init)=>{requests.push({url:String(url),init});return Response.json({task_id:init.method==='POST'?(next++).toString(16).padStart(64,'0'):new URL(url).pathname.split('/').pop(),status:init.method==='POST'?'PENDING':'COMPLETED',model:'synthetic-test-model',output:init.method==='POST'?'hidden before completion':'<script>window.bad=true</script> public explanation',tenant_id:'must-not-escape',node_address:'must-not-escape'});};
  const call=async({path='/api/blochai/tasks',method='POST',body={question_id:'connections'},hostname=host,headers={},now=1750000000000,customFetch=fetcher,configuration=env}={})=>handlePublicAssistant({request:new Request(`https://${hostname}${path}`,{method,headers:{origin:`https://${hostname}`,'sec-fetch-site':'same-origin','x-blochai-client':'public-v1','cf-connecting-ip':'192.0.2.1','content-type':'application/json',...headers},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}),env:configuration,fetcher:customFetch,now});
  return {sql,env,call,requests};
}
test('public fixed questions produce portal-scoped capabilities and forward no browser content or credentials',async()=>{
  const s=setup();try{
    const response=await s.call({headers:{cookie:'private_session=ignore',authorization:'Bearer browser-token'}}),data=await response.json();assert.equal(response.status,202);assert.match(data.poll_token,/^[a-f0-9]{64}$/);assert.equal(data.portal,'graphus');assert.equal(data.output,null);assert.equal(data.tenant_id,undefined);assert.equal(response.headers.get('cache-control'),'no-store');
    const sent=s.requests[0];assert.equal(sent.url,'https://blochai-origin.posternlabs.com/public/v1/tasks');assert.equal(sent.init.redirect,'manual');assert.deepEqual(JSON.parse(sent.init.body),{portal:'graphus',question_id:'connections'});assert.deepEqual(Object.keys(sent.init.headers).sort(),['accept','authorization','content-type','user-agent']);assert.equal(sent.init.headers.authorization,`Bearer ${s.env.PUBLIC_BLOCHAI_API_TOKEN}`);
    const stored=s.sql.prepare('SELECT * FROM blochai_public_jobs').get();assert.notEqual(stored.ticket_digest,data.poll_token);assert.equal(stored.portal,'graphus');assert.equal(stored.expires_at,1750003600);assert.doesNotMatch(JSON.stringify(s.sql.prepare('SELECT * FROM blochai_public_budget').all()),/192\.0\.2\.1|private_session/);
    const polled=await s.call({path:`/api/blochai/tasks/${data.task_id}`,method:'GET',headers:{'x-blochai-ticket':data.poll_token}}),result=await polled.json();assert.equal(polled.status,200);assert.equal(result.output,'<script>window.bad=true</script> public explanation');assert.equal(result.tenant_id,undefined);assert.equal(result.node_address,undefined);assert.equal(result.poll_token,undefined);assert.equal(s.requests[1].url,`https://blochai-origin.posternlabs.com/public/v1/tasks/${data.task_id}?portal=graphus`);
  }finally{s.sql.close();}
});
test('strict fixed catalog rejects free text, foreign questions, tenant overrides, query parameters and malformed bodies before backend',async()=>{
  const s=setup();try{
    for(const body of [{question_id:'connections',prompt:'AML input'},{question_id:'connections',portal:'space'},{question_id:'transactions'},{question_id:'__proto__'},{question_id:'constructor'},{question_id:'connections',tenant_id:'private'},{question_id:'connections',model:'other'},[],null,'{','x'.repeat(600)])assert.ok([400,413].includes((await s.call({body})).status));
    for(const path of ['/api/blochai/tasks?portal=space','/api/blochai/tasks/','/api/blochai/status',`/api/blochai/tasks/${id}?portal=graphus`,`/api/blochai/tasks/${id}/extra`])assert.equal((await s.call({path,method:'GET'})).status,404);
    assert.equal((await s.call({method:'OPTIONS'})).status,405);assert.equal(s.requests.length,0);
  }finally{s.sql.close();}
});
test('cross-origin and missing client headers cannot submit or read tasks',async()=>{
  const s=setup();try{
    for(const headers of [{origin:'https://attacker.test'},{origin:'null'},{origin:''},{'sec-fetch-site':'cross-site'},{'x-blochai-client':''}])assert.equal((await s.call({headers})).status,403);
    for(const hostname of ['blochai.xyz','rednblue.space','bloch-grapus.xyz','attacker.test'])assert.equal((await s.call({hostname})).status,404);
    assert.equal((await s.call({headers:{'cf-connecting-ip':''}})).status,503);assert.equal(s.requests.length,0);
  }finally{s.sql.close();}
});
test('poll capability is mandatory, scoped to portal and task, hashed and expires after one hour',async()=>{
  const s=setup();try{
    const data=await(await s.call()).json(),path=`/api/blochai/tasks/${data.task_id}`;
    for(const item of [{headers:{}},{headers:{'x-blochai-ticket':'0'.repeat(64)}},{hostname:'bloch.space',headers:{'x-blochai-ticket':data.poll_token}},{path:`/api/blochai/tasks/${id}`,headers:{'x-blochai-ticket':data.poll_token}},{now:1750003600000,headers:{'x-blochai-ticket':data.poll_token}}])assert.equal((await s.call({path,method:'GET',...item})).status,404);
    assert.equal(s.requests.length,1);
  }finally{s.sql.close();}
});
test('per-address limits are shared between portals and enforce six/minute and twenty/day',async()=>{
  const s=setup();try{
    for(let i=0;i<20;i++)assert.equal((await s.call({now:1750000000000+Math.floor(i/6)*60000})).status,202);
    assert.equal((await s.call({now:1750000240000})).status,429);assert.equal(s.requests.length,20);
  }finally{s.sql.close();}
  const m=setup();try{
    for(let i=0;i<6;i++)assert.equal((await m.call()).status,202);
    assert.equal((await m.call({hostname:'bloch.space',body:{question_id:'observations'}})).status,429);assert.equal(m.requests.length,6);
  }finally{m.sql.close();}
});
test('global limit and poll limits are enforced by atomic database counters',async()=>{
  const s=setup();try{
    s.env.PUBLIC_BLOCHAI_DAILY_LIMIT='1';const data=await(await s.call()).json();assert.equal((await s.call({headers:{'cf-connecting-ip':'192.0.2.2'}})).status,429);
    for(let i=0;i<90;i++)assert.equal((await s.call({path:`/api/blochai/tasks/${data.task_id}`,method:'GET',headers:{'x-blochai-ticket':data.poll_token}})).status,200);
    assert.equal((await s.call({path:`/api/blochai/tasks/${data.task_id}`,method:'GET',headers:{'x-blochai-ticket':data.poll_token}})).status,429);
  }finally{s.sql.close();}
});
test('upstream redirects, failures, invalid IDs and unknown metadata fail closed',async()=>{
  const s=setup();try{
    for(const customFetch of [async()=>new Response('',{status:302,headers:{location:'https://attacker.test'}}),async()=>Response.json({error:'secret details'},{status:500}),async()=>Response.json({task_id:'private-task',status:'COMPLETED',output:'secret'}),async()=>Response.json({task_id:id,status:'COMPLETED',model:'m',output:null})]){const response=await s.call({customFetch});assert.equal(response.status,503);assert.equal(await response.text(),'{"error":"public_backend_unavailable"}');}
    s.env.PUBLIC_BLOCHAI_API_URL='https://attacker.test';assert.equal((await s.call()).status,503);
  }finally{s.sql.close();}
});
test('assistant assets are same-origin on approved public portals, never on hub or private host',async()=>{
  let calls=0;const env={ASSETS:{async fetch(request){calls++;assert.equal(request.headers.has('cookie'),false);assert.equal(request.headers.has('authorization'),false);return new Response('asset',{headers:{'set-cookie':'no','access-control-allow-origin':'*'}});}}};
  for(const hostname of [host,'bloch.space','blochl1.com'])for(const path of ['/blochai-assistant.js','/blochai-assistant.css']){
    const response=await handlePublicBlochAI({request:new Request(`https://${hostname}${path}`,{headers:{cookie:'private=ignored'}}),env});assert.equal(response.status,200);assert.equal(response.headers.has('set-cookie'),false);assert.equal(response.headers.has('access-control-allow-origin'),false);
  }
  for(const hostname of ['blochai.xyz','rednblue.space'])for(const path of ['/blochai-assistant.js','/blochai-assistant.css','/api/blochai/tasks'])assert.equal((await handlePublicBlochAI({request:new Request(`https://${hostname}${path}`),env})).status,404);assert.equal(calls,6);
});
