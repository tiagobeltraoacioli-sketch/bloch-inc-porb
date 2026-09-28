import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildBlochAiPdf,downloadBlochAiPdf} from '../site/blochai-shared/blochai-pdf.js';
import {PDFDocument,PDFName,PDFArray,PDFDict} from '../site/blochai-shared/blochai-pdf-lib.js';

const fontBytes=await readFile(new URL('../site/blochai-shared/BlochAI-DejaVuSans.ttf',import.meta.url));
const base={portal:'Graphus',classification:'PUBLIC',generatedAt:'2026-09-28T12:00:00Z',exchanges:[{question:'Como interpretar conexões públicas?',answer:'São observações: não demonstram identidade, intenção, risco ou propriedade. Ação, João, evidência e cobertura.',model:'synthetic-test-model',sources:[{title:'Graphus overview',url:'https://bloch-graphus.xyz/',retrieved_at:'2026-09-28T11:59:00Z',coverage:'Synthetic fixture only; no real wallet or case.'}]}]};
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
