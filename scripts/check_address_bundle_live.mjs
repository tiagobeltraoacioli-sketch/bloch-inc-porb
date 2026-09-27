// Read-only production verification; no credentials or private writes are used.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyResearchBundle} from '../space/public/assets/address-research-bundle.js';
import {createAddressEvidence} from '../space/public/assets/address-evidence.js';
import {compareAddressReports} from '../space/public/assets/address-research-comparison.js';
import {compareSavedCapture} from '../space/public/assets/address-research-import.js';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||process.argv[2]||'playwright');
const root=new URL('../',import.meta.url),portal='https://rednblue.space',space='https://bloch.space';
const suppliedReference=process.argv.find(value=>value.startsWith('--reference='))?.slice('--reference='.length);
if(suppliedReference!==undefined)assert.match(suppliedReference,/^0x[0-9a-f]{40}$/,'Provide a normalized address already observed in a public source');
const summary={checked_at:new Date().toISOString(),scope:'public-ethereum-address-capture-comparison-and-authentication-boundaries',checks:[],observations:[]},errors=[];
const note=message=>{summary.checks.push(message);console.log(message);},hash=value=>createHash('sha256').update(value).digest('hex');
const browser=await webkit.launch(),context=await browser.newContext({viewport:{width:1440,height:1000}});
function sharedCapture(item){
  if(!['USDT','USDC'].includes(item.asset)||item.status!=='available')return false;
  const m=item.report.modules;if(m.ledger.status!=='available'||m.graph.status!=='available')return false;
  const activity=m.ledger.data.token_activity,graph=m.graph.data;assert.ok(activity,'Usable token views share one activity capture');
  assert.equal(graph.observations.length,1);assert.equal(graph.observations[0].at,activity.observation.retrieved_at);assert.deepEqual(graph.observations[0].anchor,activity.observation.window_end_anchor);assert.equal(graph.edges.length,activity.activity.events.length);
  for(const [i,event]of activity.activity.events.entries()){
    const edge=graph.edges[i];assert.equal(edge.txid,event.transaction_hash);assert.equal(edge.amount,event.amount_base_units);assert.equal(edge.block.height,event.block_number);assert.equal(edge.block.hash,event.block_hash);assert.equal(edge.block.log,event.log_index);
  }
  return true;
}
await mkdir(new URL('.data/porb-portal/',root),{recursive:true,mode:0o700});
try{
  for(const path of ['/v1/references?asset=ETH&reference=0x'+'1'.repeat(40),'/v1/space/research?network=ethereum&asset=USDT&query=0x'+'1'.repeat(40),'/v1/atlas/private']){
    const response=await context.request.get(portal+'/api/porb'+path);assert.equal(response.status(),401,'Anonymous private research denied');assert.match(response.headers()['cache-control'],/no-store/);
  }
  for(const path of ['/aml/assets/demo.json','/space/']){
    let url=portal+path,reached=false;
    for(let i=0;i<5;i++){const response=await context.request.get(url,{maxRedirects:0});assert.ok([301,302,307,308].includes(response.status()),'Private module does not return anonymous content');const next=new URL(response.headers().location,url);assert.equal(next.origin,portal);if(next.pathname==='/portal/'){reached=true;break;}url=next.href;}
    assert.ok(reached,'Private module reaches the login gate');
  }
  for(const name of ['preview','score'])assert.equal((await context.request.get(space+'/api/porb/'+name)).status(),410,'Retired public score endpoint');
  note('Anonymous private observations, research gateway, Atlas and AML/Space pages remain gated; public score endpoints remain retired.');
  const files=['address-research-bundle.js','address-research-bundle-ui.js','address-research-comparison.js','address-research-comparison-ui.js','address-research-import.js','address-research-import-ui.js','address-research-ui.js','address-research.css','app.js','space-shell.js','space-design.css'];
  for(const [origin,remote,local]of [
    [space,'/?network=ethereum','space/public/index.html'],[space,'/sw.js','space/public/sw.js'],[space,'/assets/pwa.js','space/public/assets/pwa.js'],[portal,'/explore/','site/explore/index.html'],[portal,'/explore/explore.js','site/explore/explore.js'],
    ...['index.html','portal.js','intelligence.js'].map(name=>[portal,name==='index.html'?'/portal/':'/portal/'+name,'site/portal/'+name]),
    ...files.flatMap(name=>[[space,'/assets/'+name,'space/public/assets/'+name],[portal,'/space/assets/'+name,'site/space/assets/'+name]])
  ]){const response=await context.request.get(origin+remote);assert.equal(response.status(),200,remote+' deployed status');assert.equal(hash(await response.body()),hash(await readFile(new URL(local,root))),remote+' deployed bytes');}
  note('Both custom domains serve the combined-search forms, controllers, renderer and generated mounted assets byte-for-byte.');
  let reference=suppliedReference;
  if(!reference){
    const sampleResponse=await context.request.get('https://bloch-graphus.xyz/api/atlas/analyze?asset=USDT',{timeout:120000});assert.equal(sampleResponse.status(),200,'Public sample for address selection');
    const sample=await sampleResponse.json();reference=sample.references.filter(r=>r.kind!=='transaction').sort((a,b)=>b.records-a.records)[0]?.reference;assert.ok(reference,'Captured Ethereum reference');
  }
  summary.reference_selection={method:suppliedReference?'explicit previously observed public address':'current public Atlas sample',reference};
  for(const origin of [portal,space]){
    const invalid=await context.request.get(origin+'/api/research?'+new URLSearchParams({network:'ethereum',asset:'ETH_ALL',query:reference}));assert.equal(invalid.status(),400,'Combined selection never becomes a chain API asset');
    const page=await context.newPage(),requests=[];let documents=0;summary.current_origin=origin;page.on('pageerror',error=>{const failure={origin,message:String(error.message).split('\n')[0]};errors.push(failure);console.log(JSON.stringify({browser_error:failure}));});page.on('request',request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())documents++;const url=new URL(request.url());if(url.pathname==='/api/research')requests.push(url.searchParams.get('asset'));});
    if(origin===portal){await page.goto(origin+'/explore/',{waitUntil:'domcontentloaded',timeout:60000});await page.selectOption('#public-address-form [name=asset]','ETH_ALL');await page.fill('#public-address-form [name=query]',reference);await page.click('#public-address-form button');}
    else await page.goto(origin+'/?'+new URLSearchParams({network:'ethereum',kind:'address',asset:'ETH_ALL',query:reference}),{waitUntil:'domcontentloaded',timeout:60000});
    await page.locator('.address-research-bundle').waitFor({timeout:75000});assert.deepEqual(requests.slice().sort(),['ETH','USDC','USDT'],'One actual query per selected asset');
    if(origin===space)await page.waitForFunction(()=>!!navigator.serviceWorker.controller);assert.equal(documents,1,'Initial service worker activation preserves the current document');
    const download=async selector=>{const pending=page.waitForEvent('download');await page.click(selector);return readFile(await(await pending).path(),'utf8');};
    const bundle=await verifyResearchBundle(JSON.parse(await download('[data-bundle-export]')));assert.equal(bundle.scope.reference,reference);
    if(!bundle.results.some(r=>r.status==='available'))summary.unavailable_capture={origin,bundle};
    assert.ok(bundle.results.some(r=>r.status==='available'),'At least one live source observation returned');assert.equal(new URL(page.url()).searchParams.get('asset'),'ETH_ALL');
    const record={origin,bundle_sha256:bundle.bundle_sha256,evidence_csv_assets:[],assets:[]};summary.observations.push(record);
    for(const item of bundle.results){
      await page.click(`[data-bundle-asset=${item.asset}]`);assert.equal(await page.locator(`[data-bundle-asset=${item.asset}]`).getAttribute('aria-selected'),'true');
      const selector=`[data-bundle-panel=${item.asset}]`,result={asset:item.asset,status:item.status};record.assets.push(result);
      if(item.status==='unavailable'){result.error=item.error;assert.equal(await page.locator(selector+' .address-research').count(),0);continue;}
      Object.assign(result,{ledger:item.report.modules.ledger.status,graph:item.report.modules.graph.status,machine_learning:item.report.modules.machine_learning.status,report_sha256:item.report.report_sha256});
      result.shared_token_capture=sharedCapture(item);
      assert.deepEqual(JSON.parse(await download(selector+' [data-research-export]')),item.report,'Complete child report retains its original content');
      if(item.report.modules.graph.status==='available'){
        const model=createAddressEvidence(item.report);result.focused_events=model.query().events.length;
        await page.click(selector+' [data-ae=toggle]');assert.equal(await download(selector+' [data-ae=csv]'),model.csv(),'Selected asset exact evidence CSV');record.evidence_csv_assets.push(item.asset);
      }else assert.equal(await page.locator(selector+' .ar-evidence').count(),0,'Unsupported graph stays explicit');
    }
    assert.deepEqual(JSON.parse(await download('[data-bundle-export]')),bundle,'Tab inspection preserves the original combined download');assert.equal(requests.length,3,'Tab and evidence inspection never collects another source');
    const selected=bundle.results.find(item=>item.asset!=='ETH'&&item.status==='available'&&item.report.modules.graph.status==='available')?.asset||bundle.results.find(item=>item.asset!=='ETH'&&item.status==='available')?.asset||bundle.results.find(item=>item.status==='available').asset;
    await page.click(`[data-bundle-asset=${selected}]`);await page.click(`[data-bundle-refresh=${selected}]`);
    await page.waitForFunction(asset=>{const status=document.querySelector('[data-bundle-status]')?.textContent;return status?.startsWith(asset+' updated')||status?.startsWith(asset+' update unavailable');},selected,{timeout:75000});
    assert.equal(requests.length,4,'Manual refresh collects only one additional asset');assert.equal(requests[3],selected);
    const updated=await verifyResearchBundle(JSON.parse(await download('[data-bundle-export]'))),succeeded=(await page.locator('[data-bundle-status]').innerText()).startsWith(selected+' updated');
    record.refresh={asset:selected,succeeded,bundle_sha256:updated.bundle_sha256};
    if(succeeded){
      assert.notEqual(updated.bundle_sha256,bundle.bundle_sha256);assert.deepEqual(await verifyResearchBundle(JSON.parse(await download('[data-bundle-previous]'))),bundle,'Previous complete bundle remains available');
      for(const [i,item]of bundle.results.entries())if(item.asset!==selected)assert.deepEqual(updated.results[i],item,'Other asset captures stay byte-identical');
      const item=updated.results.find(item=>item.asset===selected);assert.equal(item.status,'available');assert.deepEqual(JSON.parse(await download(`[data-bundle-panel=${selected}] [data-research-export]`)),item.report);record.refresh.shared_token_capture=sharedCapture(item);record.refresh.modules=Object.fromEntries(Object.entries(item.report.modules).map(([name,value])=>[name,value.status]));
      const before=bundle.results.find(item=>item.asset===selected);
      if(before.status==='available'&&before.report.report_sha256!==item.report.report_sha256){
        await page.click('[data-bundle-compare]');await page.locator('[data-capture-comparison]').waitFor();
        const comparison=JSON.parse(await download('[data-comparison-export]'));assert.deepEqual(comparison,await compareAddressReports(before.report,item.report));assert.equal(requests.length,4,'Comparison makes no source requests');
        record.refresh.comparison={comparison_sha256:comparison.comparison_sha256,balance:comparison.balance.status,graph:comparison.graph.status,only_before:comparison.graph.only_before?.length,only_after:comparison.graph.only_after?.length,changed:comparison.graph.changed?.length};
        const prefix=`[data-saved-capture=${selected}]`,saved=JSON.stringify(bundle,null,2);await page.click(prefix+'>summary');await page.locator(prefix+' input').setInputFiles({name:'previous-public-capture.json',mimeType:'application/json',buffer:Buffer.from(saved)});
        await page.waitForFunction(asset=>document.querySelector(`[data-saved-capture=${asset}] [data-saved-capture-status]`)?.textContent.startsWith('Local file compared:'),selected);
        const imported=JSON.parse(await download(prefix+' [data-comparison-export]'));assert.deepEqual(imported,await compareSavedCapture(saved,item.report));assert.equal(requests.length,4,'Saved-file comparison makes no source requests');assert.deepEqual(JSON.parse(await download('[data-bundle-export]')),updated,'Import preserves the current full bundle');
        record.refresh.saved_comparison={comparison_sha256:imported.comparison_sha256,imported_bundle_sha256:imported.before.imported_from.sha256,balance:imported.balance.status,graph:imported.graph.status};
      }
    }else{
      assert.deepEqual(updated,bundle,'Failed update retains the original content, timestamps and digest');assert.equal(await page.locator('[data-bundle-previous]').isVisible(),false);
    }
    assert.equal(documents,1,'A manual refresh preserves the current document');
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Combined address mobile layout');
    console.log(JSON.stringify(record));note(origin+': scoped asset requests, one manual '+selected+' refresh ('+(succeeded?'new capture':'source unavailable; original preserved')+'), verified exports and mobile passed. '+(record.evidence_csv_assets.length?'Exact graph CSV checked for '+record.evidence_csv_assets.join(', ')+'.':'Graph sources were unavailable; no graph CSV workflow was exercised.'));await page.close();
  }
  summary.browser_errors=errors;assert.deepEqual(errors,[],'Production JavaScript errors');summary.status='passed';
}catch(error){summary.status='failed';summary.error=String(error.message);console.error(summary.error);process.exitCode=1;}
finally{await writeFile(new URL('.data/porb-portal/address-bundle-release.json',root),JSON.stringify(summary,null,2),{mode:0o600});await browser.close();}
