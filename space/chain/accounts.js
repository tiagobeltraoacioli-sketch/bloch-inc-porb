const COOKIE='__Host-space_session',LOCAL_COOKIE='space_dev_session',TTL=86400;
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export const digest=async value=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store, private','pragma':'no-cache','x-content-type-options':'nosniff',...headers}});
const cookie=(token,secure,age=TTL)=>`${secure?COOKIE:LOCAL_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${age}${secure?'; Secure':''}`;
const tokenOf=request=>{const name=new URL(request.url).protocol==='https:'?COOKIE:LOCAL_COOKIE;const value=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);return /^[0-9a-f]{64}$/.test(value||'')?value:null;};
export async function passwordHash(password,salt,pepper){
  // Server-side pepper is a required secret, separate from the D1 database.
  const key=await crypto.subtle.importKey('raw',encoder.encode(password+'\0'+pepper),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-512'},key,512));
}
export function equalHash(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
export function validCredentials(body){return typeof body?.email==='string'&&body.email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)&&typeof body.password==='string'&&body.password.length>=14&&body.password.length<=128;}
async function bodyOf(request){
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new Error('invalid_body');
  if(Number(request.headers.get('content-length')||0)>8192)throw new Error('invalid_body');
  if(!request.body)throw new Error('invalid_body');
  const reader=request.body.getReader();let size=0,text='';const decoder=new TextDecoder();
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192)throw new Error('invalid_body');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();}
  return JSON.parse(text);
}
export function validWorkspace(value){return value&&['bitcoin','ethereum','bloch'].includes(value.network)&&['overview','science','ml','graphus','analytics','compare'].includes(value.view)&&['10','30','12','48','6h','24h','7d'].includes(value.range);}
async function currentUser(request,db){const token=tokenOf(request);if(!token)return null;return db.prepare('SELECT a.id,a.email FROM space_accounts a JOIN space_sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(token),Date.now()).first();}
async function budget(request,env){
  const now=Date.now(),hour=Math.floor(now/3600000),ip=request.headers.get('CF-Connecting-IP')||'local';
  const key=await digest(`${env.SPACE_AUTH_PEPPER}:${hour}:${ip}`);
  const row=await env.SPACE_DB.prepare('INSERT INTO space_auth_budget(bucket,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(key,(hour+2)*3600000).first();
  return row.attempts<=20;
}
export async function handleAccount({request,env,waitUntil}){
  const url=new URL(request.url),path=url.pathname,secure=url.protocol==='https:',db=env.SPACE_DB;
  if(path==='/api/account/config'&&request.method==='GET')return json({enabled:Boolean(db&&env.SPACE_AUTH_PEPPER),method:'email-password',live_scores:false,preview:'authenticated-synthetic',email_verified:false});
  if(!db||!env.SPACE_AUTH_PEPPER)return json({error:'account_service_unavailable'},503);
  if(!['GET','POST','DELETE'].includes(request.method))return json({error:'method_not_allowed'},405,{allow:'GET, POST, DELETE'});
  if(url.searchParams.size)return json({error:'unexpected_parameters'},400);
  if(request.method!=='GET'&&(request.headers.get('origin')!==url.origin||request.headers.get('x-space-action')!=='1'))return json({error:'origin_required'},403);
  try{
    if(['/api/account/register','/api/account/login','/api/account/recover'].includes(path)&&request.method==='POST'){
      if(!await budget(request,env))return json({error:'try_again_later'},429,{'retry-after':'3600'});
      const body=await bodyOf(request);
      if(!validCredentials(body))return json({error:'valid_email_and_14_to_128_character_password_required'},400);
      const email=body.email.trim().toLowerCase();
      let user=await db.prepare('SELECT * FROM space_accounts WHERE email=?').bind(email).first(),recovery=null;
      if(path.endsWith('/register')){
        if(user)return json({error:'account_unavailable_try_sign_in_or_recovery'},400);
        const id=crypto.randomUUID(),salt=random();recovery=random();
        await db.prepare('INSERT INTO space_accounts(id,email,password_hash,salt,recovery_hash,created_at) VALUES(?,?,?,?,?,?)').bind(id,email,await passwordHash(body.password,salt,env.SPACE_AUTH_PEPPER),salt,await digest(recovery),Date.now()).run();
        user={id,email};
      }else if(path.endsWith('/recover')){
        if(!user||typeof body.recovery!=='string'||!equalHash(await digest(body.recovery),user.recovery_hash))return json({error:'invalid_credentials'},401);
        const salt=random();recovery=random();
        await db.batch([db.prepare('UPDATE space_accounts SET password_hash=?,salt=?,recovery_hash=? WHERE id=?').bind(await passwordHash(body.password,salt,env.SPACE_AUTH_PEPPER),salt,await digest(recovery),user.id),db.prepare('DELETE FROM space_sessions WHERE account_id=?').bind(user.id)]);
      }else{
        const candidate=await passwordHash(body.password,user?.salt||'0'.repeat(64),env.SPACE_AUTH_PEPPER);
        if(!user||!equalHash(candidate,user.password_hash))return json({error:'invalid_credentials'},401);
      }
      const token=random();await db.prepare('INSERT INTO space_sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').bind(await digest(token),user.id,Date.now()+TTL*1000).run();
      if(waitUntil)waitUntil(db.batch([db.prepare('DELETE FROM space_sessions WHERE expires_at<?').bind(Date.now()),db.prepare('DELETE FROM space_auth_budget WHERE expires_at<?').bind(Date.now())]));
      return json({authenticated:true,user:{email:user.email,email_verified:false},recovery_code:recovery,live_score_access:false},200,{'set-cookie':cookie(token,secure)});
    }
    if(path==='/api/account/logout'&&request.method==='POST'){
      const token=tokenOf(request);if(token)await db.prepare('DELETE FROM space_sessions WHERE token_hash=?').bind(await digest(token)).run();
      return json({authenticated:false},200,{'set-cookie':cookie('',secure,0)});
    }
    const user=await currentUser(request,db);
    if(path==='/api/account/session'&&request.method==='GET')return json({authenticated:Boolean(user),user:user?{email:user.email,email_verified:false}:null,live_score_access:false});
    if(!user)return json({error:'authentication_required'},401);
    if(path==='/api/account/workspace'){
      if(request.method==='GET'){const row=await db.prepare('SELECT config_json,updated_at FROM space_workspace WHERE account_id=?').bind(user.id).first();return json({workspace:row?JSON.parse(row.config_json):null,updated_at:row?.updated_at||null});}
      if(request.method==='POST'){const body=await bodyOf(request);if(!validWorkspace(body))return json({error:'invalid_workspace'},400);const config={network:body.network,view:body.view,range:body.range};await db.prepare('INSERT INTO space_workspace(account_id,config_json,updated_at) VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET config_json=excluded.config_json,updated_at=excluded.updated_at').bind(user.id,JSON.stringify(config),Date.now()).run();return json({workspace:config});}
    }
    if(path==='/api/account/delete'&&request.method==='DELETE'){
      const body=await bodyOf(request),account=await db.prepare('SELECT password_hash,salt FROM space_accounts WHERE id=?').bind(user.id).first();
      if(typeof body.password!=='string'||body.password.length>128||!equalHash(await passwordHash(body.password,account.salt,env.SPACE_AUTH_PEPPER),account.password_hash))return json({error:'invalid_credentials'},401);
      await db.batch([db.prepare('DELETE FROM space_sessions WHERE account_id=?').bind(user.id),db.prepare('DELETE FROM space_workspace WHERE account_id=?').bind(user.id),db.prepare('DELETE FROM space_accounts WHERE id=?').bind(user.id)]);
      return json({deleted:true},200,{'set-cookie':cookie('',secure,0)});
    }
    if(path==='/api/porb/preview'&&request.method==='GET')return json({mode:'synthetic_demo',live_scores:false,method:'Hand-authored BI-PoRB fixture; no model trained on customer data',red:{label:'Transaction signals',median:182},blue:{label:'Wallet context',median:684},
      trend:[{day:'D1',red:248,blue:638},{day:'D2',red:231,blue:646},{day:'D3',red:262,blue:641},{day:'D4',red:220,blue:658},{day:'D5',red:213,blue:665},{day:'D6',red:242,blue:659},{day:'D7',red:205,blue:676}],
      boundary:'Synthetic product preview. No real address scores, ownership labels or sanctions determinations. Live score serving is not deployed. Registration is not a score delegation.'});
    if(path==='/api/porb/score')return json({error:'live_score_service_not_deployed',delegation_required:true},403);
    return json({error:'not_found'},404);
  }catch(error){return json({error:error.message==='invalid_body'||error instanceof SyntaxError?'invalid_request':'account_request_failed'},error.message==='invalid_body'||error instanceof SyntaxError?400:503);}
}
