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
let historyDelay=0,queueDelay=0,assignmentFailure=false,queueFailure=false;
const call=(path,method='GET',body)=>h.call(path,method,body,cookie);
const recordBody=(change={})=>({kind:'review',subject:'Browser review scope',body:'Initial fixture <img src=x onerror=alert(1)>',purpose:'Fixture review',lawful_basis:'Test declaration',source_licence:'Synthetic fixture',retention_days:30,status:'open',...change});
const analysis=await(await h.call('/v1/analyses','POST',{asset:'ETH',pages:1},cookie,{fetcher:async()=>Response.json(pathSource())})).json();
const parameters={baseline:analysis.id,current:analysis.id},preview=await(await call('/v1/atlas/compare?'+new URLSearchParams(parameters))).json();
const report=await(await call('/v1/atlas/reports','POST',{request_id:crypto.randomUUID(),kind:'comparison',title:'Review-linked comparison',purpose:'Fixture review',lawful_basis:'Test declaration',source_licence:'Synthetic fixture',retention_days:30,parameters,expected_report_sha256:preview.report_sha256})).json();
const investigation=await(await call('/v1/cases','POST',{title:'Review queue investigation'})).json();
await call('/v1/atlas/cases/'+investigation.id+'/reports','POST',{report_id:report.id,payload_sha256:report.payload_sha256});
const review=await(await call('/v1/atlas/records','POST',recordBody({subject:report.review_subject}))).json();
for(let i=0;i<5;i++){
  const row=await(await call('/v1/atlas/records','POST',recordBody({subject:`Other queue fixture ${i}`,kind:'correction'}))).json();
  if(i===0)await call('/v1/atlas/records/'+row.id+'/assignment','POST',{revision:1,assignee_id:null,priority:'low',due_at:row.created_at});
}
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path.startsWith('/api/porb/')){
      if(assignmentFailure&&path.endsWith('/assignment')||queueFailure&&path.endsWith('/atlas/reviews')){res.writeHead(409,{'content-type':'application/json'});res.end(JSON.stringify({error:assignmentFailure?'review_assignment_conflict':'fixture_queue_failure'}));return;}
      const chunks=[];for await(const part of req)chunks.push(part);const bytes=Buffer.concat(chunks),request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(bytes.length?{body:bytes}:{})});
      const response=await handlePortal({request,env:h.env,fetcher:async()=>Response.json(pathSource())});
      const delay=path.endsWith('/history')?historyDelay:path.endsWith('/atlas/reviews')?queueDelay:0;if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
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
const ready=()=>page.waitForFunction(()=>document.querySelector('#queue-status').textContent.includes('Queue refreshed'));
const card=()=>page.locator(`[data-review-id="${review.id}"]`);
try{
  await context.addCookies([{name:'porb_dev_session',value:cookie.split('=')[1],url:origin,httpOnly:true,sameSite:'Strict'}]);
  await page.goto(origin+'/atlas.html');await ready();assert.match(await page.textContent('#queue-summary'),/6 pending/);assert.equal(await page.locator('#queue-list > article').count(),5);
  assert.ok(await page.locator('#queue-assignment').isHidden());await page.check('#queue-overdue');assert.equal(await page.locator('#queue-list > article').count(),1);assert.match(await page.textContent('#queue-list'),/Overdue/);await page.uncheck('#queue-overdue');
  await page.click('#queue-next');assert.equal(await page.locator('#queue-list > article').count(),1);await page.click('#queue-previous');
  await page.fill('#queue-search','Review-linked comparison');assert.equal(await page.locator('#queue-list > article').count(),1);assert.equal(await card().locator('img').count(),0);assert.match(await card().textContent(),/<img src=x/);
  assert.equal(await card().getByRole('link').getAttribute('href'),'/atlas.html?case='+investigation.id+'#case-workspace');
  await card().getByRole('button',{name:'Assign review',exact:true}).click();await page.selectOption('#queue-assignee',h.owner);await page.selectOption('#queue-priority','high');
  const tomorrow=new Date(Date.now()+86400000),local=new Date(tomorrow.getTime()-tomorrow.getTimezoneOffset()*60000).toISOString().slice(0,16);await page.fill('#queue-due',local);
  assignmentFailure=true;await page.click('#queue-save');await page.waitForFunction(()=>document.querySelector('#queue-status').textContent.includes('not saved'));assert.equal(await page.inputValue('#queue-priority'),'high');assignmentFailure=false;
  await page.click('#queue-save');await page.waitForFunction(()=>document.querySelector('#queue-status').textContent.includes('Assignment saved'));assert.match(await card().textContent(),/owner@example.test/);assert.match(await card().textContent(),/high priority/);
  assert.ok(await page.locator('#queue-assignment').isHidden());await page.selectOption('#queue-filter-priority','low');assert.equal(await page.locator('#queue-list > article').count(),0);await page.selectOption('#queue-filter-priority','high');assert.equal(await page.locator('#queue-list > article').count(),1);await page.selectOption('#queue-filter-priority','all');
  const assigned=h.sqlite.prepare('SELECT revision,expires_at FROM atlas_records WHERE id=?').get(review.id);assert.equal(assigned.revision,2);assert.equal(assigned.expires_at,review.expires_at);
  await page.selectOption('#queue-owner','mine');assert.equal(await page.locator('#queue-list > article').count(),1);await page.selectOption('#queue-owner','unassigned');assert.equal(await page.locator('#queue-list > article').count(),0);await page.selectOption('#queue-owner','all');
  await card().getByRole('button',{name:'Revision history',exact:true}).click();await page.locator('#record-history:visible').waitFor();assert.match(await page.textContent('#history-summary'),/2 retained revisions.*complete/);assert.match(await page.textContent('#history-list'),/assignee id, priority, due at/);
  const pending=page.waitForEvent('download');await page.click('#history-export');const exported=JSON.parse(await readFile(await(await pending).path(),'utf8')),{history_sha256,...payload}=exported;assert.equal(await digest(JSON.stringify(payload)),history_sha256);assert.equal(exported.versions[0].record.assignee_id,null);assert.equal(exported.versions[1].record.assignee_id,h.owner);
  await card().getByRole('button',{name:'Inspect report',exact:true}).click();await page.locator('#report-detail:visible').waitFor();assert.match(await page.textContent('#report-detail'),/Integrity verified/);
  await card().getByRole('button',{name:'Record decision',exact:true}).click();assert.equal(await page.inputValue('#private-state'),'open');await page.selectOption('#private-state','reviewed');await page.fill('#private-body','Reviewed fixture: source limitations documented.');await page.click('#private-save');await page.waitForFunction(()=>document.querySelector('#private-write-status').textContent.includes('Record saved'));
  assert.equal(await page.locator('#queue-list > article').count(),0);assert.ok(await page.locator('#record-history').isHidden());await page.selectOption('#queue-state','reviewed');assert.equal(await page.locator('#queue-list > article').count(),1);
  await card().getByRole('button',{name:'Revision history',exact:true}).click();await page.locator('#record-history:visible').waitFor();assert.match(await page.textContent('#history-summary'),/3 retained revisions/);assert.match(await page.textContent('#history-list'),/body, status/);
  await page.locator('#review-workspace').screenshot({path:resolve(root,'.data/atlas-reviews-desktop.png')});await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('#review-workspace').screenshot({path:resolve(root,'.data/atlas-reviews-mobile.png')});await page.setViewportSize({width:1440,height:1000});
  await page.click('#history-close');historyDelay=350;await card().getByRole('button',{name:'Revision history',exact:true}).click();await page.click('#queue-refresh');await ready();await page.waitForTimeout(450);assert.ok(await page.locator('#record-history').isHidden());historyDelay=0;
  queueFailure=true;await page.click('#queue-refresh');await page.waitForFunction(()=>document.querySelector('#queue-status').textContent.includes('fixture queue failure'));assert.equal(await page.locator('#queue-list > article').count(),0);queueFailure=false;await page.click('#queue-refresh');await ready();
  h.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=?').run('viewer',h.tenant);await page.reload();await ready();await page.selectOption('#queue-state','reviewed');await page.fill('#queue-search','Review-linked');assert.equal(await card().getByRole('button',{name:'Assign review',exact:true}).count(),0);assert.match(await card().textContent(),/Reviewer no longer available/);await card().getByRole('button',{name:'Revision history',exact:true}).click();await page.locator('#record-history:visible').waitFor();
  h.sqlite.prepare('UPDATE atlas_records SET expires_at=? WHERE id=?').run(Date.now()-1,review.id);await page.click('#queue-refresh');await ready();assert.equal(await page.locator('#queue-list > article').count(),0);assert.ok(await page.locator('#record-history').isHidden());
  await page.fill('#queue-search','');await page.selectOption('#queue-state','open');queueDelay=350;await page.click('#queue-refresh');await page.waitForTimeout(60);
  const other=crypto.randomUUID();h.sqlite.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(other,'Other browser organization','research',Date.now());h.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?)').run(other,h.owner,'owner');h.sqlite.prepare('UPDATE sessions SET tenant_id=? WHERE user_id=?').run(other,h.owner);
  await page.click('#private-refresh');await page.locator('#private-workspace[hidden]').waitFor({state:'attached'});await page.waitForTimeout(450);assert.equal(await page.locator('#queue-list > article').count(),0);assert.equal(await page.textContent('#history-list'),'');assert.equal(await page.textContent('#queue-assignee'),'');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks:['queue pagination and filters','literal private text','report and dossier context','assignment conflict and retry','stable retention','self and unassigned filters','revision diff','current history export checksum','report inspection','recorded decision leaves pending queue','desktop and mobile','late history discarded','failed queue clears prior results','viewer and departed reviewer','expiry','organization switch discards late queue']}));
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));h.sqlite.close();}
