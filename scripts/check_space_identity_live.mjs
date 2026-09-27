// Read-only production UI checks. No account creation, credentials or private writes.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||process.argv[2]||'playwright');
const origin='https://bloch.space',root=new URL('../',import.meta.url),errors=[],blockedPlatformScripts=new Set();
const routes=['/app/','/','/graph/','/bitcoin/','/ethereum/','/bloch/','/bitcoin/analytics/','/ethereum/analytics/','/bloch/analytics/','/account/','/downloads/'];
const result={checked_at:new Date().toISOString(),scope:'public-shared-space-interface',pages:[],checks:[]};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const browser=await webkit.launch(),context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),page=await context.newPage();
page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{
 if(message.type()!=='error'||!/Content Security Policy|Refused to/.test(message.text()))return;
 const text=message.text();
 // Cloudflare can inject its analytics beacon at the edge. Keep the existing
 // self-only script policy and disclose this external block separately.
 if(/^Refused to load https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js\/v[a-f0-9]+ because it does not appear in the script-src directive of the Content Security Policy\.$/.test(text))blockedPlatformScripts.add(text);
 else errors.push(text);
});
try{
 for(const route of routes){
  const url=origin+route+(route==='/'?'?network=ethereum':''),response=await context.request.get(url);
  assert.equal(response.status(),200,url);assert.equal(hash(await response.body()),hash(await readFile(new URL('space/public'+route+'index.html',root))),url+' deployed HTML');
 }
 for(const name of ['space-shell.js','space-design.css','workspace.js','graph-lab.js','analytics.js','chain-page.js']){
  const response=await context.request.get(origin+'/assets/'+name);assert.equal(response.status(),200);assert.equal(hash(await response.body()),hash(await readFile(new URL('space/public/assets/'+name,root))),name+' deployed bytes');
 }
 result.checks.push('All eleven HTML pages and shared/page assets match the source build.');
 for(const route of routes){
  await page.goto(origin+route+(route==='/'?'?network=ethereum':''));await page.locator('.space-header').waitFor();
  assert.equal(await page.locator('.space-nav a').count(),4);assert.equal(await page.locator('#theme-toggle').count(),1);
  const before=await page.getAttribute('html','data-theme');await page.click('#theme-toggle');assert.notEqual(await page.getAttribute('html','data-theme'),before);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route+' mobile overflow');
  result.pages.push({route,theme:await page.getAttribute('html','data-theme'),network:await page.locator('#space-network').inputValue()});await page.setViewportSize({width:1440,height:1000});
 }
 await page.goto(origin+'/app/?network=ethereum');await page.locator('#workspace-title').waitFor();await page.click('.space-nav [data-space-link=explorer]');await page.waitForURL('**/?network=ethereum');assert.equal(await page.locator('#space-network').inputValue(),'ethereum');
 await page.click('.space-nav [data-space-link=graph]');await page.waitForURL('**/graph/?asset=ETH');assert.equal(await page.locator('#graph-asset').inputValue(),'ETH');await page.selectOption('#graph-asset','BTC');assert.equal(await page.locator('#space-network').inputValue(),'bitcoin');
 await page.click('[data-space-link=analytics]');await page.waitForURL('**/bitcoin/analytics/**');await page.waitForLoadState('networkidle');await page.selectOption('#space-network','ethereum');await page.waitForURL('**/ethereum/analytics/**');await page.waitForLoadState('networkidle');await page.goBack();assert.equal(await page.locator('#space-network').inputValue(),'bitcoin');
 result.checks.push('Shared navigation, theme toggle, mobile fit, network continuity and browser history passed against public pages.');
 assert.deepEqual(errors,[]);result.browser_errors=errors;result.status='passed';console.log(JSON.stringify(result));
}catch(error){result.status='failed';result.error=error.message;result.browser_errors=errors;console.error(JSON.stringify(result));process.exitCode=1;}
finally{result.blocked_platform_scripts=[...blockedPlatformScripts];await mkdir(new URL('.data/porb-portal/',root),{recursive:true,mode:0o700});await writeFile(new URL('.data/porb-portal/space-identity-release.json',root),JSON.stringify(result,null,2),{mode:0o600});await browser.close();}
