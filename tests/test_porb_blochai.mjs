import test from 'node:test';
import assert from 'node:assert/strict';
import {handleBlochAI} from '../deploy/blochai/worker.js';
import {normalizeResearch,prepareResearch} from '../portal/blochai-research.js';

test('BlochAI is retired from rednblue.space: its page and APIs answer 404 without a backend call',async()=>{
  let called=false;const fetcher=async()=>{called=true;return Response.json({});};
  for(const [path,method] of [['/blochai','GET'],['/blochai/','GET'],['/blochai/blochai.js','GET'],['/api/porb/v1/blochai/status','GET'],
                              ['/api/porb/v1/blochai/tasks','POST'],['/api/porb/v1/blochai/tasks/abc','GET'],['/api/porb/v1/blochai/research','POST']]){
    const response=await handleBlochAI({request:new Request('https://rednblue.space'+path,{method,headers:{origin:'https://rednblue.space','x-porb-action':'1'}}),env:{},fetcher});
    assert.equal(response.status,404,path);assert.equal(response.headers.get('cache-control').startsWith('no-store'),true);
  }
  assert.equal(called,false);
});

test('the rednblue portal is served without the BlochAI agents tab, stylesheet or API key scopes',async()=>{
  const html='<head><link rel="stylesheet" href="/portal/portal.css"><link rel="stylesheet" href="/portal/blochai.css"></head><nav><button data-view="access">08 <span>Access & API</span></button><button data-view="blochai">09 <span>BlochAI agents</span></button></nav>'
    +'<section id="view-blochai" class="view" hidden></section><label class="check"><input type="checkbox" name="scope" value="graph:read">Read graphs</label>'
    +['agents:read','agents:write','reports:read','reports:write'].map(scope=>`<label class="check"><input type="checkbox" name="scope" value="${scope}">BlochAI ${scope}</label>`).join('');
  const seen=[];const fetcher=async request=>{seen.push(request.url);return new Response(html,{headers:{'content-type':'text/html; charset=utf-8',etag:'origin','content-length':String(html.length)}});};
  for(const path of ['/portal/','/portal','/portal/index.html']){
    const response=await handleBlochAI({request:new Request('https://rednblue.space'+path),fetcher});const body=await response.text();
    assert.equal(response.status,200);assert.doesNotMatch(body,/data-view="blochai"|blochai\.css|agents:|reports:|BlochAI agents/);
    assert.match(body,/data-view="access"/);assert.match(body,/value="graph:read"/);assert.match(body,/<section id="view-blochai" class="view" hidden>/);  // the portal script still mounts here
    assert.equal(response.headers.has('etag'),false);assert.equal(response.headers.has('content-length'),false);
  }
  assert.equal(seen.length,3);
  const deepLink=await handleBlochAI({request:new Request('https://rednblue.space/portal/?view=blochai&org=1'),fetcher});
  assert.equal(deepLink.status,302);assert.equal(deepLink.headers.get('location'),'/portal/?org=1');assert.equal(seen.length,3);
  const script=await handleBlochAI({request:new Request('https://rednblue.space/portal/'),fetcher:async()=>new Response('x',{headers:{'content-type':'text/javascript'}})});
  assert.equal(await script.text(),'x');  // only HTML is changed
  for(const path of ['/portal/portal.js','/portal/blochai.js','/portal/modules.css']){
    const asset=await handleBlochAI({request:new Request('https://rednblue.space'+path),fetcher:async request=>new Response('asset '+new URL(request.url).pathname,{headers:{'content-type':'text/javascript'}})});
    assert.equal(asset.status,200);assert.equal(await asset.text(),'asset '+path);  // the /portal/* route passes other files through
  }
});

test('date filters preserve undated evidence and never claim a full historical graph',async()=>{
  const research=normalizeResearch({network:'bitcoin',from:'2026-09-28',to:'2026-09-28',subject:{kind:'transaction',value:'a'.repeat(64)}});
  const prepared=await prepareResearch('Describe this transaction',research,async()=>Response.json({network:'bitcoin',transaction:{txid:'a'.repeat(64),vin:[],vout:[],status:{confirmed:true,block_time:1750000000}}}));
  assert.equal(prepared.guide.transactions.length,0);assert.match(prepared.guide.coverage,/undated records remain/);assert.deepEqual(prepared.guide.graph,{nodes:[],edges:[]});
  assert.deepEqual(prepared.guide.derived_facts,[]);assert.ok(prepared.guide.insights.length);assert.ok(prepared.guide.insights.every(item=>!item.id.startsWith('graph_')&&item.id!=='transaction_sample'));assert.equal(prepared.observations.insights,undefined);
  const max=await prepareResearch('q'.repeat(1500),normalizeResearch({network:'bloch',instructions:'i'.repeat(1000)}),async()=>new Response('Unavailable',{status:503}));assert.ok(max.prompt.length<=4000);assert.ok(max.observations.coverage.length<=1600);
});

test('private prompt budgeting preserves complete numeric facts and source references',async()=>{
  const txid='0x'+'a'.repeat(64),block='0x'+'b'.repeat(64),large='0x'+'f'.repeat(63);
  const prepared=await prepareResearch('Describe the exact supplied quantities.',normalizeResearch({network:'ethereum',subject:{kind:'transaction',value:txid}}),async()=>Response.json({network:'ethereum',transaction:{hash:txid,from:'0x'+'1'.repeat(40),to:'0x'+'2'.repeat(40),value:large,gas:large,nonce:large,blockHash:block,blockNumber:'0x64'},receipt_status:'available',receipt:{transactionHash:txid,blockHash:block,blockNumber:'0x64',status:'0x1',gasUsed:'0x5208',effectiveGasPrice:'0x20000000000001',logs:[]}}));
  const section=prepared.prompt.split('Facts:\n')[1].split('\nSource coverage and times:')[0],lines=section.split('\n');
  assert.ok(lines.length>=2);assert.ok(section.length<=400);assert.ok(prepared.guide.facts.length>lines.length);
  for(const line of lines){assert.ok(prepared.guide.facts.some(fact=>line===`${fact.label}: ${fact.value}${fact.unit?' '+fact.unit:''} [source: ${fact.source_id}]`),'Each included fact must preserve its entire value, unit and source ID.');assert.ok(line.endsWith('[source: transaction_observation]'));}
});
