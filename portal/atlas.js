import {authorize,bodyOf,requireValue,budget,json,statement,audit,admin,SCOPES} from './security.js';
import {MODEL_CARD} from './model.js';
import {OFFICIAL_SOURCES,officialReferences} from './atlas-sources.js';
import {GRANT_COLUMNS} from './atlas-grants.js';
import {atlasComparisonRoute} from './atlas-comparison.js';
import {atlasPathsRoute} from './atlas-paths.js';
import {atlasReportsRoute} from './atlas-reports.js';
import {atlasCasesRoute} from './atlas-cases.js';
import {atlasReviewsRoute,RECORD_COLUMNS,RECORD_HISTORY_LIMIT} from './atlas-reviews.js';
import {atlasMotifsRoute} from './atlas-motifs.js';

const keys=(body,allowed)=>requireValue(Object.keys(body).every(k=>allowed.includes(k)),'unexpected_fields');
const text=(value,min,max)=>typeof value==='string'&&value.trim().length>=min&&value.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
export async function atlasPrivateRoute(path,request,env,principal,fetcher){
  if(!path.startsWith('/v1/atlas/'))return null;
  if(path==='/v1/atlas/compare')return atlasComparisonRoute(request,env,principal);
  if(path==='/v1/atlas/paths')return atlasPathsRoute(request,env,principal);
  if(path==='/v1/atlas/motifs')return atlasMotifsRoute(request,env,principal);
  const savedReport=await atlasReportsRoute(path,request,env,principal);if(savedReport)return savedReport;
  const dossier=await atlasCasesRoute(path,request,env,principal);if(dossier)return dossier;
  const reviews=await atlasReviewsRoute(path,request,env,principal);if(reviews)return reviews;
  const db=env.PORB_DB,tenant=principal.tenant_id,now=Date.now(),method=request.method;
  if(path==='/v1/atlas/sources'){
    authorize(principal,'data:read');
    if(method==='GET')return json({sources:Object.entries(OFFICIAL_SOURCES).map(([id,s])=>({id,url:s.url,reference_pattern:s.reference_pattern})),matching:'Official reference numbers only; no name or wallet attribution.'});
    requireValue(method==='POST','method_not_allowed',405);const body=await bodyOf(request);keys(body,['source','references']);
    requireValue(Object.hasOwn(OFFICIAL_SOURCES,body.source)&&Array.isArray(body.references)&&body.references.length>0&&body.references.length<=25,'invalid_source_reference_query');
    requireValue(body.references.every(r=>typeof r==='string'&&new RegExp(OFFICIAL_SOURCES[body.source].reference_pattern).test(r)),'invalid_official_reference');
    await budget(env,`atlas-sources:${tenant}`,6,60);const snapshot=await officialReferences(body.source,fetcher),refs=new Set(snapshot.references);
    await audit(db,principal,'atlas.source.lookup',`${body.source}:${snapshot.metadata.sha256}`).run();
    return json({source:snapshot.metadata,results:[...new Set(body.references)].map(reference=>({reference,present_in_snapshot:refs.has(reference)})),
      interpretation:'Reference presence describes this official snapshot. It does not associate a person or wallet with a listing or establish a legal conclusion.'});
  }
  if(path==='/v1/atlas/private'&&method==='GET'){
    authorize(principal,'cases:read');
    const records=await statement(db,`SELECT ${RECORD_COLUMNS} FROM atlas_records WHERE tenant_id=? AND expires_at>? ORDER BY updated_at DESC,id DESC LIMIT 200`,tenant,now).all();
    const cases=await statement(db,'SELECT id,title,status,updated_at FROM cases WHERE tenant_id=? ORDER BY updated_at DESC LIMIT 100',tenant).all();
    const granted=principal.type==='key'?principal.scopes:SCOPES.filter(s=>principal.role!=='viewer'||s.endsWith(':read'));
    const grant=principal.type==='key'?await statement(db,'SELECT id,label,scopes_json,expires_at,revoked_at FROM api_keys WHERE id=? AND tenant_id=?',principal.key_id,tenant).first():null;
    await audit(db,principal,'atlas.private.read',null).run();
    const owner=principal.type==='session'&&['owner','admin'].includes(principal.role);
    const access=owner?(await statement(db,'SELECT id,actor_id,action,resource_id,created_at FROM audit WHERE tenant_id=? ORDER BY created_at DESC,id DESC LIMIT 50',tenant).all()).results:null;
    const grants=owner?(await statement(db,`SELECT ${GRANT_COLUMNS} FROM atlas_score_grants WHERE tenant_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY created_at DESC,id DESC LIMIT 100`,tenant,now).all()).results:null;
    return json({tenant:{id:tenant,name:principal.tenant_name},account_identity:principal.type==='session'?{id:principal.id,email:principal.email,role:principal.role}:null,
      records:records.results,cases:cases.results,score_grants:grants,score_version:granted.includes('scores:read')?MODEL_CARD:null,
      score_grant_id:grant?{...grant,scopes:JSON.parse(grant.scopes_json),scopes_json:undefined}:null,granted_scopes:granted,access_audit:access,
      retention:{capacity:200,maximum_days:365,expired_records_hidden:true,purge_endpoint:'/api/porb/v1/atlas/purge',physical_deletion:'On explicit administrator purge; expiry denies reads immediately.'},
      aml_score:{available:false,reason:'No validated AML model. Scoped descriptive scores are a separate product.'},ip_country_context:null});
  }
  if(path==='/v1/atlas/purge'&&method==='POST'){
    admin(principal);keys(await bodyOf(request),[]);
    const [versions,deleted,grants,reports]=await db.batch([statement(db,'DELETE FROM atlas_record_versions WHERE expires_at<=? AND record_id IN (SELECT id FROM atlas_records WHERE tenant_id=?)',now,tenant),statement(db,'DELETE FROM atlas_records WHERE tenant_id=? AND expires_at<=?',tenant,now),statement(db,'DELETE FROM atlas_score_grants WHERE tenant_id=? AND (expires_at<=? OR revoked_at IS NOT NULL)',tenant,now),statement(db,'DELETE FROM atlas_reports WHERE tenant_id=? AND expires_at<=?',tenant,now),audit(db,principal,'atlas.expired.purge',null)]);
    return json({deleted:deleted.meta.changes,deleted_grants:grants.meta.changes,deleted_reports:reports.meta.changes,deleted_versions:versions.meta.changes});
  }
  const match=path.match(/^\/v1\/atlas\/records(?:\/([0-9a-f-]{36}))?$/);
  if(!match)return null;
  authorize(principal,'cases:write');requireValue(['POST','DELETE'].includes(method),'method_not_allowed',405);const id=match[1],body=await bodyOf(request);
  if(method==='DELETE'&&id){keys(body,['revision']);requireValue(Number.isInteger(body.revision)&&body.revision>=1,'invalid_revision');
    const [removed]=await db.batch([statement(db,'DELETE FROM atlas_records WHERE id=? AND tenant_id=? AND revision=?',id,tenant,body.revision),
      statement(db,'INSERT INTO audit(id,tenant_id,actor_id,action,resource_id,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),tenant,principal.key_id||principal.id,'atlas.record.delete',id,now)]);
    requireValue(removed.meta.changes===1,'record_unavailable_or_revision_conflict',409);return json({deleted:true});}
  requireValue(method==='POST','method_not_allowed',405);keys(body,['kind','subject','body','purpose','lawful_basis','source_licence','status','retention_days','revision']);
  requireValue(['annotation','processing','correction','review'].includes(body.kind)&&['open','reviewed','resolved'].includes(body.status),'invalid_record_kind_or_state');
  requireValue(text(body.subject,1,200)&&text(body.body,1,2000)&&text(body.purpose,3,300)&&text(body.lawful_basis,3,300)&&text(body.source_licence,3,300),'invalid_governance_record');
  requireValue(Number.isInteger(body.retention_days)&&body.retention_days>=1&&body.retention_days<=365,'invalid_retention');
  await budget(env,`atlas-records:${tenant}`,30,60);const expires=now+body.retention_days*86400000;
  const values=[body.kind,body.subject.trim(),body.body.trim(),body.purpose.trim(),body.lawful_basis.trim(),body.source_licence.trim(),body.status,now,expires];
  const recordId=id||crypto.randomUUID();let write;
  if(id){requireValue(Number.isInteger(body.revision)&&body.revision>=1,'invalid_revision');
    const workflow=['review','correction'].includes(body.kind)?1:0;
    write=statement(db,`UPDATE atlas_records SET kind=?,subject=?,body=?,purpose=?,lawful_basis=?,source_licence=?,status=?,updated_at=?,expires_at=?,revision=revision+1,updated_by=?,
      assignee_id=CASE WHEN ? THEN assignee_id ELSE NULL END,priority=CASE WHEN ? THEN priority ELSE 'normal' END,due_at=CASE WHEN ? THEN due_at ELSE NULL END
      WHERE id=? AND tenant_id=? AND revision=? AND expires_at>? AND (?=0 OR due_at IS NULL OR due_at<=?)
      AND (SELECT count(*) FROM atlas_record_versions WHERE record_id=?)<?`,...values,principal.key_id||principal.id,workflow,workflow,workflow,id,tenant,body.revision,now,workflow,expires,id,RECORD_HISTORY_LIMIT);
  }else{requireValue(body.revision===undefined,'unexpected_revision');
    write=statement(db,`INSERT INTO atlas_records(id,tenant_id,kind,subject,body,purpose,lawful_basis,source_licence,status,updated_at,expires_at,created_by,created_at,updated_by)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM atlas_records WHERE tenant_id=?)<200`,recordId,tenant,...values,principal.key_id||principal.id,now,principal.key_id||principal.id,tenant);}
  const [changed]=await db.batch([write,statement(db,'INSERT INTO audit(id,tenant_id,actor_id,action,resource_id,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),tenant,principal.key_id||principal.id,id?'atlas.record.update':'atlas.record.create',recordId,now)]);
  requireValue(changed.meta.changes===1,id?'record_unavailable_or_revision_conflict':'record_capacity_purge_expired',409);
  return json(await statement(db,`SELECT ${RECORD_COLUMNS} FROM atlas_records WHERE id=? AND tenant_id=?`,recordId,tenant).first(),id?200:201);
}
