const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const short=id=>{const value=id.split(':').at(-1);return value.length>20?value.slice(0,10)+'…'+value.slice(-6):value;};
const labels={cycles:'Return cycles',pass_through:'In/out sequences',fan_in:'Fan-in windows',fan_out:'Fan-out windows',repeated_pair:'Repeated directed pairs'};
const messages={motif_reference_unobserved:'Choose a reference observed in this sample.',motif_address_reference_required:'Choose an account address, not a transaction.',invalid_motif_limits:'Check the window, result count and pattern limits.',invalid_motif_utc_range:'Use a valid UTC range with start no later than end.',invalid_motif_minimum:'Minimum value must be an unsigned base-unit integer.',analysis_integrity_failed:'The retained sample failed its integrity check.',duplicate_motif_transfer:'Two records claim the same transfer identity. Correct the source before searching.',inconsistent_motif_transaction:'One transaction is reported at conflicting heights.',inconsistent_motif_block:'The sample contains conflicting block hashes or timestamps.',motif_report_capacity:'This report exceeds the 8 MB export limit. Narrow the query.',rate_limit:'Too many motif searches. Wait a minute before retrying.'};

export function mountAtlasMotifs(root,query,onReport=()=>{},options={}){
  root.classList.add('atlas-path-workspace','atlas-motif-workspace');
  root.innerHTML=`<p class="section-index">TEMPORAL EVIDENCE / OBSERVED PATTERNS</p><h2>Inspect the shape behind the events.</h2>
    <p>Explore cycles, in/out sequences, fan-in and fan-out windows, or repeated directed pairs. These observations do not establish ownership, intent or continuity of funds.</p><p data-motif="context" class="atlas-note"></p>
    <form data-motif="form" class="atlas-path-controls">
      <label>Reference<input data-motif="reference" list="atlas-motif-options" maxlength="200" required autocomplete="off" placeholder="Address or exact node ID"></label><datalist id="atlas-motif-options"></datalist>
      <label>Pattern<select data-motif="type"><option value="cycles">Return cycles</option><option value="pass_through">In/out sequences</option><option value="fan_in">Fan-in windows</option><option value="fan_out">Fan-out windows</option><option value="repeated_pair">Repeated directed pairs</option></select></label>
      <label>Duration / UTC bin width (seconds)<input data-motif="window" type="number" min="1" max="604800" value="3600" required></label>
      <label>Maximum cycle steps<select data-motif="hops"><option>2</option><option>3</option><option selected>4</option><option>5</option><option>6</option></select></label>
      <label>Minimum distinct fan counterparties<input data-motif="peers" type="number" min="2" max="20" value="3" required></label>
      <label>Minimum repeated events<input data-motif="events" type="number" min="2" max="100" value="2" required></label>
      <label>Minimum per-event base units<input data-motif="minimum" inputmode="numeric" pattern="0|[1-9][0-9]{0,77}" maxlength="78" value="0" required></label>
      <label>From (UTC)<input data-motif="start" type="datetime-local" step="1"></label><label>Through (UTC)<input data-motif="end" type="datetime-local" step="1"></label>
      <label>Maximum results<select data-motif="limit"><option>5</option><option selected>10</option><option>20</option></select></label>
      <button data-motif="run" class="button primary" disabled>Find observed patterns</button><button data-motif="reset" type="button">Reset pattern filters</button>
    </form><p data-motif="method" class="atlas-note"></p><p data-motif="status" role="status">Open a sample to explore its patterns.</p>
    <div data-motif="result" hidden><div data-motif="metrics" class="atlas-path-metrics"></div><p data-motif="limits" class="atlas-note"></p>
      <div data-motif="choices" class="atlas-path-routes" role="group" aria-label="Choose an observed pattern"></div><h3 data-motif="heading"></h3><p data-motif="summary"></p>
      <div data-motif="diagram" class="atlas-path-diagram" tabindex="0" aria-label="Pattern diagram; scroll to inspect references"></div><p data-motif="diagram-note" class="atlas-note"></p>
      <label class="atlas-motif-search">Find an event or counterparty<input data-motif="search" type="search" maxlength="200" placeholder="Event, transaction or reference ID"></label>
      <div data-motif="ledger" class="atlas-motif-ledger"></div><div class="atlas-actions"><button data-motif="previous" disabled>Previous events</button><span data-motif="page"></span><button data-motif="next" disabled>Next events</button></div>
      <details><summary>Coverage, exclusions and reproducibility</summary><div data-motif="notes"></div><pre data-motif="provenance"></pre></details>
    </div><div class="atlas-actions"><button data-motif="export" disabled>Download pattern report JSON</button></div>`;
  const $=name=>root.querySelector(`[data-motif="${name}"]`);
  const optionId='atlas-motif-options-'+crypto.randomUUID();root.querySelector('datalist').id=optionId;$('reference').setAttribute('list',optionId);
  if(options.readOnly){$('form').hidden=true;$('method').hidden=true;root.querySelector('h2').textContent='Inspect the retained patterns.';}
  let source=null,report=null,selected=null,version=0,busy=false,loading=false,eventPage=0;
  const available=()=>source&&!['BTC','BLCH'].includes(source.asset)&&!loading;
  function controls(){
    for(const control of $('form').elements)control.disabled=!available();$('run').disabled=!available()||busy;$('export').disabled=!report||busy||loading;
    $('hops').disabled=!available()||$('type').value!=='cycles';$('peers').disabled=!available()||!['fan_in','fan_out'].includes($('type').value);$('events').disabled=!available()||$('type').value!=='repeated_pair';
    $('method').textContent=['cycles','pass_through'].includes($('type').value)?'Duration bounds the entire sequence. Every step must advance both block time and block height.':'Groups use separate half-open UTC bins of this width, aligned to the Unix epoch. Shapes crossing a bin boundary are not searched; same-time records may share a group.';
  }
  function clear(message='Parameters changed. Run the pattern search again.'){
    version++;busy=false;report=null;selected=null;eventPage=0;onReport(null);$('result').hidden=true;$('search').value='';
    for(const name of ['metrics','limits','choices','heading','summary','diagram','diagram-note','ledger','page','notes','provenance'])$(name).replaceChildren();$('status').textContent=message;controls();
  }
  function setSource(next){
    const changed=source?.key!==next?.key;source=next;
    if(changed||!next){clear();$('form').reset();root.querySelector('datalist').replaceChildren();
      for(const node of next?.nodes||[])if(node.kind==='address')root.querySelector('datalist').append(new Option(node.id,node.address||node.id));
      const node=next?.nodes.find(node=>node.id===next.selectedNode);if(node)$('reference').value=node.address||node.id;
    }
    $('context').textContent=next?next.description:'Open a source capture or a saved analysis first.';
    if(!next)$('status').textContent='Open a sample to explore its patterns.';
    else if(['BTC','BLCH'].includes(next.asset))$('status').textContent='Account-transfer patterns are unavailable for BTC and BLCH: input/output references do not establish direct senders.';
    else if(changed)$('status').textContent='Choose a reference and a pattern. These filters are separate from the field and path filters.';controls();
  }
  function draw(motif){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),refs=motif.ordered?motif.references:motif.references.slice(0,13),width=motif.ordered?Math.max(480,refs.length*180):650,height=motif.ordered?130:Math.max(180,(refs.length-1)*36+30);
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.style.minWidth=`${width}px`;svg.setAttribute('role','img');const title=document.createElementNS(ns,'title');title.textContent=`${labels[motif.type]}: ${refs.join(' → ')}. ${motif.events.length} observed events.`;svg.append(title);
    const point=i=>motif.ordered?{x:65+i*(width-130)/(refs.length-1),y:42}:{x:i?430:100,y:i?30+(i-1)*36:height/2};
    for(let i=1;i<refs.length;i++){
      let a=point(motif.ordered?i-1:0),b=point(i);if(!motif.ordered&&motif.direction==='incoming')[a,b]=[b,a];
      const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length,end={x:b.x-18*ux,y:b.y-18*uy};
      const line=document.createElementNS(ns,'path');line.setAttribute('d',`M ${a.x+18*ux} ${a.y+18*uy} L ${end.x} ${end.y} M ${end.x-8*ux+5*uy} ${end.y-8*uy-5*ux} L ${end.x} ${end.y} L ${end.x-8*ux-5*uy} ${end.y-8*uy+5*ux}`);line.setAttribute('class','atlas-path-line');svg.append(line);
    }
    refs.forEach((id,i)=>{const {x,y}=point(i),circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',x);circle.setAttribute('cy',y);circle.setAttribute('r',15);circle.setAttribute('class',id===motif.reference?'atlas-motif-root':'atlas-path-node');svg.append(circle);
      for(const [px,py,value,cls,anchor] of [[x,y+4,String(i+1),'atlas-path-number','middle'],[motif.ordered?x:i?455:x,motif.ordered?y+38:i?y+4:y+36,short(id),'atlas-path-label',!motif.ordered&&i?'start':'middle']]){const text=document.createElementNS(ns,'text');text.setAttribute('x',px);text.setAttribute('y',py);text.setAttribute('class',cls);text.setAttribute('text-anchor',anchor);text.textContent=value;svg.append(text);}});
    $('diagram').replaceChildren(svg);$('diagram-note').textContent='Highlighted nodes mark the selected reference. '+(motif.ordered?'Arrows show the recorded event sequence. Each event is inspectable below.':`Diagram shows ${refs.length-1} of ${motif.counterparties.length} counterparties. The event list and JSON retain every returned event; arrows do not imply time order.`);
  }
  function ledger(){
    if(!selected)return;const query=$('search').value.trim().toLowerCase(),events=selected.events.filter(event=>[event.event_id,event.from,event.to,event.txid].some(value=>value.toLowerCase().includes(query)));
    const pages=Math.max(1,Math.ceil(events.length/20));eventPage=Math.min(eventPage,pages-1);$('page').textContent=`${events.length} matching events · page ${eventPage+1} of ${pages}`;$('previous').disabled=eventPage===0;$('next').disabled=eventPage+1>=pages;$('ledger').replaceChildren();
    const table=el('table'),head=el('thead'),tr=el('tr');for(const name of ['Block time / height','Observed direction','Exact amount','Evidence'])tr.append(el('th',name));head.append(tr);table.append(head);const body=el('tbody');
    for(const event of events.slice(eventPage*20,eventPage*20+20)){const row=el('tr');row.append(el('td',`${event.block_time} · ${event.block_number}`),el('td',`${event.from} → ${event.to}`),el('td',`${event.amount_base_units} ${report.unit}`));const cell=el('td'),details=el('details');details.append(el('summary','Inspect event'),el('pre',JSON.stringify(event,null,2)));cell.append(details);row.append(cell);[...row.children].forEach((cell,i)=>cell.dataset.label=['Block time / height','Observed direction','Exact amount','Evidence'][i]);body.append(row);}
    table.append(body);$('ledger').append(table);if(!events.length)$('ledger').append(el('p','No returned events match this search.'));
  }
  function select(index){
    selected=report.motifs[index];if(!selected)return;eventPage=0;$('search').value='';
    [...$('choices').children].forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
    $('heading').textContent=`${labels[selected.type]} ${index+1} · ${selected.events.length} events · ${selected.counterparties.length} counterparties`;
    $('summary').textContent=`${selected.started_at} through ${selected.ended_at} · ${selected.duration_seconds} seconds.`+
      (selected.window?` UTC bin: ${selected.window.start} ≤ time < ${selected.window.end_exclusive}.${selected.window.query_clipped?' The query clips this bin.':''} Observed ${selected.direction} event sum: ${selected.observed_total_base_units} ${report.unit}.`:' Amounts remain separate on every step.')+
      (selected.high_degree_references.length?` ${selected.high_degree_references.length} reference(s) have at least ten eligible neighbors; sample selection or shared infrastructure may explain the shape.`:'');
    draw(selected);ledger();
  }
  function render(){
    $('result').hidden=false;for(const [label,value] of [['Returned patterns',report.motifs.length],['Eligible events',report.coverage.eligible_records],['Examined candidates',report.search.expansions],['Excluded events',Object.values(report.coverage.excluded).reduce((a,b)=>a+b,0)]]){const card=el('div');card.append(el('strong',String(value)),el('span',label));$('metrics').append(card);}
    $('limits').textContent=report.state==='not_applicable'?report.reason:report.search.truncated?`Search reached the ${report.search.stop_reason==='result_limit'?'result':'20,000-candidate'} limit. More patterns may exist; narrow the window or raise the per-event minimum.`:'Search completed within this query and sample. Missing source history remains unknown.';$('limits').classList.toggle('atlas-path-warning',report.search.truncated);
    report.motifs.forEach((motif,i)=>{const button=el('button',`${i+1} · ${motif.events.length} events · ${motif.duration_seconds} s`);button.onclick=()=>select(i);button.setAttribute('aria-pressed','false');$('choices').append(button);});
    if(report.motifs.length)select(0);else $('summary').textContent=report.reason||'No matching pattern in this bounded sample. This is not evidence of absence on the chain.';
    for(const note of report.notes)$('notes').append(el('p',note));$('provenance').textContent=JSON.stringify({version:report.version,...report.provenance,parameters:report.parameters,coverage:report.coverage,search:report.search,report_sha256:report.report_sha256},null,2);
  }
  $('form').onsubmit=async event=>{
    event.preventDefault();if(!available()||busy)return;clear('Searching the retained events…');const run=version,current=source;busy=true;controls();
    const value=$('reference').value.trim(),node=current.nodes.find(node=>node.id===value||node.address?.toLowerCase()===value.toLowerCase());
    const parameters={reference:node?.id||value,type:$('type').value,max_hops:Number($('hops').value),max_results:Number($('limit').value),window_seconds:Number($('window').value),min_counterparties:Number($('peers').value),min_events:Number($('events').value),minimum:$('minimum').value,
      ...($('start').value?{start:$('start').value+'Z'}:{}),...($('end').value?{end:$('end').value+'Z'}:{})};
    try{const result=await query(parameters,current);if(run!==version)return;report=result;render();onReport(report);$('status').textContent=`${report.motifs.length} observed pattern(s) in ${report.asset}. ${report.search.truncated?'Search limit reached.':'No new source collection was started.'}`;}
    catch(error){if(run===version)$('status').textContent=`Pattern search unavailable: ${messages[error.message]||error.message.replaceAll('_',' ')} No previous result is displayed.`;}
    finally{if(run===version){busy=false;controls();}}
  };
  for(const input of $('form').querySelectorAll('input,select'))input.addEventListener(input.tagName==='SELECT'?'change':'input',()=>clear());
  $('reset').onclick=()=>{$('form').reset();clear('Choose a reference and run a new pattern search.');};$('search').oninput=()=>{eventPage=0;ledger();};$('previous').onclick=()=>{eventPage--;ledger();};$('next').onclick=()=>{eventPage++;ledger();};
  $('export').onclick=()=>{if(!report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),link=el('a');link.href=url;link.download=`atlas-motifs-${report.report_sha256.slice(0,12)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  setSource(null);return {setSource,setLoading(value){if(loading===value)return;loading=value;if(value)clear('Waiting for the source capture…');else if(!report){
    if(!source)$('status').textContent='Open a sample to explore its patterns.';
    else if(!['BTC','BLCH'].includes(source.asset))$('status').textContent='Choose a reference and search the retained capture. Its source and coverage are shown above.';
  }controls();},reset(){setSource(null);},showReport(value){
    if(!options.readOnly)return;clear();report=value;render();controls();
    $('context').textContent='Verified saved calculation. Browse its original events and parameters; source collection and rescoring are not started.';
    $('status').textContent=`${report.motifs.length} retained pattern(s) in ${report.asset}. The original query limits and coverage apply.`;
  }};
}
