// Read-only production verification. Real public responses only; no forced errors.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyResearchBundle} from '../space/public/assets/address-research-bundle.js';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||process.argv[2]||'playwright');
const root=new URL('../',import.meta.url),reference=process.argv.find(v=>v.startsWith('--reference='))?.slice(12);
assert.match(reference||'',/^0x[a-f0-9]{40}$/,'Provide a reference previously observed in a public source');
const summary={checked_at:new Date().toISOString(),reference,checks:[],observations:[]},errors=[];
const browser=await webkit.launch(),context=await browser.newContext({viewport:{width:1440,height:1000}}),hash=value=>createHash('sha256').update(value).digest('hex');
try{
  for(const path of ['/v1/references?asset=ETH&reference='+reference,'/v1/space/research?network=ethereum&asset=ETH&query='+reference,'/v1/atlas/private']){const r=await context.request.get('https://rednblue.space/api/porb'+path);assert.equal(r.status(),401);assert.match(r.headers()['cache-control'],/no-store/);}
  for(const path of ['/aml/assets/demo.json','/space/']){let url='https://rednblue.space'+path,login=false;for(let i=0;i<5;i++){const r=await context.request.get(url,{maxRedirects:0});assert.ok([301,302,307,308].includes(r.status()));const next=new URL(r.headers().location,url);assert.equal(next.origin,'https://rednblue.space');if(next.pathname==='/portal/'){login=true;break;}url=next.href;}assert.ok(login);}
  for(const name of ['score','preview'])assert.equal((await context.request.get('https://bloch.space/api/porb/'+name)).status(),410);
  summary.checks.push('Anonymous private observations, research and Atlas denied; AML/mounted Space reaches login; public scores retired.');
  const assets=['address-research-request.js','address-research-cooldown-ui.js','address-research-refresh-ui.js','address-research-bundle-ui.js','address-research.css','app.js'];
  for(const [origin,path,file]of [
    ['https://bloch.space','/?network=ethereum','space/public/index.html'],['https://rednblue.space','/explore/','site/explore/index.html'],['https://rednblue.space','/explore/explore.js','site/explore/explore.js'],
    ...['portal.js','intelligence.js'].map(name=>['https://rednblue.space','/portal/'+name,'site/portal/'+name]),
    ...assets.flatMap(name=>[['https://bloch.space','/assets/'+name,'space/public/assets/'+name],['https://rednblue.space','/space/assets/'+name,'site/space/assets/'+name]])
  ]){const response=await context.request.get(origin+path);assert.equal(response.status(),200);assert.equal(hash(await response.body()),hash(await readFile(new URL(file,root))),path+' deployed bytes');}
  summary.checks.push('Both custom domains serve the deployed request client, recovery controls and generated mounts byte-for-byte.');
  for(const origin of ['https://rednblue.space','https://bloch.space']){
    const page=await context.newPage(),record={origin,responses:[]},requests=[];summary.observations.push(record);
    page.on('pageerror',e=>errors.push({origin,message:e.message}));page.on('request',r=>{const u=new URL(r.url());if(u.pathname==='/api/research')requests.push(u.searchParams.get('asset'));});page.on('response',r=>{const u=new URL(r.url());if(u.pathname==='/api/research')record.responses.push({asset:u.searchParams.get('asset'),status:r.status(),content_type:r.headers()['content-type'],retry_after:r.headers()['retry-after']||null});});
    await page.goto(origin+(origin.includes('rednblue')?'/explore/?':'/?')+new URLSearchParams({network:'ethereum',kind:'address',asset:'ETH_ALL',query:reference}),{waitUntil:'domcontentloaded',timeout:60000});await page.locator('[data-bundle-export]').waitFor({timeout:75000});
    assert.deepEqual(requests.slice().sort(),['ETH','USDC','USDT']);
    const download=async()=>{const pending=page.waitForEvent('download');await page.click('[data-bundle-export]');return verifyResearchBundle(JSON.parse(await readFile(await(await pending).path(),'utf8')));};
    const before=await download();record.initial={bundle_sha256:before.bundle_sha256,assets:before.results.map(r=>({asset:r.asset,status:r.status,...(r.error?{error:r.error}:{modules:Object.fromEntries(Object.entries(r.report.modules).map(([k,v])=>[k,v.status]))})}))};
    if(await page.locator('[data-research-wait]').isVisible()){
      assert.equal(await page.locator('[data-bundle-refresh]:disabled').count(),3);await page.waitForTimeout(1100);assert.equal(requests.length,3);assert.deepEqual(await download(),before);record.recovery={status:'service requested a pause; no manual retry sent',message:await page.locator('[data-research-wait]').innerText()};
    }else{
      const asset=before.results.find(r=>r.status==='available')?.asset||'ETH';await page.click(`[data-bundle-asset=${asset}]`);await page.click(`[data-bundle-refresh=${asset}]`);await page.waitForFunction(asset=>{const text=document.querySelector('[data-bundle-status]')?.textContent;return text?.startsWith(asset+' updated')||text?.startsWith(asset+' update unavailable');},asset,{timeout:75000});assert.equal(requests.length,4);assert.equal(requests[3],asset);
      const after=await download(),failed=(await page.locator('[data-bundle-status]').innerText()).includes('update unavailable');if(failed)assert.deepEqual(after,before);else for(let i=0;i<3;i++)if(before.results[i].asset!==asset)assert.deepEqual(after.results[i],before.results[i]);
      record.recovery={asset,status:await page.locator('[data-bundle-status]').innerText(),paused:await page.locator('[data-research-wait]').isVisible(),bundle_sha256:after.bundle_sha256};
      if(record.recovery.paused){assert.equal(await page.locator('[data-bundle-refresh]:disabled').count(),3);await page.waitForTimeout(1100);assert.equal(requests.length,4);}
    }
    const text=await page.locator('#public-address-status,#message,[data-bundle-status],[data-research-wait]').allTextContents();assert.ok(!text.join(' ').includes('Unexpected token'));assert.ok(!text.join(' ').includes('<html'));
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));console.log(JSON.stringify(record));await page.close();
  }
  assert.deepEqual(errors,[]);summary.status='passed';summary.browser_errors=errors;
}catch(error){summary.status='failed';summary.error=String(error.message);console.error(summary.error);process.exitCode=1;}
finally{await mkdir(new URL('.data/porb-portal/',root),{recursive:true,mode:0o700});await writeFile(new URL('.data/porb-portal/address-request-release.json',root),JSON.stringify(summary,null,2),{mode:0o600});await browser.close();}
