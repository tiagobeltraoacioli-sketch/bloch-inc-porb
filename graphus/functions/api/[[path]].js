import {queryChainWallet} from '../../chain/real-chain.js';
import {queryEthereumActivity} from '../../chain/ethereum-activity.js';
import {queryBlochHolders} from '../../chain/bloch-holders.js';

const COOKIE = 'graphus_session';
const NONCE_COOKIE = 'graphus_login_nonce';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const INITIAL_ASSETS = [
  {network:'bitcoin-mainnet',asset:'BTC',status:'adapter-prototype'},
  {network:'ethereum-mainnet',asset:'ETH',status:'adapter-prototype'},
  {network:'ethereum-mainnet',asset:'USDT',standard:'ERC-20',status:'adapter-prototype'},
  {network:'ethereum-mainnet',asset:'USDC',standard:'ERC-20',status:'adapter-prototype'},
  {network:'bloch-mainnet',asset:'BLCH',status:'public-indexed-script-hash-ranking-and-public-script-hash-lookup'},
];

function json(data, status=200, headers={}) {
  return new Response(JSON.stringify(data), {status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
}
function error(code,status=400) { return json({error:code},status); }
function getCookie(request,name) {
  const cookies=request.headers.get('Cookie')||'';
  const item=cookies.split(';').map(value=>value.trim()).find(value=>value.startsWith(name+'='));
  return item ? item.slice(name.length+1) : null;
}
function cookie(name,value,maxAge,secure=true) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure?'; Secure':''}`;
}
function randomString() {
  const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);
  return Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
}
async function digest(value) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),part=>part.toString(16).padStart(2,'0')).join('');
}
function sameOriginAction(request) {
  const origin=request.headers.get('Origin');
  return origin===new URL(request.url).origin && request.headers.get('X-Graphus-Action')==='1';
}
async function readBody(request) {
  if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))throw new Error('json_required');
  const raw=await request.text();
  if(raw.length>8192)throw new Error('body_too_large');
  return JSON.parse(raw);
}
function decodeJwtPart(part) {
  const base64=part.replace(/-/g,'+').replace(/_/g,'/');
  const bytes=Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length/4)*4,'=')),character=>character.charCodeAt(0));
  return bytes;
}
async function verifyGoogleToken(token,clientId,expectedNonce) {
  if(typeof token!=='string'||token.length>8192)throw new Error('invalid_credential');
  const parts=token.split('.');if(parts.length!==3)throw new Error('invalid_credential');
  const header=JSON.parse(new TextDecoder().decode(decodeJwtPart(parts[0])));
  const payload=JSON.parse(new TextDecoder().decode(decodeJwtPart(parts[1])));
  if(header.alg!=='RS256'||typeof header.kid!=='string')throw new Error('invalid_credential');
  const keysResponse=await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if(!keysResponse.ok)throw new Error('identity_provider_unavailable');
  const keys=await keysResponse.json();
  const jwk=keys.keys?.find(key=>key.kid===header.kid&&key.kty==='RSA'&&key.use==='sig');
  if(!jwk)throw new Error('invalid_credential');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const signed=new TextEncoder().encode(parts[0]+'.'+parts[1]);
  const verified=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decodeJwtPart(parts[2]),signed);
  const now=Math.floor(Date.now()/1000);
  if(!verified||payload.aud!==clientId||!['accounts.google.com','https://accounts.google.com'].includes(payload.iss)
    ||!Number.isFinite(payload.exp)||payload.exp<=now||!Number.isFinite(payload.iat)||payload.iat>now+60
    ||payload.nonce!==expectedNonce||typeof payload.sub!=='string'||!payload.sub
    ||payload.email_verified!==true||typeof payload.email!=='string'||!payload.email)throw new Error('invalid_credential');
  return {sub:payload.sub,email:payload.email};
}
async function currentUser(request,db) {
  const token=getCookie(request,COOKIE);
  if(!token||!/^[0-9a-f]{64}$/.test(token))return null;
  const hash=await digest(token);
  return db.prepare('SELECT a.id, a.email FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?')
    .bind(hash,new Date().toISOString()).first();
}
function configured(env) {return Boolean(env.GRAPHUS_DB&&env.GOOGLE_CLIENT_ID&&env.GRAPHUS_GOOGLE_ENABLED==='true');}

export async function onRequest({request,env}) {
  const url=new URL(request.url);
  const path=url.pathname.replace(/^\/api\/?/,'').replace(/\/$/,'');
  const method=request.method;
  const secure=url.protocol==='https:';
  if(path==='chain/wallet'&&method==='GET') {
    const result=await queryChainWallet({
      network:url.searchParams.get('network'),asset:url.searchParams.get('asset'),
      address:url.searchParams.get('address'),env,
    });
    return json(result.body,result.status);
  }
  if(path==='chain/activity'&&method==='GET') {
    const result=await queryEthereumActivity({
      asset:url.searchParams.get('asset'),address:url.searchParams.get('address'),env,
    });
    return json(result.body,result.status);
  }
  if(path==='chain/holders'&&method==='GET') {
    if(url.searchParams.get('asset')!=='BLCH')return error('holder_index_unavailable_for_asset',400);
    const result=await queryBlochHolders();
    return json(result.body,result.status);
  }
  if(path==='config'&&method==='GET')return json({google_enabled:configured(env),annotations_enabled:configured(env),google_client_id:configured(env)?env.GOOGLE_CLIENT_ID:null,daas_mode:'mixed-preview'});
  if(path==='daas/manifest'&&method==='GET')return json({
    product:'Graphus Data as a Service',status:'mixed-synthetic-and-source-reported-preview',live_transactions:false,live_scores:false,
    initial_assets:INITIAL_ASSETS,
    query_capabilities:{
      address_search:'synthetic-browser-fixture-and-bounded-source-reported-query',
      local_constellation:'synthetic-browser-fixture',production_chain_query:false,
      bounded_public_chain_address_lookup:{
        endpoint:'/api/chain/wallet',bitcoin:'public-esplora-address-aggregate-and-bounded-transactions',
        ethereum:'requires-GRAPHUS_ETHEREUM_RPC_URL',bloch:'source-reported-archival-script-hash-balance',independently_verified:false,
      },
      bloch_indexed_script_ranking:{endpoint:'/api/chain/holders?asset=BLCH',limit:64,
        unit:'script_hash',coverage:'positive balances in source indexed canonical state',independently_verified:false},
      bounded_public_erc20_activity:{endpoint:'/api/chain/activity',assets:['USDT','USDC'],window_blocks:64,native_eth:'unavailable-without-transaction-index'},
    },
    research:{bloch_sample:'private-bounded',structural_groups:'unsupervised-research-only',aml_model:'not-validated'},
    proposed_public_fields:['network','asset','transaction_id','event_index','observed_at','finality','source','source_version','flow_edges','feature_definitions','validated_non_score_features'],
    private_fields:['aml_score','personal_identity','raw_ip','customer_case'],api_version:'proposed-v1'
  });
  if(!env.GRAPHUS_DB)return error('account_service_not_configured',503);
  if(path==='auth/nonce'&&method==='GET') {
    if(!configured(env))return error('google_login_not_configured',503);
    const nonce=randomString();
    return json({nonce},200, {'Set-Cookie':cookie(NONCE_COOKIE,nonce,300,secure)});
  }
  if(path==='session'&&method==='GET') {
    const user=await currentUser(request,env.GRAPHUS_DB);
    return json({authenticated:Boolean(user),user:user?{id:user.id,email:user.email}:null});
  }
  if(method==='POST'||method==='DELETE'){
    if(!sameOriginAction(request))return error('origin_or_action_header_required',403);
  }
  if(path==='auth/google'&&method==='POST') {
    if(!configured(env))return error('google_login_not_configured',503);
    const nonce=getCookie(request,NONCE_COOKIE);
    if(!nonce||!/^[0-9a-f]{64}$/.test(nonce))return error('login_nonce_required',403);
    let body,identity;
    try{body=await readBody(request);identity=await verifyGoogleToken(body.credential,env.GOOGLE_CLIENT_ID,nonce);}
    catch(error){return error(error.message==='identity_provider_unavailable'?'identity_provider_unavailable':'invalid_credential',401);}
    const id=await digest('google:'+identity.sub);
    const now=new Date().toISOString();
    await env.GRAPHUS_DB.prepare('INSERT INTO accounts (id,google_sub,email,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email,updated_at=excluded.updated_at')
      .bind(id,identity.sub,identity.email,now,now).run();
    const session=randomString();
    const expires=new Date(Date.now()+SESSION_SECONDS*1000).toISOString();
    await env.GRAPHUS_DB.prepare('INSERT INTO sessions (token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)')
      .bind(await digest(session),id,now,expires).run();
    const response=json({authenticated:true,user:{id,email:identity.email}});
    response.headers.append('Set-Cookie',cookie(COOKIE,session,SESSION_SECONDS,secure));
    response.headers.append('Set-Cookie',cookie(NONCE_COOKIE,'',0,secure));
    return response;
  }
  if(path==='auth/logout'&&method==='POST') {
    const token=getCookie(request,COOKIE);
    if(token&&/^[0-9a-f]{64}$/.test(token))await env.GRAPHUS_DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();
    return json({authenticated:false},200,{'Set-Cookie':cookie(COOKIE,'',0,secure)});
  }
  if(path==='annotations'||path.startsWith('annotations/')){
    const user=await currentUser(request,env.GRAPHUS_DB);
    if(!user)return error('authentication_required',401);
    if(path==='annotations'&&method==='GET'){
      const wallet=url.searchParams.get('wallet');
      if(wallet&&wallet.length>200)return error('invalid_wallet');
      const query=wallet
        ?env.GRAPHUS_DB.prepare('SELECT id,wallet_ref,body,created_at,updated_at FROM annotations WHERE account_id=? AND wallet_ref=? ORDER BY updated_at DESC LIMIT 50').bind(user.id,wallet)
        :env.GRAPHUS_DB.prepare('SELECT id,wallet_ref,body,created_at,updated_at FROM annotations WHERE account_id=? ORDER BY updated_at DESC LIMIT 50').bind(user.id);
      const result=await query.all();return json({items:result.results||[]});
    }
    if(path==='annotations'&&method==='POST'){
      let body;try{body=await readBody(request);}catch{return error('invalid_json');}
      if(typeof body.wallet_ref!=='string'||!/^[-.:_a-zA-Z0-9]{3,200}$/.test(body.wallet_ref)
        ||typeof body.body!=='string'||body.body.trim().length<1||body.body.length>4000)return error('invalid_annotation');
      const id=crypto.randomUUID(),now=new Date().toISOString();
      await env.GRAPHUS_DB.prepare('INSERT INTO annotations (id,account_id,wallet_ref,body,created_at,updated_at) VALUES (?,?,?,?,?,?)')
        .bind(id,user.id,body.wallet_ref,body.body.trim(),now,now).run();
      return json({id,wallet_ref:body.wallet_ref,body:body.body.trim(),created_at:now},201);
    }
    if(path.startsWith('annotations/')&&method==='DELETE'){
      const id=path.slice('annotations/'.length);
      if(!/^[0-9a-f-]{36}$/.test(id))return error('invalid_annotation_id');
      const result=await env.GRAPHUS_DB.prepare('DELETE FROM annotations WHERE id=? AND account_id=?').bind(id,user.id).run();
      return result.meta?.changes?json({deleted:true}):error('annotation_not_found',404);
    }
  }
  return error('not_found',404);
}
