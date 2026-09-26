import {analyze} from '../space/public/assets/science.js';
import {readPublicJson} from '../graphus/chain/network-graph.js';
import {requireValue,PortalError} from './security.js';

export const ASSETS={BTC:'bitcoin',ETH:'ethereum',USDT:'ethereum',USDC:'ethereum',BLCH:'bloch'};
const GRAPHUS='https://bloch-graphus.xyz', SPACE='https://bloch.space';
const hash=v=>typeof v==='string'&&/^(0x)?[a-f0-9]{64}$/i.test(v);
const number=v=>Number.isSafeInteger(v)&&v>=0;
async function read(url,fetcher){
  // A Graphus/Space request may contain several sequential bounded upstream calls.
  // Retry only these idempotent public reads; never retry database writes here.
  for(let attempt=0;attempt<2;attempt++){
    try{return await readPublicJson(async(u,options)=>{const response=await fetcher(u,{...options,signal:AbortSignal.timeout(20000)});if(!response.ok)throw new PortalError(`public_source_http_${response.status}`,502);return response;},url,{redirect:'manual',headers:{accept:'application/json','user-agent':'BI-PoRB/1.0 public-data-connector'}});}
    catch(error){const transient=!(error instanceof PortalError)||/http_(429|502|503|504)$/.test(error.message);if(attempt===0&&transient)continue;if(error instanceof PortalError)throw error;throw new PortalError('public_source_unavailable',502);}
  }
}
export function mergePage(previous,page,asset){
  requireValue(page?.status==='source-reported'&&page.asset===asset&&page.network===`${ASSETS[asset]}-mainnet`&&typeof page.source==='string'&&page.source.length<=160&&Number.isFinite(Date.parse(page.retrieved_at))&&number(page.anchor?.height)&&hash(page.anchor?.hash)&&Array.isArray(page.nodes)&&Array.isArray(page.edges)&&page.nodes.length<=1200&&page.edges.length<=4000,'invalid_source_graph',502);
  const nodes=new Map((previous?.nodes||[]).map(n=>[n.id,n])),edges=new Map((previous?.edges||[]).map(e=>[e.event_id,e])),blocks=new Map();
  requireValue(!previous||previous.source===page.source,'source_changed',502);
  for(const record of [...(previous?.snapshots||[]).map(s=>({block_number:s.anchor.height,block_hash:s.anchor.hash})),...(previous?.edges||[]),{block_number:page.anchor.height,block_hash:page.anchor.hash},...page.edges]){
    requireValue(number(record.block_number)&&hash(record.block_hash),'missing_block_anchor',502);
    const value=record.block_hash.toLowerCase();requireValue(!blocks.has(record.block_number)||blocks.get(record.block_number)===value,'source_block_changed',502);blocks.set(record.block_number,value);
  }
  for(const n of page.nodes){
    requireValue(typeof n.id==='string'&&n.id.startsWith(`${asset}:`)&&n.id.length<=200&&['address','script_hash','transaction'].includes(n.kind),'invalid_source_node',502);
    requireValue(n.kind==='transaction'?hash(n.txid):typeof n.address==='string'&&/^[a-zA-Z0-9]{14,100}$/.test(n.address),'invalid_source_reference',502);
    requireValue(n.id===`${asset}:${n.kind}:${n.kind==='transaction'?n.txid:n.address}`,'source_reference_mismatch',502);
    const row={id:n.id,kind:n.kind,...(n.kind==='transaction'?{txid:n.txid}:{address:n.address})};
    requireValue(!nodes.has(row.id)||JSON.stringify(nodes.get(row.id))===JSON.stringify(row),'source_node_changed',502);nodes.set(row.id,row);
  }
  for(const e of page.edges){
    requireValue(nodes.has(e.from)&&nodes.has(e.to)&&typeof e.event_id==='string'&&e.event_id.length<=180&&hash(e.txid)&&typeof e.amount_base_units==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(e.amount_base_units)&&typeof e.kind==='string'&&e.kind.length<=80&&number(e.position),'invalid_source_event',502);
    const row={from:e.from,to:e.to,event_id:e.event_id,txid:e.txid,amount_base_units:e.amount_base_units,kind:e.kind,position:e.position,block_number:e.block_number,block_hash:e.block_hash.toLowerCase(),...(e.block_time?{block_time:e.block_time}:{})};
    requireValue(!edges.has(row.event_id)||JSON.stringify(edges.get(row.event_id))===JSON.stringify(row),'source_event_changed',502);edges.set(row.event_id,row);
  }
  requireValue(nodes.size<=1200&&edges.size<=4000,'collection_capacity',422);
  return {asset,network:page.network,source:page.source,independent_verification:false,nodes:[...nodes.values()].sort((a,b)=>a.id.localeCompare(b.id,'en')),edges:[...edges.values()].sort((a,b)=>a.event_id.localeCompare(b.event_id,'en')),
    snapshots:[...(previous?.snapshots||[]),{anchor:page.anchor,scope:page.scope,coverage:page.coverage,retrieved_at:page.retrieved_at,source:page.source}],next_cursor:page.next_cursor??null,complete_chain_history:false};
}
export async function collect(asset,pages,fetcher=fetch){
  requireValue(Object.hasOwn(ASSETS,asset)&&Number.isInteger(pages)&&pages>=1&&pages<=8,'invalid_collection_parameters');
  let graph=null,cursor=null,stopped=null;
  for(let i=0;i<pages;i++){
    const url=new URL('/api/chain/network',GRAPHUS);url.searchParams.set('asset',asset);if(cursor!==null)url.searchParams.set('cursor',cursor);
    const page=await read(url.href,fetcher);
    try{graph=mergePage(graph,page,asset);}catch(e){if(e.message==='collection_capacity'&&graph){stopped='collection_capacity';break;}throw e;}
    if(page.next_cursor==null)break;
    requireValue(typeof page.next_cursor==='string'&&page.next_cursor.length<=110&&page.next_cursor!==cursor&&(asset==='BLCH'?/^[0-9]+-[a-f0-9]{64}-[0-9]+$/i:/^[0-9]+$/).test(page.next_cursor),'invalid_source_cursor',502);cursor=page.next_cursor;
  }
  return {...graph,requested_pages:pages,returned_pages:graph.snapshots.length,stopped,collection_time:new Date().toISOString(),integration:{graphus:GRAPHUS,space:SPACE},coverage:'Bounded source samples. Sampling omissions and unobserved history remain outside this dataset.'};
}
export async function science(network,fetcher=fetch){
  requireValue(['bitcoin','ethereum','bloch'].includes(network),'invalid_network');
  const range={bitcoin:'30',ethereum:'48',bloch:'24h'}[network],url=new URL('/api/series',SPACE);url.searchParams.set('network',network);url.searchParams.set('range',range);
  const source=await read(url.href,fetcher);requireValue(source.network===network&&source.source&&source.retrieved_at,'invalid_space_source',502);
  return {source,analysis:analyze(network,source),integration:SPACE};
}
export async function overview(fetcher=fetch){
  const networks=await Promise.all(['bitcoin','ethereum','bloch'].map(async network=>{
    try{const body=await read(`${SPACE}/api/overview?network=${network}`,fetcher);requireValue(body.network===network,'invalid_space_source',502);return {network,status:'source-reported',body};}
    catch(error){return {network,status:'unavailable',body:null,error:error.message};}
  }));
  return {networks,retrieved_at:new Date().toISOString(),integration:{space:SPACE,graphus:GRAPHUS},assets:Object.keys(ASSETS)};
}
