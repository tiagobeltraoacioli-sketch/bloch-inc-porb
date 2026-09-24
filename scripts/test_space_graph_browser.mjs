import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {emptyGraph,nodeId,validateGraph} from '../space/public/assets/graph-core.js';
const {chromium}=await import(process.env.SPACE_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.SPACE_TEST_URL||'http://127.0.0.1:8794',browser=await chromium.launch({headless:true,...(process.env.SPACE_CHROME_PATH?{executablePath:process.env.SPACE_CHROME_PATH}:{})});
const context=await browser.newContext({viewport:{width:1600,height:1100},serviceWorkers:'block'}),page=await context.newPage(),errors=[],blockedBeacons=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='error'&&/Content Security Policy|Refused to/.test(message.text())){if(message.text().includes("Refused to load the script 'https://static.cloudflareinsights.com/beacon.min.js/"))blockedBeacons.push(message.text());else errors.push(message.text());}});
page.on('response',async response=>{if(response.url().includes('/api/graph?')&&!response.headers()['content-type']?.includes('application/json')){try{await writeFile('/tmp/bloch-space-graph-review/gateway-failure.txt',`${response.status()} ${response.url()}\n${await response.text()}`);}catch{}}});
await mkdir('/tmp/bloch-space-graph-review',{recursive:true});
async function settled(){await page.waitForFunction(()=>document.querySelector('#cancel-load').hidden,{},{timeout:65000});return page.locator('#graph-status').textContent();}
async function layout(){await page.waitForFunction(()=>document.querySelector('#graph-canvas').dataset.layoutReady==='true',{},{timeout:30000});}
try{
  await page.goto(`${base}/graph/`);await settled();await layout();
  for(const asset of ['BLCH','BTC','ETH','USDT','USDC']){
    if(asset!=='BLCH'){await page.locator('#graph-asset').selectOption(asset);await page.locator('#load-recent').click();}
    const state=await settled();assert.match(state,/observation request.*loaded/,`${asset}: ${state}`);await layout();
    assert.ok(await page.locator('#edge-table tbody tr').count()>0,`${asset}: no edges`);assert.equal(await page.locator('.graph-chart').count(),9);
    assert.ok(!/NaN|undefined/.test(await page.locator('#graph-charts').innerText()),'invalid chart value');
    console.log(asset,state,await page.locator('#graph-metrics').innerText());
    await page.screenshot({path:`/tmp/bloch-space-graph-review/${asset.toLowerCase()}-desktop.png`,fullPage:true});
    if(asset==='BLCH'){
      await page.locator('#node-list button').first().click();await page.locator('[data-inspect="from"]').click();
      await page.locator('#node-list button').nth(1).click();await page.locator('[data-inspect="to"]').click();await page.locator('#find-path').click();assert.match(await page.locator('#path-results').innerText(),/path/i);
      await page.locator('#snapshot-graph').click();await page.locator('[data-inspect="expand"]').click();assert.match(await settled(),/loaded/);await page.locator('#compare-graph').click();assert.match(await page.locator('#comparison-status').textContent(),/added/);
      await page.locator('#filter-amount').fill('999999999999999');await page.locator('#apply-filters').click();await layout();assert.match(await page.locator('#canvas-count').textContent(),/^0 \/ /);
      await page.locator('#reset-filters').click();await layout();
      const downloading=page.waitForEvent('download');await page.locator('[data-export=json]').click();const downloaded=await downloading;const path=await downloaded.path();const payload=JSON.parse(await readFile(path,'utf8'));assert.ok(validateGraph(payload).edges.length>0);
      await page.locator('#graph-import').setInputFiles(path);await page.waitForFunction(()=>document.querySelector('#workspace-scope').textContent.includes('UNVERIFIED LOCAL'));assert.equal(await page.locator('#load-recent').isDisabled(),true);await layout();
      await page.locator('#undo-graph').click();await layout();assert.equal(await page.locator('#load-recent').isDisabled(),false);
    }
  }
  for(const name of ['radial','timeline','force']){await page.locator('#graph-layout').selectOption(name);await layout();}
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/bloch-space-graph-review/mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile overflow');
  await page.setViewportSize({width:1600,height:1100});
  const graph=emptyGraph('ethereum','ETH'),ref=n=>'0x'+n.toString(16).padStart(40,'0'),tx=n=>'0x'+n.toString(16).padStart(64,'0');
  graph.nodes=Array.from({length:5000},(_,i)=>({id:nodeId('ethereum','address',ref(i+1)),kind:'address',reference:ref(i+1)}));
  graph.observations=[{id:'load-test',source:'SYNTHETIC TEST FIXTURE — NOT PUBLIC CHAIN DATA',scope:'Browser capacity verification only',at:new Date().toISOString()}];
  graph.edges=Array.from({length:12000},(_,i)=>({id:`test-${i}`,from:graph.nodes[i%5000].id,to:graph.nodes[(i*7+1)%5000].id,kind:'native_value',amount:'100',txid:tx(i+1),sources:['load-test'],block:{height:i+1,hash:tx(i+50000),index:0,log:null},finality:'synthetic-test-only'}));
  const start=Date.now();await page.locator('#graph-import').setInputFiles({name:'capacity-test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(graph))});
  await page.waitForFunction(()=>document.querySelector('#canvas-count').textContent.includes('5,000 / 5,000'));await layout();
  await page.locator('#node-search').fill('0000001388');assert.equal(await page.locator('#node-list button').count(),1);
  await page.locator('#node-list button').click();await page.locator('#zoom-in').click();await page.locator('#fit-graph').click();
  assert.equal(await page.locator('#load-recent').isDisabled(),true);console.log(`Capacity: 5,000 nodes / 12,000 edges rendered and analyzed in ${Date.now()-start} ms; reference search remains usable.`);
  await page.screenshot({path:'/tmp/bloch-space-graph-review/capacity-test.png'});
  assert.deepEqual(errors,[]);console.log('Five live sources, expansion, paths, filtering, import/export, layouts, mobile and capacity passed; zero application JS/CSP errors.');
  if(blockedBeacons.length)console.log(`${blockedBeacons.length} infrastructure-injected Cloudflare analytics beacon(s) blocked by the existing self-only script policy. The policy was not relaxed.`);
  const offlineContext=await browser.newContext(),offline=await offlineContext.newPage();await offline.goto(`${base}/graph/`);await offline.evaluate(()=>navigator.serviceWorker.ready);await offline.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await offlineContext.setOffline(true);await offline.reload();await offline.locator('#graph-stage').waitFor();await offline.locator('#connectivity').waitFor({state:'visible'});
  const cached=await offline.evaluate(async()=>{const all=[];for(const name of await caches.keys()){const c=await caches.open(name);all.push(...(await c.keys()).map(r=>new URL(r.url).pathname));}return all;});assert.ok(cached.includes('/graph/'));assert.ok(!cached.some(p=>p.startsWith('/api/')));console.log('Graph Lab offline shell passed without cached API data.');
}finally{await browser.close();}
