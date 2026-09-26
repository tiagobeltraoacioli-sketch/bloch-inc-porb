import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {setup} from '../tests/porb_helpers.mjs';
import {handlePortal} from '../portal/router.js';
import {digest} from '../portal/security.js';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||process.argv[2]||'playwright');
const h=await setup(),root=resolve(new URL('../',import.meta.url).pathname),cookie=await h.login(),errors=[],time=Date.now()-60000,otherActor=crypto.randomUUID();
const insert=(i,{actor=h.owner,action='atlas.fixture.read',resource='fixture-'+i,created=time-i}={})=>{const id=crypto.randomUUID();h.sqlite.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(id,h.tenant,actor,action,resource,created);return id;};
const literal='<img src=x onerror="globalThis.auditInjected=true">',ids=Array.from({length:55},(_,i)=>insert(i,{resource:i===0?literal:i===1?'=SUM(1,2)':'fixture-'+i}));
for(let i=0;i<5;i++)insert(i,{actor:otherActor,action:'atlas.fixture.change'});
insert(0,{action:'atlas.fixture.old',created:time-60*86400000});
let failure=false,corrupt=false,holdSuffix=null,releaseRead=null,started=null,heldResponseUrl=null,reads=0;
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path.startsWith('/api/porb/')){
      const isAudit=path==='/api/porb/v1/atlas/audit'||path==='/api/porb/v1/atlas/audit/export';if(isAudit)reads++;
      if(failure&&isAudit){res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"fixture_audit_unavailable"}');return;}
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks),request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(bytes.length?{body:bytes}:{})});
      let response=await handlePortal({request,env:h.env});
      if(corrupt&&path.endsWith('/audit/export')&&response.ok){const value=await response.json();value.audit_sha256='0'.repeat(64);response=Response.json(value);}
      if(holdSuffix!==null&&path==='/api/porb/v1/atlas/audit'+holdSuffix){holdSuffix=null;heldResponseUrl=origin+req.url;await new Promise(resolve=>{releaseRead=resolve;started();});}
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    const file=resolve(root,'site','.'+path+(path.endsWith('/')?'index.html':''));assert.ok(file.startsWith(root+'/site/'));
    res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'text/plain');
    res.setHeader('content-security-policy',"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'");res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
await mkdir(resolve(root,'.data'),{recursive:true});const browser=await webkit.launch(),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));let downloads=0;page.on('download',()=>downloads++);
const rows=()=>page.locator('#audit-list > article'),load=async()=>{await page.click('#audit-load');await page.locator('#audit-results:visible').waitFor();};
const download=async id=>{const next=page.waitForEvent('download');await page.click('#audit-'+id);return readFile(await(await next).path(),'utf8');};
const hold=suffix=>{holdSuffix=suffix;return new Promise(resolve=>{started=resolve;});};
const release=async()=>{const done=page.waitForResponse(response=>response.url()===heldResponseUrl);releaseRead();await(await done).finished();releaseRead=null;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
try{
  await page.goto(origin+'/atlas.html');await page.locator('#private-login:visible').waitFor();assert.ok(await page.isHidden('#audit-workspace'));
  await context.addCookies([{name:'porb_dev_session',value:cookie.split('=')[1],url:origin,httpOnly:true,sameSite:'Strict'}]);await page.reload();await page.locator('#audit-link:visible').waitFor();assert.equal(reads,0);assert.ok(await page.isDisabled('#audit-json'));
  await page.fill('#audit-action','atlas.fixture.read');await load();assert.equal(await rows().count(),25);assert.equal(await rows().first().getAttribute('data-audit-id'),ids[0]);assert.match(await rows().first().textContent(),/img src=x/);assert.equal(await page.locator('#audit-list img').count(),0);assert.equal(await page.evaluate(()=>Boolean(globalThis.auditInjected)),false);
  insert(100,{created:time-5});await page.click('#audit-next');await page.waitForFunction(()=>document.querySelector('#audit-page').textContent.startsWith('Page 2'));assert.equal(await rows().first().getAttribute('data-audit-id'),ids[25]);
  const report=JSON.parse(await download('json')),{audit_sha256,...body}=report;assert.equal(await digest(JSON.stringify(body)),audit_sha256);assert.equal(report.event_count,55);assert.deepEqual(report.events.map(row=>row.id),ids);assert.equal(report.query.action,'atlas.fixture.read');
  const csvResponse=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/audit/export'));const csv=await download('csv'),csvReport=await(await csvResponse).json();assert.equal(csv.split('\r\n').length,56);assert.ok(csv.includes('"\'=SUM(1,2)"'));assert.ok(csv.includes(csvReport.audit_sha256));assert.match(csv,/"json_export_sha256"/);
  await page.click('#audit-next');await page.waitForFunction(()=>document.querySelector('#audit-page').textContent.startsWith('Page 3'));assert.equal(await rows().count(),5);assert.ok(await page.isDisabled('#audit-next'));await page.click('#audit-previous');await page.waitForFunction(()=>document.querySelector('#audit-page').textContent.startsWith('Page 2'));assert.equal(await rows().first().getAttribute('data-audit-id'),ids[25]);
  await page.fill('#audit-resource',literal);assert.ok(await page.isHidden('#audit-results'));assert.ok(await page.isDisabled('#audit-json'));await load();assert.equal(await rows().count(),1);await rows().locator('summary').click();assert.match(await rows().textContent(),/"resource_id"/);
  await page.locator('#audit-workspace').screenshot({path:resolve(root,'.data/atlas-audit-desktop.png')});await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('#audit-workspace').screenshot({path:resolve(root,'.data/atlas-audit-mobile.png')});await page.setViewportSize({width:1440,height:1000});
  await page.click('#audit-clear');await page.fill('#audit-action','atlas.fixture.change');await page.fill('#audit-actor',h.owner);await load();assert.equal(await rows().count(),0);assert.match(await page.textContent('#audit-list'),/No retained Atlas audit events/);await page.fill('#audit-actor',otherActor);await load();assert.equal(await rows().count(),5);
  await page.click('#audit-clear');await page.fill('#audit-action','atlas.fixture.old');await load();assert.equal(await rows().count(),0);await page.fill('#audit-start',new Date(time-90*86400000).toISOString().slice(0,19));await load();assert.equal(await rows().count(),1);
  await page.click('#audit-clear');await page.fill('#audit-action','atlas.fixture.read');const held=hold('');await page.click('#audit-load');await held;await page.fill('#audit-action','atlas.fixture.change');await load();await release();assert.equal(await rows().count(),5);assert.ok((await rows().allTextContents()).every(text=>text.includes('atlas.fixture.change')));
  failure=true;await page.click('#audit-load');await page.waitForFunction(()=>document.querySelector('#audit-status').textContent.includes('fixture audit unavailable'));assert.equal(await rows().count(),0);assert.ok(await page.isDisabled('#audit-json'));failure=false;
  await load();const beforeInvalid=downloads;corrupt=true;await page.click('#audit-json');await page.waitForFunction(()=>document.querySelector('#audit-status').textContent.includes('integrity check'));assert.equal(downloads,beforeInvalid);assert.equal(await rows().count(),0);corrupt=false;
  await load();await page.evaluate(()=>{const original=Date.now;Date.now=()=>original()+16*60000;document.dispatchEvent(new Event('visibilitychange'));Date.now=original;});assert.equal(await rows().count(),0);assert.match(await page.textContent('#audit-status'),/expired/);assert.ok(await page.isDisabled('#audit-json'));
  for(let i=0;i<1001;i++)insert(i,{action:'atlas.fixture.large'});await page.fill('#audit-action','atlas.fixture.large');await load();await page.click('#audit-json');await page.waitForFunction(()=>document.querySelector('#audit-status').textContent.includes('1,000 events'));assert.ok(await page.isDisabled('#audit-json'));assert.equal(downloads,beforeInvalid);
  await page.fill('#audit-action','atlas.fixture.change');await load();const delayedExport=hold('/export');await page.click('#audit-json');await delayedExport;await page.fill('#audit-resource','changed while exporting');await release();assert.equal(downloads,beforeInvalid);assert.equal(await rows().count(),0);
  await page.fill('#audit-resource','');await load();const roleRead=hold('');await page.click('#audit-load');await roleRead;h.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=?').run('viewer',h.tenant);await page.click('#private-refresh');await page.locator('#audit-link[hidden]').waitFor({state:'attached'});await release();assert.ok(await page.isHidden('#audit-workspace'));assert.equal(await rows().count(),0);assert.equal(await page.inputValue('#audit-action'),'');
  h.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=?').run('admin',h.tenant);await page.click('#private-refresh');await page.locator('#audit-link:visible').waitFor();await page.fill('#audit-action','atlas.fixture.change');await load();
  const late=hold('/export');await page.click('#audit-json');await late;const other=crypto.randomUUID();h.sqlite.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(other,'Other audit organization','research',Date.now());h.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?)').run(other,h.owner,'owner');h.sqlite.prepare('UPDATE sessions SET tenant_id=? WHERE user_id=?').run(other,h.owner);await page.click('#private-refresh');await page.locator('#private-workspace[hidden]').waitFor({state:'attached'});await release();assert.equal(downloads,beforeInvalid);assert.equal(await rows().count(),0);assert.equal(await page.textContent('#audit-summary'),'');assert.equal(await page.inputValue('#audit-action'),'');assert.ok(await page.isDisabled('#audit-json'));
  assert.equal(h.calls(),0);assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks:['administrator-only lazy workspace','stable snapshot pages despite new writes','complete JSON and verified checksum','all-page formula-safe CSV','literal recorded resource text','exact credential/action/resource and UTC filters','empty states','desktop/mobile audit cards','superseded query suppression','failed reads clear old events','corrupt exports blocked','snapshot expiry clearing','oversized export refuses truncation','stale export cancellation','role downgrade clears late data','organization change blocks late download','no source collection']}));
}finally{if(releaseRead)releaseRead();await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));h.sqlite.close();}
