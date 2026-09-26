import {sourceGraph} from './porb_helpers.mjs';
export function pathSource(asset='ETH') {
  const page=sourceGraph(asset,103),id=n=>page.nodes[n-1].id;
  const edge=(name,from,to,height,amount='900719925474099312345')=>({event_id:name,from:id(from),to:id(to),kind:asset==='ETH'?'native_value':'erc20_transfer',amount_base_units:amount,
    txid:'0x'+String(height).padStart(64,'0'),position:0,block_number:height,block_hash:'0x'+height.toString(16).padStart(64,'0'),block_time:new Date(Date.UTC(2026,8,24,12,height-100)).toISOString()});
  page.edges=[edge('a',1,2,100),edge('b',2,3,101),edge('c',3,4,102),edge('d',1,4,103),edge('e',2,4,102),edge('f',1,3,101,'2')];
  page.scope={selection:'Synthetic temporal path test fixture only',transactions_returned:6};
  return page;
}
