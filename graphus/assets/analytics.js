(function () {
  'use strict';
  const A=window.GraphusAnalytics, $=id=>document.getElementById(id);
  const palette=['#c8ef9d','#8acbd1','#d2b6e8','#e4bf84','#95bba2','#d59389'];
  let dataset,filtered,summary,selected=null,focus='',path=[],page=0,balanceData=null,balanceSummary=null,requestId=0;
  let dataMode='empty',loading=false;
  let graphPoints=[],graphEdges=[],zoom=1,pan={x:0,y:0},canvasWidth=1,canvasHeight=1;
  const canvas=$('lab-canvas'),ctx=canvas.getContext('2d');
  const node=(tag,value,className)=>{const el=document.createElement(tag);if(value!==undefined)el.textContent=value;if(className)el.className=className;return el;};
  const short=value=>value.length>23?value.slice(0,11)+'…'+value.slice(-8):value;
  const percent=value=>(value*100).toFixed(2)+'%';
  const human=value=>value.replaceAll('_',' ');
  function message(value,error=false){$('lab-message').textContent=value;$('lab-message').dataset.error=String(error);}
  function statCards(target,items){$(target).replaceChildren(...items.map(([label,value,note])=>{const card=node('div',undefined,'lab-stat');card.append(node('span',label),node('strong',value),node('small',note));return card;}));}
  function svgElement(tag,attrs={},value){const el=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));if(value!==undefined)el.textContent=value;return el;}
  function chart(id,label){const el=svgElement('svg',{viewBox:'0 0 600 250',role:'img','aria-label':label});el.append(svgElement('title',{},label));$(id).replaceChildren(el);return el;}
  function emptyChart(id,label='No records in this selection.'){$(id).replaceChildren(node('div',label,'lab-chart-empty'));}
  function bars(id,rows,{horizontal=false,format=String,label='Record counts'}={}){
    if(!rows.length){emptyChart(id);return;}
    const svg=chart(id,label),max=Math.max(...rows.map(r=>r.value),1e-12);
    if(horizontal){
      const step=Math.min(38,224/rows.length);
      rows.forEach((r,i)=>{const y=8+i*step,rect=svgElement('rect',{x:143,y,width:Math.max(0,r.value/max*365),height:Math.max(5,step-7),rx:2,class:'chart-bar'});rect.append(svgElement('title',{},`${r.full||r.label}: ${format(r.value)}`));svg.append(rect,svgElement('text',{x:133,y:y+Math.min(step-8,14),'text-anchor':'end'},r.label),svgElement('text',{x:515,y:y+Math.min(step-8,14),class:'chart-value'},format(r.value)));});
    }else{
      const left=40,top=14,height=188,width=542,step=width/rows.length;
      for(let i=0;i<=4;i++){const y=top+height-height*i/4;svg.append(svgElement('line',{x1:left,x2:582,y1:y,y2:y,class:'chart-grid'}),svgElement('text',{x:32,y:y+4,'text-anchor':'end'},format(max*i/4)));}
      rows.forEach((r,i)=>{const h=r.value/max*height,rect=svgElement('rect',{x:left+i*step+2,y:top+height-h,width:Math.max(1,step-4),height:h,rx:2,class:'chart-bar'});rect.append(svgElement('title',{},`${r.full||r.label}: ${r.value} records`));svg.append(rect);if(i%Math.ceil(rows.length/7)===0||i===rows.length-1)svg.append(svgElement('text',{x:left+(i+.5)*step,y:225,'text-anchor':'middle'},r.label));});
    }
  }
  function drawCharts(){
    const blockRows=summary.blocks;
    let activity=[];
    if(blockRows.length){const first=blockRows[0][0],last=blockRows.at(-1)[0],size=Math.max(1,Math.ceil((last-first+1)/24));
      const count=Math.floor((last-first)/size)+1;
      activity=Array.from({length:count},(_,i)=>({label:String(first+i*size),full:`Blocks ${first+i*size}–${Math.min(last,first+(i+1)*size-1)}`,value:0}));
      for(const [block,total] of blockRows)activity[Math.floor((block-first)/size)].value+=total;}
    bars('lab-chart-activity',activity,{format:v=>Number.isInteger(v)?String(v):v.toFixed(1),label:'Returned records by block bin'});
    $('lab-activity-caption').textContent=`${summary.unknownBlocks} records without a block are excluded. Counts describe returned records only; empty bins do not establish absence of chain activity.`;
    bars('lab-chart-degree',summary.histogram.map(([degree,count])=>({label:String(degree),full:`${degree} distinct neighbors`,value:count})),{format:v=>Number.isInteger(v)?String(v):v.toFixed(1),label:'Reference counts by degree'});
    bars('lab-chart-types',summary.groups.map(g=>({label:human(g.kind).slice(0,20),full:human(g.kind),value:g.count})),{horizontal:true,label:'Counts by connection type'});
    $('lab-type-totals').replaceChildren(...summary.groups.map(g=>node('p',`${human(g.kind)}: ${A.format(g.amount,dataset.asset)} ${dataset.asset} · ${g.amount} base units`)));
    bars('lab-chart-amounts',summary.amountBands.map(([band,count])=>({label:band<0?'0':`10^${band}`,full:band<0?'Zero base units':`From 10^${band} to below 10^${band+1} base units`,value:count})),{format:v=>Number.isInteger(v)?String(v):v.toFixed(1),label:'Record counts by base-unit amount band'});
    const ranks=[...summary.ranking].sort((a,b)=>b.rank-a.rank||a.id.localeCompare(b.id)).slice(0,10);
    bars('lab-chart-rank',ranks.map(r=>({label:short(r.label),full:r.label,value:r.rank})),{horizontal:true,format:percent,label:'Top directed PageRank shares'});
    drawMatrix();
  }
  function drawMatrix(){
    const rows=summary.ranking.slice(0,12);if(!rows.length){emptyChart('lab-chart-matrix');return;}
    const svg=chart('lab-chart-matrix','Directed record counts among highest-degree references'),counts=new Map();
    for(const e of filtered.edges){const key=JSON.stringify([e.from,e.to]);counts.set(key,(counts.get(key)||0)+1);}
    const max=Math.max(...counts.values(),1),size=195/rows.length;
    rows.forEach((row,i)=>{
      svg.append(svgElement('text',{x:185,y:25+(i+.65)*size,'text-anchor':'end'},`${i+1}. ${short(row.label)}`),svgElement('text',{x:203+(i+.5)*size,y:13,'text-anchor':'middle'},i+1));
      rows.forEach((col,j)=>{const count=counts.get(JSON.stringify([row.id,col.id]))||0;const rect=svgElement('rect',{x:203+j*size,y:25+i*size,width:size-2,height:size-2,fill:count?palette[0]:'#203024',opacity:count?.25+.75*count/max:1});rect.append(svgElement('title',{},`${row.label} → ${col.label}: ${count} records`));svg.append(rect);});
    });
    svg.append(svgElement('text',{x:203,y:243},'Origin ↓  /  Destination →'));
  }
  function setGraph(data,description,mode=data.status==='synthetic'?'demo':'import'){
    dataMode=mode;
    dataset=data;balanceData=null;balanceSummary=null;focus='';selected=null;path=[];
    $('lab-graph-workspace').hidden=false;$('lab-balances-workspace').hidden=true;
    $('lab-asset').value=data.asset;
    $('lab-badge').textContent=data.status==='synthetic'?'SYNTHETIC DEMONSTRATION':mode==='live'?'REAL CHAIN DATA · SOURCE-REPORTED':'IMPORTED OBSERVATION · UNVERIFIED';
    $('lab-badge').dataset.mode=data.status==='synthetic'?'demo':'source';
    $('lab-source-detail').textContent=description||`${data.source} · ${data.coverage}${data.retrieved_at?' · Retrieved '+data.retrieved_at:''}${data.anchor?' · Anchor '+data.anchor.height+' / '+data.anchor.hash:''}`;
    $('lab-kind').replaceChildren(new Option('All types','all'),...A.KINDS[data.asset].map(k=>new Option(human(k),k)));
    resetFilters();
  }
  function resetFilters(){
    $('lab-from').value='';$('lab-to').value='';$('lab-min').value='0';$('lab-kind').value='all';$('lab-node-search').value='';$('lab-record-search').value='';focus='';applyFilters();
  }
  function blockInput(id){const value=$(id).value;if(value==='')return null;const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw new Error('Block bounds must be non-negative integers.');return n;}
  function applyFilters(){
    try{
      const minBlock=blockInput('lab-from'),maxBlock=blockInput('lab-to');
      if(minBlock!==null&&maxBlock!==null&&minBlock>maxBlock)throw new Error('The first block must not exceed the last block.');
      const next=A.filterGraph(dataset,{minBlock,maxBlock,kind:$('lab-kind').value,minimum:$('lab-min').value,focus});
      const nextSummary=A.analyze(next);filtered=next;summary=nextSummary;page=0;path=[];
      if(selected&&!filtered.nodes.some(n=>n.id===selected))selected=null;
      statCards('lab-stats',[
        ['References',String(summary.nodes),'addresses, scripts and transactions'],['Connections',String(summary.connections),'filtered evidence records'],
        ['Components',String(summary.components),'ignoring edge direction'],['Directed density',percent(summary.density),'unique links / possible links'],
        ['Max degree',String(summary.ranking[0]?.degree||0),'distinct connected neighbors'],['Block coverage',String(summary.blocks.length),'blocks with returned records'],
      ]);
      drawCharts();renderNodeList();renderInspector();renderPathSelects();renderLedger();layoutGraph();
      $('lab-path-result').textContent='Select two references to inspect their connection.';
      message(`${filtered.edges.length} of ${dataset.edges.length} connections · ${filtered.nodes.length} of ${dataset.nodes.length} references${focus?' · Neighborhood isolated; Reset restores the full graph.':'.'}`);
    }catch(error){message(error.message,true);}
  }
  function renderNodeList(){
    const search=$('lab-node-search').value.trim().toLowerCase();const rows=summary.ranking.filter(r=>r.label.toLowerCase().includes(search)||r.id.toLowerCase().includes(search));
    $('lab-node-list').replaceChildren(...rows.slice(0,80).map(row=>{const button=node('button',`${short(row.label)} · ${row.degree} neighbors`);button.type='button';button.title=row.label;button.setAttribute('aria-pressed',String(row.id===selected));button.addEventListener('click',()=>selectNode(row.id));return button;}));
    $('lab-node-count').textContent=`${Math.min(80,rows.length)} of ${rows.length} matching references shown. Search to narrow the list.`;
  }
  function selectNode(id){selected=id;renderInspector();renderNodeList();drawGraph();}
  function renderInspector(){
    const row=summary.ranking.find(n=>n.id===selected);$('lab-node-detail').replaceChildren();
    $('lab-focus').disabled=!row;$('lab-node-origin').disabled=!row;
    $('lab-node-title').textContent=row?row.label:'Select a reference';
    $('lab-node-hint').textContent=row?'Metrics within the current filtered graph.':'Choose a point or use the searchable list. Connections describe records in this dataset.';
    if(row)for(const [key,value] of [['Kind',human(row.kind)],['Incoming',row.incoming],['Outgoing',row.outgoing],['Neighbors',row.degree],['PageRank',percent(row.rank)],['Component',row.component+1]])$('lab-node-detail').append(node('dt',key),node('dd',String(value)));
    if(row&&dataset.status==='source-reported'&&row.kind!=='transaction'){
      const link=node('a','Open Constellation ↗');link.href=`constellation.html?${new URLSearchParams({asset:dataset.asset.toLowerCase(),address:row.label})}`;
      const value=node('dd');value.append(link);$('lab-node-detail').append(node('dt','Address evidence'),value);
    }
  }
  function renderPathSelects(){
    const from=$('lab-path-from').value,to=$('lab-path-to').value;
    for(const id of ['lab-path-from','lab-path-to'])$(id).replaceChildren(...summary.ranking.map(n=>new Option(short(n.label),n.id)));
    if(filtered.nodes.some(n=>n.id===from))$('lab-path-from').value=from;
    if(filtered.nodes.some(n=>n.id===to))$('lab-path-to').value=to;else if(filtered.nodes.length>1)$('lab-path-to').selectedIndex=1;
  }
  function rowsForLedger(){
    const query=$('lab-record-search').value.trim().toLowerCase(),sort=$('lab-sort').value;
    return filtered.edges.filter(e=>[e.id,e.from,e.to,e.kind].some(v=>v.toLowerCase().includes(query))).sort((a,b)=>{
      if(sort==='largest'){const x=BigInt(a.amount),y=BigInt(b.amount);return x>y?-1:x<y?1:a.id.localeCompare(b.id);}
      if(a.block===null)return b.block===null?a.id.localeCompare(b.id):1;if(b.block===null)return -1;
      return (sort==='oldest'?a.block-b.block:b.block-a.block)||a.id.localeCompare(b.id);
    });
  }
  function renderLedger(){
    const rows=rowsForLedger(),pages=Math.max(1,Math.ceil(rows.length/20));page=Math.min(page,pages-1);
    $('lab-ledger-body').replaceChildren(...rows.slice(page*20,page*20+20).map(e=>{
      const tr=node('tr'),event=node('td',e.id);event.append(node('small',e.block===null?'Block unknown':`Block ${e.block}`));
      if(e.block_hash)event.append(node('small',`Block hash ${e.block_hash}`));
      if(e.txid){const link=node('a','Open transaction ↗');link.href=dataset.asset==='BTC'?`https://blockstream.info/tx/${e.txid}`:dataset.asset==='BLCH'?`https://blochl1.com/tx/${e.txid}`:`https://etherscan.io/tx/${e.txid}`;link.target='_blank';link.rel='noopener noreferrer';event.append(link);}
      const refs=node('td',`${short(e.from)} → ${short(e.to)}`);refs.title=`${e.from} → ${e.to}`;
      const amount=node('td',`${A.format(e.amount,dataset.asset)} ${dataset.asset}`);amount.append(node('small',`${e.amount} base units`));
      tr.append(event,refs,node('td',human(e.kind)),amount);return tr;
    }));
    if(!rows.length){const tr=node('tr'),td=node('td','No records match the current filters.');td.colSpan=4;tr.append(td);$('lab-ledger-body').append(tr);}
    $('lab-page').textContent=`Page ${page+1} / ${pages} · ${rows.length} records`;$('lab-prev').disabled=page===0;$('lab-next').disabled=page===pages-1;
  }
  function layoutGraph(){
    const included=summary.ranking.slice(0,450),ids=new Set(included.map(n=>n.id));
    const pathIds=new Set(path.flatMap(e=>[e.from,e.to]));if(selected)pathIds.add(selected);
    for(const id of pathIds)if(!ids.has(id)){const row=summary.ranking.find(n=>n.id===id);if(row){included.push(row);ids.add(id);}}
    graphPoints=included.map((row,i)=>{const angle=i*2.3999632297,radius=28+Math.sqrt(i)*13;return {...row,x:Math.cos(angle)*radius,y:Math.sin(angle)*radius};});
    const byId=new Map(graphPoints.map(p=>[p.id,p]));graphEdges=filtered.edges.filter(e=>ids.has(e.from)&&ids.has(e.to)).map(e=>({...e,a:byId.get(e.from),b:byId.get(e.to)}));
    // Fixed iterations avoid a continuously running simulation and make the view reproducible.
    for(let step=0;step<55;step++){
      for(let i=0;i<graphPoints.length;i++)for(let j=i+1;j<graphPoints.length;j++){
        const a=graphPoints[i],b=graphPoints[j],dx=a.x-b.x,dy=a.y-b.y,dist=dx*dx+dy*dy+10;
        const force=100/dist;a.x+=dx*force;a.y+=dy*force;b.x-=dx*force;b.y-=dy*force;
      }
      for(const {a,b} of graphEdges){const dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy)||1,f=(dist-45)/dist*.009;a.x+=dx*f;a.y+=dy*f;b.x-=dx*f;b.y-=dy*f;}
      for(const p of graphPoints){p.x*=.994;p.y*=.994;}
    }
    $('lab-graph-caption').textContent=`${graphPoints.length} of ${filtered.nodes.length} references plotted · ${graphEdges.length} of ${filtered.edges.length} connections. ${filtered.nodes.length>450?'Canvas prioritizes degree and selected path; all records remain in analysis and exports.':'All filtered references are visible.'}`;
    fitGraph();
  }
  function resizeCanvas(){const rect=canvas.getBoundingClientRect();canvasWidth=rect.width;canvasHeight=rect.height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(canvasWidth*dpr);canvas.height=Math.round(canvasHeight*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);drawGraph();}
  function fitGraph(){
    const xs=graphPoints.map(p=>p.x),ys=graphPoints.map(p=>p.y);
    const minX=xs.length?Math.min(...xs):-20,maxX=xs.length?Math.max(...xs):20;
    const minY=ys.length?Math.min(...ys):-20,maxY=ys.length?Math.max(...ys):20;
    const rect=canvas.parentElement.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return;
    zoom=Math.min(4,Math.max(1,rect.width-65)/Math.max(40,maxX-minX),Math.max(1,rect.height-65)/Math.max(40,maxY-minY));
    pan={x:-(minX+maxX)*zoom/2,y:-(minY+maxY)*zoom/2};resizeCanvas();
  }
  function drawGraph(){
    if(!summary)return;ctx.clearRect(0,0,canvasWidth,canvasHeight);ctx.save();ctx.translate(canvasWidth/2+pan.x,canvasHeight/2+pan.y);ctx.scale(zoom,zoom);
    const pathIds=new Set(path.map(e=>e.id));
    for(const edge of graphEdges){const highlight=pathIds.has(edge.id),near=selected&&(edge.from===selected||edge.to===selected);ctx.beginPath();ctx.moveTo(edge.a.x,edge.a.y);ctx.lineTo(edge.b.x,edge.b.y);ctx.strokeStyle=highlight?'#fff0a4':near?'#c8ef9dc0':'#92ba8733';ctx.lineWidth=(highlight?2.2:near?1.4:.65)/zoom;ctx.stroke();
      if(highlight||near){const dx=edge.b.x-edge.a.x,dy=edge.b.y-edge.a.y,angle=Math.atan2(dy,dx),x=edge.a.x+dx*.7,y=edge.a.y+dy*.7,r=5/zoom;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-r*Math.cos(angle-.45),y-r*Math.sin(angle-.45));ctx.lineTo(x-r*Math.cos(angle+.45),y-r*Math.sin(angle+.45));ctx.closePath();ctx.fillStyle=highlight?'#fff0a4':'#c8ef9d';ctx.fill();}}
    for(const p of graphPoints){const r=(p.kind==='transaction'?2.6:3+Math.min(6,Math.sqrt(p.degree)*.8))/Math.sqrt(zoom);ctx.beginPath();if(p.kind==='transaction'){ctx.moveTo(p.x,p.y-r);ctx.lineTo(p.x+r,p.y);ctx.lineTo(p.x,p.y+r);ctx.lineTo(p.x-r,p.y);ctx.closePath();}else ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=palette[p.component%palette.length];ctx.fill();if(p.id===selected){ctx.beginPath();ctx.arc(p.x,p.y,r+5/zoom,0,Math.PI*2);ctx.lineWidth=1.5/zoom;ctx.strokeStyle='#f0ffd7';ctx.stroke();}}
    ctx.restore();if(!graphPoints.length){ctx.fillStyle='#98a49b';ctx.font='13px monospace';ctx.textAlign='center';ctx.fillText('No connections in this selection',canvasWidth/2,canvasHeight/2);}
  }
  let drag=null;
  canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y,moved:false};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>4)drag.moved=true;pan={x:drag.px+dx,y:drag.py+dy};drawGraph();});
  canvas.addEventListener('pointerup',e=>{if(drag&&!drag.moved){const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left-canvasWidth/2-pan.x)/zoom,y=(e.clientY-r.top-canvasHeight/2-pan.y)/zoom;let nearest=null,distance=18/zoom;for(const p of graphPoints){const d=Math.hypot(p.x-x,p.y-y);if(d<distance){nearest=p;distance=d;}}if(nearest)selectNode(nearest.id);}drag=null;});
  canvas.addEventListener('pointercancel',()=>{drag=null;});
  new ResizeObserver(fitGraph).observe(canvas.parentElement);
  function download(name,body,type){const url=URL.createObjectURL(new Blob([body],{type})),link=node('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function exportRows(){return [['status','asset','source','retrieved_at','event_id','transaction_id','from','to','connection_type','block','block_hash','amount_base_units','amount'],...rowsForLedger().map(e=>[dataset.status,dataset.asset,dataset.source,dataset.retrieved_at,e.id,e.txid,e.from,e.to,e.kind,e.block,e.block_hash,e.amount,A.format(e.amount,dataset.asset)])];}
  function showBalances(data){
    dataMode='balances';
    const stats=A.holderStats(data);balanceData=data;balanceSummary=stats;
    $('lab-graph-workspace').hidden=true;$('lab-balances-workspace').hidden=false;
    $('lab-badge').textContent='SOURCE-REPORTED · INDEXED BALANCES';$('lab-badge').dataset.mode='source';
    $('lab-source-detail').textContent=`${data.source} · Retrieved ${data.retrieved_at} · Block ${data.anchor.height} · ${data.anchor.block_id}`;
    statCards('lab-balance-stats',[
      ['Returned scripts',String(stats.rows.length),`${data.coverage.positive_script_hashes_in_index} positive scripts in index`],
      ['Returned / indexed',percent(stats.returnedShare),'share of indexed balance'],['Top 1 share',percent(stats.top1),'of returned balances'],
      ['Top 10 share',percent(stats.top10),'of returned balances'],['Gini',stats.gini===null?'—':stats.gini.toFixed(4),'returned script balances only'],
      ['HHI',stats.hhi===null?'—':stats.hhi.toFixed(4),'sum of squared returned shares'],
    ]);
    $('lab-balance-boundary').textContent=`${stats.complete?'All positive scripts reported by this index are returned.':'This is a truncated ranking; concentration statistics apply only to the returned subset.'} Returned sum: ${A.format(stats.sum,'BLCH')} BLCH. Indexed total: ${A.format(stats.total,'BLCH')} BLCH. Script hashes are not people or proven owners. Source claims are not independently reproduced by Graphus.`;
    bars('lab-chart-balances',stats.rows.slice(0,12).map((r,i)=>({label:`${i+1}. ${short(r.id)}`,full:r.id,value:A.ratio(BigInt(r.amount),BigInt(stats.sum))})),{horizontal:true,format:percent,label:'Largest returned BLCH balance shares'});
    if(!stats.rows.length)emptyChart('lab-chart-lorenz','No positive balances in this snapshot.');else{
      const svg=chart('lab-chart-lorenz','Lorenz curve for the returned script balances');
      for(let i=0;i<=4;i++){const x=50+i*127.5,y=212-i*47;svg.append(svgElement('line',{x1:50,x2:560,y1:y,y2:y,class:'chart-grid'}),svgElement('text',{x:40,y:y+4,'text-anchor':'end'},`${i*25}%`),svgElement('text',{x,y:236,'text-anchor':'middle'},`${i*25}%`));}
      svg.append(svgElement('path',{d:'M50 212 L560 24',class:'chart-reference'}),svgElement('path',{d:stats.lorenz.map((p,i)=>`${i?'L':'M'}${50+p.x*510} ${212-p.y*188}`).join(' '),class:'chart-line'}));
    }
    $('lab-balance-body').replaceChildren(...stats.rows.map((r,i)=>{const tr=node('tr'),links=node('td'),graph=node('a','Graph ↗');graph.href=`constellation.html?asset=blch&address=${r.id}`;links.append(graph);tr.append(node('td',String(i+1)),node('td',r.id),node('td',A.format(r.amount,'BLCH')),node('td',String(r.utxos)),links);return tr;}));
    message(`Loaded ${stats.rows.length} source-reported script balances. Concentration and chart calculations are complete.`);
  }
  $('lab-holders').addEventListener('click',async()=>{
    const request=++requestId;message('Loading the indexed BLCH snapshot…');$('lab-holders').disabled=true;
    try{const response=await fetch('/api/chain/holders?asset=BLCH',{signal:AbortSignal.timeout(35000),headers:{Accept:'application/json'}});if(!response.ok)throw new Error('The indexed source is unavailable. The current dataset is still displayed.');const body=await response.text();if(body.length>200000)throw new Error('Source response exceeded the snapshot limit.');const data=JSON.parse(body);if(request===requestId)showBalances(data);}
    catch(error){if(request===requestId)message(error.name==='TimeoutError'?'The source request timed out. Try again shortly.':error.message,true);}
    finally{if(request===requestId)$('lab-holders').disabled=false;}
  });
  async function fetchData(url){
    const response=await fetch(url,{signal:AbortSignal.timeout(60000),headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`The public source is unavailable (HTTP ${response.status}). Retry the real-data query shortly.`);
    if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('The data source did not return JSON. Please retry.');
    const body=await response.text();if(body.length>3000000)throw new Error('Source response exceeded the graph limit.');return JSON.parse(body);
  }
  async function loadNetwork(){
    const request=++requestId,asset=$('lab-asset').value;loading=true;$('lab-live').disabled=true;
    message(`Loading real ${asset} transactions and connection evidence…`);
    try{const result=await fetchData(`/api/chain/network?asset=${asset}`);if(request!==requestId)return;
      if(result.status!=='source-reported'||result.asset!==asset)throw new Error('The source returned an inconsistent asset or data mode.');
      setGraph(A.normalize(result),null,'live');
      message(`${result.edges.length} real connection records loaded. ${result.coverage}.`);
      const url=new URL(location.href);url.search='';url.searchParams.set('asset',asset.toLowerCase());history.replaceState(null,'',url);
    }catch(error){if(request===requestId){if(dataMode==='empty')$('lab-badge').textContent='REAL SOURCE UNAVAILABLE';message(error.message,true);}}
    finally{if(request===requestId)loading=false;$('lab-live').disabled=false;}
  }
  $('lab-live').addEventListener('click',loadNetwork);
  $('lab-lookup').addEventListener('submit',async event=>{
    event.preventDefault();const asset=$('lab-asset').value,address=$('lab-address').value.trim();
    const valid=asset==='BLCH'?/^[a-f0-9]{64}$/i.test(address):asset==='BTC'?/^(bc1[ac-hj-np-z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/i.test(address):/^0x[a-f0-9]{40}$/i.test(address);
    if(!valid){message('Enter a public mainnet address or a 64-character Bloch script hash for the selected asset.',true);return;}
    const request=++requestId;loading=true;message(`Querying real ${asset} records for ${address}…`);
    try{
      const network=asset==='BTC'?'bitcoin-mainnet':asset==='BLCH'?'bloch-mainnet':'ethereum-mainnet';
      const params=new URLSearchParams({asset,network,address});
      const wallet=await fetchData(`/api/chain/wallet?${params}`);
      const activity=['USDT','USDC'].includes(asset)?await fetchData(`/api/chain/activity?${new URLSearchParams({asset,address})}`):null;
      if(request!==requestId)return;
      const bundle={kind:'graphus_public_chain_observation',schema_version:1,status:wallet.status,query:{asset,address},source:wallet.observation,records:{nodes:wallet.nodes,edges:wallet.edges},
        ...(activity?{token_logs:{source:activity.observation,events:activity.activity.events}}:{})};
      const data=A.fromBundle(bundle);setGraph(data,null,'address');$('lab-badge').textContent='REAL ADDRESS QUERY · SOURCE-REPORTED';
      const url=new URL(location.href);url.search=new URLSearchParams({asset:asset.toLowerCase(),address}).toString();history.replaceState(null,'',url);
      message(`${data.edges.length} real connection records returned.${asset==='ETH'?' This address endpoint supplies a balance only; use recent network data for direct ETH transfers.':''}${wallet.balance?.base_units?' Source balance: '+A.format(wallet.balance.base_units,asset)+' '+asset+'.':''}`);
    }catch(error){if(request===requestId)message(error.message,true);}finally{if(request===requestId)loading=false;}
  });
  setInterval(()=>{if($('lab-auto').checked&&dataMode==='live'&&!loading&&!document.hidden)loadNetwork();},60000);
  $('lab-demo').addEventListener('click',()=>{requestId++;$('lab-holders').disabled=false;setGraph(A.fixture($('lab-asset').value));});
  $('lab-import').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;const request=++requestId;$('lab-holders').disabled=false;
    try{if(file.size>2000000)throw new Error('The observation file exceeds 2 MB.');const data=A.fromBundle(JSON.parse(await file.text()));if(request===requestId){setGraph(data);message('Observation imported locally. The file was not uploaded; provenance claims remain unverified.');}}
    catch(error){if(request===requestId)message(error.message,true);}finally{e.target.value='';}
  });
  $('lab-apply').addEventListener('click',applyFilters);$('lab-reset').addEventListener('click',resetFilters);
  $('lab-node-search').addEventListener('input',renderNodeList);
  $('lab-focus').addEventListener('click',()=>{focus=selected;applyFilters();});
  $('lab-node-origin').addEventListener('click',()=>{$('lab-path-from').value=selected;$('lab-path-to').focus();});
  $('lab-path-form').addEventListener('submit',event=>{
    event.preventDefault();const found=A.findPath(filtered,$('lab-path-from').value,$('lab-path-to').value,Number($('lab-path-steps').value));path=found||[];
    const result=$('lab-path-result');result.replaceChildren();
    if(found===null)result.textContent='No directed path found within this filtered dataset and step limit.';
    else if(!found.length)result.textContent='The start and destination are the same reference (zero steps).';
    else{result.append(node('p',`${found.length} connection steps. Highlighted on the graph; amounts belong to individual records.`));const list=node('ol');for(const e of found)list.append(node('li',`${e.from} → ${e.to} · ${human(e.kind)} · block ${e.block??'unknown'} · ${A.format(e.amount,dataset.asset)} ${dataset.asset} · ${e.id}`));result.append(list);}
    layoutGraph();
  });
  $('lab-record-search').addEventListener('input',()=>{page=0;renderLedger();});$('lab-sort').addEventListener('change',()=>{page=0;renderLedger();});
  $('lab-prev').addEventListener('click',()=>{page--;renderLedger();});$('lab-next').addEventListener('click',()=>{page++;renderLedger();});
  $('lab-zoom-in').addEventListener('click',()=>{zoom=Math.min(6,zoom*1.3);drawGraph();});$('lab-zoom-out').addEventListener('click',()=>{zoom=Math.max(.05,zoom/1.3);drawGraph();});$('lab-fit').addEventListener('click',fitGraph);
  $('lab-export-csv').addEventListener('click',()=>download(`graphus-${dataset.asset.toLowerCase()}-connections.csv`,A.csv(exportRows()),'text/csv;charset=utf-8'));
  $('lab-export-json').addEventListener('click',()=>download(`graphus-${dataset.asset.toLowerCase()}-analysis.json`,JSON.stringify({schema_version:1,kind:'graphus_local_graph_analysis',exported_at:new Date().toISOString(),independent_verification:false,dataset:filtered,metrics:summary,filters:{from_block:$('lab-from').value,to_block:$('lab-to').value,kind:$('lab-kind').value,minimum_base_units:$('lab-min').value,focus},limitations:['Filtered bounded records only; not complete chain history.','Graph structure does not establish ownership, risk, chronological flow or value continuity.']},null,2),'application/json'));
  $('lab-export-balances').addEventListener('click',()=>{if(!balanceSummary)return;download('graphus-blch-indexed-balances.csv',A.csv([['status','source','retrieved_at','anchor_height','anchor_block_id','scope','rank','script_hash','balance_base_units','balance_blch','utxo_count'],...balanceSummary.rows.map((r,i)=>['source-reported',balanceData.source,balanceData.retrieved_at,balanceData.anchor.height,balanceData.anchor.block_id,'returned indexed script subset',i+1,r.id,r.amount,A.format(r.amount,'BLCH'),r.utxos])]),'text/csv;charset=utf-8');});
  const params=new URLSearchParams(location.search),asset=params.get('asset')?.toUpperCase();
  $('lab-asset').value=Object.hasOwn(A.DECIMALS,asset)?asset:'BLCH';
  $('lab-graph-workspace').hidden=true;
  if(params.get('import')==='observation'){
    try{const serialized=sessionStorage.getItem('graphus.analytics.observation.v1');sessionStorage.removeItem('graphus.analytics.observation.v1');if(!serialized||serialized.length>2000000)throw new Error('No observation is available in this tab. Import a Constellation JSON export.');setGraph(A.fromBundle(JSON.parse(serialized)));message('Constellation observation opened locally; no file was uploaded.');}
    catch(error){message(error.message,true);}
  }else if(params.get('address')){$('lab-address').value=params.get('address');$('lab-lookup').requestSubmit();}
  else if(params.get('mode')==='demo')setGraph(A.fixture($('lab-asset').value));
  else loadNetwork();
})();
