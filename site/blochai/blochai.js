const $=id=>document.getElementById(id);
const state={organization:null,ready:false,task:null,version:0,timer:null,polls:0,busy:false,controllers:new Set(),refreshing:false};
const messages={authentication_required:'Your session expired. Sign in to continue.',browser_session_required:'Sign in with your portal account to use BlochAI.',role_required:'Your organization role allows viewing only. An analyst or administrator can submit prompts.',portal_unavailable:'The private portal is temporarily unavailable. Try again later.',blochai_backend_not_configured:'The inference service has not been connected yet.',blochai_backend_unavailable:'The inference service is unavailable. Refresh compute status before trying again.',blochai_invalid_response:'The inference service returned an incomplete response. Try again later.',blochai_task_not_found:'This request is no longer available in the active organization.',blochai_capacity_reached:'The inference queue is full. Wait before submitting another request.',rate_limit:'The organization request limit was reached. Wait before trying again.',body_too_large:'This prompt uses too many bytes. Shorten it and try again.'};
const message=text=>{$('workspace-message').textContent=text;};
function controls(){
  const canWrite=Boolean(state.organization&&state.organization.role!=='viewer'&&state.ready&&!state.busy&&!state.task);
  for(const id of ['prompt','token-limit','generate'])$(id).disabled=!canWrite;
  document.querySelectorAll('[data-prompt]').forEach(button=>button.disabled=!canWrite);
  $('refresh-fleet').disabled=!state.organization||state.refreshing;
}
function stopPolling(){clearTimeout(state.timer);state.timer=null;}
function clearResult(){stopPolling();state.task=null;state.polls=0;$('output').textContent='';$('output').hidden=true;$('response-empty').hidden=false;$('task-badge').textContent='WAITING';$('task-meta').textContent='No inference request submitted.';$('resume-task').hidden=true;$('clear-output').hidden=true;controls();}
function reset(){state.version++;for(const controller of state.controllers)controller.abort();state.controllers.clear();state.ready=false;state.busy=false;clearResult();$('prompt').value='';$('prompt-count').textContent='0 / 4,000';$('gpu-ready').textContent='—';$('workers-online').textContent='—';$('model-name').textContent='Not observed';$('fleet-observed').textContent='No live fleet observation yet. NVIDIA A16-2Q target: 2 GB VRAM and 8 GB system RAM per worker. GPU memory is not automatically pooled.';}
function access(){
  const org=state.organization;$('access-badge').textContent=org?'PRIVATE WORKSPACE':'INVITATION-ONLY';$('access-badge').classList.toggle('ready',Boolean(org));$('session-controls').hidden=!org;$('sign-in').hidden=Boolean(org);$('nav-access').textContent=org?'Open portal ↗':'Sign in ↗';$('nav-access').href='/portal/';$('organization-name').textContent=org?`${org.name} / ${org.role}`:'';
  $('access-note').hidden=Boolean(org&&org.role!=='viewer');$('access-note').querySelector('p').textContent=org?'You have view-only access. An analyst or administrator can submit prompts.':'Sign in to the portal in a new tab, then return and check your session. First access requires an invitation.';
  if(!org){$('fleet-badge').textContent='SIGN IN TO CHECK';$('fleet-badge').classList.remove('ready');$('fleet-reason').textContent='Sign in to see worker heartbeats and model readiness. Deployment targets below are planned capacity.';}controls();
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
async function refresh(){if(state.refreshing)return;state.refreshing=true;controls();try{await session();await fleet();}catch(error){if(error.name!=='AbortError'){state.ready=false;$('fleet-badge').textContent='UNAVAILABLE';$('fleet-badge').classList.remove('ready');$('gpu-ready').textContent='—';$('workers-online').textContent='—';$('fleet-reason').textContent='The latest readiness check could not be completed. Refresh to try again.';message(error.message||'Connection unavailable. Try again.');}}finally{state.refreshing=false;controls();}}
function renderTask(result){
  checkContext(result);$('task-badge').textContent=result.status;$('clear-output').hidden=false;$('response-empty').hidden=true;$('task-meta').textContent=`${result.model} · Request ${result.task_id}`;
  if(result.status==='COMPLETED'){$('output').textContent=result.output;$('output').hidden=false;state.task=null;stopPolling();$('resume-task').hidden=true;message('Inference completed. The response belongs to your active organization.');}
  else if(result.status==='FAILED'){$('output').textContent='';$('output').hidden=true;state.task=null;stopPolling();$('resume-task').hidden=true;message(result.failure_reason||'Inference could not be completed. Try a new request.');}
  else{state.task=result.task_id;$('output').textContent='Your request is being processed. Waiting for the model response…';$('output').hidden=false;message('Request accepted. Checking for completion…');}
  controls();
}
function schedule(){if(!state.task)return;if(document.hidden||state.polls>=48){$('resume-task').hidden=false;message('Automatic checks are paused. Use “Check result” to retrieve this request.');return;}state.timer=setTimeout(poll,2500);}
async function poll(){
  stopPolling();if(!state.task)return;const id=state.task,version=state.version;state.polls++;
  try{if(!await session()||!state.organization)return;const result=await api(`/v1/blochai/tasks/${encodeURIComponent(id)}`);if(!await session()||version!==state.version)return;renderTask(result);schedule();}
  catch(error){if(error.name==='AbortError')return;if(error.code==='blochai_task_not_found')clearResult();else if(state.task)$('resume-task').hidden=false;message(error.message||'Connection interrupted. Check the result again.');}
}
$('prompt').addEventListener('input',()=>{$('prompt-count').textContent=`${$('prompt').value.length.toLocaleString('en-US')} / 4,000`;});
document.querySelectorAll('[data-prompt]').forEach(button=>button.addEventListener('click',()=>{$('prompt').value=button.dataset.prompt;$('prompt').dispatchEvent(new Event('input'));$('prompt').focus();}));
$('prompt-form').addEventListener('submit',async event=>{
  event.preventDefault();if(state.busy||state.task||!state.ready)return;
  const body={prompt:$('prompt').value.trim(),max_new_tokens:Number($('token-limit').value)};
  if(!body.prompt){message('Write a prompt first.');return;}if(new TextEncoder().encode(JSON.stringify(body)).length>8192){message(messages.body_too_large);return;}
  state.busy=true;controls();message('Submitting your prompt…');const version=state.version;
  try{if(!await session()||!state.organization)return;const result=await api('/v1/blochai/tasks','POST',body);if(!await session()||version!==state.version)return;clearResult();renderTask(result);schedule();}
  catch(error){if(error.name!=='AbortError')message(error.message||'Connection interrupted. A request may have been accepted; avoid immediately resubmitting.');}finally{state.busy=false;controls();}
});
$('refresh-fleet').addEventListener('click',refresh);
$('check-session').addEventListener('click',refresh);
$('resume-task').addEventListener('click',()=>{$('resume-task').hidden=true;state.polls=0;poll();});
$('clear-output').addEventListener('click',()=>{const pending=Boolean(state.task);clearResult();message(pending?'The local view was cleared. The submitted request may still finish on the worker.':'Response cleared from this page.');});
$('sign-out').addEventListener('click',async()=>{try{await api('/auth/logout','POST',{});state.organization=null;reset();access();message('Signed out. Prompts and responses have been cleared from this page.');}catch(error){if(error.name!=='AbortError')message(error.message);}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopPolling();if(state.task)$('resume-task').hidden=false;}else refresh();});
addEventListener('pagehide',()=>{reset();state.organization=null;access();});
addEventListener('pageshow',event=>{if(event.persisted)refresh();});
refresh();
