const el = (tag,text,cls) => {const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(cls)n.className=cls; return n;};
const short = value => value.length>24 ? value.slice(0,14)+'…'+value.slice(-8) : value;
const save = (name,value) => {const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
const messages = {distinct_path_references_required:'Choose two different references from the current sample.',path_reference_unobserved:'Both references must be present in this sample.',invalid_path_duration:'The maximum gap must not exceed the total duration, and both must be between one second and seven days.',invalid_path_utc_range:'Use a valid UTC range with the start no later than the end.',invalid_path_minimum:'Minimum value must be an unsigned base-unit integer.',analysis_integrity_failed:'The retained sample failed its integrity check.',inconsistent_path_block:'The sample contains conflicting block hashes or timestamps.',rate_limit:'Too many path searches. Wait a minute before retrying.'};

export function mountAtlasPaths(root, query, onReport = () => {}, options = {}) {
  root.classList.add('atlas-path-workspace');
  root.innerHTML=`<p class="section-index">TEMPORAL EVIDENCE / DIRECTED PATHS</p><h2>Between two references.</h2>
    <p>Inspect ordered events in one asset. A sequence does not prove that the same value passed through its references.</p><p data-path="context" class="atlas-note"></p>
    <form data-path="form" class="atlas-path-controls">
      <label>From reference<input data-path="from" list="atlas-path-options" maxlength="200" required autocomplete="off" placeholder="Address or exact node ID"></label>
      <label>To reference<input data-path="to" list="atlas-path-options" maxlength="200" required autocomplete="off" placeholder="Address or exact node ID"></label><datalist id="atlas-path-options"></datalist>
      <label>Maximum steps<select data-path="hops"><option>1</option><option>2</option><option>3</option><option selected>4</option><option>5</option><option>6</option></select></label>
      <label>Maximum gap (hours)<input data-path="gap" type="number" min="1" max="168" step="1" value="24" required></label>
      <label>Total duration (hours)<input data-path="duration" type="number" min="1" max="168" step="1" value="168" required></label>
      <label>Minimum per-event base units<input data-path="minimum" inputmode="numeric" maxlength="78" pattern="0|[1-9][0-9]{0,77}" value="0" required></label>
      <label>From (UTC)<input data-path="start" type="datetime-local" step="1"></label><label>Through (UTC)<input data-path="end" type="datetime-local" step="1"></label>
      <label>Maximum results<select data-path="limit"><option>5</option><option selected>10</option><option>20</option></select></label>
      <button data-path="run" class="button primary" disabled>Find ordered paths</button><button data-path="swap" type="button">Swap endpoints</button><button data-path="reset" type="button">Reset path filters</button>
    </form><p data-path="status" role="status">Open a sample to explore its paths.</p>
    <div data-path="result" hidden><div data-path="metrics" class="atlas-path-metrics"></div><p data-path="limits" class="atlas-note"></p>
      <div data-path="routes" class="atlas-path-routes" role="group" aria-label="Choose a temporal path"></div>
      <div data-path="diagram" class="atlas-path-diagram" tabindex="0" aria-label="Path diagram; scroll horizontally to inspect all references"></div><div data-path="steps"></div>
      <details><summary>Coverage, exclusions and reproducibility</summary><div data-path="notes"></div><pre data-path="provenance"></pre></details>
    </div><div class="atlas-actions"><button data-path="export" disabled>Download path report JSON</button></div>`;
  const $=name=>root.querySelector(`[data-path="${name}"]`);
  const optionId='atlas-path-options-'+crypto.randomUUID();root.querySelector('datalist').id=optionId;
  for(const name of ['from','to'])$(name).setAttribute('list',optionId);
  if(options.readOnly){$('form').hidden=true;root.querySelector('h2').textContent='Inspect the retained paths.';}
  let source=null,report=null,version=0,busy=false,loading=false;
  const available=()=>source&&!['BTC','BLCH'].includes(source.asset)&&!loading;
  function controls(){for(const control of $('form').elements)control.disabled=!available();$('run').disabled=!available()||busy;$('export').disabled=!report||loading||busy;}
  function clear(message='Parameters changed. Run the path search again.'){
    version++;busy=false;report=null;onReport(null);$('result').hidden=true;
    for(const name of ['metrics','routes','diagram','steps','notes','provenance','limits'])$(name).replaceChildren();
    $('status').textContent=message;controls();
  }
  function setSource(next){
    const changed=source?.key!==next?.key; source=next;
    if(changed||!next){
      clear();$('form').reset();root.querySelector('datalist').replaceChildren();
      for(const n of next?.nodes||[])if(n.kind==='address')root.querySelector('datalist').append(new Option(n.id,n.address||n.id));
      if(next?.selectedNode){const n=next.nodes.find(n=>n.id===next.selectedNode);$('from').value=n?.address||n?.id||'';}
    }
    $('context').textContent=next?next.description:'Open a source capture or a saved analysis first.';
    if(!next)$('status').textContent='Open a sample to explore its paths.';
    else if(['BTC','BLCH'].includes(next.asset))$('status').textContent='Account-style paths are unavailable for BTC and BLCH: input/output references do not establish direct senders.';
    else if(changed)$('status').textContent='Choose endpoints from the sample. These path filters are separate from the field and comparison filters.';
    controls();
  }
  function selectPath(index){
    const path=report.paths[index];if(!path)return;
    for(const [i,button]of [...$('routes').children].entries())button.setAttribute('aria-pressed',String(i===index));
    $('diagram').replaceChildren();$('steps').replaceChildren();
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),width=Math.max(440,path.references.length*190);
    svg.setAttribute('viewBox',`0 0 ${width} 130`);svg.style.minWidth=`${width}px`;svg.setAttribute('role','img');
    const title=document.createElementNS(ns,'title');title.textContent=`Path ${path.index}: ${path.references.join(' → ')}. ${path.hops} ordered events.`;svg.append(title);
    for(const [i,id]of path.references.entries()){
      const x=80+i*(width-160)/(path.references.length-1);
      if(i){const previous=80+(i-1)*(width-160)/(path.references.length-1),line=document.createElementNS(ns,'path');line.setAttribute('d',`M ${previous+16} 42 H ${x-20} m -7 -5 l 7 5 -7 5`);line.setAttribute('class','atlas-path-line');svg.append(line);}
      const circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',x);circle.setAttribute('cy',42);circle.setAttribute('r',16);circle.setAttribute('class','atlas-path-node');svg.append(circle);
      for(const [y,value,cls]of [[47,String(i+1),'atlas-path-number'],[79,short(id.split(':').at(-1)),'atlas-path-label']]){const t=document.createElementNS(ns,'text');t.setAttribute('x',x);t.setAttribute('y',y);t.setAttribute('text-anchor','middle');t.setAttribute('class',cls);t.textContent=value;svg.append(t);}
    }
    $('diagram').append(svg);
    $('steps').append(el('h3',`Path ${path.index} · ${path.hops} steps · ${path.duration_seconds.toLocaleString('en-US')} seconds`));
    if(path.high_degree_references.length)$('steps').append(el('p',`${path.high_degree_references.length} reference(s) have ten or more eligible neighbors. Sample structure may reflect a shared service or selection; no service identity is inferred.`,'atlas-path-warning'));
    for(const [i,step]of path.steps.entries()){
      const article=el('article',undefined,'atlas-path-step'),heading=el('div',undefined,'atlas-path-step-heading');
      heading.append(el('strong',`Step ${i+1}`),el('span',step.block_time),el('span',i?`${step.gap_seconds.toLocaleString('en-US')} s after previous event`:'First observed event'));article.append(heading);
      article.append(el('p',`${step.from} → ${step.to}`,'atlas-path-addresses'),el('p',`${step.amount_base_units} ${report.unit}`,'atlas-path-amount'),el('p',`${step.kind} · block ${step.block_number} · position ${step.position??'unavailable'}`));
      const details=el('details');details.append(el('summary','Inspect event and block identities'),el('pre',JSON.stringify(step,null,2)));article.append(details);$('steps').append(article);
    }
  }
  function render(){
    $('result').hidden=false;
    for(const [label,value]of [['Returned paths',report.paths.length],['Eligible events',report.coverage.eligible_records],['Examined candidates',report.search.expansions],['Excluded events',Object.values(report.coverage.excluded).reduce((a,b)=>a+b,0)]]){const card=el('div');card.append(el('strong',String(value)),el('span',label));$('metrics').append(card);}
    $('limits').textContent=report.state==='not_applicable'?report.reason:report.search.truncated?`Search stopped at the ${report.search.stop_reason==='path_limit'?'result':'20,000-candidate'} limit. More paths may exist; narrow the window, raise the minimum or reduce steps.`:'Search completed within this query and sample. Missing source history remains unknown.';
    $('limits').classList.toggle('atlas-path-warning',report.search.truncated);
    for(const [i,path]of report.paths.entries()){const button=el('button',`Path ${i+1} · ${path.hops} steps · ${path.duration_seconds} s`);button.onclick=()=>selectPath(i);button.setAttribute('aria-pressed','false');$('routes').append(button);}
    if(report.paths.length)selectPath(0);else $('steps').append(el('p',report.reason||'No ordered path was found under these limits. This does not establish absence on the chain.'));
    for(const note of report.notes)$('notes').append(el('p',note));
    $('provenance').textContent=JSON.stringify({version:report.version,...report.provenance,parameters:report.parameters,coverage:report.coverage,search:report.search,report_sha256:report.report_sha256},null,2);
  }
  $('form').onsubmit=async event=>{
    event.preventDefault();if(!available()||busy)return;clear('Searching ordered events in this sample…');const run=version,current=source;busy=true;controls();
    const resolve=value=>{const n=current.nodes.find(n=>n.id===value||n.address===value);return n?.id||value;};
    const input={from:resolve($('from').value.trim()),to:resolve($('to').value.trim()),max_hops:Number($('hops').value),max_paths:Number($('limit').value),max_gap_seconds:Number($('gap').value)*3600,max_duration_seconds:Number($('duration').value)*3600,minimum:$('minimum').value,
      ...($('start').value?{start:$('start').value+'Z'}:{}),...($('end').value?{end:$('end').value+'Z'}:{})};
    try{const value=await query(input,current);if(run!==version)return;report=value;render();onReport(report);$('status').textContent=`${report.paths.length} ordered path(s) found in ${report.asset}. ${report.search.truncated?'Search limit reached.':'No new source collection was started.'}`;}
    catch(error){if(run===version)$('status').textContent=`Path search unavailable: ${messages[error.message]||error.message.replaceAll('_',' ')} No previous result is displayed.`;}
    finally{if(run===version){busy=false;controls();}}
  };
  for(const input of $('form').querySelectorAll('input,select'))input.addEventListener(input.tagName==='SELECT'?'change':'input',()=>clear());
  $('swap').onclick=()=>{const from=$('from').value;$('from').value=$('to').value;$('to').value=from;clear();};
  $('reset').onclick=()=>{$('form').reset();clear('Choose endpoints and run a new path search.');};
  $('export').onclick=()=>{if(report)save(`atlas-paths-${report.report_sha256.slice(0,12)}.json`,report);};
  setSource(null);
  return {setSource,setLoading(value){if(loading===value)return;loading=value;if(value)clear('Waiting for the source capture…');controls();},reset(){setSource(null);},showReport(value){
    if(!options.readOnly)return;clear();report=value;render();controls();
    $('context').textContent='Verified saved calculation. Inspect its original ordered events, source and search limits. No new source collection is started.';
    $('status').textContent=`${report.paths.length} retained path(s) in ${report.asset}. The original query limits and coverage apply.`;
  }};
}
