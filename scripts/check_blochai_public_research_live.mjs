import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {ASSISTANT_ASSET_VERSION} from '../deploy/blochai-public/catalog.js';

// Opt-in production verification: one scoped GPU submission per selected portal.
// Lookup references come from existing fixed public graph/overview sources.
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const directory=new URL('../.data/blochai-public-research-live/',import.meta.url);await mkdir(directory,{recursive:true});
const selected=process.env.BLOCHAI_TEST_SITE;
async function graphSample(asset){
  const url=`https://bloch-graphus.xyz/api/chain/network?asset=${asset}`;
  const response=await fetch(url,{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(20000),headers:{accept:'application/json','user-agent':'BlochAI-Live-Verification/1.0'}});
  assert.ok(response.ok,`${asset} public graph source: ${response.status}`);const data=await response.json();assert.equal(data.asset,asset);assert.ok(Array.isArray(data.nodes));return {url,data};
}
let btc=null,eth=null;
if(!selected||selected==='graphus'){
  const source=await graphSample('BTC'),reference=source.data.nodes.find(node=>node.kind==='address'&&typeof node.address==='string')?.address;assert.ok(reference,'Public Bitcoin graph must provide an address');btc={reference,source:source.url,anchor:source.data.anchor};
}
if(!selected||selected==='space'){
  const url='https://bloch.space/api/overview?network=ethereum',response=await fetch(url,{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(20000),headers:{accept:'application/json','user-agent':'BlochAI-Live-Verification/1.0'}});assert.ok(response.ok,`ETH public overview source: ${response.status}`);const data=await response.json();assert.equal(data.network,'ethereum');const checkpoint=data.finalized||data.head,reference=checkpoint?.transactions?.find(tx=>/^0x[a-f0-9]{64}$/i.test(tx));assert.ok(reference,'Public Ethereum checkpoint must provide a transaction');eth={reference,source:url,anchor:{height:checkpoint.number,hash:checkpoint.hash},retrieved_at:data.retrieved_at};
}
const browser=await webkit.launch({headless:true}),results=[];
try{
  const cases=[{name:'graphus',url:'https://bloch-graphus.xyz/',network:'bitcoin',question:'wallet_summary',subject:btc?{kind:'address',value:btc.reference}:null,referenceSource:btc},
    {name:'space',url:'https://bloch.space/app/',network:'ethereum',question:'transaction_analysis',subject:eth?{kind:'transaction',value:eth.reference}:null,referenceSource:eth},
    {name:'explorer',url:'https://blochl1.com/',network:'bloch',question:'health'}].filter(item=>!selected||item.name===selected);
  for(const item of cases){
    const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[],submissions=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.url().endsWith('/api/blochai/tasks')&&request.method()==='POST')submissions.push(request.postDataJSON());});
    const result={portal:item.name,network:item.network,question:item.question,referenceSource:item.referenceSource,views:[],errors};
    try{
      const response=await page.goto(item.url,{waitUntil:'domcontentloaded',timeout:45000});result.status=response.status();result.marker=response.headers()['x-blochai-integration'];
      const widget=page.locator('.blochai-assistant'),panel=widget.locator('.blochai-assistant__panel');await widget.locator('.blochai-assistant__trigger').waitFor({state:'visible',timeout:20000});await widget.locator('.blochai-assistant__trigger').click();
      assert.equal(await page.locator('link[href*="blochai-assistant.css"]').getAttribute('href'),`/blochai-assistant.css?v=${ASSISTANT_ASSET_VERSION}`);assert.equal(await page.locator('script[src*="blochai-assistant.js"]').getAttribute('src'),`/blochai-assistant.js?v=${ASSISTANT_ASSET_VERSION}`);
      result.controlContrast=await widget.evaluate(root=>{const lum=value=>(value.match(/[\d.]+/g)||[]).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((total,n,i)=>total+n*[.2126,.7152,.0722][i],0);return [...root.querySelectorAll('button,input,select')].filter(element=>element.getBoundingClientRect().height).map(element=>{const s=getComputedStyle(element),a=lum(s.color),b=lum(s.backgroundColor);return {label:element.textContent.trim().slice(0,50)||element.getAttribute('name')||'search',ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),opacity:s.opacity,colorScheme:s.colorScheme};});});for(const c of result.controlContrast){assert.ok(c.ratio>=4.5,`${item.name}: control contrast ${c.label}: ${c.ratio}`);assert.equal(c.opacity,'1');assert.equal(c.colorScheme,'light');}
      assert.equal(await widget.getAttribute('data-blochai-portal'),item.name);await widget.locator('.blochai-assistant__search').fill('private AML records and credentials');assert.equal(await widget.locator('.blochai-assistant__submit').isDisabled(),true);assert.equal(submissions.length,0);
      if(item.name==='explorer')assert.equal(await widget.locator('[name="network"]').inputValue(),'bloch');else await widget.locator('[name="network"]').selectOption(item.network);await widget.locator('[name="mode"]').selectOption('summary');
      if(item.subject){await widget.locator('[name="subject_kind"]').selectOption(item.subject.kind);await widget.locator('[name="subject_value"]').fill(item.subject.value);}
      await widget.locator(`[data-topic="${item.question}"]`).click();await widget.locator('.blochai-assistant__submit').click();
      await page.waitForFunction(()=>document.querySelectorAll('.blochai-assistant__turn').length>0||!document.querySelector('.blochai-assistant__submit')?.disabled,{},{timeout:220000});
      const status=await widget.locator('.blochai-assistant__status').innerText();assert.match(status,/^Explanation complete\./,status);assert.equal(submissions.length,1);assert.deepEqual(submissions[0],{question_id:item.question,mode:'summary',network:item.network,...(item.subject?{subject:item.subject}:{})});
      result.output=await widget.locator('.blochai-assistant__output').innerText();assert.ok(result.output.trim());assert.equal(await widget.locator('.blochai-assistant__turn').count(),1);
      for(const kind of ['JSON','CSV','PDF']){
        const downloadEvent=page.waitForEvent('download',{timeout:45000});await widget.getByRole('button',{name:`Download ${kind}`,exact:true}).click();const download=await downloadEvent;assert.equal(await download.failure(),null);await download.saveAs(new URL(`${item.name}.${kind.toLowerCase()}`,directory).pathname);
      }
      const exported=JSON.parse(await readFile(new URL(`${item.name}.json`,directory),'utf8'));assert.equal(exported.portal,item.name);assert.equal(exported.classification,'PUBLIC');assert.equal(exported.question_id,item.question);assert.equal(exported.network,item.network);assert.equal(exported.output,result.output);assert.equal(exported.answer_kind,'source_summary');assert.equal(await widget.locator('.blochai-assistant__answer-label').innerText(),'Source-based explanation');assert.deepEqual(exported.amount_units,{BTC:'sat',ETH:'wei',BLCH:'sat'});for(const fact of exported.facts.slice(0,4))assert.ok(result.output.includes(`${fact.label}: ${fact.value}${fact.unit?' '+fact.unit:''}.`),`${item.name}: explanation preserves exact observed fact`);assert.doesNotMatch(result.output,/\$|verified by the curator/i);
      assert.ok(exported.sources.some(source=>source.status==='available'),`${item.name}: a real source must be available`);assert.ok(exported.facts.length>0,`${item.name}: nonempty public facts`);assert.ok(exported.transactions.length<=20);assert.ok(exported.graph.nodes.length<=40);assert.ok(exported.graph.edges.length<=80);assert.ok(exported.graph.nodes.length>0,`${item.name}: public graph is present`);
      if(item.subject)assert.deepEqual(exported.subject,item.subject);for(const source of exported.sources){assert.equal(new URL(source.url).protocol,'https:');assert.ok(!source.url.includes('rednblue.space'));}
      if(item.name==='space'){assert.equal(exported.transactions.length,1);assert.equal(exported.transactions[0].hash.toLowerCase(),item.subject.value.toLowerCase());assert.ok(/^\d+$/.test(exported.transactions[0].amount));}
      const csv=await readFile(new URL(`${item.name}.csv`,directory),'utf8');assert.match(csv,/amount_base_units/);assert.match(csv,/source_url/);if(exported.transactions.some(tx=>tx.amount))assert.match(csv,/"(?:sat|wei)"/);
      const pdf=await readFile(new URL(`${item.name}.pdf`,directory));assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>10000);result.downloads={json:true,csv:true,pdf:true,pdfBytes:pdf.length};result.snapshot={facts:exported.facts.length,transactions:exported.transactions.length,nodes:exported.graph.nodes.length,edges:exported.graph.edges.length,sourceStatus:exported.source_status,sources:exported.sources};
      for(const width of [1440,390,360]){
        await page.setViewportSize({width,height:width===1440?1000:844});await panel.evaluate(element=>{element.scrollTop=0;});
        const view=await panel.evaluate(element=>{const r=element.getBoundingClientRect();return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,panelWidth:element.scrollWidth,clientWidth:element.clientWidth,inside:r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1};});assert.ok(view.documentWidth<=width+1,`${item.name}: page overflow at ${width}`);assert.ok(view.panelWidth<=view.clientWidth+1,`${item.name}: panel overflow at ${width}`);assert.ok(view.inside);result.views.push(view);await page.screenshot({path:new URL(`${item.name}-${width}.png`,directory).pathname});
      }
      await widget.locator('.blochai-assistant__clear').click();assert.equal(await widget.locator('.blochai-assistant__turn').count(),0);assert.equal(await widget.locator('.blochai-assistant__export').isDisabled(),true);assert.equal(await widget.locator('[name="subject_value"]').inputValue(),'');result.clear=true;assert.deepEqual(errors,[]);
      console.log(JSON.stringify({portal:item.name,status:'verified',downloads:result.downloads,snapshot:{facts:result.snapshot.facts,transactions:result.snapshot.transactions,nodes:result.snapshot.nodes,edges:result.snapshot.edges},output:result.output}));results.push(result);await writeFile(new URL('report.json',directory),JSON.stringify(results,null,2));
    }catch(error){await page.screenshot({path:new URL(`${item.name}-failure.png`,directory).pathname});await writeFile(new URL(`${item.name}-failure.html`,directory),await page.content());throw error;}finally{await page.close();}
  }
}finally{await browser.close();}
