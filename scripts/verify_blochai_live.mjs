import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

// Operator credentials are supplied from a private file outside published assets.
assert.ok(process.env.PORB_CREDENTIALS,'Set PORB_CREDENTIALS to the existing private operator credential file.');
const owner=JSON.parse(await readFile(process.env.PORB_CREDENTIALS,'utf8'));
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await webkit.launch({headless:true}),origin='https://rednblue.space';
const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];
const output=new URL('../.data/blochai-live/',import.meta.url);await mkdir(output,{recursive:true});
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto(origin+'/blochai/');
  await page.waitForFunction(()=>document.getElementById('access-badge')?.textContent==='INVITATION-ONLY');
  assert.equal(await page.locator('#generate').isDisabled(),true);
  const login=await page.request.post(origin+'/api/porb/auth/login',{headers:{origin,'x-porb-action':'1'},data:{email:owner.email,password:owner.password}});
  assert.equal(login.status(),200,'Existing account login must succeed.');
  await page.reload();await page.waitForFunction(()=>!document.getElementById('generate').disabled,{},{timeout:60000});
  const gpuReady=Number(await page.locator('#gpu-ready').textContent());assert.ok(gpuReady>=2);
  await page.fill('#prompt','Answer in one short sentence: what is 2 + 2?');
  await page.selectOption('#token-limit','64');await page.click('#generate');
  await page.waitForFunction(()=>['COMPLETED','FAILED'].includes(document.getElementById('task-badge').textContent),{},{timeout:180000});
  assert.equal(await page.locator('#task-badge').textContent(),'COMPLETED');
  const text=await page.locator('#output').textContent();assert.match(text,/4|four/i);
  assert.equal(await page.evaluate(()=>document.cookie.includes('porb_session')),false);
  await page.screenshot({path:new URL('desktop.png',output).pathname,fullPage:true});
  for(const width of [390,360]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await page.screenshot({path:new URL('mobile.png',output).pathname,fullPage:true});
  const rejection=await page.request.get(origin+'/api/porb/v1/blochai/status',{headers:{origin:'https://blochai.xyz'}});assert.equal(rejection.status(),403);
  await page.click('#sign-out');await page.waitForFunction(()=>document.getElementById('access-badge').textContent==='INVITATION-ONLY');
  assert.equal(await page.locator('#output').textContent(),'');assert.equal(await page.locator('#prompt').inputValue(),'');assert.deepEqual(errors,[]);
  const report={page:origin+'/blochai/',real_gpu_workers:gpuReady,inference:'COMPLETED',output:text,mobile:[390,360],cross_origin_denied:true,logout_cleared:true};
  await writeFile(new URL('report.json',output),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}finally{await page.request.post(origin+'/api/porb/auth/logout',{headers:{origin,'x-porb-action':'1'},data:{}}).catch(()=>{});await browser.close();}
