import {mountAddressEvidence} from './address-evidence-ui.js';
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!=null)node.textContent=String(text);if(className)node.className=className;return node;};
const number=value=>Number.isSafeInteger(value)?value.toLocaleString('en-US'):'Unavailable';
const metric=(label,value)=>{const box=el('div',null,'ar-metric');box.append(el('span',label),el('strong',value));return box;};
const panel=(title,module)=>{const box=el('section',null,'ar-panel');box.append(el('p',module,'ar-kicker'),el('h3',title));return box;};
function table(headers,rows){const wrap=el('div',null,'ar-table-wrap'),table=el('table'),head=el('thead'),header=el('tr'),body=el('tbody');if(headers.length>2){table.className='ar-wide-table';wrap.tabIndex=0;wrap.setAttribute('aria-label','Data table; scroll horizontally to see all columns');}for(const name of headers){const th=el('th',name);th.scope='col';header.append(th);}head.append(header);for(const row of rows){const tr=el('tr');for(const value of row){const cell=el('td');if(value instanceof Node)cell.append(value);else cell.textContent=String(value??'');tr.append(cell);}body.append(tr);}table.append(head,body);wrap.append(table);return wrap;}
function exact(raw,decimals){try{const value=BigInt(raw),base=10n**BigInt(decimals),part=(value%base).toString().padStart(decimals,'0').replace(/0+$/,'');return (value/base).toLocaleString('en-US')+(part?'.'+part:'');}catch{return 'Unavailable';}}
function histogram(values,label){
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),height=Math.max(96,values.length*27+12),max=Math.max(1,...values.map(v=>v[1]));svg.setAttribute('viewBox',`0 0 520 ${height}`);svg.setAttribute('role','img');svg.setAttribute('aria-label',label);svg.classList.add('ar-histogram');
  const title=document.createElementNS(ns,'title');title.textContent=label;svg.append(title);
  values.forEach(([key,value],i)=>{const text=document.createElementNS(ns,'text');text.setAttribute('x','4');text.setAttribute('y',String(24+i*27));text.textContent=key;const bar=document.createElementNS(ns,'rect');bar.setAttribute('x','96');bar.setAttribute('y',String(9+i*27));bar.setAttribute('width',String(value/max*330));bar.setAttribute('height','18');const count=document.createElementNS(ns,'text');count.setAttribute('x','440');count.setAttribute('y',String(24+i*27));count.textContent=number(value);svg.append(text,bar,count);});return svg;
}
export function renderResearch(host,report,{mounted=false}={}){
  const {scope,modules}=report,{asset,reference}=scope,root=el('article',null,'address-research');root.dataset.reference=reference;root.dataset.asset=asset;
  const heading=el('header',null,'ar-heading');heading.append(el('p','GRAPHUS + BLOCH SPACE / ADDRESS RESEARCH','ar-kicker'),el('h2','One address. Connected observations.'),el('p',`${asset} · ${reference}`,'ar-reference'),el('p',`Retrieved ${report.retrieved_at} · ${report.coverage}`,'ar-note'));root.append(heading);
  const grid=el('div',null,'ar-grid'),ledger=panel('Source record','EXPLORER / GRAPHUS');
  if(modules.ledger.status==='available'){
    const data=modules.ledger.data,wallet=data.wallet,balance=wallet.balance||{},decimals={BTC:8,BLCH:8,ETH:18,USDT:6,USDC:6}[asset];
    ledger.append(metric('Source-reported balance',`${exact(balance.base_units,decimals)} ${asset}`),el('p',`${balance.base_units??'Unavailable'} ${balance.unit||'base units'}`,'ar-exact'),el('p',balance.scope||'Source-reported snapshot','ar-note'));
    const activity=wallet.activity||{};ledger.append(table(['Observed field','Value'],Object.entries(activity).filter(([,value])=>['number','string'].includes(typeof value)).map(([key,value])=>[key.replaceAll('_',' '),value])));
    ledger.append(el('p',wallet.observation?.coverage||data.note,'ar-note'));
  }else ledger.append(el('p',modules.ledger.reason,'ar-unavailable'));
  const topology=panel('Reference and neighborhood','GRAPH LAB / ANALYTICS');
  if(modules.analytics.status==='available'){
    const data=modules.analytics.data,r=data.root,metrics=el('div',null,'ar-metrics');metrics.append(metric('Incoming events',number(r.incoming)),metric('Outgoing events',number(r.outgoing)),metric('Distinct graph neighbors',number(r.degree)),metric('Observed transactions',number(data.reference_transactions)));topology.append(metrics);
    const n=data.neighborhood;topology.append(el('p',`Bounded neighborhood: ${number(n.references)} references, ${number(n.nodes)} nodes, ${number(n.edges)} events, ${number(n.components)} connected components and ${number(n.cyclic_components)} directed cycle groups.`,'ar-note'),el('p',data.note,'ar-note'));
  }else topology.append(el('p',modules.graph.reason||modules.analytics.reason,'ar-unavailable'));
  grid.append(ledger,topology);root.append(grid);
  if(modules.analytics.status==='available'){
    const data=modules.analytics.data,flows=panel('Exact evidence amounts at this reference','TYPED EVENTS');flows.append(data.flows.length?table(['Direction','Evidence type','Events',`Exact base units / ${asset}`],data.flows.map(f=>[f.direction,f.kind,number(f.events),f.amount_base_units])):el('p','No incident events were returned in this bounded source page.'));
    flows.append(el('p','Input references, created outputs and token events remain separate. These amounts are not a current balance or a traced-funds total.','ar-note'));root.append(flows);
  }
  let showGroup=()=>{};
  const ml=panel('Machine learning','DESCRIPTIVE K-MEANS'),model=modules.machine_learning.data;ml.dataset.module='machine-learning';ml.dataset.status=modules.machine_learning.status;
  if(modules.machine_learning.status==='available'){
    const groups=Array.from({length:model.k},(_,i)=>[`Group ${i+1}`,model.members.filter(m=>m.cluster===i).length]);
    ml.append(el('p',`This reference belongs to Group ${model.reference_cluster+1} within ${number(model.cohort_size)} observed ${model.cohort_kind} references. Groups describe this sample only.`,'ar-model-result'),histogram(groups,'Number of sampled references per descriptive cluster'));
    ml.append(table(['Group',...model.features.map(f=>f.replaceAll('_',' ')),'References'],model.centers.map((center,i)=>{const action=el('button','Inspect group '+(i+1),'ar-button');action.type='button';action.dataset.arGroup=String(i+1);action.onclick=()=>showGroup(String(i+1));return [`Group ${i+1}`,...center.map(v=>v.toFixed(3)),action];})));
    ml.append(el('p','Centers show mean feature counts in original units. Group numbering has no order and can change with the sample. Transaction nodes are excluded from the model cohort.','ar-note'));
  }else ml.append(el('p',modules.machine_learning.reason||'Machine learning is unavailable for this observation.','ar-unavailable'));
  if(model)ml.append(el('p',`${model.model_version} · ${model.cohort_size}/${model.minimum_rows} minimum comparable rows · Features: ${model.features.join(', ')}. ${model.note}`,'ar-note'));
  ml.append(el('p',`Address forecast: unavailable. ${modules.forecast.reason}`,'ar-note'));root.append(ml);
  const evidence=modules.graph.status==='available'?mountAddressEvidence(root,report):null;
  if(modules.analytics.status==='available'){
    const data=modules.analytics.data,details=el('details',null,'ar-panel ar-peers');details.append(el('summary','Explore ML groups and reference evidence'));
    details.append(el('p','Inspect a reference to focus its captured evidence. Group and reference filters do not refit the model or change the searched address. Block rows describe only the original searched reference; omitted heights are unknown.','ar-note'));
    const groups=new Map((model?.members||[]).map(m=>[m.id,m.cluster+1])),controls=el('div',null,'ar-evidence-controls'),group=el('select'),search=el('input');group.dataset.arPeerGroup='';search.dataset.arPeerSearch='';search.type='search';search.maxLength=100;search.autocomplete='off';group.append(new Option('All comparable references','all'));
    for(let i=1;i<=(model?.available?model.k:0);i++)group.append(new Option('Group '+i,String(i)));group.disabled=!model?.available;
    for(const [title,node]of [['Descriptive group',group],['Find a captured reference',search]]){const label=el('label',title);label.append(node);controls.append(label);}details.append(controls);
    let page=0;const holder=el('div'),navigation=el('div',null,'ar-evidence-pagination'),previous=el('button','Previous references','ar-button'),next=el('button','Next references','ar-button'),status=el('span');previous.type=next.type='button';previous.dataset.arPeerPrevious='';next.dataset.arPeerNext='';status.dataset.arPeerStatus='';navigation.append(previous,status,next);
    const show=()=>{const query=search.value.trim().toLowerCase(),rows=data.rows.filter(r=>(group.value==='all'||String(groups.get(r.id))===group.value)&&r.reference.toLowerCase().includes(query)),pages=Math.max(1,Math.ceil(rows.length/20));page=Math.min(page,pages-1);holder.replaceChildren(table(['Public reference','Neighbors','In','Out','Core','Group'],rows.slice(page*20,page*20+20).map(r=>{const action=el('button',r.reference,'ar-reference-button');action.type='button';action.dataset.arPeer=r.id;action.onclick=()=>evidence?.focus(r.id);return [action,r.degree,r.incoming,r.outgoing,r.core,groups.get(r.id)??'Unavailable'];})));status.textContent=`${rows.length} matching references · page ${page+1} of ${pages}`;previous.disabled=page===0;next.disabled=page+1>=pages;};
    previous.onclick=()=>{page--;show();};next.onclick=()=>{page++;show();};group.onchange=search.oninput=()=>{page=0;show();};showGroup=value=>{group.value=value;search.value='';page=0;details.open=true;show();details.scrollIntoView({block:'start',behavior:'smooth'});};show();details.append(holder,navigation,table(['Observed block height','Searched reference events'],data.reference_block_activity));root.append(details);
  }
  const sources=el('details',null,'ar-panel');sources.append(el('summary','Sources, anchors and report integrity'));
  const sourceRows=[];
  if(modules.ledger.status==='available'){const d=modules.ledger.data,w=d.wallet;sourceRows.push(['Ledger',w.observation?.source_id||d.source,w.observation?.retrieved_at||d.retrieved_at,w.observation?.coverage||d.note,JSON.stringify(w.balance?.block||null)]);}
  if(modules.graph.status==='available')for(const s of modules.graph.data.observations)sourceRows.push(['Graph',s.source,s.at,s.scope,JSON.stringify(s.anchor??null)]);
  sources.append(table(['Module','Source','Retrieved','Coverage','Anchor'],sourceRows));
  if(modules.graph.status==='available')for(const warning of modules.graph.data.warnings)sources.append(el('p',warning,'ar-note'));
  sources.append(el('p','SHA-256 of the JSON report excluding report_sha256. This binds the downloaded observation, not an independent source attestation.','ar-note'),el('code',report.report_sha256,'ar-digest'));root.append(sources);
  const actions=el('div',null,'ar-actions'),download=el('button','Download complete research JSON','ar-button');download.type='button';download.dataset.researchExport='json';download.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download=`address-research-${asset}-${reference}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};actions.append(download);
  const space=mounted?location.origin+'/space':'https://bloch.space',graphus=mounted?location.origin+'/graphus':'https://bloch-graphus.xyz';
  for(const [label,url] of [['Explore graph',`${space}/graph/?${new URLSearchParams({asset,kind:'address',query:reference})}`],['Source record',`${space}/?${new URLSearchParams({network:scope.network,asset,kind:'address',query:reference})}`],['Graphus analytics',`${graphus}/analytics.html?${new URLSearchParams({asset:asset.toLowerCase(),address:reference})}`]]){const link=el('a',label);link.href=url;actions.append(link);}
  root.append(actions);host.replaceChildren(root);return root;
}
