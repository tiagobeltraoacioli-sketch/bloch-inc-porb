import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handlePortal} from '../portal/router.js';
import {random,digest,passwordHash} from '../portal/security.js';

export const credentials={email:'owner@example.test',password:'test owner password 123456789'};
export function sourceGraph(asset='ETH',height=100){
  const address=i=>`0x${i.toString(16).padStart(40,'0')}`,id=i=>`${asset}:address:${address(i)}`;
  const nodes=Array.from({length:40},(_,i)=>({id:id(i+1),address:address(i+1),kind:'address'}));
  const edges=Array.from({length:39},(_,i)=>({from:id(i+1),to:id(40),kind:'native_transfer',amount_base_units:String(BigInt(i+1)*1000000000000000000n),event_id:`${height}:${i}`,txid:`0x${(i+1).toString(16).padStart(64,'0')}`,position:i,block_number:height,block_hash:`0x${height.toString(16).padStart(64,'0')}`,block_time:'2026-09-24T12:00:00.000Z'}));
  return {status:'source-reported',asset,network:'ethereum-mainnet',source:'test-public-source',retrieved_at:'2026-09-24T12:00:00.000Z',anchor:{height,hash:edges[0].block_hash},nodes,edges,coverage:'Synthetic test fixture only',scope:{transactions_returned:39},next_cursor:String(height-1)};
}
export async function setup(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../portal/migrations/0001_portal.sql',import.meta.url),'utf8'));
  function statement(sql,args=[]){return {bind(...values){return statement(sql,values);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},_run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};},async run(){return this._run();}};}
  const db={prepare:statement,async batch(statements){sqlite.exec('BEGIN');try{const results=statements.map(s=>s._run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  const env={PORB_DB:db,PORB_AUTH_PEPPER:'test-only-pepper-32-characters-1234567890'},tenant=crypto.randomUUID(),owner=crypto.randomUUID(),salt=random();
  sqlite.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(tenant,'Test organization','research',Date.now());
  sqlite.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(owner,credentials.email,await passwordHash(credentials.password,salt,env.PORB_AUTH_PEPPER),salt,await digest('initial-recovery'),Date.now());
  sqlite.prepare('INSERT INTO memberships VALUES(?,?,?)').run(tenant,owner,'owner');
  let calls=0;
  const fetcher=async url=>{calls++;const u=new URL(url);if(u.pathname==='/api/chain/network')return Response.json(sourceGraph(u.searchParams.get('asset'),Number(u.searchParams.get('cursor')||100)));throw new Error('unexpected_test_upstream');};
  const call=async(path,method='GET',body,access='',options={})=>{
    const headers={'cf-connecting-ip':'127.0.0.1',...options.headers};if(access.startsWith('porb_'))headers.authorization=`Bearer ${access}`;else if(access)headers.cookie=access;
    if(method!=='GET')Object.assign(headers,{'content-type':'application/json','x-porb-action':'1',origin:options.origin||'https://rednblue.space'});
    return handlePortal({request:new Request(`https://rednblue.space/api/porb${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env,fetcher:options.fetcher||fetcher});
  };
  const login=async(creds=credentials)=>{const r=await call('/auth/login','POST',creds);if(r.status!==200)throw new Error(JSON.stringify(await r.json()));return r.headers.get('set-cookie').split(';')[0];};
  return {sqlite,db,env,tenant,owner,call,login,calls:()=>calls};
}
