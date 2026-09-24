const assert=require('node:assert/strict');
const fs=require('node:fs');
const {webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.GRAPHUS_URL||'http://127.0.0.1:8096';
(async()=>{
  const browser=await webkit.launch();const errors=[],results=[];
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',error=>errors.push(error.message));
    if(process.env.GRAPHUS_SNAPSHOT_DIR)await page.route('**/api/chain/network?asset=*',route=>{
      const asset=new URL(route.request().url()).searchParams.get('asset');assert.ok(['BLCH','BTC','ETH','USDT','USDC'].includes(asset));
      return route.fulfill({contentType:'application/json',body:fs.readFileSync(`${process.env.GRAPHUS_SNAPSHOT_DIR}/graphus-live-${asset}.json`,'utf8')});
    });
    for(const asset of ['BLCH','BTC','ETH','USDT','USDC']){
      await page.goto(base+'/analytics.html'+(asset==='BLCH'?'':'?asset='+asset));
      await page.waitForFunction(()=>document.querySelector('#lab-badge').innerText.includes('REAL CHAIN DATA')||document.querySelector('#lab-message').dataset.error==='true',{},{timeout:65000});
      assert.match(await page.locator('#lab-badge').innerText(),/REAL CHAIN DATA/,`${asset}: ${await page.locator('#lab-message').innerText()}`);
      assert.equal(await page.locator('#lab-asset').inputValue(),asset);
      const source=await page.locator('#lab-source-detail').innerText();assert.match(source,/Anchor/);assert.doesNotMatch(source,/synthetic|demonstration/i);
      assert.ok(await page.locator('#lab-ledger-body a').count()>0);
      const downloadPromise=page.waitForEvent('download');await page.locator('#lab-export-json').click();const download=await downloadPromise;
      const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(exported.dataset.status,'source-reported');assert.ok(exported.dataset.edges.length>0);
      assert.ok(exported.dataset.edges.every(edge=>edge.block_hash&&edge.txid&&!edge.id.startsWith('SIM')));
      results.push({asset,nodes:exported.dataset.nodes.length,connections:exported.dataset.edges.length,anchor:exported.dataset.anchor.height});
      await page.setViewportSize({width:390,height:844});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Mobile overflow: ${asset}`);
      if(asset==='USDC')await page.screenshot({path:'/private/tmp/graphus-real-usdc-mobile.png',fullPage:true});
      await page.setViewportSize({width:1440,height:1000});
      if(asset==='BLCH')await page.locator('.lab-network-grid').screenshot({path:'/private/tmp/graphus-real-bloch-network.png'});
    }
    // Real-source failure never creates synthetic replacement records.
    await page.route('**/api/chain/network?asset=ETH',route=>route.fulfill({status:503,json:{error:'test_source_unavailable'}}));
    await page.goto(base+'/analytics.html?asset=ETH');
    await page.waitForFunction(()=>document.querySelector('#lab-message').dataset.error==='true');
    assert.equal(await page.locator('#lab-graph-workspace').isVisible(),false);
    assert.match(await page.locator('#lab-badge').innerText(),/UNAVAILABLE/);
    await page.locator('#lab-demo').click();assert.match(await page.locator('#lab-badge').innerText(),/SYNTHETIC/);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({status:'passed',real_datasets:results,mobileOverflow:false,browserErrors:errors,noSyntheticFallback:true}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
