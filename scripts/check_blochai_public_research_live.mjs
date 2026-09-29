import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {ASSISTANT_ASSET_VERSION} from '../deploy/blochai-public/catalog.js';

// Opt-in production verification: one scoped GPU submission per selected portal.
// Lookup references come from existing fixed public graph/overview sources.
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const transactionRegression=process.env.BLOCHAI_TEST_CASE==='bloch_tx';
const directory=new URL(transactionRegression?'../.data/blochai-utxo-live-qa/':'../.data/blochai-public-research-live/',import.meta.url);await mkdir(directory,{recursive:true});
const selected=process.env.BLOCHAI_TEST_SITE;
function parseCSV(csv){
  const rows=[];let row=[],cell='',quoted=false;csv=csv.replace(/^\uFEFF/,'');
  for(let i=0;i<csv.length;i++){
    const char=csv[i];
    if(char==='"'){if(quoted&&csv[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(char===','&&!quoted){row.push(cell);cell='';}
    else if(char==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
    else cell+=char;
  }
  assert.equal(quoted,false,'CSV quotations must close');if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
  const fields=rows.shift();assert.ok(fields?.length);return {fields,records:rows.map(values=>{assert.equal(values.length,fields.length);return Object.fromEntries(fields.map((field,index)=>[field,values[index]]));})};
}
async function graphSample(asset){
  const url=`https://bloch-graphus.xyz/api/chain/network?asset=${asset}`;
  const response=await fetch(url,{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(20000),headers:{accept:'application/json','user-agent':'BlochAI-Live-Verification/1.0'}});
  assert.ok(response.ok,`${asset} public graph source: ${response.status}`);const data=await response.json();assert.equal(data.asset,asset);assert.ok(Array.isArray(data.nodes));return {url,data};
}
let btc=null,eth=null;
if(!transactionRegression&&(!selected||selected==='graphus')){
  const source=await graphSample('BTC'),reference=source.data.nodes.find(node=>node.kind==='address'&&typeof node.address==='string')?.address;assert.ok(reference,'Public Bitcoin graph must provide an address');btc={reference,source:source.url,anchor:source.data.anchor};
}
if(!selected||selected==='space'){
  const url='https://bloch.space/api/overview?network=ethereum',response=await fetch(url,{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(20000),headers:{accept:'application/json','user-agent':'BlochAI-Live-Verification/1.0'}});assert.ok(response.ok,`ETH public overview source: ${response.status}`);const data=await response.json();assert.equal(data.network,'ethereum');const checkpoint=data.finalized||data.head,reference=checkpoint?.transactions?.find(tx=>/^0x[a-f0-9]{64}$/i.test(tx));assert.ok(reference,'Public Ethereum checkpoint must provide a transaction');eth={reference,source:url,anchor:{height:checkpoint.number,hash:checkpoint.hash},retrieved_at:data.retrieved_at};
}
const browser=await webkit.launch({headless:true}),results=[];
try{
  const cases=[transactionRegression?{name:'graphus',url:'https://bloch-graphus.xyz/',network:'bloch',question:'transaction_analysis',subject:{kind:'transaction',value:'b175dabd32b3cced98cda8fc5b3b12f5ab2eb86a269e58337f03bb46cc12c063'}}:{name:'graphus',url:'https://bloch-graphus.xyz/',network:'bitcoin',question:'wallet_summary',subject:btc?{kind:'address',value:btc.reference}:null,referenceSource:btc},
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
      const exported=JSON.parse(await readFile(new URL(`${item.name}.json`,directory),'utf8'));assert.equal(exported.portal,item.name);assert.equal(exported.classification,'PUBLIC');assert.equal(exported.question_id,item.question);assert.equal(exported.network,item.network);assert.equal(exported.output,result.output);assert.equal(exported.answer_kind,'source_summary');assert.equal(await widget.locator('.blochai-assistant__answer-label').innerText(),'Source-based explanation');assert.deepEqual(exported.amount_units,{BTC:'sat',ETH:'wei',BLCH:'sat'});assert.ok(exported.answer_facts.length<=4);for(const fact of exported.answer_facts){assert.ok(result.output.includes(`${fact.label}: ${fact.value}${fact.unit?' '+fact.unit:''}.`),`${item.name}: explanation preserves exact relevant fact`);assert.ok(exported.facts.some(item=>JSON.stringify(item)===JSON.stringify(fact)));assert.ok(result.output.includes(`[${fact.source_id}]`));}for(const fact of exported.facts){assert.ok(fact.source_id);assert.ok(exported.sources.some(source=>source.id===fact.source_id&&['available','partial'].includes(source.status)));}assert.doesNotMatch(result.output,/\$|verified by the curator/i);
      assert.ok(exported.sources.some(source=>source.status==='available'),`${item.name}: a real source must be available`);assert.ok(exported.facts.length>0&&exported.facts.length<=48,`${item.name}: bounded nonempty public facts`);assert.ok(exported.transactions.length<=20);assert.ok(exported.graph.nodes.length<=40);assert.ok(exported.graph.edges.length<=80);assert.ok(exported.graph.nodes.length>0,`${item.name}: public graph is present`);
      assert.equal(exported.derived_facts.length,4,`${item.name}: graph-derived facts are exported`);assert.ok(exported.insights.length>0&&exported.insights.length<=8);
      assert.equal(await widget.locator('.blochai-assistant__insight').count(),exported.insights.length);
      const readingText=await widget.locator('.blochai-assistant__insights').innerText();
      for(const insight of exported.insights){assert.ok(readingText.includes(insight.title));assert.ok(readingText.includes(insight.text));assert.ok(insight.source_ids.length>0);assert.ok(insight.source_ids.every(id=>exported.sources.some(source=>source.id===id)));}
      assert.ok(exported.insights.some(insight=>insight.id==='graph_structure'));assert.ok(exported.insights.some(insight=>insight.id==='source_freshness'));
      if(item.subject)assert.deepEqual(exported.subject,item.subject);for(const source of exported.sources){assert.equal(new URL(source.url).protocol,'https:');assert.ok(!source.url.includes('rednblue.space'));}
      if(transactionRegression){const tx=exported.transactions[0];assert.equal(exported.transactions.length,1);assert.equal(tx.hash,item.subject.value);assert.equal(tx.record_type,'utxo');assert.equal(tx.block_height,'102217');assert.equal(tx.slot,'132142');assert.equal(tx.inputs.length,1);assert.equal(tx.outputs.length,2);assert.equal(tx.timestamp,'');assert.equal(tx.source_id,'transaction_observation');assert.ok(tx.inputs.every(row=>row.address&&row.reference&&/^\d+$/.test(row.amount)));assert.ok(tx.outputs.every(row=>row.address&&row.reference&&/^\d+$/.test(row.amount)));const text=await widget.locator('.blochai-assistant__transaction').textContent();assert.ok(text.includes('Input 1')&&text.includes('Output 2'));assert.ok(text.includes('Transaction time was not supplied by this source.'));assert.ok(!text.includes('Not recorded'));result.utxoRegression={block:tx.block_height,slot:tx.slot,inputs:tx.inputs.length,outputs:tx.outputs.length,exactValues:true,missingTimeExplained:true};}
      if(item.name==='space'){assert.equal(exported.transactions.length,1);assert.equal(exported.transactions[0].hash.toLowerCase(),item.subject.value.toLowerCase());assert.ok(/^\d+$/.test(exported.transactions[0].amount));}
      const csv=await readFile(new URL(`${item.name}.csv`,directory),'utf8'),parsed=parseCSV(csv);for(const field of ['amount_base_units','source_url','source_id','observed_at'])assert.ok(parsed.fields.includes(field),`${item.name}: CSV ${field}`);if(exported.transactions.some(tx=>tx.amount))assert.match(csv,/"(?:sat|wei)"/);
      for(const tx of exported.transactions){const row=parsed.records.find(row=>row.record_type==='transaction'&&row.hash===tx.hash);assert.ok(row);assert.equal(row.source_id,tx.source_id);for(const side of ['inputs','outputs'])for(const record of tx[side]||[]){const child=parsed.records.find(row=>row.record_type===(side==='inputs'?'transaction_input':'transaction_output')&&row.hash===tx.hash&&row.reference===(record.reference||'')&&row.address===(record.address||''));assert.ok(child);assert.equal(child.amount_base_units,record.amount||'');assert.equal(child.source_id,tx.source_id);}}
      for(const source of exported.sources){const row=parsed.records.find(row=>row.record_type==='source'&&row.source_id===source.id);assert.ok(row,`${item.name}: CSV source ID preserved`);assert.equal(row.source_url,source.url);assert.equal(row.observed_at,source.observed_at||'');assert.equal(row.retrieved_at,source.retrieved_at||'');}
      for(const fact of exported.facts){const row=parsed.records.find(row=>row.record_type==='fact'&&row.label===fact.label);assert.ok(row);assert.equal(row.source_id,fact.source_id);assert.equal(row.value,String(fact.value));}
      for(const insight of exported.insights){const row=parsed.records.find(row=>row.record_type==='insight'&&row.label===insight.title);assert.ok(row);assert.equal(row.value,insight.text);assert.equal(row.source_ids,insight.source_ids.join(' '));for(const id of insight.source_ids)assert.ok(parsed.records.some(source=>source.record_type==='source'&&source.source_id===id));}
      assert.equal(parsed.records.filter(row=>row.record_type==='derived_fact').length,exported.derived_facts.length);
      const pdf=await readFile(new URL(`${item.name}.pdf`,directory));assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>10000);result.downloads={json:true,csv:true,pdf:true,pdfBytes:pdf.length,csvSourceIdentityAndTimes:true,csvInsightSourceLinks:true};result.snapshot={facts:exported.facts.length,answerFacts:exported.answer_facts.length,derivedFacts:exported.derived_facts.length,insights:exported.insights.length,transactions:exported.transactions.length,nodes:exported.graph.nodes.length,edges:exported.graph.edges.length,sourceStatus:exported.source_status,sources:exported.sources};
      for(const width of [1440,390,360]){
        await page.setViewportSize({width,height:width===1440?1000:844});await panel.evaluate(element=>{element.scrollTop=0;});
        const view=await panel.evaluate(element=>{const r=element.getBoundingClientRect();return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,panelWidth:element.scrollWidth,clientWidth:element.clientWidth,inside:r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1};});assert.ok(view.documentWidth<=width+1,`${item.name}: page overflow at ${width}`);assert.ok(view.panelWidth<=view.clientWidth+1,`${item.name}: panel overflow at ${width}`);assert.ok(view.inside);result.views.push(view);await page.screenshot({path:new URL(`${item.name}-${width}.png`,directory).pathname});
      }
      await widget.locator('.blochai-assistant__clear').click();assert.equal(await widget.locator('.blochai-assistant__turn').count(),0);assert.equal(await widget.locator('.blochai-assistant__export').isDisabled(),true);assert.equal(await widget.locator('[name="subject_value"]').inputValue(),'');result.clear=true;assert.deepEqual(errors,[]);
      console.log(JSON.stringify({portal:item.name,status:'verified',downloads:result.downloads,snapshot:{facts:result.snapshot.facts,derivedFacts:result.snapshot.derivedFacts,insights:result.snapshot.insights,transactions:result.snapshot.transactions,nodes:result.snapshot.nodes,edges:result.snapshot.edges}}));results.push(result);await writeFile(new URL('report.json',directory),JSON.stringify(results,null,2));
    }catch(error){await page.screenshot({path:new URL(`${item.name}-failure.png`,directory).pathname});await writeFile(new URL(`${item.name}-failure.html`,directory),await page.content());throw error;}finally{await page.close();}
  }
}finally{await browser.close();}
