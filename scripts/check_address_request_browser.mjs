// Isolated transport recovery. Error pages, chain reports and accounts are synthetic.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {setup,credentials} from '../tests/porb_helpers.mjs';
import {portalBrowserServer} from '../tests/portal_browser_server.js';
import {researchReport,researchFixture} from '../tests/address_research_fixture.js';
import {spaceDataFixture} from '../tests/space_portal_fixture.js';
import {researchHash,verifyResearch} from '../space/public/assets/address-research-core.js';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||process.argv[2]||'playwright');
const root=resolve(new URL('../',import.meta.url).pathname),h=await setup(),cookie=await h.login();
assert.equal((await h.call('/v1/analyses','POST',{asset:'USDT',pages:1},cookie)).status,201);
const errors=[],reads=[],retainedReads=[],revisions=new Map();let failed=0,options={},invalidShape=false,wrongScope=false,delay=false,release,arrived,started;
function deferNext(){delay=true;started=new Promise(resolve=>{arrived=resolve;});}
async function source(url,init){
 const u=new URL(url),asset=u.searchParams.get('asset');reads.push({asset,reference:u.searchParams.get('query')});assert.equal(init?.headers?.cookie,undefined);assert.equal(init?.headers?.authorization,undefined);
 if(failed)return Response.json({error:'source_unavailable'},{status:failed,headers:{'retry-after':'0'}});
 const value=await researchReport(asset,{reference:wrongScope?'0x'+'f'.repeat(40):u.searchParams.get('query'),...options});
 if(value.status!==200)return Response.json(value.body,{status:value.status});
 const {report_sha256,...body}=value.body,revision=revisions.get(asset)||0;
 if(revision){body.retrieved_at=new Date(Date.UTC(2026,8,27,18,revision)).toISOString();if(body.modules.ledger.status==='available')body.modules.ledger.data.wallet.balance.base_units=(BigInt(body.modules.ledger.data.wallet.balance.base_units)+BigInt(revision)).toString();}
 if(invalidShape)body.modules=null;
 const report={...body,report_sha256:await researchHash(body)};
 if(delay){delay=false;arrived();await new Promise(resolve=>{release=resolve;});}
 return Response.json(report);
}
const portal=await portalBrowserServer(h,{fetcher:source,after:async(response,request)=>{if(new URL(request.url).pathname==='/api/porb/v1/references')retainedReads.push(request.url);return response;}});
const headers=Object.fromEntries((await readFile(resolve(root,'space/public/_headers'),'utf8')).split('\n\n')[0].split('\n').slice(1).filter(Boolean).map(line=>{const i=line.indexOf(':');return [line.slice(0,i).trim(),line.slice(i+1).trim()];}));
const server=createServer(async(req,res)=>{try{
 const u=new URL(req.url,'https://bloch.space');let response;
 if(u.pathname==='/api/research')response=await source(u.href);
 else if(u.pathname==='/api/overview')response=Response.json(spaceDataFixture(u.searchParams.get('network')));
 else{const file=resolve(root,'space/public','.'+decodeURIComponent(u.pathname)+(u.pathname.endsWith('/')?'index.html':''));assert.ok(file.startsWith(resolve(root,'space/public')+'/'));response=new Response(await readFile(file),{headers:{...headers,'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream'}});}
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){res.writeHead(404);res.end(error.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const space=`http://127.0.0.1:${server.address().port}`;
const browser=await webkit.launch(),context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to/.test(m.text()))errors.push(m.text());});
await page.clock.install();
const attempts=[];let edge=null;
await page.route(/\/api\/(?:porb\/v1\/space\/)?research\?/,async route=>{
  attempts.push(route.request().url());
  if(edge)await route.fulfill({status:edge.status,headers:edge.headers||{},contentType:'text/html',body:'<html><title>PRIVATE UPSTREAM DETAIL</title><script>window.untrustedExecuted=true</script>Bad gateway</html>'});else await route.continue();
});
const download=async selector=>{const pending=page.waitForEvent('download');await page.click(selector);return JSON.parse(await readFile(await(await pending).path(),'utf8'));};
const current=()=>download('[data-research-export]');
const loaded=()=>page.locator('[data-research-refresh]').waitFor();
async function publicSearch(asset='USDT'){
  await page.selectOption('#public-address-form [name=asset]',asset);await page.fill('#public-address-form [name=query]',researchFixture(asset==='ETH_ALL'?'ETH':asset).reference);await page.click('#public-address-form button');
}
async function updateFailure(){await page.click('[data-research-refresh]');await page.waitForFunction(()=>document.querySelector('[data-research-status]')?.textContent.includes('update unavailable'));}
async function expired(ms){const n=attempts.length;await page.clock.fastForward(ms);await page.waitForFunction(()=>document.querySelector('[data-research-wait]').hidden);assert.equal(attempts.length,n,'Expiry cannot send a request automatically');}
async function forced(form){const n=attempts.length;await page.locator(form).evaluate(node=>node.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(attempts.length,n,'Repeated submit cannot bypass the requested pause');}
async function checkPause(form,expected){
  assert.equal(await page.locator('[data-research-wait]').isVisible(),true);assert.equal(await page.locator(form+' button').isDisabled(),true);assert.equal(await page.locator('[data-research-refresh]').isDisabled(),true);
  assert.deepEqual(await current(),expected);await forced(form);assert.deepEqual(await current(),expected);assert.equal(await page.evaluate(()=>Boolean(window.untrustedExecuted)),false);assert.ok(!(await page.locator('body').innerText()).includes('PRIVATE UPSTREAM DETAIL'));
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.setViewportSize({width:1440,height:1000});
}
try{
  await page.goto(portal.origin+'/explore/');edge={status:502,headers:{'retry-after':'9'}};await publicSearch();await page.waitForFunction(()=>document.querySelector('#public-address-status').textContent.startsWith('Address research unavailable:'));
  assert.match(await page.locator('#public-address-status').innerText(),/source could not return a usable report/i);assert.ok(!(await page.locator('#public-address-status').innerText()).includes('JSON'));await forced('#public-address-form');await expired(10000);
  edge=null;await publicSearch();await loaded();revisions.set('USDT',1);await page.click('[data-research-refresh]');await page.waitForFunction(()=>document.querySelector('[data-research-status]').textContent.startsWith('USDT updated'));
  await page.click('[data-research-compare]');await page.locator('[data-comparison-export]').waitFor();await page.click('[data-ae=toggle]');await page.selectOption('[data-ae=direction]','incoming');const captured=await current(),previous=await download('[data-research-previous]'),comparison=await download('[data-comparison-export]');
  edge={status:429};await updateFailure();await checkPause('#public-address-form',captured);assert.match(await page.locator('[data-research-status]').innerText(),/request budget/);assert.equal(await page.locator('[data-ae=direction]').inputValue(),'incoming');assert.deepEqual(await download('[data-research-previous]'),previous);assert.deepEqual(await download('[data-comparison-export]'),comparison);await expired(61000);
  edge=null;await publicSearch('ETH_ALL');await page.locator('[data-bundle-export]').waitFor();const bundle=await download('[data-bundle-export]');edge={status:503,headers:{'retry-after':'14'}};await page.click('[data-bundle-asset=USDC]');await page.click('[data-bundle-refresh=USDC]');await page.waitForFunction(()=>document.querySelector('[data-bundle-status]').textContent.includes('update unavailable'));
  assert.equal(await page.locator('[data-bundle-refresh]:disabled').count(),3);assert.deepEqual(await download('[data-bundle-export]'),bundle);await forced('#public-address-form');assert.deepEqual(await download('[data-bundle-export]'),bundle);await expired(15000);
  edge=null;const n=attempts.length;await page.click('[data-bundle-refresh=USDC]');await page.waitForFunction(()=>document.querySelector('[data-bundle-status]').textContent.startsWith('USDC updated'));assert.equal(attempts.length,n+1);const latest=await download('[data-bundle-export]');assert.deepEqual(latest.results[0],bundle.results[0]);assert.deepEqual(latest.results[1],bundle.results[1]);
  edge={status:502,headers:{'retry-after':'10'}};await page.goto(space+'/?'+new URLSearchParams({network:'ethereum',asset:'USDT',kind:'address',query:researchFixture().reference}));await page.waitForFunction(()=>document.querySelector('#message').textContent.startsWith('Lookup unavailable:'));assert.ok(!(await page.locator('#message').innerText()).includes('JSON'));await expired(11000);
  edge=null;await page.click('#search-form button');await loaded();const spaceCapture=await current();
  const date=await page.evaluate(()=>new Date(Date.now()+20000).toUTCString());edge={status:504,headers:{'retry-after':date}};await updateFailure();await checkPause('#search-form',spaceCapture);await expired(21000);
  edge={status:200};await updateFailure();assert.equal(await page.locator('[data-research-wait]').isHidden(),true);assert.match(await page.locator('[data-research-status]').innerText(),/unsupported report/);assert.deepEqual(await current(),spaceCapture);
  edge=null;await page.goto(portal.origin+'/portal/?view=references');await page.fill('#auth-form [name=email]',credentials.email);await page.fill('#auth-form [name=password]',credentials.password);await page.click('#auth-submit');await page.locator('#workspace:visible').waitFor();await page.selectOption('#reference-form [name=asset]','USDT');await page.fill('#reference-form [name=reference]',researchFixture().reference);await page.click('#reference-form button');await loaded();await page.locator('#reference-results .list-row').waitFor();
  const retained=await page.locator('#reference-results').innerText(),privateCapture=await current(),retainedBefore=retainedReads.length;
  edge={status:429,headers:{'retry-after':'20'}};await updateFailure();await checkPause('#reference-form',privateCapture);assert.equal(await page.locator('#reference-results').innerText(),retained);assert.equal(retainedReads.length,retainedBefore);await expired(21000);
  edge={status:401,headers:{'retry-after':'60'}};await page.click('[data-research-refresh]');await page.locator('#gate:visible').waitFor();assert.equal(await page.locator('[data-research-session]').count(),0);assert.equal(await page.locator('[data-research-wait]').isHidden(),true,'Expired sessions clear both reports and their pause');
  edge=null;await page.fill('#auth-form [name=email]',credentials.email);await page.fill('#auth-form [name=password]',credentials.password);await page.click('#auth-submit');await page.locator('#workspace:visible').waitFor();assert.equal(await page.locator('#reference-form button').isDisabled(),false);
  await page.goto(portal.origin+'/space/?'+new URLSearchParams({network:'ethereum',asset:'USDT',kind:'address',query:researchFixture().reference}));await loaded();edge={status:502,headers:{'retry-after':'5'}};await updateFailure();await checkPause('#search-form',await current());await expired(6000);
  assert.deepEqual(errors,[]);
  if(process.argv.includes('--screenshots')){edge={status:502,headers:{'retry-after':'90'}};await updateFailure();await mkdir(resolve(root,'.data'),{recursive:true});for(const [name,width,height]of [['desktop',1440,1000],['mobile',390,844]]){await page.setViewportSize({width,height});await page.locator('[data-research-wait]').evaluate(node=>scrollTo({top:scrollY+node.getBoundingClientRect().top-180,behavior:'instant'}));await page.screenshot({caret:'initial',path:resolve(root,`.data/research-request-${name}.png`)});}}
  console.log(JSON.stringify({status:'passed',checks:['HTML edge failures keep status and safe messages','seconds, HTTP date and default 429 pause','initial, single and combined queries share a visible wait','manual and repeated submit cannot bypass a pause','no automatic retry on expiry; explicit retry makes one scoped request','current/previous JSON, comparisons, filters and private records survive errors','malformed HTTP 200 cannot replace a usable report','private 401 clears the workspace and recovery timing','public, authenticated and mounted Space; mobile, keyboard and CSP']}));
}catch(error){console.error({url:page.url(),errors,status:await page.locator('#public-address-status,#message,#status,[data-research-status],[data-research-wait]').allTextContents()});throw error;}
finally{release?.();await browser.close();await portal.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));h.sqlite.close();}
