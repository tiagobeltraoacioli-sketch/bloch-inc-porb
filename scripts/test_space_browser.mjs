const {chromium}=await import(process.env.SPACE_PLAYWRIGHT_MODULE||'playwright');
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const base=process.env.SPACE_TEST_URL||'http://127.0.0.1:8794';
const browser=await chromium.launch({headless:true,...(process.env.SPACE_CHROME_PATH?{executablePath:process.env.SPACE_CHROME_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1100},serviceWorkers:'block'});
let createdAccount=null;
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await mkdir('/tmp/bloch-space-review',{recursive:true});
try{
 for(const [network,range]of [['ethereum','48'],['bitcoin','30'],['bloch','24h']]){
  await page.goto(`${base}/app/?network=${network}&view=science&range=${range}`);
  await page.waitForFunction(()=>document.querySelector('#workspace-status').textContent.includes('retrieved')||document.querySelector('#workspace-status').textContent.includes('unavailable'),{},{timeout:30000});
  const state=await page.locator('#workspace-status').textContent();
  assert.match(state,/retrieved/,`${network}: ${state}`);
  assert.ok(await page.locator('.research-chart').count()>=8);
  assert.ok(await page.locator('#workspace-table tbody tr').count()>0);
  await page.screenshot({path:`/tmp/bloch-space-review/${network}-desktop.png`,fullPage:true});
  await page.getByRole('button',{name:'⌘ Machine learning'}).click();
  await page.waitForFunction(()=>document.querySelector('#workspace-title').textContent.includes('Machine learning'));
  await page.locator('.research-chart').first().waitFor();
  console.log(network,await page.locator('#workspace-stats').innerText());
 }
 await page.goto(`${base}/app/?network=bloch&view=graphus`);
 await page.waitForFunction(()=>document.querySelector('#workspace-status').textContent.includes('retrieved')||document.querySelector('#workspace-status').textContent.includes('unavailable'),{},{timeout:30000});
 assert.match(await page.locator('#workspace-status').textContent(),/retrieved/);
 assert.ok(await page.locator('#workspace-table tbody tr').count()>0);
 console.log('graphus rows',await page.locator('#workspace-table tbody tr').count());
 await page.setViewportSize({width:390,height:844});
 await page.goto(`${base}/app/?network=ethereum&view=ml&range=48`);
 await page.locator('.research-chart').first().waitFor({timeout:30000});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile overflow');
 await page.screenshot({path:'/tmp/bloch-space-review/mobile.png',fullPage:true});
 await page.goto(`${base}/account/`);await page.waitForFunction(()=>!document.querySelector('#auth-submit').disabled);
 const email=`space-test-${Date.now()}@example.test`,password='Research test password 2026!';
 await page.getByRole('button',{name:'Create account',exact:true}).click();await page.locator('#email').fill(email);await page.locator('#password').fill(password);await page.locator('#auth-submit').click();
 await page.locator('#private-panel').waitFor({state:'visible'});createdAccount={email,password};assert.equal(await page.locator('#recovery-code').textContent().then(s=>s.length),64);
 await page.locator('.porb-svg').waitFor();await page.screenshot({path:'/tmp/bloch-space-review/account-mobile.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'account mobile overflow');
 await page.locator('#saved-network').selectOption('ethereum');await page.locator('#workspace-form button').click();await page.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('saved'));
 await page.locator('#logout').click();await page.locator('#auth-panel').waitFor({state:'visible'});
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('#password').fill(password);await page.locator('#auth-submit').click();await page.locator('#private-panel').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.querySelector('#saved-network').value==='ethereum');
 await page.locator('.account-management summary').click();await page.locator('#delete-password').fill(password);await page.locator('#delete-confirm').check();await page.locator('#delete-form button').click();await page.waitForFunction(()=>document.querySelector('#account-status').textContent.includes('deleted'));createdAccount=null;
 assert.deepEqual(errors,[]);console.log('Account registration, login, saved view, logout and deletion passed; zero JS errors.');
 const offlineContext=await browser.newContext();const offlinePage=await offlineContext.newPage();
 await offlinePage.goto(`${base}/app/?network=bloch&view=overview`);await offlinePage.evaluate(()=>navigator.serviceWorker.ready);
 await offlinePage.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 const cache=await offlinePage.evaluate(async()=>{const out=[];for(const name of await caches.keys()){const c=await caches.open(name);out.push(...(await c.keys()).map(r=>new URL(r.url).pathname));}return out;});
 assert.ok(cache.includes('/app/'));assert.ok(!cache.some(p=>p.startsWith('/api/')));
 await offlineContext.setOffline(true);await offlinePage.reload();await offlinePage.locator('#workspace-main').waitFor();await offlinePage.locator('#connectivity').waitFor({state:'visible'});
 console.log('PWA offline shell passed; no API or private response in cache.');
}finally{
 if(createdAccount){try{const headers={origin:base,'x-space-action':'1'};const login=await context.request.post(`${base}/api/account/login`,{headers,data:createdAccount});if(login.ok())await context.request.delete(`${base}/api/account/delete`,{headers,data:{password:createdAccount.password}});}catch{console.error('Temporary test account cleanup needs inspection.');}}
 await browser.close();
}
