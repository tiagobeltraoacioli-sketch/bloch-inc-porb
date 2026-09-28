import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {PDFDocument} from '../site/blochai-shared/blochai-pdf-lib.js';

const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(new URL('../site/',import.meta.url).pathname),errors=[],presets=new Map(),submissions=[];
let organization={id:'fixture-org-one',name:'Synthetic research team',role:'owner'},currentTask=null,pauseNextSession=false,pausedSession,releaseSession;
const guide={coverage:'Synthetic public observation fixture only; no private AML data.',facts:[{label:'Observed records',value:2,unit:'transactions'}],sources:[{title:'Public source fixture',url:'https://bloch-graphus.xyz/',retrieved_at:'2026-09-28T12:00:00Z',coverage:'Fixture only'}],graph:{nodes:[{id:'a',label:'Synthetic source',kind:'address'},{id:'b',label:'Synthetic destination',kind:'address'}],edges:[{source:'a',target:'b',label:'observed transfer'}]},transactions:[{hash:'synthetic-transaction',from:'synthetic-source',to:'synthetic-destination',amount:'2',asset:'TEST',timestamp:'2026-09-28',status:'Synthetic only'}]};
const server=createServer(async(req,res)=>{
  try{
    if(req.url.startsWith('/api/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=chunks.length?JSON.parse(Buffer.concat(chunks)):null;
      let result;
      if(req.url==='/api/porb/auth/session'){if(pauseNextSession){pauseNextSession=false;await new Promise(resolve=>{releaseSession=resolve;pausedSession();});}result={authenticated:Boolean(organization),organization};}
      else if(req.url==='/api/porb/auth/logout'){organization=null;result={ok:true};}
      else if(!organization){res.writeHead(401,{'content-type':'application/json'});res.end(JSON.stringify({error:'authentication_required'}));return;}
      else if(req.url.endsWith('/status'))result={organization_id:organization.id,ready:true,model:'synthetic-model',nodes:{gpu_ready:1,online:1}};
      else if(req.url.includes('/research')){
        const id=req.url.split('/research/')[1],key=organization.id;let list=presets.get(key)||[];
        if(req.method==='GET')result={organization_id:key,presets:list};
        else if(req.method==='DELETE'){list=list.filter(preset=>preset.id!==id);presets.set(key,list);result={organization_id:key,deleted:true};}
        else{assert.equal(req.headers['x-porb-action'],'1');const preset={id:id||crypto.randomUUID(),...body};list=list.filter(item=>item.id!==preset.id);list.push(preset);presets.set(key,list);result={organization_id:key,preset};}
      }else if(req.url.endsWith('/tasks')&&req.method==='POST'){
        submissions.push(body);currentTask=crypto.randomUUID();result={organization_id:organization.id,task_id:currentTask,status:'PENDING',model:'synthetic-model'};
      }else if(req.url.includes('/tasks/'))result={organization_id:organization.id,task_id:currentTask,status:'COMPLETED',model:'synthetic-model',output:'A análise descreve duas transações públicas sintéticas. Não comprova identidade ou propriedade.',guide};
      else throw new Error('Unexpected fixture API route');
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(result));return;
    }
    const pathname=decodeURIComponent(req.url.split('?')[0]).replace(/^\/blochai\/pdf\//,'/blochai-shared/'),path=resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
    if(!path.startsWith(root+'/')){res.writeHead(404);res.end();return;}
    res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf','.png':'image/png'})[extname(path)]||'text/plain');res.end(await readFile(path));
  }catch(error){errors.push(error.message);res.writeHead(500);res.end('Fixture server error');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await webkit.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),base=`http://127.0.0.1:${server.address().port}`;
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto(base+'/blochai/');await page.waitForFunction(()=>!document.getElementById('generate').disabled);await page.check('#research-enabled');
  assert.equal(await page.locator('#prompt').getAttribute('maxlength'),'1500');await page.selectOption('#research-network','bitcoin');await page.selectOption('#research-kind','address');await page.fill('#research-value','synthetic-public-address');await page.fill('#research-instructions','List missing evidence and cite the observed coverage.');await page.fill('#research-from','2026-09-28');await page.fill('#research-to','2026-09-01');await page.fill('#prompt','Explain the observed records.');await page.click('#generate');assert.equal(submissions.length,0);assert.match(await page.locator('#workspace-message').textContent(),/start date/);
  await page.fill('#research-to','2026-09-28');await page.fill('#research-label','Daily synthetic research');await page.click('#research-save');await page.waitForFunction(()=>document.getElementById('research-preset').options.length===2);assert.equal(presets.get(organization.id).length,1);
  await page.selectOption('#research-mode','checklist');await page.click('#research-update');await page.waitForFunction(()=>document.getElementById('research-message').textContent==='Research preset updated.');assert.equal(presets.get(organization.id)[0].research.mode,'checklist');
  await page.click('#generate');await page.waitForFunction(()=>document.getElementById('task-badge').textContent==='COMPLETED');assert.equal(submissions.length,1);assert.equal(submissions[0].research.subject.kind,'address');assert.match(await page.locator('#research-evidence').textContent(),/Observed records: 2 transactions/);assert.equal(await page.locator('#research-evidence a').getAttribute('href'),'https://bloch-graphus.xyz/');
  const downloadPromise=page.waitForEvent('download');await page.click('#export-pdf');const download=await downloadPromise,pdf=await PDFDocument.load(await readFile(await download.path()));assert.match(pdf.getSubject(),/CONFIDENTIAL/);assert.ok(pdf.getPageCount()>=2,'Graph and transaction export must be preserved');
  for(const width of [390,360]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Research overflow at ${width}`);}
  await mkdir(new URL('../.data/blochai-research-browser/',import.meta.url),{recursive:true});await page.screenshot({path:new URL('../.data/blochai-research-browser/mobile.png',import.meta.url).pathname,fullPage:true});
  await page.click('#research-delete');await page.waitForFunction(()=>document.getElementById('research-preset').options.length===1);assert.equal(presets.get(organization.id).length,0);
  await page.fill('#research-label','Old organization draft');pauseNextSession=true;const paused=new Promise(resolve=>{pausedSession=resolve;});await page.click('#research-save');await paused;
  organization={id:'fixture-org-two',name:'Second synthetic team',role:'owner'};await page.click('#refresh-fleet');await page.waitForFunction(()=>document.getElementById('organization-name').textContent.includes('Second synthetic team'));releaseSession();assert.equal(await page.locator('#research-instructions').inputValue(),'');assert.equal(await page.locator('#research-enabled').isChecked(),false);assert.equal(await page.locator('#research-evidence').textContent(),'');assert.equal(await page.locator('#export-pdf').isVisible(),false);assert.equal(presets.get('fixture-org-two')?.length||0,0,'A suspended old-organization save must not write to the new organization');
  await page.check('#research-enabled');await page.fill('#research-instructions','Draft cleared on logout');await page.fill('#research-label','Private draft title');await page.click('#sign-out');await page.waitForFunction(()=>document.getElementById('access-badge').textContent==='INVITATION-ONLY');assert.equal(await page.locator('#research-instructions').inputValue(),'');assert.equal(await page.locator('#research-label').inputValue(),'');assert.equal(await page.locator('#research-preset option').count(),1);assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);assert.deepEqual(errors,[]);
  console.log('Private research UI passed: bounded draft, date validation, own preset save/update/delete, evidence rendering, graph and transaction PDF, mobile layout, organization switch and logout clearing.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
