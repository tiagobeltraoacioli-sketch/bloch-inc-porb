import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.PORB_ORIGIN||'https://rednblue-space.pages.dev';
assert.ok(['https://rednblue-space.pages.dev','https://rednblue.space'].includes(origin));
const owner=JSON.parse(await readFile(new URL('../.data/porb-portal/bootstrap.json',import.meta.url),'utf8'));
const browser=await webkit.launch(),page=await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto(origin+'/portal/');await page.locator('#auth-form [name=email]').fill(owner.email);await page.locator('#auth-form [name=password]').fill(owner.password);await page.click('#auth-submit');
  await page.waitForSelector('#workspace:not([hidden])',{timeout:60000});await page.waitForFunction(()=>document.querySelectorAll('#saved-analysis option').length>=6,{},{timeout:60000});
  assert.equal(await page.evaluate(()=>document.cookie.includes('porb_session')),false);
  if(process.env.PORB_CHECK_GRAPH==='1'){
    await page.click('[data-view=analyses]');
    for(const asset of ['BTC','ETH','BLCH','USDT','USDC']){
      const id=await page.locator('#saved-analysis option').evaluateAll((options,asset)=>options.find(o=>o.textContent.startsWith(asset+' ·')).value,asset);
      const pending=page.waitForResponse(r=>r.url().endsWith('/api/porb/v1/analyses/'+id)&&r.request().method()==='GET');
      await page.selectOption('#saved-analysis',id);const response=await pending;assert.equal(response.status(),200);const run=await response.json();
      await page.waitForFunction(asset=>document.querySelector('#analysis-provenance').textContent.startsWith(asset+' ·'),asset);
      const reference=run.scores.rows.at(-1);await page.fill('#graph-search',reference.address);await page.press('#graph-search','Enter');
      assert.ok((await page.locator('#graph-inspector').innerText()).includes(reference.address));
      assert.equal(await page.locator('#graph-chart .graph-node.selected').getAttribute('data-node-id'),reference.id);
      await page.locator('#graph-ledger td:last-child button').first().click();assert.match(await page.locator('#graph-event-detail').innerText(),/amount_base_units/);
      const firstTx=run.graph.edges[0].txid;await page.fill('#graph-search',firstTx);await page.press('#graph-search','Enter');assert.ok((await page.locator('#graph-inspector').innerText()).includes(firstTx));
      await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,asset+' mobile layout');await page.setViewportSize({width:1440,height:1000});
      console.log(JSON.stringify({asset,search_verified:true,transaction_verified:true,graph_references:run.graph.nodes.length}));
    }
  }
  await page.click('[data-view=analyses]');const ethOption=await page.locator('#saved-analysis option').evaluateAll(options=>options.find(o=>o.textContent.startsWith('ETH ·')).value);await page.selectOption('#saved-analysis',ethOption);await page.waitForFunction(()=>document.querySelector('#analysis-provenance').textContent.startsWith('ETH ·'));await page.waitForFunction(()=>document.querySelectorAll('#wallet-rows tr').length>=20);
  await mkdir(new URL('../.data/porb-browser/',import.meta.url),{recursive:true});await page.screenshot({path:new URL('../.data/porb-browser/live-ethereum.png',import.meta.url).pathname,fullPage:true});
  if(process.env.PORB_EXPAND_BLOCH==='1'){
    await page.selectOption('#collect-form [name=asset]','BLCH');await page.selectOption('#collect-form [name=pages]','4');const collected=page.waitForResponse(r=>r.url().endsWith('/api/porb/v1/analyses')&&r.request().method()==='POST',{timeout:180000});await page.click('#collect-form button');const response=await collected;assert.equal(response.status(),201);const result=await response.json();console.log(JSON.stringify({asset:result.asset,wallets:result.wallets,records:result.records,pages:result.pages,red_available:result.scores.ml.available}));
  }
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:new URL('../.data/porb-browser/live-mobile.png',import.meta.url).pathname,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  if(process.env.PORB_CHECK_GRAPH==='1'){
    await page.locator('#graph-chart .graph-node').first().tap();assert.match(await page.locator('#graph-inspector').innerText(),/SELECTED REFERENCE/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  }
  await page.click('[data-view=access]');await page.waitForSelector('#admin-controls:not([hidden])');assert.ok((await page.locator('#access-description').innerText()).includes('owner'));
  await page.click('#logout');await page.waitForSelector('#gate:not([hidden])');assert.deepEqual(errors,[]);console.log('Production browser passed: master login, private saved Ethereum dataset, role controls, HttpOnly session, mobile layout and logout. No secrets printed.');
}finally{await browser.close();}
