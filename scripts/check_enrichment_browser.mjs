import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {sample} from '../tests/system_map_fixture.mjs';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(new URL('../graphus/',import.meta.url).pathname),errors=[];
const server=createServer(async(req,res)=>{try{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+'/'))throw new Error('Invalid path');
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(path)]||'text/plain');
  res.end(await readFile(path));
}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await webkit.launch(),page=await browser.newPage({viewport:{width:1440,height:1000}}),base=`http://127.0.0.1:${server.address().port}`;
page.on('pageerror',error=>errors.push(error.message));
const address='0x'+'1'.repeat(40),hash='0x'+'a'.repeat(64);
await page.route('**/api/chain/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/chain/network')return route.fulfill({json:sample(url.searchParams.get('asset'))});
  if(url.pathname==='/api/chain/wallet')return route.fulfill({json:{status:'source-reported',asset:'ETH',network:'ethereum-mainnet',address,balance:{base_units:'90071992547409930000',decimals:18,unit:'wei',block:{height:100,hash}},observation:{source_id:'Explicit synthetic browser fixture',retrieved_at:'2026-09-25T00:00:00Z',coverage:'Synthetic bounded address lookup'}}});
  return route.fulfill({status:404,json:{error:'Fixture route not configured'}});
});
try{
  await mkdir(new URL('../.data/enrichment-browser/',import.meta.url),{recursive:true});
  await page.goto(base+'/constellation.html?asset=eth');await page.waitForSelector('#net-evidence-profile');
  await page.locator('#net-sources').locator('..').locator('summary').first().click();
  await page.locator('#net-evidence-profile summary').click();
  const profile=JSON.parse(await page.locator('#net-evidence-profile pre').textContent());assert.equal(profile.asset,'ETH');assert.equal(profile.records,25);
  await page.goto(base+'/oculum.html?asset=eth&address='+address);await page.waitForSelector('#oculum-evidence-profile');
  await page.locator('#oculum-evidence-profile > summary').click();const balance=JSON.parse(await page.locator('#oculum-evidence-profile pre').textContent());
  assert.equal(balance.total_base_units,'90071992547409930000');assert.equal(balance.shared_block_anchor,true);assert.equal(balance.top_five_share,1);
  const research=page.getByRole('link',{name:'Research this reference in the private workspace ↗'});assert.match(await research.getAttribute('href'),new RegExp(`view=references&asset=ETH&reference=${address}`));
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('.oculum-sample-analytics').screenshot({path:new URL(`../.data/enrichment-browser/oculum-${width}.png`,import.meta.url).pathname});}
  assert.deepEqual(errors,[]);console.log('Enrichment browser checks passed: Constellation evidence profile, exact Oculum balance/anchor metrics, private research link and desktop/mobile layout. Explicit synthetic fixtures.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
