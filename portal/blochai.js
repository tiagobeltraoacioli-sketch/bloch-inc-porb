import {PortalError,requireValue,bodyOf,authorize,budget,json,audit} from './security.js';
import {researchRoute,normalizeResearch,prepareResearch,saveResearchSnapshot,readResearchSnapshot} from './blochai-research.js';

const taskId=/^[a-zA-Z0-9_-]{1,128}$/;
const states=['PENDING','ASSIGNED','READY','COMPLETED','FAILED'];
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const unavailable=reason=>({service:'BlochAI',ready:false,model:null,backend:null,nodes:null,fleet:{target_nodes:13,target_vram_gb:2,target_ram_gb:8},reason,limits:{max_prompt_chars:4000,max_new_tokens:256}});

function configuration(env){
  if(!env.BLOCHAI_API_URL||typeof env.BLOCHAI_API_TOKEN!=='string'||env.BLOCHAI_API_TOKEN.length<32)return null;
  try{const base=new URL(env.BLOCHAI_API_URL);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)return null;return base;}catch{return null;}
}
async function upstream(env,fetcher,base,path,body){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetcher(new URL(path,base),{method:body?'POST':'GET',redirect:'manual',signal:controller.signal,headers:{authorization:`Bearer ${env.BLOCHAI_API_TOKEN}`,accept:'application/json','user-agent':'BlochAI-Portal-Gateway/1.0',...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)console.warn('blochai_upstream_http',response.status);
    if(response.status===404)throw new PortalError('blochai_task_not_found',404);
    if(response.status===429)throw new PortalError('blochai_capacity_reached',429);
    requireValue(response.ok,'blochai_backend_unavailable',503);
    requireValue(response.headers.get('content-type')?.includes('application/json')&&response.body,'blochai_invalid_response',503);
    requireValue(Number(response.headers.get('content-length')||0)<=65536,'blochai_invalid_response',503);
    const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,content='';
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;requireValue(size<=65536,'blochai_invalid_response',503);content+=decoder.decode(value,{stream:true});}content+=decoder.decode();}finally{await reader.cancel();}
    let data;try{data=JSON.parse(content);}catch{throw new PortalError('blochai_invalid_response',503);}
    requireValue(data&&typeof data==='object'&&!Array.isArray(data),'blochai_invalid_response',503);return data;
  }catch(error){console.warn('blochai_upstream_error',error instanceof PortalError?error.message:error.name);if(error instanceof PortalError)throw error;throw new PortalError('blochai_backend_unavailable',503);}finally{clearTimeout(timer);}
}
function fleet(data){
  requireValue(typeof data.ready==='boolean'&&['qwen','ollama'].includes(data.backend)&&typeof data.model==='string'&&data.model.length<=200,'blochai_invalid_response',503);
  requireValue(data.nodes&&['registered','online','ready','gpu_ready'].every(key=>integer(data.nodes[key])),'blochai_invalid_response',503);
  const {registered,online,ready,gpu_ready}=data.nodes;
  requireValue(online<=registered&&ready<=online&&gpu_ready<=ready&&(!data.ready||gpu_ready>0),'blochai_invalid_response',503);
  return {...unavailable(null),ready:data.ready,backend:data.backend,model:data.model,nodes:{registered,online,ready,gpu_ready},reason:data.ready?null:'no_ready_gpu_workers'};
}
function task(data,expectedId){
  requireValue(typeof data.task_id==='string'&&taskId.test(data.task_id)&&(!expectedId||data.task_id===expectedId)&&states.includes(data.status)&&typeof data.model==='string'&&data.model.length<=200,'blochai_invalid_response',503);
  requireValue(data.status!=='COMPLETED'||(typeof data.output==='string'&&data.output.length<=32768),'blochai_invalid_response',503);
  const timestamp=value=>typeof value==='string'&&value.length<=64&&Number.isFinite(Date.parse(value))?value:typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
  return {task_id:data.task_id,status:data.status,model:data.model,created_at:timestamp(data.created_at),completed_at:timestamp(data.completed_at),output:data.status==='COMPLETED'?data.output:null,failure_reason:data.status==='FAILED'?'Inference could not be completed. Try a new request.':null,poll_after_ms:2500};
}
export async function blochaiRoute(path,request,env,principal,fetcher){
  if(!path.startsWith('/v1/blochai/'))return null;
  requireValue(principal.type==='session','browser_session_required',403);
  const researchResponse=await researchRoute(path,request,env,principal);if(researchResponse)return researchResponse;
  const base=configuration(env),context={organization_id:principal.tenant_id};
  if(path==='/v1/blochai/status'&&request.method==='GET'){
    authorize(principal,'data:read');await budget(env,`blochai-status:${principal.tenant_id}`,30,60);
    if(!base)return json({...unavailable('backend_not_configured'),...context});
    try{return json({...fleet(await upstream(env,fetcher,base,'/v1/status')),...context});}catch{return json({...unavailable('backend_unavailable'),...context});}
  }
  const match=path.match(/^\/v1\/blochai\/tasks\/([a-zA-Z0-9_-]{1,128})$/);
  if(path==='/v1/blochai/tasks'&&request.method==='POST'){
    authorize(principal,'analyses:write');requireValue(base,'blochai_backend_not_configured',503);
    const body=await bodyOf(request);requireValue(Object.keys(body).every(key=>['prompt','max_new_tokens','research'].includes(key)),'unexpected_fields');
    requireValue(typeof body.prompt==='string'&&body.prompt.trim().length>0&&body.prompt.length<=4000,'blochai_prompt_required');
    const maxNewTokens=body.max_new_tokens??128;requireValue(Number.isInteger(maxNewTokens)&&maxNewTokens>=16&&maxNewTokens<=256,'blochai_invalid_token_limit');
    const research=body.research===undefined?null:normalizeResearch(body.research);
    requireValue(!research||body.prompt.length<=1500,'blochai_research_prompt_too_long');
    await budget(env,`blochai-submit-minute:${principal.tenant_id}`,10,60);await budget(env,`blochai-submit-day:${principal.tenant_id}`,300,86400);
    const prepared=research?await prepareResearch(body.prompt,research,fetcher):{prompt:body.prompt};
    const result=task(await upstream(env,fetcher,base,'/v1/tasks',{tenant_id:principal.tenant_id,prompt:prepared.prompt,max_new_tokens:maxNewTokens,...(prepared.observations?{observations:prepared.observations}:{})}));
    const warnings=[];
    if(prepared.guide)try{await saveResearchSnapshot(env,principal,result.task_id,prepared.guide);}catch{warnings.push('research_snapshot_not_saved');console.warn('blochai_snapshot_unavailable');}
    try{await audit(env.PORB_DB,principal,'blochai.submit',result.task_id).run();}catch{warnings.push('audit_unavailable');console.warn('blochai_audit_unavailable');}
    // Once accepted, preserve the task capability even if ancillary persistence fails.
    return json({...result,...context,...(prepared.guide?{guide:prepared.guide}:{}),...(warnings.length?{warnings}:{})},202);
  }
  if(match&&request.method==='GET'){
    authorize(principal,'analyses:read');requireValue(base,'blochai_backend_not_configured',503);await budget(env,`blochai-poll:${principal.tenant_id}`,90,60);
    const result=task(await upstream(env,fetcher,base,`/v1/tasks/${encodeURIComponent(match[1])}?tenant_id=${encodeURIComponent(principal.tenant_id)}`),match[1]);
    const guide=await readResearchSnapshot(env,principal,match[1]);return json({...result,...context,...(guide?{guide}:{})});
  }
  throw new PortalError('not_found',404);
}
