import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {handlePublicBlochAI} from '../deploy/blochai-public/worker.js';

const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),root=resolve(new URL('../site/blochai-public/',import.meta.url).pathname),errors=[],requests=[];
const assets={async fetch(request){const url=new URL(request.url),path=resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));assert.ok(path.startsWith(root+'/'));return new Response(await readFile(path),{headers:{'content-type':({'.html':'text/html','.css':'text/css','.svg':'image/svg+xml'})[extname(path)]||'text/plain'}});}};
const server=createServer(async(req,res)=>{try{const response=await handlePublicBlochAI({request:new Request(`https://blochai.xyz${req.url}`,{method:req.method,headers:req.headers}),env:{ASSETS:assets}});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(error){errors.push(error.message);res.writeHead(500);res.end('Test server error');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await webkit.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1050}}),base=`http://127.0.0.1:${server.address().port}`;
page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
try{
  await page.goto(base+'/');await page.waitForLoadState('networkidle');assert.equal(await page.locator('h1').innerText(),'Ideas without\nborders.');assert.equal(await page.locator('script,form,input,textarea,iframe').count(),0);assert.equal(await page.locator('.product-card').count(),3);assert.equal(await page.locator('.product-card').first().getAttribute('href'),'https://bloch-graphus.xyz/');assert.match(await page.locator('#gpu-roadmap').innerText(),/PLANNED[\s\S]*Connect your GPU.[\s\S]*Earn BLCH.[\s\S]*program is not active/);assert.equal(await page.locator('.workspace-boundary a').getAttribute('href'),'https://rednblue.space/blochai/');
  await mkdir(new URL('../.data/blochai-public-browser/',import.meta.url),{recursive:true});await page.screenshot({path:new URL('../.data/blochai-public-browser/desktop.png',import.meta.url).pathname,fullPage:true});
  for(const width of [390,360]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overflow at ${width}`);}await page.screenshot({path:new URL('../.data/blochai-public-browser/mobile.png',import.meta.url).pathname,fullPage:true});
  assert.ok(requests.every(url=>url.startsWith(base+'/')&&!url.includes('/api/')),requests.join('\n'));assert.equal((await page.context().cookies()).length,0);assert.deepEqual(errors,[]);console.log('Public BlochAI browser passed: static-only hub, canonical public links, private workspace link, future BLCH roadmap, no scripts/forms/API requests/cookies and mobile widths 390/360.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
