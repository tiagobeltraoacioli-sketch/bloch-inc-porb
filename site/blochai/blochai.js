const $=id=>document.getElementById(id);
const state={organization:null,ready:false,task:null,version:0,timer:null,polls:0,busy:false,controllers:new Set(),refreshing:false,exporting:false,exportRecord:null,submittedPrompt:null,submittedResearch:null,presets:[],presetsOrg:null,researchBusy:false};
const messages={authentication_required:'Your session expired. Sign in to continue.',browser_session_required:'Sign in with your portal account to use BlochAI.',role_required:'Your organization role allows viewing only. An analyst or administrator can submit prompts.',portal_unavailable:'The private portal is temporarily unavailable. Try again later.',blochai_backend_not_configured:'The inference service has not been connected yet.',blochai_backend_unavailable:'The inference service is unavailable. Refresh compute status before trying again.',blochai_invalid_response:'The inference service returned an incomplete response. Try again later.',blochai_task_not_found:'This request is no longer available in the active organization.',blochai_capacity_reached:'The inference queue is full. Wait before submitting another request.',rate_limit:'The organization request limit was reached. Wait before trying again.',body_too_large:'This prompt uses too many bytes. Shorten it and try again.'};
Object.assign(messages,{blochai_invalid_research:'Check the research network, public address or transaction hash, and response style.',blochai_invalid_dates:'Use a valid date range with the start on or before the end.',blochai_research_not_found:'This research preset is no longer available in your account and organization.',blochai_research_limit:'Your saved research limit was reached. Update or delete an existing preset.',blochai_research_prompt_too_long:'Research prompts can contain up to 1,500 characters. Shorten the prompt and try again.'});
const message=text=>{$('workspace-message').textContent=text;};
const promptLimit=()=>$('research-enabled').checked?1500:4000;
function promptCount(){const limit=promptLimit();$('prompt').maxLength=limit;$('prompt-count').textContent=`${$('prompt').value.length.toLocaleString('en-US')} / ${limit.toLocaleString('en-US')}`;}
function controls(){
  const canWrite=Boolean(state.organization&&state.organization.role!=='viewer'&&state.ready&&!state.busy&&!state.task);
  for(const id of ['prompt','token-limit','generate'])$(id).disabled=!canWrite;
  document.querySelectorAll('[data-prompt]').forEach(button=>button.disabled=!canWrite);
  $('refresh-fleet').disabled=!state.organization||state.refreshing;
  $('export-pdf').hidden=!state.organization||!state.exportRecord;
  $('export-pdf').disabled=state.exporting||!state.organization||!state.exportRecord;
  const canResearch=Boolean(state.organization&&state.organization.role!=='viewer'&&!state.busy&&!state.task&&!state.researchBusy);
  $('research-enabled').disabled=!state.organization||state.busy||Boolean(state.task)||state.researchBusy;
  for(const id of ['research-network','research-mode','research-kind','research-from','research-to','research-instructions','research-label','research-save'])$(id).disabled=!canResearch;
  $('research-value').disabled=!canResearch||$('research-kind').value==='network';
  $('research-preset').disabled=!state.organization||state.researchBusy||Boolean(state.task)||state.busy;
  for(const id of ['research-update','research-delete'])$(id).disabled=!canResearch||!$('research-preset').value;
  promptCount();
  document.querySelector('.composer-note').textContent=$('research-enabled').checked?'Organization-private requests · Research prompt: up to 1,500 characters · Sources have bounded coverage.':'Organization-private requests · Up to 4,000 characters · Responses may contain mistakes.';
}
function stopPolling(){clearTimeout(state.timer);state.timer=null;}
function clearResult(){stopPolling();state.exportRecord=null;state.submittedPrompt=null;state.submittedResearch=null;state.task=null;state.polls=0;$('output').textContent='';$('output').hidden=true;$('research-evidence').replaceChildren();$('research-evidence').hidden=true;$('response-empty').hidden=false;$('task-badge').textContent='WAITING';$('task-meta').textContent='No inference request submitted.';$('resume-task').hidden=true;$('clear-output').hidden=true;controls();}
function reset(){state.version++;for(const controller of state.controllers)controller.abort();state.controllers.clear();state.ready=false;state.busy=false;resetResearch();clearResult();$('prompt').value='';$('prompt-count').textContent='0 / 4,000';$('gpu-ready').textContent='—';$('workers-online').textContent='—';$('model-name').textContent='Not observed';$('fleet-observed').textContent='No live fleet observation yet. NVIDIA A16-2Q target: 2 GB VRAM and 8 GB system RAM per worker. GPU memory is not automatically pooled.';}
function access(){
  const org=state.organization;$('access-badge').textContent=org?'PRIVATE WORKSPACE':'INVITATION-ONLY';$('access-badge').classList.toggle('ready',Boolean(org));$('session-controls').hidden=!org;$('sign-in').hidden=Boolean(org);$('nav-access').textContent=org?'Open portal ↗':'Sign in ↗';$('nav-access').href='/portal/';$('organization-name').textContent=org?`${org.name} / ${org.role}`:'';
  $('access-note').hidden=Boolean(org&&org.role!=='viewer');$('access-note').querySelector('p').textContent=org?'You have view-only access. An analyst or administrator can submit prompts.':'Sign in to the portal in a new tab, then return and check your session. First access requires an invitation.';
  if(!org){$('fleet-badge').textContent='SIGN IN TO CHECK';$('fleet-badge').classList.remove('ready');$('fleet-reason').textContent='Sign in to see worker heartbeats and model readiness. Deployment targets below are planned capacity.';}controls();
}
function researchMessage(value){$('research-message').textContent=value;}
function resetResearch(){
  state.presets=[];state.presetsOrg=null;state.researchBusy=false;$('research-enabled').checked=false;$('research-fields').hidden=true;
  $('research-network').value='bitcoin';$('research-mode').value='explain';$('research-kind').value='network';
  for(const id of ['research-value','research-from','research-to','research-instructions','research-label'])$(id).value='';
  $('research-preset').replaceChildren(new Option('New research settings',''));researchMessage('Presets are private to your account and organization.');
}
function researchSettings(){
  const network=$('research-network').value,mode=$('research-mode').value,kind=$('research-kind').value,value=$('research-value').value.trim(),from=$('research-from').value,to=$('research-to').value,instructions=$('research-instructions').value.trim();
  if(kind!=='network'&&!value)throw new Error('Enter a public address or transaction hash for this research target.');
  if(from&&to&&from>to)throw new Error('The start date must be on or before the end date.');
  return {network,mode,instructions,...(kind!=='network'?{subject:{kind,value}}:{}),...(from?{from}:{}),...(to?{to}:{})};
}
function fillResearch(research){
  $('research-enabled').checked=true;$('research-fields').hidden=false;$('research-network').value=research.network||'bitcoin';$('research-mode').value=research.mode||'explain';$('research-kind').value=research.subject?.kind||'network';$('research-value').value=research.subject?.value||'';$('research-from').value=research.from||'';$('research-to').value=research.to||'';$('research-instructions').value=research.instructions||'';controls();
}
async function loadResearch(){
  if(!state.organization||state.presetsOrg===state.organization.id)return;
  const version=state.version,organizationId=state.organization.id;
  const result=await api('/v1/blochai/research');if(version!==state.version||state.organization?.id!==organizationId)return;checkContext(result);state.presets=Array.isArray(result.presets)?result.presets:[];state.presetsOrg=state.organization.id;
  $('research-preset').replaceChildren(new Option('New research settings',''),...state.presets.map(preset=>new Option(preset.label,preset.id)));controls();
}
async function saveResearch(update=false){
  if(state.researchBusy||!state.organization||state.organization.role==='viewer')return;
  const version=state.version,organizationId=state.organization.id;
  let research;try{research=researchSettings();}catch(error){researchMessage(error.message);return;}
  const label=$('research-label').value.trim(),id=update?$('research-preset').value:'';if(!label){researchMessage('Name this research preset before saving.');return;}if(update&&!id)return;
  state.researchBusy=true;controls();
  try{if(!await session()||version!==state.version||state.organization?.id!==organizationId)return;const result=await api(`/v1/blochai/research${id?`/${encodeURIComponent(id)}`:''}`,'POST',{label,research});checkContext(result);state.presetsOrg=null;await loadResearch();if(version!==state.version||state.organization?.id!==organizationId)return;$('research-preset').value=result.preset.id;researchMessage(update?'Research preset updated.':'Research preset saved to your account and organization.');}
  catch(error){if(error.name!=='AbortError')researchMessage(error.message||'This research preset could not be saved.');}finally{state.researchBusy=false;controls();}
}
async function deleteResearch(){
  const id=$('research-preset').value;if(!id||state.researchBusy||!state.organization||state.organization.role==='viewer')return;const version=state.version,organizationId=state.organization.id;state.researchBusy=true;controls();
  try{if(!await session()||version!==state.version||state.organization?.id!==organizationId)return;const result=await api(`/v1/blochai/research/${encodeURIComponent(id)}`,'DELETE');checkContext(result);state.presetsOrg=null;await loadResearch();if(version!==state.version||state.organization?.id!==organizationId)return;$('research-label').value='';researchMessage('Research preset deleted. The current draft remains on this page.');}
  catch(error){if(error.name!=='AbortError')researchMessage(error.message||'This preset could not be deleted.');}finally{state.researchBusy=false;controls();}
}
function exportFacts(guide){return [...(guide?.facts||[]).slice(0,48),...(guide?.derived_facts||[]).slice(0,4),...(guide?.insights||[]).slice(0,8).map(item=>({label:`Derived: ${item.title} (${item.status})`,value:item.text,source_ids:item.source_ids,unit:''}))];}
function renderEvidence(guide){
  const panel=$('research-evidence');panel.replaceChildren();panel.hidden=!guide;if(!guide)return;
  const heading=document.createElement('h4');heading.textContent='Sources and observed facts';panel.append(heading);
  const coverage=document.createElement('p');coverage.textContent=guide.coverage||'Limited public observations. No identity, ownership or risk conclusion is established.';panel.append(coverage);
  if(Array.isArray(guide.facts)&&guide.facts.length){const list=document.createElement('ul');for(const fact of [...guide.facts.slice(0,48),...(guide.derived_facts||[]).slice(0,4)]){const item=document.createElement('li');item.textContent=`${fact.label}: ${fact.value}${fact.unit?` ${fact.unit}`:''}${fact.source_id?` · Source: ${fact.source_id}`:''}`;list.append(item);}panel.append(list);}
  if(Array.isArray(guide.insights)&&guide.insights.length){const heading=document.createElement('h3');heading.textContent='Readings from the observed data';panel.append(heading);for(const insight of guide.insights.slice(0,8)){const title=document.createElement('h4'),paragraph=document.createElement('p');title.textContent=`${insight.title} (${insight.status})`;paragraph.textContent=`${insight.text}${insight.source_ids?.length?` Sources: ${insight.source_ids.join(', ')}.`:''}`;panel.append(title,paragraph);}}
  if(Array.isArray(guide.sources)){const list=document.createElement('ul');for(const source of guide.sources.slice(0,12)){const item=document.createElement('li');let url;try{url=new URL(source.url);}catch{}if(url?.protocol==='https:'&&!url.username&&!url.password){const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noreferrer noopener';link.textContent=source.title||source.id||'Source';item.append(link);}else item.textContent=source.title||source.id||'Source';const note=document.createElement('p');note.textContent=[source.id?`Source ID: ${source.id}`:'',source.retrieved_at?`Retrieved ${source.retrieved_at}`:'Retrieval time not recorded',source.observed_at?`Observed ${source.observed_at}`:'Observation time unknown',source.coverage].filter(Boolean).join(' · ');item.append(note);list.append(item);}panel.append(list);}
  if(guide.graph?.nodes?.length||guide.transactions?.length){const note=document.createElement('p');note.textContent=`${guide.graph?.nodes?.length||0} graph nodes · ${guide.transactions?.length||0} transaction records. Download the PDF to preserve the graph, records and sources.`;panel.append(note);}
}
async function api(path,method='GET',body){
  const version=state.version,controller=new AbortController();state.controllers.add(controller);let timedOut=false;const timer=setTimeout(()=>{timedOut=true;controller.abort();},15000);
  try{
    const response=await fetch(`/api/porb${path}`,{method,signal:controller.signal,credentials:'same-origin',cache:'no-store',headers:method==='GET'?{}:{'content-type':'application/json','x-porb-action':'1'},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();if(version!==state.version)throw new DOMException('Workspace changed','AbortError');
    if(!response.ok){if(response.status===401){state.organization=null;reset();access();}const error=new Error(messages[data.error]||'The request could not be completed. Try again.');error.code=data.error;throw error;}
    return data;
  }catch(error){if(timedOut&&version===state.version)throw new Error('The connection timed out. A submitted request may still be running.');throw error;}finally{clearTimeout(timer);state.controllers.delete(controller);}
}
async function session(){
  const result=await api('/auth/session'),org=result.authenticated?result.organization:null,changed=state.organization?.id!==org?.id||state.organization?.role!==org?.role;
  if(changed)reset();state.organization=org;access();return !changed;
}
function checkContext(result){if(result.organization_id!==state.organization?.id)throw new Error('The active organization changed. Refresh the page before continuing.');}
async function fleet(){
  if(!state.organization)return;const result=await api('/v1/blochai/status');checkContext(result);state.ready=result.ready===true;
  $('fleet-badge').textContent=state.ready?'READY FOR INFERENCE':result.nodes?'WAITING FOR WORKERS':'UNAVAILABLE';$('fleet-badge').classList.toggle('ready',state.ready);
  $('gpu-ready').textContent=result.nodes?.gpu_ready??'—';$('workers-online').textContent=result.nodes?.online??'—';$('model-name').textContent=result.model||'Not observed';
  $('fleet-reason').textContent=state.ready?'A GPU worker reports a loaded model and a recent heartbeat. Requests can be submitted.':result.reason==='backend_not_configured'?'The inference service has not been connected to this workspace yet.':result.nodes?'No GPU worker is ready to accept inference. Refresh after workers are connected.':'The inference service is not responding. Readiness could not be verified.';
  $('fleet-observed').textContent=`${result.nodes?'Fleet observed':'Availability checked'} at ${new Date().toLocaleTimeString()}. NVIDIA A16-2Q target: 2 GB VRAM and 8 GB system RAM per worker. GPU memory is not automatically pooled.`;
  $('response-empty').querySelector('p').textContent=state.ready?'Write a prompt to start an inference request.\nYour completed response will appear here.':'The workspace is waiting for available compute.\nNo inference request has been submitted.';controls();
}
async function refresh(){if(state.refreshing)return;state.refreshing=true;controls();try{await session();await fleet();try{await loadResearch();}catch(error){if(error.name!=='AbortError')researchMessage('Saved research could not be loaded. Refresh your session to try again.');}}catch(error){if(error.name!=='AbortError'){state.ready=false;$('fleet-badge').textContent='UNAVAILABLE';$('fleet-badge').classList.remove('ready');$('gpu-ready').textContent='—';$('workers-online').textContent='—';$('fleet-reason').textContent='The latest readiness check could not be completed. Refresh to try again.';message(error.message||'Connection unavailable. Try again.');}}finally{state.refreshing=false;controls();}}
function renderTask(result){
  checkContext(result);$('task-badge').textContent=result.status;$('clear-output').hidden=false;$('response-empty').hidden=true;$('task-meta').textContent=`${result.model} · Request ${result.task_id}`;
  if(result.status==='COMPLETED'){state.exportRecord=state.submittedPrompt?{organizationId:state.organization.id,question:state.submittedPrompt,answer:result.output,model:result.model,createdAt:new Date().toISOString(),sources:result.guide?.sources,facts:exportFacts(result.guide),graph:result.guide?.graph,transactions:result.guide?.transactions,coverage:result.guide?.coverage,research:result.guide?.research||state.submittedResearch}:null;renderEvidence(result.guide);$('output').textContent=result.output;$('output').hidden=false;state.task=null;stopPolling();$('resume-task').hidden=true;message('Inference completed. The response belongs to your active organization.');}
  else if(result.status==='FAILED'){$('output').textContent='';$('output').hidden=true;state.task=null;stopPolling();$('resume-task').hidden=true;message(result.failure_reason||'Inference could not be completed. Try a new request.');}
  else{state.task=result.task_id;$('output').textContent='Your request is being processed. Waiting for the model response…';$('output').hidden=false;message(result.warnings?.includes('research_snapshot_not_saved')?'Request accepted. Its public source snapshot could not be saved, but inference is still running.':'Request accepted. Checking for completion…');}
  controls();
}
function schedule(){if(!state.task)return;if(document.hidden||state.polls>=48){$('resume-task').hidden=false;message('Automatic checks are paused. Use “Check result” to retrieve this request.');return;}state.timer=setTimeout(poll,2500);}
async function poll(){
  stopPolling();if(!state.task)return;const id=state.task,version=state.version;state.polls++;
  try{if(!await session()||!state.organization)return;const result=await api(`/v1/blochai/tasks/${encodeURIComponent(id)}`);if(!await session()||version!==state.version)return;renderTask(result);schedule();}
  catch(error){if(error.name==='AbortError')return;if(error.code==='blochai_task_not_found')clearResult();else if(state.task)$('resume-task').hidden=false;message(error.message||'Connection interrupted. Check the result again.');}
}
$('prompt').addEventListener('input',promptCount);
document.querySelectorAll('[data-prompt]').forEach(button=>button.addEventListener('click',()=>{$('prompt').value=button.dataset.prompt;$('prompt').dispatchEvent(new Event('input'));$('prompt').focus();}));
$('prompt-form').addEventListener('submit',async event=>{
  event.preventDefault();if(state.busy||state.task||!state.ready)return;
  const body={prompt:$('prompt').value.trim(),max_new_tokens:Number($('token-limit').value)};
  if(body.prompt.length>promptLimit()){message(`Shorten your prompt to ${promptLimit().toLocaleString('en-US')} characters${$('research-enabled').checked?' when research is enabled':''}.`);return;}
  if($('research-enabled').checked){try{body.research=researchSettings();}catch(error){message(error.message);return;}}
  if(!body.prompt){message('Write a prompt first.');return;}if(new TextEncoder().encode(JSON.stringify(body)).length>8192){message(messages.body_too_large);return;}
  state.busy=true;controls();message('Submitting your prompt…');const version=state.version,organizationId=state.organization?.id;
  try{if(!await session()||version!==state.version||state.organization?.id!==organizationId)return;const result=await api('/v1/blochai/tasks','POST',body);if(!await session()||version!==state.version)return;clearResult();state.submittedPrompt=body.prompt;state.submittedResearch=body.research||null;renderTask(result);schedule();}
  catch(error){if(error.name!=='AbortError')message(error.message||'Connection interrupted. A request may have been accepted; avoid immediately resubmitting.');}finally{state.busy=false;controls();}
});
$('refresh-fleet').addEventListener('click',refresh);
$('research-enabled').addEventListener('change',()=>{$('research-fields').hidden=!$('research-enabled').checked;controls();});
$('research-kind').addEventListener('change',controls);
$('research-preset').addEventListener('change',()=>{const preset=state.presets.find(preset=>preset.id===$('research-preset').value);if(preset){fillResearch(preset.research);$('research-label').value=preset.label;researchMessage('Loaded saved research. Changes apply to this draft until you save.');}else{$('research-label').value='';researchMessage('This draft will be saved as a new preset.');}controls();});
$('research-save').addEventListener('click',()=>saveResearch(false));
$('research-update').addEventListener('click',()=>saveResearch(true));
$('research-delete').addEventListener('click',deleteResearch);
$('check-session').addEventListener('click',refresh);
$('resume-task').addEventListener('click',()=>{$('resume-task').hidden=true;state.polls=0;poll();});
$('clear-output').addEventListener('click',()=>{const pending=Boolean(state.task);clearResult();message(pending?'The local view was cleared. The submitted request may still finish on the worker.':'Response cleared from this page.');});
$('export-pdf').addEventListener('click',async()=>{
  if(state.exporting||!state.exportRecord||!state.organization)return;
  const record=state.exportRecord,version=state.version;state.exporting=true;controls();
  try{
    if(!await session()||!state.organization||state.exportRecord!==record)return;
    const {downloadBlochAiPdf}=await import('./pdf/blochai-pdf.js');
    await downloadBlochAiPdf({portal:'Rednblue private workspace',classification:'CONFIDENTIAL',organization:state.organization.name,model:record.model,exchanges:[record],provenance:'Private organization inference on rednblue.space. The question and response were copied from this authenticated workspace. Any public research sources are listed with their retrieval time and coverage. This export does not establish identity, ownership or a validated AML conclusion.'},{isCurrent:()=>version===state.version&&state.exportRecord===record&&state.organization?.id===record.organizationId});
    message('PDF downloaded locally. It contains organization-private content.');
  }catch(error){if(error.name!=='AbortError')message(error.message||'The PDF could not be generated.');}finally{state.exporting=false;controls();}
});
$('sign-out').addEventListener('click',async()=>{try{await api('/auth/logout','POST',{});state.organization=null;reset();access();message('Signed out. Prompts and responses have been cleared from this page.');}catch(error){if(error.name!=='AbortError')message(error.message);}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopPolling();if(state.task)$('resume-task').hidden=false;}else refresh();});
addEventListener('pagehide',()=>{reset();state.organization=null;access();});
addEventListener('pageshow',event=>{if(event.persisted)refresh();});
refresh();
