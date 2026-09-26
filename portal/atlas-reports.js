import {authorize,audit,bodyOf,budget,digest,json,PortalError,requireValue,statement} from './security.js';
import {readVerifiedAnalysis} from './atlas-evidence.js';
import {compareAnalyses,COMPARISON_VERSION} from './atlas-comparison.js';
import {traceAtlasPaths,pathParameters,PathError,PATH_VERSION} from '../graphus/assets/atlas_paths.js';
import {scanAtlasMotifs,motifParameters,MOTIF_VERSION} from '../graphus/assets/atlas_motifs.js';
import {exploreAtlasTimeline,timelineParameters,TIMELINE_VERSION} from '../graphus/assets/atlas_timeline.js';

export const REPORT_LIMITS = Object.freeze({capacity:20,bytes:6000000,maximum_days:365});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH=/^[a-f0-9]{64}$/;
const VERSIONS={paths:PATH_VERSION,comparison:COMPARISON_VERSION,motifs:MOTIF_VERSION,timeline:TIMELINE_VERSION};
// Keep UTF-16 surrogate pairs together so each SQL text part is valid UTF-8.
function chunks(payload){
  const parts=[];for(let start=0;start<payload.length;){let end=Math.min(start+200000,payload.length);const code=payload.charCodeAt(end-1);if(code>=0xd800&&code<=0xdbff)end--;parts.push(payload.slice(start,end));start=end;}return parts;
}
export const REPORT_COLUMNS='id,kind,title,purpose,lawful_basis,source_licence,asset,report_version,report_sha256,payload_sha256,parameters_json,summary_json,payload_bytes,part_count,created_by,created_at,expires_at';
const COLUMNS=REPORT_COLUMNS;
const keys=(body,allowed)=>requireValue(body&&typeof body==='object'&&!Array.isArray(body)&&Object.keys(body).every(key=>allowed.includes(key)),'unexpected_fields');
const text=(value,max)=>typeof value==='string'&&value.trim().length>=3&&value.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
export const reportMetadata=({parameters_json,summary_json,request_digest,request_id,...row})=>({...row,parameters:JSON.parse(parameters_json),summary:JSON.parse(summary_json),review_subject:'atlas-report:'+row.id});
const metadata=reportMetadata;
function normalize(body){
  keys(body,['request_id','kind','title','purpose','lawful_basis','source_licence','retention_days','parameters','expected_report_sha256']);
  requireValue(UUID.test(body.request_id||'')&&Object.hasOwn(VERSIONS,body.kind)&&HASH.test(body.expected_report_sha256||''),'invalid_report_identity');
  requireValue(text(body.title,120)&&['purpose','lawful_basis','source_licence'].every(key=>text(body[key],300)),'invalid_report_governance');
  requireValue(Number.isInteger(body.retention_days)&&body.retention_days>=1&&body.retention_days<=365,'invalid_retention');
  let parameters;
  if(body.kind==='paths'){
    keys(body.parameters,['analysis','from','to','max_hops','max_paths','max_gap_seconds','max_duration_seconds','minimum','start','end']);
    const {analysis,...input}=body.parameters;requireValue(UUID.test(analysis||''),'invalid_report_analysis');
    parameters={analysis,...pathParameters(input)};
  }else if(body.kind==='motifs'){
    keys(body.parameters,['analysis','reference','type','max_hops','max_results','window_seconds','min_counterparties','min_events','minimum','start','end']);
    const {analysis,...input}=body.parameters;requireValue(UUID.test(analysis||''),'invalid_report_analysis');
    parameters={analysis,...motifParameters(input)};
  }else if(body.kind==='timeline'){
    keys(body.parameters,['analysis','reference','direction','kind','minimum','interval','start','end']);
    const {analysis,...input}=body.parameters;requireValue(UUID.test(analysis||''),'invalid_report_analysis');
    parameters={analysis,...timelineParameters(input)};
  }else{
    keys(body.parameters,['baseline','current','reference']);const {baseline,current,reference=null}=body.parameters;
    requireValue(UUID.test(baseline||'')&&UUID.test(current||''),'invalid_report_analysis');
    requireValue(reference===null||typeof reference==='string'&&reference.length>0&&reference.length<=200,'invalid_comparison_reference');
    parameters={baseline,current,reference};
  }
  return {kind:body.kind,title:body.title.trim(),purpose:body.purpose.trim(),lawful_basis:body.lawful_basis.trim(),source_licence:body.source_licence.trim(),
    retention_days:body.retention_days,parameters,expected_report_sha256:body.expected_report_sha256};
}
async function computed(db,tenant,input){
  if(input.kind!=='comparison'){
    const {analysis,...parameters}=input.parameters,run=await readVerifiedAnalysis(db,tenant,analysis);
    return ({paths:traceAtlasPaths,motifs:scanAtlasMotifs,timeline:exploreAtlasTimeline}[input.kind])(run.graph,parameters,{dataset_sha256:run.digest,analysis_id:run.id});
  }
  const {baseline,current,reference}=input.parameters,a=await readVerifiedAnalysis(db,tenant,baseline),b=current===baseline?a:await readVerifiedAnalysis(db,tenant,current);
  return compareAnalyses(a,b,reference);
}
function summarize(kind,report){
  if(kind==='timeline')return {events:report.events.length,buckets:report.buckets.length,interval:report.window.interval,reference:report.parameters.reference,records:report.coverage.records,timed_candidates:report.coverage.timed_candidates,start:report.window.start,end_inclusive:report.window.end_inclusive,state:report.state};
  if(kind==='motifs')return {motifs:report.motifs.length,type:report.parameters.type,reference:report.parameters.reference,records:report.coverage.records,eligible_records:report.coverage.eligible_records,truncated:report.search.truncated,complete_within_query:report.search.complete_within_query,state:report.state};
  return kind==='paths'?{paths:report.paths.length,records:report.coverage.records,eligible_records:report.coverage.eligible_records,truncated:report.search.truncated,state:report.state}
    :{events:report.events.length,counts:report.counts,block_conflicts:report.blocks.conflicts.length,truncated:report.limits.truncated};
}
function reportParameters(kind,report){return kind==='comparison'?{baseline:report.baseline.id,current:report.current.id,reference:report.reference}:{analysis:report.provenance.analysis_id,...report.parameters};}
const existing=(db,tenant,requestId)=>statement(db,`SELECT ${COLUMNS},request_digest FROM atlas_reports WHERE tenant_id=? AND request_id=?`,tenant,requestId).first();
function replay(row,requestDigest){
  requireValue(row.request_digest===requestDigest,'report_request_conflict',409);
  requireValue(row.expires_at>Date.now(),'report_request_expired',409);
  return json({...metadata(row),duplicate:true});
}
export async function readVerifiedReport(db,tenant,id){
  const row=await statement(db,`SELECT ${COLUMNS} FROM atlas_reports WHERE id=? AND tenant_id=? AND expires_at>?`,id,tenant,Date.now()).first();
  requireValue(row,'report_unavailable',404);
  requireValue(Number.isInteger(row.part_count)&&row.part_count>=1&&row.part_count<=30&&Number.isInteger(row.payload_bytes)&&row.payload_bytes>=1&&row.payload_bytes<=REPORT_LIMITS.bytes,'report_integrity_failed',409);
  const parts=(await statement(db,'SELECT p.part,p.payload FROM atlas_report_parts p JOIN atlas_reports r ON r.id=p.report_id WHERE r.id=? AND r.tenant_id=? ORDER BY p.part',id,tenant).all()).results;
  requireValue(parts.length===row.part_count&&parts.every((part,i)=>part.part===i&&typeof part.payload==='string'&&part.payload.length<=200000),'report_integrity_failed',409);
  const payload=parts.map(part=>part.payload).join('');
  requireValue(new TextEncoder().encode(payload).length===row.payload_bytes&&await digest(payload)===row.payload_sha256,'report_integrity_failed',409);
  let report;try{report=JSON.parse(payload);}catch{throw new PortalError('report_integrity_failed',409);}
  requireValue(report&&typeof report==='object'&&!Array.isArray(report),'report_integrity_failed',409);
  const {report_sha256,...content}=report;
  requireValue(report_sha256===row.report_sha256&&report.asset===row.asset&&report.version===row.report_version&&await digest(JSON.stringify(content))===report_sha256,'report_integrity_failed',409);
  // Manifest kind, query and summary must describe the verified calculation.
  // Keep prior versions here when adding a new transform version.
  try{requireValue(Object.hasOwn(VERSIONS,row.kind)&&report.version===VERSIONS[row.kind]&&JSON.stringify(summarize(row.kind,report))===row.summary_json&&JSON.stringify(reportParameters(row.kind,report))===row.parameters_json,'report_integrity_failed',409);}
  catch{throw new PortalError('report_integrity_failed',409);}
  requireValue(row.expires_at>Date.now(),'report_unavailable',404);
  return {...metadata(row),integrity:{verified:true,payload_sha256:row.payload_sha256,report_sha256},report};
}

export async function atlasReportsRoute(path,request,env,principal){
  const match=path.match(/^\/v1\/atlas\/reports(?:\/([0-9a-f-]{36})(\/export)?)?$/);if(!match)return null;
  try{
    const [,id,operation]=match,method=request.method,db=env.PORB_DB,tenant=principal.tenant_id;
    authorize(principal,'cases:read');authorize(principal,'analyses:read');authorize(principal,'scores:read');
    if(id)requireValue(UUID.test(id),'report_unavailable',404);
    if(!id&&method==='GET'){
      const rows=await statement(db,`SELECT ${COLUMNS} FROM atlas_reports WHERE tenant_id=? AND expires_at>? ORDER BY created_at DESC,id DESC LIMIT 20`,tenant,Date.now()).all();
      const counts=await statement(db,'SELECT count(*) AS retained,sum(CASE WHEN expires_at<=? THEN 1 ELSE 0 END) AS expired FROM atlas_reports WHERE tenant_id=?',Date.now(),tenant).first();
      await audit(db,principal,'atlas.report.list',null).run();
      return json({reports:rows.results.map(metadata),retention:{...REPORT_LIMITS,retained:counts.retained,expired:counts.expired||0,purge_endpoint:'/api/porb/v1/atlas/purge'}});
    }
    if(id&&method==='GET'){
      const report=await readVerifiedReport(db,tenant,id);await audit(db,principal,operation?'atlas.report.export':'atlas.report.read',id).run();
      return json(report,200,operation?{'content-disposition':`attachment; filename="atlas-report-${id}.json"`}:{});
    }
    authorize(principal,'cases:write');
    if(id&&!operation&&method==='DELETE'){
      const body=await bodyOf(request);keys(body,['payload_sha256']);requireValue(HASH.test(body.payload_sha256||''),'invalid_report_digest');
      const [removed]=await db.batch([statement(db,'DELETE FROM atlas_reports WHERE id=? AND tenant_id=? AND payload_sha256=?',id,tenant,body.payload_sha256),
        statement(db,'INSERT INTO audit(id,tenant_id,actor_id,action,resource_id,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),tenant,principal.key_id||principal.id,'atlas.report.delete',id,Date.now())]);
      requireValue(removed.meta.changes===1,'report_unavailable_or_digest_conflict',409);return json({deleted:true});
    }
    requireValue(!id&&method==='POST','method_not_allowed',405);
    const body=await bodyOf(request),input=normalize(body),requestDigest=await digest(JSON.stringify(input)),prior=await existing(db,tenant,body.request_id);
    if(prior){const response=replay(prior,requestDigest);await audit(db,principal,'atlas.report.retry',prior.id).run();return response;}
    await budget(env,`atlas-report-create:${tenant}`,6,60);
    const count=await statement(db,'SELECT count(*) AS n FROM atlas_reports WHERE tenant_id=?',tenant).first();requireValue(count.n<20,'report_capacity_purge_expired',409);
    const report=await computed(db,tenant,input);
    requireValue(report.report_sha256===input.expected_report_sha256,'report_preview_changed',409);
    const payload=JSON.stringify(report),bytes=new TextEncoder().encode(payload).length;
    requireValue(bytes<=REPORT_LIMITS.bytes,'report_storage_capacity',422);
    const hash=await digest(payload),reportId=crypto.randomUUID(),now=Date.now(),parts=chunks(payload),summary=summarize(input.kind,report);
    const writes=[statement(db,`INSERT OR IGNORE INTO atlas_reports(id,tenant_id,request_id,request_digest,kind,title,purpose,lawful_basis,source_licence,asset,report_version,report_sha256,payload_sha256,parameters_json,summary_json,payload_bytes,part_count,created_by,created_at,expires_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM atlas_reports WHERE tenant_id=?)<20`,reportId,tenant,body.request_id,requestDigest,input.kind,input.title,input.purpose,input.lawful_basis,input.source_licence,report.asset,report.version,report.report_sha256,hash,JSON.stringify(input.parameters),JSON.stringify(summary),bytes,parts.length,principal.key_id||principal.id,now,now+input.retention_days*86400000,tenant)];
    for(let part=0;part<parts.length;part++)writes.push(statement(db,'INSERT INTO atlas_report_parts(report_id,part,payload) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM atlas_reports WHERE id=? AND tenant_id=?)',reportId,part,parts[part],reportId,tenant));
    writes.push(statement(db,'INSERT INTO audit(id,tenant_id,actor_id,action,resource_id,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM atlas_reports WHERE id=? AND tenant_id=?)',crypto.randomUUID(),tenant,principal.key_id||principal.id,'atlas.report.create',reportId,now,reportId,tenant));
    const [inserted]=await db.batch(writes),stored=await existing(db,tenant,body.request_id);
    requireValue(stored,'report_capacity_purge_expired',409);
    return inserted.meta.changes===1?json({...metadata(stored),duplicate:false},201):replay(stored,requestDigest);
  }catch(error){if(error instanceof PathError)throw new PortalError(error.message,error.status);throw error;}
}
