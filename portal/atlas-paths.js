import {authorize, audit, budget, json, PortalError, requireValue} from './security.js';
import {readVerifiedAnalysis} from './atlas-evidence.js';
import {traceAtlasPaths, pathParameters, PathError} from '../graphus/assets/atlas_paths.js';

export const PATH_QUERY = ['analysis','from','to','max_hops','max_paths','max_gap_seconds','max_duration_seconds','minimum','start','end'];
export async function atlasPathsRoute(request, env, principal) {
  authorize(principal, 'analyses:read'); authorize(principal, 'scores:read');
  requireValue(request.method === 'GET', 'method_not_allowed', 405);
  const query = new URL(request.url).searchParams, input = {};
  for (const key of PATH_QUERY.filter(k => k !== 'analysis')) if (query.has(key)) {
    const value = query.get(key);
    requireValue(value.length <= 200, 'invalid_path_parameter');
    if (key.startsWith('max_')) {requireValue(/^[1-9][0-9]{0,5}$/.test(value),'invalid_path_limits'); input[key] = Number(value);}
    else input[key] = value;
  }
  try {
    const parameters = pathParameters(input);
    await budget(env, `atlas-paths:${principal.tenant_id}`, 20, 60);
    const run = await readVerifiedAnalysis(env.PORB_DB, principal.tenant_id, query.get('analysis'));
    const report = await traceAtlasPaths(run.graph, parameters, {dataset_sha256:run.digest, analysis_id:run.id});
    await audit(env.PORB_DB, principal, 'atlas.paths.read', `${run.id}:${report.report_sha256}`).run();
    return json(report);
  } catch (error) {if (error instanceof PathError) throw new PortalError(error.message, error.status); throw error;}
}
