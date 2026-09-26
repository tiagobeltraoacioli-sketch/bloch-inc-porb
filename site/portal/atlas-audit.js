const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const csv=value=>'"'+String(value??'').replace(/^[\s]*[=+@-]/,match=>"'"+match).replaceAll('"','""')+'"';
const iso=value=>new Date(value).toISOString();
const sha=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const messages={audit_snapshot_expired:'This audit snapshot expired. Load a new snapshot.',audit_snapshot_unavailable:'The snapshot marker is no longer retained. Load a new snapshot.',invalid_audit_cursor:'The snapshot does not match these filters. Load a new snapshot.',invalid_audit_window:'Choose a valid UTC range of at most 366 days.',invalid_audit_action:'Use an exact Atlas action, such as atlas.report.read.',audit_export_capacity:'The complete export exceeds 1,000 events or 2 MB. Narrow the filters and load a new snapshot.',audit_response_capacity:'This page exceeds 2 MB. Narrow the filters.',administrator_session_required:'Audit access requires a current owner or administrator session.',audit_integrity_failed:'The audit response failed its integrity check.',rate_limit:'Too many audit requests. Wait a minute before retrying.'};
const message=error=>messages[error.message]||error.message.replaceAll('_',' ');

export function auditCsv(report){
  const headers=['json_export_sha256','tenant_id','snapshot_id','snapshot_created_at','window_start','window_end','filter_action','filter_actor','filter_resource','event_id','event_time_utc','actor_id','action','resource_id'];
  const rows=report.events.map(row=>[report.audit_sha256,report.tenant.id,report.snapshot.id,iso(report.snapshot.created_at),report.window.start,report.window.end,report.query.action,report.query.actor,report.query.resource,row.id,iso(row.created_at),row.actor_id,row.action,row.resource_id]);
  return [headers,...rows].map(row=>row.map(csv).join(',')).join('\r\n');
}

export function auditWorkspace(request){
  const $=id=>document.getElementById('audit-'+id),root=document.getElementById('audit-workspace');
  let tenant=null,allowed=false,version=0,busy=false,result=null,query=null,cursors=[],page=0;
  const inputs=['start','end','action','actor','resource'];
  const currentFilters=()=>Object.fromEntries(inputs.map(name=>[name,$(name).value]).filter(([,value])=>value!=='').map(([key,value])=>[key,['start','end'].includes(key)?value+'Z':value]));
  const controls=()=>{
    for(const input of inputs)$(input).disabled=!allowed;
    $('load').disabled=!allowed||busy;$('clear').disabled=!allowed;
    $('previous').disabled=!result||busy||page===0;$('next').disabled=!result||busy||!result.pagination.has_more;
    for(const type of ['json','csv'])$(type).disabled=!result||busy;
    root.setAttribute('aria-busy',String(busy));
  };
  function clearOutput(){result=null;query=null;cursors=[];page=0;for(const id of ['list','summary','page'])$(id).replaceChildren();$('results').hidden=true;controls();}
  function invalidate(text='Filters changed. Load a new audit snapshot.') {version++;busy=false;clearOutput();$('status').textContent=text;}
  function render(){
    $('results').hidden=false;$('list').replaceChildren();
    $('summary').textContent=`UTC window: ${result.window.start} through ${result.window.end}. Snapshot opened ${iso(result.snapshot.created_at)}; navigation expires ${iso(result.snapshot.expires_at)}. Newer insertions are excluded until you load a new snapshot.`;
    for(const event of result.events){
      const card=el('article',undefined,'atlas-panel atlas-audit-event');card.dataset.auditId=event.id;
      card.append(el('span',iso(event.created_at),'atlas-record-meta'),el('h3',event.action));
      const details=el('dl');for(const [label,value]of [['Credential ID',event.actor_id],['Resource as recorded',event.resource_id??'Not recorded'],['Event ID',event.id]])details.append(el('dt',label),el('dd',value));card.append(details);
      const raw=el('details');raw.append(el('summary','Inspect recorded fields'));raw.addEventListener('toggle',()=>{if(raw.open&&raw.childElementCount===1)raw.append(el('pre',JSON.stringify(event,null,2)));});card.append(raw);$('list').append(card);
    }
    if(!result.events.length)$('list').append(el('p','No retained Atlas audit events match this snapshot and its filters.'));
    $('page').textContent=`Page ${page+1} · ${result.events.length} events on this page${result.pagination.has_more?' · more matching events':' · end of snapshot'}`;controls();
  }
  async function load(cursor=null,nextPage=0){
    if(!allowed)return;const filters=cursor?query:currentFilters(),prior=cursor?[...cursors]:[],run=++version;if(!cursor)clearOutput();busy=true;controls();$('list').replaceChildren();$('results').hidden=true;$('status').textContent='Reading organization audit events…';
    try{
      const value=await request('/v1/atlas/audit?'+new URLSearchParams({...filters,...(cursor?{cursor}:{})}));if(run!==version)return;
      if(value.snapshot.expires_at<=Date.now())throw new Error('audit_snapshot_expired');
      result=value;query=filters;page=nextPage;cursors=cursor?prior:[value.snapshot.cursor];cursors[page]=cursor||value.snapshot.cursor;
      $('status').textContent='Audit snapshot loaded. Export includes every matching event across pages, within the stated limits.';render();
    }catch(error){if(run===version){clearOutput();$('status').textContent=`Audit unavailable: ${message(error)} No previous events are displayed.`;}}
    finally{if(run===version){busy=false;controls();}}
  }
  async function exportFile(type){
    if(!allowed||!result||busy)return;expire();if(!result)return;const run=++version,selected=result;busy=true;controls();$('status').textContent='Re-reading the complete snapshot and verifying its export checksum…';
    try{
      const report=await request('/v1/atlas/audit/export?'+new URLSearchParams({...query,cursor:selected.snapshot.cursor}));if(run!==version)return;
      const {audit_sha256,...body}=report;
      if(report.tenant.id!==tenant||report.snapshot.id!==selected.snapshot.id||report.query_sha256!==selected.query_sha256||!report.complete||report.event_count!==report.events.length||await sha(JSON.stringify(body))!==audit_sha256)throw new Error('audit_integrity_failed');
      if(run!==version)return;if(report.snapshot.expires_at<=Date.now())throw new Error('audit_snapshot_expired');
      const value=type==='json'?JSON.stringify(report,null,2):auditCsv(report),url=URL.createObjectURL(new Blob([value],{type:type==='json'?'application/json':'text/csv;charset=utf-8'})),link=el('a');link.href=url;link.download=`atlas-audit-${report.snapshot.id}.${type}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      $('status').textContent=`Exported ${report.event_count} events from the complete selected snapshot. JSON payload SHA-256: ${audit_sha256}.`;
    }catch(error){if(run===version){clearOutput();$('status').textContent=`Export unavailable: ${message(error)} Load a new snapshot before retrying.`;}}
    finally{if(run===version){busy=false;controls();}}
  }
  function expire(){if(result&&result.snapshot.expires_at<=Date.now())invalidate('The audit snapshot expired and was cleared. Load a new snapshot.');}
  $('form').onsubmit=event=>{event.preventDefault();load();};
  for(const input of inputs)$(input).addEventListener('input',()=>invalidate());
  $('clear').onclick=()=>{$('form').reset();invalidate('Filters reset. Load the most recent 30 days of Atlas events.');};
  $('previous').onclick=()=>load(cursors[page-1],page-1);$('next').onclick=()=>load(result.pagination.next_cursor,page+1);
  $('json').onclick=()=>exportFile('json');$('csv').onclick=()=>exportFile('csv');
  function reset(){version++;tenant=null;allowed=false;busy=false;$('form').reset();clearOutput();$('status').textContent='';root.hidden=true;$('link').hidden=true;}
  reset();return {reset,expire,sync(context){
    const next=context?.tenant.id??null,permitted=context?.account_identity&&['owner','admin'].includes(context.account_identity.role)&&context.access_audit!==null;
    if(next!==tenant||Boolean(permitted)!==allowed){reset();tenant=next;allowed=Boolean(permitted);$('status').textContent=allowed?'Load an audit snapshot to inspect retained events. Empty dates select the latest 30 days.':'';}
    root.hidden=!allowed;$('link').hidden=!allowed;expire();controls();
  }};
}
