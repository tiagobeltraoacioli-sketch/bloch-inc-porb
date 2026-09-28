import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,credentials} from './porb_helpers.mjs';
import {handleBlochAI} from '../deploy/blochai/worker.js';

const fleet={service:'BlochAI',ready:true,model:'test-model',backend:'ollama',nodes:{registered:15,online:2,ready:1,gpu_ready:1},fleet:{target_nodes:15,target_vram_gb:2}};
const result={task_id:'test-task-1',status:'PENDING',model:'test-model',created_at:1750000000,poll_after_ms:1500};
async function fixture(){
  const s=await setup(),cookie=await s.login(),requests=[];
  s.env.BLOCHAI_API_URL='https://private-inference.example.test';s.env.BLOCHAI_API_TOKEN='test-only-service-token-with-32-characters';
  const fetcher=async(url,init)=>{requests.push({url:new URL(url),init});return Response.json(new URL(url).pathname==='/v1/status'?fleet:result);};
  const call=(path,method='GET',body,access=cookie,source=fetcher)=>{
    const headers=access.startsWith('porb_')?{authorization:`Bearer ${access}`}:{cookie:access};
    if(method!=='GET')Object.assign(headers,{'content-type':'application/json',origin:'https://rednblue.space','x-porb-action':'1'});
    return handleBlochAI({request:new Request(`https://rednblue.space/api/porb/v1/blochai${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env:s.env,fetcher:source});
  };
  return {...s,cookie,requests,fetcher,blochai:call};
}
test('BlochAI requires a browser session and never calls the backend anonymously',async()=>{
  const s=await fixture();try{
    assert.equal((await s.blochai('/status','GET',undefined,'')).status,401);assert.equal(s.requests.length,0);
    const key=await(await s.call('/keys','POST',{label:'BlochAI denied key',days:1,scopes:['data:read','analyses:read','analyses:write'],password:credentials.password},s.cookie)).json();
    assert.equal((await s.blochai('/status','GET',undefined,key.key)).status,403);assert.equal(s.requests.length,0);
  }finally{s.sqlite.close();}
});
test('status reports verified counts, sanitized fields and no-store response',async()=>{
  const s=await fixture();try{
    const response=await s.blochai('/status'),body=await response.json();assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(body.organization_id,s.tenant);assert.deepEqual(body.nodes,fleet.nodes);assert.equal(body.ready,true);assert.equal(s.requests[0].init.headers.authorization,`Bearer ${s.env.BLOCHAI_API_TOKEN}`);assert.equal(s.requests[0].init.redirect,'manual');assert.equal(s.requests[0].url.pathname,'/v1/status');
    const serialized=JSON.stringify(body);assert.ok(!serialized.includes(s.env.BLOCHAI_API_TOKEN));assert.ok(!serialized.includes('private-inference'));
  }finally{s.sqlite.close();}
});
test('unconfigured, offline and malformed fleets remain explicitly unavailable',async()=>{
  const s=await fixture();try{
    delete s.env.BLOCHAI_API_TOKEN;let body=await(await s.blochai('/status')).json();assert.equal(body.reason,'backend_not_configured');assert.equal(body.nodes,null);assert.equal(body.ready,false);assert.equal(s.requests.length,0);
    s.env.BLOCHAI_API_TOKEN='test-only-service-token-with-32-characters';
    for(const source of [async()=>{throw new Error('private upstream secret');},async()=>Response.json({...fleet,nodes:{registered:1,online:2,ready:2,gpu_ready:2}}),async()=>Response.json({...fleet,backend:'mock'}),async()=>new Response('secret',{status:503})]){
      body=await(await s.blochai('/status','GET',undefined,s.cookie,source)).json();assert.equal(body.ready,false);assert.equal(body.nodes,null);assert.equal(body.reason,'backend_unavailable');assert.ok(!JSON.stringify(body).includes('secret'));
    }
    s.env.BLOCHAI_API_URL='http://private-inference.example.test';body=await(await s.blochai('/status')).json();assert.equal(body.reason,'backend_not_configured');
  }finally{s.sqlite.close();}
});
test('submissions inject the authenticated tenant, keep prompts out of audit and reject overrides',async()=>{
  const s=await fixture();try{
    const response=await s.blochai('/tasks','POST',{prompt:'Private organization prompt',max_new_tokens:64});assert.equal(response.status,202);const body=await response.json();assert.equal(body.task_id,result.task_id);assert.equal(body.organization_id,s.tenant);assert.equal(body.output,null);
    assert.deepEqual(JSON.parse(s.requests[0].init.body),{tenant_id:s.tenant,prompt:'Private organization prompt',max_new_tokens:64});
    const audits=s.sqlite.prepare("SELECT * FROM audit WHERE action='blochai.submit'").all();assert.equal(audits.length,1);assert.ok(!JSON.stringify(audits).includes('Private organization prompt'));
    assert.equal((await s.blochai('/tasks','POST',{prompt:'test',tenant_id:'another-tenant'})).status,400);assert.equal((await s.blochai('/tasks','POST',{prompt:'test',model:'mock'})).status,400);assert.equal(s.requests.length,1);
  }finally{s.sqlite.close();}
});
test('polls use only the active tenant and expose output only when completed',async()=>{
  const s=await fixture();try{
    let body=await(await s.blochai('/tasks/test-task-1','GET',undefined,s.cookie,async(url,init)=>{s.requests.push({url:new URL(url),init});return Response.json({...result,output:'premature',tenant_id:'must-not-be-exposed',node_address:'private-worker'});})).json();
    assert.equal(s.requests[0].url.searchParams.get('tenant_id'),s.tenant);assert.equal(body.output,null);assert.equal(body.node_address,undefined);assert.equal(body.tenant_id,undefined);
    body=await(await s.blochai('/tasks/test-task-1','GET',undefined,s.cookie,async()=>Response.json({...result,status:'COMPLETED',output:'Model response <script> is text'}))).json();assert.equal(body.output,'Model response <script> is text');
    const org=await(await s.call('/organizations','POST',{name:'Second organization',sector:'research',password:credentials.password},s.cookie)).json();
    const switchResponse=await s.call('/auth/organization','POST',{id:org.id},s.cookie),secondCookie=switchResponse.headers.get('set-cookie').split(';')[0];
    const response=await s.blochai('/tasks/test-task-1','GET',undefined,secondCookie,async url=>{assert.equal(new URL(url).searchParams.get('tenant_id'),org.id);return Response.json({error:'Not found'},{status:404});});assert.equal(response.status,404);
    assert.equal((await s.blochai('/tasks/test-task-1?tenant_id=another','GET',undefined,secondCookie)).status,400);
  }finally{s.sqlite.close();}
});
test('viewer roles cannot submit, and CSRF protection precedes all backend actions',async()=>{
  const s=await fixture();try{
    s.sqlite.prepare("UPDATE memberships SET role='viewer' WHERE user_id=?").run(s.owner);
    assert.equal((await s.blochai('/status')).status,200);assert.equal((await s.blochai('/tasks','POST',{prompt:'test'})).status,403);
    const before=s.requests.length,response=await handleBlochAI({env:s.env,fetcher:s.fetcher,request:new Request('https://rednblue.space/api/porb/v1/blochai/tasks',{method:'POST',headers:{cookie:s.cookie,'content-type':'application/json',origin:'https://attacker.example'},body:JSON.stringify({prompt:'test'})})});assert.equal(response.status,403);assert.equal(s.requests.length,before);
  }finally{s.sqlite.close();}
});
test('input and daily/minute budgets bound model execution',async()=>{
  const s=await fixture();try{
    for(const body of [{prompt:''},{prompt:'x'.repeat(4001)},{prompt:'test',max_new_tokens:257},{prompt:'test',max_new_tokens:1},{prompt:'test',max_new_tokens:32.5}])assert.equal((await s.blochai('/tasks','POST',body)).status,400);
    assert.equal(s.requests.length,0);for(let i=0;i<6;i++)assert.equal((await s.blochai('/tasks','POST',{prompt:'test'})).status,202);const limited=await s.blochai('/tasks','POST',{prompt:'test'});assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);assert.equal(s.requests.length,6);
  }finally{s.sqlite.close();}
});
test('malformed tasks, oversized upstream bodies and upstream failures cannot leak details',async()=>{
  const s=await fixture();try{
    for(const source of [async()=>Response.json({...result,task_id:'different-task'}),async()=>Response.json({...result,status:'COMPLETED',output:null}),async()=>Response.json({...result,output:'x'.repeat(70000)}),async()=>new Response('backend-password',{status:500})]){
      const response=await s.blochai('/tasks/test-task-1','GET',undefined,s.cookie,source);assert.equal(response.status,503);assert.ok(!(await response.text()).includes('backend-password'));
    }
    const failed=await(await s.blochai('/tasks/test-task-1','GET',undefined,s.cookie,async()=>Response.json({...result,status:'FAILED',failure_reason:'host=secret'}))).json();assert.ok(!failed.failure_reason.includes('secret'));
    const response=await s.blochai('/tasks/test-task-1','GET',undefined,s.cookie,async()=>Response.json({error:'queue-full'},{status:429}));assert.equal(response.status,429);
  }finally{s.sqlite.close();}
});
test('the isolated worker serves only BlochAI assets and inference routes',async()=>{
  const s=await fixture();try{
    for(const path of ['/api/porb/v1/blochai/agents','/api/porb/v1/blochai/runs','/portal/','/']){
      const response=await handleBlochAI({request:new Request(`https://rednblue.space${path}`),env:s.env,fetcher:s.fetcher});assert.equal(response.status,404);
    }
    const redirect=await handleBlochAI({request:new Request('https://rednblue.space/blochai'),env:s.env});assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),'/blochai/');
    s.env.ASSETS={fetch:async()=>new Response('<html>BlochAI</html>',{headers:{'content-type':'text/html'}})};
    const page=await handleBlochAI({request:new Request('https://rednblue.space/blochai/'),env:s.env});assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/connect-src 'self'/);assert.equal(page.headers.get('cache-control'),'no-store');assert.equal(s.requests.length,0);
  }finally{s.sqlite.close();}
});
test('private inference rejects alternate hosts and cross-origin access before reading sessions',async()=>{
  let reads=0;const env={PORB_DB:{prepare(){reads++;throw new Error('unexpected database access');}},PORB_AUTH_PEPPER:'test-only-private-worker-budget-pepper',ASSETS:{fetch(){reads++;throw new Error('unexpected asset access');}}};
  for(const host of ['blochai.xyz','bloch-graphus.xyz','bloch.space','blochl1.com','rednblue.space.attacker.test']){
    for(const path of ['/blochai/','/api/porb/v1/blochai/status']){
      const response=await handleBlochAI({request:new Request(`https://${host}${path}`),env});assert.equal(response.status,404);assert.equal(response.headers.has('access-control-allow-origin'),false);
    }
  }
  for(const method of ['GET','POST','OPTIONS']){
    const response=await handleBlochAI({request:new Request('https://rednblue.space/api/porb/v1/blochai/status',{method,headers:{origin:'https://blochai.xyz'}}),env});assert.equal(response.status,method==='OPTIONS'?405:403);assert.equal(response.headers.has('access-control-allow-origin'),false);assert.equal(response.headers.has('access-control-allow-credentials'),false);
  }
  const response=await handleBlochAI({request:new Request('http://rednblue.space/blochai/'),env});assert.equal(response.status,404);assert.equal(reads,0);
});
