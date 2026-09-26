import {mountAtlasTimeline} from '/graphus/assets/atlas_timeline_ui.js';
import {mountAtlasMotifs} from '/graphus/assets/atlas_motifs_ui.js';
import {mountAtlasPaths} from '/graphus/assets/atlas_paths_ui.js';
import {mountAtlasComparison} from './atlas-comparison-view.js';
import {mountTimelineComparison} from '/graphus/assets/atlas_timeline_compare_ui.js';
import {retainWindowComparison,windowParametersFromComparison} from '/graphus/assets/atlas_window_record.js';
const $ = id => document.getElementById(id);
const el = (tag, text, cls) => {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const date = value => new Date(value).toLocaleString();
const labels = {paths:'Temporal paths',comparison:'Sample comparison',motifs:'Observed patterns',timeline:'Activity timeline',window_comparison:'Time window comparison'};
const patternLabels={cycles:'Return cycles',pass_through:'In/out sequences',fan_in:'Fan-in windows',fan_out:'Fan-out windows',repeated_pair:'Repeated directed pairs'};
const messages = {window_source_changed_or_capacity:'The source timeline changed or the library filled while saving. Refresh the library and calculate again.',window_report_source_not_timeline:'Choose an active saved activity timeline as the source.',report_preview_changed:'The calculation changed. Run it again before saving.',report_capacity_purge_expired:'The library is full. Delete a report or ask an administrator to purge expired reports.',report_storage_capacity:'This complete report exceeds the 6 MB storage limit. Narrow the calculation and try again.',report_integrity_failed:'The saved report failed its integrity check. Export is blocked.',report_request_expired:'This save request already created an expired report. Start a new save.',report_unavailable:'This report expired or is no longer available.',rate_limit:'Too many save requests. Wait a minute before retrying.'};
const message = error => messages[error.message] || error.message.replaceAll('_',' ');
const summary = row => row.kind==='window_comparison' ? `${row.summary.baseline_events} baseline / ${row.summary.comparison_events} comparison events · ${row.summary.groups} typed groups · ${row.summary.equal_durations?'equal':'unequal'} window durations` : row.kind==='timeline' ? `${row.summary.events} timed events · ${row.summary.buckets} UTC ${row.summary.interval} bins · ${row.summary.records} captured records${row.summary.state==='unavailable'?' · no matching timed observations':''}` : row.kind==='motifs' ? `${row.summary.motifs} observed patterns · ${patternLabels[row.summary.type]} · ${row.summary.eligible_records} eligible events${row.summary.state==='not_applicable'?' · not applicable':row.summary.truncated?' · search limit reached':row.summary.complete_within_query?' · complete within query':''}` : row.kind==='paths' ? `${row.summary.paths} ordered paths · ${row.summary.eligible_records} eligible events${row.summary.state==='not_applicable'?' · not applicable':row.summary.truncated?' · search limit reached':''}` : `${row.summary.events} compared events · ${row.summary.counts.changed} changed · ${row.summary.block_conflicts} block hash disagreements`;

export function reportWorkspace(request, startReview, onReports = () => {}) {
  let context=null, rows=[], retention=null, candidates=Object.fromEntries(Object.keys(labels).map(kind=>[kind,null])), draft=null, pending=null, detail=null;
  const windowCandidates=new Map(),windowVersions=new Map();let windowSequence=0;
  let epoch=0, listVersion=0, detailVersion=0, page=0, saving=false, initialized=false;
  const active = row => row.expires_at>Date.now();
  const writable = () => Boolean(context?.granted_scopes.includes('cases:write'));
  const note = (id,value) => {$(id).textContent=value;};
  const route = (path='',method='GET',body) => request('/v1/atlas/reports'+path,method,body);
  function controls(){
    for(const kind of Object.keys(labels))$('report-save-'+kind).disabled=!writable()||!candidates[kind]||saving;
    for(const control of $('report-form').elements)control.disabled=!writable()||saving;
    $('report-submit').disabled=!draft||!writable()||saving;
  }
  function clearDraft(){draft=null;pending=null;$('report-form').reset();$('report-form').hidden=true;note('report-preview','');controls();}
  function setCandidate(kind,report){
    candidates[kind]=report;
    if(draft?.kind===kind&&draft.report.report_sha256!==report?.report_sha256){clearDraft();note('report-save-status','The calculation changed. Choose a current result to save.');}
    controls();
  }
  async function setWindowCandidate(report,source,origin='live'){
    const run=epoch,version=(windowVersions.get(origin)||0)+1;windowVersions.set(origin,version);windowCandidates.delete(origin);
    const choose=()=>setCandidate('window_comparison',[...windowCandidates.values()].sort((a,b)=>b.sequence-a.sequence)[0]?.report||null);choose();if(!report)return;
    try{const wrapped=await retainWindowComparison(report,windowParametersFromComparison(report,source));if(run!==epoch||version!==windowVersions.get(origin))return;windowCandidates.set(origin,{sequence:++windowSequence,report:wrapped});choose();}
    catch(error){if(run===epoch&&version===windowVersions.get(origin))note('report-save-status',`Window comparison cannot be saved: ${message(error)}.`);}
  }
  function begin(kind){
    if(!writable()||!candidates[kind]||saving)return;
    clearDraft();draft={kind,report:candidates[kind]};$('report-form').hidden=false;
    $('report-title').value=`${draft.report.asset} · ${kind==='motifs'?patternLabels[draft.report.parameters.type]:labels[kind]}`;
    note('report-preview',`Snapshot to save: ${labels[kind]} · ${draft.report.asset} · SHA-256 ${draft.report.report_sha256}`);
    if(kind==='window_comparison'){const r=draft.report,p=r.parameters,c=r.comparison;note('report-preview',`Snapshot to save: ${labels[kind]} · ${r.asset} · ${p.timeline_report?'saved timeline '+p.timeline_report:'analysis '+p.analysis} · baseline ${c.baseline.selection.start} through ${c.baseline.selection.end_inclusive} · comparison ${c.comparison.selection.start} through ${c.comparison.selection.end_inclusive} · SHA-256 ${r.report_sha256}`);}
    note('report-save-status','The server will verify the saved source evidence and reproduce this exact calculation.');controls();$('report-title').focus();
  }
  function render(){
    rows=rows.filter(active);
    onReports(rows,initialized);
    const terms=$('report-search').value.trim().toLowerCase().split(/\s+/).filter(Boolean),kind=$('report-kind').value;
    const matches=rows.filter(row=>(kind==='all'||kind===row.kind)&&terms.every(term=>[row.title,row.purpose,row.asset,row.id,row.report_sha256,row.summary.reference||''].some(value=>value.toLowerCase().includes(term))));
    const pages=Math.max(1,Math.ceil(matches.length/10));page=Math.max(0,Math.min(page,pages-1));
    note('report-count',`${matches.length} matching reports · ${rows.length} active${retention?` · ${retention.retained}/${retention.capacity} storage slots occupied (expired reports count until purged)`:''}.`);
    note('report-page',`Page ${page+1} of ${pages}`);$('report-previous').disabled=page===0;$('report-next').disabled=page+1>=pages;
    $('report-list').replaceChildren();
    for(const row of matches.slice(page*10,page*10+10)){
      const card=el('article',undefined,'atlas-panel');card.dataset.reportId=row.id;
      card.append(el('span',labels[row.kind],'atlas-record-badge'),el('span',row.asset,'atlas-record-badge'),el('h3',row.title),el('p',summary(row)),el('p',`Saved ${date(row.created_at)} · expires ${date(row.expires_at)}`,'atlas-record-meta'));
      const reviews=(context?.records||[]).filter(record=>record.kind==='review'&&record.subject===row.review_subject&&active(record));
      card.append(el('p',`${reviews.length} active review(s) · ${reviews.filter(record=>['reviewed','resolved'].includes(record.status)).length} completed. Review decisions are separate from this immutable calculation.`,'atlas-note'));
      const actions=el('div',undefined,'atlas-actions'),open=el('button','Inspect report'),exportButton=el('button','Export JSON');
      open.onclick=()=>inspect(row);exportButton.onclick=()=>exportReport(row,exportButton);actions.append(open,exportButton);
      if(writable()){
        const review=el('button','Review report'),remove=el('button','Delete report');review.onclick=()=>{if(active(row))startReview(row);else expire();};
        remove.onclick=async()=>{
          if(remove.dataset.confirm!=='yes'){remove.dataset.confirm='yes';remove.textContent='Confirm deletion';return;}
          const run=epoch;remove.disabled=true;
          try{await route('/'+row.id,'DELETE',{payload_sha256:row.payload_sha256});if(run!==epoch)return;listVersion++;rows=rows.filter(value=>value.id!==row.id);clearDetail();if(retention)retention.retained--;render();note('report-list-status','Report deleted. Audit, separate reviews and investigation attachment identities remain.');}
          catch(error){if(run===epoch){note('report-list-status',message(error));remove.disabled=false;}}
        };actions.append(review,remove);
      }
      card.append(actions);$('report-list').append(card);
    }
    if(!matches.length)$('report-list').append(el('p','No active saved reports match these filters.'));
  }
  function clearDetail(){detailVersion++;detail=null;void setWindowCandidate(null,null,'saved');$('report-detail').replaceChildren();$('report-detail').hidden=true;}
  function showDetail(value){
    detail=value;const box=$('report-detail');box.hidden=false;box.replaceChildren();
    const close=el('button','Close report');close.onclick=clearDetail;
    box.append(close,el('h3',value.title),el('p',summary(value)),el('p','Integrity verified against the stored payload and calculation digests.'),el('p',`Expires ${date(value.expires_at)} · ${value.payload_bytes.toLocaleString('en-US')} UTF-8 bytes`,'atlas-record-meta'));
    for(const [label,key]of [['Purpose','purpose'],['Lawful basis','lawful_basis'],['Source rights','source_licence'],['Report SHA-256','report_sha256'],['Payload SHA-256','payload_sha256'],['Review subject','review_subject']])box.append(el('p',`${label}: ${value[key]}`,'atlas-record-meta'));
    box.append(el('p','This is a retained calculation over the stated source sample. It does not refresh chain history or imply a review decision.'));
    const provenance=value.kind==='window_comparison'?value.report.comparison.provenance:value.kind==='comparison'?{baseline:value.report.baseline,current:value.report.current}:value.report.provenance;
    const source=el('details');source.append(el('summary','Parameters and source coverage'),el('pre',JSON.stringify({parameters:value.parameters,provenance},null,2)));box.append(source);
    if(value.kind==='timeline'){const viewer=el('div');viewer.dataset.savedTimeline='';box.append(viewer);mountAtlasTimeline(viewer,null,()=>{},{readOnly:true,onWindowComparison:report=>setWindowCandidate(report,{timeline_report:value.id},'saved')}).showReport(value.report);}
    if(value.kind==='window_comparison'){const viewer=el('div');viewer.dataset.savedWindows='';box.append(viewer);mountTimelineComparison(viewer,()=>{},{readOnly:true}).showReport(value.report.comparison);}
    if(value.kind==='motifs'){const viewer=el('div');viewer.dataset.savedMotifs='';box.append(viewer);mountAtlasMotifs(viewer,null,()=>{},{readOnly:true}).showReport(value.report);}
    if(value.kind==='paths'){const viewer=el('div');viewer.dataset.savedPaths='';box.append(viewer);mountAtlasPaths(viewer,null,()=>{},{readOnly:true}).showReport(value.report);}
    if(value.kind==='comparison'){const viewer=el('div');viewer.dataset.savedComparison='';box.append(viewer);mountAtlasComparison(viewer).showReport(value.report);}
    const report=el('details');report.append(el('summary','Complete saved calculation'));
    report.addEventListener('toggle',()=>{if(report.open&&report.childElementCount===1)report.append(el('pre',JSON.stringify(value.report,null,2)));});box.append(report);
  }
  async function inspect(row){
    clearDetail();const version=detailVersion,run=epoch;note('report-list-status','Verifying the complete saved report…');
    try{const value=await route('/'+row.id);if(run!==epoch||version!==detailVersion)return;if(!active(value)){expire();return;}showDetail(value);note('report-list-status','Saved report verified.');}
    catch(error){if(run===epoch&&version===detailVersion)note('report-list-status',message(error));}
  }
  async function exportReport(row,button){
    const run=epoch;button.disabled=true;
    try{const value=await route('/'+row.id+'/export');if(run!==epoch)return;if(!active(value)){expire();return;}
      const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),link=el('a');link.href=url;link.download=`atlas-report-${row.id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);note('report-list-status','Verified report exported.');
    }catch(error){if(run===epoch)note('report-list-status',message(error));}finally{if(run===epoch)button.disabled=false;}
  }
  async function load(){
    if(!context)return;const run=epoch,version=++listVersion;note('report-list-status','Loading saved reports…');
    try{const result=await route();if(run!==epoch||version!==listVersion)return;rows=result.reports;retention=result.retention;initialized=true;if(detail&&!rows.some(row=>row.id===detail.id))clearDetail();render();note('report-list-status',retention.expired?`${retention.expired} expired report(s) await administrator purge.`:'Library refreshed.');}
    catch(error){if(run===epoch&&version===listVersion){render();note('report-list-status',`Refresh failed: ${message(error)}. Previously loaded unexpired reports remain visible.`);}}
  }
  function expire(){
    if(!context)return;if(detail&&!active(detail)){clearDetail();note('report-list-status','The displayed report expired and was cleared.');}render();
  }
  $('report-form').onsubmit=async event=>{
    event.preventDefault();if(!draft||saving||!writable())return;
    const current=draft,run=epoch,r=current.report;
    const body={kind:current.kind,title:$('report-title').value,purpose:$('report-purpose').value,lawful_basis:$('report-basis').value,source_licence:$('report-licence').value,retention_days:Number($('report-retention').value),parameters:current.kind==='window_comparison'?r.parameters:current.kind==='comparison'?{baseline:r.baseline.id,current:r.current.id,reference:r.reference}:{analysis:r.provenance.analysis_id,...r.parameters},expected_report_sha256:r.report_sha256};
    const signature=JSON.stringify(body);if(pending?.signature!==signature)pending={signature,request_id:crypto.randomUUID()};body.request_id=pending.request_id;saving=true;controls();note('report-save-status','Verifying and saving the complete calculation…');
    try{const saved=await route('','POST',body);if(run!==epoch)return;listVersion++;if(current===draft)clearDraft();rows=[saved,...rows.filter(row=>row.id!==saved.id)];render();note('report-save-status',`Report saved: ${saved.title}${saved.duplicate?' (existing request recovered)':''}.`);await load();}
    catch(error){if(run===epoch)note('report-save-status',`Save not confirmed: ${message(error)}. Retrying the same draft reuses its request ID.`);}
    finally{if(run===epoch){saving=false;controls();}}
  };
  $('report-cancel').onclick=clearDraft;
  for(const kind of Object.keys(labels))$('report-save-'+kind).onclick=()=>begin(kind);
  for(const id of ['report-search','report-kind'])$(id).addEventListener(id==='report-search'?'input':'change',()=>{page=0;render();});
  $('report-previous').onclick=()=>{page--;render();};$('report-next').onclick=()=>{page++;render();};$('report-refresh').onclick=load;
  controls();
  return {setCandidate,setWindowCandidate,load,expire,async open(id){await inspect({id});if(detail?.id===id)$('report-detail').scrollIntoView({block:'start'});},sync(value){context=value;controls();render();},reset(){epoch++;listVersion++;windowCandidates.clear();windowVersions.clear();clearDetail();context=null;rows=[];retention=null;initialized=false;candidates=Object.fromEntries(Object.keys(labels).map(kind=>[kind,null]));saving=false;page=0;clearDraft();$('report-search').value='';$('report-kind').value='all';$('report-list').replaceChildren();for(const id of ['report-count','report-page','report-save-status','report-list-status'])note(id,'');}};
}
