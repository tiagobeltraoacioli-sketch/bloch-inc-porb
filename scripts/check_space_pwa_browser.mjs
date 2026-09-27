import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {researchReport,researchFixture} from '../tests/address_research_fixture.js';
import {spaceDataFixture} from '../tests/space_portal_fixture.js';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||process.argv[2]||'playwright');
const root=resolve(new URL('../space/public/',import.meta.url).pathname),errors=[],held=[];
let version=1,reads=0,hold=true;
const headers=Object.fromEntries((await readFile(resolve(root,'_headers'),'utf8')).split('\n\n')[0].split('\n').slice(1).filter(Boolean).map(line=>{const i=line.indexOf(':');return [line.slice(0,i).trim(),line.slice(i+1).trim()];}));
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');let response;
  if(url.pathname==='/api/research'){
    reads++;const report=await researchReport(url.searchParams.get('asset'),{reference:url.searchParams.get('query')});
    if(hold)await new Promise(resolve=>held.push(resolve));response=Response.json(report.body,{status:report.status,headers:{'cache-control':'no-store'}});
  }else if(url.pathname==='/api/overview')response=Response.json(spaceDataFixture(url.searchParams.get('network')));
  else{
    const file=resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));assert.ok(file.startsWith(root+'/'));let body=await readFile(file);
    if(url.pathname==='/sw.js'&&version===2)body=Buffer.from(body.toString().replace('bloch-space-shell-v6','bloch-space-shell-v6-test-update'));
    response=new Response(body,{headers:{...headers,'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'})[extname(file)]||'application/octet-stream','cache-control':'no-cache',...(url.pathname==='/sw.js'?{'service-worker-allowed':'/'}:{})}});
  }
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}catch(error){res.writeHead(404);res.end(error.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await webkit.launch(),context=await browser.newContext(),page=await context.newPage();let navigations=0;
page.on('pageerror',error=>errors.push(error.message));page.on('load',()=>{navigations++;});
try{
  await page.goto(origin+'/?'+new URLSearchParams({network:'ethereum',asset:'ETH_ALL',kind:'address',query:researchFixture('ETH').reference}));
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  assert.equal(navigations,1,'Initial service worker claim must not reload a pending address query');
  await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Looking up'));
  assert.equal(reads,3,'Only the three original asset requests should be in progress');
  hold=false;for(const release of held.splice(0))release();await page.locator('.address-research-bundle').waitFor();assert.equal(reads,3);
  version=2;await page.evaluate(async()=>{const registration=await navigator.serviceWorker.ready;await registration.update();});
  await page.locator('.pwa-toast').filter({hasText:'new version'}).waitFor();assert.equal(navigations,1,'An available update waits for the user action');
  const reloaded=page.waitForEvent('load');await page.locator('.pwa-toast button').click();await reloaded;await page.locator('.address-research-bundle').waitFor();
  assert.equal(navigations,2,'An accepted controller replacement reloads exactly once');assert.equal(reads,6,'Accepted update starts one replacement capture');assert.equal(new URL(page.url()).searchParams.get('asset'),'ETH_ALL');
  const cached=await page.evaluate(async()=>{const keys=await caches.keys(),urls=[];for(const key of keys)for(const request of await(await caches.open(key)).keys())urls.push(new URL(request.url).pathname);return {keys,urls};});
  assert.deepEqual(cached.keys,['bloch-space-shell-v6-test-update']);assert.ok(cached.urls.length>10);assert.ok(!cached.urls.some(url=>url.startsWith('/api/')),'No API or private observation may enter the offline shell cache');
  await context.setOffline(true);const response=await page.evaluate(async()=>{try{const response=await fetch('/api/research?network=ethereum&asset=ETH&query=0x'+'1'.repeat(40));return {status:response.status,body:await response.json()};}catch{return {status:null};}});
  // WebKit offline emulation may reject before dispatching a worker fetch event.
  // Neither a network rejection nor the worker's 503 may substitute cached data.
  if(response.status!==null){assert.equal(response.status,503);assert.equal(response.body.error,'offline_source_unavailable');}
  const download=async()=>{const pending=page.waitForEvent('download');await page.click('[data-bundle-export]');return readFile(await(await pending).path(),'utf8');},beforeUpdate=await download();
  await page.click('[data-bundle-asset=USDT]');await page.click('[data-bundle-refresh=USDT]');await page.waitForFunction(()=>document.querySelector('[data-bundle-status]')?.textContent.startsWith('USDT update unavailable'));
  assert.match(await page.locator('[data-bundle-status]').innerText(),/Still showing the capture/);assert.equal(await download(),beforeUpdate,'Offline update preserves the exact dated bundle in memory');assert.equal(reads,6);assert.equal(await page.locator('[data-bundle-previous]').isVisible(),false);
  await page.click('#search-form button');await page.waitForFunction(()=>document.querySelector('.address-research-bundle')?.textContent.includes('0 of 3 asset reports available'));assert.equal(await page.locator('.address-research').count(),0);assert.equal(reads,6,'Offline failure must not substitute a cached report');
  await context.setOffline(false);await page.goto(origin+'/?'+new URLSearchParams({network:'ethereum',asset:'USDT',kind:'address',query:researchFixture('USDT').reference}));await page.locator('[data-research-export]').waitFor();
  const singleDownload=async()=>{const pending=page.waitForEvent('download');await page.click('[data-research-export]');return readFile(await(await pending).path(),'utf8');},beforeSingle=await singleDownload(),singleReads=reads;
  await context.setOffline(true);await page.click('[data-research-refresh]');await page.waitForFunction(()=>document.querySelector('[data-research-status]')?.textContent.startsWith('USDT update unavailable'));assert.equal(await singleDownload(),beforeSingle);assert.equal(reads,singleReads);assert.equal(await page.locator('[data-research-previous]').isHidden(),true);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',offline_transport:response.status===503?'worker-503':'network-rejection',checks:['initial worker activation preserves three pending asset queries','available update waits for user action','accepted worker replacement reloads once with the same query','old shell cache removed','source and private APIs never cached','offline asset update retains the exact dated bundle with a failure notice','offline new lookup clears prior reports and shows explicit source unavailability','offline single-asset update preserves its exact dated report without creating history']}));
}finally{hold=false;for(const release of held.splice(0))release();await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
