const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const date=value=>value===null?'No deadline':new Date(value).toLocaleString();
const localDate=value=>{if(value===null)return '';const d=new Date(value);return new Date(value-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const active=row=>row&&row.expires_at>Date.now();
const messages={review_assignment_conflict:'Assignment was not saved. Refresh and reopen the record: its revision, reviewer membership, deadline or history capacity may have changed.',
  record_changed_retry:'The record changed during this read. Open its history again.',record_history_invalid:'The stored history is inconsistent. No history or export is displayed.',record_unavailable:'This record expired, was deleted or is unavailable in this organization.'};
const message=error=>messages[error.message]||error.message.replaceAll('_',' ');
const download=value=>{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),link=el('a');link.href=url;link.download=`atlas-record-${value.record.id}-history.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};

export function reviewWorkspace(request,{edit,inspect,refreshContext}){
  let context=null,value=null,selected=null,history=null,page=0,historyPage=0,epoch=0,version=0,historyVersion=0,busy=false;
  const write=()=>Boolean(context?.granted_scopes.includes('cases:write'));
  const note=text=>{$('queue-status').textContent=text;};
  function clearHistory(){historyVersion++;history=null;$('record-history').hidden=true;$('history-list').replaceChildren();$('history-summary').textContent='';$('history-status').textContent='';$('history-export').disabled=true;}
  function clearSelection(){selected=null;$('queue-assignment').hidden=true;$('queue-assignment').reset();$('queue-assignment-title').textContent='';$('queue-selected-scope').textContent='';$('queue-assignee').replaceChildren();}
  function controls(){for(const control of $('queue-assignment').elements)control.disabled=!write()||busy||!active(selected);$('queue-refresh').disabled=busy||!context;}
  function choose(row){
    if(!active(row)){render();return;}selected=row;$('queue-assignment').hidden=false;$('queue-assignment-title').textContent=`Manage ${row.kind} · revision ${row.revision}`;
    $('queue-selected-scope').textContent=row.subject;$('queue-assignee').replaceChildren(new Option('Unassigned',''));
    const reviewers=[...(value?.reviewers||[])];if(row.assignee&&!reviewers.some(person=>person.id===row.assignee_id))reviewers.push(row.assignee);
    for(const person of reviewers)$('queue-assignee').append(new Option(`${person.email} · ${person.role}`,person.id));
    if(row.assignee_unavailable)$('queue-assignee').append(new Option('Previous reviewer is unavailable; choose another',row.assignee_id));
    $('queue-assignee').value=row.assignee_id||'';$('queue-priority').value=row.priority;$('queue-due').value=localDate(row.due_at);
    $('queue-due').min=localDate(row.created_at);$('queue-due').max=localDate(row.expires_at);controls();$('queue-assignment-title').scrollIntoView({block:'center'});
  }
  function render(){
    if(!value)return;
    value.items=value.items.filter(active);
    for(const row of value.items)if(row.report&&!active(row.report)){row.report=null;row.cases=[];}
    if(selected&&!value.items.some(row=>row.id===selected.id&&row.revision===selected.revision))clearSelection();
    const pending=value.items.filter(row=>row.status==='open'),overdue=row=>row.status==='open'&&row.due_at!==null&&row.due_at<=Date.now();
    $('queue-summary').textContent=`${pending.length} pending · ${pending.filter(overdue).length} overdue · ${pending.filter(row=>!row.assignee).length} need an active reviewer`;
    const query=$('queue-search').value.trim().toLowerCase(),state=$('queue-state').value,owner=$('queue-owner').value,priority=$('queue-filter-priority').value;
    const rows=value.items.filter(row=>(state==='all'||row.status===state)&&(priority==='all'||row.priority===priority)&&
      (owner==='all'||owner==='mine'&&row.assignee?.id===context.account_identity?.id||owner==='unassigned'&&!row.assignee)&&
      (!$('queue-overdue').checked||overdue(row))&&[row.subject,row.body,row.report?.title||'',row.assignee?.email||''].some(text=>text.toLowerCase().includes(query)));
    const pages=Math.max(1,Math.ceil(rows.length/5));page=Math.min(page,pages-1);$('queue-page').textContent=`${rows.length} matching reviews · page ${page+1} of ${pages}`;
    $('queue-previous').disabled=page===0;$('queue-next').disabled=page+1>=pages;$('queue-list').replaceChildren();
    for(const row of rows.slice(page*5,page*5+5)){
      const card=el('article',undefined,'atlas-panel');card.dataset.reviewId=row.id;
      card.append(el('span',row.kind,'atlas-record-badge'),el('span',row.status,'atlas-record-badge'),el('span',`${row.priority} priority`,'atlas-record-badge'),el('h3',row.report?.title||row.subject),el('p',row.body,'atlas-record-body'));
      card.append(el('p',`${row.assignee?.email|| (row.assignee_unavailable?'Reviewer no longer available':'Unassigned')} · ${date(row.due_at)}${overdue(row)?' · Overdue':''}`,overdue(row)?'atlas-expiring':'atlas-record-meta'),
        el('p',`Revision ${row.revision} · expires ${date(row.expires_at)}`,'atlas-record-meta'));
      const actions=el('div',undefined,'atlas-actions');
      if(write()){
        const manage=el('button','Assign review'),decision=el('button','Record decision');manage.onclick=()=>choose(row);decision.onclick=()=>{if(active(row))edit(row);else render();};actions.append(manage,decision);
      }
      const versions=el('button','Revision history');versions.onclick=()=>openHistory(row.id);actions.append(versions);
      if(row.report){const report=el('button','Inspect report');report.onclick=()=>{if(active(row.report))inspect(row.report.id);else render();};actions.append(report);}
      for(const investigation of row.cases){const link=el('a',`${investigation.title} · ${investigation.status} ↗`,'button secondary');link.href='/atlas.html?'+new URLSearchParams({case:investigation.id})+'#case-workspace';actions.append(link);}
      card.append(actions);$('queue-list').append(card);
    }
    if(!rows.length)$('queue-list').append(el('p','No reviews match these filters. Create a review or correction in Records & reviews.'));
    controls();
  }
  async function load(){
    if(!context)return false;const run=++version;value=null;clearSelection();$('queue-list').replaceChildren();$('queue-summary').textContent='';note('Loading review queue…');
    try{const result=await request('/v1/atlas/reviews');if(run!==version)return false;value=result;render();note(result.reviewers_truncated?'Queue refreshed. The reviewer picker shows the first 200 active reviewers.':'Queue refreshed. Priorities are set by your organization.');return true;}
    catch(error){if(run===version)note(message(error));return false;}
  }
  function renderHistory(){
    if(!history)return;
    if(history.expires_at<=Date.now()){clearHistory();$('history-status').textContent='A retained version expired. Open history again for the current retained set.';return;}
    $('record-history').hidden=false;const pages=Math.max(1,Math.ceil(history.versions.length/5));historyPage=Math.min(historyPage,pages-1);
    $('history-summary').textContent=`${history.versions.length} retained revisions · ${history.complete?'complete since creation':`${history.missing_revisions} earlier or expired revision(s) unavailable`} · current revision ${history.record.revision}`;
    $('history-page').textContent=`Page ${historyPage+1} of ${pages}`;$('history-previous').disabled=historyPage===0;$('history-next').disabled=historyPage+1>=pages;$('history-export').disabled=false;$('history-list').replaceChildren();
    const descending=[...history.versions].reverse();
    for(const item of descending.slice(historyPage*5,historyPage*5+5)){
      const row=item.record,prior=history.versions.find(version=>version.record.revision===row.revision-1)?.record;
      const changes=prior?['kind','subject','body','purpose','lawful_basis','source_licence','status','assignee_id','priority','due_at','expires_at'].filter(key=>row[key]!==prior[key]):null;
      const card=el('article',undefined,'atlas-panel');card.append(el('h4',`Revision ${row.revision} · ${row.status}`),el('p',`${date(row.updated_at)} · actor ${row.updated_by||'unknown for this migrated revision'}`,'atlas-record-meta'));
      card.append(el('p',changes?`Changed: ${changes.map(key=>key.replaceAll('_',' ')).join(', ')||'write metadata only'}`:item.origin==='migration_baseline'?'Migration baseline. Earlier revisions were not recorded.':'No immediately preceding retained revision to compare.','atlas-note'),el('p',row.body,'atlas-record-body'));
      const details=el('details');details.append(el('summary','Revision scope, assignment and declarations'),el('p',`Subject: ${row.subject}`),el('p',`Kind: ${row.kind} · reviewer ID: ${row.assignee_id||'unassigned'} · ${row.priority} priority · ${date(row.due_at)}`),el('p',`Purpose: ${row.purpose}`),el('p',`Lawful basis: ${row.lawful_basis}`),el('p',`Source rights: ${row.source_licence}`),el('p',`Version expires ${date(row.expires_at)}`));card.append(details);$('history-list').append(card);
    }
  }
  async function openHistory(id,exporting=false){
    clearHistory();const run=historyVersion;historyPage=0;$('history-status').textContent=exporting?'Reading current history for export…':'Reading revision history…';
    try{const result=await request(`/v1/atlas/records/${id}/history`);if(run!==historyVersion)return;history=result;renderHistory();if(!history)return;
      $('history-status').textContent='Retained history loaded. Actor IDs describe recorded writes; independent review is not inferred.';
      if(exporting)download(result);else $('history-heading').scrollIntoView({block:'start'});
    }catch(error){if(run===historyVersion)$('history-status').textContent=message(error);}
  }
  $('queue-assignment').onsubmit=async event=>{
    event.preventDefault();if(!write()||busy||!active(selected))return;const run=epoch,row=selected;busy=true;controls();
    const body={revision:row.revision,assignee_id:$('queue-assignee').value||null,priority:$('queue-priority').value,
      due_at:$('queue-due').value===localDate(row.due_at)?row.due_at:$('queue-due').value?new Date($('queue-due').value).getTime():null};
    try{await request(`/v1/atlas/records/${row.id}/assignment`,'POST',body);if(run!==epoch)return;clearHistory();clearSelection();
      try{const refreshed=await refreshContext();if(run===epoch)note(refreshed===false?'Assignment saved; queue refresh failed. Refresh before making another change.':'Assignment saved as a new revision. Record retention and decision state are unchanged.');}
      catch(error){if(run===epoch)note('Assignment saved; workspace refresh failed. Refresh before making another change.');}
    }catch(error){if(run===epoch)note(message(error));}finally{if(run===epoch){busy=false;controls();}}
  };
  $('queue-cancel').onclick=clearSelection;$('queue-refresh').onclick=async()=>{clearHistory();await load();};
  for(const id of ['queue-search','queue-state','queue-owner','queue-filter-priority','queue-overdue'])$(id).addEventListener(id==='queue-search'?'input':'change',()=>{page=0;render();});
  $('queue-previous').onclick=()=>{page--;render();};$('queue-next').onclick=()=>{page++;render();};
  $('history-previous').onclick=()=>{historyPage--;renderHistory();};$('history-next').onclick=()=>{historyPage++;renderHistory();};
  $('history-close').onclick=clearHistory;$('history-export').onclick=()=>{if(history)openHistory(history.record.id,true);};
  controls();return {load,openHistory,expire(){render();renderHistory();},setReports(rows,complete){if(complete&&value){for(const record of value.items)if(record.report&&!rows.some(row=>row.id===record.report.id)){record.report=null;record.cases=[];}render();}},async sync(data){
    context=data;if(!history||!data.records.some(row=>row.id===history.record.id&&row.revision===history.record.revision))clearHistory();
    const mine=$('queue-owner').querySelector('[value="mine"]');mine.disabled=!data.account_identity;if(mine.disabled&&$('queue-owner').value==='mine')$('queue-owner').value='all';return load();
  },reset(){epoch++;version++;context=null;value=null;busy=false;page=0;clearSelection();clearHistory();$('queue-list').replaceChildren();$('queue-summary').textContent='';$('queue-page').textContent='';
    $('queue-search').value='';$('queue-state').value='open';$('queue-owner').value='all';$('queue-filter-priority').value='all';$('queue-overdue').checked=false;note('');controls();}};
}
