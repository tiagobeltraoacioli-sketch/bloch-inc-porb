import {PortalError,requireValue,bodyOf,authorize,budget,json,audit,statement} from './security.js';
import {fetchChainContext,validateChainQuery} from '../deploy/blochai-public/chain-data.js';
import {MODES,compactObservations} from '../deploy/blochai-public/chain-guide.js';
import {deriveChainInsights} from '../deploy/blochai-public/chain-insights.js';

const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export function normalizeResearch(value){
  requireValue(record(value)&&Object.keys(value).every(key=>['network','subject','from','to','instructions','mode'].includes(key)),'blochai_invalid_research');
  let query;try{query=validateChainQuery({portal:'rednblue',network:value.network,subject:value.subject});}catch{throw new PortalError('blochai_invalid_research');}
  const mode=value.mode??'explain',instructions=value.instructions??'';
  requireValue(MODES.has(mode)&&typeof instructions==='string'&&instructions.length<=1000,'blochai_invalid_research');
  for(const key of ['from','to'])requireValue(value[key]===undefined||date(value[key]),'blochai_invalid_dates');
  requireValue(!value.from||!value.to||value.from<=value.to,'blochai_invalid_dates');
  return {network:query.network,...(query.subject?{subject:query.subject}:{}),...(value.from?{from:value.from}:{}),...(value.to?{to:value.to}:{}),instructions,mode};
}
const preset=row=>({id:row.id,label:row.label,research:JSON.parse(row.settings_json),created_at:row.created_at,updated_at:row.updated_at});
export async function researchRoute(path,request,env,principal){
  const match=path.match(/^\/v1\/blochai\/research(?:\/([a-zA-Z0-9_-]{1,128}))?$/);if(!match)return null;
  const id=match[1],db=env.PORB_DB,context={organization_id:principal.tenant_id};
  if(request.method==='GET'&&!id){
    authorize(principal,'analyses:read');
    const rows=await statement(db,'SELECT * FROM blochai_research_presets WHERE tenant_id=? AND user_id=? ORDER BY updated_at DESC LIMIT 25',principal.tenant_id,principal.id).all();
    return json({...context,presets:rows.results.map(preset)});
  }
  requireValue(['POST','DELETE'].includes(request.method),'method_not_allowed',405);authorize(principal,'analyses:write');
  await budget(env,`blochai-preset:${principal.tenant_id}:${principal.id}`,30,60);
  if(id){const row=await statement(db,'SELECT id FROM blochai_research_presets WHERE id=? AND tenant_id=? AND user_id=?',id,principal.tenant_id,principal.id).first();requireValue(row,'blochai_research_not_found',404);}
  if(request.method==='DELETE'){
    requireValue(id,'not_found',404);
    await statement(db,'DELETE FROM blochai_research_presets WHERE id=? AND tenant_id=? AND user_id=?',id,principal.tenant_id,principal.id).run();
    await audit(db,principal,'blochai.research.delete',id).run();return json({...context,deleted:true});
  }
  const body=await bodyOf(request);requireValue(Object.keys(body).every(key=>['label','research'].includes(key))&&typeof body.label==='string'&&body.label.trim().length>0&&body.label.length<=80,'blochai_invalid_research');
  const research=normalizeResearch(body.research),now=Date.now(),presetId=id||crypto.randomUUID();
  if(id)await statement(db,'UPDATE blochai_research_presets SET label=?,settings_json=?,updated_at=? WHERE id=? AND tenant_id=? AND user_id=?',body.label.trim(),JSON.stringify(research),now,id,principal.tenant_id,principal.id).run();
  else{
    const insertion=await statement(db,'INSERT INTO blochai_research_presets(id,tenant_id,user_id,label,settings_json,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM blochai_research_presets WHERE tenant_id=? AND user_id=?)<25',presetId,principal.tenant_id,principal.id,body.label.trim(),JSON.stringify(research),now,now,principal.tenant_id,principal.id).run();
    requireValue(insertion.meta.changes===1,'blochai_research_limit',409);
  }
  await audit(db,principal,id?'blochai.research.update':'blochai.research.create',presetId).run();
  const saved=await statement(db,'SELECT * FROM blochai_research_presets WHERE id=? AND tenant_id=? AND user_id=?',presetId,principal.tenant_id,principal.id).first();
  return json({...context,preset:preset(saved)},id?200:201);
}

export async function prepareResearch(prompt,research,fetcher){
  requireValue(prompt.length<=1500,'blochai_research_prompt_too_long');
  // Only public network identifiers cross this boundary; instructions and session data stay private.
  const guide=await fetchChainContext({portal:'rednblue',network:research.network,subject:research.subject,fetcher});
  if(research.from||research.to){
    const first=research.from?Date.parse(research.from):-Infinity,last=research.to?Date.parse(research.to)+86400000:Infinity;
    guide.transactions=guide.transactions.filter(row=>!row.timestamp||(Date.parse(row.timestamp)>=first&&Date.parse(row.timestamp)<last));
    guide.graph={nodes:[],edges:[]};
    guide.coverage+=' Date limits apply only to returned transactions with timestamps; undated records remain. The graph is omitted. Balances and network facts retain their source observation time; this is not a historical scan.';
  }
  const derived=deriveChainInsights(guide);
  guide.derived_facts=derived.facts;guide.insights=derived.insights;
  const facts=guide.facts.map(f=>`${f.label}: ${f.value}${f.unit?' '+f.unit:''}`).join('\n').slice(0,400);
  const sources=guide.sources.map(source=>`${source.id}: ${source.status}; observed ${source.observed_at||'unknown'}; retrieved ${source.retrieved_at||'unknown'}; ${source.coverage.slice(0,guide.sources.length===1?240:100)}`).join('\n');
  const composed=`You are BlochAI, a private blockchain research assistant. Do not infer identity or ownership. Use bounded source data and disclose gaps. Style: ${research.mode}. Network: ${research.network}. Status: ${guide.status}.\nQuestion: ${prompt}\nResearch instructions: ${research.instructions}\n${research.subject?`Subject: ${research.subject.kind} ${research.subject.value}\n`:''}Dates: ${research.from||'none'} to ${research.to||'none'}, returned dated transactions only, not a historical scan. Balances/network facts remain at source time.\nFacts:\n${facts||'Unavailable.'}\nSource coverage and times:\n${sources}`;
  requireValue(composed.length<=4000,'blochai_research_prompt_too_long');
  return {prompt:composed,observations:compactObservations(guide),guide:{...guide,portal:'rednblue',mode:research.mode,research}};
}
export async function saveResearchSnapshot(env,principal,id,guide){
  const now=Date.now();
  await statement(env.PORB_DB,'DELETE FROM blochai_research_snapshots WHERE expires_at<=?',now).run();
  await statement(env.PORB_DB,'INSERT INTO blochai_research_snapshots(task_id,tenant_id,user_id,guide_json,expires_at) VALUES(?,?,?,?,?)',id,principal.tenant_id,principal.id,JSON.stringify(guide),now+86400000).run();
}
export async function readResearchSnapshot(env,principal,id){
  const row=await statement(env.PORB_DB,'SELECT guide_json FROM blochai_research_snapshots WHERE task_id=? AND tenant_id=? AND user_id=? AND expires_at>?',id,principal.tenant_id,principal.id,Date.now()).first();
  return row?JSON.parse(row.guide_json):null;
}
