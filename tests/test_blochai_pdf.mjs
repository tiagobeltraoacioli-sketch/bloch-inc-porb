import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildBlochAiPdf,downloadBlochAiPdf} from '../site/blochai-shared/blochai-pdf.js';
import {PDFDocument,PDFName,PDFArray,PDFDict,PDFRawStream,decodePDFRawStream} from '../site/blochai-shared/blochai-pdf-lib.js';

const fontBytes=await readFile(new URL('../site/blochai-shared/BlochAI-DejaVuSans.ttf',import.meta.url));
const base={portal:'Graphus',classification:'PUBLIC',generatedAt:'2026-09-28T12:00:00Z',exchanges:[{question:'Como interpretar conexões públicas?',answer:'São observações: não demonstram identidade, intenção, risco ou propriedade. Ação, João, evidência e cobertura.',model:'synthetic-test-model',sources:[{title:'Graphus overview',url:'https://bloch-graphus.xyz/',retrieved_at:'2026-09-28T11:59:00Z',coverage:'Synthetic fixture only; no real wallet or case.'}]}]};
// Read the exported text through its embedded Unicode map, including font ligatures.
function pageText(page){
  const fonts=page.node.Resources().lookup(PDFName.of('Font'),PDFDict),font=fonts.lookup(fonts.keys()[0],PDFDict);
  const decode=stream=>new TextDecoder().decode(decodePDFRawStream(stream).decode());
  const cmap=decode(font.lookup(PDFName.of('ToUnicode'),PDFRawStream)),characters=new Map();
  for(const [,glyph,unicode]of cmap.matchAll(/<([\da-f]{4})>\s*<([\da-f]+)>/gi))characters.set(glyph.toUpperCase(),String.fromCharCode(...unicode.match(/.{4}/g).map(value=>parseInt(value,16))));
  const contents=page.node.Contents();
  return Array.from({length:contents.size()},(_,index)=>decode(contents.lookup(index,PDFRawStream))).flatMap(content=>Array.from(content.matchAll(/<([\da-f]+)>\s*Tj/gi),match=>match[1].match(/.{4}/g).map(glyph=>characters.get(glyph.toUpperCase())??'').join(''))).join('\n');
}
test('source cards preserve IDs and observed timestamps separately from retrieval timestamps',async()=>{
  const input=structuredClone(base);Object.assign(input.exchanges[0].sources[0],{id:'public-chain-snapshot-1',observed_at:'2026-09-28T08:58:30-03:00'});
  const pdf=await PDFDocument.load(await buildBlochAiPdf(input,{fontBytes})),content=pdf.getPages().map(pageText).join('\n');
  assert.match(content,/Source ID: public-chain-snapshot-1/);
  assert.match(content,/Observed: 2026-09-28T11:58:30\.000Z/);
  assert.match(content,/Retrieved: 2026-09-28T11:59:00\.000Z/);
  const legacy=await PDFDocument.load(await buildBlochAiPdf(base,{fontBytes})),legacyContent=legacy.getPages().map(pageText).join('\n');
  assert.doesNotMatch(legacyContent,/Source ID:|Observed:/);
  assert.match(legacyContent,/Retrieved: 2026-09-28T11:59:00\.000Z/);
});
test('unknown observation timestamps never become invented dates',async()=>{
  const input=structuredClone(base);input.exchanges[0].sources=[null,undefined,'','   ','unknown','invalid-timestamp',0,false,'0','2026-02-30T12:00:00Z','2026-09-28','September 28, 2026'].map((observed_at,index)=>({title:`Unknown timestamp ${index+1}`,observed_at}));
  const pdf=await PDFDocument.load(await buildBlochAiPdf(input,{fontBytes})),content=pdf.getPages().map(pageText).join('\n');
  assert.equal(content.match(/Observed: Not recorded/g)?.length,12);
  assert.doesNotMatch(content,/1970-01-01|Observed: 2026/);
});
test('bounded long source IDs wrap with their complete cards across multiple pages',async()=>{
  const input=structuredClone(base);
  input.exchanges[0].sources=Array.from({length:12},(_,index)=>({id:'W'.repeat(62)+String(index+1).padStart(2,'0'),title:`Source card ${index+1}`,observed_at:'2026-09-27T11:00:00Z',retrieved_at:'2026-09-28T11:59:00Z',coverage:'Synthetic bounded source coverage. '.repeat(35)}));
  const pdf=await PDFDocument.load(await buildBlochAiPdf(input,{fontBytes})),pages=pdf.getPages().map(pageText),content=pages.join('\n');
  assert.ok(pdf.getPageCount()>2);assert.equal(content.match(/Source ID:/g)?.length,12);
  assert.equal(content.match(/Observed: 2026-09-27T11:00:00\.000Z/g)?.length,12);
  for(const [index,source]of input.exchanges[0].sources.entries()){
    const page=pages.find(value=>value.includes(`${index+1}. Source card ${index+1}\n`));assert.ok(page);
    assert.ok(page.replace(/\s+/g,'').includes(`SourceID:${source.id}`));
    assert.match(page,/Observed: 2026-09-27T11:00:00\.000Z/);
  }
});
test('fact references stay with exact string values and legacy or derived facts gain no invented source',async()=>{
  const input=structuredClone(base),id='public-chain-snapshot-1',value='123456789012345678901234567890123456789';
  Object.assign(input.exchanges[0].sources[0],{id});
  input.exchanges[0].facts=[{label:'Observed amount',value,unit:'wei',source_id:id},{label:'Derived from the bounded sample',value:'2',unit:'records'},{label:'Legacy fact',value:'0',unit:'records'}];
  const pdf=await PDFDocument.load(await buildBlochAiPdf(input,{fontBytes})),content=pdf.getPages().map(pageText).join('\n');
  assert.ok(content.includes(`Observed amount: ${value} wei\nSource ID: ${id}`));
  assert.match(content,/Derived from the bounded sample: 2 records\nLegacy fact: 0 records/);
  assert.equal(content.match(/Source ID:/g)?.length,2);
});
test('derived facts preserve six long source references outside their bounded labels and values',async()=>{
  const input=structuredClone(base),ids=Array.from({length:6},(_,index)=>'W'.repeat(63)+index),label='Derived: '+'label '.repeat(29),value='1234567890'.repeat(60);
  input.exchanges[0].facts=[{label,value,source_id:'legacy-single-source',source_ids:ids}];
  input.exchanges[0].sources=ids.map(id=>({id,title:'Supporting source',status:'available'}));
  const pdf=await PDFDocument.load(await buildBlochAiPdf(input,{fontBytes})),content=pdf.getPages().map(pageText).join('\n'),compact=content.replace(/\s+/g,'');
  assert.ok(compact.includes(`${label.slice(0,180).replace(/\s+/g,'')}:${value}SourceID:legacy-single-sourceSourceIDs:${ids.join(',')}`));
  assert.equal(content.match(/Source IDs:/g)?.length,1);
  input.exchanges[0].facts[0].source_ids.push('seventh-source');await assert.rejects(buildBlochAiPdf(input,{fontBytes}),/at most 6 source/);
  input.exchanges[0].facts[0].source_ids='not-an-array';await assert.rejects(buildBlochAiPdf(input,{fontBytes}),/at most 6 source/);
});
test('malformed and overlong identifiers do not become truncated source references',async()=>{
  const input=structuredClone(base);
  input.exchanges[0].sources=[{title:'Malformed source',id:'invalid/source'},{title:'Oversized source',id:'x'.repeat(65)}];
  input.exchanges[0].facts=[{label:'Fact',value:'1',source_id:'invalid/source',source_ids:['invalid/source','x'.repeat(65)]},{label:'Fact',value:'2',source_id:'x'.repeat(65)}];
  const pdf=await PDFDocument.load(await buildBlochAiPdf(input,{fontBytes}));assert.doesNotMatch(pdf.getPages().map(pageText).join('\n'),/Source IDs?:/);
});
test('sixty bounded long facts keep their references with each fact across pages',async()=>{
  const input=structuredClone(base),id='public-chain-snapshot-1',value='1234567890'.repeat(60);
  Object.assign(input.exchanges[0].sources[0],{id});
  input.exchanges[0].facts=Array.from({length:60},(_,index)=>({label:`Fact ${index+1}: `+'Long label '.repeat(20),value,unit:'wei',source_id:id}));
  const pdf=await PDFDocument.load(await buildBlochAiPdf(input,{fontBytes})),pages=pdf.getPages().map(pageText);
  assert.ok(pages.length>5);assert.equal(pages.join('\n').match(/Source ID:/g)?.length,61);
  for(const [index,fact]of input.exchanges[0].facts.entries()){
    const page=pages.find(content=>content.includes(`Fact ${index+1}: `));assert.ok(page);
    assert.ok(page.replace(/\s+/g,'').includes(`${fact.label.slice(0,180).replace(/\s+/g,'')}:${value}weiSourceID:${id}`));
  }
});
test('PDF embeds a Unicode font, produces multiple real pages and only HTTPS links',async()=>{
  const input=structuredClone(base);input.exchanges[0].answer+='\n'+('A análise descreve registros públicos com fontes e cobertura limitada. <script>alert(1)</script> '.repeat(65));
  input.exchanges[0].sources.push({title:'Literal unsafe URL',url:'javascript:alert(1)'});
  const bytes=await buildBlochAiPdf(input,{fontBytes});assert.equal(Buffer.from(bytes.subarray(0,5)).toString(),'%PDF-');
  const pdf=await PDFDocument.load(bytes);assert.ok(pdf.getPageCount()>=2);assert.match(pdf.getTitle(),/Graphus/);
  assert.equal(pdf.catalog.has(PDFName.of('OpenAction')),false);assert.equal(pdf.catalog.has(PDFName.of('AcroForm')),false);assert.equal(pdf.catalog.has(PDFName.of('Names')),false);
  const fonts=pdf.getPage(0).node.Resources().lookup(PDFName.of('Font'),PDFDict);assert.ok(fonts.keys().some(key=>fonts.lookup(key,PDFDict).has(PDFName.of('ToUnicode'))));
  const links=pdf.getPages().flatMap(page=>{const annotations=page.node.Annots();return annotations?Array.from({length:annotations.size()},(_,i)=>annotations.lookup(i,PDFDict)):[];});
  assert.equal(links.length,1);assert.equal(links[0].lookup(PDFName.of('A'),PDFDict).get(PDFName.of('S')).toString(),'/URI');
  assert.equal(links[0].lookup(PDFName.of('A'),PDFDict).get(PDFName.of('URI')).decodeText(),'https://bloch-graphus.xyz/');
});
test('graph and transaction data export as bounded vector pages',async()=>{
  const input=structuredClone(base);input.graph={nodes:[{id:'a',label:'Synthetic source',kind:'address'},{id:'b',label:'Synthetic transaction',kind:'transaction'}],edges:[{source:'a',target:'b',label:'observed input'}]};input.transactions=[{hash:'synthetic-tx-1',from:'synthetic-address-a',to:'synthetic-address-b',amount:'10',asset:'TEST',timestamp:'2026-09-28',status:'Synthetic only'}];
  const pdf=await PDFDocument.load(await buildBlochAiPdf(input,{fontBytes}));assert.ok(pdf.getPageCount()>=2);
  input.graph.edges[0].target='unknown';await assert.rejects(buildBlochAiPdf(input,{fontBytes}),/reference an exported node/);
  input.graph.nodes=Array.from({length:41},(_,i)=>({id:String(i)}));await assert.rejects(buildBlochAiPdf(input,{fontBytes}),/at most 40 nodes/);
  delete input.graph;input.transactions=Array.from({length:21},()=>({}));await assert.rejects(buildBlochAiPdf(input,{fontBytes}),/at most 20/);
});
test('UTXO transactions preserve anchors and separate input/output records without invented transfer totals',async()=>{
  const input=structuredClone(base),amount='354099998999980506',hash='a'.repeat(64),blockHash='b'.repeat(64);
  input.transactions=[{record_type:'utxo',hash,asset:'BLCH',block_height:'102217',block_hash:blockHash,slot:'132142',source_id:'network_graph',status:'source-reported',inputs:[{reference:`${'c'.repeat(64)}:0`,address:'d'.repeat(64),amount}],outputs:[{reference:`${hash}:0`,address:'e'.repeat(64),amount:'0'},{reference:`${hash}:1`,address:'d'.repeat(64),amount:'344099998999978340'}],coverage:'A bounded input/output sample; completeness is not established.'}];
  const pdf=await PDFDocument.load(await buildBlochAiPdf(input,{fontBytes})),content=pdf.getPages().map(pageText).join('\n');
  assert.match(content,/Transaction 1 \/ UTXO records/);assert.match(content,/Block height: 102217/);assert.match(content,/Slot: 132142/);
  assert.ok(content.replace(/\s+/g,'').includes(`Blockhash:${blockHash}`));assert.match(content,/Source ID: network_graph/);
  assert.match(content,/Transaction 1 \/ Inputs/);assert.match(content,/Transaction 1 \/ Outputs/);
  assert.ok(content.includes(`Amount: ${amount} sat`));assert.match(content,/Amount: 0 sat/);
  assert.match(content,/Transaction time was not supplied by this source\./);
  assert.doesNotMatch(content,/From:|To:|Declared amount|Amount \(base units\):|Timestamp: Not recorded/);
  assert.match(content,/not added into a transfer total/);
});
test('legacy BTC and BLCH snapshots explain missing input/output details without generic account placeholders',async()=>{
  const input=structuredClone(base);input.transactions=['BTC','BLCH'].map(asset=>({hash:'a'.repeat(64),asset,status:'source-reported'}));
  const pdf=await PDFDocument.load(await buildBlochAiPdf(input,{fontBytes})),content=pdf.getPages().map(pageText).join('\n');
  assert.equal(content.match(/\/ UTXO records/g)?.length,2);
  assert.equal(content.match(/Input\/output details were not included in this snapshot/g)?.length,2);
  assert.equal(content.match(/Transaction time was not supplied by this source/g)?.length,2);
  assert.doesNotMatch(content,/From: Not recorded|To: Not recorded|Amount \(base units\): Not recorded/);
});
test('account transactions retain declared amounts including zero and explain unavailable fields',async()=>{
  const input=structuredClone(base);input.transactions=[{record_type:'account',hash:'0x'+'a'.repeat(64),asset:'ETH',amount:'0',from:'0x'+'b'.repeat(40),timestamp:'2026-09-29T00:29:00.000Z'},{record_type:'account',hash:'0x'+'c'.repeat(64),asset:'ETH'}];
  const pdf=await PDFDocument.load(await buildBlochAiPdf(input,{fontBytes})),content=pdf.getPages().map(pageText).join('\n');
  assert.match(content,/Declared amount \(base units\): 0 wei/);assert.match(content,/Timestamp: 2026-09-29T00:29:00\.000Z/);
  assert.match(content,/Not supplied for this account transaction: recipient\./);
  assert.match(content,/Not supplied for this account transaction: sender, recipient, declared amount\./);
  assert.equal(content.match(/Transaction time was not supplied by this source/g)?.length,1);
});
test('long UTXO records remain grouped and identifiable across multiple pages',async()=>{
  const input=structuredClone(base),amount='9'.repeat(78),entries=Array.from({length:24},(_,index)=>({reference:`reference-${index}-`+'r'.repeat(145),address:'a'.repeat(160),amount}));
  input.transactions=[{record_type:'utxo',hash:'b'.repeat(64),asset:'BTC',inputs:entries,outputs:entries}];
  const pdf=await PDFDocument.load(await buildBlochAiPdf(input,{fontBytes})),pages=pdf.getPages().map(pageText),content=pages.join('\n');
  assert.ok(pages.length>3);assert.match(content,/Transaction 1 \/ Inputs \(continued\)/);assert.match(content,/Transaction 1 \/ Outputs \(continued\)/);
  assert.equal(content.match(/Amount: /g)?.length,48);
  for(const name of ['Input','Output'])assert.ok(pages.find(page=>page.includes(`Transaction 1 / ${name}s\n`))?.includes(`${name} 1\n`));
  for(const name of ['Input','Output'])for(let index=1;index<=24;index++){
    const page=pages.find(value=>value.includes(`${name} ${index}\n`));assert.ok(page);
    const record=page.split(`${name} ${index}\n`)[1];assert.ok(record.replace(/\s+/g,'').includes(`Amount:${amount}sat`));
  }
});
test('input/output records are bounded by side and by snapshot',async()=>{
  const input=structuredClone(base),entries=count=>Array.from({length:count},(_,index)=>({reference:`output-${index}`,amount:'0'}));
  input.transactions=[{asset:'BTC',inputs:entries(25)}];await assert.rejects(buildBlochAiPdf(input,{fontBytes}),/at most 24/);
  input.transactions=[{asset:'BTC',inputs:entries(24),outputs:entries(24)},{asset:'BTC',inputs:entries(17),outputs:entries(16)}];await assert.rejects(buildBlochAiPdf(input,{fontBytes}),/at most 80/);
  input.transactions[1].inputs=entries(16);const pdf=await PDFDocument.load(await buildBlochAiPdf(input,{fontBytes}));
  assert.equal(pdf.getPages().map(pageText).join('\n').match(/Amount: 0 sat/g)?.length,80);
});
test('a single-node graph uses the available page instead of forcing a sparse extra page',async()=>{
  const input=structuredClone(base);input.graph={nodes:[{id:'synthetic-address',label:'Synthetic address',kind:'address'}],edges:[]};
  const pdf=await PDFDocument.load(await buildBlochAiPdf(input,{fontBytes}));assert.equal(pdf.getPageCount(),1);
});
test('PDF refuses incomplete, unclassified and oversized content before loading assets',async()=>{
  await assert.rejects(buildBlochAiPdf({...base,classification:'PRIVATE'}),/classification/);
  await assert.rejects(buildBlochAiPdf({...base,exchanges:[{question:'Pending',answer:''}]}),/Only completed/);
  await assert.rejects(buildBlochAiPdf({...base,exchanges:Array.from({length:13},()=>base.exchanges[0])}),/between 1 and 12/);
  await assert.rejects(buildBlochAiPdf({...base,exchanges:[{question:'Q',answer:'x'.repeat(16001)}]}),/content limit/);
  await assert.rejects(buildBlochAiPdf({...base,exchanges:Array.from({length:8},()=>({question:'Q',answer:'x'.repeat(16000)}))}),/too large/);
  await assert.rejects(downloadBlochAiPdf(base,{isCurrent:()=>false}),/conversation changed/);
  await assert.rejects(buildBlochAiPdf({...base,exchanges:[{...base.exchanges[0],research:{instructions:'Private instructions'}}]}),/confidential export/);
});
test('download is cancelled if the active conversation changes while PDF bytes are built',async()=>{
  const previousFetch=globalThis.fetch,previousLocation=globalThis.location;let checks=0;
  try{globalThis.location={origin:'null'};globalThis.fetch=async()=>new Response(fontBytes);await assert.rejects(downloadBlochAiPdf(base,{isCurrent:()=>++checks===1}),/conversation changed/);assert.equal(checks,2);}
  finally{globalThis.fetch=previousFetch;if(previousLocation===undefined)delete globalThis.location;else globalThis.location=previousLocation;}
});
test('vendored libraries and font match the reviewed manifest',async()=>{
  const dir=new URL('../site/blochai-shared/',import.meta.url),manifest=JSON.parse(await readFile(new URL('vendor-manifest.json',dir),'utf8'));
  for(const [name,hash]of Object.entries(manifest))assert.equal(createHash('sha256').update(await readFile(new URL(name,dir))).digest('hex'),hash,name);
});
