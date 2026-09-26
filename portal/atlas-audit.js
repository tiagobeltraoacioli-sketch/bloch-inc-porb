import {admin,audit,budget,digest,json,PortalError,requireValue,statement} from './security.js';
import {utcTimestamp} from '../graphus/assets/atlas_statistics.js';

export const AUDIT_QUERY=['start','end','action','actor','resource','cursor','limit'];
export const AUDIT_LIMITS=Object.freeze({page:25,maximum_page:100,export_events:1000,export_bytes:2000000,snapshot_ms:900000,window_days:366});
const DAY=86400000,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,encoder=new TextEncoder();
const columns='id,actor_id,action,resource_id,created_at';
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function un64(value){requireValue(/^[A-Za-z0-9_-]+$/.test(value),'invalid_audit_cursor');return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),char=>char.charCodeAt(0));}
const cursorKey=env=>crypto.subtle.importKey('raw',encoder.encode('porb-atlas-audit-cursor-1\0'+env.PORB_AUTH_PEPPER),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
async function encodeCursor(value,env){const payload=b64(encoder.encode(JSON.stringify(value))),signature=await crypto.subtle.sign('HMAC',await cursorKey(env),encoder.encode(payload));return payload+'.'+b64(new Uint8Array(signature));}
async function decodeCursor(token,env,tenant,queryHash,now){
  let value;
  try{
    requireValue(token.length<=1800,'invalid_audit_cursor');const parts=token.split('.');requireValue(parts.length===2,'invalid_audit_cursor');
    requireValue(await crypto.subtle.verify('HMAC',await cursorKey(env),un64(parts[1]),encoder.encode(parts[0])),'invalid_audit_cursor');
    value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(un64(parts[0])));
  }catch{throw new PortalError('invalid_audit_cursor');}
  requireValue(value?.version===1&&value.tenant===tenant&&value.query_sha256===queryHash&&UUID.test(value.anchor||'')&&Number.isSafeInteger(value.created_at)&&value.created_at>=0&&value.created_at<=now&&value.expires_at===value.created_at+AUDIT_LIMITS.snapshot_ms,'invalid_audit_cursor');
  requireValue(value.after===null||value.after&&Number.isSafeInteger(value.after.created_at)&&value.after.created_at>=0&&UUID.test(value.after.id||''),'invalid_audit_cursor');
  requireValue(value.expires_at>now,'audit_snapshot_expired',409);return value;
}
function filtersOf(query){
  const filters={start:null,end:null,action:null,actor:null,resource:null};
  for(const key of ['start','end'])if(query.has(key)){const time=utcTimestamp(query.get(key));requireValue(time!==null&&time>=0,'invalid_audit_window');filters[key]=new Date(time).toISOString();}
  for(const [key,max] of [['action',100],['actor',200],['resource',1000]])if(query.has(key)){
    const value=query.get(key);requireValue(value.length>=1&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value),'invalid_audit_filter');filters[key]=value;
  }
  requireValue(filters.action===null||/^atlas\.[a-z0-9_.-]+$/.test(filters.action),'invalid_audit_action');return filters;
}
function windowOf(filters,created){
  const end=filters.end===null?created:Date.parse(filters.end),start=filters.start===null?end-30*DAY:Date.parse(filters.start);
  requireValue(start>=0&&end>=start&&end-start<=AUDIT_LIMITS.window_days*DAY,'invalid_audit_window');return {start,end};
}
function readEvents(db,tenant,barrier,filters,window,after,limit){
  const clauses=["tenant_id=?","action GLOB 'atlas.*'","rowid<?","created_at>=?","created_at<=?"],params=[tenant,barrier,window.start,window.end];
  for(const [key,column] of [['action','action'],['actor','actor_id'],['resource','resource_id']])if(filters[key]!==null){clauses.push(column+'=?');params.push(filters[key]);}
  if(after){clauses.push('(created_at<? OR (created_at=? AND id<?))');params.push(after.created_at,after.created_at,after.id);}
  return statement(db,`SELECT ${columns} FROM audit WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC,id DESC LIMIT ?`,...params,limit).all();
}
const limitations=[
  'Only retained Atlas audit actions in this organization and requested UTC window are included. Other organization activity is outside this export.',
  'The snapshot excludes events inserted after its marker. It is a navigation boundary, not immutable database history or an independent attestation.',
  'Credential and resource identifiers are preserved as recorded. They do not independently identify a person or establish the purpose of an action.',
  'Record bodies, report payloads, grantee details and secrets are not joined into audit events. Deleted evidence is not restored by this view.',
  'Verify audit_sha256 over UTF-8 JSON.stringify(export without audit_sha256) in returned property order. It does not prove source truth or make this log tamper-evident.'
];

export async function atlasAuditRoute(path,request,env,principal){
  if(!['/v1/atlas/audit','/v1/atlas/audit/export'].includes(path))return null;
  admin(principal);requireValue(request.method==='GET','method_not_allowed',405);
  const exporting=path.endsWith('/export'),url=new URL(request.url),query=url.searchParams,db=env.PORB_DB,tenant=principal.tenant_id,now=Date.now();
  requireValue(url.search.length<=7000&&[...query.keys()].every(key=>AUDIT_QUERY.includes(key)&&query.getAll(key).length===1),'unexpected_parameters');
  const filters=filtersOf(query),queryHash=await digest(JSON.stringify(filters)),rawLimit=query.get('limit');
  requireValue(rawLimit===null||!exporting&&/^[1-9][0-9]{0,2}$/.test(rawLimit)&&Number(rawLimit)<=AUDIT_LIMITS.maximum_page,'invalid_audit_limit');
  const limit=exporting?AUDIT_LIMITS.export_events:Number(rawLimit||AUDIT_LIMITS.page);
  let cursor=query.has('cursor')?await decodeCursor(query.get('cursor'),env,tenant,queryHash,now):null;
  requireValue(!exporting||!cursor?.after,'audit_export_requires_snapshot');
  const window=windowOf(filters,cursor?.created_at??now);
  await budget(env,`atlas-audit-${exporting?'export':'read'}:${tenant}`,exporting?6:30,60);
  if(!cursor){
    cursor={version:1,tenant,query_sha256:queryHash,anchor:crypto.randomUUID(),created_at:now,expires_at:now+AUDIT_LIMITS.snapshot_ms,after:null};
    // The marker's rowid is an insertion barrier, including for equal/backdated timestamps.
    // Only its UUID is exposed. The global database insertion sequence never leaves D1.
    await statement(db,'INSERT INTO audit(id,tenant_id,actor_id,action,resource_id,created_at) VALUES(?,?,?,?,?,?)',cursor.anchor,tenant,principal.id,'atlas.audit.snapshot',queryHash,now).run();
  }
  const anchor=await statement(db,"SELECT CAST(rowid AS TEXT) AS barrier FROM audit WHERE id=? AND tenant_id=? AND action='atlas.audit.snapshot' AND resource_id=?",cursor.anchor,tenant,queryHash).first();
  requireValue(anchor,'audit_snapshot_unavailable',409);
  const found=(await readEvents(db,tenant,anchor.barrier,filters,window,cursor.after,limit+1)).results,more=found.length>limit,events=found.slice(0,limit);
  requireValue(events.every(row=>UUID.test(row.id)&&typeof row.actor_id==='string'&&row.actor_id.length>0&&typeof row.action==='string'&&row.action.startsWith('atlas.')&&(row.resource_id===null||typeof row.resource_id==='string')&&Number.isSafeInteger(row.created_at)&&row.created_at>=0),'audit_integrity_failed',409);
  requireValue(!exporting||!more,'audit_export_capacity',422);
  requireValue(cursor.expires_at>Date.now(),'audit_snapshot_expired',409);
  const snapshot={id:cursor.anchor,created_at:cursor.created_at,expires_at:cursor.expires_at,cursor:await encodeCursor({...cursor,after:null},env)};
  const selection={query:filters,query_sha256:queryHash,window:{start:new Date(window.start).toISOString(),end:new Date(window.end).toISOString()},snapshot};
  if(exporting){
    const report={version:'porb-atlas-audit-export-1.0.0',exported_at:Date.now(),tenant:{id:tenant,name:principal.tenant_name},...selection,complete:true,event_count:events.length,events,limitations};
    const serialized=JSON.stringify(report);requireValue(encoder.encode(serialized).length+100<=AUDIT_LIMITS.export_bytes,'audit_export_capacity',422);
    const audit_sha256=await digest(serialized);requireValue(cursor.expires_at>Date.now(),'audit_snapshot_expired',409);
    await audit(db,principal,'atlas.audit.export',audit_sha256).run();
    requireValue(cursor.expires_at>Date.now(),'audit_snapshot_expired',409);
    return json({...report,audit_sha256},200,{'content-disposition':`attachment; filename="atlas-audit-${cursor.anchor}.json"`});
  }
  const last=events.at(-1),next=more?await encodeCursor({...cursor,after:{created_at:last.created_at,id:last.id}},env):null;
  const result={...selection,events,pagination:{limit,has_more:more,next_cursor:next},limits:AUDIT_LIMITS,limitations};
  requireValue(encoder.encode(JSON.stringify(result)).length<=AUDIT_LIMITS.export_bytes,'audit_response_capacity',422);
  await audit(db,principal,'atlas.audit.read',JSON.stringify({snapshot:cursor.anchor,query_sha256:queryHash,returned:events.length})).run();
  requireValue(cursor.expires_at>Date.now(),'audit_snapshot_expired',409);return json(result);
}
