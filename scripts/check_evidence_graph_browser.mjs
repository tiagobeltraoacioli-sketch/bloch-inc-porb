import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {sample} from '../tests/system_map_fixture.mjs';
import {evidencePacket,filteredEvidence} from '../graphus/assets/system_evidence.js';
import '../graphus/assets/network_inspector.js';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),live=process.env.GRAPHUS_MAP_ORIGIN;
if(live)assert.equal(live,'https://bloch-graphus.xyz');
const assets=(process.env.GRAPHUS_MAP_ASSETS||'BTC,ETH,BLCH,USDT,USDC').split(',');assert.ok(assets.length&&assets.every(a=>['BTC','ETH','BLCH','USDT','USDC'].includes(a)));
let server;
if(!live){
  const root=resolve(new URL('../graphus/',import.meta.url).pathname);
  server=createServer(async(req,res)=>{try{let path=new URL(req.url,'http://localhost').pathname;if(path==='/map')path='/map.html';path=resolve(root,'.'+path);if(!path.startsWith(root+'/'))throw new Error('Invalid path');res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(path)]||'text/plain');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'");res.end(await readFile(path));}catch{res.writeHead(404);res.end('Not found');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
}
const browser=await webkit.launch(),page=await browser.newPage({viewport:{width:1440,height:1000}}),origin=live||`http://127.0.0.1:${server.address().port}`,errors=[],requests=[];
page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/chain/'))requests.push(request.url());});
async function exported(selector){const download=page.waitForEvent('download');await page.click(selector);return JSON.parse(await readFile(await(await download).path(),'utf8'));}
async function opened(digest){await page.waitForFunction(expected=>document.querySelector('#network-explorer')?.dataset.digest===expected,digest,{timeout:15000});}
async function upload(packet){await page.setInputFiles('#net-import-file',{name:'public-evidence.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(packet))});}
try{
  if(!live)await page.route('**/api/chain/network?*',route=>route.fulfill({json:sample(new URL(route.request().url()).searchParams.get('asset'))}));
  await mkdir(new URL('../.data/evidence-graph/',import.meta.url),{recursive:true});let last;
  for(const asset of assets){
    await page.goto(origin+'/map');await page.selectOption('#capture-asset',asset);
    for(let attempt=0;attempt<2;attempt++){await page.click('#capture-button');await page.waitForFunction(()=>!document.querySelector('#capture-button').disabled,{},{timeout:75000});if(await page.locator('#capture-result').isVisible())break;if(attempt===1)assert.fail(asset+': '+await page.locator('#capture-status').innerText());await page.waitForTimeout(1200);}
    last=await exported('#capture-export');const before=requests.length;await page.click('#capture-graph');await opened(last.dataset_sha256);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('graphus.constellation.evidence.v1')),null);assert.equal(await page.locator('#net-auto').isChecked(),false);assert.equal(await page.locator('#net-auto').isDisabled(),true);assert.equal(await page.locator('#net-refresh').isDisabled(),true);assert.equal(await page.locator('#net-older').isDisabled(),true);
    assert.equal(await page.locator('.constellation-workspace').isVisible(),false);assert.match(await page.locator('#net-import-note').innerText(),/source claims remain unverified/);
    const edge=last.dataset.edges[0],target=last.dataset.nodes.find(n=>n.id===edge.to),label=target.address||target.txid,normalized=globalThis.GraphusAnalytics.fromCollection(last),info=globalThis.GraphusNetworkInspector.inspect(normalized,target.id);
    await page.fill('#net-search',label);await page.locator('#net-references button').first().click();assert.equal(await page.locator('#net-detail h3').innerText(),label);
    assert.match(await page.locator('#net-reference-facts').innerText(),new RegExp(info.records+' incident records'));
    for(const group of info.groups)assert.ok((await page.locator('#net-reference-totals').innerText()).includes(group.base_units));
    if(info.peers.length){const neighbor=page.locator('#net-neighbors button').first(),title=await neighbor.getAttribute('title');await neighbor.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#net-detail h3').innerText(),title);assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('#net-detail h3')),true);}
    await page.selectOption('#net-path-from',edge.from);await page.selectOption('#net-path-to',edge.to);await page.click('#net-path');assert.match(await page.locator('#net-path-result').innerText(),/directed steps/);
    await page.selectOption('#net-block',String(edge.block_number));await page.fill('#net-minimum',edge.amount_base_units);await page.locator('#net-minimum').dispatchEvent('change');assert.deepEqual(await exported('#net-export'),last);
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,asset+' mobile overflow');await page.setViewportSize({width:1440,height:1000});
    assert.equal(requests.length,before,'Opening or exploring saved evidence must not query a chain source');assert.deepEqual(errors,[]);
    console.log(JSON.stringify({mode:live?'real source':'test fixture',asset,records:last.dataset.edges.length,references:last.dataset.nodes.length,sha256:last.dataset_sha256,no_source_query_during_graph:true}));
  }
  const subset=await filteredEvidence(last,{query:last.dataset.edges[0].txid});let before=requests.length;await upload(subset);await opened(subset.dataset_sha256);assert.match(await page.locator('#net-import-note').innerText(),/Filtered subset/);assert.deepEqual(await exported('#net-export'),subset);assert.equal(requests.length,before);
  await page.locator('#net-references button').first().click();await page.locator('.net-grid').screenshot({path:new URL('../.data/evidence-graph/'+(live?'live':'local')+'-graph.png',import.meta.url).pathname});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:new URL('../.data/evidence-graph/'+(live?'live':'local')+'-mobile.png',import.meta.url).pathname,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.setViewportSize({width:1440,height:1000});
  await page.click('#net-analytics');await page.waitForURL('**/analytics*');await page.waitForFunction(()=>document.querySelector('#lab-badge')?.textContent.includes('REAL NETWORK COLLECTION'));assert.equal(await page.evaluate(()=>sessionStorage.getItem('graphus.analytics.network.v1')),null);assert.equal(requests.length,before);
  if(!live){
    await page.goto(origin+'/map');await page.selectOption('#capture-asset','ETH');await page.click('#capture-button');await page.waitForFunction(()=>!document.querySelector('#capture-button').disabled);const full=await exported('#capture-export');
    await page.fill('#capture-search',full.dataset.nodes[1].address);await page.selectOption('#filter-direction','incoming');const selection=await exported('#capture-filtered-export');before=requests.length;
    await page.locator('#capture-ledger tr').first().locator('td').nth(1).locator('button').last().click();await opened(selection.dataset_sha256);assert.equal(await page.locator('#net-detail h3').innerText(),full.dataset.nodes[1].address);assert.equal(requests.length,before);assert.equal((await exported('#net-export')).selection.parent_dataset_sha256,full.dataset_sha256);
    const altered=structuredClone(full);altered.dataset.edges[0].amount_base_units='1';await upload(altered);await page.waitForFunction(()=>document.querySelector('#net-status').dataset.error==='true');assert.match(await page.locator('#net-status').innerText(),/digest mismatch/);assert.equal(await page.locator('#net-export').isDisabled(),true);assert.equal(await page.locator('#net-references button').count(),0);assert.equal(requests.length,before);
    await page.goto(origin+'/constellation.html?import=evidence&asset=ETH&address=0x'+'c'.repeat(40));await page.waitForFunction(()=>document.querySelector('#net-status').dataset.error==='true');assert.equal(requests.length,before);assert.equal(await page.locator('.constellation-workspace').isVisible(),false);
    const empty=await evidencePacket({...sample(),nodes:[],edges:[]},'ETH');await upload(empty);await opened(empty.dataset_sha256);assert.equal(await page.locator('#net-ledger tr').count(),0);assert.deepEqual(await exported('#net-export'),empty);
    await page.unroute('**/api/chain/network?*');await page.route('**/api/chain/network?*',async route=>{await new Promise(resolve=>setTimeout(resolve,600));await route.fulfill({status:503,json:{error:'TEST ONLY delayed source failure'}}).catch(()=>{});});
    await page.goto(origin+'/constellation.html?asset=ETH');await upload(full);await opened(full.dataset_sha256);const requested=requests.length;await page.waitForTimeout(1900);assert.equal(requests.length,requested);assert.match(await page.locator('#net-status').innerText(),/Opened 25 saved records/);assert.equal((await exported('#net-export')).dataset_sha256,full.dataset_sha256);
    await page.unroute('**/api/chain/network?*');await page.route('**/api/chain/network?*',route=>route.fulfill({json:sample(new URL(route.request().url()).searchParams.get('asset'))}));
    await page.click('#net-live');await page.waitForFunction(()=>!document.querySelector('#net-refresh').disabled);assert.equal(await page.locator('#network-explorer').getAttribute('data-collection-mode'),'live');assert.ok(requests.length>requested);assert.equal(new URL(page.url()).searchParams.has('import'),false);assert.equal(await page.locator('#net-asset').isDisabled(),false);assert.equal(await page.locator('#net-auto').isDisabled(),false);
    await page.selectOption('#net-asset','BTC');await page.waitForFunction(()=>!document.querySelector('#net-refresh').disabled);const btc=sample('BTC').nodes[0].address;await page.fill('#net-search',btc.toLowerCase());assert.equal(await page.locator('#net-references button').count(),0);await page.fill('#net-search',btc);assert.equal(await page.locator('#net-references button').count(),1);
  }
  assert.deepEqual(errors,[]);console.log(`Evidence graph ${live?'live':'local'} browser passed: same-dataset graph, selected references, exact groups, neighbors, paths, local JSON import, unchanged exports, Analytics handoff and mobile layout.${live?'':' Altered/empty packets, missing handoff, late source responses and explicit return to live mode also passed.'}`);
}finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
