import {digest, requireValue, statement} from './security.js';
import {readAnalysis} from './intelligence.js';

// Retained Atlas calculations bind the payload to its tenant-owned manifest.
export async function readVerifiedAnalysis(db, tenant, id) {
  requireValue(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id || ''), 'analysis_unavailable', 404);
  const manifest = await statement(db, 'SELECT digest,asset,created_at,model_version FROM analyses WHERE id=? AND tenant_id=?', id, tenant).first();
  requireValue(manifest, 'analysis_unavailable', 404);
  const run = await readAnalysis(db, tenant, id);
  requireValue(run.id === id && Object.keys(manifest).every(key => manifest[key] === run[key])
    && run.graph && await digest(JSON.stringify(run.graph)) === manifest.digest, 'analysis_integrity_failed', 409);
  return run;
}
