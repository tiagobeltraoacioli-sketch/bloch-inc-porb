const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const date=value=>new Date(value).toLocaleString();
const messages={case_closed:'Reopen this investigation before changing its report links.',case_bundle_capacity:'The complete dossier exceeds the 12 MB export limit. Export the reports individually or organize smaller investigations.',case_changed_retry:'The dossier changed during export. Refresh it and try again.',report_integrity_failed:'A report failed verification. The complete export was blocked.',case_report_digest_conflict:'A linked report no longer matches its attachment digest.',case_closed_or_report_capacity:'The investigation closed, a report became unavailable, or all 20 link slots are occupied.',rate_limit:'The request limit was reached. Wait a minute before retrying.'};
const message=error=>messages[error.message]||error.message.replaceAll('_',' ');
export function caseWorkspace(request,{initialCase=null,onSelect=()=>{},review,inspect,refreshContext}){
  let context=null,cases=[],reports=[],selected='',pending=initialCase,value=null,epoch=0,version=0,busy=false,page=0;
  const write=()=>Boolean(context?.granted_scopes.includes('cases:write'));
  const active=report=>report&&report.expires_at>Date.now();
  const note=text=>{$('dossier-status').textContent=text;};
  const route=(id,suffix='',method='GET',body)=>request('/v1/atlas/cases/'+id+suffix,method,body);
  function controls(){
    const editable=write()&&value?.case.status==='open'&&!busy;
    $('dossier-attach').disabled=!editable||!$('dossier-report').value;
    $('dossier-report').disabled=!editable;$('dossier-toggle').disabled=!write()||!value||busy;
    $('dossier-export').disabled=!value||!value.links.length||busy;$('dossier-refresh').disabled=!selected||busy;
    for(const field of $('dossier-create').elements)field.disabled=!write()||busy;
    for(const button of $('dossier-list').querySelectorAll('button'))button.disabled=busy||button.dataset.linkMutation==='1'&&value?.case.status!=='open';
  }
  function choices(){
    const old=$('dossier-report').value;$('dossier-report').replaceChildren(new Option('Select a saved report',''));
    for(const report of reports.filter(active))if(!value?.links.some(link=>link.report_id===report.id))$('dossier-report').append(new Option(`${report.asset} · ${report.title}`,report.id));
    if([...$('dossier-report').options].some(option=>option.value===old))$('dossier-report').value=old;controls();
  }
  function caseChoices(){
    $('dossier-case').replaceChildren(new Option('Select an investigation',''));
    for(const item of cases)$('dossier-case').append(new Option(`${item.status} · ${item.title}`,item.id));
    $('dossier-case').value=selected;
  }
  function clear(){value=null;page=0;$('dossier-detail').hidden=true;$('dossier-list').replaceChildren();$('dossier-title').textContent='';$('dossier-summary').textContent='';$('dossier-page').textContent='';choices();}
  function render(){
    if(!value){clear();return;}
    for(const link of value.links){if(!active(link.report)){link.report=null;link.records=[];link.availability='unavailable';}else link.records=link.records.filter(active);}
    const retained=value.links.filter(link=>link.report),records=retained.flatMap(link=>link.records),reviews=records.filter(record=>record.kind==='review');
    $('dossier-detail').hidden=false;$('dossier-title').textContent=value.case.title;$('dossier-toggle').textContent=value.case.status==='open'?'Close investigation':'Reopen investigation';
    $('dossier-summary').textContent=`${value.case.status} · ${value.links.length}/20 links · ${retained.length} retained reports · ${value.links.length-retained.length} unavailable · ${reviews.filter(record=>record.status==='open').length} open reviews · ${reviews.filter(record=>['reviewed','resolved'].includes(record.status)).length} completed reviews. ${value.case.reference_snapshots} reference snapshot(s) have a separate portal export.`;
    const query=$('dossier-search').value.trim().toLowerCase(),filter=$('dossier-kind').value,rows=value.links.filter(link=>(filter==='all'||(filter==='unavailable'?!link.report:link.report?.kind===filter))&&[link.report_id,link.report?.title||'',link.report?.asset||''].some(text=>text.toLowerCase().includes(query)));
    const pages=Math.max(1,Math.ceil(rows.length/5));page=Math.min(page,pages-1);$('dossier-page').textContent=`${rows.length} matching links · page ${page+1} of ${pages}`;$('dossier-previous').disabled=page===0;$('dossier-next').disabled=page+1>=pages;
    $('dossier-list').replaceChildren();
    for(const link of rows.slice(page*5,page*5+5)){
      const card=el('article',undefined,'atlas-panel');card.dataset.caseLink=link.id;
      card.append(el('span',link.report?link.report.kind:'unavailable','atlas-record-badge'),el('h3',link.report?.title||'Report unavailable'),el('p',`Attached ${date(link.created_at)} · report ${link.report_id}`,'atlas-record-meta'),el('p',`Attachment SHA-256: ${link.payload_sha256}`,'atlas-record-meta'));
      if(!link.report)card.append(el('p','This report expired or was deleted. Its payload, title and governance records are excluded from this dossier. The attachment identity remains until you remove the link or delete the investigation.','atlas-note'));
      else{
        card.append(el('p',`${link.report.asset} · expires ${date(link.report.expires_at)} · integrity is checked again on inspection and export.`));
        const records=el('details');records.append(el('summary',`${link.records.length} current governance record(s)`));
        for(const record of link.records){const item=el('article',undefined,'atlas-dossier-record');item.append(el('strong',`${record.kind} · ${record.status} · revision ${record.revision}`),el('p',record.body,'atlas-record-body'),el('p',`Purpose: ${record.purpose} · expires ${date(record.expires_at)}`,'atlas-record-meta'));records.append(item);}card.append(records);
      }
      const actions=el('div',undefined,'atlas-actions');
      if(link.report){const open=el('button','Inspect saved report');open.onclick=()=>inspect(link.report_id);actions.append(open);if(write()){const button=el('button','Review linked report');button.onclick=()=>{if(active(link.report))review(link.report);else render();};actions.append(button);}}
      if(write()){const remove=el('button','Remove link');remove.dataset.linkMutation='1';remove.disabled=value.case.status!=='open'||busy;remove.onclick=()=>{if(remove.dataset.confirm!=='yes'){remove.dataset.confirm='yes';remove.textContent='Confirm removal';return;}mutate(()=>route(selected,'/reports/'+link.id,'DELETE',{payload_sha256:link.payload_sha256}),'Link removed; the original report is unchanged.');};actions.append(remove);}
      card.append(actions);$('dossier-list').append(card);
    }
    if(!rows.length)$('dossier-list').append(el('p','No report links match. Select a saved report to attach it.'));
    choices();
  }
  async function load(){
    if(!context||!selected)return;const run=++version,id=selected;clear();note('Loading investigation dossier…');
    try{const result=await route(id);if(run!==version||id!==selected)return false;value=result;render();note('Dossier refreshed. Review decisions remain separate from investigation status.');return true;}
    catch(error){if(run===version)note(message(error));return false;}
  }
  function select(id,scroll=false){version++;selected=id;$('dossier-case').value=id;onSelect(id);clear();if(id)load().then(loaded=>{if(loaded&&scroll&&selected===id)$('case-workspace').scrollIntoView({block:'start'});});else note('Select an investigation to organize its Atlas reports.');}
  async function mutate(operation,success){
    if(busy||!write()||!value)return;const run=epoch,id=selected;busy=true;controls();
    try{const result=await operation();if(run!==epoch)return;if(id===selected){const loaded=await load();if(run===epoch&&id===selected)note(success+(result?.duplicate?' The existing link was reused.':'')+(loaded?'':' Dossier refresh failed; reopen it to inspect the result.'));}}
    catch(error){if(run===epoch&&id===selected)note(message(error));}finally{if(run===epoch){busy=false;controls();}}
  }
  $('dossier-case').onchange=()=>select($('dossier-case').value);$('dossier-refresh').onclick=load;$('dossier-report').onchange=controls;
  $('dossier-attach').onclick=()=>{const report=reports.find(row=>row.id===$('dossier-report').value);if(!active(report))return;const id=selected;mutate(()=>route(id,'/reports','POST',{report_id:report.id,payload_sha256:report.payload_sha256}),'Report attached with its verified digest.');};
  $('dossier-toggle').onclick=()=>{if(!value)return;const id=selected,status=value.case.status==='open'?'closed':'open';mutate(async()=>{const result=await request('/v1/cases/'+id+'/status','POST',{status});cases=cases.map(item=>item.id===id?{...item,status:result.status}:item);caseChoices();return result;},`Investigation ${status}.`);};
  $('dossier-export').onclick=async()=>{
    if(!value||busy)return;const run=epoch,id=selected;busy=true;controls();note('Verifying every retained report and building the dossier…');
    try{const bundle=await route(id,'/export');if(run!==epoch||id!==selected)return;if(bundle.expires_at!==null&&bundle.expires_at<=Date.now()){render();note('The dossier expired during download. Refresh before exporting.');return;}
      const url=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'})),link=el('a');link.href=url;link.download=`atlas-case-${id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);note(bundle.complete?'Verified dossier exported with all linked reports.':`Dossier exported with ${bundle.reports_unavailable} unavailable report(s), explicitly marked incomplete.`);
    }catch(error){if(run===epoch&&id===selected)note(message(error));}finally{if(run===epoch){busy=false;controls();}}
  };
  $('dossier-create').onsubmit=async event=>{
    event.preventDefault();if(!write()||busy)return;const run=epoch;busy=true;controls();
    try{const result=await request('/v1/cases','POST',{title:$('dossier-new-title').value});if(run!==epoch)return;$('dossier-create').reset();cases=[result,...cases];caseChoices();select(result.id);note('Investigation created.');
      try{await refreshContext();}catch(error){if(run===epoch)note('Investigation created; list refresh failed. Refresh before creating another.');}
    }catch(error){if(run===epoch)note(`Creation not confirmed: ${message(error)}. Refresh investigations before retrying.`);}finally{if(run===epoch){busy=false;controls();}}
  };
  for(const id of ['dossier-search','dossier-kind'])$(id).addEventListener(id==='dossier-search'?'input':'change',()=>{page=0;render();});
  $('dossier-previous').onclick=()=>{page--;render();};$('dossier-next').onclick=()=>{page++;render();};
  controls();return {load,expire:render,setReports(rows,complete){reports=rows;if(complete&&value){for(const link of value.links)if(link.report&&!rows.some(row=>row.id===link.report_id)){link.report=null;link.records=[];link.availability='unavailable';}render();}else choices();},sync(data){context=data;cases=data.cases;caseChoices();if(pending){const id=pending;pending=null;if(cases.some(row=>row.id===id))select(id,true);else note('The linked investigation is unavailable in this organization.');}else if(selected){if(cases.some(row=>row.id===selected))load();else select('');}controls();},reset(){epoch++;version++;context=null;cases=[];reports=[];selected='';pending=null;busy=false;clear();caseChoices();$('dossier-create').reset();$('dossier-search').value='';$('dossier-kind').value='all';note('');}};
}
