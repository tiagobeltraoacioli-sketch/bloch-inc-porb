import {authorize,bodyOf,requireValue,budget,json,statement,audit,digest} from './security.js';
import {readAnalysis} from './intelligence.js';
import {officialSnapshot,enrichIdentifiers} from './ofac.js';

export async function enrichmentRoute(path,request,env,principal,fetcher) {
  const match=path.match(/^\/v1\/analyses\/([0-9a-f-]{36})\/enrichment$/);if(!match)return null;
  authorize(principal,'analyses:read');authorize(principal,'scores:read');authorize(principal,'data:read');
  const db=env.PORB_DB,id=match[1];
  if(request.method==='GET') {
    const row=await statement(db,'SELECT e.payload,e.digest FROM analysis_enrichments e JOIN analyses a ON a.id=e.analysis_id WHERE a.id=? AND a.tenant_id=?',id,principal.tenant_id).first();
    requireValue(row,'enrichment_unavailable',404);
    const result=JSON.parse(row.payload);
    await audit(db,principal,'enrichment.read',id).run();
    return json({...result,report_digest:row.digest,source_expired:Date.now()>=Date.parse(result.source.expires_at)});
  }
  requireValue(request.method==='POST','method_not_allowed',405);authorize(principal,'analyses:write');
  requireValue(Object.keys(await bodyOf(request)).length===0,'unexpected_fields');
  const analysis=await readAnalysis(db,principal.tenant_id,id);
  await budget(env,`enrichment-minute:${principal.tenant_id}`,3,60);await budget(env,`enrichment-day:${principal.tenant_id}`,24,86400);
  const snapshot=await officialSnapshot(fetcher),result=enrichIdentifiers(analysis,snapshot),payload=JSON.stringify(result),hash=await digest(payload);
  await db.batch([statement(db,`INSERT INTO analysis_enrichments(analysis_id,payload,digest,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM analyses WHERE id=? AND tenant_id=?)
    ON CONFLICT(analysis_id) DO UPDATE SET payload=excluded.payload,digest=excluded.digest,created_at=excluded.created_at`,id,payload,hash,Date.now(),id,principal.tenant_id),audit(db,principal,'enrichment.create',id)]);
  return json({...result,report_digest:hash,source_expired:false},201);
}
