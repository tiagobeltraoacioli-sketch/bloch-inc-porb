import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {setup} from '../tests/porb_helpers.mjs';
import {pathSource} from '../tests/atlas_paths_fixture.js';
import {handlePortal} from '../portal/router.js';
import {digest} from '../portal/security.js';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||process.argv[2]||'playwright');
const h=await setup(),root=resolve(new URL('../',import.meta.url).pathname),cookie=await h.login(),errors=[];
let readDelay=0,exportFailure=false,lostAttach=false;
const call=(path,method='GET',body)=>h.call(path,method,body,cookie);
const analysis=await(await h.call('/v1/analyses','POST',{asset:'ETH',pages:1},cookie,{fetcher:async()=>Response.json(pathSource())})).json();
const saved=[];
for(const kind of ['paths','comparison']){
  const parameters=kind==='paths'?{analysis:analysis.id,from:analysis.graph.nodes.find(n=>n.address.endsWith('01')).id,to:analysis.graph.nodes.find(n=>n.address.endsWith('04')).id}:{baseline:analysis.id,current:analysis.id};
  const report=await(await call('/v1/atlas/'+(kind==='paths'?'paths':'compare')+'?'+new URLSearchParams(parameters))).json();
  saved.push(await(await call('/v1/atlas/reports','POST',{request_id:crypto.randomUUID(),kind,title:`Browser ${kind} dossier report`,purpose:'Synthetic dossier review',lawful_basis:'Test declaration',source_licence:'Fixture rights',retention_days:30,parameters,expected_report_sha256:report.report_sha256})).json());
}
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path.startsWith('/api/porb/')){
      if(exportFailure&&/^\/api\/porb\/v1\/atlas\/cases\/.+\/export$/.test(path)){res.writeHead(409,{'content-type':'application/json'});res.end('{"error":"report_integrity_failed"}');return;}
      const chunks=[];for await(const part of req)chunks.push(part);const bytes=Buffer.concat(chunks),request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(bytes.length?{body:bytes}:{})});
      const response=await handlePortal({request,env:h.env,fetcher:async()=>Response.json(pathSource())});
      if(lostAttach&&req.method==='POST'&&path.endsWith('/reports')&&response.status===201){lostAttach=false;res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"test_attachment_response_lost"}');return;}
      if(readDelay&&req.method==='GET'&&/^\/api\/porb\/v1\/atlas\/cases\/[0-9a-f-]{36}$/.test(path))await new Promise(resolve=>setTimeout(resolve,readDelay));
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    const file=resolve(root,'site','.'+path+(path.endsWith('/')?'index.html':''));assert.ok(file.startsWith(root+'/site/'));
    res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'text/plain');
    res.setHeader('content-security-policy',"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'");res.end(await readFile(file));
  }catch(error){res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
await mkdir(resolve(root,'.data'),{recursive:true});
const browser=await webkit.launch(),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
const ready=()=>page.waitForFunction(()=>document.querySelector('#report-count').textContent.includes('2 active'));
const download=async()=>{const pending=page.waitForEvent('download');await page.click('#dossier-export');return JSON.parse(await readFile(await(await pending).path(),'utf8'));};
try{
  await context.addCookies([{name:'porb_dev_session',value:cookie.split('=')[1],url:origin,httpOnly:true,sameSite:'Strict'}]);
  await page.goto(origin+'/atlas.html');await ready();await page.fill('#dossier-new-title','Quarterly fixture investigation');await page.locator('#dossier-create button').click();await page.locator('#dossier-detail:visible').waitFor();await page.waitForFunction(()=>!document.querySelector('#dossier-toggle').disabled);
  const caseId=await page.inputValue('#dossier-case');assert.ok(caseId);assert.equal(new URL(page.url()).searchParams.get('case'),caseId);
  await page.selectOption('#dossier-report',saved[0].id);lostAttach=true;await page.click('#dossier-attach');await page.waitForFunction(()=>document.querySelector('#dossier-status').textContent.includes('test attachment response lost'));assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_case_reports').get().n,1);
  await page.click('#dossier-attach');await page.waitForFunction(()=>document.querySelector('#dossier-status').textContent.includes('existing link'));assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_case_reports').get().n,1);
  await page.selectOption('#dossier-report',saved[1].id);await page.click('#dossier-attach');await page.waitForFunction(()=>document.querySelector('#dossier-summary').textContent.includes('2/20 links'));await page.waitForFunction(()=>!document.querySelector('#dossier-export').disabled);
  const bundle=await download(),{bundle_sha256,...content}=bundle;assert.equal(await digest(JSON.stringify(content)),bundle_sha256);assert.equal(bundle.complete,true);assert.equal(bundle.reports_retained,2);assert.equal(bundle.links.find(link=>link.report.kind==='paths').report.report.paths.length,4);
  await page.selectOption('#dossier-kind','paths');assert.equal(await page.locator('#dossier-list > article').count(),1);await page.locator('#dossier-list').getByRole('button',{name:'Review linked report'}).click();assert.equal(await page.inputValue('#private-subject'),saved[0].review_subject);assert.equal(await page.inputValue('#private-state'),'open');await page.fill('#private-body','Dossier review remains open');await page.click('#private-save');await page.waitForFunction(()=>document.querySelector('#dossier-summary').textContent.includes('1 open reviews'));await page.locator('#dossier-list summary').click();assert.match(await page.textContent('#dossier-list'),/Dossier review remains open/);
  await page.locator('#dossier-list').getByRole('button',{name:'Inspect saved report'}).click();await page.locator('#report-detail:visible').waitFor();assert.match(await page.textContent('#report-detail'),/Integrity verified/);
  await page.selectOption('#dossier-kind','all');await page.click('#dossier-toggle');await page.waitForFunction(()=>document.querySelector('#dossier-summary').textContent.startsWith('closed'));await page.waitForFunction(()=>!document.querySelector('#dossier-toggle').disabled);assert.ok(await page.locator('#dossier-attach').isDisabled());assert.ok(await page.locator('#dossier-list').getByRole('button',{name:'Remove link',exact:true}).first().isDisabled());assert.equal((await download()).case.status,'closed');
  await page.click('#dossier-toggle');await page.waitForFunction(()=>document.querySelector('#dossier-summary').textContent.startsWith('open'));await page.waitForFunction(()=>!document.querySelector('#dossier-toggle').disabled);
  await page.locator('#case-workspace').screenshot({path:resolve(root,'.data/atlas-dossier-desktop.png')});await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('#case-workspace').screenshot({path:resolve(root,'.data/atlas-dossier-mobile.png')});await page.setViewportSize({width:1440,height:1000});
  exportFailure=true;await page.click('#dossier-export');await page.waitForFunction(()=>document.querySelector('#dossier-status').textContent.includes('failed verification'));exportFailure=false;
  const reportCard=page.locator(`[data-report-id="${saved[0].id}"]`);await reportCard.getByRole('button',{name:'Delete report',exact:true}).click();await reportCard.getByRole('button',{name:'Confirm deletion',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#dossier-summary').textContent.includes('1 unavailable'));assert.ok(!(await page.textContent('#dossier-list')).includes('Browser paths dossier report'));assert.ok(!(await page.textContent('#dossier-list')).includes('Dossier review remains open'));
  const incomplete=await download();assert.equal(incomplete.complete,false);assert.equal(incomplete.reports_unavailable,1);assert.equal(incomplete.links.find(link=>link.report_id===saved[0].id).report,null);
  await page.selectOption('#dossier-kind','unavailable');const missing=page.locator('#dossier-list > article');await missing.getByRole('button',{name:'Remove link',exact:true}).click();await missing.getByRole('button',{name:'Confirm removal',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#dossier-summary').textContent.includes('1/20 links'));
  assert.equal((await call('/v1/atlas/reports/'+saved[1].id)).status,200);await page.selectOption('#dossier-kind','all');
  readDelay=350;await page.click('#dossier-refresh');await page.selectOption('#dossier-case','');await page.waitForTimeout(500);assert.ok(await page.locator('#dossier-detail').isHidden());readDelay=0;
  await page.goto(origin+'/portal/?view=cases');await page.getByRole('button',{name:'Open',exact:true}).click();assert.ok((await page.getAttribute('#case-atlas','href')).includes('case='+caseId));await page.click('#case-atlas');await page.locator('#dossier-detail:visible').waitFor();assert.equal(await page.inputValue('#dossier-case'),caseId);
  const anonymous=await browser.newContext(),gate=await anonymous.newPage();await gate.goto(origin+'/atlas.html?case='+caseId);await gate.locator('#private-login:visible').waitFor();assert.equal(new URL(await gate.getAttribute('#private-login','href'),origin).searchParams.get('case'),caseId);await anonymous.close();
  h.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=?').run('viewer',h.tenant);await page.reload();await page.locator('#dossier-detail:visible').waitFor();assert.ok(await page.locator('#dossier-toggle').isDisabled());assert.ok(await page.locator('#dossier-create button').isDisabled());assert.equal(await page.locator('#dossier-list').getByRole('button',{name:'Remove link',exact:true}).count(),0);
  readDelay=350;await page.click('#dossier-refresh');await page.waitForTimeout(60);const other=crypto.randomUUID();h.sqlite.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(other,'Other browser organization','research',Date.now());h.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?)').run(other,h.owner,'owner');h.sqlite.prepare('UPDATE sessions SET tenant_id=? WHERE user_id=?').run(other,h.owner);
  await page.click('#private-refresh');await page.locator('#private-workspace[hidden]').waitFor({state:'attached'});await page.waitForTimeout(500);assert.equal(await page.locator('#dossier-list > article').count(),0);assert.equal(await page.textContent('#dossier-title'),'');assert.equal(await page.inputValue('#dossier-new-title'),'');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks:['create investigation','idempotent link recovery','complete hash-verified bundle','current review records','report inspection','close and reopen','filters','desktop and mobile','corrupt export blocked','deleted report becomes unavailable','incomplete bundle','detach without report deletion','late response discarded','portal and login deep links','viewer restrictions','organization clearing']}));
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));h.sqlite.close();}
