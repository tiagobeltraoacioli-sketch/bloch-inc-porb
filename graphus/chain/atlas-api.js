import {atlasSchema,ASSETS} from '../assets/atlas_registry.js';
import {analyzeAtlas} from '../assets/atlas_engine.js';
import {evidencePacket} from '../assets/system_evidence.js';
import {PUBLIC_READ_CORS} from './system-map-api.js';
import {utcTimestamp} from '../assets/atlas_statistics.js';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...PUBLIC_READ_CORS,'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...(status===405?{Allow:'GET, OPTIONS'}:{})}});
export async function atlasPublicRoute(path,request,getGraph) {
  if(!['atlas/schema','atlas/analyze'].includes(path))return null;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:PUBLIC_READ_CORS});
  if(request.method!=='GET')return json({error:'read_only'},405);
  const url=new URL(request.url);
  if(path==='atlas/schema')return url.searchParams.size?json({error:'unexpected_query'},400):json(atlasSchema());
  const allowed=['asset','cursor','reference','start','end','max_hops','kind','minimum'];
  if(url.search.length>1200||[...url.searchParams].some(([k,v])=>!allowed.includes(k)||url.searchParams.getAll(k).length!==1||v.length>200)||!Object.hasOwn(ASSETS,url.searchParams.get('asset')))return json({error:'invalid_atlas_query'},400);
  const asset=url.searchParams.get('asset'),cursor=url.searchParams.get('cursor');
  if(cursor!==null&&!(asset==='BLCH'?/^[0-9]{1,12}-[a-f0-9]{64}-[0-9]{1,12}$/i:/^(0|[1-9][0-9]{0,11})$/).test(cursor))return json({error:'invalid_cursor'},400);
  const options=Object.fromEntries([...url.searchParams].filter(([key])=>!['asset','cursor'].includes(key)));
  if(options.max_hops!==undefined){if(!/^[1-6]$/.test(options.max_hops))return json({error:'invalid_hop_limit'},400);options.max_hops=Number(options.max_hops);}
  if(options.minimum!==undefined&&!/^(0|[1-9][0-9]{0,77})$/.test(options.minimum))return json({error:'invalid_minimum'},400);
  if(options.kind!==undefined&&options.kind!=='all'&&!globalThis.GraphusAnalytics.KINDS[asset].includes(options.kind))return json({error:'invalid_record_kind'},400);
  for(const key of ['start','end'])if(options[key]!==undefined&&utcTimestamp(options[key])===null)return json({error:'invalid_utc_window'},400);
  if(options.start&&options.end&&(Date.parse(options.end)<Date.parse(options.start)||Date.parse(options.end)-Date.parse(options.start)>366*86400000))return json({error:'invalid_utc_window'},400);
  if(options.reference!==undefined&&!/^[a-zA-Z0-9:_.-]{14,200}$/.test(options.reference))return json({error:'invalid_reference'},400);
  let graph;
  try{graph=await getGraph(asset,cursor);}catch{return json({error:'atlas_source_unavailable'},502);}
  if(graph.status!==200)return json({error:graph.body?.error||'atlas_source_unavailable'},graph.status);
  let packet;try{packet=await evidencePacket(graph.body,asset,{cursor});}catch{return json({error:'invalid_atlas_source'},502);}
  // A cursor page is a new bounded capture, not a continuation of an unseen packet.
  if(cursor!==null)packet=await evidencePacket(graph.body,asset);
  try{const report=await analyzeAtlas(packet,options);report.provenance.requested_cursor=cursor;return json(report);}catch(error){return json({error:'invalid_atlas_selection',message:error.message},422);}
}
