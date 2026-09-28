import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

// Deliberate production check: at most one approved public question per portal.
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await webkit.launch({headless:true}),directory=new URL(process.env.BLOCHAI_SKIP_INFERENCE==='1'?'../.data/blochai-layout-check/':'../.data/blochai-live-browser/',import.meta.url),results=[];
await mkdir(directory,{recursive:true});
try{
  for(const [name,url]of [['graphus','https://bloch-graphus.xyz/'],['space','https://bloch.space/app/'],['explorer','https://blochl1.com/']].filter(([name])=>!process.env.BLOCHAI_TEST_SITE||process.env.BLOCHAI_TEST_SITE===name)){
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],submissions=[];page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(request.url().endsWith('/api/blochai/tasks')&&request.method()==='POST')submissions.push(request.postDataJSON());});
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
    const widget=page.locator('.blochai-assistant'),panel=widget.locator('.blochai-assistant__panel'),trigger=widget.locator('.blochai-assistant__trigger');
    console.log(JSON.stringify({stage:'page_loaded',name,url:page.url(),status:response.status(),marker:response.headers()['x-blochai-integration'],title:await page.title(),widgetCount:await widget.count()}));
    try{await trigger.waitFor({state:'visible',timeout:20000});}catch(error){await page.screenshot({path:new URL(`${name}-failure.png`,directory).pathname});await writeFile(new URL(`${name}-failure.html`,directory),await page.content());throw error;}assert.equal(await widget.count(),1);assert.equal(await widget.getAttribute('data-blochai-portal'),name);
    assert.equal(await widget.locator('.blochai-assistant__search').count(),1);await trigger.click();assert.equal(await panel.isVisible(),true);
    assert.equal(await widget.locator('.blochai-public-link').getAttribute('href'),'https://blochai.xyz/');
    const result={name,url:page.url(),status:response.status(),marker:response.headers()['x-blochai-integration'],views:[],errors};
    if(process.env.BLOCHAI_SKIP_INFERENCE!=='1'){
      await widget.locator('[data-topic]').first().click();
      await widget.locator('.blochai-assistant__submit').click();
      await page.waitForFunction(()=>{const status=document.querySelector('.blochai-assistant__status')?.textContent;return status?.startsWith('Explanation complete.')||(!document.querySelector('.blochai-assistant__submit')?.disabled&&status!== 'Only questions about this portal are available.');},{},{timeout:220000});
      const status=await widget.locator('.blochai-assistant__status').innerText();assert.match(status,/^Explanation complete\./,status);
      result.output=await widget.locator('.blochai-assistant__output').innerText();assert.ok(result.output.length>0);
      assert.equal(submissions.length,1);assert.deepEqual(Object.keys(submissions[0]),['question_id','mode','network']);result.submittedQuestion=submissions[0].question_id;
    }
    for(const width of [1440,390,360]){
      await page.setViewportSize({width,height:width===1440?1000:844});await page.evaluate(()=>scrollTo(0,0));
      const view=await panel.evaluate(element=>{const r=element.getBoundingClientRect();return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,panel:{x:r.x,y:r.y,width:r.width,height:r.height,insideViewport:r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1}};});
      assert.ok(view.documentWidth<=width+1,`${name} overflow at ${width}`);assert.ok(view.panel.insideViewport,`${name} panel outside ${width}`);
      await page.screenshot({path:new URL(`${name}-${width}-assistant.png`,directory).pathname});result.views.push(view);
    }
    await widget.locator('.blochai-assistant__close').click();assert.equal(await panel.isVisible(),false);await trigger.click();assert.equal(await panel.isVisible(),true);
    await page.keyboard.press('Escape');assert.equal(await panel.isVisible(),false);
    if(name==='space'){await page.reload({waitUntil:'domcontentloaded'});await page.locator('.blochai-assistant__trigger').waitFor({state:'visible',timeout:15000});result.queryReload=true;}
    result.widgetChecks=true;results.push(result);await page.close();
  }
  await writeFile(new URL('report.json',directory),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
