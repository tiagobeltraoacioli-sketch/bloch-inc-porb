export function sample(asset='ETH'){
  const txid=(asset==='BTC'||asset==='BLCH'?'':'0x')+'a'.repeat(64),blockHash=(asset==='BTC'||asset==='BLCH'?'':'0x')+'b'.repeat(64);
  const kind=asset==='BLCH'?'script_hash':'address',reference=asset==='BLCH'?'c'.repeat(64):asset==='BTC'?'1BoatSLRHtKNngkdXEeobR76b53LETtpyT':'0x'+'c'.repeat(40),other=asset==='BLCH'?'d'.repeat(64):asset==='BTC'?'1CounterpartyXXXXXXXXXXXXXXXUWLpVr':'0x'+'d'.repeat(40);
  const nodes=[reference,other].map(address=>({id:`${asset}:${kind}:${address}`,kind,address}));
  const utxo=['BTC','BLCH'].includes(asset);if(utxo)nodes.push({id:`${asset}:transaction:${txid}`,kind:'transaction',txid});
  const edges=Array.from({length:25},(_,i)=>({event_id:`${txid}:${i}`,from:utxo?nodes[2].id:nodes[0].id,to:nodes[1].id,kind:asset==='BTC'?'created_output':asset==='BLCH'?'observed_created_output':asset==='ETH'?'native_value':'erc20_transfer',amount_base_units:'9007199254740993123456789',txid,position:i,block_number:100,block_hash:blockHash,...(asset==='BLCH'?{}:{block_time:'2026-09-24T12:00:00Z'})}));
  return {asset,network:asset==='BTC'?'bitcoin-mainnet':asset==='BLCH'?'bloch-mainnet':'ethereum-mainnet',status:'source-reported',source:'TEST FIXTURE ONLY',retrieved_at:'2026-09-24T12:00:00Z',anchor:{height:100,hash:blockHash,finality:'test-only'},scope:{selection:'TEST FIXTURE ONLY',transactions_returned:1},coverage:'Synthetic browser test fixture, not chain data',nodes,edges};
}
