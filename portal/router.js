import {PortalError,requireValue,bodyOf,digest,json,principalOf,authorize,budget,statement,audit} from './security.js';
import {authRoute,adminRoute} from './accounts.js';
import {VERSION,MODEL_CARD,scoreGraph} from './model.js';
import {collect,overview,science} from './data.js';
import {intelligenceRoute,indexStatements,readAnalysis,watchStatements} from './intelligence.js';
import {moduleRoute,moduleQuery} from './modules.js';
import {enrichmentRoute} from './enrichment.js';
import {researchRoute} from './research.js';

export async function handlePortal({request,env={},waitUntil,fetcher=fetch}){
  const requestId=crypto.randomUUID();
  const response=await route({request,env,waitUntil,fetcher});
  response.headers.set('x-request-id',requestId);
  response.headers.set('x-porb-api-version','1.2');
  return response;
}
async function route({request,env,waitUntil,fetcher}){
  const url=new URL(request.url),method=request.method,path=url.pathname.replace(/^\/api\/porb/,'');
  try{
    requireValue(url.pathname.startsWith('/api/porb/'),'not_found',404);
    requireValue(['GET','POST','DELETE'].includes(method),'method_not_allowed',405);
    const allowed=moduleQuery(path)||(/^\/v1\/analyses\/[0-9a-f-]{36}\/neighbors$/.test(path)?['reference']:path==='/v1/science'?['network']:path==='/v1/references'?['asset','reference','limit','cursor']:['/v1/cases','/v1/watchlists','/v1/observations'].includes(path)?['limit','cursor']:[]);
    requireValue([...url.searchParams.keys()].every(k=>allowed.includes(k)&&url.searchParams.getAll(k).length===1),'unexpected_parameters');
    if(method!=='GET'&&!request.headers.has('authorization'))requireValue(request.headers.get('origin')===url.origin&&request.headers.get('x-porb-action')==='1','same_origin_action_required',403);
    if(path==='/auth/config'&&method==='GET')return json({enabled:Boolean(env.PORB_DB&&env.PORB_AUTH_PEPPER),access:'invitation-only',networks:['Bitcoin','Ethereum','Bloch'],model:VERSION});
    requireValue(env.PORB_DB&&typeof env.PORB_AUTH_PEPPER==='string'&&env.PORB_AUTH_PEPPER.length>=32,'portal_unavailable',503);
    const principal=await principalOf(request,env);
    if(path.startsWith('/auth/')){
      requireValue(!request.headers.has('authorization'),'browser_session_required',403);
      const response=await authRoute(path,request,env,principal);if(response){
        if(response.ok&&waitUntil)waitUntil(env.PORB_DB.batch([statement(env.PORB_DB,'DELETE FROM sessions WHERE expires_at<?',Date.now()),statement(env.PORB_DB,'DELETE FROM budget WHERE expires_at<?',Date.now())]).catch(()=>{}));
        return response;
      }
    }
    requireValue(principal,'authentication_required',401);
    await budget(env,`requests:${principal.key_id||principal.id}`,120,60);
    if(principal.type==='key')await statement(env.PORB_DB,'UPDATE api_keys SET last_used_at=? WHERE id=?',Date.now(),principal.key_id).run();
    const administration=await adminRoute(path,request,env,principal);if(administration)return administration;
    const module=await moduleRoute(path,request,env,principal,fetcher);if(module)return module;
    const enrichment=await enrichmentRoute(path,request,env,principal,fetcher);if(enrichment)return enrichment;
    const research=await researchRoute(path,request,env,principal);if(research)return research;
    const intelligence=await intelligenceRoute(path,request,env,principal);if(intelligence)return intelligence;
    if(path==='/v1/model'&&method==='GET'){authorize(principal,'scores:read');return json(MODEL_CARD);}
    if(path==='/v1/overview'&&method==='GET'){
      authorize(principal,'data:read');await budget(env,`overview:${principal.tenant_id}`,30,60);return json(await overview(fetcher));
    }
    if(path==='/v1/science'&&method==='GET'){
      authorize(principal,'data:read');await budget(env,`science:${principal.tenant_id}`,30,60);return json(await science(url.searchParams.get('network'),fetcher));
    }
    const db=env.PORB_DB;
    if(path==='/v1/analyses'&&method==='POST'){
      authorize(principal,'analyses:write');authorize(principal,'scores:read');authorize(principal,'data:read');
      const body=await bodyOf(request);requireValue(Object.keys(body).every(k=>['asset','pages'].includes(k)),'unexpected_fields');
      await budget(env,`analysis-minute:${principal.tenant_id}`,6,60);await budget(env,`analysis-day:${principal.tenant_id}`,100,86400);
      const graph=await collect(body.asset,body.pages??2,fetcher),scores=scoreGraph(graph),id=crypto.randomUUID(),createdAt=Date.now();
      const hash=await digest(JSON.stringify(graph)),summary={id,asset:graph.asset,model_version:VERSION,digest:hash,wallets:scores.cohort_size,records:graph.edges.length,pages:graph.returned_pages,red_median:scores.statistics.red.median,blue_median:scores.statistics.blue.median,created_at:createdAt};
      const result={...summary,graph,scores},serialized=JSON.stringify(result);requireValue(new TextEncoder().encode(serialized).length<=6000000,'analysis_storage_capacity',422);
      const parts=[];for(let start=0;start<serialized.length;start+=250000)parts.push(statement(db,'INSERT INTO analysis_parts(analysis_id,part,payload) VALUES(?,?,?)',id,parts.length,serialized.slice(start,start+250000)));
      const watches=await watchStatements(db,principal,result);
      await db.batch([statement(db,'INSERT INTO analyses(id,tenant_id,created_by,asset,model_version,digest,summary_json,result_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)',id,principal.tenant_id,principal.key_id||principal.id,graph.asset,VERSION,hash,JSON.stringify(summary),'{}',createdAt),...parts,...indexStatements(db,result,principal.tenant_id),...watches,audit(db,principal,'analysis.create',id),statement(db,'DELETE FROM analyses WHERE tenant_id=? AND id NOT IN (SELECT id FROM analyses WHERE tenant_id=? ORDER BY created_at DESC,id DESC LIMIT 50)',principal.tenant_id,principal.tenant_id)]);
      return json(result,201);
    }
    if(path==='/v1/analyses'&&method==='GET'){
      authorize(principal,'analyses:read');authorize(principal,'scores:read');
      const rows=await statement(db,'SELECT summary_json FROM analyses WHERE tenant_id=? ORDER BY created_at DESC,id DESC LIMIT 50',principal.tenant_id).all();return json({analyses:rows.results.map(r=>JSON.parse(r.summary_json)),retention:{latest_per_organization:50}});
    }
    const single=path.match(/^\/v1\/analyses\/([0-9a-f-]{36})(\/scores|\/export)?$/);
    if(single&&method==='GET'){
      authorize(principal,'analyses:read');authorize(principal,'scores:read');
      const result=await readAnalysis(db,principal.tenant_id,single[1]);await audit(db,principal,single[2]==='/export'?'analysis.export':'analysis.read',single[1]).run();
      if(single[2]==='/scores')return json({id:result.id,digest:result.digest,model:result.scores.model,asset:result.asset,rows:result.scores.rows});
      return json(result,200,single[2]==='/export'?{'content-disposition':`attachment; filename="porb-${single[1]}.json"`}:{});
    }
    if(path==='/maintenance'&&method==='POST'){
      requireValue(principal.type==='session'&&principal.role==='owner','owner_required',403);
      await db.batch([statement(db,'DELETE FROM sessions WHERE expires_at<?',Date.now()),statement(db,'DELETE FROM budget WHERE expires_at<?',Date.now()),statement(db,'DELETE FROM audit WHERE tenant_id=? AND id NOT IN (SELECT id FROM audit WHERE tenant_id=? ORDER BY created_at DESC LIMIT 2000)',principal.tenant_id,principal.tenant_id)]);return json({cleaned:true});
    }
    throw new PortalError('not_found',404);
  }catch(error){
    if(!(error instanceof PortalError))console.error('porb_runtime_failure',error.name,String(error.message).slice(0,300));
    const status=error instanceof PortalError?error.status:503;
    return json({error:error instanceof PortalError?error.message:'portal_request_failed'},status,status===429?{'retry-after':String(error.retryAfter||60)}:{});
  }
}
