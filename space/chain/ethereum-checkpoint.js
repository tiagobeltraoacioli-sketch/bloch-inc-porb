import {readPublicJson,ethereumEndpoint,rpcQuantity,rpcNumber} from '../../graphus/chain/network-graph.js';

// One immutable, source-reported checkpoint, shared only within a research request.
export async function ethereumResearchCheckpoint({env,fetcher}){
  const endpoint=ethereumEndpoint(env);let id=0;
  async function rpc(method,params){
    const requestId=++id,body=await readPublicJson(fetcher,endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})});
    if(body?.jsonrpc!=='2.0'||body.id!==requestId||body.error||body.result==null)throw new Error('invalid_rpc_response');
    return body.result;
  }
  const chainId=await rpc('eth_chainId',[]);
  if(rpcQuantity(chainId)!==1n)throw new Error('ethereum_network_mismatch');
  const raw=await rpc('eth_getBlockByNumber',['finalized',false]);
  if(!/^0x[a-f0-9]{64}$/i.test(raw?.hash||''))throw new Error('invalid_rpc_response');
  rpcNumber(raw.number);const timestamp=rpcNumber(raw.timestamp);
  if(!Number.isFinite(new Date(timestamp*1000).getTime()))throw new Error('invalid_rpc_response');
  return Object.freeze({chainId,block:Object.freeze({number:raw.number,hash:raw.hash.toLowerCase(),timestamp:raw.timestamp})});
}
