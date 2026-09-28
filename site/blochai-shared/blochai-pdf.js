import {PDFDocument,rgb,PDFName,PDFString} from './blochai-pdf-lib.js';
import fontkit from './blochai-fontkit.js';

const MAX_EXCHANGES=12,MAX_CHARACTERS=96000,MAX_PAGES=90;
const FONT_URL=new URL('./BlochAI-DejaVuSans.ttf',import.meta.url);
const text=(value,limit=16000)=>String(value??'').normalize('NFC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').slice(0,limit);
const safeURL=value=>{try{const url=new URL(String(value));return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}};
const dateText=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?date.toISOString():'Not recorded';};

function prepare(input){
  if(!input||!['PUBLIC','CONFIDENTIAL'].includes(input.classification))throw new Error('A PDF classification is required.');
  if(!Array.isArray(input.exchanges)||!input.exchanges.length||input.exchanges.length>MAX_EXCHANGES)throw new Error('Export between 1 and 12 completed interactions.');
  let length=0;
  const bounded=(value,limit)=>{const result=text(value,limit);length+=result.length;if(length>MAX_CHARACTERS)throw new Error('This export is too large. Export fewer interactions.');return result;};
  const graph=value=>{
    if(!value)return null;
    if(!Array.isArray(value.nodes)||!Array.isArray(value.edges)||value.nodes.length>40||value.edges.length>80)throw new Error('Export graphs with at most 40 nodes and 80 edges.');
    const nodes=value.nodes.map(node=>({id:bounded(node.id,180),label:bounded(node.label||node.id,220),kind:bounded(node.kind,60)})),ids=new Set(nodes.map(node=>node.id));
    if(ids.size!==nodes.length||ids.has(''))throw new Error('Graph nodes need unique identifiers.');
    const edges=value.edges.map(edge=>({source:bounded(edge.source,180),target:bounded(edge.target,180),label:bounded(edge.label,180)}));
    if(edges.some(edge=>!ids.has(edge.source)||!ids.has(edge.target)))throw new Error('Graph edges must reference an exported node.');
    return {title:bounded(value.title||'Observed relationship graph',180),coverage:bounded(value.coverage||'Bounded observations only. Connections do not establish identity, control, ownership or risk.',1800),nodes,edges};
  };
  const transactions=value=>{
    if(!value)return [];
    if(!Array.isArray(value)||value.length>20)throw new Error('Export at most 20 transaction records.');
    return value.map(row=>Object.fromEntries(['hash','from','to','amount','asset','timestamp','status'].map(key=>[key,bounded(row[key]===undefined||row[key]===null||row[key]===''?'Not recorded':row[key],key==='hash'||key==='from'||key==='to'?220:140)])));
  };
  const facts=value=>{
    if(!value)return [];
    if(!Array.isArray(value)||value.length>60)throw new Error('Export at most 60 observed facts.');
    return value.map(row=>({label:bounded(row.label,180),value:bounded(row.value,600),unit:bounded(row.unit,60)}));
  };
  const research=value=>{
    if(!value)return null;
    if(input.classification!=='CONFIDENTIAL')throw new Error('Private research settings require a confidential export.');
    return {network:bounded(value.network,30),mode:bounded(value.mode,30),subject:value.subject?{kind:bounded(value.subject.kind,30),value:bounded(value.subject.value,180)}:null,from:bounded(value.from,10),to:bounded(value.to,10),instructions:bounded(value.instructions,1000)};
  };
  const result={classification:input.classification,portal:bounded(input.portal,120),organization:bounded(input.organization,200),model:bounded(input.model||'Not recorded',200),generatedAt:dateText(input.generatedAt||new Date()),provenance:bounded(input.provenance||'AI-generated text. Verify conclusions against the cited sources. An exported response does not establish identity, ownership, risk or finality.',2400)};
  result.graph=graph(input.graph);result.transactions=transactions(input.transactions);result.facts=facts(input.facts);result.coverage=bounded(input.coverage,2400);
  if(!result.portal.trim())throw new Error('The source portal is required.');
  result.exchanges=input.exchanges.map(exchange=>{
    if(typeof exchange.question!=='string'||!exchange.question.trim()||typeof exchange.answer!=='string'||!exchange.answer.trim())throw new Error('Only completed questions and answers can be exported.');
    if(exchange.question.length>8000||exchange.answer.length>16000)throw new Error('An interaction exceeds the PDF content limit.');
    return {question:bounded(exchange.question,8000),answer:bounded(exchange.answer,16000),model:bounded(exchange.model||result.model,200),createdAt:dateText(exchange.createdAt||result.generatedAt),research:research(exchange.research),graph:graph(exchange.graph),transactions:transactions(exchange.transactions),facts:facts(exchange.facts),coverage:bounded(exchange.coverage,2400),sources:(Array.isArray(exchange.sources)?exchange.sources:[]).slice(0,12).map(source=>({title:bounded(source.title||source.id||'Source',200),url:safeURL(bounded(source.url,2000)),retrieved:dateText(source.retrieved_at||source.retrievedAt),coverage:bounded(source.coverage,1400),status:bounded(source.status,100)}))};
  });
  return result;
}

// Text is drawn as text, never interpreted as HTML, JavaScript or PDF commands.
// The sole optional request retrieves this portal's static font without cookies.
export async function buildBlochAiPdf(input,{fontBytes}={}){
  const report=prepare(input);
  if(!fontBytes){
    if(typeof location==='undefined'||FONT_URL.origin!==location.origin)throw new Error('PDF assets must be served from this portal.');
    const response=await fetch(FONT_URL,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
    if(!response.ok)throw new Error('The local PDF font could not be loaded.');
    const bytes=await response.arrayBuffer();if(bytes.byteLength>2000000)throw new Error('Invalid PDF font asset.');fontBytes=bytes;
  }
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const font=await pdf.embedFont(fontBytes,{subset:true}),glyphs=new Set(font.getCharacterSet());
  const safeText=value=>Array.from(text(value)).map(character=>glyphs.has(character.codePointAt(0))?character:`[U+${character.codePointAt(0).toString(16).toUpperCase()}]`).join('');
  const color=rgb(.12,.16,.23),muted=rgb(.35,.40,.47),blue=rgb(.10,.32,.60);
  const W=595.28,H=841.89,M=48,LINE=15,BOTTOM=65;let page,y;
  pdf.setTitle(`BlochAI - ${report.portal}`);pdf.setAuthor('BlochAI');pdf.setSubject(`${report.classification} conversation export`);pdf.setProducer('BlochAI browser PDF export');pdf.setCreator('BlochAI');pdf.setCreationDate(new Date(report.generatedAt==='Not recorded'?Date.now():report.generatedAt));
  function newPage(){
    if(pdf.getPageCount()>=MAX_PAGES)throw new Error('This export exceeds the page limit. Export fewer interactions.');
    page=pdf.addPage([W,H]);y=H-105;
    page.drawText('BLOCH AI',{x:M,y:H-44,size:17,font,color:blue});
    const label=report.classification==='CONFIDENTIAL'?'CONFIDENTIAL - ORGANIZATION PRIVATE':'PUBLIC PORTAL GUIDANCE';
    page.drawText(label,{x:M,y:H-63,size:8,font,color:muted});
    page.drawLine({start:{x:M,y:H-76},end:{x:W-M,y:H-76},thickness:.6,color:rgb(.80,.84,.89)});
  }
  function ensure(height){if(y-height<BOTTOM)newPage();}
  function wrap(value,size){
    const lines=[];
    for(const paragraph of String(value).split(/\r?\n/)){
      let line='';
      for(const word of safeText(paragraph).split(/\s+/)){
        if(!word)continue;
        const candidate=line?`${line} ${word}`:word;
        if(font.widthOfTextAtSize(candidate,size)<=W-M*2){line=candidate;continue;}
        if(line){lines.push(line);line='';}
        for(const character of word){if(font.widthOfTextAtSize(line+character,size)>W-M*2){lines.push(line);line='';}line+=character;}
      }
      lines.push(line);
    }
    return lines;
  }
  function write(value,{size=10,tint=color,leading=LINE,link}={}){
    for(const line of wrap(value,size)){
      ensure(leading);if(line){page.drawText(line,{x:M,y,size,font,color:tint});
        if(link){const annotation=pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[M,y-2,M+font.widthOfTextAtSize(line,size),y+size+2],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFString.of(link)}});page.node.addAnnot(pdf.context.register(annotation));}}
      y-=leading;
    }
  }
  function heading(value){ensure(52);y-=8;write(value,{size:11,tint:blue,leading:18});}
  function drawGraph(graph){
    if(!graph?.nodes.length)return;
    const single=graph.nodes.length===1,chartHeight=single?128:360;
    ensure(chartHeight+wrap(graph.title,11).length*18+wrap(graph.coverage,9).length*14+75);
    heading(graph.title);write(graph.coverage,{size:9,tint:muted,leading:14});
    ensure(chartHeight);const center={x:W/2,y:y-(single?64:170)},radius=single?0:148,positions=new Map();
    graph.nodes.forEach((node,index)=>{const angle=-Math.PI/2+index/graph.nodes.length*Math.PI*2;positions.set(node.id,{x:center.x+radius*Math.cos(angle),y:center.y-radius*Math.sin(angle),index:index+1});});
    for(const edge of graph.edges){const a=positions.get(edge.source),b=positions.get(edge.target);if(a===b)continue;page.drawLine({start:a,end:b,thickness:.65,color:rgb(.60,.69,.79)});}
    for(const position of positions.values()){
      page.drawCircle({x:position.x,y:position.y,size:10,color:rgb(.93,.96,.99),borderColor:blue,borderWidth:.8});
      const number=String(position.index),width=font.widthOfTextAtSize(number,7.5);page.drawText(number,{x:position.x-width/2,y:position.y-2.8,size:7.5,font,color:blue});
    }
    y=center.y-Math.max(radius,10)-30;write(`${graph.nodes.length} ${graph.nodes.length===1?'node':'nodes'} | ${graph.edges.length} observed edges | Numbered nodes correspond to the legend below.`,{size:8,tint:muted,leading:12});
    heading('Node legend');
    for(const [index,node]of graph.nodes.entries())write(`${index+1}. ${node.label}${node.kind?` (${node.kind})`:''}${node.label!==node.id?` | ${node.id}`:''}`,{size:8.5,leading:13});
    if(graph.edges.length){heading('Observed edges');for(const edge of graph.edges)write(`${positions.get(edge.source).index} -> ${positions.get(edge.target).index}${edge.label?` | ${edge.label}`:''}`,{size:8.5,leading:13});}
  }
  function drawTransactions(rows){
    if(!rows?.length)return;heading('Transaction records');write('Public or organization-authorized observations supplied with this export. Missing fields remain unrecorded; these records do not prove wallet ownership. Transaction amounts are integer base units: BTC/BLCH in sat; ETH in wei. Values are preserved without conversion.',{size:9,tint:muted,leading:14});
    for(const [index,row]of rows.entries()){
      const fields=[['Hash','hash'],['From','from'],['To','to'],['Amount (base units)','amount'],['Asset','asset'],['Timestamp','timestamp'],['Status','status']];
      ensure(fields.reduce((height,[label,key])=>height+wrap(`${label}: ${row[key]}`,9).length*14+8,32));
      heading(`Transaction ${index+1}`);
      for(const [label,key]of fields){
        const lines=wrap(`${label}: ${row[key]}`,9),height=lines.length*14+8;ensure(height);
        page.drawRectangle({x:M-5,y:y-height+8,width:W-M*2+10,height,color:index%2?rgb(.965,.975,.987):rgb(.98,.983,.99)});
        write(`${label}: ${row[key]}`,{size:9,leading:14});y-=8;
      }
    }
  }
  function drawFacts(rows,coverage){
    if(!rows?.length&&!coverage)return;heading('Observed facts and coverage');
    if(coverage)write(coverage,{size:9,tint:muted,leading:14});
    for(const fact of rows)write(`${fact.label}: ${fact.value}${fact.unit?` ${fact.unit}`:''}`,{size:9,leading:14});
  }
  function sourceHeight(source){return wrap(`12. ${source.title}`,9).length*14+(source.url?wrap(source.url,8).length*12:0)+wrap(`Retrieved: ${source.retrieved}${source.status?` | Status: ${source.status}`:''}`,8).length*12+(source.coverage?wrap(`Coverage: ${source.coverage}`,8.5).length*13:0)+10;}
  newPage();write(report.portal,{size:20,leading:27});
  write(`Exported ${report.generatedAt}`,{size:8.5,tint:muted,leading:13});
  if(report.organization)write(`Organization: ${report.organization}`,{size:9,tint:muted});
  heading('Provenance and scope');write(report.provenance,{size:9,tint:muted,leading:14});
  write(report.classification==='CONFIDENTIAL'?'Generated locally in your browser. This file contains organization-private content. Store and share it only through approved private channels.':'Generated locally in your browser from this portal conversation. Public sources and their coverage are listed with each response.',{size:9,tint:muted,leading:14});
  for(let i=0;i<report.exchanges.length;i++){
    const exchange=report.exchanges[i];heading(`Interaction ${i+1} / Question`);write(exchange.question);
    if(exchange.research){const research=exchange.research;heading('Private research parameters');write(`Network: ${research.network||'Not recorded'} | Response style: ${research.mode||'Not recorded'}`,{size:9,leading:14});write(`Target: ${research.subject?`${research.subject.kind} ${research.subject.value}`:'Network overview'}`,{size:9,leading:14});write(`Returned-record filter: ${research.from||'No start date'} through ${research.to||'No end date'}. This is not a complete historical scan.`,{size:9,leading:14});if(research.instructions)write(`Custom instructions: ${research.instructions}`,{size:9,leading:14});}
    heading('BlochAI response');write(exchange.answer);
    y-=7;write(`Model: ${exchange.model} | Received: ${exchange.createdAt}`,{size:8,tint:muted,leading:12});
    drawFacts(exchange.facts,exchange.coverage);
    if(exchange.sources.length)ensure(Math.min(sourceHeight(exchange.sources[0])+34,H-170));heading('Sources and coverage');
    if(!exchange.sources.length)write('No external source citations were recorded for this response. Treat it as model-generated text, not a verified source report.',{size:9,tint:muted,leading:14});
    for(const [index,source]of exchange.sources.entries()){
      ensure(Math.min(sourceHeight(source),H-170));write(`${index+1}. ${source.title}`,{size:9,leading:14});
      if(source.url)write(source.url,{size:8,tint:blue,leading:12,link:source.url});
      write(`Retrieved: ${source.retrieved}${source.status?` | Status: ${source.status}`:''}`,{size:8,tint:muted,leading:12});
      if(source.coverage)write(`Coverage: ${source.coverage}`,{size:8.5,tint:muted,leading:13});y-=6;
    }
    drawTransactions(exchange.transactions);drawGraph(exchange.graph);
  }
  drawFacts(report.facts,report.coverage);drawTransactions(report.transactions);drawGraph(report.graph);
  const total=pdf.getPageCount();for(const [index,p]of pdf.getPages().entries()){
    p.drawLine({start:{x:M,y:43},end:{x:W-M,y:43},thickness:.5,color:rgb(.80,.84,.89)});
    p.drawText(`${report.classification} | BlochAI | ${index+1} / ${total}`,{x:M,y:29,font,size:8,color:muted});
  }
  // No forms, attachments, embedded scripts or launch actions are created.
  pdf.catalog.delete(PDFName.of('OpenAction'));return pdf.save();
}

export async function downloadBlochAiPdf(input,{isCurrent=()=>true}={}){
  if(!isCurrent())throw new Error('The conversation changed. Export the current response.');
  const bytes=await buildBlochAiPdf(input);
  if(!isCurrent())throw new Error('The conversation changed. Export the current response.');
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),anchor=document.createElement('a');
  anchor.href=url;anchor.download=`blochai-${input.classification==='CONFIDENTIAL'?'private':'public'}-${new Date().toISOString().slice(0,10)}.pdf`;anchor.rel='noopener';anchor.hidden=true;
  document.body.append(anchor);try{anchor.click();}finally{anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
