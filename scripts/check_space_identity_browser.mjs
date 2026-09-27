// Isolated public UI verification. All chain/account replies are synthetic.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {spaceDataFixture,spaceGraphFixture} from '../tests/space_portal_fixture.js';
import {researchReport} from '../tests/address_research_fixture.js';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||process.argv[2]||'playwright');
const root=resolve(new URL('../space/public/',import.meta.url).pathname),shots=resolve(new URL('../.data/space-identity/',import.meta.url).pathname),errors=[];
const headers=Object.fromEntries((await readFile(resolve(root,'_headers'),'utf8')).split('\n\n')[0].split('\n').slice(1).filter(Boolean).map(line=>{const i=line.indexOf(':');return [line.slice(0,i).trim(),line.slice(i+1).trim()];}));
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'https://bloch.space');let response;
 if(url.pathname==='/api/research'){const report=await researchReport(url.searchParams.get('asset'),{reference:url.searchParams.get('query')});response=Response.json(report.body,{status:report.status});}
 else if(url.pathname==='/api/graph')response=Response.json(spaceGraphFixture(url.searchParams.get('asset')||'BLCH'));
 else if(url.pathname==='/api/account/config')response=Response.json({enabled:false});
 else if(url.pathname.startsWith('/api/'))response=Response.json(spaceDataFixture(url.searchParams.get('network'),url.pathname.slice(5)));
 else{const file=resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));assert.ok(file.startsWith(root+'/'));response=new Response(await readFile(file),{headers:{...headers,'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'})[extname(file)]||'application/octet-stream'}});}
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}catch(error){res.writeHead(404);res.end(error.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await webkit.launch(),context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/.test(m.text()))errors.push({message:m.text(),url:page.url(),source:m.location()});});
const routes=['/app/?network=ethereum&view=science','/?network=ethereum','/graph/?asset=USDT','/bitcoin/','/ethereum/','/bloch/','/bitcoin/analytics/','/ethereum/analytics/','/bloch/analytics/','/account/','/downloads/'];
async function layout(route,theme,width){
 const result=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,background:getComputedStyle(document.body).backgroundColor,font:getComputedStyle(document.body).fontFamily,theme:document.documentElement.dataset.theme,header:[...document.querySelectorAll('.space-nav>a')].map(a=>a.textContent.trim()),buttons:document.querySelectorAll('#theme-toggle').length,broken:[...document.querySelectorAll('img')].filter(i=>i.complete&&!i.naturalWidth).length}));
 assert.equal(result.overflow,false,`${route} ${theme} ${width}: horizontal overflow`);assert.equal(result.theme,theme);assert.equal(result.background,theme==='dark'?'rgb(8, 18, 16)':'rgb(243, 247, 244)');assert.match(result.font,/Inter/);assert.deepEqual(result.header,['Workspace','Explorer','Graph Lab','Data Atlas ↗']);assert.equal(result.buttons,1);assert.equal(result.broken,0);
}
try{
 await mkdir(shots,{recursive:true});
 for(const theme of ['dark','light']){
  await page.goto(origin+'/app/?network=ethereum');if(await page.getAttribute('html','data-theme')!==theme)await page.click('#theme-toggle');
  for(const route of routes){
   await page.setViewportSize({width:1440,height:1000});await page.goto(origin+route);await page.locator('.space-header').waitFor();await page.waitForLoadState('networkidle');await layout(route,theme,1440);
   await page.setViewportSize({width:390,height:844});await layout(route,theme,390);
  }
 }
 await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/app/?network=ethereum');await page.click('.space-nav [data-space-link=explorer]');await page.waitForURL('**/?network=ethereum');assert.equal(await page.locator('#space-network').inputValue(),'ethereum');assert.match(await page.locator('#network-title').textContent(),/Ethereum/);
 await page.click('.space-nav [data-space-link=graph]');await page.waitForURL('**/graph/?asset=ETH');assert.equal(await page.locator('#graph-asset').inputValue(),'ETH');await page.selectOption('#graph-asset','BTC');assert.equal(await page.locator('#space-network').inputValue(),'bitcoin');assert.match(await page.locator('.space-nav [data-space-link=explorer]').getAttribute('href'),/network=bitcoin/);
 await page.click('[data-space-link=analytics]');await page.waitForURL('**/bitcoin/analytics/**');await page.waitForLoadState('networkidle');await page.selectOption('#space-network','ethereum');await page.waitForURL('**/ethereum/analytics/**');await page.waitForLoadState('networkidle');await page.goBack();assert.equal(await page.locator('#space-network').inputValue(),'bitcoin');
 await page.goto(origin+'/app/?network=bloch');await page.locator('#network-picker [data-network=ethereum]').click();assert.equal(await page.locator('#space-network').inputValue(),'ethereum');await page.click('.space-nav [data-space-link=explorer]');await page.waitForURL('**/?network=ethereum');
 await page.click('.space-header [data-space-account]');await page.waitForURL('**/account/');assert.equal(await page.locator('#space-network').inputValue(),'ethereum');assert.equal(await page.getAttribute('html','data-theme'),'light');
 const other=await context.newPage();await other.goto(origin+'/downloads/');await page.click('#theme-toggle');await other.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await other.close();
 await page.goto(origin+'/downloads/');assert.equal(await page.getAttribute('html','data-theme'),'dark');assert.equal(await page.evaluate(()=>document.querySelector('a,button,input,select').matches('.skip')),true);await page.locator('.skip').focus();assert.ok((await page.locator('.skip').boundingBox()).x>=0);await page.keyboard.press('Enter');assert.match(await page.url(),/#space-main$/);
 assert.deepEqual(errors,[]);
 // Capture screenshots separately: WebKit's screenshot preparation can inject a
 // stylesheet rejected by the real CSP. All functional/CSP checks above run
 // without screenshot instrumentation; production policy is never relaxed.
 if(process.argv.includes('--screenshots')){
  const visual=await context.newPage();
  for(const [route,theme,width] of [['/app/?network=ethereum','dark',1440],['/?network=ethereum','light',1440],['/ethereum/analytics/','light',1440],['/ethereum/','light',1440],['/graph/?asset=USDT','dark',1440],['/graph/?asset=USDT','light',390],['/account/','dark',390],['/downloads/','light',390]]){
   await visual.setViewportSize({width,height:width===390?844:1000});await visual.goto(origin+route);if(await visual.getAttribute('html','data-theme')!==theme)await visual.click('#theme-toggle');await visual.waitForLoadState('networkidle');
   await visual.screenshot({caret:'initial',path:resolve(shots,route.split('?')[0].replaceAll('/','-')+'-'+theme+'-'+(width===390?'mobile':'desktop')+'.png'),fullPage:true});
  }
  await visual.close();
 }
 console.log(JSON.stringify({status:'passed',pages:routes.length,themes:2,viewports:[1440,390],checks:['one shared header, palette and typography on all pages','saved theme across navigation and tabs','network context across workspace, explorer, graph and analytics','in-page network changes update shared navigation','back navigation and network-specific routes','account and downloads share the same controls','keyboard skip navigation','no overflow or JavaScript/CSP errors']}));
}catch(error){console.error({url:page.url(),errors});await page.screenshot({caret:'initial',path:resolve(shots,'failure.png'),fullPage:true});throw error;}
finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
