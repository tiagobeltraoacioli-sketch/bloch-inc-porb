import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {setup,credentials} from '../tests/porb_helpers.mjs';
import {portalBrowserServer} from '../tests/portal_browser_server.js';
import {researchReport,researchFixture,RESEARCH_AMOUNT} from '../tests/address_research_fixture.js';
import {spaceDataFixture} from '../tests/space_portal_fixture.js';
import {researchHash} from '../space/public/assets/address-research-core.js';
import {verifyResearchBundle} from '../space/public/assets/address-research-bundle.js';
import {createAddressEvidence} from '../space/public/assets/address-evidence.js';
import {indexStatements} from '../portal/intelligence.js';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||process.argv[2]||'playwright');
const h=await setup(),cookie=await h.login(),reference=researchFixture('ETH').reference,assets=['ETH','USDT','USDC'];
for(const asset of assets){
  const response=await h.call('/v1/analyses','POST',{asset,pages:1},cookie);assert.equal(response.status,201);const original=await response.json();
  // Local synthetic retained pages exercise independent cursors without more source collection.
  for(let i=1;i<(asset==='USDT'?11:asset==='USDC'?12:1);i++){
    const value={...original,id:crypto.randomUUID(),created_at:original.created_at+i},summary={...JSON.parse(h.sqlite.prepare('SELECT summary_json FROM analyses WHERE id=?').get(original.id).summary_json),id:value.id,created_at:value.created_at};
    h.sqlite.prepare('INSERT INTO analyses(id,tenant_id,created_by,asset,model_version,digest,summary_json,result_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(value.id,h.tenant,h.owner,asset,value.model_version,value.digest,JSON.stringify(summary),'{}',value.created_at);
    h.sqlite.prepare('INSERT INTO analysis_parts(analysis_id,part,payload) VALUES(?,0,?)').run(value.id,JSON.stringify(value));await h.db.batch(indexStatements(h.db,value,h.tenant));
  }
}
const root=resolve(new URL('../',import.meta.url).pathname),errors=[],reads=[],retainedReads=[];
let failed=new Set(),graphUnavailable=new Set(),retainedFailure=null,delayAsset=null,release,started,arrived,delayRetained=null,releaseRetained,retainedStarted,retainedArrived;
function deferAsset(asset){delayAsset=asset;started=new Promise(resolve=>{arrived=resolve;});}
async function source(url,init){
  const u=new URL(url),asset=u.searchParams.get('asset');assert.equal(u.pathname,'/api/research');assert.ok(assets.includes(asset));assert.equal(init?.headers?.cookie,undefined);assert.equal(init?.headers?.authorization,undefined);reads.push({asset,reference:u.searchParams.get('query')});
  if(failed.has(asset))return Response.json({error:'source_unavailable'},{status:503});
  const value=await researchReport(asset,{reference:u.searchParams.get('query'),graphUnavailable:graphUnavailable.has(asset)}),{report_sha256,...body}=value.body;
  body.modules.ledger.data.wallet.balance.base_units={ETH:'1000000000000000000',USDT:RESEARCH_AMOUNT,USDC:'123450000'}[asset];
  const report={...body,report_sha256:await researchHash(body)};
  if(delayAsset===asset){delayAsset=null;arrived();await new Promise(resolve=>{release=resolve;});}
  return Response.json(report,{status:200});
}
const portal=await portalBrowserServer(h,{fetcher:source,after:async(response,request)=>{
  const u=new URL(request.url);if(u.pathname==='/api/porb/v1/references'){
    const asset=u.searchParams.get('asset');retainedReads.push({asset,cursor:u.searchParams.get('cursor')});
    if(delayRetained===asset){delayRetained=null;retainedArrived();await new Promise(resolve=>{releaseRetained=resolve;});}
    if(retainedFailure===asset)return Response.json({error:'fixture_retained_unavailable'},{status:503});
  }return response;
}});
const headers=Object.fromEntries((await readFile(resolve(root,'space/public/_headers'),'utf8')).split('\n\n')[0].split('\n').slice(1).filter(Boolean).map(line=>{const i=line.indexOf(':');return [line.slice(0,i).trim(),line.slice(i+1).trim()];}));
const server=createServer(async(req,res)=>{try{const u=new URL(req.url,'https://bloch.space');let response;if(u.pathname==='/api/research')response=await source(u.href);else if(u.pathname==='/api/overview')response=Response.json(spaceDataFixture(u.searchParams.get('network')));else{const path=decodeURIComponent(u.pathname),file=resolve(root,'space/public','.'+path+(path.endsWith('/')?'index.html':''));assert.ok(file.startsWith(resolve(root,'space/public')+'/'));response=new Response(await readFile(file),{headers:{...headers,'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream'}});}res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(error){res.writeHead(404);res.end(error.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const space=`http://127.0.0.1:${server.address().port}`;
const browser=await webkit.launch(),context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/.test(m.text()))errors.push(m.text());});
const submit=async(asset='ETH_ALL',ref=reference)=>{await page.selectOption('#public-address-form [name=asset]',asset);await page.fill('#public-address-form [name=query]',ref);await page.click('#public-address-form button');};
const loaded=async()=>page.locator('.address-research-bundle').waitFor();
const download=async selector=>{const pending=page.waitForEvent('download');await page.click(selector);return readFile(await(await pending).path(),'utf8');};
try{
  await page.goto(portal.origin+'/explore/');await submit();await loaded();assert.equal(reads.length,3);assert.deepEqual(reads.map(r=>r.asset).sort(),assets.slice().sort());assert.equal(new URL(page.url()).searchParams.get('asset'),'ETH_ALL');
  const bundle=await verifyResearchBundle(JSON.parse(await download('[data-bundle-export]'))),capturedReads=reads.length;assert.ok(!/"red"|"blue"|"tenant_id"|"score_json"/.test(JSON.stringify(bundle)));
  assert.match(await page.locator('[data-bundle-panel=ETH]').innerText(),/1 ETH/);assert.match(await page.locator('[data-bundle-panel=ETH]').innerText(),/Native ETH address history requires an index/);
  await page.locator('[data-bundle-asset=ETH]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('[data-bundle-asset=USDT]').getAttribute('aria-selected'),'true');
  assert.match(await page.locator('[data-bundle-panel=USDT] .ar-exact').innerText(),new RegExp(RESEARCH_AMOUNT));await page.click('[data-bundle-panel=USDT] [data-ae=toggle]');
  const model=createAddressEvidence(bundle.results[1].report);assert.equal(await download('[data-bundle-panel=USDT] [data-ae=csv]'),model.csv());await page.fill('[data-bundle-panel=USDT] [data-ae=minimum]',RESEARCH_AMOUNT);
  await page.click('[data-bundle-asset=USDC]');assert.match(await page.locator('[data-bundle-panel=USDC] .ar-exact').innerText(),/123450000/);assert.equal(await page.locator('[data-bundle-panel=USDC] [data-ae=minimum]').inputValue(),'0');
  await page.click('[data-bundle-asset=USDT]');assert.equal(await page.locator('[data-bundle-panel=USDT] [data-ae=minimum]').inputValue(),RESEARCH_AMOUNT);assert.deepEqual(JSON.parse(await download('[data-bundle-panel=USDT] [data-research-export]')),bundle.results[1].report);assert.deepEqual(JSON.parse(await download('[data-bundle-export]')),bundle);assert.equal(reads.length,capturedReads);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'bundle public mobile');await page.setViewportSize({width:1440,height:1000});
  failed=new Set(['USDT']);await submit();await loaded();await page.click('[data-bundle-asset=USDT]');assert.match(await page.locator('[data-bundle-panel=USDT]').innerText(),/report unavailable/);assert.equal(await page.locator('[data-bundle-panel=USDT] .address-research').count(),0);assert.equal((await verifyResearchBundle(JSON.parse(await download('[data-bundle-export]')))).results[2].status,'available');
  failed=new Set(assets);await submit();await loaded();assert.equal(await page.locator('.address-research').count(),0);assert.ok((await verifyResearchBundle(JSON.parse(await download('[data-bundle-export]')))).results.every(r=>r.status==='unavailable'));failed.clear();
  graphUnavailable=new Set(['USDT']);await submit();await loaded();await page.click('[data-bundle-asset=USDT]');assert.match(await page.locator('[data-bundle-panel=USDT]').innerText(),/graph source could not return/);assert.equal(await page.locator('[data-bundle-panel=USDT] .ar-evidence').count(),0);graphUnavailable.clear();
  deferAsset('USDC');await submit();await started;const second='0x'+'a'.repeat(40);await submit('USDT',second);await page.locator(`.address-research[data-reference="${second}"]`).waitFor();release();assert.equal(await page.locator('.address-research-bundle').count(),0);
  const query=new URLSearchParams({network:'ethereum',kind:'address',asset:'ETH_ALL',query:reference});await page.goto(space+'/?'+query);await loaded();await page.click('[data-bundle-asset=USDC]');assert.equal((await verifyResearchBundle(JSON.parse(await download('[data-bundle-export]')))).scope.reference,reference);await page.reload();await loaded();assert.equal(await page.locator('#search-asset').inputValue(),'ETH_ALL');
  deferAsset('USDC');await page.click('#search-form button');await started;await page.click('[data-network=bitcoin]');release();assert.equal(await page.locator('.address-research-bundle').count(),0);assert.equal(await page.locator('#result-section').isHidden(),true);
  await page.goto(portal.origin+'/portal/?view=references&asset=ETH_ALL&reference='+reference);await page.fill('#auth-form [name=email]',credentials.email);await page.fill('#auth-form [name=password]',credentials.password);await page.click('#auth-submit');await page.locator('#workspace:visible').waitFor();assert.equal(await page.locator('#reference-form [name=asset]').inputValue(),'ETH_ALL');await page.click('#reference-form button');await loaded();await page.waitForFunction(()=>!document.querySelector('#reference-form button').disabled);
  for(const [asset,count]of [['ETH',1],['USDT',10],['USDC',10]])assert.equal(await page.locator(`[data-reference-asset=${asset}] .list-row`).count(),count);
  assert.match(await page.locator('#reference-results').innerText(),/Red .*Blue/);assert.ok(!/"red"|"blue"|"tenant_id"/.test(await download('[data-bundle-export]')));
  const beforeMore=retainedReads.length,publicBeforeMore=reads.length;await page.click('#reference-more');await page.waitForFunction(()=>document.querySelector('#reference-more').hidden);assert.equal(reads.length,publicBeforeMore);assert.deepEqual(retainedReads.slice(beforeMore).map(r=>r.asset).sort(),['USDC','USDT']);assert.ok(retainedReads.slice(beforeMore).every(r=>r.cursor));assert.equal(await page.locator('[data-reference-asset=USDT] .list-row').count(),11);assert.equal(await page.locator('[data-reference-asset=USDC] .list-row').count(),12);
  retainedFailure='USDC';await page.click('#reference-form button');await loaded();await page.waitForFunction(()=>!document.querySelector('#reference-form button').disabled);assert.match(await page.locator('[data-reference-asset=USDC]').innerText(),/unavailable/);assert.equal(await page.locator('[data-reference-asset=USDT] .list-row').count(),10);retainedFailure=null;
  await page.click('[data-bundle-asset=USDT]');assert.match(await page.locator('[data-bundle-panel=USDT] .ar-actions a').first().getAttribute('href'),/\/space\/graph\//);await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'private bundle mobile');await page.setViewportSize({width:1440,height:1000});
  const mounted=await context.newPage();mounted.on('pageerror',e=>errors.push(e.message));await mounted.goto(portal.origin+'/space/?'+query);await mounted.locator('.address-research-bundle').waitFor();await mounted.click('[data-bundle-asset=USDT]');assert.match(await mounted.locator('[data-bundle-panel=USDT] .ar-actions a').first().getAttribute('href'),/\/space\/graph\//);await mounted.close();
  await page.fill('#reference-form [name=reference]','invalid');await page.click('#reference-form button');await page.waitForFunction(()=>!document.querySelector('#reference-form button').disabled);assert.equal(await page.locator('.address-research-bundle,#reference-results .list-row').count(),0);assert.match(await page.locator('#status').innerText(),/invalid_address/);await page.fill('#reference-form [name=reference]',reference);
  delayRetained='USDC';retainedStarted=new Promise(resolve=>{retainedArrived=resolve;});await page.click('#reference-form button');await retainedStarted;await page.click('#logout');await page.locator('#gate:visible').waitFor();releaseRetained();await page.waitForFunction(()=>!document.querySelector('#reference-form button').disabled);assert.equal(await page.locator('.address-research-bundle,.address-research,#reference-results .list-row').count(),0);
  assert.deepEqual(errors,[]);
  if(process.argv.includes('--screenshots')){await mkdir(resolve(root,'.data'),{recursive:true});await page.goto(portal.origin+'/explore/');await submit();await loaded();await page.screenshot({caret:'initial',path:resolve(root,'.data/address-bundle-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({caret:'initial',path:resolve(root,'.data/address-bundle-mobile.png'),fullPage:true});}
  console.log(JSON.stringify({status:'passed',checks:['three actual asset requests for one normalized Ethereum reference','independent balances, graphs, models and verified full bundle/child exports','keyboard tabs preserve local evidence filters without more reads','partial and total failures preserve availability semantics','late public bundle cannot replace a newer single query','Space URL reload and network cancellation','authenticated retained pagination stays per asset','retained failure does not hide independent public reports','mounted Space uses authenticated gateways','logout clears completed and pending public/private views','mobile and CSP']}));
}catch(error){console.error({errors,url:page.url(),status:await page.locator('#public-address-status,#message,#status').allTextContents()});throw error;}
finally{release?.();releaseRetained?.();await browser.close();await portal.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));h.sqlite.close();}
