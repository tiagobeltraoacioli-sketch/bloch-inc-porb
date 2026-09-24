/* Run with GRAPHUS_URL and PLAYWRIGHT_MODULE; source responses are mocked unless LIVE_SOURCE=1. */
const assert=require('node:assert/strict');
const {webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.GRAPHUS_URL||'http://127.0.0.1:8096';
const source={status:'source-reported',asset:'BLCH',source:'browser-test-indexer',retrieved_at:'2026-09-24T00:00:00Z',
  anchor:{height:100,block_id:'a'.repeat(64)},coverage:{returned:3,positive_script_hashes_in_index:10,indexed_total_sat:'1000000000000'},
  holders:[{script_hash:'a'.repeat(64),balance_sat:'300000000000',utxo_count:2},
    {script_hash:'b'.repeat(64),balance_sat:'200000000000',utxo_count:4},
    {script_hash:'c'.repeat(64),balance_sat:'100000000000',utxo_count:1}]};
const observation={schema_version:1,kind:'graphus_public_chain_observation',status:'source-reported',
  query:{asset:'BTC',address:'test-reference'},source:{source_id:'browser-test-source',coverage:'two bounded records'},
  records:{nodes:[{id:'a',kind:'address',address:'test-reference'},{id:'tx',kind:'transaction',txid:'d'.repeat(64),block:{height:10}},{id:'b',kind:'address',address:'another-reference'}],
    edges:[{from:'a',to:'tx',kind:'observed_input_prevout',amount_base_units:'9007199254740993',block:{height:10}},
      {from:'tx',to:'b',kind:'created_output',amount_base_units:'9007199254740992',block:{height:10}}]}};
(async()=>{
  const browser=await webkit.launch({headless:true});
  try{
    const errors=[];
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror',e=>errors.push(e.message));
    if(process.env.LIVE_SOURCE!=='1')await page.route('**/api/chain/holders?asset=BLCH',route=>route.fulfill({json:source}));
    await page.goto(base+'/analytics.html');
    await page.waitForFunction(()=>document.querySelector('#lab-stats').innerText.includes('864'));
    assert.equal(await page.locator('.lab-charts:visible svg').count(),6);
    assert.match(await page.locator('#lab-badge').innerText(),/SYNTHETIC/);
    await page.screenshot({path:'/private/tmp/graphus-analytics-desktop.png',fullPage:true});
    await page.locator('.lab-network-grid').screenshot({path:'/private/tmp/graphus-analytics-network.png'});
    await page.locator('#lab-node-list button').first().click();
    assert.equal(await page.locator('#lab-focus').isEnabled(),true);
    await page.locator('#lab-focus').click();
    assert.match(await page.locator('#lab-message').innerText(),/Neighborhood isolated/);
    await page.locator('#lab-reset').click();
    const edge=await page.evaluate(()=>GraphusAnalytics.fixture('ETH').edges.find(e=>e.from!==e.to));
    await page.locator('#lab-path-from').selectOption(edge.from);await page.locator('#lab-path-to').selectOption(edge.to);
    await page.locator('#lab-path-form button').click();
    assert.match(await page.locator('#lab-path-result').innerText(),/1 connection steps/);
    await page.locator('#lab-from').fill('200000');await page.locator('#lab-apply').click();
    assert.match(await page.locator('#lab-ledger-body').innerText(),/No records/);
    await page.locator('#lab-reset').click();
    await page.locator('#lab-next').click();assert.match(await page.locator('#lab-page').innerText(),/Page 2/);
    await page.locator('#lab-record-search').fill(edge.id);assert.match(await page.locator('#lab-page').innerText(),/Page 1/);
    const csvPromise=page.waitForEvent('download');await page.locator('#lab-export-csv').click();
    assert.match((await csvPromise).suggestedFilename(),/connections.csv$/);
    await page.locator('#lab-import').setInputFiles({name:'observation.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(observation))});
    await page.waitForFunction(()=>document.querySelector('#lab-badge').innerText.includes('IMPORTED'));
    assert.match(await page.locator('#lab-ledger-body').innerText(),/9007199254740993/);
    assert.match(await page.locator('#lab-message').innerText(),/not uploaded/);
    await page.locator('#lab-import').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"kind":"bad"}')});
    await page.waitForFunction(()=>document.querySelector('#lab-message').dataset.error==='true');
    assert.match(await page.locator('#lab-ledger-body').innerText(),/9007199254740993/);
    // Exercise the one-use, same-tab handoff used by Constellation.
    await page.evaluate(value=>sessionStorage.setItem('graphus.analytics.observation.v1',JSON.stringify(value)),observation);
    await page.goto(base+'/analytics.html?import=observation');
    await page.waitForFunction(()=>document.querySelector('#lab-badge').innerText.includes('IMPORTED'));
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('graphus.analytics.observation.v1')),null);
    await page.locator('#lab-holders').click();
    await page.waitForFunction(()=>!document.querySelector('#lab-balances-workspace').hidden,{},{timeout:45000});
    assert.ok(await page.locator('#lab-balance-body tr').count()>0);
    assert.match(await page.locator('#lab-badge').innerText(),/SOURCE-REPORTED/);
    if(process.env.LIVE_SOURCE!=='1')assert.match(await page.locator('#lab-balance-boundary').innerText(),/truncated ranking/);
    await page.screenshot({path:'/private/tmp/graphus-analytics-balances.png',fullPage:true});
    const mobile=await browser.newPage({viewport:{width:390,height:844}});mobile.on('pageerror',e=>errors.push(e.message));
    for(const asset of ['ETH','USDT','USDC','BTC','BLCH']){
      await mobile.goto(base+'/analytics.html?asset='+asset);
      await mobile.waitForFunction(()=>document.querySelector('#lab-stats').innerText.includes('864'));
      assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Mobile overflow for ${asset}`);
      assert.equal(await mobile.locator('.lab-charts:visible svg').count(),6);
    }
    await mobile.screenshot({path:'/private/tmp/graphus-analytics-mobile.png',fullPage:true});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({status:'passed',assets:5,graphCharts:6,balanceCharts:2,filters:true,paths:true,exactImport:true,localHandoff:true,csvDownload:true,mobileOverflow:false,browserErrors:errors,liveSource:process.env.LIVE_SOURCE==='1'}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
