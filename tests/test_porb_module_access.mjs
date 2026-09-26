import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {setup,credentials} from './porb_helpers.mjs';
import {SPACE_ROUTES} from '../portal/modules.js';
import {modulePage} from '../portal/module-page.js';
import {MODULES,moduleUrl} from '../site/portal/module-catalog.js';
test('every Space adapter is fixed-origin read-only, scoped, bounded and credential-free upstream',async()=>{
  const h=await setup();try{
    const cookie=await h.login(),key=async scopes=>(await(await h.call('/keys','POST',{label:'Module access fixture',days:1,password:credentials.password,scopes},cookie)).json()).key,dataKey=await key(['data:read']),scoreKey=await key(['scores:read']);let calls=0;
    const fetcher=async(url,options)=>{calls++;const u=new URL(url);assert.equal(u.origin,'https://bloch.space');assert.equal(options.redirect,'manual');assert.deepEqual(Object.keys(options.headers).sort(),['accept','user-agent']);assert.equal(options.headers.cookie,undefined);assert.equal(options.headers.authorization,undefined);return Response.json({source:'Synthetic gateway fixture',route:u.pathname});};
    const path='/v1/space/overview?network=bitcoin';assert.equal((await h.call(path,'GET',undefined,'',{fetcher})).status,401);assert.equal((await h.call(path,'GET',undefined,scoreKey,{fetcher})).status,403);assert.equal(calls,0);
    for(const route of Object.keys(SPACE_ROUTES)){const response=await h.call('/v1/space/'+route+'?network=bitcoin','GET',undefined,dataKey,{fetcher,headers:{'x-porb-tenant':h.tenant,'x-private-label':'must-not-travel'}});assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal((await response.json()).route,'/api/'+route);}
    const count=calls;for(const route of ['account/session','account/workspace','porb/preview','porb/score','constructor','https://attacker.test'])assert.equal((await h.call('/v1/space/'+route,'GET',undefined,dataKey,{fetcher})).status,404);assert.equal(calls,count);
    for(const suffix of ['&network=bloch','&url=https://attacker.test','&purpose=private','&query=x','&cookie=secret'])assert.equal((await h.call(path+suffix,'GET',undefined,dataKey,{fetcher})).status,400);assert.equal((await h.call(path,'POST',{},dataKey,{fetcher})).status,405);assert.equal(calls,count);
    for(const status of [400,404,422,429,502,503,504]){const response=await h.call(path,'GET',undefined,dataKey,{fetcher:async()=>Response.json({error:'source_fixture'}, {status,headers:{'retry-after':'12'}})});assert.equal(response.status,status);if(status===429)assert.equal(response.headers.get('retry-after'),'12');}
    for(const status of [301,302,307,308,401,403])assert.equal((await h.call(path,'GET',undefined,dataKey,{fetcher:async()=>new Response(null,{status,headers:{location:'https://attacker.test'}})})).status,502);
    assert.equal((await h.call('/v1/space/graph?query='+'x'.repeat(1701),'GET',undefined,dataKey,{fetcher})).status,400);
    const doc=JSON.parse(readFileSync(new URL('../site/developers/openapi.json',import.meta.url)));for(const [route,names] of Object.entries(SPACE_ROUTES)){const op=doc.paths['/v1/space/'+route].get;assert.deepEqual(op['x-required-scopes'],['data:read']);assert.deepEqual(op.parameters.map(p=>p.name),names);}
  }finally{h.sqlite.close();}
});
test('private module pages and every score fixture require a current portal browser session',async()=>{
  const h=await setup();try{
    const cookie=await h.login(),key=(await(await h.call('/keys','POST',{label:'API not browser',days:1,password:credentials.password,scopes:['data:read','scores:read']},cookie)).json()).key;let reads=0;
    const call=(path,headers={},env=h.env)=>modulePage({request:new Request('https://rednblue.space'+path,{headers}),env,next:async()=>{reads++;return new Response('Protected fixture',{headers:{'content-type':'application/json'}});}},{scores:path.startsWith('/aml/')});
    for(const path of ['/aml/','/aml/index.html','/aml/assets/demo.json','/aml/assets/site.js','/space/app/','/space/graph/','/graphus/catalog.html']){const before=reads;for(const headers of [{},{authorization:'Bearer '+key},{cookie:'__Host-space_session='+'a'.repeat(64)}]){const response=await call(path,headers);assert.equal(response.status,302);assert.match(response.headers.get('location'),/^https:\/\/rednblue.space\/portal\//);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(await response.text(),'');}assert.equal(reads,before);const allowed=await call(path,{cookie});assert.equal(allowed.status,200);assert.equal(allowed.headers.get('x-frame-options'),'SAMEORIGIN');assert.match(allowed.headers.get('content-security-policy'),/worker-src 'self'/);}
    assert.equal((await call('/space/assets/graph-core.js')).status,200);assert.equal((await call('/graphus/assets/atlas_window_record.js')).status,200);assert.equal((await call('/aml/assets/demo.json',{cookie},{})).status,302);
    h.sqlite.exec('UPDATE sessions SET expires_at=0');assert.equal((await call('/aml/assets/demo.json',{cookie})).status,302);
    const routes=JSON.parse(readFileSync(new URL('../site/_routes.json',import.meta.url)));for(const path of ['/aml/*','/space/*','/graphus/*'])assert.ok(routes.include.includes(path));assert.deepEqual(routes.exclude,[]);
  }finally{h.sqlite.close();}
});
test('public directory exposes only open tools; mounted navigation retains typed references without private query data',()=>{
  assert.equal(MODULES.filter(row=>row.public_url).length,10);assert.equal(MODULES.find(row=>row.id==='aml').public_url,null);
  const ref='0x'+'1'.repeat(40),url=moduleUrl('explorer','https://rednblue.space','USDT',ref);assert.equal(url.pathname,'/space/');assert.equal(url.searchParams.get('network'),'ethereum');assert.equal(url.searchParams.get('asset'),'USDT');assert.equal(url.searchParams.get('query'),ref);
  assert.equal(moduleUrl('graph','https://rednblue.space','ETH',ref).searchParams.get('kind'),'address');assert.equal(moduleUrl('constructor','https://rednblue.space'),null);
  const root=new URL('../site/',import.meta.url);assert.ok(!existsSync(new URL('assets/demo.json',root)));assert.ok(!existsSync(new URL('assets/site.js',root)));assert.ok(existsSync(new URL('aml/assets/demo.json',root)));assert.ok(!readFileSync(new URL('index.html',root),'utf8').includes('trend-chart'));
  for(const path of ['space/app/index.html','space/graph/index.html','space/index.html']){const html=readFileSync(new URL(path,root),'utf8');assert.ok(!/pwa.js|manifest.webmanifest|id="install-app"/.test(html));assert.ok(html.includes('/portal/module-shell.js'));}
  const graph=readFileSync(new URL('space/assets/graph-lab.js',root),'utf8');assert.ok(graph.includes("new Worker('/space/assets/graph-worker.js'"));assert.ok(graph.includes('/api/porb/v1/space/graph?'));
  const explorer=readFileSync(new URL('space/assets/app.js',root),'utf8');assert.ok(explorer.includes('location.origin'));assert.ok(!explorer.includes("'https://bloch.space'"));
});
