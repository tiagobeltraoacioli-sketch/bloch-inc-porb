import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {setup,sourceGraph} from '../tests/porb_helpers.mjs';
import {motifSource} from '../tests/atlas_motifs_fixture.js';
import {sample} from '../tests/system_map_fixture.mjs';
import {handlePortal} from '../portal/router.js';
import {digest} from '../portal/security.js';
import {evidencePacket} from '../graphus/assets/system_evidence.js';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||process.argv[2]||'playwright');
const h=await setup(),root=resolve(new URL('../',import.meta.url).pathname),cookie=await h.login(),errors=[];
let publicCalls=0,motifDelay=0,motifFailure=false,sourceFailure=false;
const run=await(await h.call('/v1/analyses','POST',{asset:'ETH',pages:1},cookie,{fetcher:async()=>Response.json(motifSource())})).json();
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost'),path=url.pathname;
    if(path.startsWith('/api/porb/')){
      const chunks=[];for await(const part of req)chunks.push(part);const bytes=Buffer.concat(chunks),request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(bytes.length?{body:bytes}:{})});
      if(path.endsWith('/atlas/motifs')&&motifFailure){res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"fixture_motif_failure"}');return;}
      const response=await handlePortal({request,env:h.env,fetcher:async()=>Response.json(motifSource())});if(path.endsWith('/atlas/motifs')&&motifDelay)await new Promise(resolve=>setTimeout(resolve,motifDelay));
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(path==='/api/chain/network'){
      publicCalls++;res.setHeader('content-type','application/json');if(sourceFailure){res.writeHead(502);res.end('{"error":"fixture_source_failure"}');return;}
      const asset=url.searchParams.get('asset');res.end(JSON.stringify(['BTC','BLCH'].includes(asset)?sample(asset):motifSource(asset)));return;
    }
    const privatePage=path==='/atlas.html'||path.startsWith('/portal/')||path.startsWith('/graphus/'),file=resolve(root,privatePage?'site':'graphus','.'+path+(path.endsWith('/')?'index.html':''));assert.ok(file.startsWith(root+'/'));
    res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'text/plain');
    res.setHeader('content-security-policy',"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'");res.end(await readFile(file));
  }catch(error){res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
await mkdir(resolve(root,'.data'),{recursive:true});const browser=await webkit.launch(),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
const field=name=>`[data-motif="${name}"]`,search=async()=>{await page.click(field('run'));await page.locator(field('result')+':visible').waitFor();};
const download=async()=>{const pending=page.waitForEvent('download');await page.click(field('export'));return JSON.parse(await readFile(await(await pending).path(),'utf8'));};
try{
  await page.goto(origin+'/catalog.html?asset=ETH');await page.waitForFunction(()=>!document.querySelector('#atlas-export').disabled);const before=publicCalls;
  await page.fill(field('reference'),run.graph.nodes[0].address);await search();let report=await download();assert.equal(report.motifs.length,2);assert.equal(publicCalls,before);assert.equal(report.provenance.imported,false);assert.equal(report.provenance.analysis_id,null);
  const {report_sha256,...body}=report;assert.equal(await digest(JSON.stringify(body)),report_sha256);assert.equal(await page.locator(field('diagram')+' svg').count(),1);await page.locator(field('choices')+' button').last().click();assert.equal(await page.locator(field('ledger')+' tbody tr').count(),3);assert.match(await page.textContent(field('ledger')),/900719925474099312345/);await page.locator(field('ledger')+' summary').first().click();assert.match(await page.textContent(field('ledger')),/"event_id": "a"/);
  await page.locator('#atlas-motif-workspace').screenshot({path:resolve(root,'.data/atlas-motifs-public-desktop.png')});await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('#atlas-motif-workspace').screenshot({path:resolve(root,'.data/atlas-motifs-public-mobile.png')});await page.setViewportSize({width:1440,height:1000});
  await page.selectOption(field('type'),'pass_through');assert.ok(await page.locator(field('result')).isHidden());assert.ok(await page.locator(field('hops')).isDisabled());await search();assert.ok((await download()).motifs.length>2);
  for(const type of ['fan_in','fan_out','repeated_pair']){await page.selectOption(field('type'),type);await search();report=await download();assert.equal(report.motifs.length,1);assert.equal(report.motifs[0].ordered,false);assert.match(await page.textContent(field('method')),/half-open UTC bins/);}
  await page.fill(field('minimum'),'900719925474099312346');await search();assert.equal((await download()).motifs.length,0);assert.match(await page.textContent(field('summary')),/No matching pattern/);
  await page.click(field('reset'));await page.fill(field('reference'),'not-observed');await page.click(field('run'));
  await page.waitForFunction(()=>document.querySelector('[data-motif=status]').textContent.includes('Choose a reference observed'));assert.ok(await page.locator(field('export')).isDisabled());
  const fan=await evidencePacket(sourceGraph('ETH'),'ETH');await page.setInputFiles('#atlas-import',{name:'SYNTHETIC-fan.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fan))});await page.waitForFunction(hash=>document.querySelector('#atlas-provenance').textContent.includes(hash),fan.dataset_sha256);
  await page.fill(field('reference'),fan.dataset.nodes[39].id);await page.selectOption(field('type'),'fan_in');await search();report=await download();assert.equal(report.provenance.imported,true);assert.equal(report.motifs[0].events.length,39);assert.equal(await page.locator(field('ledger')+' tbody tr').count(),20);await page.click(field('next'));assert.equal(await page.locator(field('ledger')+' tbody tr').count(),19);assert.match(await page.textContent(field('diagram-note')),/12 of 39/);assert.match(await page.textContent(field('summary')),/at least ten/);
  await page.fill(field('search'),fan.dataset.edges[0].event_id);assert.equal(await page.locator(field('ledger')+' tbody tr').count(),1);await page.fill(field('search'),'');await page.locator('#atlas-motif-workspace').screenshot({path:resolve(root,'.data/atlas-motifs-fan-desktop.png')});
  sourceFailure=true;await page.click('#atlas-load');await page.waitForFunction(()=>document.querySelector('#atlas-status').textContent.includes('Source unavailable (HTTP 502)'));assert.ok(await page.locator(field('result')).isHidden());assert.ok(!(await page.textContent(field('status'))).includes('Waiting'));sourceFailure=false;
  await page.selectOption('#atlas-asset','BTC');await page.click('#atlas-load');await page.waitForFunction(()=>document.querySelector('[data-motif=status]').textContent.includes('unavailable for BTC'));assert.ok(await page.locator(field('run')).isDisabled());
  await context.addCookies([{name:'porb_dev_session',value:cookie.split('=')[1],url:origin,httpOnly:true,sameSite:'Strict'}]);await page.goto(origin+'/atlas.html?analysis='+run.id+'&node='+encodeURIComponent(run.graph.nodes[0].id));await page.waitForFunction(()=>!document.querySelector('[data-motif=run]').disabled);assert.equal(await page.inputValue(field('reference')),run.graph.nodes[0].address);await search();report=await download();assert.equal(report.provenance.analysis_id,run.id);assert.equal(report.provenance.dataset_sha256,run.digest);
  motifFailure=true;await page.click(field('run'));await page.waitForFunction(()=>document.querySelector('[data-motif=status]').textContent.includes('fixture motif failure'));assert.ok(await page.locator(field('result')).isHidden());assert.ok(await page.locator(field('export')).isDisabled());motifFailure=false;
  motifDelay=350;await page.click(field('run'));await page.selectOption(field('type'),'fan_out');await page.waitForTimeout(450);assert.ok(await page.locator(field('result')).isHidden());motifDelay=0;await search();assert.equal((await download()).parameters.type,'fan_out');
  await page.locator('#atlas-motif-workspace').screenshot({path:resolve(root,'.data/atlas-motifs-private-desktop.png')});await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('#atlas-motif-workspace').screenshot({path:resolve(root,'.data/atlas-motifs-private-mobile.png')});await page.setViewportSize({width:1440,height:1000});
  h.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=?').run('viewer',h.tenant);await page.reload();await page.waitForFunction(()=>!document.querySelector('[data-motif=run]').disabled);await search();assert.equal((await download()).motifs.length,2);
  motifDelay=350;await page.click(field('run'));await page.waitForTimeout(60);const other=crypto.randomUUID();h.sqlite.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(other,'Other motif browser organization','research',Date.now());h.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?)').run(other,h.owner,'owner');h.sqlite.prepare('UPDATE sessions SET tenant_id=? WHERE user_id=?').run(other,h.owner);
  await page.click('#private-refresh');await page.locator('#private-workspace[hidden]').waitFor({state:'attached'});await page.waitForTimeout(450);assert.equal(await page.textContent(field('ledger')),'');assert.equal(await page.inputValue(field('reference')),'');assert.ok(await page.locator(field('export')).isDisabled());
  assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks:['public capture reuse','cycle diagram and exact events','all five pattern types','report checksum','empty and invalid queries','imported provenance','complete paginated fan evidence','bounded diagram and degree caveat','source failure invalidation','UTXO applicability','private saved evidence and deep links','failed and late query clearing','viewer access','organization isolation','desktop and mobile']}));
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));h.sqlite.close();}
