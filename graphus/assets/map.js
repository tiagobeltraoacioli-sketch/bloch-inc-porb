import {ASSETS,LAYERS,STATUS,CATEGORIES,MODULES,CONNECTIONS,matchesModule,effectiveAsset,actionLinks} from './system_modules.js';
import {fetchEvidence} from './system_evidence.js';
const $=id=>document.getElementById(id),byId=new Map(MODULES.map(n=>[n.id,n]));
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,action)=>{const b=el('button',text);b.type='button';b.onclick=action;return b;};
const link=(text,href)=>{const a=el('a',text);a.href=href;if(href.startsWith('https://')||href.startsWith('/api/')){a.target='_blank';a.rel='noopener noreferrer';}return a;};
const svg=(tag,attrs={})=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
const short=value=>value.length>26?value.slice(0,12)+'…'+value.slice(-10):value;
const state={asset:'all',category:'all',status:'all',query:'',selected:null,directory:matchMedia('(max-width:700px)').matches,box:[0,0,1530,930]};
let dimensions=[1530,930],drag=null,packet=null,recordPage=0,controller=null,requestId=0;
$('category-filter').replaceChildren(...Object.entries(CATEGORIES).map(([value,text])=>new Option(text,value)));
function readLocation(){
  const p=new URLSearchParams(location.search);
  state.asset=ASSETS.includes(p.get('asset')?.toUpperCase())?p.get('asset').toUpperCase():'all';
  state.category=Object.hasOwn(CATEGORIES,p.get('category'))?p.get('category'):'all';
  state.status=Object.hasOwn(STATUS,p.get('status'))?p.get('status'):'all';state.query=(p.get('q')||'').slice(0,160);
  state.selected=byId.has(p.get('module'))?p.get('module'):null;
  if(state.selected&&!matchesModule(byId.get(state.selected),state)){state.category=state.status='all';state.query='';state.asset=effectiveAsset(byId.get(state.selected),state.asset);}
  $('asset-filter').value=state.asset;$('category-filter').value=state.category;$('status-filter').value=state.status;$('node-search').value=state.query;
}
function writeLocation(){const p=new URLSearchParams();if(state.asset!=='all')p.set('asset',state.asset);if(state.category!=='all')p.set('category',state.category);if(state.status!=='all')p.set('status',state.status);if(state.query)p.set('q',state.query);if(state.selected)p.set('module',state.selected);history.replaceState(null,'',location.pathname+(p.size?'?'+p:'')+location.hash);}
function announce(text){$('map-message').textContent=text;}
function stats(){const values=[['System modules',MODULES.length],['Available capabilities',MODULES.filter(n=>n.status==='available').length],['AML modules',MODULES.filter(n=>n.category==='aml').length],['Networks / assets','3 / 5']];$('map-facts').replaceChildren(...values.map(([title,value])=>{const box=el('div');box.append(el('strong',String(value)),el('span',title));return box;}));}
function render(){
  if(state.selected&&!matchesModule(byId.get(state.selected),state))state.selected=null;
  const nodes=MODULES.filter(n=>matchesModule(n,state));$('map-result-count').textContent=`${nodes.length} / ${MODULES.length} modules`;
  $('map-results').replaceChildren(...nodes.map(node=>{const card=button('',()=>select(node.id));card.dataset.module=node.id;card.setAttribute('aria-pressed',String(state.selected===node.id));card.append(el('span',`${node.layer} / ${STATUS[node.status]} · ${node.access}`,'module-eyebrow'),el('strong',node.title),el('span',node.description));return card;}));
  if(!nodes.length)$('map-results').append(el('p','No modules match these filters. Reset filters or try another search.'));
  $('map-results').hidden=!state.directory;$('map-canvas-wrap').hidden=state.directory;
  $('show-map').setAttribute('aria-pressed',String(!state.directory));$('show-directory').setAttribute('aria-pressed',String(state.directory));
  for(const id of ['zoom-in','zoom-out','zoom-reset'])$(id).disabled=state.directory;
  draw(nodes);inspect();writeLocation();
}
function select(id){
  const node=byId.get(id);if(!node)return;
  if(!matchesModule(node,state)){state.category=state.status='all';state.query='';if(state.asset!=='all'&&!node.assets.includes(state.asset))state.asset=effectiveAsset(node,state.asset);$('asset-filter').value=state.asset;$('category-filter').value=state.category;$('status-filter').value=state.status;$('node-search').value='';}
  state.selected=id;render();announce(`Selected ${node.title}. ${STATUS[node.status]} · ${node.access} access.`);
  if(state.directory)$('node-inspector').focus({preventScroll:true});
}
function inspect(){
  const target=$('node-inspector');target.replaceChildren();const node=byId.get(state.selected);
  if(!node){target.append(el('p','MODULE INSPECTOR','section-index'),el('h3','Choose a module.'),el('p','Inspect its inputs, outputs and dependencies. Available actions open the corresponding tool.'));return;}
  target.append(el('p',`${node.layer} / ${CATEGORIES[node.category]}`,'section-index'),el('h3',node.title),el('p',`${STATUS[node.status]} · ${node.access} access`,'module-badge'),el('p',node.description));
  for(const[heading,items]of [['Inputs',node.inputs],['Outputs',node.outputs]]){target.append(el('h4',heading));const list=el('ul');list.append(...items.map(text=>el('li',text)));target.append(list);}
  target.append(el('h4','Coverage & implementation'),el('p',node.limits,'module-limit'));
  const actions=el('div',undefined,'module-actions');
  if(node.actions.includes('capture'))actions.append(button('Capture this asset’s evidence',()=>{setCaptureAsset(effectiveAsset(node,state.asset));$('module-workbench').scrollIntoView({block:'start'});$('capture-button').focus({preventScroll:true});}));
  for(const action of actionLinks(node,state.asset))actions.append(link(action.label+' ↗',action.href));
  actions.append(button('Copy module link',async()=>{try{await navigator.clipboard.writeText(location.href);announce('Module link copied.');}catch{announce('Copy unavailable. The address bar contains this module link.');}}));target.append(actions);
  for(const[heading,edges,key]of [['Upstream modules',CONNECTIONS.filter(e=>e.to===node.id),'from'],['Downstream modules',CONNECTIONS.filter(e=>e.from===node.id),'to']]){
    if(!edges.length)continue;target.append(el('h4',heading));const list=el('div',undefined,'dependency-list');for(const edge of edges){const b=button(byId.get(edge[key]).title,()=>select(edge[key]));b.title=edge.contract;list.append(b);}target.append(list);
  }
}
function inspectConnection(edge){
  const target=$('node-inspector');target.replaceChildren(el('p','CONNECTION CONTRACT','section-index'),el('h3',`${byId.get(edge.from).title} → ${byId.get(edge.to).title}`),el('p',edge.contract),el('p','This arrow describes a module dependency. It does not represent a wallet transfer.','module-limit'));
  target.append(button('Inspect source module',()=>select(edge.from)),button('Inspect destination module',()=>select(edge.to)));announce(`Connection: ${edge.contract}`);
}
function draw(nodes){
  const chart=$('graphus-map');chart.replaceChildren();const defs=svg('defs'),marker=svg('marker',{id:'module-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:5,markerHeight:5,orient:'auto'});marker.append(svg('path',{d:'M0 0 L10 5 L0 10 Z',fill:'#7696a7'}));defs.append(marker);chart.append(defs);
  const title=svg('title',{id:'map-title'}),description=svg('desc',{id:'map-desc'});title.textContent='Graphus system module dependencies';description.textContent='Select a module or arrow. The directory provides a compact alternative.';chart.append(title,description);
  const positions=new Map();let max=0;
  LAYERS.forEach((layer,col)=>{const rows=nodes.filter(n=>n.layer===layer);max=Math.max(max,rows.length);const title=svg('text',{x:24+col*250,y:32,class:'map-column-label'});title.textContent=`0${col+1} / ${layer}`;chart.append(title);rows.forEach((node,row)=>positions.set(node.id,{x:24+col*250,y:62+row*97}));});
  dimensions=[1530,Math.max(460,90+max*97)];
  const near=new Set(state.selected?[state.selected]:[]);for(const edge of CONNECTIONS)if(edge.from===state.selected||edge.to===state.selected){near.add(edge.from);near.add(edge.to);}
  for(const edge of CONNECTIONS){const a=positions.get(edge.from),b=positions.get(edge.to);if(!a||!b)continue;
    const active=edge.from===state.selected||edge.to===state.selected,path=`M${a.x+210} ${a.y+34} C${a.x+245} ${a.y+34},${b.x-35} ${b.y+34},${b.x} ${b.y+34}`;
    const g=svg('g',{class:`map-connection${active?' active':''}${state.selected&&!active?' dimmed':''}`,role:'button',tabindex:0,'aria-label':`${byId.get(edge.from).title} to ${byId.get(edge.to).title}: ${edge.contract}`,'data-from':edge.from,'data-to':edge.to});
    g.append(svg('path',{d:path,class:'map-link-hit'}),svg('path',{d:path,class:'map-link','marker-end':'url(#module-arrow)'}));activate(g,()=>inspectConnection(edge));chart.append(g);
  }
  for(const node of nodes){const{x,y}=positions.get(node.id),g=svg('g',{class:`map-node ${node.status}${node.id===state.selected?' selected':''}${state.selected&&!near.has(node.id)?' dimmed':''}`,tabindex:0,role:'button','data-module':node.id,'aria-label':`${node.title}, ${STATUS[node.status]}, ${node.access}`,'aria-pressed':String(node.id===state.selected)});
    g.append(svg('rect',{x,y,width:210,height:70,rx:8}),svg('circle',{cx:x+14,cy:y+17,r:4}));
    for(const[dy,text,cls]of [[30,node.title,'node-title'],[51,`${STATUS[node.status].toUpperCase()} / ${node.access.toUpperCase()}`,'node-sub']]){const t=svg('text',{x:x+15,y:y+dy,class:cls});t.textContent=text;g.append(t);}
    activate(g,()=>select(node.id));chart.append(g);
  }
  fit();
}
function activate(node,action){node.onclick=action;node.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();action();if(node.dataset.module)$('graphus-map').querySelector(`[data-module="${node.dataset.module}"]`)?.focus({preventScroll:true});}};}
function viewport(){$('graphus-map').setAttribute('viewBox',state.box.join(' '));}
function fit(){state.box=[0,0,...dimensions];viewport();}
function zoom(factor){const w=Math.max(450,Math.min(dimensions[0]*1.7,state.box[2]*factor)),h=w*dimensions[1]/dimensions[0];state.box=[state.box[0]+(state.box[2]-w)/2,state.box[1]+(state.box[3]-h)/2,w,h];viewport();}
for(const[id,key]of [['asset-filter','asset'],['category-filter','category'],['status-filter','status']])$(id).onchange=()=>{state[key]=$(id).value;render();};
$('node-search').oninput=()=>{state.query=$('node-search').value;render();};
$('clear-filters').onclick=()=>{state.asset=state.category=state.status='all';state.query='';for(const id of ['asset-filter','category-filter','status-filter'])$(id).value='all';$('node-search').value='';render();};
$('show-map').onclick=()=>{state.directory=false;render();};$('show-directory').onclick=()=>{state.directory=true;render();};
$('zoom-in').onclick=()=>zoom(.8);$('zoom-out').onclick=()=>zoom(1.25);$('zoom-reset').onclick=fit;
$('graphus-map').onpointerdown=event=>{if(event.target.closest('[role=button]'))return;drag={x:event.clientX,y:event.clientY,box:[...state.box]};event.currentTarget.setPointerCapture(event.pointerId);};
$('graphus-map').onpointermove=event=>{if(!drag)return;const rect=event.currentTarget.getBoundingClientRect(),scale=Math.min(rect.width/state.box[2],rect.height/state.box[3]);state.box[0]=drag.box[0]-(event.clientX-drag.x)/scale;state.box[1]=drag.box[1]-(event.clientY-drag.y)/scale;viewport();};
$('graphus-map').onpointerup=$('graphus-map').onpointercancel=()=>drag=null;
addEventListener('popstate',()=>{readLocation();render();});

function clearCapture(message='Capture cleared. No source data is stored by this workbench.'){
  requestId++;controller?.abort();controller=null;packet=null;recordPage=0;$('capture-result').hidden=true;$('capture-cancel').hidden=true;$('capture-button').disabled=false;$('capture-status').textContent=message;
  for(const id of ['capture-ledger','capture-source','capture-metrics','capture-blocks','capture-types','capture-provenance'])$(id).replaceChildren();
  $('capture-search').value='';
}
function setCaptureAsset(asset){if($('capture-asset').value!==asset){clearCapture('Asset changed. Capture a new source page.');$('capture-asset').value=asset;}$('reference-asset').value=asset;}
$('capture-asset').onchange=()=>{clearCapture('Asset changed. Capture a new source page.');$('reference-asset').value=$('capture-asset').value;};
$('capture-clear').onclick=()=>clearCapture();$('capture-cancel').onclick=()=>clearCapture('Capture canceled.');
$('capture-form').onsubmit=async event=>{
  event.preventDefault();clearCapture();const id=++requestId,asset=$('capture-asset').value;controller=new AbortController();const active=controller;
  const timeout=setTimeout(()=>active.abort(),65000);$('capture-button').disabled=true;$('capture-cancel').hidden=false;$('capture-status').textContent=`Reading real ${asset} source records…`;
  try{const result=await fetchEvidence(asset,{signal:active.signal});if(id!==requestId)return;packet=result;renderCapture();$('capture-status').textContent=`Captured ${result.diagnostics.records} source records for ${asset}. Source retrieval: ${result.dataset.retrieved_at}.`;}
  catch(error){if(id===requestId)$('capture-status').textContent=active.signal.aborted?'Source request timed out. Retry the capture.':error.message;}
  finally{clearTimeout(timeout);if(id===requestId){controller=null;$('capture-button').disabled=false;$('capture-cancel').hidden=true;}}
};
function renderCapture(){
  const{dataset:d,diagnostics:q}=packet;$('capture-result').hidden=false;
  $('capture-metrics').replaceChildren(...[['References',q.references],['Records',q.records],['Transactions',q.transactions],['Returned blocks',q.blocks],['Missing timestamps',q.records_without_timestamp]].map(([name,value])=>{const box=el('div');box.append(el('span',name),el('strong',value.toLocaleString()));return box;}));
  $('capture-source').replaceChildren(el('strong',d.source),el('p',`${d.asset} / ${d.network} · Source block ${d.anchor.height} · ${d.anchor.hash}`),el('p',d.coverage),el('p',`Finality: ${d.anchor.finality||'not supplied'}. Source-reported; not independently verified.`));
  const blocks=new Map();for(const edge of d.edges)blocks.set(String(edge.block_number),(blocks.get(String(edge.block_number))||0)+1);
  bars('capture-blocks',[...blocks].sort((a,b)=>Number(a[0])-Number(b[0])).slice(-32));bars('capture-types',Object.entries(q.record_types));
  $('capture-graph').href=`constellation.html?asset=${d.asset.toLowerCase()}`;
  $('capture-provenance').textContent=JSON.stringify({dataset_sha256:packet.dataset_sha256,digest_encoding:packet.digest_encoding,diagnostics:q,snapshots:d.snapshots,aml_score_included:false},null,2);ledger();
}
function bars(id,rows){const max=Math.max(1,...rows.map(r=>r[1]));$(id).replaceChildren(...rows.map(([title,count])=>{const row=el('div'),meter=el('meter');meter.max=max;meter.value=count;meter.setAttribute('aria-label',`${title}: ${count} returned records`);row.append(el('span',title.replaceAll('_',' ')),meter,el('b',count.toLocaleString()));return row;}));if(!rows.length)$(id).append(el('p','No records were returned in this source page.'));}
function transactionUrl(asset,txid){return `${asset==='BTC'?'https://blockstream.info':asset==='BLCH'?'https://blochl1.com':'https://etherscan.io'}/tx/${txid}`;}
function referenceLink(node,asset){const ref=node.address||node.txid,a=link(short(ref),node.kind==='transaction'?transactionUrl(asset,ref):`constellation.html?${new URLSearchParams({asset:asset.toLowerCase(),address:ref})}`);a.title=ref;return a;}
function ledger(){
  if(!packet)return;const d=packet.dataset,refs=new Map(d.nodes.map(n=>[n.id,n])),query=$('capture-search').value.trim();
  const matches=value=>d.asset==='BTC'&&/^[13]/.test(value)?value.includes(query):value.toLowerCase().includes(query.toLowerCase());
  const rows=d.edges.filter(e=>[e.txid,refs.get(e.from).address||refs.get(e.from).txid,refs.get(e.to).address||refs.get(e.to).txid].some(matches));
  const pages=Math.max(1,Math.ceil(rows.length/20));recordPage=Math.min(recordPage,pages-1);
  $('capture-ledger').replaceChildren(...rows.slice(recordPage*20,recordPage*20+20).map(e=>{const row=el('tr'),block=el('td',String(e.block_number)),tx=link(short(e.txid),transactionUrl(d.asset,e.txid));tx.title=e.txid;block.append(tx);const endpoints=el('td');endpoints.append(referenceLink(refs.get(e.from),d.asset),el('span',' → '),referenceLink(refs.get(e.to),d.asset));row.append(block,endpoints,el('td',e.kind.replaceAll('_',' ')),el('td',e.amount_base_units));return row;}));
  $('capture-page').textContent=`${rows.length} matching records · Page ${recordPage+1} / ${pages}`;$('capture-prev').disabled=recordPage===0;$('capture-next').disabled=recordPage>=pages-1;
}
$('capture-search').oninput=()=>{recordPage=0;ledger();};$('capture-prev').onclick=()=>{recordPage--;ledger();};$('capture-next').onclick=()=>{recordPage++;ledger();};
$('capture-export').onclick=()=>{if(!packet)return;const url=URL.createObjectURL(new Blob([JSON.stringify(packet,null,2)],{type:'application/json'})),a=link('',url);a.download=`graphus-evidence-${packet.dataset.asset}-${packet.dataset.anchor.height}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('capture-analytics').onclick=()=>{if(!packet)return;try{sessionStorage.setItem('graphus.analytics.network.v1',JSON.stringify(packet));location.href='analytics.html?import=network';}catch{$('capture-status').textContent='Browser handoff unavailable. Export the JSON packet and import it into Analytics.';}};
$('reference-form').onsubmit=event=>{event.preventDefault();const asset=$('reference-asset').value,reference=$('reference-input').value.trim();const valid=asset==='BLCH'?/^[a-f0-9]{64}$/i.test(reference):asset==='BTC'?/^(bc1[ac-hj-np-z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/i.test(reference):/^0x[a-f0-9]{40}$/i.test(reference);if(!valid){$('reference-status').textContent=`Enter a public ${asset==='BLCH'?'64-hex script hash':asset+' address'} in the expected format.`;return;}const view=event.submitter?.value==='oculum'?'oculum':'constellation';location.href=`${view}.html?${new URLSearchParams({asset:asset.toLowerCase(),address:reference})}`;};
const workflows=[['AML evidence preparation',['aml-evidence','snapshot','scores','review'],'Capture public observations, retain coverage and inspect private descriptive scores. Case management remains planned.'],['Graph & balance research',['events','paths','balances','motifs'],'Move between transaction records, directed paths, observed balances and graph statistics.'],['Organization integration',['invitations','api-keys','daas','audit'],'Open the private portal to invite users, create scoped keys and inspect recorded access events.'],['Machine learning',['features','ml','blue','timeseries'],'Inspect descriptive features, Red/Blue components and historical evaluation methods.']];
$('workflow-cards').replaceChildren(...workflows.map(([title,ids,description])=>{const card=el('article');card.append(el('h3',title),el('p',description));ids.forEach((id,i)=>card.append(button(`${i+1}. ${byId.get(id).title}`,()=>{select(id);$('system').scrollIntoView({block:'start'});})));return card;}));
readLocation();stats();render();if(state.asset!=='all')setCaptureAsset(state.asset);
