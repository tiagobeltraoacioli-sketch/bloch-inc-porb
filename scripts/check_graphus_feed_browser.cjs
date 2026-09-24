const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.GRAPHUS_URL||'http://127.0.0.1:8097',adapterMode=process.env.GRAPHUS_ADAPTERS==='1';
(async()=>{
  const browser=await webkit.launch(),errors=[],results=[],observed=[];
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
    if(adapterMode){
      const {queryNetworkGraph}=await import(pathToFileURL(path.resolve('graphus/chain/network-graph.js'))),{queryBalanceSample}=await import(pathToFileURL(path.resolve('graphus/chain/balance-sample.js')));
      const {queryChainWallet}=await import(pathToFileURL(path.resolve('graphus/chain/real-chain.js'))),{queryEthereumActivity}=await import(pathToFileURL(path.resolve('graphus/chain/ethereum-activity.js'))),{queryBlochHolders}=await import(pathToFileURL(path.resolve('graphus/chain/bloch-holders.js')));
      const cache=new Map(),env={GRAPHUS_ETHEREUM_RPC_URL:'https://ethereum-rpc.publicnode.com'};
      await page.route('**/api/chain/**',async route=>{
        const url=new URL(route.request().url()),asset=url.searchParams.get('asset');let result;
        if(url.pathname.endsWith('/network')){if(!cache.has(url.search))cache.set(url.search,queryNetworkGraph({asset,cursor:url.searchParams.get('cursor'),env}));result=await cache.get(url.search);}
        else if(url.pathname.endsWith('/balances'))result=await queryBalanceSample({asset,addresses:url.searchParams.get('addresses').split(','),env});
        else if(url.pathname.endsWith('/wallet'))result=await queryChainWallet({asset,address:url.searchParams.get('address'),network:url.searchParams.get('network'),env});
        else if(url.pathname.endsWith('/activity'))result=await queryEthereumActivity({asset,address:url.searchParams.get('address'),env});
        else if(url.pathname.endsWith('/holders'))result=await queryBlochHolders();
        else result={status:404,body:{error:'unsupported_check_route'}};
        await route.fulfill({status:result.status,contentType:'application/json',body:JSON.stringify(result.body)});
      });
    }
    const waitNetwork=async()=>{await page.waitForFunction(()=>!document.querySelector('#net-refresh').disabled,{},{timeout:120000});assert.notEqual(await page.locator('#net-status').getAttribute('data-error'),'true',await page.locator('#net-status').innerText());};
    const download=async selector=>{const promise=page.waitForEvent('download');await page.locator(selector).click();return JSON.parse(fs.readFileSync(await (await promise).path(),'utf8'));};
    for(const asset of process.env.GRAPHUS_CHECK_PART==='balances'?[]:['BLCH','BTC','ETH','USDT','USDC']){
      await page.goto(base+'/constellation.html?asset='+asset);await waitNetwork();await page.locator('#net-auto').uncheck();
      assert.equal(await page.locator('.constellation-workspace').isVisible(),false);
      const first=await download('#net-export');assert.equal(first.dataset.status,'source-reported');assert.ok(first.dataset.edges.length>0);
      if(await page.locator('#net-older').isEnabled()){await page.locator('#net-older').click();await waitNetwork();}
      const next=await download('#net-export');assert.ok(next.dataset.edges.length>=first.dataset.edges.length);assert.ok(next.dataset.snapshots.length>=1);
      const ids=next.dataset.edges.map(e=>e.event_id);assert.equal(new Set(ids).size,ids.length);
      assert.ok(next.dataset.edges.every(e=>e.txid&&e.block_hash));assert.ok(next.dataset.nodes.every(n=>!('owner' in n)&&!('name' in n)));
      const edge=next.dataset.edges[0];await page.locator('#net-path-from').selectOption(edge.from);await page.locator('#net-path-to').selectOption(edge.to);await page.locator('#net-path').click();assert.match(await page.locator('#net-path-result').innerText(),/directed steps/);
      await page.locator('#net-references button').first().click();assert.ok((await page.locator('#net-detail').innerText()).length>30);
      await page.locator('#net-timeline button').first().click();assert.notEqual(await page.locator('#net-block').inputValue(),'all');await page.locator('#net-clear-focus').click();
      await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,asset+' overflow');await page.setViewportSize({width:1440,height:1000});
      if(asset==='BLCH')await page.locator('.net-grid').screenshot({path:'/private/tmp/graphus-live-constellation.png'});
      results.push({asset,first:first.dataset.edges.length,collected:next.dataset.edges.length,snapshots:next.dataset.snapshots.length});console.log(JSON.stringify({network:results.at(-1)}));
    }
    if(results.length){await page.locator('#net-analytics').click();await page.waitForURL('**/analytics*');assert.match(await page.locator('#lab-badge').innerText(),/REAL NETWORK COLLECTION/);assert.equal(await page.evaluate(()=>sessionStorage.getItem('graphus.analytics.network.v1')),null);}
    for(const asset of ['ETH','USDT','USDC','BTC']){
      await page.goto(base+'/oculum.html?asset='+asset);
      await page.waitForFunction(()=>!document.querySelector('#oculum-discover').disabled,{},{timeout:120000});await page.locator('#oculum-auto').uncheck();
      const status=await page.locator('#oculum-source-status').innerText();assert.notEqual(await page.locator('#oculum-source-status').getAttribute('data-state'),'error',status);
      const before=await download('#oculum-export-json');assert.ok(before.records.length>0);assert.ok(before.records.every(r=>r.discovery&&/^\d+$/.test(r.baseUnits)));
      await page.locator('#oculum-discover').click();await page.waitForFunction(()=>!document.querySelector('#oculum-discover').disabled,{},{timeout:120000});
      const more=await download('#oculum-export-json');assert.ok(more.records.length>=before.records.length);assert.ok(more.records.length<=64);
      await page.locator('#oculum-refresh').click();await page.waitForFunction(()=>!document.querySelector('#oculum-refresh').disabled,{},{timeout:120000});
      const updated=await download('#oculum-export-json');assert.ok(updated.records.some(r=>r.history.length>=2));
      assert.ok(await page.locator('.oculum-balance-bar').count()>0);assert.match(await page.locator('#oculum-sample-summary').innerText(),/observed identifiers/);
      await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Oculum '+asset+' overflow');if(asset==='USDC')await page.screenshot({path:'/private/tmp/graphus-live-oculum-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1000});
      observed.push({asset,addresses:updated.records.length,history:true});console.log(JSON.stringify({balances:observed.at(-1)}));
    }
    let retryRequests=0;await page.route('**/api/chain/network?asset=ETH',route=>++retryRequests===1?route.fulfill({status:502,json:{error:'test_transient_failure'}}):route.fallback());await page.goto(base+'/constellation.html?asset=ETH');await waitNetwork();assert.equal(retryRequests,2);assert.ok(await page.locator('#net-references button').count()>0);
    await page.route('**/api/chain/network?*',route=>route.fulfill({status:503,json:{error:'test_failure'}}));await page.goto(base+'/constellation.html?asset=ETH');await page.waitForFunction(()=>document.querySelector('#net-status').dataset.error==='true');assert.equal(await page.locator('#net-references button').count(),0);assert.equal(await page.locator('.constellation-workspace').isVisible(),false);
    await page.route('**/api/chain/wallet?*',route=>route.fulfill({status:503,json:{error:'test_failure'}}));await page.goto(base+'/constellation.html?asset=ETH&address=0x0000000000000000000000000000000000000001');await page.waitForFunction(()=>document.body.dataset.constellationMode==='empty');assert.equal(await page.locator('#accessible-records button').count(),0);
    assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',networks:results,balanceSamples:observed,noSyntheticFallback:true,browserErrors:errors}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
