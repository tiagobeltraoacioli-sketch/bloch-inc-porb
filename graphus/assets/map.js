import {ASSETS,LAYERS,STATUS,CATEGORIES,MODULES,CONNECTIONS,matchesModule,effectiveAsset,actionLinks} from './system_modules.js';
import {createEvidenceWorkbench} from './system_workbench.js?v=20260924observation';
import {supportsCapturedSample,sampleForModule} from './system_observation.js';
const $=id=>document.getElementById(id),byId=new Map(MODULES.map(n=>[n.id,n]));
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,action)=>{const b=el('button',text);b.type='button';b.onclick=action;return b;};
const link=(text,href)=>{const a=el('a',text);a.href=href;if(href.startsWith('https://')||href.startsWith('/api/')){a.target='_blank';a.rel='noopener noreferrer';}return a;};
const svg=(tag,attrs={})=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
const compact=matchMedia('(max-width:1100px)');
const state={asset:'all',layer:'all',category:'all',status:'all',query:'',selected:null,directory:matchMedia('(max-width:700px)').matches,inspectorOpen:false,box:[0,0,1530,930]};
let dimensions=[1530,930],positions=new Map(),layoutKey='',fitWidth=1530,drag=null,connection=null,detailsMarker=null,expandMarker=null;
let observation={phase:'idle',sample:null,busy:false},observationKey='';
const {setAsset:setCaptureAsset,useCurrent}=createEvidenceWorkbench({onObservation:updateObservation});
$('layer-filter').append(...LAYERS.map(value=>new Option(value,value)));
$('category-filter').replaceChildren(...Object.entries(CATEGORIES).map(([value,text])=>new Option(text,value)));
function readLocation(){
  const p=new URLSearchParams(location.search);
  state.asset=ASSETS.includes(p.get('asset')?.toUpperCase())?p.get('asset').toUpperCase():'all';
  state.layer=LAYERS.includes(p.get('layer'))?p.get('layer'):'all';
  state.category=Object.hasOwn(CATEGORIES,p.get('category'))?p.get('category'):'all';
  state.status=Object.hasOwn(STATUS,p.get('status'))?p.get('status'):'all';state.query=(p.get('q')||'').slice(0,160);
  state.selected=byId.has(p.get('module'))?p.get('module'):null;
  if(state.selected&&!matchesModule(byId.get(state.selected),state)){state.layer=state.category=state.status='all';state.query='';state.asset=effectiveAsset(byId.get(state.selected),state.asset);}
  syncFilters();
}
function syncFilters(){for(const key of ['asset','layer','category','status'])$(key+'-filter').value=state[key];$('node-search').value=state.query;}
function writeLocation(){const p=new URLSearchParams();if(state.asset!=='all')p.set('asset',state.asset);if(state.layer!=='all')p.set('layer',state.layer);if(state.category!=='all')p.set('category',state.category);if(state.status!=='all')p.set('status',state.status);if(state.query)p.set('q',state.query);if(state.selected)p.set('module',state.selected);history.replaceState(null,'',location.pathname+(p.size?'?'+p:'')+location.hash);}
function announce(text){$('map-message').textContent=text;}
function stats(){const values=[['System modules',MODULES.length],['Available capabilities',MODULES.filter(n=>n.status==='available').length],['AML modules',MODULES.filter(n=>n.category==='aml').length],['Networks / assets','3 / 5']];$('map-facts').replaceChildren(...values.map(([title,value])=>{const box=el('div');box.append(el('strong',String(value)),el('span',title));return box;}));}
function render({refit=false}={}){
  if(state.selected&&!matchesModule(byId.get(state.selected),state))state.selected=null;
  const nodes=MODULES.filter(n=>matchesModule(n,state));if(connection&&(!nodes.some(n=>n.id===connection.from)||!nodes.some(n=>n.id===connection.to)))connection=null;
  if(!state.selected&&!connection)state.inspectorOpen=false;syncInspector();$('map-result-count').textContent=`${nodes.length} / ${MODULES.length} modules`;
  $('map-results').replaceChildren(...nodes.map(node=>{const card=button('',()=>select(node.id));card.dataset.module=node.id;card.setAttribute('aria-pressed',String(state.selected===node.id));card.append(el('span',`${node.layer} / ${STATUS[node.status]} · ${node.access}`,'module-eyebrow'),el('strong',node.title),el('span',node.description));return card;}));
  if(!nodes.length)$('map-results').append(el('p','No modules match these filters. Reset filters or try another search.'));
  $('map-results').hidden=!state.directory;$('map-canvas-wrap').hidden=state.directory;
  $('show-map').setAttribute('aria-pressed',String(!state.directory));$('show-directory').setAttribute('aria-pressed',String(state.directory));
  for(const id of ['zoom-in','zoom-out','zoom-reset'])$(id).disabled=state.directory;
  draw(nodes,refit);inspect();renderObservation();writeLocation();
}
function select(id){
  const node=byId.get(id);if(!node)return;
  if(!matchesModule(node,state)){state.layer=state.category=state.status='all';state.query='';if(state.asset!=='all'&&!node.assets.includes(state.asset))state.asset=effectiveAsset(node,state.asset);syncFilters();}
  state.selected=id;connection=null;state.inspectorOpen=true;render();openDetails();announce(`Selected ${node.title}. ${STATUS[node.status]} · ${node.access} access.`);
}
function syncInspector(){
  const hasSelection=Boolean(state.selected||connection);$('show-details').disabled=$('clear-selection').disabled=!hasSelection;
  $('zoom-selection').disabled=state.directory||!state.selected;
  $('map-grid').classList.toggle('with-inspector',state.inspectorOpen&&!compact.matches);
  $('inspector-shell').hidden=!state.inspectorOpen||(compact.matches&&!$('map-details-dialog').open);
  $('show-details').setAttribute('aria-expanded',String(state.inspectorOpen&&(!compact.matches||$('map-details-dialog').open)));
}
function openDetails(){
  state.inspectorOpen=true;
  if(compact.matches&&!$('map-details-dialog').open){detailsMarker=document.createComment('module details');$('inspector-shell').before(detailsMarker);$('map-details-dialog').append($('inspector-shell'));$('inspector-shell').hidden=false;$('map-details-dialog').showModal();$('node-inspector').focus({preventScroll:true});}
  syncInspector();$('node-inspector').scrollTop=0;if(!compact.matches)$('inspector-shell').scrollIntoView({block:'nearest'});
}
function openWorkbench(){closeDetails();closeExpanded();$('module-workbench').scrollIntoView({block:'start'});$('capture-status').focus({preventScroll:true});}
function useSample(action,asset){if(!useCurrent(asset,action)){openWorkbench();announce('Could not open the sample. Inspect the data workbench for details.');return;}if(action==='older')openWorkbench();}
function updateObservation(value){const key=JSON.stringify(value);if(key===observationKey)return;observationKey=key;observation=value;renderObservation();}
function renderObservation(){
  const {sample,busy,phase}=observation,phases={idle:'Not captured',collecting:'Collecting',ready:'Captured',error:'Source request failed',canceled:'Capture canceled'};
  const count=(value,label)=>`${value.toLocaleString()} ${label}${value===1?'':'s'}`;
  const status=$('observation-status');status.textContent=phases[phase];status.dataset.phase=phase;
  $('observation-title').textContent=sample?`${sample.asset} · ${count(sample.records,'record')} · ${count(sample.pages,'source page')}`:'Connect the map to a source sample';
  $('observation-message').textContent=observation.message||'Capture public observations to inspect their source and reuse the same records across tools.';
  $('observation-source').textContent=sample?`${sample.source} · Highest sampled anchor ${sample.anchor.height} · Retrieved ${sample.retrieved_at}`:'Source queries run only when requested.';
  $('observation-open').onclick=openWorkbench;
  for(const node of MODULES){
    const available=sampleForModule(node,observation,state.asset),g=$('graphus-map').querySelector(`[data-module="${node.id}"]`),card=$('map-results').querySelector(`[data-module="${node.id}"]`);
    if(g){g.querySelector('.sample-indicator')?.remove();g.setAttribute('aria-label',`${node.title}, ${STATUS[node.status]}, ${node.access}${available?`, captured ${available.asset} sample available`:''}`);if(available){const p=positions.get(node.id),dot=svg('circle',{cx:p.x+196,cy:p.y+16,r:4,class:'sample-indicator'}),title=svg('title');title.textContent=`Captured ${available.asset} sample available`;dot.append(title);g.append(dot);}}
    if(card){card.querySelector('.sample-badge')?.remove();if(available)card.append(el('span',`Captured ${available.asset} sample available`,'sample-badge'));}
  }
  const panel=$('module-observation'),node=byId.get(state.selected);if(!panel||!node)return;panel.replaceChildren();
  const current=sampleForModule(node,observation,state.asset);panel.append(el('h4','Captured sample'));
  if(!current){panel.append(el('p',sample?'The current capture does not apply to this module and asset selection.':'No source page has been captured in this tab.'),button('Open data workbench',openWorkbench));return;}
  panel.append(el('p',`${current.asset} / ${current.network} · ${count(current.records,'record')} · ${count(current.references,'reference')} · ${count(current.pages,'source page')}`,'observation-counts'),el('p',`${count(current.transactions,'transaction')} · ${count(current.blocks,'returned block')} · ${count(current.missing_timestamps,'record')} without timestamps`));
  const profile=current.profile;
  if(profile){const p=el('p',`Evidence profile · ${profile.blocks.heights_without_records} heights without returned records · ${profile.structure.reciprocal_reference_pairs} reciprocal adjacency pairs · ${profile.structure.zero_amount_records} zero-amount records. ${profile.temporal.first_observed_at?'Observed time: '+profile.temporal.first_observed_at+' to '+profile.temporal.last_observed_at:'No source timestamps available.'}`);p.className='sample-evidence-profile';panel.append(p);}
  const details=el('details');details.append(el('summary','Source, anchor and dataset digest'));
  const fields=el('dl');for(const [label,value]of [['Source',current.source],['Retrieved',current.retrieved_at],['Highest sampled anchor',`${current.anchor.height} · ${current.anchor.hash}`],['Source finality',current.anchor.finality||'Not supplied'],['Dataset SHA-256',current.dataset_sha256]])fields.append(el('dt',label),el('dd',value));details.append(fields,el('p',current.coverage));panel.append(details);
  panel.append(el('p','These actions use the full captured sample. Ledger filters apply only in the data workbench.','observation-note'));
  if(phase==='error'||phase==='canceled'||busy)panel.append(el('p',observation.message,'observation-note'));
  const actions=el('div',undefined,'observation-actions');actions.append(button('Inspect captured records',openWorkbench));
  for(const [label,action]of [['Graph captured sample','graph'],['Analyze captured sample','analytics'],['Export captured JSON','export'],['Load earlier sample pages','older']]){const b=button(label,()=>useSample(action,current.asset));b.disabled=busy||(action==='older'&&!observation.canLoadEarlier);actions.append(b);}panel.append(actions);
}
function restoreDetails(){
  if(!detailsMarker)return;detailsMarker.replaceWith($('inspector-shell'));detailsMarker=null;state.inspectorOpen=false;syncInspector();$('show-details').focus({preventScroll:true});
}
function closeDetails(){if($('map-details-dialog').open){$('map-details-dialog').close();restoreDetails();}else{state.inspectorOpen=false;syncInspector();$('show-details').focus({preventScroll:true});}}
$('map-details-dialog').addEventListener('close',restoreDetails);$('close-details').onclick=closeDetails;$('show-details').onclick=openDetails;
function restoreExpanded(){if(!expandMarker)return;expandMarker.replaceWith($('map-panel'));expandMarker=null;$('map-expand').textContent='Expand workspace';fit();$('map-expand').focus({preventScroll:true});}
function closeExpanded(){if($('map-expanded').open){$('map-expanded').close();restoreExpanded();}}
$('map-expanded').addEventListener('close',restoreExpanded);
$('map-expand').onclick=()=>{if($('map-expanded').open){closeExpanded();return;}expandMarker=document.createComment('System Map workspace');$('map-panel').before(expandMarker);$('map-expanded').append($('map-panel'));$('map-expand').textContent='Exit expanded view';$('map-expanded').showModal();fit();};
compact.addEventListener('change',()=>{if(!compact.matches&&$('map-details-dialog').open){closeDetails();state.inspectorOpen=true;}syncInspector();});
function inspect(){
  const target=$('node-inspector');target.replaceChildren();if(connection){renderConnection(connection);return;}const node=byId.get(state.selected);
  if(!node){target.append(el('p','MODULE INSPECTOR','section-index'),el('h3','Choose a module.'),el('p','Inspect its inputs, outputs and dependencies. Available actions open the corresponding tool.'));return;}
  target.append(el('p',`${node.layer} / ${CATEGORIES[node.category]}`,'section-index'),el('h3',node.title),el('p',`${STATUS[node.status]} · ${node.access} access`,'module-badge'),el('p',node.description));
  if(supportsCapturedSample(node)){const section=el('section',undefined,'module-observation');section.id='module-observation';section.setAttribute('aria-label','Captured public sample');target.append(section);}
  for(const[heading,items]of [['Inputs',node.inputs],['Outputs',node.outputs]]){target.append(el('h4',heading));const list=el('ul');list.append(...items.map(text=>el('li',text)));target.append(list);}
  target.append(el('h4','Coverage & implementation'),el('p',node.limits,'module-limit'));
  const actions=el('div',undefined,'module-actions');
  if(node.actions.includes('capture')){const asset=effectiveAsset(node,state.asset);actions.append(button(`Capture ${asset} evidence`,()=>{setCaptureAsset(asset);openWorkbench();$('capture-form').requestSubmit();}));}
  for(const action of actionLinks(node,state.asset))actions.append(link(action.label+' ↗',action.href));
  actions.append(button('Copy module link',async()=>{try{await navigator.clipboard.writeText(location.href);announce('Module link copied.');}catch{announce('Copy unavailable. The address bar contains this module link.');}}));target.append(actions);
  for(const[heading,edges,key]of [['Upstream modules',CONNECTIONS.filter(e=>e.to===node.id),'from'],['Downstream modules',CONNECTIONS.filter(e=>e.from===node.id),'to']]){
    if(!edges.length)continue;target.append(el('h4',heading));const list=el('div',undefined,'dependency-list');for(const edge of edges){const b=button(byId.get(edge[key]).title,()=>select(edge[key]));b.title=edge.contract;list.append(b);}target.append(list);
  }
}
function inspectConnection(edge){connection=edge;state.selected=null;state.inspectorOpen=true;render();openDetails();announce(`Connection: ${edge.contract}`);}
function renderConnection(edge){
  const target=$('node-inspector');target.replaceChildren(el('p','CONNECTION CONTRACT','section-index'),el('h3',`${byId.get(edge.from).title} → ${byId.get(edge.to).title}`),el('p',edge.contract),el('p','This arrow describes a module dependency. It does not represent a wallet transfer.','module-limit'));
  target.append(button('Inspect source module',()=>select(edge.from)),button('Inspect destination module',()=>select(edge.to)));
}
function draw(nodes,refit=false){
  const chart=$('graphus-map');chart.replaceChildren();const defs=svg('defs'),marker=svg('marker',{id:'module-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:5,markerHeight:5,orient:'auto'});marker.append(svg('path',{d:'M0 0 L10 5 L0 10 Z',fill:'#7696a7'}));defs.append(marker);chart.append(defs);
  const title=svg('title',{id:'map-title'}),description=svg('desc',{id:'map-desc'});title.textContent='Graphus system module dependencies';description.textContent='Select a module or arrow. The directory provides a compact alternative.';chart.append(title,description);
  positions=new Map();let max=0;const layers=LAYERS.filter(layer=>nodes.some(n=>n.layer===layer));
  layers.forEach((layer,col)=>{const rows=nodes.filter(n=>n.layer===layer);max=Math.max(max,rows.length);const title=svg('text',{x:24+col*250,y:32,class:'map-column-label'});title.textContent=`0${LAYERS.indexOf(layer)+1} / ${layer}`;chart.append(title);rows.forEach((node,row)=>positions.set(node.id,{x:24+col*250,y:62+row*97}));});
  dimensions=[Math.max(300,layers.length*250+30),Math.max(360,90+max*97)];
  if(!nodes.length){const empty=svg('text',{x:150,y:130,'text-anchor':'middle',class:'map-empty'});empty.textContent='No matching modules';chart.append(empty);}
  const near=new Set(state.selected?[state.selected]:connection?[connection.from,connection.to]:[]);for(const edge of CONNECTIONS)if(edge.from===state.selected||edge.to===state.selected){near.add(edge.from);near.add(edge.to);}
  for(const edge of CONNECTIONS){const a=positions.get(edge.from),b=positions.get(edge.to);if(!a||!b)continue;
    const active=connection?edge===connection:edge.from===state.selected||edge.to===state.selected,path=`M${a.x+210} ${a.y+34} C${a.x+245} ${a.y+34},${b.x-35} ${b.y+34},${b.x} ${b.y+34}`;
    const g=svg('g',{class:`map-connection${active?' active':''}${(state.selected||connection)&&!active?' dimmed':''}`,role:'button',tabindex:0,'aria-label':`${byId.get(edge.from).title} to ${byId.get(edge.to).title}: ${edge.contract}`,'data-from':edge.from,'data-to':edge.to});
    g.append(svg('path',{d:path,class:'map-link-hit'}),svg('path',{d:path,class:'map-link','marker-end':'url(#module-arrow)'}));activate(g,()=>inspectConnection(edge));chart.append(g);
  }
  for(const node of nodes){const{x,y}=positions.get(node.id),g=svg('g',{class:`map-node ${node.status}${node.id===state.selected?' selected':''}${(state.selected||connection)&&!near.has(node.id)?' dimmed':''}`,tabindex:0,role:'button','data-module':node.id,'aria-label':`${node.title}, ${STATUS[node.status]}, ${node.access}`,'aria-pressed':String(node.id===state.selected)});
    const tooltip=svg('title');tooltip.textContent=`${node.title} · ${STATUS[node.status]} · ${node.access}`;g.append(tooltip);
    g.append(svg('rect',{x,y,width:210,height:70,rx:8}),svg('circle',{cx:x+14,cy:y+17,r:4}));
    for(const[dy,text,cls]of [[30,node.title,'node-title'],[51,`${STATUS[node.status].toUpperCase()} / ${node.access.toUpperCase()}`,'node-sub']]){const t=svg('text',{x:x+15,y:y+dy,class:cls});t.textContent=text;g.append(t);}
    activate(g,()=>select(node.id));chart.append(g);
  }
  const key=nodes.map(n=>n.id).join(',');if(refit||key!==layoutKey){layoutKey=key;fit();}else viewport();
}
function activate(node,action){node.onclick=action;node.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();action();if(node.dataset.module&&!$('map-details-dialog').open)$('graphus-map').querySelector(`[data-module="${node.dataset.module}"]`)?.focus({preventScroll:true});}};}
function fittedBox(){const chart=$('graphus-map'),ratio=chart.clientWidth&&chart.clientHeight?chart.clientWidth/chart.clientHeight:dimensions[0]/dimensions[1],w=Math.max(dimensions[0],dimensions[1]*ratio),h=w/ratio;return [(dimensions[0]-w)/2,(dimensions[1]-h)/2,w,h];}
function viewport(){
  for(const [axis,size]of [[0,2],[1,3]])state.box[axis]=state.box[size]>=dimensions[axis]?(dimensions[axis]-state.box[size])/2:Math.max(-20,Math.min(dimensions[axis]-state.box[size]+20,state.box[axis]));
  $('graphus-map').setAttribute('viewBox',state.box.join(' '));$('map-zoom').value=Math.round(fitWidth/state.box[2]*100)+'%';
}
function fit(){state.box=fittedBox();fitWidth=state.box[2];viewport();}
function zoom(factor){const w=Math.max(fitWidth/5,Math.min(fitWidth*1.8,state.box[2]*factor)),h=w*state.box[3]/state.box[2];state.box=[state.box[0]+(state.box[2]-w)/2,state.box[1]+(state.box[3]-h)/2,w,h];viewport();}
function focusModule(){const p=positions.get(state.selected);if(!p)return;const chart=$('graphus-map'),w=Math.max(fitWidth/5,Math.min(fitWidth,Math.max(380,chart.clientWidth))),h=w*chart.clientHeight/Math.max(1,chart.clientWidth);state.box=[p.x+105-w/2,p.y+35-h/2,w,h];viewport();}
for(const key of ['asset','layer','category','status'])$(key+'-filter').onchange=()=>{state[key]=$(key+'-filter').value;render({refit:true});};
$('node-search').oninput=()=>{state.query=$('node-search').value;render({refit:true});};
$('clear-filters').onclick=()=>{state.asset=state.layer=state.category=state.status='all';state.query='';state.selected=connection=null;state.inspectorOpen=false;syncFilters();render({refit:true});announce('Filters and selection cleared. All modules are visible.');};
$('clear-selection').onclick=()=>{state.selected=connection=null;state.inspectorOpen=false;render({refit:true});announce('Selection cleared. Showing all matching modules.');};
$('show-map').onclick=()=>{state.directory=false;render();fit();};$('show-directory').onclick=()=>{state.directory=true;render();};
$('zoom-in').onclick=()=>zoom(.8);$('zoom-out').onclick=()=>zoom(1.25);$('zoom-reset').onclick=fit;$('zoom-selection').onclick=focusModule;
$('graphus-map').onpointerdown=event=>{if(event.target.closest('[role=button]'))return;const matrix=event.currentTarget.getScreenCTM();drag={x:event.clientX,y:event.clientY,box:[...state.box],scale:matrix?.a||1};event.currentTarget.setPointerCapture(event.pointerId);};
$('graphus-map').onpointermove=event=>{if(!drag)return;state.box[0]=drag.box[0]-(event.clientX-drag.x)/drag.scale;state.box[1]=drag.box[1]-(event.clientY-drag.y)/drag.scale;viewport();};
$('graphus-map').onpointerup=$('graphus-map').onpointercancel=()=>drag=null;
$('graphus-map').addEventListener('wheel',event=>{if(!event.ctrlKey&&!event.metaKey)return;event.preventDefault();zoom(event.deltaY>0?1.12:1/1.12);},{passive:false});
$('graphus-map').addEventListener('keydown',event=>{if(event.target!==event.currentTarget)return;const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(delta){event.preventDefault();state.box[0]+=delta[0]*state.box[2]*.12;state.box[1]+=delta[1]*state.box[3]*.12;viewport();}else if(event.key==='Home'){event.preventDefault();fit();}else if(['+','=','-'].includes(event.key)){event.preventDefault();zoom(event.key==='-'?1.25:.8);}});
$('graphus-map').addEventListener('focusin',event=>{const node=event.target.closest('[data-module]');if(!node)return;const r=node.getBoundingClientRect(),frame=$('graphus-map').getBoundingClientRect(),p=positions.get(node.dataset.module);if(p&&(r.left<frame.left||r.right>frame.right||r.top<frame.top||r.bottom>frame.bottom)){state.box[0]=p.x+105-state.box[2]/2;state.box[1]=p.y+35-state.box[3]/2;viewport();}});
let lastSize='';new ResizeObserver(()=>{const chart=$('graphus-map');if(!chart.clientWidth||!chart.clientHeight)return;const size=chart.clientWidth+':'+chart.clientHeight;if(size===lastSize)return;lastSize=size;const level=fitWidth/state.box[2],center=[state.box[0]+state.box[2]/2,state.box[1]+state.box[3]/2],next=fittedBox();fitWidth=next[2];const w=fitWidth/level,h=w*chart.clientHeight/chart.clientWidth;state.box=[center[0]-w/2,center[1]-h/2,w,h];viewport();}).observe($('graphus-map'));
addEventListener('popstate',()=>{if($('map-details-dialog').open)closeDetails();connection=null;readLocation();state.inspectorOpen=Boolean(state.selected);render({refit:true});if(state.selected)openDetails();});

$('reference-form').onsubmit=event=>{event.preventDefault();const asset=$('reference-asset').value,reference=$('reference-input').value.trim();const valid=asset==='BLCH'?/^[a-f0-9]{64}$/i.test(reference):asset==='BTC'?/^(bc1[ac-hj-np-z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/i.test(reference):/^0x[a-f0-9]{40}$/i.test(reference);if(!valid){$('reference-status').textContent=`Enter a public ${asset==='BLCH'?'64-hex script hash':asset+' address'} in the expected format.`;return;}const view=event.submitter?.value==='oculum'?'oculum':'constellation';location.href=`${view}.html?${new URLSearchParams({asset:asset.toLowerCase(),address:reference})}`;};
const workflows=[['AML evidence preparation',['aml-evidence','snapshot','scores','review'],'Capture public observations, retain coverage and inspect private descriptive scores. Case management remains planned.'],['Graph & balance research',['events','paths','balances','motifs'],'Move between transaction records, directed paths, observed balances and graph statistics.'],['Organization integration',['invitations','api-keys','daas','audit'],'Open the private portal to invite users, create scoped keys and inspect recorded access events.'],['Machine learning',['features','ml','blue','timeseries'],'Inspect descriptive features, Red/Blue components and historical evaluation methods.']];
$('workflow-cards').replaceChildren(...workflows.map(([title,ids,description])=>{const card=el('article');card.append(el('h3',title),el('p',description));ids.forEach((id,i)=>card.append(button(`${i+1}. ${byId.get(id).title}`,()=>{select(id);$('system').scrollIntoView({block:'start'});})));return card;}));
readLocation();state.inspectorOpen=Boolean(state.selected);stats();render({refit:true});if(state.selected)openDetails();if(state.asset!=='all')setCaptureAsset(state.asset);
