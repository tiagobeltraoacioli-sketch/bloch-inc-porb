import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,credentials} from './porb_helpers.mjs';
import {handleBlochAI} from '../deploy/blochai/worker.js';
import {readFileSync} from 'node:fs';
import {digest,random} from '../portal/security.js';
import {normalizeResearch,prepareResearch} from '../portal/blochai-research.js';

const fleet={service:'BlochAI',ready:true,model:'test-model',backend:'ollama',nodes:{registered:15,online:2,ready:1,gpu_ready:1},fleet:{target_nodes:15,target_vram_gb:2}};
const result={task_id:'test-task-1',status:'PENDING',model:'test-model',created_at:1750000000,poll_after_ms:1500};
async function fixture(){
  const s=await setup(),cookie=await s.login(),requests=[];
  s.sqlite.exec(readFileSync(new URL('../deploy/blochai/migrations/0901_blochai_research.sql',import.meta.url),'utf8'));
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
    assert.equal(s.requests.length,0);for(let i=0;i<10;i++)assert.equal((await s.blochai('/tasks','POST',{prompt:'test'})).status,202);const limited=await s.blochai('/tasks','POST',{prompt:'test'});assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);assert.equal(s.requests.length,10);
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

test('research presets belong to the current user and organization and are never audited verbatim',async()=>{
  const s=await fixture();try{
    const research={network:'ethereum',mode:'summary',instructions:'Synthetic confidential instructions',from:'2026-09-01',to:'2026-09-28'};
    const created=await s.blochai('/research','POST',{label:'Synthetic private label',research});assert.equal(created.status,201);const {preset}=await created.json();
    let listed=await(await s.blochai('/research')).json();assert.equal(listed.organization_id,s.tenant);assert.deepEqual(listed.presets[0].research,research);
    const token=random(),other=crypto.randomUUID();
    s.sqlite.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(other,'other@example.test','hash','salt','recovery',Date.now());
    s.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?)').run(s.tenant,other,'admin');
    s.sqlite.prepare('INSERT INTO sessions(token_hash,user_id,tenant_id,expires_at,created_at) VALUES(?,?,?,?,?)').run(await digest(token),other,s.tenant,Date.now()+60000,Date.now());
    const otherCookie=`__Host-porb_session=${token}`;
    assert.deepEqual((await(await s.blochai('/research','GET',undefined,otherCookie)).json()).presets,[]);
    for(const method of ['POST','DELETE'])assert.equal((await s.blochai('/research/'+preset.id,method,{label:'override',research},otherCookie)).status,404);
    const org=await(await s.call('/organizations','POST',{name:'Research isolation',sector:'research',password:credentials.password},s.cookie)).json();
    const switched=await s.call('/auth/organization','POST',{id:org.id},s.cookie),orgCookie=switched.headers.get('set-cookie').split(';')[0];
    assert.deepEqual((await(await s.blochai('/research','GET',undefined,orgCookie)).json()).presets,[]);
    assert.equal((await s.blochai('/research/'+preset.id,'DELETE',undefined,orgCookie)).status,404);
    const restored=await s.call('/auth/organization','POST',{id:s.tenant},orgCookie),restoredCookie=restored.headers.get('set-cookie').split(';')[0];
    assert.equal((await s.blochai('/research/'+preset.id,'POST',{label:'Updated',research:{...research,mode:'checklist'}},restoredCookie)).status,200);
    const audits=JSON.stringify(s.sqlite.prepare("SELECT * FROM audit WHERE action LIKE 'blochai.research.%'").all());assert.ok(!audits.includes('Synthetic'));assert.ok(!audits.includes('instructions'));
    assert.equal((await s.blochai('/research/'+preset.id,'DELETE',undefined,restoredCookie)).status,200);assert.deepEqual((await(await s.blochai('/research','GET',undefined,restoredCookie)).json()).presets,[]);assert.equal(s.requests.length,0);
  }finally{s.sqlite.close();}
});
test('presets enforce authentication, write permissions, CSRF, strict settings and capacity',async()=>{
  const s=await fixture();try{
    const valid={label:'Research',research:{network:'bloch'}};
    assert.equal((await s.blochai('/research','GET',undefined,'')).status,401);
    for(const body of [{...valid,tenant_id:'override'},{...valid,research:{network:'bloch',url:'https://attacker.test'}},{...valid,research:{network:'bitcoin',from:'2026-02-30'}},{...valid,research:{network:'bitcoin',from:'2026-09-28',to:'2026-09-01'}},{...valid,research:{network:'ethereum',subject:{kind:'address',value:'https://rednblue.space/api/porb'}}}])assert.equal((await s.blochai('/research','POST',body)).status,400);
    const response=await handleBlochAI({env:s.env,request:new Request('https://rednblue.space/api/porb/v1/blochai/research/test',{method:'DELETE',headers:{cookie:s.cookie,origin:'https://attacker.test'}})});assert.equal(response.status,403);
    s.sqlite.prepare("UPDATE memberships SET role='viewer' WHERE user_id=?").run(s.owner);
    assert.equal((await s.blochai('/research')).status,200);assert.equal((await s.blochai('/research','POST',valid)).status,403);assert.equal((await s.blochai('/research/absent','DELETE')).status,403);
    s.sqlite.prepare("UPDATE memberships SET role='owner' WHERE user_id=?").run(s.owner);
    for(let i=0;i<25;i++)s.sqlite.prepare('INSERT INTO blochai_research_presets VALUES(?,?,?,?,?,?,?)').run(`test-${i}`,s.tenant,s.owner,'Test','{}',1,1);
    assert.equal((await s.blochai('/research','POST',valid)).status,409);assert.equal(s.requests.length,0);
  }finally{s.sqlite.close();}
});
test('custom research sends only public identifiers to public sources and persists a private snapshot',async()=>{
  const s=await fixture();try{
    const address='0x'+'1'.repeat(40),requests=[];
    const fetcher=async(url,init)=>{
      const u=new URL(url);requests.push({url:u,init});
      if(u.hostname==='bloch-graphus.xyz')return Response.json({network:'ethereum-mainnet',asset:'ETH',address,balance:{base_units:'1234'},nodes:[],edges:[]});
      return Response.json({...result,status:'COMPLETED',output:'Synthetic answer'});
    };
    const research={network:'ethereum',subject:{kind:'address',value:address},instructions:'Synthetic private case notes',mode:'summary',from:'2026-09-01'};
    const submitted=await s.blochai('/tasks','POST',{prompt:'Synthetic private question',research},s.cookie,fetcher);assert.equal(submitted.status,202);const body=await submitted.json();
    assert.equal(requests.length,2);const publicCall=requests[0];assert.equal(publicCall.url.searchParams.get('address'),address);assert.equal(publicCall.init.credentials,'omit');assert.equal(publicCall.init.headers.authorization,undefined);assert.ok(!JSON.stringify(publicCall).includes('private'));assert.ok(!JSON.stringify(publicCall).includes(s.tenant));
    const upstream=JSON.parse(requests[1].init.body);assert.equal(upstream.tenant_id,s.tenant);assert.match(upstream.prompt,/Synthetic private case notes/);assert.match(upstream.prompt,/1234/);assert.deepEqual(upstream.observations.transactions,[]);assert.deepEqual(upstream.observations.graph,{nodes:[],edges:[]});
    assert.match(upstream.prompt,/Native Ethereum transaction history is unavailable/);assert.match(upstream.prompt,/retrieved/);assert.match(upstream.prompt,/Status: available/);
    assert.match(body.guide.coverage,/not a historical scan/);assert.deepEqual(body.guide.graph,{nodes:[],edges:[]});assert.equal(body.guide.research.instructions,research.instructions);
    const polled=await(await s.blochai('/tasks/test-task-1','GET',undefined,s.cookie,fetcher)).json();assert.deepEqual(polled.guide,body.guide);
    const stored=s.sqlite.prepare('SELECT * FROM blochai_research_snapshots').get();assert.equal(stored.tenant_id,s.tenant);assert.equal(stored.user_id,s.owner);assert.ok(stored.expires_at>Date.now());
    s.sqlite.prepare('UPDATE blochai_research_snapshots SET expires_at=0').run();assert.equal((await(await s.blochai('/tasks/test-task-1','GET',undefined,s.cookie,fetcher)).json()).guide,undefined);
    const before=requests.length;assert.equal((await s.blochai('/tasks','POST',{prompt:'x'.repeat(1501),research},s.cookie,fetcher)).status,400);assert.equal(requests.length,before);
  }finally{s.sqlite.close();}
});
test('accepted inference retains its task identifier if snapshot storage fails',async()=>{
  const s=await fixture();try{
    const prepare=s.env.PORB_DB.prepare;
    s.env.PORB_DB.prepare=sql=>{if(sql.startsWith('INSERT INTO blochai_research_snapshots'))throw new Error('Synthetic storage outage');return prepare(sql);};
    const fetcher=async(url,init)=>new URL(url).hostname==='private-inference.example.test'?Response.json(result):new Response('Unavailable',{status:503});
    const response=await s.blochai('/tasks','POST',{prompt:'Synthetic research',research:{network:'bloch'}},s.cookie,fetcher),body=await response.json();
    assert.equal(response.status,202);assert.equal(body.task_id,result.task_id);assert.deepEqual(body.warnings,['research_snapshot_not_saved']);assert.equal(body.guide.status,'unavailable');
  }finally{s.sqlite.close();}
});
test('date filters preserve undated evidence and never claim a full historical graph',async()=>{
  const research=normalizeResearch({network:'bitcoin',from:'2026-09-28',to:'2026-09-28',subject:{kind:'transaction',value:'a'.repeat(64)}});
  const prepared=await prepareResearch('Describe this transaction',research,async()=>Response.json({network:'bitcoin',transaction:{txid:'a'.repeat(64),vin:[],vout:[],status:{confirmed:true,block_time:1750000000}}}));
  assert.equal(prepared.guide.transactions.length,0);assert.match(prepared.guide.coverage,/undated records remain/);assert.deepEqual(prepared.guide.graph,{nodes:[],edges:[]});
  const max=await prepareResearch('q'.repeat(1500),normalizeResearch({network:'bloch',instructions:'i'.repeat(1000)}),async()=>new Response('Unavailable',{status:503}));assert.ok(max.prompt.length<=4000);assert.ok(max.observations.coverage.length<=1600);
});
