// Local synthetic fixtures only. Opening a saved file never needs a source reply.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {setup,credentials} from '../tests/porb_helpers.mjs';
import {portalBrowserServer} from '../tests/portal_browser_server.js';
import {researchReport,researchFixture} from '../tests/address_research_fixture.js';
import {spaceDataFixture} from '../tests/space_portal_fixture.js';
import {researchHash} from '../space/public/assets/address-research-core.js';
import {collectResearch,researchSelection} from '../space/public/assets/address-research-bundle.js';
import {compareSavedCapture} from '../space/public/assets/address-research-import.js';
import {createAddressEvidence} from '../space/public/assets/address-evidence.js';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||process.argv[2]||'playwright');
const root=resolve(new URL('../',import.meta.url).pathname),h=await setup(),errors=[],requests=[];let sourceReads=0;
const saved=async(asset='USDT',options={})=>(await researchReport(asset,options)).body;
async function newer(asset='USDT'){
  const {report_sha256,...body}=await saved(asset);body.retrieved_at='2026-09-27T12:00:00Z';body.modules.ledger.data.wallet.balance.base_units=(BigInt(body.modules.ledger.data.wallet.balance.base_units)+1n).toString();return {...body,report_sha256:await researchHash(body)};
}
async function source(url){const u=new URL(url);if(u.pathname==='/api/overview')return Response.json(spaceDataFixture(u.searchParams.get('network')));sourceReads++;return Response.json({error:'address_research_unavailable'},{status:502});}
const portal=await portalBrowserServer(h,{fetcher:source});
const headers=Object.fromEntries((await readFile(resolve(root,'space/public/_headers'),'utf8')).split('\n\n')[0].split('\n').slice(1).filter(Boolean).map(line=>{const i=line.indexOf(':');return [line.slice(0,i).trim(),line.slice(i+1).trim()];}));
const server=createServer(async(req,res)=>{try{
  const u=new URL(req.url,'https://bloch.space');let response;
  if(u.pathname.startsWith('/api/'))response=await source(u.href);
  else{const file=resolve(root,'space/public','.'+decodeURIComponent(u.pathname)+(u.pathname.endsWith('/')?'index.html':''));assert.ok(file.startsWith(resolve(root,'space/public')+'/'));response=new Response(await readFile(file),{headers:{...headers,'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream'}});}
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}catch(error){res.writeHead(404);res.end(error.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const space=`http://127.0.0.1:${server.address().port}`;
const browser=await webkit.launch(),context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/.test(m.text()))errors.push(m.text());});page.on('request',r=>requests.push(r.url()));
const reader='[data-research-reader]',output='[data-research-reader-output]';
const download=async selector=>{const pending=page.waitForEvent('download');await page.click(selector);return readFile(await(await pending).path(),'utf8');};
const json=async selector=>JSON.parse(await download(selector));
const storage=()=>page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));
async function open(value,name='saved.json',accepted=true){
  if(!await page.locator(reader).evaluate(n=>n.open))await page.locator(reader+'>summary').click();
  await page.locator('[data-research-reader-file]').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(typeof value==='string'?value:JSON.stringify(value,null,2))});
  await page.waitForFunction(()=>/^(Opened locally:|Saved research rejected\.)/.test(document.querySelector('[data-research-reader-status]')?.textContent||''));
  const message=await page.locator('[data-research-reader-status]').innerText();assert.equal(message.startsWith('Opened locally:'),accepted,message);
}
async function earlier(value){
  const box=page.locator(output+' [data-saved-capture]').filter({visible:true});await box.locator('summary').first().click();
  await box.locator('input').setInputFiles({name:'earlier.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
  await box.locator('[data-comparison-export]').waitFor();return json(output+' [data-comparison-export]');
}
async function delay(value){
  await page.evaluate(()=>{if(!window.originalFileText)window.originalFileText=File.prototype.text;window.fileStarted=false;window.fileFinished=false;File.prototype.text=async function(){const text=await window.originalFileText.call(this);if(this.name==='delayed.json'){window.fileStarted=true;await new Promise(resolve=>{window.releaseFile=resolve;});window.fileFinished=true;}return text;};});
  await page.locator('[data-research-reader-file]').setInputFiles({name:'delayed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});await page.waitForFunction(()=>window.fileStarted);
}
async function release(){await page.evaluate(()=>window.releaseFile());await page.waitForFunction(()=>window.fileFinished);}
async function mobile(){await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Saved research must fit a mobile viewport');await page.setViewportSize({width:1440,height:1000});}
try{
  await page.goto(portal.origin+'/explore/');await page.waitForLoadState('networkidle');assert.equal(sourceReads,0);
  for(const asset of ['BTC','ETH','USDT','USDC','BLCH']){
    const capture=await saved(asset),reads=requests.length,before=await storage();await open(capture,'<img src=x onerror=alert(1)>.json');
    assert.deepEqual(await json(output+' [data-research-export]'),capture);assert.equal(await page.locator(output+' img').count(),0);assert.match(await page.locator('.ar-reader-origin').innerText(),/<img src=x/);
    assert.equal(await page.locator(output+' [data-research-refresh]').count(),0);
    if(asset!=='ETH'){
      await page.click(output+' [data-ae=toggle]');assert.equal(await download(output+' [data-ae=csv]'),createAddressEvidence(capture).csv());
      await page.click(output+' [data-ar-group="1"]');assert.equal(await page.locator(output+' [data-ar-peer-group]').inputValue(),'1');
    }else assert.equal(await page.locator(output+' .ar-evidence').count(),0);
    assert.equal(requests.length,reads,'Local opening, evidence and downloads make no HTTP request');assert.equal(await storage(),before);await mobile();
  }
  const current=await newer(),old=await saved();await open(current);const reads=requests.length;
  assert.deepEqual(await earlier(old),await compareSavedCapture(JSON.stringify(old),current));assert.equal(requests.length,reads,'Two-file comparison needs no live capture');
  await page.click(output+' [data-ae=toggle]');await page.selectOption(output+' [data-ae=direction]','incoming');const filtered=await page.locator(output+' .ar-evidence').innerText();
  for(const invalid of ['{',JSON.stringify({...current,coverage:'tampered'}),JSON.stringify({version:'private-analysis'})]){
    await open(invalid,'rejected.json',false);assert.deepEqual(await json(output+' [data-research-export]'),current);assert.equal(await page.locator(output+' .ar-evidence').innerText(),filtered);assert.equal(await page.locator(output+' [data-comparison-export]').count(),1);
  }
  await delay(old);await open(await saved('BTC'));await release();assert.deepEqual(await json(output+' [data-research-export]'),await saved('BTC'),'A superseded read cannot replace a newer local selection');
  await delay(old);await page.locator('[data-research-reader-clear]').focus();await page.keyboard.press('Enter');await release();assert.equal(await page.locator(output+'>*').count(),0,'Closing invalidates pending reads');
  const combined=await collectResearch(researchSelection('ETH_ALL',researchFixture().reference),saved,{now:()=> '2026-09-26T12:02:00Z'});await open(combined);
  for(const item of combined.results){await page.click(`[data-bundle-asset=${item.asset}]`);assert.deepEqual(await json(`[data-bundle-panel=${item.asset}] [data-research-export]`),item.report);}
  await page.locator('[data-bundle-asset=USDC]').focus();await page.keyboard.press('Home');assert.equal(await page.locator('[data-bundle-asset=ETH]').getAttribute('aria-selected'),'true');assert.equal(await page.locator('[data-bundle-refresh]').count(),0);assert.deepEqual(await json('[data-bundle-export]'),combined);
  const broken=structuredClone(combined);delete broken.bundle_sha256;delete broken.results[2].report.report_sha256;broken.results[2].report.modules.machine_learning.data.k=1000000000;broken.results[2].report.report_sha256=await researchHash(broken.results[2].report);broken.bundle_sha256=await researchHash(broken);
  await open(broken,'invalid-hidden-tab.json',false);assert.deepEqual(await json('[data-bundle-export]'),combined,'A malformed inactive child cannot replace a usable bundle');
  const partial=await collectResearch(researchSelection('ETH_ALL',researchFixture().reference),asset=>asset==='USDC'?saved(asset):Promise.reject(new Error('source_unavailable')));await open(partial);await page.click('[data-bundle-asset=ETH]');assert.match(await page.locator('[data-bundle-panel=ETH]').innerText(),/report unavailable/);await mobile();
  const unavailable=await collectResearch(researchSelection('ETH_ALL',researchFixture().reference),()=>Promise.reject(new Error('source_unavailable')));await open(unavailable);assert.equal(await page.locator(output+' [data-research-export]').count(),0);assert.deepEqual(await json('[data-bundle-export]'),unavailable);
  // WebKit global offline emulation may deny File.text itself. Exercise the
  // resident-byte verifier offline, and the real picker with every HTTP blocked.
  await context.setOffline(true);assert.equal(await page.evaluate(async text=>(await(await import('/space/assets/address-research-reader.js')).openSavedResearch(text)).report_sha256,JSON.stringify(current)),current.report_sha256);await context.setOffline(false);
  const deny=route=>route.abort('internetdisconnected');await context.route(/^https?:/,deny);const noNetwork=requests.length;await open(current);await earlier(old);assert.equal(requests.length,noNetwork);await context.unroute(/^https?:/,deny);
  await page.selectOption('#public-address-form [name=asset]','BTC');await page.fill('#public-address-form [name=query]',researchFixture('BTC').reference);await page.click('#public-address-form button');await page.waitForFunction(()=>document.querySelector('#public-address-status').textContent.startsWith('Address research unavailable:'));
  assert.deepEqual(await json(output+' [data-research-export]'),current,'A failed live search does not replace local research');
  await page.goto(space+'/?network=ethereum');await page.waitForLoadState('networkidle');await open(current);await page.click('[data-network=bitcoin]');await page.waitForLoadState('networkidle');assert.deepEqual(await json(output+' [data-research-export]'),current,'A network switch does not relabel a saved capture');assert.match(await page.locator('.ar-reader-origin').innerText(),/ethereum/);await mobile();
  await page.goto(portal.origin+'/portal/?view=references');await page.fill('#auth-form [name=email]',credentials.email);await page.fill('#auth-form [name=password]',credentials.password);await page.click('#auth-submit');await page.locator('#workspace:visible').waitFor();await page.waitForLoadState('networkidle');const privateReads=requests.length;await open(current);await earlier(old);assert.equal(requests.length,privateReads,'The local reader never queries private observations');await mobile();
  await delay(old);await page.click('#logout');await page.locator('#gate:visible').waitFor();await release();assert.equal(await page.locator(output+'>*').count(),0,'Logout removes saved reports and comparisons, including pending file reads');
  await page.fill('#auth-form [name=email]',credentials.email);await page.fill('#auth-form [name=password]',credentials.password);await page.click('#auth-submit');await page.locator('#workspace:visible').waitFor();assert.equal(await page.locator(output+'>*').count(),0);
  await page.goto(portal.origin+'/space/?network=ethereum');await page.waitForLoadState('networkidle');await open(current);assert.deepEqual(await json(output+' [data-research-export]'),current);assert.match(await page.locator(output+' a:has-text("Explore graph")').getAttribute('href'),/\/space\/graph\//);
  assert.deepEqual(errors,[]);
  if(process.argv.includes('--screenshots')){
    await page.goto(space+'/?network=ethereum');await page.waitForLoadState('networkidle');await open(current);await mkdir(resolve(root,'.data'),{recursive:true});for(const [name,width,height]of [['desktop',1440,1000],['mobile',390,844]]){await page.setViewportSize({width,height});await page.locator(reader).evaluate(node=>{const h=document.querySelector('.space-header');scrollTo({top:scrollY+node.getBoundingClientRect().top-(h?.getBoundingClientRect().height||0)-16,behavior:'instant'});});await page.screenshot({caret:'initial',path:resolve(root,`.data/research-reader-${name}.png`)});}await page.setViewportSize({width:1440,height:1000});
  }
  console.log(JSON.stringify({status:'passed',checks:['five assets and original JSON, exact evidence CSV and stored ML groups','no live capture, uploads, HTTP calls or browser storage needed','two-file comparison and independent live searches','full and partial bundles, unavailable tabs, malformed inactive child rejection','preserved filters and comparisons after invalid replacements','superseded reads, keyboard close and logout cancellation','resident-byte offline verification and HTTP-isolated file picker','public explorer, public directory, private portal and mounted explorer','mobile, keyboard tabs and no functional CSP errors']}));
}catch(error){console.error({url:page.url(),errors,status:await page.locator('[data-research-reader-status],#status').allTextContents()});throw error;}
finally{await context.setOffline(false);await browser.close();await portal.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));h.sqlite.close();}
