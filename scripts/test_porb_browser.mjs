import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {setup,credentials} from '../tests/porb_helpers.mjs';
import {handlePortal} from '../portal/router.js';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const test=await setup(),root=resolve(new URL('../site/',import.meta.url).pathname),errors=[];
const server=createServer(async(req,res)=>{
  try{
    if(req.url.startsWith('/api/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const headers={...req.headers},request=new Request(`http://127.0.0.1:${server.address().port}${req.url}`,{method:req.method,headers,body:chunks.length?Buffer.concat(chunks):undefined});
      const response=await handlePortal({request,env:test.env,fetcher:async url=>{const u=new URL(url);if(u.pathname==='/api/chain/network'){const {sourceGraph}=await import('../tests/porb_helpers.mjs');return Response.json(sourceGraph(u.searchParams.get('asset'),Number(u.searchParams.get('cursor')||100)));}if(u.pathname==='/api/overview')return Response.json({network:u.searchParams.get('network'),source:'Browser test fixture',retrieved_at:'2026-09-24T12:00:00Z',head:{height:100}});if(u.pathname==='/api/series')return Response.json({network:'ethereum',source:'Browser test fixture',retrieved_at:'2026-09-24T12:00:00Z',fee_history:{oldest_height:'100',gas_used_ratio:Array.from({length:48},(_,i)=>.5+Math.sin(i)*.2),base_fee_wei:Array.from({length:48},(_,i)=>String(1000000000+i*1000000))}});throw new Error('Unexpected source');}});
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    const path=resolve(root,'.'+decodeURIComponent(req.url.split('?')[0])+(req.url.split('?')[0].endsWith('/')?'index.html':''));if(!path.startsWith(root+'/')){res.writeHead(404);res.end();return;}
    res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(path)]||'text/plain');res.end(await readFile(path));
  }catch{res.writeHead(500);res.end('Test server error');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await webkit.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1050}}),base=`http://127.0.0.1:${server.address().port}`;
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto(base+'/index.html');assert.equal(await page.locator('.portal-access a').getAttribute('href'),'https://rednblue.space/portal/');
  assert.equal(await page.locator('.hero-actions a').first().getAttribute('href'),'https://rednblue.space/portal/');
  await page.goto(base+'/portal/?view=analyses');await page.locator('#auth-form input[name=email]').fill(credentials.email);await page.locator('#auth-form input[name=password]').fill(credentials.password);await page.click('#auth-submit');await page.waitForSelector('#workspace:not([hidden])');assert.equal(await page.locator('#view-analyses').isVisible(),true);
  await page.waitForFunction(()=>document.querySelectorAll('.network-card').length===3);
  await page.click('[data-view=analyses]');await page.selectOption('#collect-form [name=asset]','ETH');await page.click('#collect-form button');await page.waitForSelector('#analysis-result:not([hidden])');await page.waitForFunction(()=>document.querySelectorAll('#wallet-rows tr').length===40);
  await page.click('#wallet-rows button');assert.equal(await page.locator('#wallet-detail').isVisible(),true);
  const address='0x'+(40).toString(16).padStart(40,'0');
  await page.fill('#graph-search',address.toUpperCase());await page.press('#graph-search','Enter');
  assert.match(await page.locator('#graph-inspector').innerText(),new RegExp(address));
  assert.match(await page.locator('#graph-record-count').innerText(),/78 matching records/);
  await page.selectOption('#graph-direction','out');assert.match(await page.locator('#graph-record-count').innerText(),/^0 matching/);
  await page.selectOption('#graph-direction','in');await page.locator('#graph-record-pages button').last().click();
  assert.match(await page.locator('#graph-record-pages').innerText(),/Page 2/);
  await page.locator('#graph-ledger td:last-child button').first().click();assert.match(await page.locator('#graph-event-detail').innerText(),/amount_base_units/);
  const txid='0x'+(3).toString(16).padStart(64,'0');
  await page.fill('#graph-search',txid);await page.press('#graph-search','Enter');assert.match(await page.locator('#graph-inspector').innerText(),/SELECTED TRANSACTION/);
  assert.match(await page.locator('#graph-record-count').innerText(),/2 matching records/);
  await page.locator('#graph-chart .graph-connection').first().focus();await page.keyboard.press('Enter');assert.match(await page.locator('#graph-inspector').innerText(),/SELECTED CONNECTION/);
  await page.locator('#graph-chart .graph-node').last().click();assert.match(await page.locator('#graph-inspector').innerText(),/SELECTED REFERENCE/);
  await page.check('#graph-neighborhood');assert.equal(await page.locator('#graph-chart .graph-node').count(),2);
  await page.click('#graph-zoom-in');assert.notEqual(await page.locator('#graph-chart').getAttribute('viewBox'),'0 0 720 420');await page.click('#graph-fit');
  await page.fill('#graph-search','0x'+'f'.repeat(40));assert.match(await page.locator('#graph-search-note').innerText(),/No match in this saved sample/);
  assert.equal(await page.locator('#graph-query-links a').count(),2);assert.equal(await page.locator('#graph-search-results button').count(),0);
  await page.click('#graph-reset');assert.equal(await page.locator('#graph-records').isVisible(),false);
  await page.fill('#graph-search','<img src=x onerror=alert(1)>');assert.equal(await page.locator('#graph-query-links a').count(),0);assert.equal(await page.locator('#network-explorer img').count(),0);await page.click('#graph-reset');
  await mkdir(new URL('../.data/porb-browser/',import.meta.url),{recursive:true});await page.screenshot({path:new URL('../.data/porb-browser/data-desktop.png',import.meta.url).pathname,fullPage:true});
  await page.click('[data-view=science]');await page.selectOption('#science-form [name=network]','ethereum');await page.click('#science-form button');await page.waitForSelector('#science-result:not([hidden])');assert.match(await page.locator('#validation-note').innerText(),/historical evaluation/);
  await page.click('[data-view=access]');await page.locator('#key-form [name=label]').fill('Browser test key');await page.locator('#key-form [name=password]').fill(credentials.password);await page.click('#key-form button');await page.waitForSelector('#secret-dialog[open]');assert.match(await page.locator('#secret-value').innerText(),/^porb_[0-9a-f]{64}$/);await page.click('#secret-close');await page.waitForFunction(()=>document.getElementById('key-list').textContent.includes('Browser test key'));
  await page.click('#key-list button');await page.locator('#reauth-form [name=password]').fill(credentials.password);await page.click('#reauth-form button[type=submit]');await page.waitForFunction(()=>document.getElementById('key-list').textContent.includes('Revoked'));
  await page.locator('#invite-form [name=email]').fill('invited@example.test');await page.locator('#invite-form [name=password]').fill(credentials.password);await page.click('#invite-form button');await page.waitForSelector('#secret-dialog[open]');const inviteUrl=await page.locator('#secret-value').innerText();assert.match(inviteUrl,/#invite=/);await page.click('#secret-close');
  await page.click('[data-view=analyses]');await page.fill('#graph-search',txid);await page.press('#graph-search','Enter');await page.setViewportSize({width:390,height:844});await page.screenshot({path:new URL('../.data/porb-browser/data-mobile.png',import.meta.url).pathname,fullPage:true});const overflow=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,items:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(e).position!=='fixed').map(e=>({tag:e.tagName,id:e.id,cls:e.className,right:e.getBoundingClientRect().right,overflow:getComputedStyle(e).overflowX})).slice(0,5),scroll:[...document.querySelectorAll('body *')].filter(e=>e.scrollWidth>e.clientWidth+1&&getComputedStyle(e).overflowX==='visible').map(e=>({tag:e.tagName,id:e.id,cls:e.className,sw:e.scrollWidth,cw:e.clientWidth})).slice(0,20)}));assert.ok(overflow.document<=overflow.width+1,JSON.stringify(overflow));
  await page.click('#logout');await page.waitForSelector('#gate:not([hidden])');await page.goto(inviteUrl);await page.waitForFunction(()=>location.hash==='');await page.locator('#auth-form [name=email]').fill('invited@example.test');await page.locator('#auth-form [name=password]').fill('new invited user password 123456789');await page.click('#auth-submit');await page.waitForSelector('#secret-dialog[open]');assert.match(await page.locator('#secret-title').innerText(),/recovery/);await page.click('#secret-close');await page.click('[data-view=access]');assert.equal(await page.locator('#admin-controls').isVisible(),false);
  assert.deepEqual(errors,[]);console.log('Browser passed: login, collection, interactive graph selection, keyboard connections, address/transaction search, direction and record pagination, exact evidence, missing-reference lookup links, score details, ML, key revocation, invitations and mobile layout. Test-only source fixtures.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));test.sqlite.close();}
