const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const labels={shared:'Unchanged',changed:'Changed',only_baseline:'Only in baseline',only_current:'Only in current'};
const fields=['from','to','kind','amount_base_units','txid','position','block_number','block_hash','block_time'];
const signed=value=>BigInt(value)>0n?'+'+value:String(value);
// CSV quoting does not prevent spreadsheet formula evaluation.
const csv=value=>'"'+String(value??'').replace(/^[\s]*[=+@-]/,match=>"'"+match).replaceAll('"','""')+'"';
const download=(name,value,type)=>{const url=URL.createObjectURL(new Blob([value],{type})),link=el('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};

export function comparisonEventRows(report,{category='all',search='',reference=''}={}){
  const terms=search.trim().toLowerCase().split(/\s+/).filter(Boolean),focus=reference.trim();
  return report.events.filter(row=>(category==='all'||row.status===category)
    &&(!focus||['baseline','current'].some(side=>row[side]?.from===focus||row[side]?.to===focus))
    &&terms.every(term=>[row.event_id,...Object.values(row.baseline||{}),...Object.values(row.current||{})].some(value=>String(value).toLowerCase().includes(term))));
}
export function comparisonEventCsv(report,filters={}){
  const headers=['report_sha256','baseline_id','current_id','asset','reference','view_reference','view_category','view_search','event_id','status','changed_fields',...['baseline','current'].flatMap(side=>fields.map(field=>side+'_'+field))];
  const rows=comparisonEventRows(report,filters).map(row=>[report.report_sha256,report.baseline.id,report.current.id,report.asset,report.reference,filters.reference?.trim()||'',filters.category||'all',filters.search?.trim()||'',row.event_id,row.status,row.changed_fields.join('|'),...['baseline','current'].flatMap(side=>fields.map(field=>row[side]?.[field]))]);
  return [headers,...rows].map(row=>row.map(csv).join(',')).join('\r\n');
}
function table(headers,rows,changed=[]){
  const box=el('div',undefined,'atlas-compare-table'),grid=el('table'),head=el('thead'),tr=el('tr'),body=el('tbody');
  for(const header of headers){const cell=el('th',header);cell.scope='col';tr.append(cell);}head.append(tr);
  rows.forEach((values,index)=>{const row=el('tr');if(changed[index])row.classList.add('atlas-compare-changed');values.forEach((value,i)=>{const cell=el('td');cell.dataset.label=headers[i];cell.append(value instanceof Node?value:String(value??'Not recorded'));if(changed[index]&&i===0)cell.append(el('span','Changed','atlas-record-badge'));row.append(cell);});body.append(row);});
  grid.append(head,body);box.append(grid);return box;
}

export function mountAtlasComparison(root,{onReference=null,legacyIds=false}={}){
  root.classList.add('atlas-comparison-view');
  root.innerHTML=`<div data-compare="result" hidden></div><div data-compare="browser" hidden>
    <h3>Event differences</h3><p data-compare="view-note" class="atlas-note">View filters select retained events only. Original totals and reference counts stay unchanged; no new calculation or collection is started.</p>
    <div class="atlas-controls"><label>Event category<select data-compare="category"><option value="all">All events</option><option value="changed">Changed</option><option value="only_baseline">Only in baseline</option><option value="only_current">Only in current</option><option value="shared">Unchanged</option></select></label><label>Search event fields<input data-compare="search" type="search" maxlength="200" placeholder="Event ID, reference, transaction or block"></label><label class="atlas-wide">Filter events by exact reference<input data-compare="event-reference" maxlength="200" placeholder="Exact ID from either retained side"></label></div>
    <div class="atlas-actions"><button data-compare="clear-event-reference">Clear reference filter</button></div><p>Expand an event to inspect its retained fields side by side. CSV includes every matching event across pages; JSON includes the complete original comparison. Import CSV amount columns as text to preserve large integers.</p>
    <div data-compare="ledger"></div><div class="atlas-actions"><button data-compare="previous">Previous events</button><span data-compare="page" role="status"></span><button data-compare="next">Next events</button><button data-compare="csv" disabled>Export matching events CSV</button></div>
    <details class="atlas-compare-reference-list"><summary>Reference presence and neighborhood differences</summary><div class="atlas-controls"><label class="atlas-wide">Find a reference<input data-compare="reference-search" type="search" maxlength="200"></label></div><p>Original comparison counts: distinct direct neighbors exclude self; a self event counts once. B = baseline, C = current. Filtering events does not recalculate these counts.</p><div data-compare="references"></div><div class="atlas-actions"><button data-compare="reference-previous">Previous references</button><span data-compare="reference-page" role="status"></span><button data-compare="reference-next">Next references</button></div></details>
    </div><div class="atlas-actions"><button data-compare="json" disabled>Export complete comparison JSON</button></div>`;
  const $=name=>root.querySelector(`[data-compare="${name}"]`);
  if(legacyIds)for(const node of root.querySelectorAll('[data-compare]'))node.id='compare-'+node.dataset.compare;
  let report=null,page=0,referencePage=0;
  const filters=()=>({category:$('category').value,search:$('search').value,reference:$('event-reference').value});
  function ledger(){
    if(!report)return;const rows=comparisonEventRows(report,filters()),pages=Math.max(1,Math.ceil(rows.length/20));page=Math.min(page,pages-1);$('ledger').replaceChildren();
    for(const row of rows.slice(page*20,page*20+20)){
      const details=el('details',undefined,'atlas-compare-event'),summary=el('summary');summary.append(el('span',labels[row.status],'atlas-record-badge'),el('code',row.event_id));details.append(summary);
      details.addEventListener('toggle',()=>{if(!details.open||details.childElementCount>1)return;
        details.append(el('p',row.changed_fields.length?'Changed fields: '+row.changed_fields.join(', '):row.status==='shared'?'All retained event fields match.':'This source event ID is observed on one side only.'));
        const value=(side,field)=>!row[side]?'Event not observed':row[side][field]??'Not recorded';
        details.append(table(['Retained field','Baseline','Current'],fields.map(field=>[field,value('baseline',field),value('current',field)]),fields.map(field=>row.changed_fields.includes(field))));
      });$('ledger').append(details);
    }
    if(!rows.length)$('ledger').append(el('p','No retained events match these view filters.'));
    $('page').textContent=`${rows.length} matching events · page ${page+1} of ${pages}`;$('previous').disabled=page===0;$('next').disabled=page+1>=pages;$('csv').disabled=!rows.length;
    $('clear-event-reference').disabled=!$('event-reference').value;
  }
  function referenceRows(){
    if(!report)return;const query=$('reference-search').value.trim().toLowerCase(),rows=report.references.filter(row=>row.id.toLowerCase().includes(query)),pages=Math.max(1,Math.ceil(rows.length/20));referencePage=Math.min(referencePage,pages-1);
    $('references').replaceChildren(table(['Reference','Presence','Records B → C (Δ)','Neighbors B → C (Δ)','Inspect'],rows.slice(referencePage*20,referencePage*20+20).map(row=>{
      const actions=el('div',undefined,'atlas-actions'),filter=el('button','Show related events');filter.onclick=()=>{$('event-reference').value=row.id;page=0;ledger();$('event-reference').focus();};actions.append(filter);
      if(onReference){const focus=el('button','Focus reference');focus.onclick=()=>onReference(row.id);actions.append(focus);}
      return [row.id,row.presence==='both'?'Both samples':labels[row.presence],`${row.records.baseline} → ${row.records.current} (${signed(row.records.delta)})`,`${row.neighbors.baseline} → ${row.neighbors.current} (${signed(row.neighbors.delta)})`,actions];
    })));
    $('reference-page').textContent=`${rows.length} references · page ${referencePage+1} of ${pages}`;$('reference-previous').disabled=referencePage===0;$('reference-next').disabled=referencePage+1>=pages;
  }
  function reset(){
    report=null;page=0;referencePage=0;$('result').hidden=true;$('browser').hidden=true;$('json').disabled=true;$('csv').disabled=true;
    for(const name of ['result','ledger','references','page','reference-page'])$(name).replaceChildren();
    for(const name of ['search','event-reference','reference-search'])$(name).value='';$('category').value='all';
  }
  function showReport(value){
    reset();report=value;const box=$('result');box.hidden=false;
    const metrics=el('div',undefined,'atlas-summary');for(const [key,value]of Object.entries(report.counts)){const card=el('div');card.append(el('strong',String(value)),el('span',labels[key]));metrics.append(card);}
    box.append(el('h3','Original comparison'),metrics,el('p',report.reference?'Original scope: '+report.reference:'Original scope: all retained events in the two samples.'),el('p',`Across the complete samples: ${report.blocks.overlapping_heights} overlapping observed block heights · ${report.blocks.conflicts.length} conflicting hashes. Event counts use exact source event IDs.`));
    if(report.blocks.conflicts.length){const detail=el('details');detail.append(el('summary','Inspect block hash disagreements'),table(['Height','Baseline hash','Current hash'],report.blocks.conflicts.map(row=>[row.height,row.baseline_hash,row.current_hash])));box.append(detail);}
    box.append(el('h3','Original amounts by kind and direction'),el('p','Exact base units. Delta = current − baseline. Input and output records remain separate; these totals are not net transfer volume.'),table(['Kind / direction','Records B → C','Baseline amount','Current amount','Amount Δ'],report.amounts.map(row=>[`${row.kind} / ${row.direction}`,`${row.records.baseline} → ${row.records.current}`,row.amount_base_units.baseline,row.amount_base_units.current,signed(row.amount_base_units.delta)])));
    const provenance=el('details');provenance.append(el('summary','Source coverage, dataset hashes and interpretation'));
    for(const side of ['baseline','current']){const run=report[side];provenance.append(el('h3',`${side==='baseline'?'Baseline':'Current'} · ${new Date(run.created_at).toLocaleString()}`),el('pre',JSON.stringify(run,null,2)));if(onReference){const link=el('a','Inspect retained analysis ↗');link.href='/portal/?'+new URLSearchParams({view:'analyses',analysis:run.id,...(report.reference?{node:report.reference}:{})});provenance.append(link);}}
    for(const note of report.notes)provenance.append(el('p',note));provenance.append(el('p',`Report SHA-256: ${report.report_sha256}`,'atlas-record-meta'));box.append(provenance);
    $('browser').hidden=false;$('json').disabled=false;ledger();referenceRows();
  }
  for(const name of ['category','search','event-reference'])$(name).addEventListener(name==='category'?'change':'input',()=>{page=0;ledger();});
  $('clear-event-reference').onclick=()=>{$('event-reference').value='';page=0;ledger();};$('previous').onclick=()=>{page--;ledger();};$('next').onclick=()=>{page++;ledger();};
  $('reference-search').oninput=()=>{referencePage=0;referenceRows();};$('reference-previous').onclick=()=>{referencePage--;referenceRows();};$('reference-next').onclick=()=>{referencePage++;referenceRows();};
  $('json').onclick=()=>{if(report)download(`atlas-comparison-${report.report_sha256.slice(0,12)}.json`,JSON.stringify(report,null,2),'application/json');};
  $('csv').onclick=()=>{if(report)download('atlas-comparison-matching-events.csv',comparisonEventCsv(report,filters()),'text/csv;charset=utf-8');};
  reset();return {showReport,reset};
}
