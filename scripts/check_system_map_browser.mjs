import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {sample} from '../tests/system_map_fixture.mjs';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const live=process.env.GRAPHUS_MAP_ORIGIN;
if(live)assert.equal(live,'https://bloch-graphus.xyz');
const assets=live?(process.env.GRAPHUS_MAP_ASSETS||'BTC,ETH,BLCH,USDT,USDC').split(','):['ETH','BLCH'];
assert.ok(assets.length>0&&assets.every(asset=>['BTC','ETH','BLCH','USDT','USDC'].includes(asset)));
let server;
if(!live){
  const root=resolve(new URL('../graphus/',import.meta.url).pathname);
  server=createServer(async(req,res)=>{try{let pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/map')pathname='/map.html';const path=resolve(root,'.'+pathname);if(!path.startsWith(root+'/'))throw new Error('Invalid path');res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(path)]||'text/plain');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'");res.end(await readFile(path));}catch{res.writeHead(404);res.end('Not found');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
}
const browser=await webkit.launch(),page=await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true}),origin=live||`http://127.0.0.1:${server.address().port}`,errors=[];
page.on('pageerror',error=>errors.push(error.message));
if(live)page.on('response',async response=>{
  const url=new URL(response.url());if(url.origin!==origin||url.pathname!=='/api/chain/network'||response.status()<400)return;
  const body=await response.text().catch(()=>'Response body unavailable');
  console.log(JSON.stringify({asset:url.searchParams.get('asset'),cursor:url.searchParams.get('cursor'),status:response.status(),source_error:body.slice(0,500)}));
});
const fixture=url=>{const q=new URL(url).searchParams,asset=q.get('asset'),cursor=q.get('cursor');return sample(asset,cursor===null?0:asset==='BLCH'?Number(cursor.split('-').at(-1)):100-Number(cursor));};
const idle=()=>page.waitForFunction(()=>!document.querySelector('#capture-button').disabled,{},{timeout:150000});
async function exported(selector='#capture-export'){const download=page.waitForEvent('download');await page.click(selector);return JSON.parse(await readFile(await(await download).path(),'utf8'));}
try{
  if(!live)await page.route('**/api/chain/network?*',route=>route.fulfill({json:fixture(route.request().url())}));
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
  for(const asset of assets){
    await page.selectOption('#capture-asset',asset);
    // A failed real public request remains explicit; retry the same read once.
    for(let attempt=0;attempt<2;attempt++){
      await page.click('#capture-button');await idle();
      if(await page.locator('#capture-result').isVisible())break;
      if(attempt===1)assert.fail(await page.locator('#capture-status').innerText());
    }
    assert.match(await page.locator('#capture-status').innerText(),/Captured/);
    const baseline=await exported();await page.click('#baseline-pin');
    assert.equal((await exported('#baseline-export')).dataset_sha256,baseline.dataset_sha256);
    for(let attempt=0;attempt<2;attempt++){
      await page.click('#capture-older');await idle();last=await exported();
      if(last.dataset.snapshots.length===2||await page.locator('#capture-older').isDisabled())break;
      if(attempt===1)assert.fail(await page.locator('#capture-status').innerText());
    }
    assert.equal(last.dataset.snapshots.length,2);assert.equal(last.dataset.snapshots[1].requested_cursor,baseline.pagination.next_cursor);
    assert.equal(new Set(last.dataset.edges.map(e=>e.event_id)).size,last.dataset.edges.length);
    const comparison=await exported('#comparison-export');
    assert.equal(comparison.baseline_sha256,baseline.dataset_sha256);assert.equal(comparison.current_sha256,last.dataset_sha256);
    assert.equal(comparison.counts.shared,baseline.dataset.edges.length);assert.equal(comparison.counts.only_current,last.dataset.edges.length-baseline.dataset.edges.length);assert.equal(comparison.counts.changed,0);assert.equal(comparison.counts.only_baseline,0);
    await page.selectOption('#comparison-kind','shared');assert.ok(await page.locator('#comparison-ledger tr').count()>0);
    if(baseline.dataset.edges.length>20){await page.click('#comparison-next');assert.match(await page.locator('#comparison-page').innerText(),/Page 2/);}
    assert.equal(last.dataset.asset,asset);assert.equal(last.aml_score_included,false);assert.ok(last.dataset.edges.every(e=>typeof e.amount_base_units==='string'));assert.match(last.dataset_sha256,/^[a-f0-9]{64}$/);
    if(!live){assert.equal(last.dataset.edges[0].amount_base_units,'9007199254740993123456789');assert.equal(last.diagnostics.records_without_timestamp,asset==='BLCH'?50:0);}
    if(last.dataset.edges.length>20){await page.click('#capture-next');assert.match(await page.locator('#capture-page').innerText(),/Page 2/);}
    await page.fill('#capture-search','unknown-reference-no-match');assert.equal(await page.locator('#capture-ledger tr').count(),0);await page.fill('#capture-search',last.dataset.edges[0].txid);assert.ok(await page.locator('#capture-ledger tr').count()>0);await page.fill('#capture-search','');
    await page.fill('#filter-minimum','1e20');assert.match(await page.locator('#filter-status').innerText(),/unsigned integer/);assert.equal(await page.locator('#capture-filtered-export').isDisabled(),true);await page.click('#filter-reset');
    await page.locator('#capture-blocks button').first().click();assert.notEqual(await page.inputValue('#filter-from'),'');assert.equal(await page.inputValue('#filter-from'),await page.inputValue('#filter-to'));await page.click('#filter-reset');
    await page.locator('#capture-types button').first().click();assert.notEqual(await page.inputValue('#filter-kind'),'all');await page.click('#filter-reset');
    const edge=last.dataset.edges[0],destination=last.dataset.nodes.find(n=>n.id===edge.to);
    await page.fill('#capture-search',destination.address||destination.txid);await page.selectOption('#filter-direction','incoming');await page.selectOption('#filter-kind',edge.kind);
    await page.fill('#filter-minimum',edge.amount_base_units);await page.fill('#filter-maximum',edge.amount_base_units);await page.fill('#filter-from',String(edge.block_number));await page.fill('#filter-to',String(edge.block_number));
    const subset=await exported('#capture-filtered-export');assert.equal(subset.selection.parent_dataset_sha256,last.dataset_sha256);
    assert.ok(subset.dataset.edges.length>0);assert.ok(subset.dataset.edges.every(e=>e.to===edge.to&&e.kind===edge.kind&&e.block_number===edge.block_number&&e.amount_base_units===edge.amount_base_units));
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,asset+' mobile overflow');await page.setViewportSize({width:1440,height:1000});
    console.log(JSON.stringify({mode:live?'real source':'test fixture',asset,pages:last.diagnostics.source_pages,records:last.diagnostics.records,references:last.diagnostics.references,missing_timestamps:last.diagnostics.records_without_timestamp,baseline_records:baseline.diagnostics.records,filtered_records:subset.diagnostics.records}));
  }
  await page.screenshot({path:new URL('../.data/system-map/'+(live?'live':'local')+'-desktop.png',import.meta.url).pathname,fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.click('#show-directory');await page.screenshot({path:new URL('../.data/system-map/'+(live?'live':'local')+'-mobile.png',import.meta.url).pathname,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.click('#capture-filtered-analytics');await page.waitForURL('**/analytics*');await page.waitForFunction(()=>document.querySelector('#lab-badge')?.textContent.includes('REAL NETWORK COLLECTION'));assert.equal(await page.evaluate(()=>sessionStorage.getItem('graphus.analytics.network.v1')),null);
  await page.goto(origin+'/map?category=access&module=api-keys');assert.equal(await page.locator('#node-inspector a[href*="view=access"]').count(),1);
  if(!live){
    await page.route('**/api/chain/network?*',route=>route.fulfill({status:503,json:{error:'test-only failure'}}));await page.click('#capture-button');await idle();assert.match(await page.locator('#capture-status').innerText(),/503/);assert.equal(await page.locator('#capture-result').isVisible(),false);
    await page.unroute('**/api/chain/network?*');await page.route('**/api/chain/network?*',route=>route.fulfill(new URL(route.request().url()).searchParams.has('cursor')?{status:503,json:{error:'test-only second-page failure'}}:{json:fixture(route.request().url())}));
    await page.selectOption('#capture-pages','2');await page.click('#capture-button');await idle();assert.match(await page.locator('#capture-status').innerText(),/503.*1 completed/);const retained=await exported();assert.equal(retained.dataset.snapshots.length,1);
    await page.unroute('**/api/chain/network?*');await page.route('**/api/chain/network?*',async route=>{if(new URL(route.request().url()).searchParams.has('cursor'))await new Promise(resolve=>setTimeout(resolve,600));await route.fulfill({json:fixture(route.request().url())}).catch(()=>{});});
    const secondRequest=page.waitForRequest(req=>new URL(req.url()).searchParams.has('cursor'));await page.click('#capture-button');await secondRequest;await page.click('#capture-cancel');assert.match(await page.locator('#capture-status').innerText(),/canceled.*1 completed/);await page.waitForTimeout(700);assert.equal((await exported()).dataset_sha256,retained.dataset_sha256);
    await page.unroute('**/api/chain/network?*');await page.route('**/api/chain/network?*',async route=>{await new Promise(resolve=>setTimeout(resolve,400));await route.fulfill({json:fixture(route.request().url())}).catch(()=>{});});
    await page.click('#capture-button');await page.selectOption('#capture-asset','ETH');await page.waitForTimeout(500);assert.equal(await page.locator('#capture-result').isVisible(),false);assert.match(await page.locator('#capture-status').innerText(),/Asset changed/);
    await page.unroute('**/api/chain/network?*');await page.route('**/api/chain/network?*',route=>route.fulfill({json:fixture(route.request().url())}));
    await page.selectOption('#capture-pages','4');await page.click('#capture-button');await idle();await page.click('#capture-older');await idle();assert.equal((await exported()).dataset.snapshots.length,8);assert.equal(await page.locator('#capture-older').isDisabled(),true);
    await page.click('#baseline-pin');await page.selectOption('#capture-pages','1');await page.click('#capture-button');await idle();assert.equal((await exported('#comparison-export')).counts.only_baseline,175);
    await page.click('#baseline-clear');assert.equal(await page.locator('#comparison-export').isDisabled(),true);
  }
  assert.deepEqual(errors,[]);console.log(`System Map ${live?'live':'local'} browser passed for ${assets.join(', ')}: navigation, cursor collection, baseline comparison, exact filters/exports, filtered Analytics handoff and mobile layout.${live?'':' Local fixtures also verified partial failures/cancellation, asset-switch races and capacity.'}`);
}finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
