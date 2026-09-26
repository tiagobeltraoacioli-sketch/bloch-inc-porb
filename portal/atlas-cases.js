import {authorize,audit,bodyOf,budget,digest,json,requireValue,statement} from './security.js';
import {REPORT_COLUMNS,reportMetadata,readVerifiedReport} from './atlas-reports.js';
import {RECORD_COLUMNS} from './atlas-reviews.js';

export const CASE_REPORT_LIMITS=Object.freeze({links:20,bundle_bytes:12000000});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH=/^[a-f0-9]{64}$/;
const LINK_COLUMNS='id,case_id,report_id,payload_sha256,created_by,created_at';
const keys=(body,allowed)=>requireValue(body&&typeof body==='object'&&!Array.isArray(body)&&Object.keys(body).every(key=>allowed.includes(key)),'unexpected_fields');
async function caseOf(db,tenant,id){
  requireValue(UUID.test(id),'case_unavailable',404);
  const row=await statement(db,'SELECT id,title,status,created_by,created_at,updated_at,(SELECT count(*) FROM case_evidence e WHERE e.case_id=cases.id) AS reference_snapshots FROM cases WHERE id=? AND tenant_id=?',id,tenant).first();
  requireValue(row,'case_unavailable',404);return row;
}
async function manifest(db,tenant,id){
  const record=await caseOf(db,tenant,id),now=Date.now();
  const links=(await statement(db,`SELECT ${LINK_COLUMNS} FROM atlas_case_reports WHERE case_id=? ORDER BY created_at,id`,id).all()).results;
  requireValue(links.length<=20,'case_report_capacity',409);
  const rows=(await statement(db,`SELECT ${REPORT_COLUMNS.split(',').map(key=>'r.'+key).join(',')} FROM atlas_reports r JOIN atlas_case_reports l ON l.report_id=r.id WHERE l.case_id=? AND r.tenant_id=? AND r.expires_at>?`,id,tenant,now).all()).results;
  const records=(await statement(db,`SELECT ${RECORD_COLUMNS} FROM atlas_records
    WHERE tenant_id=? AND expires_at>? AND subject IN (SELECT 'atlas-report:'||report_id FROM atlas_case_reports WHERE case_id=?) ORDER BY updated_at,id LIMIT 201`,tenant,now,id).all()).results;
  requireValue(records.length<=200,'case_record_capacity',409);
  const reports=new Map(rows.map(row=>[row.id,reportMetadata(row)]));
  return {case:record,links:links.map(link=>{
    const report=reports.get(link.report_id);if(!report)return {...link,availability:'unavailable',report:null,records:[]};
    requireValue(report.payload_sha256===link.payload_sha256,'case_report_digest_conflict',409);
    return {...link,availability:'retained',report,records:records.filter(row=>row.subject===report.review_subject)};
  }),limits:CASE_REPORT_LIMITS,coverage:'Atlas report links and their currently retained governance records only. Reference snapshots have a separate investigation export. Links retain only report IDs, attachment digests and attachment audit metadata after report expiry or deletion. No report retention is extended.'};
}
async function unchanged(db,tenant,id,before){requireValue(JSON.stringify(await manifest(db,tenant,id))===JSON.stringify(before),'case_changed_retry',409);}

export async function atlasCasesRoute(path,request,env,principal){
  const match=path.match(/^\/v1\/atlas\/cases\/([0-9a-f-]{36})(?:\/(reports|export)(?:\/([0-9a-f-]{36}))?)?$/);if(!match)return null;
  const [,id,operation,linkId]=match,method=request.method,db=env.PORB_DB,tenant=principal.tenant_id;
  for(const scope of ['cases:read','analyses:read','scores:read'])authorize(principal,scope);
  requireValue(!linkId||operation==='reports'&&UUID.test(linkId),'not_found',404);
  if(method==='GET'&&!linkId&&(!operation||operation==='export')){
    if(operation)await budget(env,`atlas-case-export:${tenant}`,6,60);
    const value=await manifest(db,tenant,id);
    if(!operation){await unchanged(db,tenant,id,value);await audit(db,principal,'atlas.case.read',id).run();return json(value);}
    requireValue(value.links.reduce((n,link)=>n+(link.report?.payload_bytes||0),0)<=CASE_REPORT_LIMITS.bundle_bytes,'case_bundle_capacity',422);
    const links=[];for(const link of value.links){
      const report=link.report?await readVerifiedReport(db,tenant,link.report_id):null;
      if(report)requireValue(report.payload_sha256===link.payload_sha256,'case_report_digest_conflict',409);
      links.push({...link,report});
    }
    await unchanged(db,tenant,id,value);
    const expiries=links.flatMap(link=>link.report?[link.report.expires_at,...link.records.map(row=>row.expires_at)]:[]);
    const bundle={version:'porb-atlas-case-bundle-1.0.0',generated_at:new Date().toISOString(),case:value.case,complete:links.every(link=>link.report!==null),
      reports_retained:links.filter(link=>link.report!==null).length,reports_unavailable:links.filter(link=>link.report===null).length,
      expires_at:expiries.length?Math.min(...expiries):null,links,limits:CASE_REPORT_LIMITS,coverage:value.coverage,
      interpretation:'Completeness refers only to the attached report set at export time, not full-chain coverage or a review decision. Open, completed and corrected records retain their explicit states. Closing an investigation does not approve its evidence. Downloaded copies do not automatically refresh or enforce server retention.'};
    const content=JSON.stringify(bundle);requireValue(new TextEncoder().encode(content).length+100<=CASE_REPORT_LIMITS.bundle_bytes,'case_bundle_capacity',422);
    const bundle_sha256=await digest(content);
    requireValue(bundle.expires_at===null||bundle.expires_at>Date.now(),'case_changed_retry',409);
    await audit(db,principal,'atlas.case.export',id).run();return json({...bundle,bundle_sha256},200,{'content-disposition':`attachment; filename="atlas-case-${id}.json"`});
  }
  authorize(principal,'cases:write');
  const record=await caseOf(db,tenant,id);requireValue(record.status==='open','case_closed',409);
  if(method==='DELETE'&&operation==='reports'&&linkId){
    const body=await bodyOf(request);keys(body,['payload_sha256']);requireValue(HASH.test(body.payload_sha256||''),'invalid_report_digest');
    const [removed]=await db.batch([statement(db,`DELETE FROM atlas_case_reports WHERE id=? AND case_id=? AND payload_sha256=? AND EXISTS(SELECT 1 FROM cases WHERE id=? AND tenant_id=? AND status='open')`,linkId,id,body.payload_sha256,id,tenant),
      statement(db,'INSERT INTO audit(id,tenant_id,actor_id,action,resource_id,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),tenant,principal.key_id||principal.id,'atlas.case.report.detach',id+':'+linkId,Date.now()),
      statement(db,'UPDATE cases SET updated_at=? WHERE id=? AND tenant_id=? AND changes()=1',Date.now(),id,tenant)]);
    requireValue(removed.meta.changes===1,'case_link_unavailable_or_conflict',409);return json({detached:true});
  }
  requireValue(method==='POST'&&operation==='reports'&&!linkId,'method_not_allowed',405);
  const body=await bodyOf(request);keys(body,['report_id','payload_sha256']);requireValue(UUID.test(body.report_id||'')&&HASH.test(body.payload_sha256||''),'invalid_report_identity');
  await budget(env,`atlas-case-attach:${tenant}`,30,60);
  const report=await readVerifiedReport(db,tenant,body.report_id);requireValue(report.payload_sha256===body.payload_sha256,'case_report_digest_conflict',409);
  const newId=crypto.randomUUID(),now=Date.now();
  const [created]=await db.batch([statement(db,`INSERT OR IGNORE INTO atlas_case_reports(id,case_id,report_id,payload_sha256,created_by,created_at)
    SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM atlas_case_reports WHERE case_id=?)<20 AND EXISTS(SELECT 1 FROM cases WHERE id=? AND tenant_id=? AND status='open')
    AND EXISTS(SELECT 1 FROM atlas_reports WHERE id=? AND tenant_id=? AND expires_at>? AND payload_sha256=?)`,newId,id,report.id,report.payload_sha256,principal.key_id||principal.id,now,id,id,tenant,report.id,tenant,now,report.payload_sha256),
    statement(db,'INSERT INTO audit(id,tenant_id,actor_id,action,resource_id,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),tenant,principal.key_id||principal.id,'atlas.case.report.attach',id+':'+newId,now),
    statement(db,'UPDATE cases SET updated_at=? WHERE id=? AND tenant_id=? AND changes()=1',now,id,tenant)]);
  const stored=await statement(db,`SELECT ${LINK_COLUMNS} FROM atlas_case_reports l WHERE case_id=? AND report_id=? AND EXISTS(SELECT 1 FROM cases WHERE id=l.case_id AND tenant_id=? AND status='open')`,id,report.id,tenant).first();
  requireValue(stored,'case_closed_or_report_capacity',409);requireValue(stored.payload_sha256===body.payload_sha256,'case_report_digest_conflict',409);
  return json({...stored,duplicate:created.meta.changes===0},created.meta.changes===1?201:200);
}
