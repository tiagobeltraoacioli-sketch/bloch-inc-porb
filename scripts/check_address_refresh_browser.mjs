// Isolated single-asset updates; all sources and private account records are synthetic.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {setup,credentials} from '../tests/porb_helpers.mjs';
import {portalBrowserServer} from '../tests/portal_browser_server.js';
import {researchReport,researchFixture} from '../tests/address_research_fixture.js';
import {spaceDataFixture} from '../tests/space_portal_fixture.js';
import {researchHash,verifyResearch} from '../space/public/assets/address-research-core.js';
import {compareAddressReports} from '../space/public/assets/address-research-comparison.js';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||process.argv[2]||'playwright');
const root=resolve(new URL('../',import.meta.url).pathname),h=await setup(),cookie=await h.login();
assert.equal((await h.call('/v1/analyses','POST',{asset:'USDT',pages:1},cookie)).status,201);
const errors=[],reads=[],retainedReads=[],revisions=new Map();let failed=0,options={},invalidShape=false,wrongScope=false,delay=false,release,arrived,started;
function deferNext(){delay=true;started=new Promise(resolve=>{arrived=resolve;});}
async function source(url,init){
 const u=new URL(url),asset=u.searchParams.get('asset');reads.push({asset,reference:u.searchParams.get('query')});assert.equal(init?.headers?.cookie,undefined);assert.equal(init?.headers?.authorization,undefined);
 if(failed)return Response.json({error:'source_unavailable'},{status:failed});
 const value=await researchReport(asset,{reference:wrongScope?'0x'+'f'.repeat(40):u.searchParams.get('query'),...options});
 if(value.status!==200)return Response.json(value.body,{status:value.status});
 const {report_sha256,...body}=value.body,revision=revisions.get(asset)||0;
 if(revision){body.retrieved_at=new Date(Date.UTC(2026,8,27,18,revision)).toISOString();if(body.modules.ledger.status==='available')body.modules.ledger.data.wallet.balance.base_units=(BigInt(body.modules.ledger.data.wallet.balance.base_units)+BigInt(revision)).toString();}
 if(invalidShape)body.modules=null;
 const report={...body,report_sha256:await researchHash(body)};
 if(delay){delay=false;arrived();await new Promise(resolve=>{release=resolve;});}
 return Response.json(report);
}
const portal=await portalBrowserServer(h,{fetcher:source,after:async(response,request)=>{if(new URL(request.url).pathname==='/api/porb/v1/references')retainedReads.push(request.url);return response;}});
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
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/.test(m.text()))errors.push(m.text());});
const query=asset=>new URLSearchParams({network:researchFixture(asset).network,asset,kind:'address',query:researchFixture(asset).reference});
const loaded=async asset=>page.locator(`[data-research-session=${asset}] [data-research-export]`).waitFor();
const submit=async asset=>{await page.selectOption('#public-address-form [name=asset]',asset);await page.fill('#public-address-form [name=query]',researchFixture(asset).reference);await page.click('#public-address-form button');await loaded(asset);};
const download=async selector=>{const pending=page.waitForEvent('download');await page.click(selector);return JSON.parse(await readFile(await(await pending).path(),'utf8'));};
const current=async()=>verifyResearch(await download('[data-research-export]'));
const updated=async(asset,word='updated')=>page.waitForFunction(({asset,word})=>document.querySelector('[data-research-status]')?.textContent.startsWith(asset+' '+word),{asset,word});
async function update(asset,word='updated'){
 const before=reads.length;await page.click('[data-research-refresh]');await updated(asset,word);assert.deepEqual(reads.slice(before),[{asset,reference:researchFixture(asset).reference}]);
}
async function raw(){const node=page.locator('[data-research-raw]');if(!await node.evaluate(n=>n.open))await node.locator('summary').click();return download('[data-research-raw] button:has-text("Download JSON")');}
try{
 for(const asset of ['BTC','ETH','USDT','USDC','BLCH']){
  await page.goto(space+'/?'+query(asset));await loaded(asset);const original=await current();assert.deepEqual(await raw(),original);assert.equal(await page.locator('[data-research-previous]').isHidden(),true);
  if(asset!=='ETH'){await page.click('[data-ae=toggle]');await page.selectOption('[data-ae=direction]','incoming');}
  const ledger=await page.locator('[data-research-ledger]').innerText();revisions.set(asset,1);deferNext();const before=reads.length;await page.click('[data-research-refresh]');await started;
  assert.equal(await page.locator('[data-research-refresh]').isDisabled(),true);assert.deepEqual(await current(),original);assert.deepEqual(await raw(),original);assert.equal(await page.locator('[data-research-ledger]').innerText(),ledger);
  if(asset!=='ETH')assert.equal(await page.locator('[data-ae=direction]').inputValue(),'incoming');
  release();await updated(asset);assert.deepEqual(reads.slice(before),[{asset,reference:original.scope.reference}]);const next=await current();assert.notEqual(next.report_sha256,original.report_sha256);assert.deepEqual(await raw(),next);assert.deepEqual(await download('[data-research-previous]'),original);assert.match(await page.locator('[data-research-ledger]').innerText(),new RegExp(next.modules.ledger.data.wallet.balance.base_units));
  if(asset!=='ETH')assert.equal(await page.locator('[data-ae=direction]').inputValue(),'all');
  const beforeCompare=reads.length;await page.locator('[data-research-compare]').focus();await page.keyboard.press('Enter');await page.locator('[data-research-comparison] [data-comparison-export]').waitFor();assert.deepEqual(await download('[data-research-comparison] [data-comparison-export]'),await compareAddressReports(original,next));assert.equal(reads.length,beforeCompare);
  await update(asset,'returned the same');assert.deepEqual(await current(),next);assert.deepEqual(await download('[data-research-previous]'),original);assert.equal(await page.locator('[data-research-comparison] [data-comparison-export]').count(),1);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'single refresh mobile '+asset);await page.setViewportSize({width:1440,height:1000});
 }
 await page.goto(space+'/?'+query('USDT'));await loaded('USDT');const ledgerCapture=await current();options={ledgerUnavailable:true};revisions.set('USDT',2);await update('USDT');const graphOnly=await current();assert.equal(graphOnly.modules.ledger.status,'unavailable');assert.equal(await page.locator('[data-research-ledger]').count(),0,'A partial replacement removes the old ledger detail');assert.deepEqual(await raw(),graphOnly);assert.deepEqual(await download('[data-research-previous]'),ledgerCapture);options={};
 await page.click('[data-research-compare]');await page.locator('[data-research-comparison] [data-comparison-export]').waitFor();assert.equal((await download('[data-research-comparison] [data-comparison-export]')).balance.status,'unavailable');
 for(const type of ['invalidShape','wrongScope']){invalidShape=type==='invalidShape';wrongScope=type==='wrongScope';await update('USDT','update unavailable');assert.deepEqual(await current(),graphOnly);assert.deepEqual(await raw(),graphOnly);assert.deepEqual(await download('[data-research-previous]'),ledgerCapture);assert.equal(await page.locator('[data-research-comparison] [data-comparison-export]').count(),1);}invalidShape=wrongScope=false;
 deferNext();await page.click('[data-research-refresh]');await started;await page.click('[data-network=bitcoin]');release();assert.equal(await page.locator('[data-research-session]').count(),0,'Network change invalidates pending updates');
 await page.goto(portal.origin+'/explore/');await submit('USDT');const captured=await current();await page.click('[data-ae=toggle]');await page.selectOption('[data-ae=direction]','incoming');
 await page.click('[data-saved-capture]>summary');await page.locator('[data-saved-capture-file]').setInputFiles({name:'baseline.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify((await researchReport()).body))});await page.locator('[data-saved-capture] [data-comparison-export]').waitFor();const evidence=await page.locator('.ar-evidence').innerText();
 // An edited, unsubmitted search must not redirect updates of the displayed report.
 await page.selectOption('#public-address-form [name=asset]','USDC');await page.fill('#public-address-form [name=query]','0x'+'e'.repeat(40));
 for(const status of [429,503]){failed=status;await update('USDT','update unavailable');assert.deepEqual(await current(),captured);assert.equal(await page.locator('.ar-evidence').innerText(),evidence);assert.equal(await page.locator('[data-ae=direction]').inputValue(),'incoming');assert.equal(await page.locator('[data-saved-capture] [data-comparison-export]').count(),1);}failed=0;
 await context.setOffline(true);const offlineReads=reads.length;await page.click('[data-research-refresh]');await updated('USDT','update unavailable');assert.deepEqual(await current(),captured);assert.equal(reads.length,offlineReads);await context.setOffline(false);
 options={graphUnavailable:true};revisions.set('USDT',3);await update('USDT');const partial=await current();assert.equal(partial.modules.graph.status,'unavailable');assert.equal(await page.locator('.ar-evidence,[data-comparison-export]').count(),0,'A new partial capture clears old graph and imported comparisons');assert.deepEqual(await download('[data-research-previous]'),captured);options={};
 await page.click('[data-research-compare]');await page.locator('[data-research-comparison] [data-comparison-export]').waitFor();assert.equal((await download('[data-research-comparison] [data-comparison-export]')).graph.status,'unavailable');
 deferNext();await page.click('[data-research-refresh]');await started;await submit('BTC');release();await page.waitForLoadState('networkidle');assert.equal(await page.locator('[data-research-session]').getAttribute('data-research-session'),'BTC');assert.equal(await page.locator('[data-research-previous]').isHidden(),true);
 await page.goto(portal.origin+'/portal/?view=references');await page.fill('#auth-form [name=email]',credentials.email);await page.fill('#auth-form [name=password]',credentials.password);await page.click('#auth-submit');await page.locator('#workspace:visible').waitFor();await page.selectOption('#reference-form [name=asset]','USDT');await page.fill('#reference-form [name=reference]',researchFixture().reference);await page.click('#reference-form button');await loaded('USDT');await page.locator('#reference-results .list-row').waitFor();
 const retained=await page.locator('#reference-results').innerText(),beforeRetained=retainedReads.length;revisions.set('USDT',4);await update('USDT');assert.equal(retainedReads.length,beforeRetained);assert.equal(await page.locator('#reference-results').innerText(),retained);assert.ok(!/"red"|"blue"|"tenant_id"|"score_json"/.test(JSON.stringify(await current())));assert.match(await page.locator('.ar-actions a').first().getAttribute('href'),/\/space\/graph\//);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'private single refresh mobile');await page.setViewportSize({width:1440,height:1000});
 const mounted=await context.newPage();mounted.on('pageerror',e=>errors.push(e.message));await mounted.goto(portal.origin+'/space/?'+query('USDT'));await mounted.locator('[data-research-refresh]').waitFor();revisions.set('USDT',5);await mounted.click('[data-research-refresh]');await mounted.waitForFunction(()=>document.querySelector('[data-research-status]').textContent.startsWith('USDT updated'));assert.match(await mounted.locator('.ar-actions a').first().getAttribute('href'),/\/space\/graph\//);await mounted.close();
 deferNext();await page.click('[data-research-refresh]');await started;await page.click('#logout');await page.locator('#gate:visible').waitFor();release();await page.waitForLoadState('networkidle');assert.equal(await page.locator('[data-research-session],.address-research,#reference-results .list-row').count(),0,'Logout clears current, previous and pending captures');
 assert.deepEqual(errors,[]);
 if(process.argv.includes('--screenshots')){
  await mkdir(resolve(root,'.data'),{recursive:true});await page.goto(space+'/?'+query('USDT'));await loaded('USDT');revisions.set('USDT',6);await update('USDT');await page.click('[data-research-compare]');await page.locator('[data-research-comparison] [data-comparison-export]').waitFor();
  for(const [name,width,height]of [['desktop',1440,1000],['mobile',390,844]]){await page.setViewportSize({width,height});await page.locator('[data-research-session]').evaluate(node=>window.scrollTo({top:scrollY+node.getBoundingClientRect().top-document.querySelector('.space-header').getBoundingClientRect().height-16,behavior:'instant'}));await page.screenshot({caret:'initial',path:resolve(root,`.data/address-refresh-${name}.png`)});}
 }
 console.log(JSON.stringify({status:'passed',checks:['all five assets: one scoped update, exact previous/current exports and independent comparison hashes','current evidence and raw/ledger downloads stay usable during requests','identical captures preserve previous reports and comparison state','partial replacements clear superseded ledger, graph, raw and imported views','failed, rate-limited, mismatched and malformed updates preserve all prior state','offline failure keeps the dated report without source reads','new query, network changes and logout invalidate late updates','private retained observations stay independent; authenticated mounted Space works','keyboard controls, responsive desktop/mobile and functional CSP checks']}));
}catch(error){console.error({url:page.url(),errors,status:await page.locator('[data-research-status],#status').allTextContents()});throw error;}
finally{release?.();await context.setOffline(false);await browser.close();await portal.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));h.sqlite.close();}
