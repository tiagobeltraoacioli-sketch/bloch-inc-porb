import {FIELDS,ASSETS,atlasSchema} from './atlas_registry.js';
import {analyzeAtlas,atlasCsv} from './atlas_engine.js';
import {evaluateHoldout} from './atlas_statistics.js';
import {traceAtlasPaths} from './atlas_paths.js';
import {mountAtlasPaths} from './atlas_paths_ui.js';
import {scanAtlasMotifs} from './atlas_motifs.js';
import {mountAtlasMotifs} from './atlas_motifs_ui.js';
import {fetchEvidence,mergeEvidence,validateEvidenceCollection,COLLECTION_LIMITS} from './system_evidence.js';
const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
let packet=null,report=null,baseline=null,evaluation=null,imported=false,controller=null,epoch=0,calculation=0,page=0;
const pathWorkspace=mountAtlasPaths($('atlas-path-workspace'),(parameters,source)=>traceAtlasPaths(source.packet.dataset,parameters,{dataset_sha256:source.packet.dataset_sha256,imported:source.imported,selection:source.packet.selection}));
const motifWorkspace=mountAtlasMotifs($('atlas-motif-workspace'),(parameters,source)=>scanAtlasMotifs(source.packet.dataset,parameters,{dataset_sha256:source.packet.dataset_sha256,imported:source.imported,selection:source.packet.selection}));
const query=new URLSearchParams(location.search);
if(Object.hasOwn(ASSETS,query.get('asset'))) $('atlas-asset').value=query.get('asset');
for(const layer of new Set(FIELDS.map(f=>f.layer)))$('group-filter').append(new Option(layer,layer));
$('field-count').textContent=FIELDS.length;
for(const [param,id] of [['q','field-search'],['layer','group-filter'],['access','access-filter'],['state','status-filter']])if(query.has(param))$(id).value=query.get(param);
const notify=(message,error=false)=>{$('atlas-status').textContent=message;$('atlas-status').classList.toggle('atlas-error',error);};
function download(name,value,type='application/json'){
  const url=URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type})),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function controls(busy=false){
  pathWorkspace.setLoading(busy);
  motifWorkspace.setLoading(busy);
  $('atlas-load').disabled=busy;$('atlas-asset').disabled=busy;$('atlas-pages').disabled=busy;
  $('atlas-more').disabled=busy||!packet||imported||!packet.pagination?.next_cursor||packet.dataset.snapshots.length>=COLLECTION_LIMITS.pages;
  for(const id of ['atlas-apply','atlas-pin','atlas-export','atlas-csv','atlas-evidence','atlas-graph','atlas-analytics'])$(id).disabled=!report||busy;
  $('atlas-pin').disabled=!report||busy||Boolean(packet?.selection);
  $('atlas-unpin').disabled=!baseline;
  $('atlas-capture').setAttribute('aria-busy',String(busy));
}
function options(){return {reference:$('atlas-reference').value.trim(),start:$('atlas-start').value?$('atlas-start').value+'Z':null,end:$('atlas-end').value?$('atlas-end').value+'Z':null,
  kind:$('atlas-kind').value,minimum:$('atlas-minimum').value,max_hops:Number($('atlas-hops').value),baseline,imported};}
function resetFilters(){for(const id of ['atlas-reference','atlas-start','atlas-end'])$(id).value='';$('atlas-minimum').value='0';$('atlas-kind').value='all';$('atlas-hops').value='4';}
function populate(){
  $('atlas-asset').value=packet.dataset.asset;$('atlas-references').replaceChildren();
  for(const n of packet.dataset.nodes){const option=el('option');option.value=n.address||n.txid;option.label=n.kind;$('atlas-references').append(option);}
  $('atlas-kind').replaceChildren(new Option('All types','all'));for(const kind of globalThis.GraphusAnalytics.KINDS[packet.dataset.asset])$('atlas-kind').append(new Option(kind.replaceAll('_',' '),kind));
}
async function calculate(){
  if(!packet)return;const run=++calculation,current=packet;
  try{const next=await analyzeAtlas(current,options());if(run!==calculation||current!==packet)return;
    report=next;page=0;render();notify(`${imported?'Imported evidence; source claims unverified':'Source capture'} · ${report.observation.records} selected records · ${packet.dataset.snapshots.length} pages.`);
  }catch(error){if(run===calculation)notify(`Selection not applied. ${error.message} The previous result remains visible.`,true);}
  controls(Boolean(controller));
}
async function install(candidate,fromFile,reset,run){
  const nextBaseline=baseline&&!candidate.selection&&baseline.dataset.asset===candidate.dataset.asset&&baseline.dataset.source===candidate.dataset.source?baseline:null;
  const parameters=reset?{reference:'',start:null,end:null,kind:'all',minimum:'0',max_hops:4}:options();
  const calculated=await analyzeAtlas(candidate,{...parameters,baseline:nextBaseline,imported:fromFile});
  if(run!==epoch)return false;
  packet=candidate;baseline=nextBaseline;imported=fromFile;report=calculated;page=0;
  if(reset){populate();resetFilters();}render();
  notify(`${imported?'Imported evidence; source claims unverified':'Source capture'} · ${report.observation.records} selected records · ${packet.dataset.snapshots.length} pages.`);
  return true;
}
async function capture(append=false){
  const run=++epoch;++calculation;controller?.abort();const active=new AbortController();controller=active;const signal=active.signal,asset=$('atlas-asset').value;
  let next=append?packet:null,completed=0;controls(true);notify('Collecting real public source records…');
  try{
    const total=append?1:Number($('atlas-pages').value);
    for(let i=0;i<total;i++){
      const cursor=next?.pagination?.next_cursor??null;if(next&&cursor===null)break;
      const timeout=setTimeout(()=>active.abort(),65000);let part;
      try{part=await fetchEvidence(asset,{signal,cursor});}finally{clearTimeout(timeout);}if(run!==epoch)return;
      next=await mergeEvidence(next,part);completed++;notify(`Collected ${next.dataset.edges.length} records from ${next.dataset.snapshots.length} pages…`);
    }
    if(run!==epoch)return;
    await install(next,false,!append,run);controller=null;
  }catch(error){
    if(run!==epoch)return;
    controller=null;
    if(completed&&next){try{await install(next,false,true,run);}catch{/* Preserve the last successfully calculated capture. */}}
    notify(`${completed?'Collected pages retained. ':packet?'Previous capture retained. ':''}${error.message}`,true);
  }finally{if(run===epoch){controller=null;controls();}}
}
function stateFor(field){return report?.fields[field.name]||{state:field.release_gate?'gated':field.access!=='public'?'private':'unavailable',value:null,reason:field.release_gate||'Capture a dataset to calculate this field.'};}
function updateUrl(field){
  const q=new URLSearchParams();q.set('asset',packet?.dataset.asset||$('atlas-asset').value);
  for(const [key,id] of [['q','field-search'],['layer','group-filter'],['access','access-filter'],['state','status-filter']]){const v=$(id).value;if(v&&v!=='all')q.set(key,v);}
  if(field)q.set('field',field);history.replaceState(null,'',`${location.pathname}?${q}`);
}
function registry(){
  const search=$('field-search').value.trim().toLowerCase(),layer=$('group-filter').value||'all',access=$('access-filter').value||'all',state=$('status-filter').value||'all';
  const rows=FIELDS.filter(f=>(layer==='all'||f.layer===layer)&&(access==='all'||f.access===access)&&(state==='all'||stateFor(f).state===state)&&`${f.name} ${f.meaning} ${f.layer} ${f.method}`.toLowerCase().includes(search));
  $('field-rows').replaceChildren();for(const f of rows){const r=el('tr'),button=el('button',f.name,'atlas-field-button');button.addEventListener('click',()=>detail(f.name));r.append(el('td',f.layer));const name=el('td');name.append(button);r.append(name,el('td',f.meaning),el('td',f.access));const status=el('td'),s=stateFor(f);status.append(el('span',f.implementation,'atlas-implementation'),el('span',s.state.replaceAll('_',' '),`atlas-badge atlas-${s.state}`));r.append(status);$('field-rows').append(r);}
  if(!rows.length){const r=el('tr'),c=el('td','No fields match these filters.');c.colSpan=5;r.append(c);$('field-rows').append(r);}
  $('catalog-result').textContent=`${rows.length} of ${FIELDS.length} fields shown. Result states reflect this capture and its inputs.`;
  $('available-count').textContent=report?Object.values(report.fields).filter(r=>['available','partial'].includes(r.state)).length:'—';
}
function detail(name){
  const field=FIELDS.find(f=>f.name===name);if(!field)return;
  const r=stateFor(field);$('atlas-detail-layer').textContent=field.layer;$('atlas-detail-title').textContent=field.name;$('atlas-detail-meaning').textContent=field.meaning;
  $('atlas-detail-meta').replaceChildren();for(const [key,value] of Object.entries({Access:field.access,Implementation:field.implementation,Result:r.state,Method:field.method,Units:field.units,'Missing values':field.missing_value,Reason:r.reason||'Value available for this capture.',Endpoint:field.endpoint}))$('atlas-detail-meta').append(el('dt',key),el('dd',value));
  $('atlas-detail-value').textContent=JSON.stringify(r.value,null,2);$('atlas-detail-link').hidden=field.access==='public';
  if(!$('atlas-detail').open)$('atlas-detail').showModal();updateUrl(name);
}
function chart(){
  $('atlas-chart').replaceChildren();$('atlas-trend').textContent='';const rows=report.daily;
  if(!rows.length){$('atlas-chart').append(el('p','No timestamps in this selection. Temporal features remain unavailable.'));return;}
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 680 180');svg.setAttribute('role','img');
  const title=document.createElementNS(ns,'title');title.textContent=`Returned records across ${rows.length} UTC days; ${rows.filter(r=>r.state==='missing').length} days have unknown coverage.`;svg.append(title);
  const max=Math.max(1,...rows.map(r=>r.events||0)),width=640/rows.length;
  for(const [i,r]of rows.entries()){const rect=document.createElementNS(ns,'rect');rect.setAttribute('x',String(25+i*width));rect.setAttribute('y',String(r.events===null?145:145-r.events/max*125));rect.setAttribute('width',String(Math.max(.5,width-1)));rect.setAttribute('height',String(r.events===null?4:r.events/max*125));rect.setAttribute('class',r.events===null?'atlas-missing-bar':'atlas-observed-bar');const t=document.createElementNS(ns,'title');t.textContent=`${r.day}: ${r.events===null?'unknown':r.events+' returned records'}`;rect.append(t);svg.append(rect);}
  for(const [x,label]of [[25,rows[0].day],[530,rows.at(-1).day]]){const t=document.createElementNS(ns,'text');t.setAttribute('x',String(x));t.setAttribute('y','173');t.textContent=label;svg.append(t);}
  $('atlas-chart').append(svg);
  const fit=report.fields.trend_slope;$('atlas-trend').textContent=fit.value?`Descriptive slope: ${fit.value.value.toPrecision(4)} returned records per day. Inspect fit_diagnostics for residuals and limitations.`:fit.reason;
}
function ledger(){
  $('atlas-ledger').replaceChildren();if(!report)return;
  const total=report.records.length,pages=Math.max(1,Math.ceil(total/25));page=Math.min(page,pages-1);
  for(const e of report.records.slice(page*25,page*25+25)){
    const row=el('tr'),event=el('td');event.append(el('code',e.event_id),el('small',e.txid));row.append(event);
    for(const id of [e.from,e.to]){const cell=el('td'),node=packet.dataset.nodes.find(n=>n.id===id),button=el('button',node?.address||node?.txid||id,'atlas-reference-button');button.addEventListener('click',()=>{$('atlas-reference').value=node?.address||node?.txid||id;calculate();});cell.append(button);row.append(cell);}
    row.append(el('td',`${e.kind} · ${e.block_number}`),el('td',e.amount_base_units));$('atlas-ledger').append(row);
  }
  if(!total){const row=el('tr'),cell=el('td','No records match the applied selection.');cell.colSpan=5;row.append(cell);$('atlas-ledger').append(row);}
  $('ledger-page').textContent=`Page ${page+1} of ${pages} · ${total} records`;$('ledger-previous').disabled=page===0;$('ledger-next').disabled=page+1>=pages;
}
function render(){
  motifWorkspace.setSource({key:packet.dataset_sha256+':'+imported+':'+JSON.stringify(packet.selection??null),asset:packet.dataset.asset,nodes:packet.dataset.nodes,packet,imported,
    description:`${packet.dataset.asset} · ${packet.dataset.edges.length} captured events · ${packet.dataset.snapshots.length} source pages. Patterns use this capture and their own filters. ${imported?'Imported source claims remain unverified.':''}`});
  pathWorkspace.setSource({key:packet.dataset_sha256+':'+imported+':'+JSON.stringify(packet.selection??null),asset:packet.dataset.asset,nodes:packet.dataset.nodes,packet,imported,
    description:`${packet.dataset.asset} · ${packet.dataset.edges.length} captured events · ${packet.dataset.snapshots.length} source pages. Paths use this complete capture and their own filters; field selection does not restrict the search. ${imported?'Imported source claims remain unverified.':''}`});
  if(evaluation){
    report.evaluation=evaluation;
    for(const name of ['training_cutoff','validation_cohort','precision_at_review_capacity','recall_and_false_positive_rate','calibration_and_drift'])report.fields[name]={state:'partial',value:evaluation[name],reason:'Browser-local holdout evaluation, separate from the chain capture. Input declarations are not independently verified; no model release approval.'};
  }
  registry();$('atlas-summary').replaceChildren();
  for(const [label,value]of [['Captured records',packet.dataset.edges.length],['Selected records',report.records.length],['Selected references',new Set(report.records.flatMap(e=>[e.from,e.to])).size],['Missing timestamps',report.observation.records_without_timestamp]]){const card=el('div');card.append(el('strong',String(value)),el('span',label));$('atlas-summary').append(card);}
  $('atlas-selection').textContent=`Applied: ${report.parameters.reference||'all references'} · ${report.parameters.kind} · minimum ${report.parameters.minimum} base units · ${report.parameters.start||'earliest observed'} through ${report.parameters.end||'latest observed'}. ${report.observation.excluded_missing_timestamps} untimed records excluded by the time filter.`;
  $('atlas-provenance').textContent=JSON.stringify({analysis_id:report.analysis_id,...report.provenance,parameters:report.parameters,quality:report.fields.data_quality_flags.value},null,2);
  $('atlas-baseline').textContent=baseline?`Baseline ${baseline.dataset_sha256.slice(0,16)}… · ${baseline.dataset.edges.length} records. ${report.comparison?`${report.comparison.counts.shared} shared, ${report.comparison.counts.only_current} only in current, ${report.comparison.conflicting_blocks.length} block conflicts.`:'Ready for comparison.'}`:'No comparison baseline pinned.';
  $('atlas-totals').replaceChildren();for(const g of report.fields.volume_by_asset.value.groups){const div=el('div');div.append(el('strong',g.base_units),el('span',`${g.kind} / ${g.direction} · ${g.records} records`));$('atlas-totals').append(div);}
  if(!report.records.length)$('atlas-totals').append(el('p','No selected values.'));
  chart();ledger();updateUrl();if(query.get('field')){detail(query.get('field'));query.delete('field');}
}
$('atlas-capture').addEventListener('submit',e=>{e.preventDefault();capture();});$('atlas-more').onclick=()=>capture(true);
$('atlas-filter').addEventListener('submit',e=>{e.preventDefault();calculate();});$('atlas-reset').onclick=()=>{resetFilters();calculate();};
$('atlas-import').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;const run=++epoch;++calculation;controller?.abort();controller=null;controls(true);
  try{if(file.size>6000000)throw new Error('Evidence files must be at most 6 MB.');const candidate=await validateEvidenceCollection(JSON.parse(await file.text()));if(run!==epoch)return;
    await install(candidate,true,true,run);
  }catch(error){if(run===epoch)notify(`Import rejected. ${error.message} The previous capture remains available.`,true);}finally{if(run===epoch)controls();e.target.value='';}
});
$('atlas-pin').onclick=async()=>{baseline=structuredClone(packet);await calculate();};$('atlas-unpin').onclick=async()=>{baseline=null;await calculate();};
$('atlas-export').onclick=()=>download(`graphus-atlas-${report.asset}.json`,report);
$('atlas-csv').onclick=()=>download(`graphus-atlas-${report.asset}.csv`,atlasCsv(report),'text/csv;charset=utf-8');
$('atlas-evidence').onclick=()=>download(`graphus-evidence-${report.asset}.json`,packet);$('atlas-schema').onclick=()=>download('graphus-atlas-schema.json',atlasSchema());
$('atlas-graph').onclick=()=>{try{sessionStorage.setItem('graphus.constellation.evidence.v1',JSON.stringify(packet));location.href='constellation.html?import=evidence';}catch{notify('Browser storage is full. Download the evidence JSON and open it in Constellation.',true);}};
$('atlas-analytics').onclick=()=>{try{sessionStorage.setItem('graphus.analytics.network.v1',JSON.stringify(packet));location.href='analytics.html?import=network';}catch{notify('Browser storage is full. Download the evidence JSON and open it in Analytics.',true);}};
for(const id of ['field-search','group-filter','access-filter','status-filter'])$(id).addEventListener(id==='field-search'?'input':'change',()=>{registry();updateUrl();});
$('atlas-detail-close').onclick=()=>$('atlas-detail').close();$('atlas-detail').addEventListener('close',()=>updateUrl());
$('ledger-previous').onclick=()=>{page--;ledger();};$('ledger-next').onclick=()=>{page++;ledger();};
$('atlas-evaluation-import').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>2000000)throw new Error('Evaluation files must be at most 2 MB.');const evaluated=evaluateHoldout(JSON.parse(await file.text()));evaluated.report_sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(evaluated))))].map(b=>b.toString(16).padStart(2,'0')).join('');evaluation=evaluated;if(report)render();$('atlas-evaluation-output').textContent=JSON.stringify(evaluation,null,2);$('atlas-evaluation-output').hidden=false;$('atlas-evaluation-export').disabled=false;$('atlas-evaluation-clear').disabled=false;$('atlas-evaluation-status').textContent=`Calculated ${evaluation.validation_cohort.records} holdout records. Label origin: ${evaluation.label_origin}. No release approval.`;}catch(error){$('atlas-evaluation-status').textContent=`Evaluation rejected: ${error.message} Previous report, if any, remains visible.`;}finally{e.target.value='';}});
$('atlas-evaluation-example').onclick=()=>download('atlas-evaluation-SYNTHETIC-example.json',{schema_version:1,label_origin:'synthetic',model_version:'synthetic-format-example',training_cutoff:'2026-01-01T00:00:00Z',training_entities:['synthetic-training-1'],review_capacity:2,threshold:.5,baseline_probabilities:[.1,.2,.6,.8],rows:[.9,.7,.4,.1].map((probability,i)=>({id:`synthetic-${i}`,entity:`synthetic-holdout-${i}`,observed_at:'2026-01-02T00:00:00Z',probability,label:i%2?0:1}))});
$('atlas-evaluation-clear').onclick=()=>{evaluation=null;$('atlas-evaluation-output').textContent='';$('atlas-evaluation-output').hidden=true;$('atlas-evaluation-export').disabled=true;$('atlas-evaluation-clear').disabled=true;$('atlas-evaluation-status').textContent='Evaluation cleared from this tab.';calculate();};
$('atlas-evaluation-export').onclick=()=>download('atlas-evaluation-report.json',evaluation);
registry();controls();
if(query.get('import')==='evidence'){
  const raw=sessionStorage.getItem('graphus.atlas.evidence.v1');sessionStorage.removeItem('graphus.atlas.evidence.v1');
  try{if(!raw)throw new Error('The evidence handoff is missing or already consumed. Reopen the saved JSON.');const candidate=await validateEvidenceCollection(JSON.parse(raw));await install(candidate,true,true,epoch);controls();}catch(error){notify(error.message,true);}
}else capture();
