// Isolated saved-file workflows. Public and private source replies are synthetic.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {setup,credentials} from '../tests/porb_helpers.mjs';
import {portalBrowserServer} from '../tests/portal_browser_server.js';
import {researchReport,researchFixture} from '../tests/address_research_fixture.js';
import {spaceDataFixture} from '../tests/space_portal_fixture.js';
import {analyzeAddress,researchHash} from '../space/public/assets/address-research-core.js';
import {collectResearch,researchSelection} from '../space/public/assets/address-research-bundle.js';
import {compareSavedCapture} from '../space/public/assets/address-research-import.js';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||process.argv[2]||'playwright');
const root=resolve(new URL('../',import.meta.url).pathname),h=await setup(),errors=[],requests=[];let sourceReads=0,offlineFileMode='native-offline';
const saved=async asset=>(await researchReport(asset)).body;
async function source(url,init){
 sourceReads++;assert.equal(init?.headers?.cookie,undefined);assert.equal(init?.headers?.authorization,undefined);
 const u=new URL(url),{report_sha256,...body}=(await researchReport(u.searchParams.get('asset'),{reference:u.searchParams.get('query')})).body;
 body.retrieved_at='2026-09-27T12:00:00Z';body.modules.ledger.data.wallet.balance.base_units=(BigInt(body.modules.ledger.data.wallet.balance.base_units)+3n).toString();
 if(body.modules.graph.status==='available'){body.modules.graph.data.edges[0].amount='7';const analyzed=analyzeAddress(body.modules.graph.data,body.scope);body.modules.analytics.data=analyzed.analytics;body.modules.machine_learning.data=analyzed.ml;}
 return Response.json({...body,report_sha256:await researchHash(body)});
}
const portal=await portalBrowserServer(h,{fetcher:source});
const headers=Object.fromEntries((await readFile(resolve(root,'space/public/_headers'),'utf8')).split('\n\n')[0].split('\n').slice(1).filter(Boolean).map(line=>{const i=line.indexOf(':');return [line.slice(0,i).trim(),line.slice(i+1).trim()];}));
const server=createServer(async(req,res)=>{try{
 const u=new URL(req.url,'https://bloch.space');let response;
 if(u.pathname==='/api/research')response=await source(u.href);
 else if(u.pathname==='/api/overview')response=Response.json(spaceDataFixture(u.searchParams.get('network')));
 else{const file=resolve(root,'space/public','.'+decodeURIComponent(u.pathname)+(u.pathname.endsWith('/')?'index.html':''));assert.ok(file.startsWith(resolve(root,'space/public')+'/'));response=new Response(await readFile(file),{headers:{...headers,'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream'}});}
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){res.writeHead(404);res.end(error.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const space=`http://127.0.0.1:${server.address().port}`;
const browser=await webkit.launch(),context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/.test(m.text()))errors.push(m.text());});page.on('request',r=>requests.push(r.url()));
const query=asset=>{const f=researchFixture(asset);return new URLSearchParams({network:f.network,kind:'address',asset,query:f.reference});};
const submit=async(asset='USDT')=>{await page.selectOption('#public-address-form [name=asset]',asset);await page.fill('#public-address-form [name=query]',researchFixture(asset==='ETH_ALL'?'ETH':asset).reference);await page.click('#public-address-form button');await page.locator('[data-research-export]').first().waitFor();await page.waitForLoadState('networkidle');};
const download=async selector=>{const pending=page.waitForEvent('download');await page.click(selector);return JSON.parse(await readFile(await(await pending).path(),'utf8'));};
async function loadFile(asset,text,name='saved.json',accepted=true,filePath=null){
 const prefix=`[data-saved-capture=${asset}]`;if(!await page.locator(prefix).evaluate(n=>n.open))await page.locator(prefix+'>summary').click();
 await page.locator(prefix+' input').setInputFiles(filePath||{name,mimeType:'application/json',buffer:Buffer.from(text)});
 await page.waitForFunction(asset=>/^(Local file compared:|Saved capture rejected\.)/.test(document.querySelector(`[data-saved-capture=${asset}] [data-saved-capture-status]`)?.textContent||''),asset);
 const message=await page.locator(prefix+' [data-saved-capture-status]').innerText();
 if(accepted!==null)assert.equal(message.startsWith('Local file compared:'),accepted,message);
 return prefix;
}
async function deferFile(){
 await page.evaluate(()=>{
  if(!window.originalFileText)window.originalFileText=File.prototype.text;
  window.fileStarted=false;window.fileFinished=false;
  File.prototype.text=async function(){const text=await window.originalFileText.call(this);if(this.name==='delayed.json'){window.fileStarted=true;await new Promise(resolve=>{window.releaseFile=resolve;});window.fileFinished=true;}return text;};
 });
}
async function startDelayed(asset,text){const prefix=`[data-saved-capture=${asset}]`;if(!await page.locator(prefix).evaluate(n=>n.open))await page.locator(prefix+'>summary').click();await page.locator(prefix+' input').setInputFiles({name:'delayed.json',mimeType:'application/json',buffer:Buffer.from(text)});await page.waitForFunction(()=>window.fileStarted);}
async function releaseFile(){await page.evaluate(()=>window.releaseFile());await page.waitForFunction(()=>window.fileFinished);}
try{
 for(const asset of ['BTC','ETH','USDT','USDC','BLCH']){
  await page.goto(space+'/?'+query(asset));await page.locator('[data-research-export]').waitFor();await page.waitForLoadState('networkidle');
  const current=await download('[data-research-export]'),text=JSON.stringify(await saved(asset),null,2),reads=sourceReads,http=requests.length,storage=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));
  if(asset==='USDT'){await page.click('[data-ae=toggle]');await page.selectOption('[data-ae=direction]','incoming');}
  const evidence=asset==='USDT'?await page.locator('.ar-evidence').innerText():null;
  const prefix=await loadFile(asset,text,'<img src=x onerror=alert(1)>.json'),comparison=await download(prefix+' [data-comparison-export]');
  assert.deepEqual(comparison,await compareSavedCapture(text,current));assert.equal(comparison.balance.delta_base_units,'3');assert.match(await page.locator(prefix+' [data-saved-capture-status]').innerText(),/<img src=x/);assert.equal(await page.locator(prefix+' img').count(),0);
  if(asset!=='ETH'){await page.selectOption(prefix+' select','changed');await page.locator(prefix+' .ar-capture-comparison details>summary').first().click();assert.match(await page.locator(prefix).innerText(),/7 base units/);assert.equal(comparison.graph.changed.length,1);}
  assert.equal(sourceReads,reads);assert.equal(requests.length,http,'Reading a saved file makes no HTTP request');assert.equal(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}})),storage,'Import stores no browser data');assert.deepEqual(await download('[data-research-export]'),current);
  if(asset==='USDT'){assert.equal(await page.locator('[data-ae=direction]').inputValue(),'incoming');assert.equal(await page.locator('.ar-evidence').innerText(),evidence,'Import preserves the current filtered evidence');}
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'saved file mobile '+asset);await page.setViewportSize({width:1440,height:1000});
 }
 await page.goto(portal.origin+'/explore/');await submit();const current=await download('[data-research-export]'),text=JSON.stringify(await saved('USDT'));
 const offlinePath=resolve(root,'.data/offline-saved-capture.json');await mkdir(resolve(root,'.data'),{recursive:true});await writeFile(offlinePath,text);await context.setOffline(true);
 // WebKit may make even in-memory Blob/File reads fail in global offline
 // emulation. Verify resident-byte calculation offline, then separately deny
 // every HTTP request while exercising the real local file picker.
 const offlineHash=await page.evaluate(async({text,current})=>(await(await import('/space/assets/address-research-import.js')).compareSavedCapture(text,current)).comparison_sha256,{text,current});assert.equal(offlineHash,(await compareSavedCapture(text,current)).comparison_sha256);
 let prefix=await loadFile('USDT',text,'saved.json',null,offlinePath);
 if(!await page.locator(prefix+' [data-comparison-export]').count()){assert.match(await page.locator(prefix+' [data-saved-capture-status]').innerText(),/browser could not read this file/);offlineFileMode='http-blocked-file-read';}
 await context.setOffline(false);const deny=route=>route.abort('internetdisconnected');await context.route(/^https?:/,deny);
 const beforeOfflineRead=requests.length;await loadFile('USDT',text,'saved.json',true,offlinePath);assert.equal((await download(prefix+' [data-comparison-export]')).balance.delta_base_units,'3');assert.equal(requests.length,beforeOfflineRead);await context.unroute(/^https?:/,deny);
 for(const value of ['{',JSON.stringify(await saved('USDC')),JSON.stringify({...await saved('USDT'),coverage:'corrupt'}),JSON.stringify(current)]){await loadFile('USDT',value,'invalid.json',false);assert.equal(await page.locator(prefix+' [data-comparison-export]').count(),0);assert.deepEqual(await download('[data-research-export]'),current);}
 await loadFile('USDT',text);await page.locator(prefix+' [data-saved-capture-clear]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator(prefix+' [data-comparison-export]').count(),0);
 await deferFile();await startDelayed('USDT',text);await loadFile('USDT','{','replaced.json',false);await releaseFile();assert.equal(await page.locator('[data-comparison-export]').count(),0,'A superseded read cannot restore a comparison');
 await deferFile();await startDelayed('USDT',text);await page.click(prefix+' [data-saved-capture-clear]');await releaseFile();assert.equal(await page.locator('[data-comparison-export]').count(),0,'Clear invalidates pending file reads');
 await deferFile();await startDelayed('USDT',text);await submit('BTC');await releaseFile();assert.equal(await page.locator('[data-comparison-export]').count(),0,'A new query invalidates the old file read');
 await submit('ETH_ALL');const bundle=await collectResearch(researchSelection('ETH_ALL',researchFixture().reference),saved,{now:()=> '2026-09-26T12:02:00Z'}),bundleText=JSON.stringify(bundle,null,2),beforeBundle=await download('[data-bundle-export]');
 for(const asset of ['ETH','USDT','USDC']){await page.click(`[data-bundle-asset=${asset}]`);prefix=await loadFile(asset,bundleText);const comparison=await download(prefix+' [data-comparison-export]');assert.equal(comparison.before.imported_from.sha256,bundle.bundle_sha256);assert.equal(comparison.scope.asset,asset);}
 assert.deepEqual(await download('[data-bundle-export]'),beforeBundle);await page.click('[data-bundle-asset=USDT]');await page.click('[data-bundle-refresh=USDT]');await page.waitForFunction(()=>document.querySelector('[data-bundle-status]').textContent.startsWith('USDT updated'));assert.equal(await page.locator('[data-saved-capture=USDT] [data-comparison-export]').count(),0);assert.equal(await page.locator('[data-saved-capture=USDC] [data-comparison-export]').count(),1,'Updating one asset preserves the other imported comparisons');
 await page.goto(portal.origin+'/portal/?view=references');await page.fill('#auth-form [name=email]',credentials.email);await page.fill('#auth-form [name=password]',credentials.password);await page.click('#auth-submit');await page.locator('#workspace:visible').waitFor();await page.selectOption('#reference-form [name=asset]','USDT');await page.fill('#reference-form [name=reference]',researchFixture().reference);await page.click('#reference-form button');await page.locator('[data-saved-capture=USDT]').waitFor();await loadFile('USDT',text);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'private saved capture mobile');await page.setViewportSize({width:1440,height:1000});
 await deferFile();await startDelayed('USDT',text);await page.click('#logout');await page.locator('#gate:visible').waitFor();await releaseFile();assert.equal(await page.locator('[data-saved-capture],[data-comparison-export]').count(),0,'Logout clears completed and pending imported comparisons');
 assert.deepEqual(errors,[]);
 if(process.argv.includes('--screenshots')){
  await mkdir(resolve(root,'.data'),{recursive:true});await page.goto(space+'/?'+query('USDT'));await page.locator('[data-saved-capture=USDT]').waitFor();await loadFile('USDT',text);
  for(const [name,width,height]of [['desktop',1440,1000],['mobile',390,844]]){
   await page.setViewportSize({width,height});await page.locator('[data-saved-capture]').evaluate(node=>{const header=document.querySelector('.space-header');window.scrollTo({top:scrollY+node.getBoundingClientRect().top-(header?.getBoundingClientRect().height||0)-16,behavior:'instant'});});
   await page.screenshot({caret:'initial',path:resolve(root,`.data/saved-capture-${name}.png`)});
  }
 }
 console.log(JSON.stringify({status:'passed',offline_file_mode:offlineFileMode,checks:['all five assets and exact hashed imported comparisons','literal filenames, no HTTP uploads/reads or browser storage','offline calculation, HTTP-isolated file reads and unchanged current reports','invalid files clear imported output','superseded, cleared and detached file reads stay invalid','bundle integrity and independent asset comparison state','asset refresh clears only its replaced imported comparison','authenticated import and logout clearing','desktop/mobile, keyboard controls and no functional CSP errors']}));
}catch(error){console.error({url:page.url(),errors,status:await page.locator('[data-saved-capture-status],#status').allTextContents()});throw error;}
finally{await context.setOffline(false);await browser.close();await portal.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));h.sqlite.close();}
