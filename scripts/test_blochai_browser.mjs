import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {PDFDocument} from '../site/blochai-shared/blochai-pdf-lib.js';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {setup,credentials} from '../tests/porb_helpers.mjs';
import {handlePortal} from '../portal/router.js';
import {handleBlochAI} from '../deploy/blochai/worker.js';

const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const test=await setup(),root=resolve(new URL('../site/',import.meta.url).pathname),errors=[],jobs=new Map();let ready=true,backendCalls=0;
test.sqlite.exec(await readFile(new URL('../deploy/blochai/migrations/0901_blochai_research.sql',import.meta.url),'utf8'));
test.env.BLOCHAI_API_URL='https://inference.test';test.env.BLOCHAI_API_TOKEN='test-only-private-service-credential';
const fetcher=async(url,init)=>{
  backendCalls++;const u=new URL(url);assert.equal(init.headers.authorization,`Bearer ${test.env.BLOCHAI_API_TOKEN}`);
  if(u.pathname==='/v1/status')return Response.json({ready,model:'browser-test-model',backend:'ollama',nodes:{registered:15,online:ready?1:0,ready:ready?1:0,gpu_ready:ready?1:0}});
  if(u.pathname==='/v1/tasks'&&init.method==='POST'){const body=JSON.parse(init.body),task_id=crypto.randomUUID();jobs.set(task_id,body);return Response.json({task_id,status:'PENDING',model:'browser-test-model'});}
  const task_id=u.pathname.split('/').at(-1),job=jobs.get(task_id);if(!job||job.tenant_id!==u.searchParams.get('tenant_id'))return Response.json({error:'not found'},{status:404});
  return Response.json({task_id,status:'COMPLETED',model:'browser-test-model',output:'Browser fixture response. <script>window.__unsafe = true</script>'});
};
const server=createServer(async(req,res)=>{
  try{
    if(req.url.startsWith('/api/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const handler=req.url.startsWith('/api/porb/v1/blochai/')?handleBlochAI:handlePortal;
      const localOrigin=`http://127.0.0.1:${server.address().port}`,headers={...req.headers};
      // The local harness maps the production-only inference hostname and its session cookie.
      if(handler===handleBlochAI){if(headers.origin===localOrigin)headers.origin='https://rednblue.space';if(headers.cookie)headers.cookie=headers.cookie.replace('porb_dev_session=','__Host-porb_session=');}
      const response=await handler({request:new Request(`${handler===handleBlochAI?'https://rednblue.space':localOrigin}${req.url}`,{method:req.method,headers,body:chunks.length?Buffer.concat(chunks):undefined}),env:test.env,fetcher});
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    const pathname=decodeURIComponent(req.url.split('?')[0]).replace(/^\/blochai\/pdf\//,'/blochai-shared/'),path=resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));if(!path.startsWith(root+'/')){res.writeHead(404);res.end();return;}
    res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf'})[extname(path)]||'text/plain');
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'");res.end(await readFile(path));
  }catch(error){errors.push(error.message);res.writeHead(500);res.end('Test server error');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await webkit.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1100}}),base=`http://127.0.0.1:${server.address().port}`;
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto(base+'/blochai/');await page.waitForFunction(()=>document.getElementById('access-badge').textContent==='INVITATION-ONLY');assert.equal(backendCalls,0);assert.equal(await page.locator('#generate').isDisabled(),true);assert.equal(await page.locator('#gpu-ready').textContent(),'—');assert.equal(await page.locator('#export-pdf').isVisible(),false);assert.equal(await page.locator('#sign-in').getAttribute('href'),'/portal/');assert.equal(await page.locator('#sign-in').getAttribute('target'),'_blank');
  const login=await page.request.post(base+'/api/porb/auth/login',{headers:{origin:base,'x-porb-action':'1'},data:credentials});assert.equal(login.status(),200);
  await page.reload();await page.waitForFunction(()=>!document.getElementById('generate').disabled);assert.equal(await page.locator('#gpu-ready').textContent(),'1');assert.equal(await page.locator('#organization-name').textContent(),'Test organization / owner');
  await mkdir(new URL('../.data/blochai-browser/',import.meta.url),{recursive:true});await page.screenshot({path:new URL('../.data/blochai-browser/desktop.png',import.meta.url).pathname,fullPage:true});
  await page.click('[data-prompt]');await page.click('#generate');await page.waitForFunction(()=>document.getElementById('task-badge').textContent==='COMPLETED');assert.match(await page.locator('#output').textContent(),/Browser fixture response/);assert.equal(await page.evaluate(()=>window.__unsafe),undefined);assert.equal(jobs.size,1);assert.equal([...jobs.values()][0].tenant_id,test.tenant);assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
  const pdfRequests=[];page.on('request',request=>pdfRequests.push({url:request.url(),method:request.method()}));
  const downloadPromise=page.waitForEvent('download');await page.click('#export-pdf');const download=await downloadPromise;const pdf=await PDFDocument.load(await readFile(await download.path()));assert.match(pdf.getSubject(),/CONFIDENTIAL/);assert.ok(pdf.getPageCount()>=1);assert.ok(pdfRequests.every(request=>request.url.startsWith(base)&&request.method==='GET'),'PDF export must not upload content or call another host');assert.ok(pdfRequests.some(request=>request.url.endsWith('.ttf')));

  for(const width of [390,360]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overflow at ${width}`);}await page.screenshot({path:new URL('../.data/blochai-browser/mobile.png',import.meta.url).pathname,fullPage:true});
  await page.click('#clear-output');assert.equal(await page.locator('#export-pdf').isVisible(),false);ready=false;await page.click('#refresh-fleet');await page.waitForFunction(()=>document.getElementById('fleet-badge').textContent==='WAITING FOR WORKERS');assert.equal(await page.locator('#generate').isDisabled(),true);assert.equal(await page.locator('#gpu-ready').textContent(),'0');
  delete test.env.BLOCHAI_API_TOKEN;await page.click('#refresh-fleet');await page.waitForFunction(()=>document.getElementById('fleet-badge').textContent==='UNAVAILABLE');assert.equal(await page.locator('#gpu-ready').textContent(),'—');assert.match(await page.locator('#fleet-reason').textContent(),/not been connected/);
  test.env.BLOCHAI_API_TOKEN='test-only-private-service-credential';ready=true;test.sqlite.prepare("UPDATE memberships SET role='viewer' WHERE user_id=?").run(test.owner);await page.click('#refresh-fleet');await page.waitForFunction(()=>document.getElementById('fleet-badge').textContent==='READY FOR INFERENCE');assert.equal(await page.locator('#generate').isDisabled(),true);assert.match(await page.locator('#access-note').textContent(),/view-only/);
  await page.click('#sign-out');await page.waitForFunction(()=>document.getElementById('access-badge').textContent==='INVITATION-ONLY');assert.equal(await page.locator('#output').textContent(),'');assert.equal(await page.locator('#prompt').inputValue(),'');assert.equal(await page.locator('#generate').isDisabled(),true);assert.equal(await page.locator('#export-pdf').isVisible(),false);
  assert.deepEqual(errors,[]);console.log('BlochAI browser passed: anonymous gate, shared authenticated session, real gateway contract fixture, async completion, literal output, mobile layout, offline fleet, viewer role, local confidential PDF download and logout clearing.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));test.sqlite.close();}
