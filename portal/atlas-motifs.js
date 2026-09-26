import {authorize,audit,budget,json,PortalError,requireValue} from './security.js';
import {readVerifiedAnalysis} from './atlas-evidence.js';
import {scanAtlasMotifs,motifParameters,MotifError} from '../graphus/assets/atlas_motifs.js';

export const MOTIF_QUERY=['analysis','reference','type','max_hops','max_results','window_seconds','min_counterparties','min_events','minimum','start','end'];
export async function atlasMotifsRoute(request,env,principal){
  authorize(principal,'analyses:read');authorize(principal,'scores:read');requireValue(request.method==='GET','method_not_allowed',405);
  const query=new URL(request.url).searchParams,input={},numeric=new Set(['max_hops','max_results','window_seconds','min_counterparties','min_events']);
  for(const key of MOTIF_QUERY.filter(key=>key!=='analysis'))if(query.has(key)){
    const value=query.get(key);requireValue(value.length<=200,'invalid_motif_parameter');
    if(numeric.has(key)){requireValue(/^[1-9][0-9]{0,5}$/.test(value),'invalid_motif_limits');input[key]=Number(value);}else input[key]=value;
  }
  try{
    const parameters=motifParameters(input);await budget(env,`atlas-motifs:${principal.tenant_id}`,20,60);
    const run=await readVerifiedAnalysis(env.PORB_DB,principal.tenant_id,query.get('analysis'));
    const report=await scanAtlasMotifs(run.graph,parameters,{dataset_sha256:run.digest,analysis_id:run.id});
    await audit(env.PORB_DB,principal,'atlas.motifs.read',`${run.id}:${report.report_sha256}`).run();return json(report);
  }catch(error){if(error instanceof MotifError)throw new PortalError(error.message,error.status);throw error;}
}
