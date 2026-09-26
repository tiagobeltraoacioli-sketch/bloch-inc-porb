import {admin,authorize,bodyOf,requireValue,json,statement,audit,random,digest,budget} from './security.js';
import {readAnalysis} from './intelligence.js';

export const GRANT_COLUMNS='id,analysis_id,node_id,review_record_id,named_grantee,purpose,created_at,expires_at,revoked_at';
export async function atlasGrantRoute(path,request,env,principal){
  const match=path.match(/^\/v1\/atlas\/grants(?:\/([0-9a-f-]{36})\/revoke)?$/);if(!match)return null;
  admin(principal);const db=env.PORB_DB,tenant=principal.tenant_id,now=Date.now();
  if(path==='/v1/atlas/grants'&&request.method==='GET')return json({grants:(await statement(db,`SELECT ${GRANT_COLUMNS} FROM atlas_score_grants WHERE tenant_id=? ORDER BY created_at DESC,id DESC LIMIT 100`,tenant).all()).results});
  requireValue(request.method==='POST','method_not_allowed',405);const body=await bodyOf(request);
  if(match[1]){
    requireValue(!Object.keys(body).length,'unexpected_fields');
    const [changed]=await db.batch([statement(db,'UPDATE atlas_score_grants SET revoked_at=coalesce(revoked_at,?) WHERE id=? AND tenant_id=?',now,match[1],tenant),
      statement(db,'INSERT INTO audit(id,tenant_id,actor_id,action,resource_id,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),tenant,principal.id,'atlas.grant.revoke',match[1],now)]);
    requireValue(changed.meta.changes===1,'grant_unavailable',404);return json({revoked:true});
  }
  authorize(principal,'analyses:read');authorize(principal,'scores:read');authorize(principal,'cases:read');
  requireValue(Object.keys(body).every(k=>['analysis_id','node_id','review_record_id','named_grantee','purpose','lifetime_days'].includes(k)),'unexpected_fields');
  const text=(v,min,max)=>typeof v==='string'&&v.trim().length>=min&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
  requireValue(text(body.named_grantee,3,160)&&text(body.purpose,3,300)&&text(body.node_id,3,200)&&/^[0-9a-f-]{36}$/.test(body.review_record_id||''),'invalid_grant_scope');
  requireValue(Number.isInteger(body.lifetime_days)&&body.lifetime_days>=1&&body.lifetime_days<=30,'invalid_grant_lifetime');
  const analysis=await readAnalysis(db,tenant,body.analysis_id);requireValue(analysis.scores.rows.some(r=>r.id===body.node_id),'reference_not_in_analysis',404);
  const subject=`${analysis.id}:${body.node_id}`,expires=now+body.lifetime_days*86400000;
  const review=await statement(db,"SELECT id,expires_at FROM atlas_records WHERE id=? AND tenant_id=? AND kind='review' AND status IN ('reviewed','resolved') AND subject=? AND expires_at>?",body.review_record_id,tenant,subject,now).first();
  requireValue(review&&review.expires_at>=expires,'current_scoped_human_review_required',409);
  await budget(env,`atlas-grants:${tenant}`,10,60);const id=crypto.randomUUID(),token='atlas_'+random();
  const [created]=await db.batch([statement(db,`INSERT INTO atlas_score_grants(id,tenant_id,analysis_id,node_id,review_record_id,named_grantee,purpose,token_hash,created_by,created_at,expires_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM atlas_score_grants WHERE tenant_id=? AND revoked_at IS NULL AND expires_at>?)<100
    AND EXISTS(SELECT 1 FROM atlas_records WHERE id=? AND tenant_id=? AND kind='review' AND status IN ('reviewed','resolved') AND subject=? AND expires_at>=?)`,
    id,tenant,analysis.id,body.node_id,review.id,body.named_grantee.trim(),body.purpose.trim(),await digest(token),principal.id,now,expires,tenant,now,review.id,tenant,subject,expires),
    statement(db,'INSERT INTO audit(id,tenant_id,actor_id,action,resource_id,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),tenant,principal.id,'atlas.grant.create',id,now)]);
  requireValue(created.meta.changes===1,'grant_capacity_or_review_changed',409);
  return json({id,token,expires_at:expires,analysis_id:analysis.id,node_id:body.node_id,endpoint:`/api/porb/v1/atlas/delegated/${id}`,
    token_display:'Shown once. This token only reads the named reference in the named retained analysis.',aml_score:false},201);
}

// Dedicated bearer tokens never enter the ordinary organization API-key path.
export async function atlasDelegatedRoute(path,request,env){
  const match=path.match(/^\/v1\/atlas\/delegated\/([0-9a-f-]{36})$/);if(!match)return null;
  requireValue(request.method==='GET','read_only',405);
  const authorization=request.headers.get('authorization')||'';requireValue(/^Bearer atlas_[0-9a-f]{64}$/.test(authorization),'invalid_delegated_grant',401);
  const db=env.PORB_DB,now=Date.now();
  const grant=await statement(db,`SELECT g.*,r.status AS review_status,r.revision AS review_revision FROM atlas_score_grants g
    JOIN atlas_records r ON r.id=g.review_record_id AND r.tenant_id=g.tenant_id
    JOIN memberships m ON m.tenant_id=g.tenant_id AND m.user_id=g.created_by
    WHERE g.id=? AND g.token_hash=? AND g.revoked_at IS NULL AND g.expires_at>?
    AND r.kind='review' AND r.status IN ('reviewed','resolved') AND r.expires_at>?
    AND r.subject=g.analysis_id||':'||g.node_id AND m.role IN ('owner','admin')`,match[1],await digest(authorization.slice(7)),now,now).first();
  requireValue(grant,'invalid_delegated_grant',401);await budget(env,`atlas-delegated:${grant.id}`,30,60);
  const analysis=await readAnalysis(db,grant.tenant_id,grant.analysis_id),row=analysis.scores.rows.find(r=>r.id===grant.node_id);requireValue(row,'reference_unavailable',404);
  const score=Object.fromEntries(['id','address','kind','incoming_events','outgoing_events','neighbors','active_blocks','incoming_base_units','outgoing_base_units','features','red','blue','blue_components','ensemble_spread','factors'].filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]]));
  await audit(db,{tenant_id:grant.tenant_id,key_id:grant.id},'atlas.delegated.read',grant.analysis_id).run();
  return json({grant:{id:grant.id,named_grantee:grant.named_grantee,purpose:grant.purpose,expires_at:grant.expires_at},
    analysis_id:analysis.id,dataset_digest:analysis.digest,asset:analysis.asset,source:analysis.graph.source,snapshots:analysis.graph.snapshots,
    model:analysis.scores.model,score,human_review_state:{id:grant.review_record_id,status:grant.review_status,revision:grant.review_revision},
    interpretation:'Tenant-delegated descriptive observation scores only; no validated AML score or consequential decision authorization.',aml_score:false});
}
