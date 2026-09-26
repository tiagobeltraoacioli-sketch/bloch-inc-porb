import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {setup} from '../tests/porb_helpers.mjs';
import {motifSource} from '../tests/atlas_motifs_fixture.js';
import {handlePortal} from '../portal/router.js';
import {digest} from '../portal/security.js';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||process.argv[2]||'playwright');
const h=await setup(),root=resolve(new URL('../',import.meta.url).pathname),cookie=await h.login(),errors=[];
let lostSave=false,reportDelay=0,motifFailure=false,motifCalls=0;
const run=await(await h.call('/v1/analyses','POST',{asset:'ETH',pages:1},cookie,{fetcher:async()=>Response.json(motifSource())})).json();
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path.startsWith('/api/porb/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks),request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(bytes.length?{body:bytes}:{})});
      if(path.endsWith('/atlas/motifs')){motifCalls++;if(motifFailure){res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"fixture_pattern_failure"}');return;}}
      const response=await handlePortal({request,env:h.env});
      if(path.endsWith('/atlas/reports')&&req.method==='POST'&&response.status===201&&lostSave){lostSave=false;res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"fixture_save_response_lost"}');return;}
      if(reportDelay&&req.method==='GET'&&/\/atlas\/reports\/[0-9a-f-]{36}$/.test(path))await new Promise(resolve=>setTimeout(resolve,reportDelay));
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    const file=resolve(root,'site','.'+path+(path.endsWith('/')?'index.html':''));assert.ok(file.startsWith(root+'/site/'));
    res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'text/plain');
    res.setHeader('content-security-policy',"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'");res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
await mkdir(resolve(root,'.data'),{recursive:true});const browser=await webkit.launch(),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
const field=name=>`#atlas-motif-workspace [data-motif="${name}"]`,search=async()=>{await page.click(field('run'));await page.locator(field('result')+':visible').waitFor();};
const download=async selector=>{const pending=page.waitForEvent('download');await page.click(selector);return JSON.parse(await readFile(await(await pending).path(),'utf8'));};
try{
  await context.addCookies([{name:'porb_dev_session',value:cookie.split('=')[1],url:origin,httpOnly:true,sameSite:'Strict'}]);await page.goto(origin+'/atlas.html?analysis='+run.id+'&node='+encodeURIComponent(run.graph.nodes[0].id));
  await page.waitForFunction(()=>!document.querySelector('[data-motif=run]').disabled);await search();const preview=await download(field('export'));
  assert.ok(!(await page.isDisabled('#report-save-motifs')));await page.click('#report-save-motifs');assert.match(await page.inputValue('#report-title'),/Return cycles/);
  await page.fill(field('minimum'),'1');assert.ok(await page.isHidden('#report-form'));assert.ok(await page.isDisabled('#report-save-motifs'));
  motifFailure=true;await page.click(field('run'));await page.waitForFunction(()=>document.querySelector('[data-motif=status]').textContent.includes('fixture pattern failure'));assert.ok(await page.isDisabled('#report-save-motifs'));motifFailure=false;
  await page.fill(field('minimum'),'0');await search();await page.click('#report-save-motifs');for(const [id,value]of [['report-title','Retained return-cycle evidence'],['report-purpose','Synthetic pattern review'],['report-basis','Test declaration'],['report-licence','Synthetic source fixture']])await page.fill('#'+id,value);
  lostSave=true;await page.click('#report-submit');await page.waitForFunction(()=>document.querySelector('#report-save-status').textContent.includes('Save not confirmed'));assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_reports').get().n,1);
  await page.click('#report-submit');await page.waitForFunction(()=>document.querySelector('#report-save-status').textContent.includes('existing request recovered'));assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM atlas_reports').get().n,1);
  const saved=h.sqlite.prepare('SELECT * FROM atlas_reports').get(),card=page.locator(`[data-report-id="${saved.id}"]`);await page.selectOption('#report-kind','motifs');assert.equal(await page.locator('#report-list > article').count(),1);assert.match(await card.textContent(),/2 observed patterns/);
  await page.fill('#report-search',run.graph.nodes[0].id);assert.equal(await page.locator('#report-list > article').count(),1);await page.fill('#report-search','');
  const exported=await download(`[data-report-id="${saved.id}"] button:has-text("Export JSON")`);assert.deepEqual(exported.report,preview);assert.equal(exported.payload_sha256,await digest(JSON.stringify(preview)));
  await card.getByRole('button',{name:'Inspect report',exact:true}).click();await page.locator('[data-saved-motifs] [data-motif=result]:visible').waitFor();const viewer=page.locator('[data-saved-motifs]');assert.ok(await viewer.locator('[data-motif=form]').isHidden());assert.equal(await viewer.locator('[data-motif=diagram] svg').count(),1);
  await viewer.locator('[data-motif=choices] button').last().click();assert.equal(await viewer.locator('tbody tr').count(),3);await viewer.locator('tbody summary').first().click();assert.match(await viewer.textContent(),/900719925474099312345/);assert.deepEqual(await download('[data-saved-motifs] [data-motif=export]'),preview);
  assert.equal(await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(node=>node.id);return new Set(ids).size===ids.length;}),true);
  await page.locator('#report-detail').screenshot({path:resolve(root,'.data/atlas-retained-motifs-desktop.png')});await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('#report-detail').screenshot({path:resolve(root,'.data/atlas-retained-motifs-mobile.png')});await page.setViewportSize({width:1440,height:1000});
  await card.getByRole('button',{name:'Review report',exact:true}).click();assert.equal(await page.inputValue('#private-subject'),'atlas-report:'+saved.id);assert.equal(await page.inputValue('#private-state'),'open');await page.fill('#private-body','Retained pattern awaits a human decision');await page.click('#private-save');await page.waitForFunction(()=>document.querySelector('#report-list').textContent.includes('1 active review(s)'));
  await page.fill('#dossier-new-title','Retained motif dossier');await page.locator('#dossier-create button').click();await page.locator('#dossier-detail:visible').waitFor();await page.selectOption('#dossier-report',saved.id);await page.click('#dossier-attach');await page.waitForFunction(()=>document.querySelector('#dossier-summary').textContent.includes('1/20 links'));await page.waitForFunction(()=>!document.querySelector('#dossier-export').disabled);await page.selectOption('#dossier-kind','motifs');assert.equal(await page.locator('#dossier-list > article').count(),1);
  const calls=motifCalls;h.sqlite.prepare('DELETE FROM analyses WHERE id=?').run(run.id);await page.click('#private-refresh');await page.waitForFunction(()=>document.querySelector('#atlas-saved-analysis').options.length===1);assert.ok(await page.isDisabled('#report-save-motifs'));
  await card.getByRole('button',{name:'Inspect report',exact:true}).click();await viewer.locator('[data-motif=result]:visible').waitFor();assert.equal(motifCalls,calls);assert.deepEqual(await download('[data-saved-motifs] [data-motif=export]'),preview);
  const bundle=await download('#dossier-export'),{bundle_sha256,...body}=bundle;assert.equal(bundle.complete,true);assert.equal(await digest(JSON.stringify(body)),bundle_sha256);assert.deepEqual(bundle.links[0].report.report,preview);assert.equal(bundle.links[0].records[0].status,'open');
  await page.evaluate(()=>{const original=Date.now;Date.now=()=>original()+366*86400000;document.dispatchEvent(new Event('visibilitychange'));Date.now=original;});assert.ok(await page.isHidden('#report-detail'));assert.equal(await page.locator('[data-saved-motifs]').count(),0);await page.click('#report-refresh');await card.waitFor();
  h.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=?').run('viewer',h.tenant);await page.reload();await card.waitFor();assert.ok(await page.isDisabled('#report-save-motifs'));assert.equal(await card.getByRole('button',{name:'Delete report',exact:true}).count(),0);await card.getByRole('button',{name:'Inspect report',exact:true}).click();await viewer.locator('[data-motif=result]:visible').waitFor();assert.deepEqual(await download('[data-saved-motifs] [data-motif=export]'),preview);
  reportDelay=350;await card.getByRole('button',{name:'Inspect report',exact:true}).click();await page.waitForTimeout(60);const other=crypto.randomUUID();h.sqlite.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(other,'Other retained motif organization','research',Date.now());h.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?)').run(other,h.owner,'owner');h.sqlite.prepare('UPDATE sessions SET tenant_id=? WHERE user_id=?').run(other,h.owner);
  await page.click('#private-refresh');await page.locator('#private-workspace[hidden]').waitFor({state:'attached'});await page.waitForTimeout(450);assert.equal(await page.textContent('#report-detail'),'');assert.equal(await page.locator('#report-list > article').count(),0);assert.ok(await page.isDisabled('#report-save-motifs'));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks:['candidate and failed-query invalidation','save retry after committed response loss','pattern kind/reference filtering','verified envelope and raw export','retained interactive inspection','unique input identities','mobile evidence cards','report review scope','dossier attachment and export digest','source-analysis deletion','retention clears the viewer','viewer restrictions','late organization response discarded']}));
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));h.sqlite.close();}
