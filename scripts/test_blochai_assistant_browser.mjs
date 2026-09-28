import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {assistantMarkup,publicPortals} from '../deploy/blochai-public/catalog.js';

const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const live=process.env.BLOCHAI_BROWSER_LIVE==='1',browser=await webkit.launch({headless:true}),results=[],directory=new URL(live?'../.data/blochai-assistant-live/':'../.data/blochai-assistant-browser/',import.meta.url);
const script=await readFile(new URL('../site/blochai-public/blochai-assistant.js',import.meta.url),'utf8'),style=await readFile(new URL('../site/blochai-public/blochai-assistant.css',import.meta.url),'utf8');
await mkdir(directory,{recursive:true});
try{
  for(const [hostname,path,origin]of [['bloch-graphus.xyz','/','https://bloch-graphus.pages.dev/'],['bloch.space','/app/','https://bloch-space.pages.dev/app/'],['blochl1.com','/','https://bloch-explorer.pages.dev/']].filter(([host])=>!process.env.BLOCHAI_TEST_HOST||host===process.env.BLOCHAI_TEST_HOST)){
    const page=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:live?'allow':'block'}),portal=publicPortals[hostname],requests=[],errors=[],fixtureOutput='<script>window.blochaiUnsafe=true</script> Synthetic portal guidance about '+portal.name+'.',id='a'.repeat(64),ticket='b'.repeat(64);
    console.log('Checking public portal:',portal.id);page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
    if(!live){
      await page.route(`https://${hostname}${path}`,async route=>{
        const response=await route.fetch({url:origin}),html=await response.text(),headers={...response.headers()};delete headers['content-length'];delete headers['content-encoding'];
        await route.fulfill({status:response.status(),headers,body:html.replace('</head>','<link rel="stylesheet" href="/blochai-assistant.css"></head>').replace('</body>',`${assistantMarkup(hostname)}</body>`)});
      });
      await page.route(`https://${hostname}/blochai-assistant.js`,route=>route.fulfill({contentType:'application/javascript',body:script}));
      await page.route(`https://${hostname}/blochai-assistant.css`,route=>route.fulfill({contentType:'text/css',body:style}));
      await page.route(`https://${hostname}/api/blochai/tasks**`,async route=>{
        const request=route.request(),headers=request.headers();requests.push({url:request.url(),method:request.method(),body:request.postData()});assert.equal(headers['x-blochai-client'],'public-v1');assert.equal(headers.cookie,undefined);
        if(request.method()==='POST'){assert.deepEqual(request.postDataJSON(),{question_id:Object.keys(portal.questions)[0]});await route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({task_id:id,status:'PENDING',portal:portal.id,model:'synthetic-browser-model',output:null,poll_token:ticket})});}
        else{assert.equal(headers['x-blochai-ticket'],ticket);await route.fulfill({contentType:'application/json',body:JSON.stringify({task_id:id,status:'COMPLETED',portal:portal.id,model:'synthetic-browser-model',output:fixtureOutput})});}
      });
    }
    await page.goto(`https://${hostname}${path}`,{waitUntil:'domcontentloaded',timeout:45000});await page.locator('.blochai-assistant__trigger').waitFor();await page.waitForTimeout(1500);console.log('Widget loaded:',portal.id);
    const root=page.locator('.blochai-assistant');assert.equal(await root.count(),1);assert.equal(await root.locator('input,textarea,iframe').count(),0);assert.equal(await page.locator('script[src="/blochai-assistant.js"]').count(),1);
    await root.locator('.blochai-assistant__trigger').click();assert.deepEqual(await root.locator('option').evaluateAll(options=>options.map(option=>option.value)),Object.keys(portal.questions));assert.equal(await root.locator('select').evaluate(element=>document.activeElement===element),true);
    await root.locator('.blochai-assistant__submit').click();console.log('Question submitted:',portal.id);try{await root.locator('.blochai-assistant__output').waitFor({state:'visible',timeout:live?180000:20000});}catch(error){console.log('Widget status:',await root.locator('.blochai-assistant__status').innerText(),{requests,errors});throw error;}assert.equal(await root.locator('.blochai-assistant__submit').isEnabled(),true);
    const text=await root.locator('.blochai-assistant__output').innerText();if(!live)assert.equal(text,fixtureOutput);assert.equal(await page.evaluate(()=>Boolean(window.blochaiUnsafe)),false);assert.match(await root.locator('.blochai-assistant__meta').innerText(),/Public explanation, not live analysis/);
    const views=[];
    for(const width of [1440,390,360]){
      await page.setViewportSize({width,height:width===1440?1000:844});await page.waitForTimeout(150);
      const view=await root.locator('.blochai-assistant__panel').evaluate(element=>{const rect=element.getBoundingClientRect();return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,panel:{x:rect.x,y:rect.y,width:rect.width,height:rect.height,right:rect.right,bottom:rect.bottom},inside:rect.left>=0&&rect.right<=innerWidth+1&&rect.top>=0&&rect.bottom<=innerHeight+1};});
      assert.ok(view.inside,`${portal.id} panel outside viewport at ${width}`);assert.ok(view.documentWidth<=width+1,`${portal.id} page overflow at ${width}: ${view.documentWidth}`);await page.screenshot({path:new URL(`${portal.id}-${width}.png`,directory).pathname});views.push(view);
    }
    await root.locator('select').focus();await page.keyboard.press('Escape');assert.equal(await root.locator('.blochai-assistant__panel').isHidden(),true);assert.equal(await root.locator('.blochai-assistant__trigger').evaluate(element=>document.activeElement===element),true);
    assert.equal(await page.evaluate(()=>[...Object.keys(localStorage),...Object.keys(sessionStorage)].some(key=>/blochai/i.test(key))),false);
    if(!live)assert.equal(requests.length,2);
    console.log('Portal browser checks passed:',portal.id);results.push({portal:portal.id,mode:live?'live GPU':'synthetic inference / real origin HTML',responseChars:text.length,views,errors});await page.close();
  }
  await writeFile(new URL('report.json',directory),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));assert.ok(results.every(result=>result.errors.length===0),'Origin page emitted JavaScript errors; review the report.');
}finally{await browser.close();}
