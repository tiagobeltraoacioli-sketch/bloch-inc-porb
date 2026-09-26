import {sourceGraph} from './porb_helpers.mjs';
export function timelineSource(asset='ETH'){
  const page=sourceGraph(asset,130),start=Date.UTC(2026,8,24,12),id=i=>page.nodes[i].id;
  page.edges=Array.from({length:30},(_,i)=>({event_id:'time-'+String(i).padStart(2,'0'),from:id(i===29?0:i%3),to:id(i===29?0:3),kind:['USDT','USDC'].includes(asset)?'erc20_transfer':'native_value',amount_base_units:i===0?'0':'900719925474099312345',txid:'0x'+(i+1).toString(16).padStart(64,'0'),position:i,block_number:100+i,block_hash:'0x'+(100+i).toString(16).padStart(64,'0'),block_time:new Date(start+(i<25?i*1000:i===25?60000:i===26?180000:i===27?3600000:i===28?86400000:86401000)).toISOString()}));
  page.scope={selection:'Synthetic activity timeline fixture only',transactions_returned:30};return page;
}
