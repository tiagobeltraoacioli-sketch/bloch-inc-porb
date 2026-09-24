import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {sample} from '../tests/system_map_fixture.mjs';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),live=process.env.GRAPHUS_MAP_ORIGIN;
if(live)assert.equal(live,'https://bloch-graphus.xyz');
const assets=(process.env.GRAPHUS_MAP_ASSETS||(live?'BTC,ETH,BLCH':'BTC,ETH,BLCH,USDT,USDC')).split(',');
assert.ok(assets.length&&assets.every(asset=>['BTC','ETH','BLCH','USDT','USDC'].includes(asset)));
let server;
if(!live){const root=resolve(new URL('../graphus/',import.meta.url).pathname);server=createServer(async(req,res)=>{try{let path=new URL(req.url,'http://localhost').pathname;if(path==='/map')path='/map.html';path=resolve(root,'.'+path);if(!path.startsWith(root+'/'))throw new Error('Invalid path');res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(path)]||'text/plain');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'");res.end(await readFile(path));}catch{res.writeHead(404);res.end('Not found');}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));}
const browser=await webkit.launch(),page=await browser.newPage({viewport:{width:1280,height:900}}),origin=live||`http://127.0.0.1:${server.address().port}`,errors=[],requests=[];
page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/chain/'))requests.push(request.url());});
const fixture=url=>{const q=new URL(url).searchParams,asset=q.get('asset'),cursor=q.get('cursor');return sample(asset,cursor===null?0:asset==='BLCH'?Number(cursor.split('-').at(-1)):100-Number(cursor));};
const idle=()=>page.waitForFunction(()=>!document.querySelector('#capture-button').disabled,{},{timeout:75000});
const action=name=>page.getByRole('button',{name,exact:true});
async function exported(locator){const waiting=page.waitForEvent('download');await locator.click();return JSON.parse(await readFile(await(await waiting).path(),'utf8'));}
async function select(id){await page.click('#show-directory');await page.locator(`#map-results [data-module="${id}"]`).click();}
async function closeDetails(){if(await page.locator('#map-details-dialog').evaluate(e=>e.open)){await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#map-details-dialog').open);}}
try{
  await mkdir(new URL('../.data/system-observation/',import.meta.url),{recursive:true});
  if(!live)await page.route('**/api/chain/network?*',route=>route.fulfill({json:fixture(route.request().url())}));
  for(const [index,asset]of assets.entries()){
    const initial=requests.length;await page.goto(origin+`/map?asset=${asset}&module=events#system`);
    assert.equal(await page.locator('#observation-status').innerText(),'Not captured');assert.match(await page.locator('#module-observation').innerText(),/No source page/);assert.equal(requests.length,initial,'Opening the map must not request source data');
    await action(`Capture ${asset} evidence`).click();await idle();
    if(live&&!await page.locator('#capture-result').isVisible()){await page.click('#capture-button');await idle();}
    assert.equal(await page.locator('#capture-result').isVisible(),true,await page.locator('#capture-status').innerText());
    const packet=await exported(page.locator('#capture-export')),before=requests.length;
    assert.equal(await page.locator('#observation-status').innerText(),'Captured');assert.match(await page.locator('#observation-title').innerText(),new RegExp(`^${asset} · ${packet.diagnostics.records.toLocaleString()} records`));
    await select('events');await page.locator('#module-observation summary').click();assert.ok((await page.locator('#module-observation').innerText()).includes(packet.dataset_sha256));assert.ok((await page.locator('#observation-source').innerText()).includes(packet.dataset.source));
    assert.equal(await page.locator('#graphus-map [data-module=events] .sample-indicator').count(),1);assert.equal(await page.locator('#graphus-map [data-module=ml] .sample-indicator').count(),0);
    await page.fill('#capture-search','no matching reference');assert.equal(await page.locator('#capture-ledger tr').count(),0);
    assert.deepEqual(await exported(action('Export captured JSON')),packet,'Inspector exports the full committed sample regardless of ledger filters');
    await select('ml');assert.equal(await page.locator('#module-observation').count(),0);await select('events');
    const other=asset==='BTC'?'ETH':'BTC';await page.selectOption('#asset-filter',other);assert.equal(await page.locator('.sample-indicator').count(),0);assert.match(await page.locator('#module-observation').innerText(),/does not apply/);await page.selectOption('#asset-filter',asset);
    assert.equal(requests.length,before,'Selection, filters and exports must not request more source data');
    if(index===assets.length-1){
      await page.locator('#node-inspector').screenshot({path:new URL(`../.data/system-observation/${live?'live':'local'}-inspector.png`,import.meta.url).pathname});
      await page.setViewportSize({width:390,height:900});await page.click('#show-details');await page.screenshot({path:new URL(`../.data/system-observation/${live?'live':'local'}-mobile.png`,import.meta.url).pathname});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(await exported(action('Export captured JSON')),packet);await closeDetails();await page.setViewportSize({width:1280,height:900});await page.click('#show-details');
    }
    if(index%2===0){await action('Graph captured sample').click();await page.waitForURL('**/constellation*');await page.waitForFunction(digest=>document.querySelector('#network-explorer')?.dataset.digest===digest,packet.dataset_sha256);assert.deepEqual(await exported(page.locator('#net-export')),packet);assert.equal(await page.evaluate(()=>sessionStorage.getItem('graphus.constellation.evidence.v1')),null);}
    else{await action('Analyze captured sample').click();await page.waitForURL('**/analytics*');await page.waitForFunction(()=>document.querySelector('#lab-badge')?.textContent.includes('REAL NETWORK COLLECTION'));assert.equal(await page.evaluate(()=>sessionStorage.getItem('graphus.analytics.network.v1')),null);}
    assert.equal(requests.length,before,'The destination must use the captured records without another source query');
    console.log(JSON.stringify({mode:live?'production':'fixture',asset,records:packet.diagnostics.records,references:packet.diagnostics.references,digest:packet.dataset_sha256,handoff:index%2===0?'graph':'analytics',extra_source_queries:0}));
  }
  if(!live){
    await page.goto(origin+'/map?asset=ETH&module=events#system');await page.unroute('**/api/chain/network?*');await page.route('**/api/chain/network?*',route=>route.fulfill(new URL(route.request().url()).searchParams.has('cursor')?{status:503,json:{error:'test-only continuation failure'}}:{json:fixture(route.request().url())}));
    await page.selectOption('#capture-pages','2');await action('Capture ETH evidence').click();await idle();assert.equal(await page.locator('#observation-status').innerText(),'Source request failed');assert.match(await page.locator('#observation-message').innerText(),/503.*1 completed/);const retained=await exported(page.locator('#capture-export'));
    await select('events');assert.deepEqual(await exported(action('Export captured JSON')),retained);assert.equal(await action('Load earlier sample pages').isEnabled(),true);
    await page.unroute('**/api/chain/network?*');await page.route('**/api/chain/network?*',route=>route.fulfill({json:fixture(route.request().url())}));await page.selectOption('#capture-pages','1');await action('Load earlier sample pages').click();await idle();assert.equal(await page.locator('#observation-status').innerText(),'Captured');const extended=await exported(page.locator('#capture-export'));assert.equal(extended.diagnostics.records,50);assert.notEqual(extended.dataset_sha256,retained.dataset_sha256);
    await page.unroute('**/api/chain/network?*');await page.route('**/api/chain/network?*',async route=>{await new Promise(resolve=>setTimeout(resolve,600));await route.fulfill({json:fixture(route.request().url())}).catch(()=>{});});
    await select('events');const pending=page.waitForRequest(request=>new URL(request.url()).searchParams.has('cursor'));await action('Load earlier sample pages').click();await pending;await page.click('#capture-cancel');assert.equal(await page.locator('#observation-status').innerText(),'Capture canceled');await page.waitForTimeout(700);assert.deepEqual(await exported(page.locator('#capture-export')),extended);
    await page.evaluate(()=>{window.restoreStorage=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new Error('test-only storage failure');};});
    const beforeStorage=requests.length;
    for(const name of ['Graph captured sample','Analyze captured sample']){await select('events');await action(name).click();assert.match(await page.locator('#capture-status').innerText(),/Browser handoff unavailable/);assert.deepEqual(await exported(page.locator('#capture-export')),extended);}
    assert.equal(requests.length,beforeStorage);await page.evaluate(()=>{Storage.prototype.setItem=window.restoreStorage;delete window.restoreStorage;});
    const next=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/chain/network');await page.click('#capture-button');await next;await page.selectOption('#capture-asset','BLCH');await page.waitForTimeout(700);assert.equal(await page.locator('#observation-status').innerText(),'Not captured');assert.equal(await page.locator('.sample-indicator').count(),0);assert.equal(await page.locator('#capture-result').isVisible(),false);
    await page.click('#capture-clear');assert.match(await page.locator('#observation-message').innerText(),/Workspace cleared/);
  }
  assert.deepEqual(errors,[]);console.log('Observation panel passed: provenance, exact full-sample handoffs, asset isolation, private-module boundaries, no implicit source reads and responsive inspection.'+(live?'':' Partial failures, continuation, cancellation and asset-switch races also passed.'));
}finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
