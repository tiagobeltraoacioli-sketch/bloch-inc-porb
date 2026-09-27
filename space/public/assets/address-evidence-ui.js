import {createAddressEvidence,evidenceConnectionKey,EVIDENCE_LIMITS} from './address-evidence.js';

const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n;};
const short=value=>value.length>28?value.slice(0,14)+'…'+value.slice(-9):value;
const svg=(tag,attributes={})=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attributes))n.setAttribute(k,String(v));return n;};
const button=(text,action)=>{const n=el('button',text,'ar-button');n.type='button';n.onclick=action;return n;};
const field=(title,input)=>{const label=el('label',title);label.append(input);return label;};
const activate=(node,action)=>{node.setAttribute('role','button');node.setAttribute('tabindex','0');node.addEventListener('click',action);node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();action();}});};

export function mountAddressEvidence(host,report){
  const model=createAddressEvidence(report),nodes=new Map(model.nodes.map(n=>[n.id,n])),root=el('details',null,'ar-panel ar-evidence'),toggle=el('summary','Explore evidence graph and exact events');toggle.dataset.ae='toggle';root.append(toggle);
  const note=el('p','Browse the captured evidence without another source request. Circles are addresses, diamonds are scripts and squares are transactions. Arrows retain observed direction and event type; they do not trace funds or identify owners.','ar-note');root.append(note);
  const controls=el('form',null,'ar-evidence-controls'),inputs={},id='address-evidence-'+crypto.randomUUID();controls.setAttribute('aria-label','Filter captured address evidence');controls.onsubmit=event=>event.preventDefault();
  function input(name,label,value='',max=200){const n=el('input');n.value=value;n.maxLength=max;n.autocomplete='off';n.spellcheck=false;n.dataset.ae=name;inputs[name]=n;controls.append(field(label,n));return n;}
  function select(name,label,options){const n=el('select');n.dataset.ae=name;for(const [value,text]of options)n.append(new Option(text,value));inputs[name]=n;controls.append(field(label,n));return n;}
  const focusInput=input('focus','Exact captured reference',model.rootId),list=el('datalist');list.id=id;focusInput.setAttribute('list',id);for(const n of model.nodes)list.append(new Option(n.kind+' · '+n.reference,n.id));controls.append(list);
  select('direction','Direction at focused reference',[['all','All directions'],['incoming','Incoming'],['outgoing','Outgoing'],['self','Self events']]);
  select('kind','Evidence type',[['all','All types'],...model.kinds.map(k=>[k,k.replaceAll('_',' ')])]);
  input('minimum','Minimum per event / base units','0',100).inputMode='numeric';input('min_block','First block height','',16).inputMode='numeric';input('max_block','Last block height','',16).inputMode='numeric';input('search','Event, transaction or reference search');
  const reset=button('Back to searched address',()=>focus(model.rootId));reset.dataset.ae='reset';controls.append(reset);root.append(controls);
  const status=el('p',null,'ar-note');status.dataset.ae='status';status.setAttribute('role','status');root.append(status);
  const diagram=el('div',null,'ar-evidence-diagram');diagram.dataset.ae='diagram';diagram.tabIndex=0;diagram.setAttribute('aria-label','Captured directed connections; scroll horizontally on a small screen');
  const cards=el('div',null,'ar-evidence-connections');cards.dataset.ae='connections';root.append(diagram,cards);
  const navigation=el('div',null,'ar-evidence-pagination'),pageLabel=el('span'),previous=button('Previous connections',()=>move(-1)),next=button('Next connections',()=>move(1));previous.dataset.ae='previous';next.dataset.ae='next';pageLabel.dataset.ae='page';navigation.append(previous,pageLabel,next);root.append(navigation);
  root.append(el('p','The diagram draws at most eight typed connections per page; scroll it horizontally on a small screen. Coordinates are a display layout. UTXO inputs and outputs remain separate, with transaction boundaries preserved. Heights order the display only; they do not establish continuity of value or event time.','ar-note'));
  const inspectorTitle=el('h4'),all=button('Show all filtered events',()=>choose(null)),events=el('div',null,'ar-evidence-events');all.dataset.ae='all';events.dataset.ae='events';root.append(inspectorTitle,all,events);
  const eventNavigation=el('div',null,'ar-evidence-pagination'),eventLabel=el('span'),eventPrevious=button('Previous events',()=>{eventPage--;inspect();}),eventNext=button('Next events',()=>{eventPage++;inspect();});eventPrevious.dataset.ae='event-previous';eventNext.dataset.ae='event-next';eventLabel.dataset.ae='event-page';eventNavigation.append(eventPrevious,eventLabel,eventNext);root.append(eventNavigation);
  const csv=button('Export filtered evidence CSV',()=>{
    try{if(!view)return;const content=model.csv(filters(),selected),url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'})),a=el('a');a.href=url;a.download=`address-evidence-${report.scope.asset}-${report.report_sha256.slice(0,12)}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    catch(error){status.textContent=error.message;}
  });csv.dataset.ae='csv';root.append(csv,el('p','CSV includes every matching event across pages, or every event in the selected connection. It carries exact quantities, filters, source observations and the original report hash. The complete research JSON and ML fit remain unchanged. Unknown block heights are excluded only when a height bound is applied.','ar-note'));
  host.append(root);
  let view=null,page=0,eventPage=0,selected=null;
  const filters=()=>Object.fromEntries(Object.entries(inputs).map(([name,n])=>[name,n.value]));
  function clear(){view=null;diagram.replaceChildren();cards.replaceChildren();events.replaceChildren();inspectorTitle.textContent='';pageLabel.textContent='';eventLabel.textContent='';csv.disabled=true;previous.disabled=next.disabled=eventPrevious.disabled=eventNext.disabled=true;all.hidden=true;}
  function focus(reference){for(const [name,n]of Object.entries(inputs))n.value=name==='focus'?reference:name==='minimum'?'0':['direction','kind'].includes(name)?'all':'';page=0;eventPage=0;selected=null;root.open=true;render();}
  function move(delta){page+=delta;selected=null;eventPage=0;render();}
  function choose(key){selected=key;eventPage=0;for(const n of root.querySelectorAll('[data-ae-connection]'))n.setAttribute('aria-pressed',String(n.dataset.aeConnection===key));inspect();}
  function draw(groups){
    diagram.replaceChildren();if(!groups.length)return;
    const h=Math.max(250,groups.length*72+72),canvas=svg('svg',{viewBox:`0 0 680 ${h}`,role:'group','aria-label':'Directed typed connections at '+view.focus.reference}),defs=svg('defs'),marker=svg('marker',{id:id+'-arrow',markerWidth:8,markerHeight:8,refX:7,refY:4,orient:'auto',markerUnits:'userSpaceOnUse'});marker.append(svg('path',{d:'M 0 0 L 8 4 L 0 8 z',fill:'currentColor'}));defs.append(marker);canvas.append(defs);
    const origin={x:115,y:h/2};
    const node=(record,x,y,isFocus)=>{
      const group=svg('g',{'aria-label':(isFocus?'Focused ':'Inspect ')+record.kind+' '+record.reference,'data-ae-node':record.id}),shape=record.kind==='transaction'?svg('rect',{x:x-13,y:y-13,width:26,height:26}):record.kind==='script'?svg('polygon',{points:`${x},${y-16} ${x+16},${y} ${x},${y+16} ${x-16},${y}`}):svg('circle',{cx:x,cy:y,r:13});
      const title=svg('title');title.textContent=record.kind+' · '+record.reference;const label=svg('text',{x:isFocus?24:x+24,y:y+4});label.textContent=isFocus?'Focus':short(record.reference);group.append(title,shape,label);if(!isFocus)activate(group,()=>focus(record.id));canvas.append(group);
    };
    groups.forEach((group,i)=>{
      const target={x:415,y:48+i*72},self=group.from===group.to,start=group.from===view.focus.id?origin:target,end=group.to===view.focus.id?origin:target;
      const path=self?`M ${origin.x-10} ${origin.y-15} C ${origin.x-90} ${origin.y-100},${origin.x+100} ${origin.y-100},${origin.x+15} ${origin.y-10}`:`M ${start.x+(start.x<end.x?18:-18)} ${start.y} C 270 ${start.y},270 ${end.y},${end.x+(start.x<end.x?-18:18)} ${end.y}`;
      const edge=svg('g',{'data-ae-connection':group.key,'aria-label':`Inspect ${group.direction} ${group.kind}: ${group.events} events`,'aria-pressed':String(selected===group.key)}),line=svg('path',{d:path,'marker-end':`url(#${id}-arrow)`}),title=svg('title');title.textContent=`${group.kind} · ${group.events} events · ${group.amount_base_units} base units`;edge.append(title,line);activate(edge,()=>choose(group.key));canvas.append(edge);
      const label=svg('text',{x:285,y:target.y-12});label.textContent=`${group.kind} · ${group.events}`;canvas.append(label);
      if(!self)node(nodes.get(group.from===view.focus.id?group.to:group.from),target.x,target.y,false);
    });
    node(view.focus,origin.x,origin.y,true);diagram.append(canvas);
  }
  function inspect(){
    events.replaceChildren();if(!view)return;
    const rows=selected===null?view.events:view.events.filter(e=>evidenceConnectionKey(e)===selected),pages=Math.max(1,Math.ceil(rows.length/EVIDENCE_LIMITS.events_per_page));eventPage=Math.max(0,Math.min(eventPage,pages-1));
    inspectorTitle.textContent=`${rows.length} ${selected===null?'filtered':'selected connection'} events`;all.hidden=selected===null;
    for(const e of rows.slice(eventPage*10,eventPage*10+10)){
      const item=el('details'),summary=el('summary',`${e.direction} · ${e.kind} · ${e.amount} base units · block ${e.block.height??'unknown'}`);item.dataset.aeEvent=e.id;item.append(summary);
      const fields=el('dl');for(const [label,value]of [['Event',e.id],['From',e.from],['To',e.to],['Exact amount',e.amount],['Transaction',e.txid],['Block height',e.block.height??'Unknown'],['Block hash',e.block.hash??'Unknown'],['Transaction index',e.block.index??'Unknown'],['Log index',e.block.log??'Not supplied'],['Finality',e.finality]]){fields.append(el('dt',label),el('dd',value));}
      item.append(fields);
      const actions=el('div',null,'ar-actions');for(const id of new Set([e.from,e.to])){const action=button('Inspect '+nodes.get(id).kind+' '+short(nodes.get(id).reference),()=>focus(id));action.dataset.aeFocus=id;actions.append(action);}item.append(actions);
      for(const id of e.sources){const observation=model.observation(id),source=el('div',null,'ar-evidence-source');source.append(el('strong',observation.source),el('p',`${observation.id} · ${observation.at}`),el('p',observation.scope),el('code',JSON.stringify(observation.anchor)));item.append(source);}events.append(item);
    }
    if(!rows.length)events.append(el('p','No captured events match this selection. This is not evidence of no chain activity.'));
    eventLabel.textContent=`Event page ${eventPage+1} of ${pages} · ${rows.length} matching events`;eventPrevious.disabled=eventPage===0;eventNext.disabled=eventPage+1>=pages;
  }
  function render(){
    try{view=model.query(filters());}catch(error){clear();status.textContent=error.message;return;}
    const s=view.summary,pages=Math.max(1,Math.ceil(view.connections.length/8));page=Math.max(0,Math.min(page,pages-1));csv.disabled=false;
    status.textContent=`Focused ${view.focus.kind}: ${view.focus.reference}. ${s.matching_events} of ${s.incident_events} captured incident events; ${s.incoming} incoming, ${s.outgoing} outgoing, ${s.self} self events and ${s.neighbors} adjacent graph references. Whole sample: ${s.sample_events} events. ${s.unknown_block_events} incident events have unknown block height.`;
    cards.replaceChildren();const groups=view.connections.slice(page*8,page*8+8);draw(groups);
    for(const g of groups){const card=button('',()=>choose(g.key));card.dataset.aeConnection=g.key;card.setAttribute('aria-pressed',String(selected===g.key));card.append(el('strong',`${short(nodes.get(g.from).reference)} → ${short(nodes.get(g.to).reference)}`),el('span',`${g.direction} · ${g.kind} · ${g.events} events`),el('span',`${g.amount_base_units} base units / ${report.scope.asset}`));cards.append(card);}
    pageLabel.textContent=`Connection page ${page+1} of ${pages} · ${groups.length}/${view.connections.length} shown`;previous.disabled=page===0;next.disabled=page+1>=pages;inspect();
  }
  for(const n of Object.values(inputs))n.addEventListener(n.tagName==='SELECT'?'change':'input',()=>{page=0;eventPage=0;selected=null;render();});
  render();return {focus(reference){focus(reference);root.scrollIntoView({block:'start',behavior:'smooth'});},root};
}
