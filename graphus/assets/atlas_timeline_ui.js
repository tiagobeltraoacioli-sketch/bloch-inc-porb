import {TIMELINE_KINDS,timelineView,timelineCsv} from './atlas_timeline.js';

const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const sha=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const messages={timeline_bucket_capacity:'Choose a coarser interval or narrower UTC window; at most 366 bins can be inspected.',timeline_reference_unobserved:'Choose an exact reference from this sample.',timeline_direction_requires_reference:'Select a reference before filtering incoming, outgoing or self events.',invalid_timeline_utc_range:'Use valid UTC dates, with start no later than end.',invalid_timeline_minimum:'Use an unsigned base-unit integer for the minimum.',analysis_integrity_failed:'The retained sample failed its integrity check.',timeline_integrity_failed:'The timeline response failed its integrity check.',duplicate_timeline_event:'The source repeats a movement identity. Correct the source before aggregating it.',inconsistent_timeline_transaction:'One transaction is reported at conflicting heights.',inconsistent_timeline_block:'The source contains conflicting block identities or timestamps.',timeline_report_capacity:'The complete report exceeds 8 MB. Narrow the query.',rate_limit:'Too many timeline requests. Wait a minute before retrying.'};

export function mountAtlasTimeline(root,query){
  root.classList.add('atlas-path-workspace','atlas-timeline-workspace');
  root.innerHTML=`<p class="section-index">TEMPORAL EVIDENCE / ACTIVITY EXPLORER</p><h2>Move through the observations.</h2><p>Inspect a minute, an hour or a day, then select the exact events underneath. Empty intervals have unknown source coverage; observed counts are not complete network activity.</p><p data-time="context" class="atlas-note"></p>
    <form data-time="form" class="atlas-path-controls">
      <label>Reference<input data-time="reference" maxlength="200" autocomplete="off" placeholder="All captured references"><datalist data-time="options"></datalist></label>
      <label>Direction relative to reference<select data-time="direction"><option value="all">All directions</option><option value="incoming">Incoming</option><option value="outgoing">Outgoing</option><option value="self">Self events</option></select></label>
      <label>Event type<select data-time="kind"><option value="all">All types</option></select></label>
      <label>UTC interval<select data-time="interval"><option value="auto">Automatic · at most 366 bins</option><option value="minute">Minute</option><option value="hour">Hour</option><option value="day">Day</option></select></label>
      <label>Minimum per-event base units<input data-time="minimum" inputmode="numeric" pattern="0|[1-9][0-9]{0,77}" maxlength="78" value="0" required></label>
      <label>From (UTC)<input data-time="start" type="datetime-local" step="1"></label><label>Through (UTC)<input data-time="end" type="datetime-local" step="1"></label>
      <button data-time="run" class="button primary" disabled>Build activity timeline</button><button data-time="reset" type="button">Reset timeline filters</button>
    </form><p data-time="status" role="status"></p>
    <div data-time="result" hidden><p data-time="coverage" class="atlas-note"></p><div data-time="chart" class="atlas-timeline-chart" tabindex="0" aria-label="Activity chart; scroll horizontally to inspect all UTC intervals"></div>
      <div data-time="range" class="atlas-timeline-range"><label>First selected interval<input data-time="first" type="range" min="0" step="1"></label><label>Last selected interval<input data-time="last" type="range" min="0" step="1"></label><div class="atlas-actions"><button data-time="back">Shift range back</button><button data-time="forward">Shift range forward</button><button data-time="all">Select all intervals</button></div></div>
      <p class="atlas-note">Solid bars show returned events; dotted markers have no returned events and unknown coverage. Select a bar, scroll the chart or use the two sliders. Bars show the complete queried timeline; the selected range and event search control the event list, totals and CSV. JSON preserves the complete query.</p>
      <p data-time="selection" role="status"></p><label class="atlas-timeline-search">Find an event, transaction or reference<input data-time="search" type="search" maxlength="200"></label>
      <div data-time="totals" class="atlas-timeline-totals"></div><div data-time="ledger" class="atlas-timeline-ledger"></div>
      <div class="atlas-actions"><button data-time="previous" disabled>Previous events</button><span data-time="page" role="status"></span><button data-time="next" disabled>Next events</button></div>
      <details><summary>Coverage, exclusions and reproducibility</summary><div data-time="notes"></div><pre data-time="provenance"></pre></details>
    </div><div class="atlas-actions"><button data-time="json" disabled>Download complete timeline JSON</button><button data-time="csv" disabled>Export selected events CSV</button></div>`;
  const $=name=>root.querySelector(`[data-time="${name}"]`),optionId='atlas-timeline-options-'+crypto.randomUUID();$('options').id=optionId;$('reference').setAttribute('list',optionId);
  let source=null,report=null,version=0,busy=false,loading=false,first=0,last=-1,page=0;
  const selection=()=>({first,last,query:$('search').value}),available=()=>source&&!loading;
  function controls(){for(const control of $('form').elements)control.disabled=!available();$('run').disabled=!available()||busy;for(const name of ['json','csv'])$(name).disabled=!report||busy||loading;root.setAttribute('aria-busy',String(busy||loading));}
  function clear(message='Filters changed. Build a new activity timeline.'){
    version++;report=null;busy=false;first=0;last=-1;page=0;$('result').hidden=true;$('search').value='';
    for(const name of ['chart','coverage','selection','totals','ledger','page','notes','provenance'])$(name).replaceChildren();$('status').textContent=message;controls();
  }
  function setSource(next){const changed=source?.key!==next?.key;source=next;
    if(changed||!next){clear();$('form').reset();$('options').replaceChildren();$('kind').replaceChildren(new Option('All types','all'));
      for(const kind of TIMELINE_KINDS[next?.asset]||[])$('kind').append(new Option(kind.replaceAll('_',' '),kind));
      for(const node of next?.nodes||[])$('options').append(new Option(node.id,node.address||node.txid||node.id));
      const node=next?.nodes.find(node=>node.id===next.selectedNode);if(node)$('reference').value=node.id;
      $('status').textContent=next?'Choose the time resolution and filters, then inspect the retained observations.':'Open a capture or saved analysis to explore its timeline.';
    }$('context').textContent=next?.description||'No sample selected.';controls();
  }
  function draw(){
    $('chart').replaceChildren();if(!report.buckets.length)return;
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),width=Math.max(680,report.buckets.length*5),height=210,step=(width-50)/report.buckets.length,max=Math.max(1,...report.buckets.map(bucket=>bucket.observed_events||0));
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.style.minWidth=`${width}px`;svg.setAttribute('role','group');svg.setAttribute('aria-label','Returned observations by UTC interval; select a bar to inspect it');
    for(const bucket of report.buckets){const rect=document.createElementNS(ns,'rect'),observed=bucket.observed_events!==null,h=observed?Math.max(2,bucket.observed_events/max*155):4,label=`${bucket.start} to before ${bucket.end_exclusive}: ${observed?bucket.observed_events+' returned events':'no returned events; coverage unknown'}`;
      for(const [key,value] of Object.entries({x:25+bucket.index*step,y:175-h,width:Math.max(1,step-1),height:h,role:'button',tabindex:bucket.index===first?'0':'-1','aria-label':label,'aria-pressed':String(bucket.index>=first&&bucket.index<=last),'data-time-bin':bucket.index,class:observed?'atlas-timeline-observed':'atlas-timeline-unknown'}))rect.setAttribute(key,String(value));
      const title=document.createElementNS(ns,'title');title.textContent=label;rect.append(title);
      rect.onclick=()=>choose(bucket.index,bucket.index);rect.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();choose(bucket.index,bucket.index);}else if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?report.buckets.length-1:Math.max(0,Math.min(report.buckets.length-1,bucket.index+(event.key==='ArrowLeft'?-1:1)));choose(index,index);$('chart').querySelector(`[data-time-bin="${index}"]`).focus();}};svg.append(rect);
    }
    const scale=document.createElementNS(ns,'text');scale.setAttribute('x',25);scale.setAttribute('y',14);scale.textContent=report.events.length?`${max} returned events at full bar height`:'No timed events in the queried range';svg.append(scale);
    for(const [x,text,anchor] of [[25,report.buckets[0].start,'start'],[width-25,report.buckets.at(-1).end_exclusive,'end']]){const label=document.createElementNS(ns,'text');label.setAttribute('x',x);label.setAttribute('y',201);label.setAttribute('text-anchor',anchor);label.textContent=text;svg.append(label);}$('chart').append(svg);
  }
  function view(){
    if(!report)return;const selected=timelineView(report,selection()),pages=Math.max(1,Math.ceil(selected.events.length/20));page=Math.min(page,pages-1);
    $('first').value=first;$('last').value=last;$('first').setAttribute('aria-valuetext',selected.selection.start||'No time interval');$('last').setAttribute('aria-valuetext',selected.selection.end_inclusive||'No time interval');
    $('back').disabled=first<=0;$('forward').disabled=last>=report.buckets.length-1;$('range').hidden=!report.buckets.length;
    $('selection').textContent=`${selected.events.length} matching returned events${selected.selection.start?` · ${selected.selection.start} through ${selected.selection.end_inclusive}`:''}. Missing chain activity remains unknown.`;
    $('page').textContent=`Page ${page+1} of ${pages} · ${selected.events.length} matching events`;$('previous').disabled=page===0;$('next').disabled=page+1>=pages;
    $('totals').replaceChildren();for(const group of selected.groups){const card=el('article',undefined,'atlas-panel');card.append(el('h3',group.kind.replaceAll('_',' ')),el('p',`${group.direction} · ${group.events} returned events`),el('strong',`${group.observed_total_base_units} ${report.unit}`));$('totals').append(card);}
    $('ledger').replaceChildren();for(const event of selected.events.slice(page*20,page*20+20)){const card=el('article',undefined,'atlas-panel');card.append(el('h3',event.event_id),el('p',`${event.block_time} · block ${event.block_number}`),el('p',`${event.from} → ${event.to}`),el('p',`${event.kind} · ${event.direction} · ${event.amount_base_units} ${report.unit}`));const details=el('details');details.append(el('summary','Inspect exact event'),el('pre',JSON.stringify(event,null,2)));card.append(details);$('ledger').append(card);}
    if(!selected.events.length)$('ledger').append(el('p','No timed observations match this selection. This is not a finding of inactivity.'));
    for(const bar of $('chart').querySelectorAll('[data-time-bin]')){const index=Number(bar.dataset.timeBin);bar.setAttribute('aria-pressed',String(index>=first&&index<=last));bar.setAttribute('tabindex',index===first?'0':'-1');}
  }
  function choose(a,b){first=a;last=b;page=0;view();}
  function render(){
    $('result').hidden=false;first=0;last=report.buckets.length-1;for(const name of ['first','last'])$(name).max=Math.max(0,last);
    $('coverage').textContent=`${report.asset} · ${report.window.interval} bins · ${report.coverage.returned_records} returned events of ${report.coverage.records} captured records. ${report.coverage.excluded.missing_timestamp} matching records have no timestamp; ${report.coverage.excluded.invalid_timestamp} have an invalid timestamp. ${report.reason||'No bin is claimed complete.'}`;
    for(const note of report.notes)$('notes').append(el('p',note));$('provenance').textContent=JSON.stringify({version:report.version,...report.provenance,parameters:report.parameters,window:report.window,coverage:report.coverage,limits:report.limits,report_sha256:report.report_sha256},null,2);draw();view();
  }
  $('form').onsubmit=async event=>{
    event.preventDefault();if(!available()||busy)return;clear('Building the timeline from retained observations…');const run=version,current=source;busy=true;controls();
    const value=$('reference').value.trim(),node=current.nodes.find(node=>node.id===value||node.address===value||node.txid===value),parameters={...(value?{reference:node?.id||value}:{}),direction:$('direction').value,kind:$('kind').value,minimum:$('minimum').value,interval:$('interval').value,...($('start').value?{start:$('start').value+'Z'}:{}),...($('end').value?{end:$('end').value+'Z'}:{})};
    try{const value=await query(parameters,current);if(run!==version)return;const {report_sha256,...body}=value;if(await sha(JSON.stringify(body))!==report_sha256||current.datasetHash&&value.provenance.dataset_sha256!==current.datasetHash||current.analysisId&&value.provenance.analysis_id!==current.analysisId)throw new Error('timeline_integrity_failed');if(run!==version)return;
      report=value;render();$('status').textContent=`Timeline ready: ${report.buckets.length} UTC bins. Select a range to inspect its exact events; no new collection was started.`;
    }catch(error){if(run===version){clear();$('status').textContent=`Timeline unavailable: ${messages[error.message]||error.message.replaceAll('_',' ')} No previous result is displayed.`;}}
    finally{if(run===version){busy=false;controls();}}
  };
  for(const input of $('form').querySelectorAll('input,select'))input.addEventListener(input.tagName==='SELECT'?'change':'input',()=>clear());
  $('reset').onclick=()=>{$('form').reset();clear('Timeline filters reset. Build a new timeline.');};
  $('first').oninput=()=>{const value=Number($('first').value);choose(value,Math.max(value,last));};$('last').oninput=()=>{const value=Number($('last').value);choose(Math.min(first,value),value);};
  $('back').onclick=()=>{if(first>0)choose(first-1,last-1);};$('forward').onclick=()=>{if(last<report.buckets.length-1)choose(first+1,last+1);};$('all').onclick=()=>choose(0,report.buckets.length-1);
  $('search').oninput=()=>{page=0;view();};$('previous').onclick=()=>{page--;view();};$('next').onclick=()=>{page++;view();};
  function download(type){if(!report||busy||loading)return;const text=type==='json'?JSON.stringify(report,null,2):timelineCsv(report,selection()),url=URL.createObjectURL(new Blob([text],{type:type==='json'?'application/json':'text/csv;charset=utf-8'})),link=el('a');link.href=url;link.download=`atlas-timeline-${report.report_sha256.slice(0,12)}.${type}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('json').onclick=()=>download('json');$('csv').onclick=()=>download('csv');
  setSource(null);return {setSource,reset(){setSource(null);},setLoading(value){if(loading===value)return;loading=value;if(value)clear('Waiting for the source capture…');else if(!report)$('status').textContent=source?'Build a timeline from the retained capture. Its coverage and source remain attached.':'Open a capture to explore its timeline.';controls();}};
}
