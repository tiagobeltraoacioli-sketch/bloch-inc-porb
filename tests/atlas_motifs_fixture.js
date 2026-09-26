import {sourceGraph} from './porb_helpers.mjs';
export function motifSource(asset='ETH'){
  const source=sourceGraph(asset,106),id=n=>source.nodes[n-1].id,large='900719925474099312345';
  const transfers=[['a',1,2,100],['b',2,1,101],['c',2,3,101],['d',3,1,102],['e',4,1,99],['f',5,1,103],['g',1,6,104],['h',1,7,105],['i',1,6,106]];
  source.edges=transfers.map(([event_id,from,to,height],i)=>({event_id,from:id(from),to:id(to),kind:asset==='ETH'?'native_value':'erc20_transfer',amount_base_units:event_id==='e'?'7':large,
    txid:'0x'+(i+1).toString(16).padStart(64,'0'),position:i,block_number:height,block_hash:'0x'+height.toString(16).padStart(64,'0'),block_time:new Date(Date.UTC(2026,8,24,12,height-100)).toISOString()}));
  source.scope={transactions_returned:9};return source;
}
