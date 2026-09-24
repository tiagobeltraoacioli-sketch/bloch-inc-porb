import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {sample} from '../tests/system_map_fixture.mjs';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const live=process.env.GRAPHUS_MAP_ORIGIN;
if(live)assert.equal(live,'https://bloch-graphus.xyz');
let server;
if(!live){
  const root=resolve(new URL('../graphus/',import.meta.url).pathname);
  server=createServer(async(req,res)=>{try{let pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/map')pathname='/map.html';const path=resolve(root,'.'+pathname);if(!path.startsWith(root+'/'))throw new Error('Invalid path');res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(path)]||'text/plain');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'");res.end(await readFile(path));}catch{res.writeHead(404);res.end('Not found');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
}
const browser=await webkit.launch(),page=await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true}),origin=live||`http://127.0.0.1:${server.address().port}`,errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  if(!live)await page.route('**/api/chain/network?*',route=>route.fulfill({json:sample(new URL(route.request().url()).searchParams.get('asset'))}));
  await page.goto(origin+'/map?category=aml&module=aml-evidence');await page.waitForSelector('#node-inspector h3');
  assert.equal(await page.locator('#node-inspector h3').innerText(),'AML evidence preparation');assert.ok((await page.locator('#map-result-count').innerText()).endsWith('/ 44 modules'));
  await page.click('#show-directory');await page.click('#clear-filters');await page.selectOption('#category-filter','access');await page.fill('#node-search','API keys');await page.locator('#map-results button').first().click();
  assert.equal(await page.locator('#node-inspector a[href*="view=access"]').count(),1);
  await page.fill('#node-search','<img src=x onerror=alert(1)>');assert.equal(await page.locator('#map-results button').count(),0);assert.equal(await page.locator('#map-results img').count(),0);
  await page.click('#clear-filters');await page.click('#show-map');await page.locator('#graphus-map [data-module=quality]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#node-inspector h3').innerText(),'Coverage diagnostics');
  await page.locator('#graphus-map .map-connection').first().focus();await page.keyboard.press('Enter');assert.match(await page.locator('#node-inspector').innerText(),/CONNECTION CONTRACT/);
  const initial=await page.locator('#graphus-map').getAttribute('viewBox');await page.click('#zoom-in');assert.notEqual(await page.locator('#graphus-map').getAttribute('viewBox'),initial);await page.click('#zoom-reset');
  await mkdir(new URL('../.data/system-map/',import.meta.url),{recursive:true});
  let last;
  for(const asset of live?['BTC','ETH','BLCH','USDT','USDC']:['ETH','BLCH']){
    await page.selectOption('#capture-asset',asset);
    // A failed real public request remains explicit; retry the same read once.
    for(let attempt=0;attempt<2;attempt++){
      await page.click('#capture-button');await page.waitForFunction(()=>!document.querySelector('#capture-button').disabled,{},{timeout:75000});
      if(await page.locator('#capture-result').isVisible())break;
      if(attempt===1)assert.fail(await page.locator('#capture-status').innerText());
    }
    assert.match(await page.locator('#capture-status').innerText(),/Captured/);
    const download=page.waitForEvent('download');await page.click('#capture-export');last=JSON.parse(await readFile(await(await download).path(),'utf8'));
    assert.equal(last.dataset.asset,asset);assert.equal(last.aml_score_included,false);assert.ok(last.dataset.edges.every(e=>typeof e.amount_base_units==='string'));assert.match(last.dataset_sha256,/^[a-f0-9]{64}$/);
    if(!live){assert.equal(last.dataset.edges[0].amount_base_units,'9007199254740993123456789');assert.equal(last.diagnostics.records_without_timestamp,asset==='BLCH'?25:0);}
    if(last.dataset.edges.length>20){await page.click('#capture-next');assert.match(await page.locator('#capture-page').innerText(),/Page 2/);}
    await page.fill('#capture-search','unknown-reference-no-match');assert.equal(await page.locator('#capture-ledger tr').count(),0);await page.fill('#capture-search',last.dataset.edges[0].txid);assert.ok(await page.locator('#capture-ledger tr').count()>0);await page.fill('#capture-search','');
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,asset+' mobile overflow');await page.setViewportSize({width:1440,height:1000});
    console.log(JSON.stringify({mode:live?'real source':'test fixture',asset,records:last.diagnostics.records,references:last.diagnostics.references,missing_timestamps:last.diagnostics.records_without_timestamp}));
  }
  await page.screenshot({path:new URL('../.data/system-map/'+(live?'live':'local')+'-desktop.png',import.meta.url).pathname,fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.click('#show-directory');await page.screenshot({path:new URL('../.data/system-map/'+(live?'live':'local')+'-mobile.png',import.meta.url).pathname,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.click('#capture-analytics');await page.waitForURL('**/analytics*');await page.waitForFunction(()=>document.querySelector('#lab-badge')?.textContent.includes('REAL NETWORK COLLECTION'));assert.equal(await page.evaluate(()=>sessionStorage.getItem('graphus.analytics.network.v1')),null);
  await page.goto(origin+'/map?category=access&module=api-keys');assert.equal(await page.locator('#node-inspector a[href*="view=access"]').count(),1);
  if(!live){
    await page.route('**/api/chain/network?*',route=>route.fulfill({status:503,json:{error:'test-only failure'}}));await page.click('#capture-button');await page.waitForFunction(()=>!document.querySelector('#capture-button').disabled);assert.match(await page.locator('#capture-status').innerText(),/503/);assert.equal(await page.locator('#capture-result').isVisible(),false);
    await page.unroute('**/api/chain/network?*');await page.route('**/api/chain/network?*',async route=>{await new Promise(resolve=>setTimeout(resolve,300));await route.fulfill({json:sample('BTC')}).catch(()=>{});});
    await page.click('#capture-button');await page.click('#capture-cancel');assert.match(await page.locator('#capture-status').innerText(),/canceled/);assert.equal(await page.locator('#capture-result').isVisible(),false);
  }
  assert.deepEqual(errors,[]);console.log('System Map browser passed: module filters, deep links, keyboard selection, connection contracts, bounded capture/export, exact ledger, Analytics handoff and mobile layout.');
}finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
