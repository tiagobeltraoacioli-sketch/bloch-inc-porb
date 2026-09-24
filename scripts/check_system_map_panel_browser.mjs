import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {sample} from '../tests/system_map_fixture.mjs';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),live=process.env.GRAPHUS_MAP_ORIGIN;
if(live)assert.equal(live,'https://bloch-graphus.xyz');let server;
if(!live){const root=resolve(new URL('../graphus/',import.meta.url).pathname);server=createServer(async(req,res)=>{try{let path=new URL(req.url,'http://localhost').pathname;if(path==='/map')path='/map.html';path=resolve(root,'.'+path);if(!path.startsWith(root+'/'))throw new Error('Invalid path');res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(path)]||'text/plain');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'");res.end(await readFile(path));}catch{res.writeHead(404);res.end('Not found');}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));}
const browser=await webkit.launch(),page=await browser.newPage(),origin=live||`http://127.0.0.1:${server.address().port}`,errors=[];
page.on('pageerror',error=>errors.push(error.message));
async function fitVisible(){
  await page.click('#zoom-reset');
  await page.waitForFunction(()=>{const chart=document.querySelector('#graphus-map'),wrap=document.querySelector('#map-canvas-wrap'),r=chart.getBoundingClientRect();return r.width<=wrap.clientWidth+1&&wrap.scrollWidth<=wrap.clientWidth+1&&[...chart.querySelectorAll('[data-module]')].every(n=>{const b=n.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1&&b.top>=r.top-1&&b.bottom<=r.bottom+1;});});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
}
async function closeDetails(){if(await page.locator('#map-details-dialog').evaluate(e=>e.open)){await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#map-details-dialog').open);}else if(await page.locator('#inspector-shell').isVisible())await page.click('#close-details');}
async function clickVisibleNode(){const id=await page.evaluate(()=>{const chart=document.querySelector('#graphus-map'),r=chart.getBoundingClientRect();return [...chart.querySelectorAll('[data-module]')].find(n=>{const b=n.getBoundingClientRect();return b.left>r.left+10&&b.right<r.right-10&&b.top>r.top+10&&b.bottom<r.bottom-10;})?.dataset.module;});assert.ok(id,'At least one module must be reachable after zooming');await page.locator(`#graphus-map [data-module="${id}"] rect`).click();return id;}
try{
  if(!live)await page.route('**/api/chain/network?*',route=>route.fulfill({json:sample(new URL(route.request().url()).searchParams.get('asset'))}));
  await mkdir(new URL('../.data/system-map-panel/',import.meta.url),{recursive:true});
  for(const width of [1440,1280,1024,390]){
    await page.setViewportSize({width,height:900});await page.goto(origin+'/map#system');await page.click('#show-map');await fitVisible();assert.equal(await page.locator('#graphus-map [data-module]').count(),44);
    // The last column was outside the visible viewport before the fix.
    await page.locator('#graphus-map [data-module=catalog] rect').click();assert.equal(await page.locator('#node-inspector h3').innerText(),'Field catalog');assert.equal(await page.locator('#inspector-shell').isVisible(),true);
    if(width<=1100)assert.equal(await page.locator('#map-details-dialog').evaluate(e=>e.open),true);else assert.equal(await page.locator('#map-grid').evaluate(e=>e.classList.contains('with-inspector')),true);
    if(width===1280||width===390)await page.screenshot({path:new URL(`../.data/system-map-panel/${live?'live':'local'}-details-${width}.png`,import.meta.url).pathname});
    await closeDetails();await page.click('#zoom-in');await page.click('#zoom-in');const level=await page.locator('#map-zoom').innerText();await clickVisibleNode();
    await page.waitForFunction(expected=>document.querySelector('#map-zoom').value===expected,level);await closeDetails();await page.click('#zoom-selection');
    const selected=page.locator('#graphus-map .map-node.selected');assert.ok((await selected.boundingBox()).width>=130,'Focus makes the selected module readable');await fitVisible();
    await page.click('#clear-selection');await page.click('#map-expand');assert.equal(await page.locator('#map-expanded').evaluate(e=>e.open),true);await fitVisible();
    assert.equal(await page.locator('#map-expanded').evaluate(e=>e.scrollHeight<=e.clientHeight+1),true,'Expanded workspace fits the viewport');
    await page.screenshot({path:new URL(`../.data/system-map-panel/${live?'live':'local'}-${width}.png`,import.meta.url).pathname});
    await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#map-expanded').open);assert.equal(await page.locator('#system #map-panel').count(),1);await fitVisible();
    await page.selectOption('#layer-filter','DELIVER');assert.equal(await page.locator('#graphus-map .map-column-label').count(),1);await fitVisible();
    await page.fill('#node-search','Integration API keys');assert.equal(await page.locator('#graphus-map [data-module]').count(),1);await page.locator('#graphus-map [data-module=api-keys] rect').click();assert.equal(await page.locator('#node-inspector a[href*="view=access"]').count(),1);await closeDetails();
    await page.fill('#node-search','no matching module');assert.equal(await page.locator('#graphus-map [data-module]').count(),0);assert.match(await page.locator('#graphus-map .map-empty').textContent(),/No matching/);await page.click('#clear-filters');await fitVisible();
    console.log(JSON.stringify({mode:live?'production':'local',width,visible_modules:44,horizontal_map_overflow:false,mouse_selection:true,zoom_preserved:true,details:width<=1100?'dialog':'sidebar'}));
  }
  await page.goto(origin+'/map?layer=SOURCE&module=btc-source#system');await page.waitForFunction(()=>document.querySelector('#map-details-dialog').open);await closeDetails();await page.click('#map-expand');await page.click('#show-directory');await page.locator('#map-results [data-module=btc-source]').click();
  assert.equal(await page.locator('#map-details-dialog').evaluate(e=>e.open),true);assert.equal(await page.locator('#map-expanded').evaluate(e=>e.open),true);
  await page.getByRole('button',{name:'Capture BTC evidence',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#capture-button').disabled,{},{timeout:75000});
  assert.equal(await page.locator('#map-details-dialog').evaluate(e=>e.open),false);assert.equal(await page.locator('#map-expanded').evaluate(e=>e.open),false);assert.equal(await page.locator('#system #map-panel').count(),1);assert.equal(await page.locator('#capture-asset').inputValue(),'BTC');
  if(live&&!await page.locator('#capture-result').isVisible()){await page.click('#capture-button');await page.waitForFunction(()=>!document.querySelector('#capture-button').disabled,{},{timeout:75000});}
  assert.equal(await page.locator('#capture-result').isVisible(),true,await page.locator('#capture-status').innerText());console.log(await page.locator('#capture-status').innerText());
  await page.goto(origin+'/map#system');await page.click('#show-map');await page.locator('#graphus-map .map-connection').first().focus();await page.keyboard.press('Enter');assert.match(await page.locator('#node-inspector').innerText(),/CONNECTION CONTRACT/);await page.getByRole('button',{name:'Inspect destination module',exact:true}).click();assert.equal(await page.locator('#node-inspector h3').innerText(),'UTXO normalization');await closeDetails();
  await page.setViewportSize({width:1280,height:900});await fitVisible();assert.deepEqual(errors,[]);console.log('System Map panel passed: complete fit, actual node clicks, persistent zoom, focus, dialogs/Escape, compact layer layout, empty search, deep links, dependencies and capture action.');
}finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
