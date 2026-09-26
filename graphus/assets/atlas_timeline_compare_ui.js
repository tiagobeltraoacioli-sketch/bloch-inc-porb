import {timelineView} from './atlas_timeline.js';
import {compareTimelineWindows,timelineComparisonRows,timelineComparisonEvents,timelineComparisonCsv,TIMELINE_COMPARISON_LIMITS} from './atlas_timeline_compare.js';

const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const percent=value=>value===null?'Undefined':(value.approximation*100).toFixed(2)+'%',concentration=value=>value===null?'Undefined':value.approximation.toFixed(4),signed=value=>String(value).startsWith('-')?String(value):'+'+value;
const messages={timeline_comparison_requires_later_window:'Select a comparison window entirely after the pinned baseline; overlapping or earlier windows cannot be compared.',timeline_comparison_search_mismatch:'Use the same event search as the pinned baseline, or pin a new baseline.',timeline_comparison_requires_timed_windows:'Timed intervals are required. No dates are inferred from missing timestamps.',timeline_comparison_integrity_failed:'The original timeline failed its integrity check.',timeline_comparison_capacity:'The complete comparison exceeds its bounded capacity. Narrow the windows.'};

export function mountTimelineComparison(root){
  root.classList.add('atlas-time-compare');
  root.innerHTML=`<h3>Compare two observed windows.</h3><p>Select an earlier range in the timeline and pin it as the baseline. Then select a later range. Both windows use the same event search; graph filters do not change this comparison.</p>
    <div class="atlas-actions"><button data-window="pin" disabled>Pin selected range as baseline</button><button data-window="clear" disabled>Clear baseline</button></div>
    <div class="atlas-window-cohorts"><article><h4>Baseline · pinned</h4><p data-window="baseline"></p></article><article><h4>Comparison · selected range</h4><p data-window="current"></p></article></div>
    <p data-window="status" role="status"></p><div data-window="result" hidden>
      <p data-window="coverage" class="atlas-note"></p><div class="atlas-time-graph-controls"><label>Event group<select data-window="group"></select></label><label>Reference role<select data-window="role"><option value="source_references">Source endpoints</option><option value="destination_references">Destination endpoints</option></select></label><label>Find a reference<input data-window="search" type="search" maxlength="200"></label></div>
      <div data-window="totals" class="atlas-timeline-totals"></div><p data-window="membership" class="atlas-note"></p>
      <p class="atlas-note">Concentration (0–1) is the sum of squared reference shares: 1 means all returned events or value are at one reference. Empty counts and zero total value have undefined concentration. Source and destination roles each describe the same events; do not add them. Reference presence is limited to these samples.</p>
      <p>References are ordered by absolute returned-value difference, then event-count difference. Bars show each reference's share of returned events within its window and event group.</p>
      <div data-window="rows" class="atlas-window-rows"></div><div class="atlas-actions"><button data-window="previous">Previous references</button><span data-window="page" role="status"></span><button data-window="next">Next references</button></div>
      <div data-window="inspection" hidden><h4 data-window="reference"></h4><div data-window="events" class="atlas-timeline-ledger"></div><div class="atlas-actions"><button data-window="event-previous">Previous evidence</button><span data-window="event-page" role="status"></span><button data-window="event-next">Next evidence</button></div></div>
      <details><summary>Method, coverage and reproducibility</summary><div data-window="notes"></div><pre data-window="provenance"></pre></details>
    </div><p class="atlas-note">Pinned ranges are local to this view. Save the complete timeline to retain its underlying evidence; download comparison JSON to preserve both selected windows and their calculations.</p><div class="atlas-actions"><button data-window="json" disabled>Download complete window comparison JSON</button><button data-window="csv" disabled>Export matching references CSV</button></div>`;
  const $=name=>root.querySelector(`[data-window="${name}"]`);
  let source=null,current=null,baseline=null,comparison=null,sourceHash=null,signature=null,epoch=0,page=0,eventPage=0,reference=null;
  const filters=()=>({group:Number($('group').value||0),role:$('role').value,query:$('search').value});
  function clearResult(){comparison=null;reference=null;page=0;eventPage=0;$('result').hidden=true;$('inspection').hidden=true;$('json').disabled=true;$('csv').disabled=true;for(const name of ['group','totals','membership','rows','page','reference','events','event-page','notes','provenance','coverage'])$(name).replaceChildren();}
  const describe=selection=>{if(!source||!selection)return 'No range selected.';const view=timelineView(source,selection);return view.selection.start?`${view.selection.start} through ${view.selection.end_inclusive} · ${view.events.length} matching returned events · search: ${view.selection.event_search||'all events'}`:'No timed intervals in this report.';};
  function labels(){
    $('baseline').textContent=baseline?describe(baseline):'Select a range and pin the baseline.';$('current').textContent=describe(current);$('pin').disabled=!source?.buckets.length;$('clear').disabled=!baseline;
  }
  function inspect(){
    $('events').replaceChildren();$('inspection').hidden=!reference;if(!reference)return;
    const events=timelineComparisonEvents(comparison,{...filters(),reference}),size=TIMELINE_COMPARISON_LIMITS.events_per_page,pages=Math.max(1,Math.ceil(events.length/size));eventPage=Math.min(eventPage,pages-1);$('reference').textContent=reference;
    for(const {window,event} of events.slice(eventPage*size,(eventPage+1)*size)){const card=el('article',undefined,'atlas-panel');card.append(el('h4',`${window==='baseline'?'Baseline':'Comparison'} · ${event.event_id}`),el('p',`${event.block_time} · ${event.amount_base_units} ${comparison.unit}`));const details=el('details');details.append(el('summary','Inspect exact event'),el('pre',JSON.stringify(event,null,2)));card.append(details);$('events').append(card);}
    $('event-page').textContent=`Page ${eventPage+1} of ${pages} · ${events.length} exact events across both windows`;$('event-previous').disabled=eventPage===0;$('event-next').disabled=eventPage+1>=pages;
  }
  function renderRows(){
    if(!comparison)return;const input=filters(),rows=timelineComparisonRows(comparison,input),size=TIMELINE_COMPARISON_LIMITS.references_per_page,pages=Math.max(1,Math.ceil(rows.length/size));page=Math.min(page,pages-1);$('rows').replaceChildren();
    if(reference&&!rows.some(row=>row.reference===reference)){reference=null;eventPage=0;}
    for(const row of rows.slice(page*size,(page+1)*size)){
      const card=el('article',undefined,'atlas-panel'),button=el('button',row.reference,'atlas-window-reference');button.type='button';button.setAttribute('aria-pressed',String(row.reference===reference));button.onclick=()=>{reference=row.reference;eventPage=0;renderRows();};card.append(button,el('p',row.presence==='both'?'Observed in both windows':row.presence==='baseline_only'?'Observed in baseline only':'Observed in comparison only'));
      const sides=el('div',undefined,'atlas-window-cohorts');for(const side of ['baseline','comparison']){const data=row[side],column=el('div'),bar=el('progress');bar.max=1;bar.value=data.event_share?.approximation??0;bar.className='atlas-window-'+side;bar.setAttribute('aria-label',`${side} event share: ${percent(data.event_share)}`);column.append(el('h4',side==='baseline'?'Baseline':'Comparison'),el('p',`${data.events} events · ${percent(data.event_share)} of this group`),bar,el('p',`${data.observed_total_base_units} ${comparison.unit}`),el('p',`${percent(data.value_share)} of returned value`));sides.append(column);}card.append(sides,el('p',`Difference: ${signed(row.change.events)} returned events · ${signed(row.change.observed_total_base_units)} ${comparison.unit}`));$('rows').append(card);
    }
    if(!rows.length)$('rows').append(el('p','No references match this view. Missing activity remains unknown.'));
    $('page').textContent=`Page ${page+1} of ${pages} · ${rows.length} matching references · CSV includes all matching pages`;$('previous').disabled=page===0;$('next').disabled=page+1>=pages;inspect();
  }
  function renderGroup(){
    if(!comparison)return;const input=filters(),group=comparison.groups[input.group];$('totals').replaceChildren();$('membership').replaceChildren();
    if(group){for(const side of ['baseline','comparison']){const totals=group[side],stats=group[input.role][side],card=el('article',undefined,'atlas-panel');card.append(el('h4',side==='baseline'?'Baseline observations':'Comparison observations'),el('strong',`${totals.events} returned events`),el('p',`${totals.observed_total_base_units} ${comparison.unit}`),el('p',`${stats.references} distinct references · ${stats.positive_value_references} with positive value`),el('p',`Largest event share: ${percent(stats.largest_event_share)} · largest value share: ${percent(stats.largest_value_share)}`),el('p',`Event concentration: ${concentration(stats.event_concentration)} · value concentration: ${concentration(stats.value_concentration)}`));$('totals').append(card);}
      const members=group[input.role].membership;$('membership').textContent=`Returned difference: ${signed(group.change.events)} events · ${signed(group.change.observed_total_base_units)} ${comparison.unit}. References observed in both: ${members.both}; baseline only: ${members.baseline_only}; comparison only: ${members.comparison_only}.`;
    }renderRows();
  }
  async function calculate(){
    const run=++epoch;clearResult();labels();root.setAttribute('aria-busy','false');if(!source||!baseline){$('status').textContent=source?.buckets.length?'Pin an earlier range, then select a later comparison range.':'No timed windows are available.';return;}
    $('status').textContent='Verifying the timeline and comparing the selected windows…';root.setAttribute('aria-busy','true');
    try{
      const result=await compareTimelineWindows(source,baseline,current);if(run!==epoch)return;comparison=result;$('result').hidden=false;$('json').disabled=false;$('csv').disabled=false;
      for(const [index,group] of comparison.groups.entries())$('group').append(new Option(`${group.kind.replaceAll('_',' ')} · ${group.direction}`,index));$('group').disabled=!comparison.groups.length;
      $('coverage').textContent=`${comparison.asset} · baseline: ${comparison.baseline.buckets_with_matching_events}/${comparison.baseline.buckets} bins with matching events; comparison: ${comparison.comparison.buckets_with_matching_events}/${comparison.comparison.buckets} bins. ${comparison.equal_durations?'Equal window durations.':'Unequal window durations; totals are not rate-normalized.'} Coverage remains incomplete in both windows. No empty bin establishes inactivity.`;
      $('status').textContent=`Comparison ready: ${comparison.baseline.observed_events} baseline and ${comparison.comparison.observed_events} comparison events. The original timeline is unchanged.`;
      for(const note of comparison.notes)$('notes').append(el('p',note));$('provenance').textContent=JSON.stringify({version:comparison.version,provenance:comparison.provenance,parent_query:comparison.parent_query,parent_coverage:comparison.parent_coverage,baseline:comparison.baseline.selection,comparison:comparison.comparison.selection,comparison_sha256:comparison.comparison_sha256},null,2);renderGroup();
    }catch(error){if(run===epoch)$('status').textContent=messages[error.message]||`Comparison unavailable: ${error.message.replaceAll('_',' ')}.`;}finally{if(run===epoch)root.setAttribute('aria-busy','false');}
  }
  function reset(){epoch++;source=null;current=null;baseline=null;sourceHash=null;signature=null;$('role').value='source_references';$('search').value='';root.setAttribute('aria-busy','false');clearResult();labels();$('status').textContent='Open a timeline to compare observed windows.';}
  function setReport(report,range){
    const next=JSON.stringify([report.report_sha256,range]);if(next===signature)return;if(sourceHash!==report.report_sha256){baseline=null;$('role').value='source_references';$('search').value='';}source=report;sourceHash=report.report_sha256;current={...range};signature=next;void calculate();
  }
  $('pin').onclick=()=>{if(!source?.buckets.length)return;baseline={...current};void calculate();};$('clear').onclick=()=>{baseline=null;void calculate();};
  for(const name of ['group','role'])$(name).onchange=()=>{page=0;reference=null;eventPage=0;renderGroup();};$('search').oninput=()=>{page=0;renderRows();};
  $('previous').onclick=()=>{page--;renderRows();};$('next').onclick=()=>{page++;renderRows();};$('event-previous').onclick=()=>{eventPage--;inspect();};$('event-next').onclick=()=>{eventPage++;inspect();};
  function download(type){if(!comparison)return;const text=type==='json'?JSON.stringify(comparison,null,2):timelineComparisonCsv(comparison,filters()),url=URL.createObjectURL(new Blob([text],{type:type==='json'?'application/json':'text/csv;charset=utf-8'})),link=el('a');link.href=url;link.download=`atlas-window-comparison-${comparison.comparison_sha256.slice(0,12)}.${type}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('json').onclick=()=>download('json');$('csv').onclick=()=>download('csv');reset();return {setReport,reset};
}
