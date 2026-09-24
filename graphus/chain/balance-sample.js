import {readPublicJson,ethereumEndpoint,rpcQuantity,rpcNumber,CONTRACTS} from './network-graph.js';

const check=ok=>{if(!ok)throw new Error('inconsistent_source_response');};
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const validBtc=v=>/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(v)||/^bc1[ac-hj-np-z02-9]{11,87}$/.test(v);
export async function queryBalanceSample({asset,addresses,env={},fetcher=fetch,now=()=>new Date()}={}){
  if(!['BTC','ETH','USDT','USDC'].includes(asset)||!Array.isArray(addresses)||!addresses.length||addresses.length>16
    ||addresses.some(v=>typeof v!=='string'||!(asset==='BTC'?validBtc(v):/^0x[a-f0-9]{40}$/i.test(v))))return {status:400,body:{error:'invalid_balance_sample'}};
  const identifiers=[...new Set(addresses.map(v=>asset==='BTC'?v:v.toLowerCase()))];
  try{
    const rows=[],unavailable=[];let block=null,rpc,id=0;
    if(asset!=='BTC'){
      const endpoint=ethereumEndpoint(env);
      rpc=async(method,params)=>{const requestId=++id;const body=await readPublicJson(fetcher,endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})});check(body?.jsonrpc==='2.0'&&body.id===requestId&&!body.error&&body.result!=null);return body.result;};
      const [chain,head]=await Promise.all([rpc('eth_chainId',[]),rpc('eth_getBlockByNumber',['finalized',false])]);
      check(rpcQuantity(chain)===1n&&/^0x[a-f0-9]{64}$/i.test(head?.hash||''));
      block={height:rpcNumber(head.number),hash:head.hash.toLowerCase(),time:new Date(rpcNumber(head.timestamp)*1000).toISOString()};
    }
    const source=asset==='BTC'?'blockstream-esplora':'configured-ethereum-json-rpc';
    const network=asset==='BTC'?'bitcoin-mainnet':'ethereum-mainnet';
    for(let start=0;start<identifiers.length;start+=4){
      await Promise.all(identifiers.slice(start,start+4).map(async address=>{
        try{
          let amount,utxos;
          if(asset==='BTC'){
            const result=await readPublicJson(fetcher,`https://blockstream.info/api/address/${address}`),stats=result?.chain_stats;
            check(result.address===address&&stats&&['funded_txo_sum','spent_txo_sum','funded_txo_count','spent_txo_count'].every(k=>integer(stats[k])));
            amount=BigInt(stats.funded_txo_sum)-BigInt(stats.spent_txo_sum);utxos=stats.funded_txo_count-stats.spent_txo_count;check(amount>=0n&&utxos>=0);
          }else{
            const tag=`0x${block.height.toString(16)}`;
            if(asset==='ETH')amount=rpcQuantity(await rpc('eth_getBalance',[address,tag]));
            else{const value=await rpc('eth_call',[{to:CONTRACTS[asset],data:'0x70a08231'+address.slice(2).padStart(64,'0')},tag]);check(/^0x[a-f0-9]{64}$/i.test(value));amount=BigInt(value);}
          }
          rows.push({address,balance:{base_units:amount.toString(),unit:asset==='BTC'?'sat':asset==='ETH'?'wei':'token-base-unit',decimals:asset==='BTC'?8:asset==='ETH'?18:6,
            block,scope:asset==='BTC'?'source_confirmed_address_aggregate':'source_reported_finalized_block',retrieved_at:now().toISOString(),
            ...(utxos!==undefined?{utxo_count:utxos}:{}),...(CONTRACTS[asset]?{contract:CONTRACTS[asset]}:{})}});
        }catch{unavailable.push(address);}
      }));
    }
    if(block){const again=await rpc('eth_getBlockByNumber',[`0x${block.height.toString(16)}`,false]);check(again?.hash?.toLowerCase()===block.hash&&rpcNumber(again.number)===block.height);}
    rows.sort((a,b)=>identifiers.indexOf(a.address)-identifiers.indexOf(b.address));
    return {status:200,body:{status:'source-reported',asset,network,independent_verification:false,balances:rows,unavailable,
      anchor:block,coverage:{requested:identifiers.length,returned:rows.length,unavailable:unavailable.length,same_block:asset!=='BTC'},
      observation:{source_id:source,retrieved_at:now().toISOString(),coverage:'balances of explicitly requested identifiers; no global holder ranking',
        limitations:['Addresses are network identifiers; no holder identity or common ownership is asserted.',asset==='BTC'?'Confirmed address aggregates have no pinned block; observations can differ in time.':'All returned balances in this batch use one source-reported finalized block, rechecked after retrieval.','Public source facts are not independently verified by Graphus.']}}};
  }catch(error){const code=['ethereum_rpc_not_configured','inconsistent_source_response'].includes(error.message)?error.message:'chain_source_unavailable';return {status:code==='ethereum_rpc_not_configured'?503:502,body:{error:code}};}
}
