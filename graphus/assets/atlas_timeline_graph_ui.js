import {timelineGraph,timelineGraphCsv,connectionKey,TIMELINE_GRAPH_LIMITS} from './atlas_timeline_graph.js';
import {TIMELINE_KINDS} from './atlas_timeline.js';
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const short=id=>{const text=id.split(':').slice(2).join(':');return text.length>22?text.slice(0,10)+'…'+text.slice(-8):text;};
const svgEl=(tag,attributes={})=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attributes))node.setAttribute(key,String(value));return node;};
const messages={timeline_graph_reference_unobserved:'Choose an exact reference from the original timeline.',timeline_graph_direction_requires_reference:'Choose a reference before filtering its direction.',invalid_timeline_graph_kind:'Choose an event type supported by this asset.'};
export function mountTimelineGraph(root){
  root.classList.add('atlas-time-graph');
  root.innerHTML=`<h3>Connections in the selected time range.</h3><p class="atlas-note">Graph filters apply to the diagram, connection inspector and graph CSV. Arrows group exact events by source, destination and event type. They do not establish ownership, a continuous path or that the same funds moved between events.</p>
    <div class="atlas-time-graph-controls"><label>Exact graph reference<input data-graph="reference" type="search" maxlength="200" autocomplete="off" placeholder="All selected references"><datalist data-graph="options"></datalist></label>
      <label>Direction at this reference<select data-graph="direction"><option value="all">All directions</option><option value="incoming">Incoming</option><option value="outgoing">Outgoing</option><option value="self">Self events</option></select></label><label>Graph event type<select data-graph="kind"><option value="all">All types</option></select></label>
      <button data-graph="reset">Reset graph filters</button></div><p data-graph="status" role="status"></p><p data-graph="semantics" class="atlas-note"></p>
    <div data-graph="diagram" class="atlas-time-graph-diagram" tabindex="0" aria-label="Directed connection diagram; scroll to inspect all labels"></div>
    <p class="atlas-note">Circle: address. Diamond: script reference. Square: transaction. Select a node to focus its exact reference; select an arrow or connection card to inspect its events. Scroll horizontally on narrow screens. Each page draws at most eight connections; the CSV includes all filtered events unless a connection is selected.</p>
    <div data-graph="connections" class="atlas-time-graph-connections"></div><div class="atlas-actions"><button data-graph="previous">Previous connections</button><span data-graph="page" role="status"></span><button data-graph="next">Next connections</button></div>
    <div class="atlas-actions"><button data-graph="all">Clear connection selection</button><button data-graph="csv">Export graph events CSV</button></div><p data-graph="selection" role="status"></p><div data-graph="events" class="atlas-timeline-ledger"></div>
    <div data-graph="event-pagination" class="atlas-actions"><button data-graph="event-previous">Previous connection events</button><span data-graph="event-page" role="status"></span><button data-graph="event-next">Next connection events</button></div>`;
  const $=name=>root.querySelector(`[data-graph="${name}"]`),unique=crypto.randomUUID();$('options').id='atlas-time-graph-options-'+unique;$('reference').setAttribute('list',$('options').id);
  let report=null,selection={},signature='',graph=null,page=0,eventPage=0,selected=null;
  const filters=()=>({reference:$('reference').value.trim()||null,direction:$('direction').value,kind:$('kind').value});
  function clearContent(){graph=null;selected=null;eventPage=0;for(const name of ['diagram','connections','events','page','event-page','selection'])$(name).replaceChildren();$('event-pagination').hidden=true;for(const name of ['previous','next','all','csv'])$(name).disabled=true;}
  function reset(){report=null;signature='';page=0;clearContent();$('reference').value='';$('direction').value='all';$('kind').replaceChildren(new Option('All types','all'));$('options').replaceChildren();$('status').textContent='Choose a timeline range to inspect its graph.';$('semantics').textContent='';}
  function choose(key){selected=key===selected?null:key;eventPage=0;inspect();}
  function focusReference(id){$('reference').value=id;$('direction').value='all';page=0;selected=null;render();}
  function draw(groups){
    $('diagram').replaceChildren();if(!groups.length)return;
    const ids=[...new Set(groups.flatMap(group=>[group.from,group.to]))].sort(),positions=new Map(ids.map((id,index)=>{const angle=-Math.PI/2+2*Math.PI*index/ids.length;return [id,{x:ids.length===1?380:380+230*Math.cos(angle),y:ids.length===1?230:230+155*Math.sin(angle),index:index+1}];}));
    const svg=svgEl('svg',{viewBox:'0 0 760 470',role:'group','aria-label':`Connection page ${page+1}: ${groups.length} directed connections and ${ids.length} references`}),defs=svgEl('defs'),marker=svgEl('marker',{id:'atlas-time-arrow-'+unique,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:10,markerHeight:10,markerUnits:'userSpaceOnUse',orient:'auto-start-reverse'});marker.append(svgEl('path',{d:'M 0 0 L 10 5 L 0 10 z'}));defs.append(marker);svg.append(defs);
    const keyboard=(node,action)=>node.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();action();}});
    for(const group of groups){const a=positions.get(group.from),b=positions.get(group.to),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1,ux=dx/length,uy=dy/length;
      const path=group.from===group.to?`M ${a.x-12} ${a.y-12} C ${a.x-65} ${a.y-75}, ${a.x+65} ${a.y-75}, ${a.x+12} ${a.y-12}`:`M ${a.x+ux*20} ${a.y+uy*20} Q ${(a.x+b.x)/2-uy*28} ${(a.y+b.y)/2+ux*28} ${b.x-ux*23} ${b.y-uy*23}`;
      const button=svgEl('g',{role:'button',tabindex:0,'aria-label':`${group.kind}: ${group.from} to ${group.to}, ${group.events} events`,'data-graph-connection':group.key,'aria-pressed':String(selected===group.key)}),line=svgEl('path',{d:path,'marker-end':`url(#atlas-time-arrow-${unique})`,class:'atlas-time-graph-edge'}),title=svgEl('title');title.textContent=`${group.events} ${group.kind} events · ${group.observed_total_base_units} ${report.unit}`;button.append(title,line);button.onclick=()=>choose(group.key);keyboard(button,()=>choose(group.key));svg.append(button);
    }
    for(const id of ids){const {x,y,index}=positions.get(id),kind=id.split(':')[1],node=svgEl('g',{role:'button',tabindex:0,'data-graph-node':id,'aria-label':`Focus ${kind}: ${id}`,'aria-pressed':String(filters().reference===id),class:'atlas-time-graph-node'}),title=svgEl('title');title.textContent=id;node.append(title);
      node.append(kind==='transaction'?svgEl('rect',{x:x-16,y:y-16,width:32,height:32}):kind==='script_hash'?svgEl('path',{d:`M ${x} ${y-21} L ${x+21} ${y} L ${x} ${y+21} L ${x-21} ${y} Z`}):svgEl('circle',{cx:x,cy:y,r:18}));
      const number=svgEl('text',{x,y:y+4,'text-anchor':'middle',class:'atlas-time-graph-number'});number.textContent=index;node.append(number);const label=svgEl('text',{x,y:y+(y<230?-30:39),'text-anchor':'middle',class:'atlas-time-graph-label'});label.textContent='…'+id.split(':').slice(2).join(':').slice(-8);node.append(label);node.onclick=()=>focusReference(id);keyboard(node,()=>focusReference(id));svg.append(node);
    }
    $('diagram').append(svg);
  }
  function inspect(){
    const group=graph?.connections.find(group=>group.key===selected);if(!group)selected=null;
    for(const button of root.querySelectorAll('[data-graph-connection]'))button.setAttribute('aria-pressed',String(button.dataset.graphConnection===selected));
    $('all').disabled=!group;$('events').replaceChildren();$('event-pagination').hidden=!group;
    if(!group){$('selection').textContent=graph?`Graph CSV includes all ${graph.events.length} matching events across connection pages. Select a connection for exact event inspection.`:'';return;}
    const rows=graph.events.filter(event=>connectionKey(event)===group.key),pages=Math.max(1,Math.ceil(rows.length/TIMELINE_GRAPH_LIMITS.events_per_page));eventPage=Math.min(eventPage,pages-1);
    $('selection').textContent=`${group.from} → ${group.to} · ${group.kind} · ${group.events} events · ${group.observed_total_base_units} ${report.unit}. Graph CSV includes every event of this connection.`;
    for(const event of rows.slice(eventPage*10,eventPage*10+10)){const card=el('article',undefined,'atlas-panel');card.append(el('h4',event.event_id),el('p',`${event.block_time} · ${event.amount_base_units} ${report.unit}`));const details=el('details');details.append(el('summary','Inspect exact event'),el('pre',JSON.stringify(event,null,2)));card.append(details);$('events').append(card);}
    $('event-page').textContent=`Page ${eventPage+1} of ${pages} · ${rows.length} connection events`;$('event-previous').disabled=eventPage===0;$('event-next').disabled=eventPage+1>=pages;
  }
  function render(){
    if(!report)return;
    try{graph=timelineGraph(report,selection,filters());}catch(error){clearContent();$('status').textContent=messages[error.message]||error.message.replaceAll('_',' ');return;}
    const pages=Math.max(1,Math.ceil(graph.connections.length/8));page=Math.min(page,pages-1);$('csv').disabled=false;
    $('options').replaceChildren(...graph.references.map(id=>new Option(id,id)));const focused=graph.nodes.find(node=>node.id===graph.filters.reference);
    $('status').textContent=`${graph.summary.matching_events} of ${graph.summary.selected_timeline_events} selected timeline events · ${graph.summary.connections} directed typed connections · ${graph.summary.references} references.${focused?` Focused reference: ${focused.incoming} incoming, ${focused.outgoing} outgoing and ${focused.self} self events; ${focused.adjacent_references} adjacent references.`:''}${focused?.adjacent_references>=10?' High degree describes this selection; it does not identify a service.':''}`;
    const groups=graph.connections.slice(page*8,page*8+8);draw(groups);$('connections').replaceChildren();
    for(const group of groups){const button=el('button',undefined,'atlas-time-graph-connection');button.dataset.graphConnection=group.key;button.append(el('strong',`${short(group.from)} → ${short(group.to)}`),el('span',`${group.kind} · ${group.events} events`),el('span',`${group.observed_total_base_units} ${report.unit}`));button.title=`${group.from} → ${group.to}`;button.onclick=()=>choose(group.key);$('connections').append(button);}
    if(!groups.length)$('connections').append(el('p','No observed connections match this graph selection. Missing activity remains unknown.'));
    $('page').textContent=`Page ${page+1} of ${pages} · drawing ${groups.length} of ${graph.connections.length} connections`;$('previous').disabled=page===0;$('next').disabled=page+1>=pages;inspect();
  }
  for(const name of ['reference','direction','kind'])$(name).addEventListener(name==='reference'?'input':'change',()=>{page=0;selected=null;eventPage=0;render();});
  $('reset').onclick=()=>{$('reference').value='';$('direction').value='all';$('kind').value='all';page=0;selected=null;render();};$('previous').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};$('all').onclick=()=>choose(selected);
  $('event-previous').onclick=()=>{eventPage--;inspect();};$('event-next').onclick=()=>{eventPage++;inspect();};
  $('csv').onclick=()=>{if(!report||!graph)return;const text=timelineGraphCsv(report,selection,filters(),selected),url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),link=el('a');link.href=url;link.download=`atlas-timeline-graph-${report.report_sha256.slice(0,12)}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  reset();return {reset,setReport(value,range){const next=JSON.stringify([value.report_sha256,range]);if(next===signature)return;if(report?.report_sha256!==value.report_sha256){reset();for(const kind of TIMELINE_KINDS[value.asset]||[])$('kind').append(new Option(kind.replaceAll('_',' '),kind));}report=value;selection=range;signature=next;page=0;selected=null;eventPage=0;$('semantics').textContent=['BTC','BLCH'].includes(value.asset)?'UTXO arrows retain transaction nodes and supplied input/output roles. Input references and created outputs stay separate; direct wallet-to-wallet transfers are not inferred.':'Arrows retain observed account endpoints and event types within this asset. A self event counts once.';render();}};
}
