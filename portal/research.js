import {authorize,bodyOf,requireValue,budget,json,statement,audit,SCOPES} from './security.js';
import {readAnalysis,referenceOf,COVERAGE} from './intelligence.js';
import {evidenceProfile} from '../graphus/assets/evidence_profile.js';
import {VERSION} from './model.js';

export async function researchRoute(path,request,env,principal) {
  const db=env.PORB_DB,tenant=principal.tenant_id,method=request.method,url=new URL(request.url);
  if(path==='/v1/capabilities'&&method==='GET') {
    authorize(principal,'data:read');
    return json({api_version:'1.2',model_version:VERSION,assets:['BTC','ETH','USDT','USDC','BLCH'],
      granted_scopes:principal.type==='key'?principal.scopes:SCOPES.filter(s=>principal.role!=='viewer'||s.endsWith(':read')),
      limits:{collection_pages:8,collection_references:1200,collection_records:4000,retained_analyses:50,batch_references:25,batch_runs_per_reference:5},
      features:{official_identifiers:'OFAC SDN only; explicit private enrichment',neighborhood:'Ten-neighbor baseline; three nearest references retained',
        reference_index:'Retained, indexed organization samples',graphus_modules:['system/map','chain/network','chain/wallet','chain/balances','chain/activity','chain/bloch-history','chain/transaction-receipt','chain/holders','daas/manifest']},
      authentication:{scheme:'Bearer',key_creation:'/portal/?view=access',key_lifetime_days:[1,90],revocation:'Immediate; keys also require an active owner/admin creator.'},
      documentation:'/developers/',openapi:'/developers/openapi.json',coverage:COVERAGE});
  }
  if(path==='/v1/references/batch'&&method==='POST') {
    authorize(principal,'analyses:read');authorize(principal,'scores:read');
    const body=await bodyOf(request);requireValue(Object.keys(body).every(k=>['asset','references','runs_per_reference'].includes(k)),'unexpected_fields');
    requireValue(Array.isArray(body.references)&&body.references.length>0&&body.references.length<=25,'invalid_batch_size');
    const references=[...new Set(body.references.map(value=>referenceOf(body.asset,value)))],limit=body.runs_per_reference??3;
    requireValue(Number.isInteger(limit)&&limit>=1&&limit<=5,'invalid_runs_per_reference');await budget(env,`reference-batch:${tenant}`,20,60);
    const rows=await statement(db,`WITH matching AS (
      SELECT r.reference,r.node_id,r.score_json,a.id,a.asset,a.created_at,a.digest,a.model_version,
      row_number() OVER (PARTITION BY r.reference ORDER BY a.created_at DESC,a.id DESC) AS ordinal
      FROM analysis_references r JOIN analyses a ON a.id=r.analysis_id
      WHERE a.tenant_id=? AND a.asset=? AND r.reference IN (SELECT value FROM json_each(?)))
      SELECT * FROM matching WHERE ordinal<=? ORDER BY reference,ordinal`,tenant,body.asset,JSON.stringify(references),limit).all();
    const counts=await statement(db,'SELECT count(*) AS retained,coalesce(sum(indexed_at IS NOT NULL),0) AS indexed FROM analyses WHERE tenant_id=? AND asset=?',tenant,body.asset).first();
    const items=references.map(reference=>({reference,observations:rows.results.filter(row=>row.reference===reference).map(({score_json,ordinal,reference,...row})=>({...row,score:JSON.parse(score_json)}))}));
    await audit(db,principal,'reference.batch',`${body.asset}:${references.length}`).run();
    return json({asset:body.asset,requested:body.references.length,unique_references:references.length,runs_per_reference:limit,items,index:counts,coverage:COVERAGE});
  }
  const match=path.match(/^\/v1\/analyses\/([0-9a-f-]{36})\/(profile|ml|neighbors)$/);
  if(!match)return null;
  requireValue(method==='GET','method_not_allowed',405);authorize(principal,'analyses:read');authorize(principal,'scores:read');
  const result=await readAnalysis(db,tenant,match[1]),context={analysis_id:result.id,asset:result.asset,dataset_digest:result.digest,model_version:result.model_version};
  await audit(db,principal,`analysis.${match[2]}`,result.id).run();
  if(match[2]==='profile')return json({...context,profile:result.scores.evidence_profile||evidenceProfile(result.graph),source:result.graph.source,snapshots:result.graph.snapshots});
  if(match[2]==='ml')return json({...context,model:result.scores.model,isolation:result.scores.ml,
    neighborhood:result.scores.neighborhood||{available:false,reason:'This saved analysis predates the neighborhood baseline.'},clustering:result.scores.clusters,statistics:result.scores.statistics,correlation:result.scores.correlation});
  const reference=referenceOf(result.asset,url.searchParams.get('reference'));
  const normalize=value=>result.asset==='BTC'&&!/^bc1/i.test(value)?value:value.toLowerCase();
  const row=result.scores.rows.find(r=>normalize(r.address)===reference);requireValue(row,'reference_not_in_analysis',404);
  return json({...context,reference,node_id:row.id,available:Boolean(row.neighborhood),neighborhood:row.neighborhood,
    model:result.scores.neighborhood?.model??null,reason:row.neighborhood?null:result.scores.neighborhood?.reason||'This saved analysis predates the neighborhood baseline.'});
}
