import './analytics_engine.js';
const A=globalThis.GraphusAnalytics;
const NETWORK={BTC:'bitcoin-mainnet',ETH:'ethereum-mainnet',USDT:'ethereum-mainnet',USDC:'ethereum-mainnet',BLCH:'bloch-mainnet'};
const hash=value=>typeof value==='string'&&/^(0x)?[a-f0-9]{64}$/i.test(value);
const check=(condition,message)=>{if(!condition)throw new Error(message);};

export async function evidencePacket(raw,asset) {
  check(raw?.status==='source-reported'&&raw.asset===asset&&raw.network===NETWORK[asset],'Source asset or network mismatch.');
  check(typeof raw.source==='string'&&raw.source.length>0&&raw.source.length<=300&&Number.isFinite(Date.parse(raw.retrieved_at)),'Missing source provenance.');
  check(Number.isSafeInteger(raw.anchor?.height)&&raw.anchor.height>=0&&hash(raw.anchor.hash),'Missing source block anchor.');
  const normalized=A.normalize(raw),blocks=new Map([[raw.anchor.height,raw.anchor.hash.toLowerCase()]]);
  check(raw.edges.every(edge=>typeof edge.event_id==='string'&&edge.event_id.length>0),'Missing event identity.');
  const nodes=raw.nodes.map(node=>{
    const reference=node.kind==='transaction'?node.txid:node.address;
    check(node.kind==='transaction'?hash(reference):typeof reference==='string'&&/^[a-zA-Z0-9]{14,100}$/.test(reference),'Invalid public reference.');
    check(node.id===`${asset}:${node.kind}:${reference}`,'Reference identity mismatch.');
    return {id:node.id,kind:node.kind,...(node.kind==='transaction'?{txid:reference}:{address:reference})};
  });
  const edges=normalized.edges.map(edge=>{
    check(hash(edge.txid)&&hash(edge.block_hash)&&Number.isSafeInteger(edge.block)&&edge.block>=0,'Record lacks transaction or block provenance.');
    const blockHash=edge.block_hash.toLowerCase();check(!blocks.has(edge.block)||blocks.get(edge.block)===blockHash,'Conflicting source block hashes.');blocks.set(edge.block,blockHash);
    return {event_id:edge.id,from:edge.from,to:edge.to,kind:edge.kind,amount_base_units:edge.amount,txid:edge.txid,block_number:edge.block,block_hash:blockHash,
      ...(edge.position!==undefined?{position:edge.position}:{}),...(edge.block_time?{block_time:edge.block_time}:{}),...(edge.outpoint?{outpoint:edge.outpoint}:{})};
  });
  const anchor=normalized.anchor,scopeKeys=['transactions_returned','transactions_in_block','transactions_in_page','endpoint_records_omitted','selection','candidates_checked','successful_transfers','failed_transactions_omitted','internal_calls_included','from_block','to_block','contract','source_logs','returned_logs','truncated','not_finalized_omitted','has_more','finality_available'];
  const scope=Object.fromEntries(Object.entries(normalized.scope||{}).filter(([key])=>scopeKeys.includes(key)));
  const dataset={status:'source-reported',asset,network:NETWORK[asset],source:raw.source,retrieved_at:raw.retrieved_at,anchor,coverage:normalized.coverage,scope,independent_verification:false,nodes,edges,
    snapshots:[{source:raw.source,retrieved_at:raw.retrieved_at,anchor,scope,coverage:normalized.coverage,records:edges.length}]};
  const counts={};for(const edge of edges)counts[edge.kind]=(counts[edge.kind]||0)+1;
  const diagnostics={references:nodes.length,records:edges.length,transactions:new Set(edges.map(e=>e.txid)).size,blocks:new Set(edges.map(e=>e.block_number)).size,
    records_with_timestamp:edges.filter(e=>Number.isFinite(Date.parse(e.block_time))).length,records_without_timestamp:edges.filter(e=>!Number.isFinite(Date.parse(e.block_time))).length,record_types:counts,complete_chain_history:false,independent_verification:false};
  const bytes=new TextEncoder().encode(JSON.stringify(dataset));check(bytes.byteLength<=3_000_000,'Evidence packet exceeds the 3 MB limit.');
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  return {kind:'graphus_network_collection',schema_version:1,exported_at:new Date().toISOString(),dataset,dataset_sha256:digest,digest_encoding:'SHA-256 of UTF-8 JSON.stringify(dataset), preserving field and array order',diagnostics,
    purpose:'Public-chain evidence preparation',aml_score_included:false,identity_attribution_included:false};
}

export async function fetchEvidence(asset,{fetcher=fetch,signal}={}) {
  check(Object.hasOwn(NETWORK,asset),'Unsupported asset.');
  const response=await fetcher(`/api/chain/network?${new URLSearchParams({asset})}`,{headers:{accept:'application/json'},signal,redirect:'error'});
  if(!response.ok)throw new Error(`Source unavailable (HTTP ${response.status}). Retry the capture.`);
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const result=await reader.read();if(result.done)break;size+=result.value.byteLength;if(size>3_000_000)throw new Error('Source response exceeds the 3 MB limit.');chunks.push(result.value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return evidencePacket(JSON.parse(new TextDecoder().decode(bytes)),asset);
}
