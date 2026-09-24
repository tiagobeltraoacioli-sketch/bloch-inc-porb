import {scrypt} from 'node:crypto';
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
export const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export const digest=async value=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
export const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
export class PortalError extends Error {constructor(code,status=400){super(code);this.status=status;}}
export const requireValue=(ok,code,status=400)=>{if(!ok)throw new PortalError(code,status);};
export const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store, private','pragma':'no-cache','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY',...headers}});
export async function passwordHash(password,salt,pepper){
  // OWASP's 16 MiB / p=5 scrypt profile; pepper stays outside the database.
  return new Promise((resolve,reject)=>scrypt(password+'\0'+pepper,salt,64,{N:16384,r:8,p:5,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(hex(key))));
}
export const emailOf=value=>typeof value==='string'?value.trim().toLowerCase():'';
export const validEmail=email=>email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export const validPassword=p=>typeof p==='string'&&p.length>=14&&p.length<=128;
export async function bodyOf(request){
  requireValue(request.headers.get('content-type')?.startsWith('application/json'),'json_required');
  requireValue(Number(request.headers.get('content-length')||0)<=8192&&request.body,'body_too_large',413);
  const reader=request.body.getReader(),decoder=new TextDecoder();let size=0,text='';
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;requireValue(size<=8192,'body_too_large',413);text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();}
  let body;try{body=JSON.parse(text);}catch{throw new PortalError('invalid_json');}requireValue(body&&typeof body==='object'&&!Array.isArray(body),'invalid_json');return body;
}
export const cookie=(token,request,ttl=43200)=>`${new URL(request.url).protocol==='https:'?'__Host-porb_session':'porb_dev_session'}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ttl}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
export function sessionToken(request){const name=new URL(request.url).protocol==='https:'?'__Host-porb_session':'porb_dev_session';const token=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);return /^[0-9a-f]{64}$/.test(token||'')?token:null;}
export const statement=(db,sql,...params)=>db.prepare(sql).bind(...params);
export async function budget(env,key,limit,seconds=3600){
  const now=Date.now(),slot=Math.floor(now/(seconds*1000));
  const bucket=await digest(`${env.PORB_AUTH_PEPPER}:${key}:${slot}`);
  const row=await statement(env.PORB_DB,'INSERT INTO budget(bucket,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts',bucket,(slot+2)*seconds*1000).first();
  requireValue(row.attempts<=limit,'rate_limit',429);
}
export function audit(db,principal,action,resource){return statement(db,'INSERT INTO audit(id,tenant_id,actor_id,action,resource_id,created_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),principal.tenant_id,principal.key_id||principal.id,action,resource||null,Date.now());}
export const SCOPES=['data:read','analyses:read','analyses:write','scores:read'];
export async function principalOf(request,env){
  const db=env.PORB_DB,authorization=request.headers.get('authorization');
  if(authorization!==null){
    requireValue(/^Bearer porb_[0-9a-f]{64}$/.test(authorization),'invalid_api_key',401);
    const key=await statement(db,"SELECT k.id AS key_id,k.tenant_id,k.created_by AS id,k.scopes_json,m.role,t.name AS tenant_name FROM api_keys k JOIN memberships m ON m.tenant_id=k.tenant_id AND m.user_id=k.created_by JOIN tenants t ON t.id=k.tenant_id WHERE k.key_hash=? AND k.revoked_at IS NULL AND k.expires_at>? AND m.role IN ('owner','admin')",await digest(authorization.slice(7)),Date.now()).first();
    requireValue(key,'invalid_api_key',401);return {...key,type:'key',scopes:JSON.parse(key.scopes_json)};
  }
  const token=sessionToken(request);if(!token)return null;
  const user=await statement(db,'SELECT u.id,u.email,s.tenant_id,m.role,t.name AS tenant_name FROM sessions s JOIN users u ON u.id=s.user_id JOIN memberships m ON m.user_id=s.user_id AND m.tenant_id=s.tenant_id JOIN tenants t ON t.id=s.tenant_id WHERE s.token_hash=? AND s.expires_at>?',await digest(token),Date.now()).first();
  return user?{...user,type:'session'}:null;
}
export function authorize(principal,scope){
  requireValue(principal,'authentication_required',401);
  if(principal.type==='key')requireValue(principal.scopes.includes(scope),'scope_required',403);
  else if(scope==='analyses:write')requireValue(principal.role!=='viewer','role_required',403);
}
export function admin(principal,owner=false){requireValue(principal?.type==='session'&&(owner?principal.role==='owner':['owner','admin'].includes(principal.role)),'administrator_session_required',403);}
export async function reauthenticate(env,principal,password){
  requireValue(validPassword(password),'invalid_credentials',401);
  await budget(env,`reauth:${principal.id}`,10);
  const user=await statement(env.PORB_DB,'SELECT password_hash,salt FROM users WHERE id=?',principal.id).first();
  requireValue(user&&equal(await passwordHash(password,user.salt,env.PORB_AUTH_PEPPER),user.password_hash),'invalid_credentials',401);
  return user;
}
