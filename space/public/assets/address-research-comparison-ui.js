const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n;};
export function renderCaptureComparison(host,comparison){
  const section=el('section',null,'address-research ar-capture-comparison');section.dataset.captureComparison=comparison.scope.asset;
  section.append(el('p','CAPTURE COMPARISON','ar-kicker'),el('h3',comparison.scope.asset+' · What changed in the observations'),el('p',comparison.coverage,'ar-note'));
  const table=el('table'),head=el('tr');for(const label of ['Module','Previous capture','Current capture'])head.append(el('th',label));table.append(head);
  for(const row of comparison.availability){const tr=el('tr');for(const value of [row.module.replaceAll('_',' '),row.before,row.after])tr.append(el('td',value));table.append(tr);}const wrap=el('div',null,'ar-table-wrap');wrap.append(table);section.append(wrap);
  const balance=comparison.balance;
  if(balance.status==='available')section.append(el('p','Exact balance difference: '+balance.delta_base_units+' '+balance.after.unit,'ar-exact'),el('p',`${balance.before.base_units} → ${balance.after.base_units}. Each balance keeps its own source anchor in the download.`,'ar-note'));
  else section.append(el('p',balance.reason,'ar-unavailable'));
  const graph=comparison.graph;
  if(graph.status==='available'){
    section.append(el('p',`${graph.only_after.length} records only in the current capture · ${graph.only_before.length} only in the previous · ${graph.changed.length} changed records · ${graph.unchanged} unchanged.`));
    const controls=el('div',null,'ar-evidence-pagination'),select=el('select'),label=el('label','Inspect '),list=el('div'),previous=el('button','Previous'),next=el('button','Next'),position=el('span');let page=0;
    select.setAttribute('aria-label','Compared records');for(const [value,text]of [['only_after','Only in current capture'],['only_before','Only in previous capture'],['changed','Changed source records']]){const option=el('option',text);option.value=value;select.append(option);}label.append(select);previous.type=next.type='button';controls.append(label,previous,position,next);section.append(controls,list);
    function render(){const rows=graph[select.value],slice=rows.slice(page*20,page*20+20);list.replaceChildren();for(const row of slice){const details=el('details'),record=row.after||row;details.append(el('summary',record.kind+' · '+record.amount_base_units+' base units · '+record.transaction),el('pre',JSON.stringify(row,null,2)));list.append(details);}position.textContent=rows.length?`${page*20+1}–${page*20+slice.length} of ${rows.length}`:'No records in this category';previous.disabled=page===0;next.disabled=(page+1)*20>=rows.length;}
    select.onchange=()=>{page=0;render();};previous.onclick=()=>{page--;render();};next.onclick=()=>{page++;render();};render();
  }else section.append(el('p',graph.reason,'ar-unavailable'));
  const details=el('details');details.append(el('summary','Capture times and integrity'),el('p','Previous: '+comparison.before.retrieved_at),el('code',comparison.before.report_sha256,'ar-digest'),el('p','Current: '+comparison.after.retrieved_at),el('code',comparison.after.report_sha256,'ar-digest'),el('p','Comparison SHA-256'),el('code',comparison.comparison_sha256,'ar-digest'));section.append(details);
  if(comparison.before.imported_from)details.append(el('p','Imported container: '+comparison.before.imported_from.version),el('code',comparison.before.imported_from.sha256,'ar-digest'),el('p','Locally supplied bytes; source authenticity has not been verified.','ar-note'));
  const download=el('button','Download comparison JSON','ar-button');download.type='button';download.dataset.comparisonExport='';download.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(comparison,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download=`address-capture-comparison-${comparison.scope.asset}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};section.append(download);host.replaceChildren(section);
}
