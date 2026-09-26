import {authorize,audit,budget,json,PortalError,requireValue} from './security.js';
import {readVerifiedAnalysis} from './atlas-evidence.js';
import {exploreAtlasTimeline,timelineParameters,TimelineError} from '../graphus/assets/atlas_timeline.js';

export const TIMELINE_QUERY=['analysis','reference','direction','kind','minimum','interval','start','end'];
export async function atlasTimelineRoute(request,env,principal){
  authorize(principal,'analyses:read');authorize(principal,'scores:read');requireValue(request.method==='GET','method_not_allowed',405);
  const query=new URL(request.url).searchParams,input={};
  for(const key of TIMELINE_QUERY.filter(key=>key!=='analysis'))if(query.has(key)){const value=query.get(key);requireValue(value.length<=200,'invalid_timeline_parameter');input[key]=value;}
  try{
    const parameters=timelineParameters(input);await budget(env,`atlas-timeline:${principal.tenant_id}`,20,60);
    const run=await readVerifiedAnalysis(env.PORB_DB,principal.tenant_id,query.get('analysis'));
    const report=await exploreAtlasTimeline(run.graph,parameters,{dataset_sha256:run.digest,analysis_id:run.id});
    await audit(env.PORB_DB,principal,'atlas.timeline.read',`${run.id}:${report.report_sha256}`).run();return json(report);
  }catch(error){if(error instanceof TimelineError)throw new PortalError(error.message,error.status);throw error;}
}
