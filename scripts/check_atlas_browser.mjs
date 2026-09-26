import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {sample} from '../tests/system_map_fixture.mjs';
import {setup} from '../tests/porb_helpers.mjs';
import {handlePortal} from '../portal/router.js';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||process.argv[2]||'playwright');
const h=await setup(),root=resolve(new URL('../',import.meta.url).pathname),errors=[];let calls=0,fail=false,delay=0;
const xml='<CONSOLIDATED_LIST><INDIVIDUALS>'+Array.from({length:110},(_,i)=>`<INDIVIDUAL><REFERENCE_NUMBER>QDi.${i+1}</REFERENCE_NUMBER></INDIVIDUAL>`).join('')+'</INDIVIDUALS></CONSOLIDATED_LIST>';
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname.startsWith('/api/porb/')){
      const chunks=[];for await(const b of req)chunks.push(b);const bytes=Buffer.concat(chunks);
      const request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(bytes.length?{body:bytes}:{})});
      const response=await handlePortal({request,env:h.env,fetcher:async()=>new Response(xml)});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(pathname==='/api/chain/network'){
      calls++;const u=new URL(req.url,origin),asset=u.searchParams.get('asset'),cursor=u.searchParams.get('cursor');
      const shouldFail=fail;if(delay)await new Promise(r=>setTimeout(r,delay));
      res.setHeader('content-type','application/json');if(shouldFail){res.writeHead(502);res.end('{"error":"TEST source failure"}');return;}
      const page=cursor===null?0:asset==='BLCH'?Number(cursor.split('-').at(-1)):100-Number(cursor);res.end(JSON.stringify(sample(asset,page)));return;
    }
    const privatePage=pathname==='/atlas.html'||pathname.startsWith('/portal/')||pathname.startsWith('/graphus/');
    const path=resolve(root,privatePage?'site':'graphus','.'+pathname);assert.ok(path.startsWith(root+'/'));
    res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(path)]||'text/plain');
    res.setHeader('content-security-policy',"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'");
    res.end(await readFile(path));
  }catch(error){res.writeHead(404);res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await webkit.launch(),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const download=async id=>{const promise=page.waitForEvent('download');await page.click('#'+id);const file=await promise;return readFile(await file.path(),'utf8');};
const ready=()=>page.waitForFunction(()=>!document.getElementById('atlas-export').disabled);
const capture=async asset=>{await page.selectOption('#atlas-asset',asset);await page.click('#atlas-load');await ready();assert.match(await page.textContent('#atlas-status'),/25 selected records/);};
try{
  await page.goto(origin+'/catalog.html?asset=ETH');await ready();assert.equal(await page.locator('#field-rows tr').count(),84);
  let report=JSON.parse(await download('atlas-export'));assert.equal(report.asset,'ETH');assert.equal(report.records.length,25);
  await page.fill('#field-search','amount_raw');assert.equal(await page.locator('#field-rows tr').count(),1);await page.click('.atlas-field-button');await page.locator('#atlas-detail[open]').waitFor();assert.match(await page.textContent('#atlas-detail-value'),/9007199254740993123456789/);await page.keyboard.press('Escape');await page.fill('#field-search','');
  await page.click('#atlas-pin');await page.waitForFunction(()=>document.querySelector('#atlas-baseline').textContent.includes('25 shared'));
  await page.click('#atlas-more');await ready();assert.match(await page.textContent('#atlas-status'),/50 selected records/);
  const saved=JSON.parse(await download('atlas-evidence'));assert.equal(saved.dataset.snapshots.length,2);
  await page.fill('#atlas-reference',saved.dataset.nodes[1].address);await page.click('#atlas-apply');await page.waitForFunction(()=>document.querySelector('#atlas-selection').textContent.includes('ETH:address:'));
  report=JSON.parse(await download('atlas-export'));assert.equal(report.fields.inbound_outbound_count.value.incoming,50);
  await page.fill('#atlas-minimum','99999999999999999999999999999999');await page.click('#atlas-apply');await page.waitForFunction(()=>document.querySelector('#atlas-status').textContent.includes('· 0 selected records'));assert.match(await page.textContent('#atlas-ledger'),/No records/);
  await page.fill('#atlas-minimum','-1');await page.click('#atlas-apply');await page.waitForFunction(()=>document.querySelector('#atlas-status').textContent.includes('Selection not applied'));assert.equal(JSON.parse(await download('atlas-export')).records.length,0);
  await page.click('#atlas-reset');await page.waitForFunction(()=>document.querySelector('#atlas-status').textContent.includes('50 selected records'));
  assert.match(await download('atlas-csv'),/"field","state","value"/);
  const evalFile=await download('atlas-evaluation-example');await page.setInputFiles('#atlas-evaluation-import',{name:'evaluation.json',mimeType:'application/json',buffer:Buffer.from(evalFile)});await page.waitForFunction(()=>!document.querySelector('#atlas-evaluation-output').hidden);assert.equal(JSON.parse(await download('atlas-evaluation-export')).release_approved,false);
  report=JSON.parse(await download('atlas-export'));assert.equal(report.fields.validation_cohort.value.records,4);
  for(const asset of ['BTC','USDT','USDC','BLCH']){await capture(asset);const r=JSON.parse(await download('atlas-export'));assert.equal(r.asset,asset);assert.equal(r.fields.aml_score.value,null);}
  const prior=await download('atlas-export'),tampered=structuredClone(saved);tampered.dataset.edges[0].amount_base_units='1';
  await page.setInputFiles('#atlas-import',{name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(tampered))});await page.waitForFunction(()=>document.querySelector('#atlas-status').textContent.includes('Import rejected'));assert.equal(await download('atlas-export'),prior);
  fail=true;delay=300;await page.click('#atlas-load');await page.setInputFiles('#atlas-import',{name:'saved.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await page.waitForFunction(()=>document.querySelector('#atlas-status').textContent.includes('Imported evidence'));await page.waitForTimeout(500);assert.match(await page.textContent('#atlas-status'),/Imported evidence/);assert.ok(await page.isDisabled('#atlas-more'));fail=false;delay=0;
  const imported=JSON.parse(await download('atlas-evidence'));assert.deepEqual(imported,saved);
  await mkdir(resolve(root,'.data'),{recursive:true});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:resolve(root,'.data/atlas-desktop.png'),fullPage:true});await page.screenshot({path:resolve(root,'.data/atlas-desktop-viewport.png')});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:resolve(root,'.data/atlas-mobile.png'),fullPage:true});await page.screenshot({path:resolve(root,'.data/atlas-mobile-viewport.png')});await page.setViewportSize({width:1440,height:1000});
  const before=calls;await page.click('#atlas-analytics');await page.waitForURL('**/analytics.html?import=network');await page.waitForFunction(()=>document.querySelector('#lab-badge').textContent.includes('REAL NETWORK COLLECTION'));assert.equal(calls,before);
  await page.goto(origin+'/catalog.html?import=evidence');await page.waitForFunction(()=>document.querySelector('#atlas-status').textContent.includes('handoff is missing'));assert.equal(calls,before);
  await page.evaluate(value=>sessionStorage.setItem('graphus.atlas.evidence.v1',value),JSON.stringify(saved));await page.reload();await ready();assert.equal(calls,before);assert.deepEqual(JSON.parse(await download('atlas-evidence')),saved);
  await page.goto(origin+'/atlas.html');await page.locator('#private-login:visible').waitFor();
  const cookie=await h.login();await context.addCookies([{name:'porb_dev_session',value:cookie.split('=')[1],url:origin,httpOnly:true,sameSite:'Strict'}]);await page.reload();await page.locator('#private-workspace:visible').waitFor();
  for(const [id,value]of [['private-subject','Synthetic browser evidence'],['private-body','A private note'],['private-purpose','Test analysis'],['private-basis','Documented test basis'],['private-licence','Test fixture rights']])await page.fill('#'+id,value);
  await page.click('#private-save');await page.waitForFunction(()=>document.querySelector('#private-records').textContent.includes('A private note'));
  await page.getByRole('button',{name:'Edit record',exact:true}).click();await page.fill('#private-body','Corrected private note');await page.click('#private-save');await page.waitForFunction(()=>document.querySelector('#private-records').textContent.includes('revision 2'));
  await page.fill('#private-references','QDi.1,QDi.999');await page.locator('#private-source-form button').click();await page.waitForFunction(()=>!document.querySelector('#private-source-output').hidden);assert.match(await page.textContent('#private-source-output'),/"present_in_snapshot": true/);
  await page.getByRole('button',{name:'Delete record',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#private-records').textContent.includes('No retained Atlas records'));
  const analysis=await(await h.call('/v1/analyses','POST',{asset:'ETH',pages:1},cookie)).json(),selected=analysis.scores.rows[0];
  await page.selectOption('#private-kind','review');await page.selectOption('#private-state','reviewed');
  for(const [id,value]of [['private-subject',`${analysis.id}:${selected.id}`],['private-body','Synthetic reference reviewed'],['private-purpose','Delegated test research'],['private-basis','Documented test basis'],['private-licence','Synthetic source fixture']])await page.fill('#'+id,value);
  await page.click('#private-save');await page.waitForFunction(()=>document.querySelector('#private-records').textContent.includes('Synthetic reference reviewed'));
  const review=h.sqlite.prepare("SELECT id FROM atlas_records WHERE kind='review'").get();
  for(const [id,value]of [['grant-analysis',analysis.id],['grant-node',selected.id],['grant-review',review.id],['grant-grantee','Synthetic named grantee'],['grant-purpose','Bounded test reference review']])await page.fill('#'+id,value);
  await page.locator('#private-grant-form button').click();await page.locator('#private-grant-token:visible').waitFor();const grant=JSON.parse(await page.textContent('#private-grant-token'));
  const delegated=await page.request.get(origin+grant.endpoint,{headers:{authorization:'Bearer '+grant.token}});assert.equal(delegated.status(),200);assert.equal((await delegated.json()).score.id,selected.id);
  await page.getByRole('button',{name:'Revoke grant',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#private-grant-status').textContent.includes('revoked immediately'));
  assert.equal((await page.request.get(origin+grant.endpoint,{headers:{authorization:'Bearer '+grant.token}})).status(),401);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',assets:5,public_requests:calls,checks:['field inspector','exact amounts','baseline','filters','pagination','JSON/CSV exports','holdout evaluation','tampered imports','late source failure','local module handoffs','mobile','private CRUD','official references','scoped grant issuance and revocation','no browser errors']}));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));h.sqlite.close();}
