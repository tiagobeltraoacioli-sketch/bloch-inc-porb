// Read-only public verification. No production account, synthetic data or writes.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {collectResearch,researchSelection} from '../space/public/assets/address-research-bundle.js';
import {openSavedResearch} from '../space/public/assets/address-research-reader.js';
import {createAddressEvidence} from '../space/public/assets/address-evidence.js';
import {compareSavedCapture} from '../space/public/assets/address-research-import.js';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||process.argv[2]||'playwright');
const root=new URL('../',import.meta.url),reference=process.argv.find(v=>v.startsWith('--reference='))?.slice(12);
assert.match(reference||'',/^0x[a-f0-9]{40}$/,'Provide an address previously observed in a public source');
const summary={checked_at:new Date().toISOString(),reference,scope:'public-saved-address-reader-and-anonymous-access-boundaries',checks:[],observations:[]};
const browser=await webkit.launch(),context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[];
const hash=value=>createHash('sha256').update(value).digest('hex');let previous;const captures=[];
try{
  for(const path of ['/api/porb/v1/references?asset=ETH&reference='+reference,'/api/porb/v1/space/research?network=ethereum&asset=ETH&query='+reference,'/api/porb/v1/atlas/private']){
    const response=await context.request.get('https://rednblue.space'+path);assert.equal(response.status(),401);assert.match(response.headers()['cache-control'],/no-store/);
  }
  for(const path of ['/aml/assets/demo.json','/space/']){
    let url='https://rednblue.space'+path,reached=false;
    for(let i=0;i<5;i++){const response=await context.request.get(url,{maxRedirects:0});assert.ok([301,302,307,308].includes(response.status()));const next=new URL(response.headers().location,url);assert.equal(next.origin,'https://rednblue.space');if(next.pathname==='/portal/'){reached=true;break;}url=next.href;}
    assert.ok(reached);
  }
  for(const path of ['score','preview'])assert.equal((await context.request.get('https://bloch.space/api/porb/'+path)).status(),410);
  summary.checks.push('Anonymous private research, observations and Atlas denied; AML and mounted Space require login; public score endpoints remain retired.');
  const assets=['address-research-reader.js','address-research-reader-ui.js','address-research-import-ui.js','address-research.css','app.js'];
  for(const [origin,path,file]of [
    ['https://bloch.space','/?network=ethereum','space/public/index.html'],['https://rednblue.space','/explore/','site/explore/index.html'],['https://rednblue.space','/explore/explore.js','site/explore/explore.js'],
    ['https://rednblue.space','/portal/','site/portal/index.html'],['https://rednblue.space','/portal/intelligence.js','site/portal/intelligence.js'],
    ...assets.flatMap(name=>[['https://bloch.space','/assets/'+name,'space/public/assets/'+name],['https://rednblue.space','/space/assets/'+name,'site/space/assets/'+name]])
  ]){const response=await context.request.get(origin+path);assert.equal(response.status(),200);assert.equal(hash(await response.body()),hash(await readFile(new URL(file,root))),path+' deployed bytes');}
  summary.checks.push('Both custom domains serve the saved-reader forms, modules, styles and mounted assets byte-for-byte.');
  for(const origin of ['https://rednblue.space','https://bloch.space']){
    const record={origin,responses:[]};summary.observations.push(record);
    const bundle=await collectResearch(researchSelection('ETH_ALL',reference),async asset=>{
      const response=await context.request.get(origin+'/api/research?'+new URLSearchParams({network:'ethereum',asset,query:reference}),{timeout:65000});record.responses.push({asset,status:response.status()});
      if(!response.ok()){const error=new Error('source_unavailable');error.status=response.status();throw error;}return response.json();
    });
    captures.push({origin,bundle});
    await openSavedResearch(JSON.stringify(bundle));record.bundle_sha256=bundle.bundle_sha256;record.assets=bundle.results.map(item=>({asset:item.asset,status:item.status,...(item.status==='available'?{modules:Object.fromEntries(Object.entries(item.report.modules).map(([k,v])=>[k,v.status]))}:{error:item.error})}));
    const page=await context.newPage(),requests=[];page.on('pageerror',e=>errors.push({origin,message:e.message}));page.on('request',r=>requests.push(r.url()));
    await page.goto(origin+(origin.includes('rednblue')?'/explore/':'/?network=ethereum'),{waitUntil:'networkidle',timeout:60000});
    const reader=page.locator('[data-research-reader]');await reader.locator('summary').first().click();const initialRequests=requests.length,storage=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));
    await page.locator('[data-research-reader-file]').setInputFiles({name:'public-source-captures.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bundle,null,2))});
    await page.waitForFunction(()=>/^(Opened locally:|Saved research rejected)/.test(document.querySelector('[data-research-reader-status]')?.textContent||''));assert.match(await page.locator('[data-research-reader-status]').innerText(),/^Opened locally:/);
    const download=async selector=>{const pending=page.waitForEvent('download');await page.click(selector);return readFile(await(await pending).path(),'utf8');};
    assert.deepEqual(JSON.parse(await download('[data-bundle-export]')),bundle);record.csv_assets=[];
    for(const item of bundle.results){
      await page.click(`[data-bundle-asset=${item.asset}]`);const panel=`[data-bundle-panel=${item.asset}]`;
      if(item.status==='unavailable'){assert.equal(await page.locator(panel+' [data-research-export]').count(),0);continue;}
      assert.deepEqual(JSON.parse(await download(panel+' [data-research-export]')),item.report);
      if(item.report.modules.graph.status==='available'){await page.click(panel+' [data-ae=toggle]');assert.equal(await download(panel+' [data-ae=csv]'),createAddressEvidence(item.report).csv());record.csv_assets.push(item.asset);}
    }
    if(previous){
      const selected=bundle.results.find(item=>item.status==='available'&&previous.results.some(old=>old.asset===item.asset&&old.status==='available'&&old.report.report_sha256!==item.report.report_sha256&&Date.parse(old.report.retrieved_at)<=Date.parse(item.report.retrieved_at)));
      if(selected){
        await page.click(`[data-bundle-asset=${selected.asset}]`);const box=`[data-saved-capture=${selected.asset}]`;await page.click(box+'>summary');await page.locator(box+' input').setInputFiles({name:'earlier-public-source-captures.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(previous))});await page.locator(box+' [data-comparison-export]').waitFor();
        const comparison=JSON.parse(await download(box+' [data-comparison-export]'));assert.deepEqual(comparison,await compareSavedCapture(JSON.stringify(previous),selected.report));record.comparison={asset:selected.asset,comparison_sha256:comparison.comparison_sha256};
      }else record.comparison={status:'No distinct time-ordered matching captures available in these bounded source replies.'};
    }
    if(previous){
      await page.locator('[data-research-reader-file]').setInputFiles({name:'saved-from-rednblue.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(previous))});
      await page.waitForFunction(()=>document.querySelector('[data-research-reader-status]')?.textContent.startsWith('Opened locally: saved-from-rednblue.json'));
      assert.deepEqual(JSON.parse(await download('[data-bundle-export]')),previous);record.reopened_from_portal={bundle_sha256:previous.bundle_sha256,available_assets:previous.results.filter(r=>r.status==='available').map(r=>r.asset),csv_assets:[]};
      for(const item of previous.results.filter(r=>r.status==='available')){
        await page.click(`[data-bundle-asset=${item.asset}]`);const panel=`[data-bundle-panel=${item.asset}]`;assert.deepEqual(JSON.parse(await download(panel+' [data-research-export]')),item.report);
        if(item.report.modules.graph.status==='available'){await page.click(panel+' [data-ae=toggle]');assert.equal(await download(panel+' [data-ae=csv]'),createAddressEvidence(item.report).csv());record.reopened_from_portal.csv_assets.push(item.asset);}
      }
    }
    assert.equal(requests.length,initialRequests,'Opening, tabs, evidence and comparison make no HTTP request');assert.equal(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}})),storage);
    assert.equal(await page.locator('[data-bundle-refresh],[data-research-refresh]').count(),0);await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.locator('[data-research-reader-clear]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('[data-research-reader-output]>*').count(),0);await page.close();previous=bundle;
    console.log(JSON.stringify(record));
  }
  assert.deepEqual(errors,[]);summary.status='passed';summary.browser_errors=errors;summary.checks.push('Original public captures, per-asset JSON/CSV, zero viewer HTTP/storage writes, mobile layout and keyboard close verified.');
}catch(error){summary.status='failed';summary.error=String(error.message);process.exitCode=1;console.error(summary.error);}
finally{await mkdir(new URL('.data/porb-portal/',root),{recursive:true,mode:0o700});await writeFile(new URL('.data/porb-portal/address-reader-release.json',root),JSON.stringify(summary,null,2),{mode:0o600});await writeFile(new URL('.data/porb-portal/address-reader-public-captures.json',root),JSON.stringify({checked_at:summary.checked_at,reference,captures},null,2),{mode:0o600});await browser.close();}
