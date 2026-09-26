import {authorize,audit,bodyOf,budget,digest,json,requireValue,statement} from './security.js';

export const RECORD_COLUMNS='id,kind,subject,body,purpose,lawful_basis,source_licence,status,revision,created_by,created_at,updated_by,updated_at,expires_at,assignee_id,priority,due_at';
export const RECORD_HISTORY_LIMIT=100;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const qualified=(columns,prefix)=>columns.split(',').map(key=>prefix+'.'+key).join(',');
const readRecord=(db,tenant,id)=>statement(db,`SELECT ${RECORD_COLUMNS} FROM atlas_records WHERE id=? AND tenant_id=? AND expires_at>?`,id,tenant,Date.now()).first();

async function queue(db,principal){
  const tenant=principal.tenant_id,now=Date.now();
  const rows=(await statement(db,`SELECT ${qualified(RECORD_COLUMNS,'r')},u.email AS assignee_email,m.role AS assignee_role
    FROM atlas_records r LEFT JOIN memberships m ON m.tenant_id=r.tenant_id AND m.user_id=r.assignee_id AND m.role IN ('owner','admin','analyst')
    LEFT JOIN users u ON u.id=m.user_id WHERE r.tenant_id=? AND r.expires_at>? AND r.kind IN ('review','correction')
    ORDER BY CASE r.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,coalesce(r.due_at,9007199254740991),r.created_at,r.id LIMIT 200`,tenant,now).all()).results;
  const reviewers=(await statement(db,`SELECT u.id,u.email,m.role FROM memberships m JOIN users u ON u.id=m.user_id
    WHERE m.tenant_id=? AND m.role IN ('owner','admin','analyst') ORDER BY u.email,u.id LIMIT 201`,tenant).all()).results;
  const evidence=principal.type!=='key'||['analyses:read','scores:read'].every(scope=>principal.scopes.includes(scope));
  const reports=evidence?(await statement(db,'SELECT id,title,kind,expires_at FROM atlas_reports WHERE tenant_id=? AND expires_at>? ORDER BY id LIMIT 20',tenant,now).all()).results:[];
  const links=evidence?(await statement(db,`SELECT l.report_id,c.id,c.title,c.status FROM atlas_case_reports l JOIN cases c ON c.id=l.case_id
    JOIN atlas_reports r ON r.id=l.report_id AND r.tenant_id=c.tenant_id WHERE c.tenant_id=? AND r.expires_at>? ORDER BY c.updated_at DESC,c.id LIMIT 2000`,tenant,now).all()).results:[];
  const stillRetained=reports.filter(report=>report.expires_at>Date.now());
  return {items:rows.filter(record=>record.expires_at>Date.now()).map(({assignee_email,assignee_role,...record})=>({...record,
    assignee:assignee_email?{id:record.assignee_id,email:assignee_email,role:assignee_role}:null,
    assignee_unavailable:Boolean(record.assignee_id&&!assignee_email),
    report:stillRetained.find(report=>record.subject==='atlas-report:'+report.id)||null,
    cases:links.filter(link=>record.subject==='atlas-report:'+link.report_id&&stillRetained.some(report=>report.id===link.report_id)).map(({report_id,...item})=>item)})),
    reviewers:reviewers.slice(0,200),reviewers_truncated:reviewers.length>200,evidence_context_available:evidence,
    capacity:200,ordering:'Human priority, earliest deadline, then oldest record. No model ranking or risk inference.',
    interpretation:'Assignment and priority organize work. They do not approve evidence, establish independent review or grant access. Reviewers must retain an active writing role in this organization.'};
}

export async function atlasReviewsRoute(path,request,env,principal){
  const match=path.match(/^\/v1\/atlas\/records\/([0-9a-f-]{36})\/(assignment|history)$/);
  if(path!=='/v1/atlas/reviews'&&!match)return null;
  authorize(principal,'cases:read');const db=env.PORB_DB,tenant=principal.tenant_id;
  if(!match){requireValue(request.method==='GET','method_not_allowed',405);const value=await queue(db,principal);await audit(db,principal,'atlas.review.queue.read',null).run();return json(value);}
  const [,id,operation]=match;requireValue(UUID.test(id),'record_unavailable',404);
  if(operation==='history'){
    requireValue(request.method==='GET','method_not_allowed',405);await budget(env,`atlas-history:${tenant}`,30,60);
    const record=await readRecord(db,tenant,id);requireValue(record,'record_unavailable',404);
    const rows=(await statement(db,`SELECT revision,origin,snapshot_json,expires_at FROM atlas_record_versions WHERE record_id=? AND expires_at>? ORDER BY revision LIMIT 101`,id,Date.now()).all()).results;
    requireValue(rows.length<=RECORD_HISTORY_LIMIT,'record_history_capacity',409);
    const versions=rows.map(row=>{let snapshot;try{snapshot=JSON.parse(row.snapshot_json);}catch{requireValue(false,'record_history_invalid',409);}
      requireValue(snapshot?.id===id&&snapshot.revision===row.revision&&snapshot.expires_at===row.expires_at&&row.revision<=record.revision,'record_history_invalid',409);
      return {origin:row.origin,record:snapshot};});
    requireValue(JSON.stringify(await readRecord(db,tenant,id))===JSON.stringify(record),'record_changed_retry',409);
    const current=versions.find(item=>item.record.revision===record.revision);
    requireValue(current&&JSON.stringify(current.record)===JSON.stringify(record),'record_history_invalid',409);
    const retained=versions.filter(item=>item.record.expires_at>Date.now());
    const value={version:'porb-atlas-record-history-1.0.0',generated_at:new Date().toISOString(),record,
      complete:retained.length===record.revision&&retained.every((item,index)=>item.record.revision===index+1),
      missing_revisions:record.revision-retained.length,versions:retained,
      expires_at:Math.min(record.expires_at,...retained.map(item=>item.record.expires_at)),
      limits:{retained_versions:RECORD_HISTORY_LIMIT},
      coverage:'Server-recorded revisions only. Earlier migration revisions and expired versions are unavailable. Each version keeps its original expiry; extending the current record never revives expired history. Deleting the record deletes all its versions.',
      interpretation:'Actor IDs identify the credential that wrote a revision. Assignment and different actor IDs do not establish independent review. The checksum detects changes to this export, not independent validation of the decisions. Downloaded copies do not automatically enforce server retention.'};
    const history_sha256=await digest(JSON.stringify(value));requireValue(value.expires_at>Date.now(),'record_changed_retry',409);
    await audit(db,principal,'atlas.record.history.read',id).run();return json({...value,history_sha256});
  }
  authorize(principal,'cases:write');requireValue(request.method==='POST','method_not_allowed',405);
  const body=await bodyOf(request);requireValue(Object.keys(body).every(key=>['revision','assignee_id','priority','due_at'].includes(key)),'unexpected_fields');
  requireValue(Number.isInteger(body.revision)&&body.revision>=1,'invalid_revision');
  requireValue((body.assignee_id===null||typeof body.assignee_id==='string'&&UUID.test(body.assignee_id))&&['high','normal','low'].includes(body.priority),'invalid_review_assignment');
  requireValue(body.due_at===null||Number.isSafeInteger(body.due_at)&&body.due_at>0,'invalid_review_deadline');
  await budget(env,`atlas-records:${tenant}`,30,60);const now=Date.now();
  const [changed]=await db.batch([statement(db,`UPDATE atlas_records SET assignee_id=?,priority=?,due_at=?,updated_by=?,updated_at=?,revision=revision+1
    WHERE id=? AND tenant_id=? AND revision=? AND expires_at>? AND kind IN ('review','correction')
    AND (? IS NULL OR (? >= created_at AND ? <= expires_at))
    AND (? IS NULL OR EXISTS(SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND role IN ('owner','admin','analyst')))
    AND (SELECT count(*) FROM atlas_record_versions WHERE record_id=?)<?`,body.assignee_id,body.priority,body.due_at,principal.key_id||principal.id,now,id,tenant,body.revision,now,
    body.due_at,body.due_at,body.due_at,body.assignee_id,tenant,body.assignee_id,id,RECORD_HISTORY_LIMIT),
    statement(db,'INSERT INTO audit(id,tenant_id,actor_id,action,resource_id,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),tenant,principal.key_id||principal.id,'atlas.review.assign',id,now)]);
  requireValue(changed.meta.changes===1,'review_assignment_conflict',409);
  return json(await readRecord(db,tenant,id));
}
