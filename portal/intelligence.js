import {requireValue,bodyOf,json,authorize,statement,audit,digest} from './security.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const COVERAGE='Matches describe retained, indexed source samples in this organization. Absence is not evidence of inactivity. Scores are sample-relative descriptions, not AML judgments or ownership assessments.';
export function referenceOf(asset,value){
  requireValue(typeof value==='string'&&value.length<=100,'invalid_reference');
  if(['ETH','USDT','USDC'].includes(asset)){requireValue(/^0x[0-9a-f]{40}$/i.test(value),'invalid_reference');return value.toLowerCase();}
  if(asset==='BLCH'){requireValue(/^[0-9a-f]{64}$/i.test(value),'invalid_reference');return value.toLowerCase();}
  requireValue(asset==='BTC'&&/^(bc1[ac-hj-np-z02-9]{11,87}|BC1[AC-HJ-NP-Z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(value),'invalid_reference');
  return /^(bc1|BC1)/.test(value)?value.toLowerCase():value;
}
const normalized=(asset,value)=>asset==='BTC'&&!/^bc1/i.test(value)?value:value.toLowerCase();
function fields(body,names){requireValue(Object.keys(body).every(k=>names.includes(k)),'unexpected_fields');}
function pageOf(url){
  const raw=url.searchParams.get('limit')||'25';requireValue(/^(?:[1-9]|[1-4][0-9]|50)$/.test(raw),'invalid_limit');
  const cursor=url.searchParams.get('cursor');let time=Number.MAX_SAFE_INTEGER,id='~';
  if(cursor!==null){const parts=cursor.split(':');requireValue(parts.length===2&&/^[0-9]{1,16}$/.test(parts[0])&&Number.isSafeInteger(Number(parts[0]))&&UUID.test(parts[1]),'invalid_cursor');[time,id]=[Number(parts[0]),parts[1]];}
  return {limit:Number(raw),time,id};
}
function paged(rows,page){const items=rows.slice(0,page.limit),last=items.at(-1);return {items,next_cursor:rows.length>page.limit?`${last.created_at}:${last.id}`:null};}
export function indexStatements(db,result,tenant){
  const rows=result.scores.rows.filter(r=>r.address).map(row=>({reference:normalized(result.asset,row.address),node_id:row.id,score:row})),queries=[];
  for(let i=0;i<rows.length;i+=50)queries.push(statement(db,`INSERT OR REPLACE INTO analysis_references(analysis_id,reference,node_id,score_json)
    SELECT ?,json_extract(value,'$.reference'),json_extract(value,'$.node_id'),json_extract(value,'$.score') FROM json_each(?)
    WHERE EXISTS(SELECT 1 FROM analyses WHERE id=? AND tenant_id=?)`,result.id,JSON.stringify(rows.slice(i,i+50)),result.id,tenant));
  queries.push(statement(db,'UPDATE analyses SET indexed_at=? WHERE id=? AND tenant_id=?',Date.now(),result.id,tenant));return queries;
}
export async function readAnalysis(db,tenant,id){
  requireValue(UUID.test(id||''),'analysis_unavailable',404);
  const row=await statement(db,'SELECT indexed_at FROM analyses WHERE id=? AND tenant_id=?',id,tenant).first();requireValue(row,'analysis_unavailable',404);
  const parts=await statement(db,'SELECT p.payload FROM analysis_parts p JOIN analyses a ON a.id=p.analysis_id WHERE a.id=? AND a.tenant_id=? ORDER BY p.part',id,tenant).all();
  const result=JSON.parse(parts.results.map(p=>p.payload).join(''));
  if(row.indexed_at===null)await db.batch(indexStatements(db,result,tenant));
  return result;
}
export async function watchStatements(db,principal,result){
  const entries=await statement(db,'SELECT id,reference FROM watch_entries WHERE tenant_id=? AND asset=?',principal.tenant_id,result.asset).all();
  const byRef=new Map(result.scores.rows.map(row=>[normalized(result.asset,row.address),row])),queries=[],matches=[];
  for(const entry of entries.results){
    const row=byRef.get(entry.reference);if(!row)continue;
    const payload={asset:result.asset,reference:entry.reference,analysis_id:result.id,dataset_digest:result.digest,model_version:result.model_version,red:row.red,blue:row.blue,incoming_events:row.incoming_events,outgoing_events:row.outgoing_events,source:result.graph.source,snapshots:result.graph.snapshots,coverage:COVERAGE};
    matches.push({id:crypto.randomUUID(),watch_id:entry.id,analysis_id:result.id,payload,created_at:Date.now()});
  }
  for(let i=0;i<matches.length;i+=20)queries.push(statement(db,`INSERT OR IGNORE INTO observation_events(id,watch_id,analysis_id,payload,created_at)
    SELECT json_extract(value,'$.id'),json_extract(value,'$.watch_id'),json_extract(value,'$.analysis_id'),json_extract(value,'$.payload'),json_extract(value,'$.created_at') FROM json_each(?)
    WHERE json_extract(value,'$.watch_id') IN (SELECT id FROM watch_entries WHERE tenant_id=?)`,JSON.stringify(matches.slice(i,i+20)),principal.tenant_id));
  // Keep 500 observations per organization; explicit in the API/UI contract.
  if(queries.length)queries.push(statement(db,`DELETE FROM observation_events WHERE watch_id IN (SELECT id FROM watch_entries WHERE tenant_id=?) AND id NOT IN
    (SELECT e.id FROM observation_events e JOIN watch_entries w ON w.id=e.watch_id WHERE w.tenant_id=? ORDER BY e.created_at DESC,e.id DESC LIMIT 500)`,principal.tenant_id,principal.tenant_id));
  return queries;
}
async function caseOf(db,tenant,id){const row=await statement(db,'SELECT * FROM cases WHERE id=? AND tenant_id=?',id,tenant).first();requireValue(row,'case_unavailable',404);return row;}
export async function intelligenceRoute(path,request,env,principal){
  const db=env.PORB_DB,tenant=principal.tenant_id,url=new URL(request.url),method=request.method;
  if(path==='/v1/references'&&method==='GET'){
    authorize(principal,'analyses:read');authorize(principal,'scores:read');
    const asset=url.searchParams.get('asset'),reference=referenceOf(asset,url.searchParams.get('reference')),p=pageOf(url);
    const rows=await statement(db,`SELECT a.id,a.asset,a.created_at,a.digest,a.model_version,r.node_id,r.score_json FROM analysis_references r JOIN analyses a ON a.id=r.analysis_id
      WHERE a.tenant_id=? AND a.asset=? AND r.reference=? AND (a.created_at<? OR (a.created_at=? AND a.id<?)) ORDER BY a.created_at DESC,a.id DESC LIMIT ?`,tenant,asset,reference,p.time,p.time,p.id,p.limit+1).all();
    const counts=await statement(db,'SELECT count(*) AS retained,coalesce(sum(indexed_at IS NOT NULL),0) AS indexed FROM analyses WHERE tenant_id=? AND asset=?',tenant,asset).first();
    const items=rows.results.map(({score_json,...row})=>({...row,score:JSON.parse(score_json)}));
    return json({...paged(items,p),asset,reference,index:counts,coverage:COVERAGE});
  }
  if(path==='/v1/cases'){
    if(method==='GET'){
      authorize(principal,'cases:read');const p=pageOf(url),rows=await statement(db,`SELECT c.*, (SELECT count(*) FROM case_evidence e WHERE e.case_id=c.id) AS evidence_count FROM cases c
        WHERE tenant_id=? AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT ?`,tenant,p.time,p.time,p.id,p.limit+1).all();return json({...paged(rows.results,p),capacity:100});
    }
    if(method==='POST'){
      authorize(principal,'cases:write');const body=await bodyOf(request);fields(body,['title']);requireValue(typeof body.title==='string'&&body.title.trim().length>=3&&body.title.length<=120&&!/[\x00-\x1f\x7f]/.test(body.title),'invalid_title');
      const id=crypto.randomUUID(),now=Date.now();
      const result=await db.batch([statement(db,`INSERT INTO cases(id,tenant_id,title,created_by,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM cases WHERE tenant_id=?)<100`,id,tenant,body.title.trim(),principal.key_id||principal.id,now,now,tenant),audit(db,principal,'case.create',id)]);
      requireValue(result[0].meta.changes===1,'case_capacity',409);return json(await caseOf(db,tenant,id),201);
    }
  }
  const caseMatch=path.match(/^\/v1\/cases\/([0-9a-f-]{36})(\/evidence|\/export|\/status)?$/);
  if(caseMatch){
    const [,id,operation]=caseMatch;
    authorize(principal,method==='GET'?'cases:read':'cases:write');const record=await caseOf(db,tenant,id);
    if(method==='GET'&&(!operation||operation==='/export')){
      authorize(principal,'analyses:read');authorize(principal,'scores:read');
      const evidence=await statement(db,'SELECT id,analysis_id,node_id,digest,payload,created_at FROM case_evidence WHERE case_id=? ORDER BY created_at,id',id).all();
      await audit(db,principal,operation==='/export'?'case.export':'case.read',id).run();
      return json({...record,evidence:evidence.results.map(({payload,...row})=>({...row,snapshot:JSON.parse(payload)})),coverage:COVERAGE},200,operation?{'content-disposition':`attachment; filename="porb-case-${id}.json"`}:{});
    }
    if(method==='POST'&&operation==='/status'){
      const body=await bodyOf(request);fields(body,['status']);requireValue(['open','closed'].includes(body.status),'invalid_case_status');
      await db.batch([statement(db,'UPDATE cases SET status=?,updated_at=? WHERE id=? AND tenant_id=?',body.status,Date.now(),id,tenant),audit(db,principal,'case.status',id)]);return json(await caseOf(db,tenant,id));
    }
    if(method==='DELETE'&&!operation){fields(await bodyOf(request),[]);await db.batch([statement(db,'DELETE FROM cases WHERE id=? AND tenant_id=?',id,tenant),audit(db,principal,'case.delete',id)]);return json({deleted:true});}
    if(method==='POST'&&operation==='/evidence'){
      authorize(principal,'analyses:read');authorize(principal,'scores:read');requireValue(record.status==='open','case_closed',409);
      const body=await bodyOf(request);fields(body,['analysis_id','node_id']);requireValue(typeof body.node_id==='string'&&body.node_id.length<=200,'invalid_node');
      const result=await readAnalysis(db,tenant,body.analysis_id),score=result.scores.rows.find(row=>row.id===body.node_id);requireValue(score,'reference_not_in_analysis',404);
      const all=result.graph.edges.filter(e=>e.from===score.id||e.to===score.id),edges=all.slice(0,100),ids=new Set(edges.flatMap(e=>[e.from,e.to]));ids.add(score.id);
      const snapshot={schema_version:1,analysis_id:result.id,asset:result.asset,dataset_digest:result.digest,analysis_created_at:result.created_at,model:result.scores.model,score,source:result.graph.source,snapshots:result.graph.snapshots,nodes:result.graph.nodes.filter(n=>ids.has(n.id)),edges,records_total:all.length,records_returned:edges.length,truncated:all.length>edges.length,coverage:COVERAGE};
      const payload=JSON.stringify(snapshot),hash=await digest(payload),evidenceId=crypto.randomUUID(),now=Date.now();
      const inserted=await db.batch([statement(db,`INSERT OR IGNORE INTO case_evidence(id,case_id,analysis_id,node_id,digest,payload,created_at)
        SELECT ?,?,?,?,?,?,? WHERE (SELECT count(*) FROM case_evidence WHERE case_id=?)<50 AND EXISTS(SELECT 1 FROM cases WHERE id=? AND tenant_id=? AND status='open')`,evidenceId,id,result.id,score.id,hash,payload,now,id,id,tenant),statement(db,'UPDATE cases SET updated_at=? WHERE id=? AND tenant_id=?',now,id,tenant),audit(db,principal,'case.evidence',id)]);
      if(!inserted[0].meta.changes){const existing=await statement(db,'SELECT id,digest FROM case_evidence WHERE case_id=? AND analysis_id=? AND node_id=?',id,result.id,score.id).first();requireValue(existing,'case_closed_or_capacity',409);return json({...existing,duplicate:true});}
      return json({id:evidenceId,digest:hash,snapshot},201);
    }
  }
  if(path==='/v1/watchlists'){
    if(method==='GET'){
      authorize(principal,'watchlists:read');const p=pageOf(url),rows=await statement(db,'SELECT id,asset,reference,created_at FROM watch_entries WHERE tenant_id=? AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT ?',tenant,p.time,p.time,p.id,p.limit+1).all();return json({...paged(rows.results,p),capacity:100,evaluation:'On each new analysis or explicit evaluation of a retained analysis. No background scan or email delivery.'});
    }
    if(method==='POST'){
      authorize(principal,'watchlists:write');const body=await bodyOf(request);fields(body,['asset','reference']);const reference=referenceOf(body.asset,body.reference),id=crypto.randomUUID(),now=Date.now();
      const result=await db.batch([statement(db,'INSERT OR IGNORE INTO watch_entries(id,tenant_id,asset,reference,created_by,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM watch_entries WHERE tenant_id=?)<100',id,tenant,body.asset,reference,principal.key_id||principal.id,now,tenant),audit(db,principal,'watch.create',id)]);
      if(!result[0].meta.changes){const previous=await statement(db,'SELECT id,asset,reference,created_at FROM watch_entries WHERE tenant_id=? AND asset=? AND reference=?',tenant,body.asset,reference).first();requireValue(previous,'watch_capacity',409);return json({...previous,duplicate:true});}
      return json({id,asset:body.asset,reference,created_at:now},201);
    }
  }
  if(path==='/v1/watchlists/evaluate'&&method==='POST'){
    authorize(principal,'watchlists:write');authorize(principal,'analyses:read');authorize(principal,'scores:read');const body=await bodyOf(request);fields(body,['analysis_id']);
    const result=await readAnalysis(db,tenant,body.analysis_id),queries=await watchStatements(db,principal,result),changed=queries.length?await db.batch([...queries,audit(db,principal,'watch.evaluate',result.id)]):[];
    return json({analysis_id:result.id,observations_created:changed.slice(0,-2).reduce((sum,row)=>sum+row.meta.changes,0),coverage:COVERAGE});
  }
  const watch=path.match(/^\/v1\/watchlists\/([0-9a-f-]{36})$/);
  if(watch&&method==='DELETE'){
    authorize(principal,'watchlists:write');fields(await bodyOf(request),[]);const results=await db.batch([statement(db,'DELETE FROM watch_entries WHERE id=? AND tenant_id=?',watch[1],tenant),audit(db,principal,'watch.delete',watch[1])]);requireValue(results[0].meta.changes===1,'watch_unavailable',404);return json({deleted:true});
  }
  if(path==='/v1/observations'&&method==='GET'){
    authorize(principal,'watchlists:read');authorize(principal,'analyses:read');authorize(principal,'scores:read');const p=pageOf(url);
    const rows=await statement(db,`SELECT e.* FROM observation_events e JOIN watch_entries w ON w.id=e.watch_id WHERE w.tenant_id=? AND (e.created_at<? OR (e.created_at=? AND e.id<?)) ORDER BY e.created_at DESC,e.id DESC LIMIT ?`,tenant,p.time,p.time,p.id,p.limit+1).all();
    return json({...paged(rows.results.map(({payload,...row})=>({...row,observation:JSON.parse(payload)})),p),retention:500,coverage:COVERAGE});
  }
  const review=path.match(/^\/v1\/observations\/([0-9a-f-]{36})\/review$/);
  if(review&&method==='POST'){
    authorize(principal,'watchlists:write');const body=await bodyOf(request);fields(body,[]);const now=Date.now();
    const result=await db.batch([statement(db,'UPDATE observation_events SET reviewed_at=coalesce(reviewed_at,?) WHERE id=? AND watch_id IN (SELECT id FROM watch_entries WHERE tenant_id=?)',now,review[1],tenant),audit(db,principal,'observation.review',review[1])]);requireValue(result[0].meta.changes===1,'observation_unavailable',404);return json({reviewed:true});
  }
  return null;
}
