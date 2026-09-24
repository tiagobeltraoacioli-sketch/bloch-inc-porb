// Fixed public Graphus surfaces. No caller-controlled upstream or credentials.
export function validHolders(value) {
  const amount=v=>typeof v==='string'&&/^\d{1,100}$/.test(v);
  if(!Array.isArray(value?.holders)||value.holders.length>64||!amount(value.coverage?.indexed_total_sat)||!Number.isSafeInteger(value.anchor?.height))return false;
  const seen=new Set();let total=0n,previous=null;
  for(const [i,h]of value.holders.entries()){
    if(h.rank!==i+1||typeof h.script_hash!=='string'||!/^[a-f0-9]{64}$/.test(h.script_hash)||seen.has(h.script_hash)||!amount(h.balance_sat)||!Number.isSafeInteger(h.utxo_count)||h.utxo_count<0)return false;
    const n=BigInt(h.balance_sat);if(n<=0n||previous!==null&&n>previous)return false;
    seen.add(h.script_hash);total+=n;previous=n;
  }
  return total<=BigInt(value.coverage.indexed_total_sat);
}
export async function graphusSnapshot(network,fetcher=fetch) {
  if(!['bitcoin','ethereum','bloch'].includes(network))return {status:400,body:{error:'invalid_network'}};
  async function read(path){
    const r=await fetcher(`https://bloch-graphus.xyz${path}`,{signal:AbortSignal.timeout(12000),headers:{accept:'application/json'}});
    if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw new Error(`graphus_source_http_${r.status}`);
    const reader=r.body.getReader();let bytes=0,text='';const decoder=new TextDecoder();
    try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1_000_000)throw new Error('graphus_response_limit');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();}
    return JSON.parse(text);
  }
  try{
    const [manifest,holders]=await Promise.allSettled([read('/api/daas/manifest'),network==='bloch'?read('/api/chain/holders?asset=BLCH'):Promise.resolve(null)]);
    if(manifest.status!=='fulfilled'||!Array.isArray(manifest.value.initial_assets)){console.warn('Graphus manifest retrieval',manifest.reason?.message||'invalid_schema');throw new Error('graphus_source_unavailable');}
    return {status:200,body:{network,source:'https://bloch-graphus.xyz/api/daas/manifest and /api/chain/holders',retrieved_at:new Date().toISOString(),
      independent_verification:false,note:'Graphus public API responses. Holder rankings refer to indexed script references; registration never grants live score access.',manifest:manifest.value,
      holders:holders.status==='fulfilled'&&validHolders(holders.value)?holders.value:null,
      holders_status:holders.status==='fulfilled'&&validHolders(holders.value)?'returned':'unavailable'}};
  }catch{return {status:502,body:{error:'graphus_source_unavailable'}};}
}
