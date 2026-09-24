(function(){
  'use strict';
  const params=new URLSearchParams(location.search),importing=params.get('import')==='evidence',legacy=!importing&&(params.has('address')||params.has('wallet')||params.get('mode')==='demo');
  const host=document.createElement('section');host.className='net-explorer';host.id='network-explorer';
  document.querySelector('.constellation-intro').after(host);
  if(legacy){host.innerHTML='<a class="net-back" href="constellation.html">← Back to the real network feed</a>';return;}
  document.querySelector('.constellation-workspace').hidden=true;document.querySelector('.analytics-section').hidden=true;
  document.body.dataset.constellationMode='network';
  host.innerHTML=`<div class="net-heading"><div><p class="section-index">01 / REAL NETWORK OBSERVATIONS</p><h2>A growing view<br>of the chain.</h2></div><p>Collect recent records and earlier source pages. Explore addresses, scripts and transaction connections. Points scale by connection count in this sample; no holder names or inferred identities are attached.</p></div>
    <div class="net-toolbar"><label>Asset<select id="net-asset"><option>BLCH</option><option>BTC</option><option>ETH</option><option>USDT</option><option>USDC</option></select></label><button id="net-refresh" type="button">Collect latest</button><button id="net-older" type="button" disabled>Load earlier records</button><label class="net-check"><input id="net-auto" type="checkbox" checked>Collect every 60s</label><button id="net-reset" type="button">Clear session</button></div>
    <p id="net-status" class="net-status" role="status" aria-live="polite">Loading real chain records…</p><div id="net-stats" class="net-stats"></div>
    <div class="net-grid"><div class="net-panel"><div class="net-canvas-tools"><span>REAL REFERENCES / DIRECTED RECORDS</span><button id="net-fit" type="button">Fit</button><button id="net-out" type="button" aria-label="Zoom out">−</button><button id="net-in" type="button" aria-label="Zoom in">+</button></div><div class="net-canvas-wrap"><canvas id="net-canvas" aria-label="Real network graph. Use the reference list to select a point."></canvas></div><p id="net-plot-count" class="net-caption">No data loaded.</p><p class="net-caption">Drag to pan · scroll to zoom · circles = wallets / scripts · diamonds = transactions · color = connected component</p></div>
      <aside class="net-panel"><p class="section-index">SELECT A REFERENCE</p><div id="net-detail"><p>Choose a point or find a public identifier below.</p></div><label>Find a wallet, script or transaction<input id="net-search" type="search" maxlength="200" placeholder="Public identifier…"></label><div id="net-references" class="net-references"></div></aside></div>
    <div class="net-toolbar"><label>Connection type<select id="net-kind"><option value="all">All types</option></select></label><label>Source block<select id="net-block"><option value="all">All collected blocks</option></select></label><label>Minimum base units<input id="net-minimum" value="0" inputmode="numeric" pattern="[0-9]+" maxlength="78"></label><button id="net-clear-focus" type="button">Show entire sample</button></div>
    <div class="net-lower"><article class="net-panel"><p class="section-index">02 / ACTIVITY BY BLOCK</p><h3>Explore the observed window.</h3><div id="net-timeline" class="net-timeline"></div><p class="net-caption">Each bar counts returned records in one block. Missing blocks are unknown. Choose a bar to focus the graph.</p></article><article class="net-panel"><p class="section-index">03 / DIRECTED PATH</p><h3>Trace the connections.</h3><label>Start<select id="net-path-from"></select></label><label>Destination<select id="net-path-to"></select></label><button id="net-path" type="button">Find path · up to 6 steps</button><p id="net-path-result" role="status">Paths follow recorded direction within this sample. They do not establish chronology or continuity of value.</p></article></div>
    <article class="net-panel"><div class="net-evidence-head"><div><p class="section-index">04 / EXACT SOURCE RECORDS</p><h3>Inspect every connection.</h3></div><button id="net-export" type="button">Export collection JSON</button><button id="net-analytics" type="button">Analyze this collection ↗</button><a id="net-oculum" href="oculum.html">Discover balances in Oculum ↗</a></div><div class="net-table-wrap"><table><caption>Filtered records · amounts in exact integer base units</caption><thead><tr><th>Block / transaction</th><th>Origin → destination</th><th>Record type</th><th>Base units</th></tr></thead><tbody id="net-ledger"></tbody></table></div><div class="net-toolbar"><button id="net-prev" type="button">← Previous</button><span id="net-page"></span><button id="net-next" type="button">Next →</button></div></article>
    <details class="net-panel"><summary>Sources, collection limits and observations</summary><p>Collection runs while this tab is visible. Each page retains its source, retrieval time, block anchor and sampling limits. Overlapping events are counted once. Up to 1,200 references, 4,000 records and 32 distinct snapshots stay in this tab; export before clearing. This is a sampled collection with gaps, not an archive of the entire chain.</p><div id="net-sources"></div><a href="constellation.html?mode=demo">Open the synthetic demonstration explicitly ↗</a></details>`;
  const $=id=>document.getElementById(id),A=window.GraphusAnalytics,S=window.GraphusNetworkSession,I=window.GraphusNetworkInspector,canvas=$('net-canvas'),ctx=canvas.getContext('2d');
  const el=(tag,value,className)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=value;if(className)e.className=className;return e;};
  const short=v=>v.length>28?v.slice(0,12)+'…'+v.slice(-8):v;
  let collection=null,data=null,filtered=null,stats=null,cursor=null,selected='',focus='',path=[],page=0,busy=false,requestId=0,localMode=importing,importedPacket=null;
  const importPanel=el('div',undefined,'net-import-panel'),mode=el('strong','LIVE SOURCE COLLECTION'),importLabel=el('label','Open System Map evidence JSON'),file=el('input');
  mode.id='net-mode';file.id='net-import-file';file.type='file';file.accept='.json,application/json';importLabel.append(file);
  const liveButton=el('button','Start a new live collection');liveButton.id='net-live';liveButton.type='button';
  const importNote=el('p','Open a full or filtered evidence export locally. File contents stay in this browser.');importNote.id='net-import-note';
  const importDetails=el('details'),importProvenance=el('pre');importDetails.id='net-import-details';importDetails.hidden=true;importProvenance.id='net-import-provenance';importDetails.append(el('summary','Dataset digest and filter lineage'),importProvenance);
  importPanel.append(mode,importLabel,liveButton,importNote,importDetails);host.querySelector('.net-heading').after(importPanel);
  let points=[],links=[],zoom=1,pan={x:0,y:0},width=1,height=1,drag=null;
  const palette=['#c8ef9d','#8acbd1','#d2b6e8','#e4bf84','#95bba2','#d59389'];
  const asset=params.get('asset')?.toUpperCase();if(Object.hasOwn(A.DECIMALS,asset))$('net-asset').value=asset;
  function status(value,error=false){$('net-status').textContent=value;$('net-status').dataset.error=String(error);}
  function busyButtons(){$('net-refresh').disabled=busy||localMode;$('net-older').disabled=busy||localMode||cursor===null;$('net-export').disabled=!collection;$('net-analytics').disabled=!collection;$('net-asset').disabled=localMode;$('net-auto').disabled=localMode;liveButton.hidden=!localMode;mode.textContent=localMode?'LOCAL EVIDENCE COLLECTION':'LIVE SOURCE COLLECTION';host.dataset.collectionMode=localMode?'imported':'live';}
  async function collect(older=false){
    if(busy||localMode)return;const request=++requestId,asset=$('net-asset').value;busy=true;busyButtons();status(`Collecting ${older?'earlier':'latest'} real ${asset} records…`);
    try{
      const query=new URLSearchParams({asset});if(older&&cursor!==null)query.set('cursor',cursor);
      let response;
      for(let attempt=0;attempt<2;attempt++){
        response=await fetch(`/api/chain/network?${query}`,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(60000)});
        if(request!==requestId){await response.body?.cancel();return;}
        if(![502,503,504].includes(response.status)||attempt===1)break;
        status('The public source is temporarily unavailable. Retrying once…');await response.body?.cancel();await new Promise(resolve=>setTimeout(resolve,1200));if(request!==requestId)return;
      }
      if(!response.ok)throw new Error(`Source unavailable (HTTP ${response.status}). Collected observations keep their original anchors.`);
      const raw=await response.text();if(raw.length>4000000)throw new Error('Source page exceeds the collection limit.');const result=JSON.parse(raw);
      if(request!==requestId)return;if(result.asset!==asset)throw new Error('Source asset mismatch.');
      const next=S.merge(collection,result);if(!collection||older)cursor=result.next_cursor??null;collection=next;data=A.normalize(collection);
      blockOptions();
      render();status(`${next.added} new records · ${next.edges.length} unique records collected · latest retrieval ${result.retrieved_at}. ${result.coverage}.`);
      const url=new URL(location.href);url.search=new URLSearchParams({asset:asset.toLowerCase()}).toString();history.replaceState(null,'',url);
    }catch(error){if(request===requestId)status(error.message,true);}
    finally{if(request===requestId){busy=false;busyButtons();}}
  }
  function reset(load=true){requestId++;busy=false;collection=data=filtered=stats=null;cursor=null;selected=focus='';path=[];page=0;points=[];links=[];importedPacket=null;importDetails.hidden=true;importProvenance.textContent='';delete host.dataset.digest;
    $('net-kind').replaceChildren(new Option('All types','all'),...A.KINDS[$('net-asset').value].map(v=>new Option(v.replaceAll('_',' '),v)));
    $('net-block').replaceChildren(new Option('All collected blocks','all'));$('net-minimum').value='0';$('net-search').value='';
    for(const id of ['net-stats','net-ledger','net-references','net-timeline','net-sources','net-path-from','net-path-to'])$(id).replaceChildren();
    $('net-detail').textContent='Choose a public reference from the graph or list.';$('net-plot-count').textContent='No records collected.';$('net-page').textContent='';$('net-path-result').textContent='Choose a start and destination.';
    $('net-oculum').href=`oculum.html?asset=${$('net-asset').value.toLowerCase()}`;busyButtons();draw();if(load&&!localMode)collect();else status('No saved evidence is open. Choose a System Map JSON export.');
  }
  function blockOptions(){const value=$('net-block').value,blocks=[...new Set(data.edges.map(e=>e.block))].sort((a,b)=>b-a);$('net-block').replaceChildren(new Option('All collected blocks','all'),...blocks.map(n=>new Option(String(n),String(n))));if(blocks.includes(Number(value)))$('net-block').value=value;}
  async function openEvidence(read,reference=''){
    localMode=true;$('net-auto').checked=false;reset(false);let request=requestId;busy=true;busyButtons();status('Checking saved collection structure and dataset digest…');
    const url=new URL(location.href);url.search=new URLSearchParams({import:'evidence',...(reference?{reference}:{})});history.replaceState(null,'',url);
    importNote.textContent='Local inspection. Live collection is paused.';
    try{
      const serialized=await read();if(request!==requestId)return;
      if(typeof serialized!=='string'||new TextEncoder().encode(serialized).byteLength>6_000_000)throw new Error('No evidence packet is available, or the file exceeds 6 MB.');
      const {validateEvidenceCollection}=await import('./system_evidence.js'),packet=await validateEvidenceCollection(JSON.parse(serialized));if(request!==requestId)return;
      $('net-asset').value=packet.dataset.asset;reset(false);request=requestId;importedPacket=packet;collection=packet.dataset;data=A.fromCollection(packet);selected=data.nodes.some(n=>n.id===reference)?reference:'';blockOptions();render();
      host.dataset.digest=packet.dataset_sha256;importDetails.hidden=false;importProvenance.textContent=JSON.stringify({dataset_sha256:packet.dataset_sha256,digest_encoding:packet.digest_encoding,selection:packet.selection,snapshots:packet.dataset.snapshots},null,2);
      importNote.textContent=`${packet.selection?'Filtered subset':'Full collection'} · ${data.asset} · ${data.edges.length} exact records · SHA-256 ${packet.dataset_sha256}. Digest matches the dataset bytes; source claims remain unverified. Graph filters do not change the saved collection.`;
      status(`Opened ${data.edges.length} saved records from ${collection.snapshots.length} source pages. No source query was made. Select a reference to inspect this sample.`);busyButtons();
    }catch(error){if(request===requestId){busy=false;busyButtons();status(error.message,true);importNote.textContent='The saved packet was not opened. Choose another export or start a new live collection.';}}
  }
  file.addEventListener('change',()=>{const selectedFile=file.files?.[0];if(!selectedFile)return;openEvidence(async()=>{if(selectedFile.size>6_000_000)throw new Error('Collection file exceeds 6 MB.');return selectedFile.text();});file.value='';});
  liveButton.addEventListener('click',()=>{localMode=false;importNote.textContent='Live source collection. Imported evidence was kept only in this tab.';const url=new URL(location.href);url.search=new URLSearchParams({asset:$('net-asset').value.toLowerCase()});history.replaceState(null,'',url);reset();});
  function render(){
    if(!data)return;const minimum=$('net-minimum').value;
    if(!/^(0|[1-9][0-9]{0,77})$/.test(minimum)){status('Use an unsigned integer number of base units.',true);return;}
    const block=$('net-block').value==='all'?null:Number($('net-block').value);
    filtered=A.filterGraph(data,{kind:$('net-kind').value,minBlock:block,maxBlock:block,minimum,focus});stats=A.analyze(filtered);
    $('net-stats').replaceChildren(...[['References',filtered.nodes.length],['Connections',filtered.edges.length],['Components',stats.components],['Source snapshots',collection.snapshots.length]].map(([label,value])=>{const d=el('div');d.append(el('span',label),el('strong',String(value)));return d;}));
    const from=$('net-path-from').value,to=$('net-path-to').value;for(const id of ['net-path-from','net-path-to'])$(id).replaceChildren(...filtered.nodes.map(n=>new Option(short(n.label),n.id)));if(filtered.nodes.some(n=>n.id===from))$('net-path-from').value=from;if(filtered.nodes.some(n=>n.id===to))$('net-path-to').value=to;
    referenceList();detail();ledger();timeline();layout();
    $('net-sources').replaceChildren(...collection.snapshots.map((s,i)=>{const p=el('p',`${i+1}. ${s.source} · ${s.retrieved_at} · anchor ${s.anchor.height} / ${s.anchor.hash} · ${s.anchor.finality} · ${s.coverage}`);return p;}));
  }
  function referenceList(){
    if(!stats)return;const rows=stats.ranking.filter(n=>I.matches(n,$('net-search').value,data.asset));
    $('net-references').replaceChildren(...rows.slice(0,100).map(n=>{const b=el('button',`${short(n.label)} · ${n.degree} neighbors`);b.type='button';b.title=n.label;b.setAttribute('aria-pressed',String(n.id===selected));b.addEventListener('click',()=>choose(n.id));return b;}),el('small',`${Math.min(rows.length,100)} of ${rows.length} matching references. Search to narrow the list.`));
  }
  function choose(id){selected=id;referenceList();detail();$('net-detail').parentElement.scrollTop=0;$('net-detail').querySelector('h3')?.focus({preventScroll:true});if(!points.some(p=>p.id===id))layout();else draw();}
  function detail(){
    const target=$('net-detail');target.replaceChildren();if(!stats)return;const n=stats.ranking.find(n=>n.id===selected);
    if(!n){target.textContent='Select a point to inspect its real connections.';return;}
    const heading=el('h3',n.label);heading.tabIndex=-1;target.append(heading,el('p',`${n.kind.replaceAll('_',' ')} · ${n.incoming} incoming records · ${n.outgoing} outgoing · ${n.degree} distinct neighbors`));
    const links=el('div',undefined,'net-detail-links');
    if(n.kind!=='transaction')for(const [view,label] of [['constellation','Query address evidence ↗'],['oculum','Query real balance ↗'],['analytics','Analyze this address ↗']]){const a=el('a',label);a.href=`${view}.html?${new URLSearchParams({asset:data.asset.toLowerCase(),address:n.label})}`;links.append(a);}
    const focusButton=el('button','Focus direct neighborhood');focusButton.type='button';focusButton.addEventListener('click',()=>{focus=n.id;path=[];page=0;render();});links.append(focusButton);
    const start=el('button','Use as path start');start.type='button';start.addEventListener('click',()=>{$('net-path-from').value=n.id;});links.append(start);target.append(links);
    const observed=I.inspect(filtered,n.id),facts=el('p',`${observed.records} incident records · ${observed.transactions} transactions · ${observed.blocks} returned blocks · ${observed.records_without_timestamp} records without timestamps. ${observed.self_records} self-reference records.`);facts.id='net-reference-facts';target.append(facts,el('h4','Exact amounts in this filtered sample'));
    const totals=el('div',undefined,'net-reference-totals');totals.id='net-reference-totals';
    for(const group of observed.groups){const row=el('div');row.append(el('span',`${group.direction} / ${group.kind.replaceAll('_',' ')} / ${group.records} records`),el('strong',group.base_units),el('small','integer base units'));totals.append(row);}target.append(totals,el('p','Record amounts describe the sampled events. They are not a current balance. Self-reference records are listed separately; UTXO inputs and outputs retain separate types.','net-caption'));
    const peers=el('div',undefined,'net-references');peers.id='net-neighbors';for(const peer of observed.peers.slice(0,20)){const ref=filtered.nodes.find(node=>node.id===peer.id),b=el('button',`${short(ref.label)} · ${peer.incoming} in / ${peer.outgoing} out`);b.type='button';b.title=ref.label;b.dataset.reference=ref.id;b.addEventListener('click',()=>choose(ref.id));peers.append(b);}
    target.append(el('h4','Connected references'),peers,el('p',`${Math.min(20,observed.peers.length)} / ${observed.peers.length} direct neighbors listed. Search below to find any reference in the filtered sample.`,'net-caption'));
  }
  function ledger(){
    if(!filtered)return;const rows=[...filtered.edges].sort((a,b)=>b.block-a.block||a.id.localeCompare(b.id)),pages=Math.max(1,Math.ceil(rows.length/20));page=Math.min(page,pages-1);
    $('net-ledger').replaceChildren(...rows.slice(page*20,page*20+20).map(e=>{const tr=el('tr'),tx=el('td',String(e.block)),a=el('a',short(e.txid));a.href=data.asset==='BTC'?`https://blockstream.info/tx/${e.txid}`:data.asset==='BLCH'?`https://blochl1.com/tx/${e.txid}`:`https://etherscan.io/tx/${e.txid}`;a.target='_blank';a.rel='noopener noreferrer';a.title=e.txid;tx.append(a);const endpoints=el('td');for(const [id,arrow] of [[e.from,' → '],[e.to,'']]){const n=data.nodes.find(n=>n.id===id),b=el('button',short(n.label));b.type='button';b.title=n.label;b.addEventListener('click',()=>choose(id));endpoints.append(b,document.createTextNode(arrow));}const amount=el('td',e.amount);amount.append(el('small',`${A.format(e.amount,data.asset)} ${data.asset}`));tr.append(tx,endpoints,el('td',e.kind.replaceAll('_',' ')),amount);return tr;}));
    $('net-page').textContent=`${rows.length} records · page ${page+1} of ${pages}`;$('net-prev').disabled=page===0;$('net-next').disabled=page>=pages-1;
  }
  function timeline(){
    const counts=new Map();for(const e of data.edges)counts.set(e.block,(counts.get(e.block)||0)+1);const rows=[...counts].sort((a,b)=>a[0]-b[0]).slice(-80),max=Math.max(1,...rows.map(r=>r[1]));
    $('net-timeline').replaceChildren(...rows.map(([block,count])=>{const b=el('button');b.type='button';b.title=`Block ${block}: ${count} records`;b.setAttribute('aria-label',b.title);const bar=el('span');bar.style.height=`${Math.max(2,count/max*115)}px`;b.append(el('small',String(count)),bar,el('small',String(block)));b.addEventListener('click',()=>{$('net-block').value=String(block);page=0;path=[];render();});return b;}));
  }
  function layout(){
    const chosen=stats.ranking.slice(0,450),ids=new Set(chosen.map(n=>n.id));for(const id of [selected,...path.flatMap(e=>[e.from,e.to])]){const n=stats.ranking.find(n=>n.id===id);if(n&&!ids.has(id)){chosen.push(n);ids.add(id);}}
    points=chosen.map((n,i)=>({...n,x:Math.cos(i*2.399963)*Math.sqrt(i+1)*17,y:Math.sin(i*2.399963)*Math.sqrt(i+1)*17}));const map=new Map(points.map(p=>[p.id,p]));links=filtered.edges.filter(e=>map.has(e.from)&&map.has(e.to)).map(e=>({...e,a:map.get(e.from),b:map.get(e.to)}));
    for(let step=0;step<45;step++){for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){const a=points[i],b=points[j],dx=a.x-b.x,dy=a.y-b.y,f=80/(dx*dx+dy*dy+10);a.x+=dx*f;a.y+=dy*f;b.x-=dx*f;b.y-=dy*f;}for(const {a,b} of links){const dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy)||1,f=(dist-45)/dist*.006;a.x+=dx*f;a.y+=dy*f;b.x-=dx*f;b.y-=dy*f;}}
    $('net-plot-count').textContent=`${points.length} / ${filtered.nodes.length} references plotted · ${links.length} / ${filtered.edges.length} records drawn. All collected records remain in exports.`;fit();
  }
  function fit(){const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(0,...xs),maxX=Math.max(0,...xs),minY=Math.min(0,...ys),maxY=Math.max(0,...ys);const rect=canvas.parentElement.getBoundingClientRect();width=rect.width;height=rect.height;zoom=Math.min(3,Math.max(1,width-60)/Math.max(40,maxX-minX),Math.max(1,height-60)/Math.max(40,maxY-minY));pan={x:-(minX+maxX)*zoom/2,y:-(minY+maxY)*zoom/2};const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);draw();}
  function draw(){
    ctx.clearRect(0,0,width,height);ctx.save();ctx.translate(width/2+pan.x,height/2+pan.y);ctx.scale(zoom,zoom);const pathIds=new Set(path.map(e=>e.id));
    for(const e of links){const highlight=pathIds.has(e.id),near=e.from===selected||e.to===selected;ctx.beginPath();ctx.moveTo(e.a.x,e.a.y);ctx.lineTo(e.b.x,e.b.y);ctx.strokeStyle=highlight?'#ffda83':near?'#c8ef9daa':'#91b38b30';ctx.lineWidth=(highlight?2.2:near?1.4:.6)/zoom;ctx.stroke();if(highlight||near){const angle=Math.atan2(e.b.y-e.a.y,e.b.x-e.a.x),x=e.a.x+(e.b.x-e.a.x)*.72,y=e.a.y+(e.b.y-e.a.y)*.72,r=5/zoom;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-r*Math.cos(angle-.5),y-r*Math.sin(angle-.5));ctx.lineTo(x-r*Math.cos(angle+.5),y-r*Math.sin(angle+.5));ctx.closePath();ctx.fillStyle=highlight?'#ffda83':'#c8ef9d';ctx.fill();}}
    for(const p of points){const r=(p.kind==='transaction'?3:3+Math.min(7,Math.sqrt(p.degree)))/Math.sqrt(zoom);ctx.beginPath();if(p.kind==='transaction'){ctx.moveTo(p.x,p.y-r);ctx.lineTo(p.x+r,p.y);ctx.lineTo(p.x,p.y+r);ctx.lineTo(p.x-r,p.y);ctx.closePath();}else ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=palette[p.component%palette.length];ctx.fill();if(p.id===selected){ctx.beginPath();ctx.arc(p.x,p.y,r+5/zoom,0,Math.PI*2);ctx.strokeStyle='#efffdf';ctx.lineWidth=1.5/zoom;ctx.stroke();}}
    ctx.restore();
  }
  canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y,moved:false};canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>4)drag.moved=true;pan={x:drag.px+dx,y:drag.py+dy};draw();});
  canvas.addEventListener('pointerup',e=>{if(drag&&!drag.moved){const rect=canvas.getBoundingClientRect(),x=(e.clientX-rect.left-width/2-pan.x)/zoom,y=(e.clientY-rect.top-height/2-pan.y)/zoom;let hit=null,distance=18/zoom;for(const p of points){const d=Math.hypot(p.x-x,p.y-y);if(d<distance){hit=p;distance=d;}}if(hit)choose(hit.id);}drag=null;});canvas.addEventListener('pointercancel',()=>drag=null);canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.12,Math.min(12,zoom*Math.exp(-e.deltaY*.001)));draw();},{passive:false});
  $('net-fit').addEventListener('click',fit);$('net-in').addEventListener('click',()=>{zoom=Math.min(12,zoom*1.3);draw();});$('net-out').addEventListener('click',()=>{zoom=Math.max(.12,zoom/1.3);draw();});new ResizeObserver(fit).observe(canvas.parentElement);
  $('net-refresh').addEventListener('click',()=>collect());$('net-older').addEventListener('click',()=>collect(true));$('net-reset').addEventListener('click',()=>{reset();if(localMode)importNote.textContent='Saved collection cleared from this tab. Choose another evidence file or start a new live collection.';});$('net-asset').addEventListener('change',()=>reset());$('net-search').addEventListener('input',referenceList);
  for(const id of ['net-kind','net-block','net-minimum'])$(id).addEventListener('change',()=>{page=0;path=[];render();});$('net-clear-focus').addEventListener('click',()=>{focus='';path=[];$('net-kind').value='all';$('net-block').value='all';$('net-minimum').value='0';page=0;render();});$('net-prev').addEventListener('click',()=>{page--;ledger();});$('net-next').addEventListener('click',()=>{page++;ledger();});
  $('net-path').addEventListener('click',()=>{if(!filtered)return;const found=A.findPath(filtered,$('net-path-from').value,$('net-path-to').value,6);path=found||[];$('net-path-result').textContent=found?`${found.length} directed steps in returned records. ${found.map(e=>`${short(e.txid)} at block ${e.block}`).join(' → ')}. No chronological or value-continuity claim.`:'No directed path within six steps in this sample.';layout();});
  function exported(){return importedPacket||{kind:'graphus_network_collection',schema_version:1,exported_at:new Date().toISOString(),independent_verification:false,dataset:{...collection,snapshots:collection.snapshots.map(({signature,...s})=>s)}};}
  $('net-export').addEventListener('click',()=>{if(!collection)return;const url=URL.createObjectURL(new Blob([JSON.stringify(exported(),null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download=`graphus-${data.asset.toLowerCase()}-real-collection.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  $('net-analytics').addEventListener('click',()=>{try{sessionStorage.setItem('graphus.analytics.network.v1',JSON.stringify(exported()));location.assign('analytics.html?import=network');}catch{status('Browser storage is full. Export the collection JSON first.',true);}});
  setInterval(()=>{if(!localMode&&$('net-auto').checked&&!document.hidden&&!busy)collect();},60000);
  if(importing)openEvidence(()=>{const serialized=sessionStorage.getItem('graphus.constellation.evidence.v1');sessionStorage.removeItem('graphus.constellation.evidence.v1');return serialized;},params.get('reference')||'');else reset();
})();
