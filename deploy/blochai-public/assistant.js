import {publicPortals} from './catalog.js';

const taskId=/^[a-f0-9]{64}$/,ticketPattern=/^[a-f0-9]{64}$/,states=new Set(['PENDING','ASSIGNED','READY','COMPLETED','FAILED']);
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; frame-ancestors 'none'"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
class PublicError extends Error{constructor(code,status){super(code);this.status=status;}}
const requireValue=(condition,code,status=400)=>{if(!condition)throw new PublicError(code,status);};
const hex=bytes=>[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
const digest=async value=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));

async function readJson(response,maxBytes){
  requireValue(response.headers.get('content-type')?.split(';')[0].trim()==='application/json','invalid_json');
  requireValue(Number(response.headers.get('content-length')||0)<=maxBytes&&response.body,'invalid_body');
  const reader=response.body.getReader();let size=0,content='';const decoder=new TextDecoder();
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;requireValue(size<=maxBytes,'body_too_large',413);content+=decoder.decode(value,{stream:true});}content+=decoder.decode();}finally{await reader.cancel();}
  let data;try{data=JSON.parse(content);}catch{throw new PublicError('invalid_json',400);}
  requireValue(data&&typeof data==='object'&&!Array.isArray(data),'invalid_body');return data;
}
async function budget(db,bucket,limit,expires){
  const result=await db.prepare('INSERT INTO blochai_public_budget (bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').bind(bucket,expires,limit).first();
  requireValue(result,'public_limit_reached',429);
}
async function addressHash(request,env,day){
  const address=request.headers.get('cf-connecting-ip');requireValue(address&&address.length<=64,'client_address_unavailable',503);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.PUBLIC_BLOCHAI_IP_HASH_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${day}:${address}`)));
}
function task(data,expectedId){
  requireValue(taskId.test(data.task_id)&&(!expectedId||data.task_id===expectedId)&&states.has(data.status)&&typeof data.model==='string'&&data.model.length>0&&data.model.length<=200,'public_backend_unavailable',503);
  requireValue(data.status!=='COMPLETED'||(typeof data.output==='string'&&data.output.length<=16384),'public_backend_unavailable',503);
  return {task_id:data.task_id,status:data.status,model:data.model,output:data.status==='COMPLETED'?data.output:null,failure_reason:data.status==='FAILED'?'The explanation could not be completed. Please try later.':null,poll_after_ms:2500};
}
async function upstream(env,fetcher,path,body){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetcher(new URL(path,'https://blochai-origin.posternlabs.com'),{method:body?'POST':'GET',redirect:'manual',signal:controller.signal,headers:{authorization:`Bearer ${env.PUBLIC_BLOCHAI_API_TOKEN}`,accept:'application/json','user-agent':'BlochAI-Public-Gateway/1.0',...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(response.status===404)throw new PublicError('public_task_not_found',404);
    if(response.status===429)throw new PublicError('public_limit_reached',429);
    requireValue(response.ok,'public_backend_unavailable',503);
    try{return await readJson(response,32768);}catch{throw new PublicError('public_backend_unavailable',503);}
  }finally{clearTimeout(timer);}
}

export async function handlePublicAssistant({request,env={},fetcher=fetch,now=Date.now()}){
  try{
    const url=new URL(request.url),portal=publicPortals[url.hostname];
    requireValue(url.protocol==='https:'&&!url.port&&portal,'not_found',404);
    const match=url.pathname.match(/^\/api\/blochai\/tasks\/([a-f0-9]{64})$/),submit=url.pathname==='/api/blochai/tasks';
    requireValue(!url.search&&(submit||match),'not_found',404);
    requireValue(submit?request.method==='POST':request.method==='GET','method_not_allowed',405);
    requireValue(env.ENABLE_PUBLIC_ASSISTANT==='true','public_assistant_unavailable',503);
    const origin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site');
    requireValue(request.headers.get('x-blochai-client')==='public-v1'&&(!origin||origin===url.origin)&&(!site||site==='same-origin')&&(!submit||origin===url.origin),'same_origin_required',403);
    requireValue(env.BLOCHAI_PUBLIC_DB&&typeof env.PUBLIC_BLOCHAI_API_TOKEN==='string'&&env.PUBLIC_BLOCHAI_API_TOKEN.length>=32&&typeof env.PUBLIC_BLOCHAI_IP_HASH_KEY==='string'&&env.PUBLIC_BLOCHAI_IP_HASH_KEY.length>=32&&env.PUBLIC_BLOCHAI_API_URL==='https://blochai-origin.posternlabs.com','public_assistant_unavailable',503);
    const db=env.BLOCHAI_PUBLIC_DB,seconds=Math.floor(now/1000),minute=Math.floor(seconds/60),day=Math.floor(seconds/86400),hash=await addressHash(request,env,day);
    if(submit){
      const body=await readJson(request,512);
      requireValue(Object.keys(body).length===1&&Object.hasOwn(body,'question_id')&&typeof body.question_id==='string'&&Object.hasOwn(portal.questions,body.question_id),'approved_question_required');
      await budget(db,`submit:minute:${hash}:${minute}`,6,(minute+1)*60);
      await budget(db,`submit:day:${hash}:${day}`,20,(day+1)*86400);
      const globalLimit=Number(env.PUBLIC_BLOCHAI_DAILY_LIMIT||200);
      requireValue(Number.isSafeInteger(globalLimit)&&globalLimit>=1&&globalLimit<=1000,'public_assistant_unavailable',503);
      await budget(db,`submit:global:${day}`,globalLimit,(day+1)*86400);
      const result=task(await upstream(env,fetcher,'/public/v1/tasks',{portal:portal.id,question_id:body.question_id}));
      const ticket=hex(crypto.getRandomValues(new Uint8Array(32)));
      await db.prepare('INSERT INTO blochai_public_jobs (task_id,portal,ticket_digest,expires_at) VALUES (?,?,?,?)').bind(result.task_id,portal.id,await digest(ticket),seconds+3600).run();
      await db.batch([db.prepare('DELETE FROM blochai_public_jobs WHERE expires_at<=?').bind(seconds),db.prepare('DELETE FROM blochai_public_budget WHERE expires_at<=?').bind(seconds)]);
      return json({...result,portal:portal.id,poll_token:ticket},202);
    }
    const ticket=request.headers.get('x-blochai-ticket');requireValue(ticketPattern.test(ticket||''),'public_task_not_found',404);
    const owned=await db.prepare('SELECT task_id FROM blochai_public_jobs WHERE task_id=? AND portal=? AND ticket_digest=? AND expires_at>?').bind(match[1],portal.id,await digest(ticket),seconds).first();
    requireValue(owned,'public_task_not_found',404);
    await budget(db,`poll:minute:${hash}:${minute}`,90,(minute+1)*60);
    await db.prepare('DELETE FROM blochai_public_budget WHERE expires_at<=?').bind(seconds).run();
    return json({...task(await upstream(env,fetcher,`/public/v1/tasks/${match[1]}?portal=${portal.id}`),match[1]),portal:portal.id});
  }catch(error){return json({error:error instanceof PublicError?error.message:'public_assistant_unavailable'},error instanceof PublicError?error.status:503);}
}
