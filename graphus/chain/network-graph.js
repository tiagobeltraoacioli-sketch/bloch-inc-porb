// Public chain facts only. Fixed upstreams, bounded samples, exact amounts, explicit anchors.
const BTC='https://blockstream.info/api', BLOCH='https://blochl1.com/indexer';
const HASH=/^[a-f0-9]{64}$/i, HEX=/^0x[a-f0-9]{64}$/i, ADDRESS=/^0x[a-f0-9]{40}$/i;
const CONTRACTS={USDT:'0xdac17f958d2ee523a2206206994597c13d831ec7',USDC:'0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'};
const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const LIMIT=3*1024*1024;
const check=(ok)=>{if(!ok)throw new Error('inconsistent_source_response');};
const integer=v=>Number.isSafeInteger(v)&&v>=0;
function amount(v){check(typeof v==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(v));return v;}
function quantity(v){check(typeof v==='string'&&/^0x(?:0|[1-9a-f][a-f0-9]{0,63})$/i.test(v));return BigInt(v);}
function number(v){const n=quantity(v);check(n<=BigInt(Number.MAX_SAFE_INTEGER));return Number(n);}
async function read(fetcher,url,init={}){
  const response=await fetcher(url,{...init,signal:AbortSignal.timeout(9000)});
  if(!response.ok)throw new Error('chain_source_unavailable');
  if(Number(response.headers.get('content-length'))>LIMIT)throw new Error('source_response_too_large');
  let body='';const reader=response.body?.getReader();
  if(reader){const decoder=new TextDecoder();let size=0;try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMIT)throw new Error('source_response_too_large');body+=decoder.decode(value,{stream:true});}body+=decoder.decode();}finally{await reader.cancel();}}
  else{body=await response.text();if(new TextEncoder().encode(body).length>LIMIT)throw new Error('source_response_too_large');}
  try{return JSON.parse(body);}catch{throw new Error('invalid_source_response');}
}
function graph(asset,source,now){
  const nodes=new Map(),edges=[];
  return {nodes,edges,
    reference(value,kind='address'){const id=`${asset}:${kind}:${value}`;if(!nodes.has(id))nodes.set(id,{id,kind,...(kind==='transaction'?{txid:value}:{address:value})});return id;},
    result(anchor,scope,coverage){return {status:'source-reported',asset,network:asset==='BTC'?'bitcoin-mainnet':asset==='BLCH'?'bloch-mainnet':'ethereum-mainnet',
      source,retrieved_at:now().toISOString(),independent_verification:false,anchor,scope,coverage,nodes:[...nodes.values()],edges,
      limitations:['This is a bounded source-reported sample, not a complete chain index or independently verified history.',
        'References and graph paths do not establish identity, ownership or continuity of value.',
        'Input references and created outputs are separate records, not additive transfer volume.']};},
  };
}
async function bitcoin(fetcher,now){
  const blocks=await read(fetcher,`${BTC}/blocks`);check(Array.isArray(blocks)&&blocks.length>=3&&blocks.length<=10);
  for(let i=0;i<3;i++){const b=blocks[i];check(HASH.test(b?.id||'')&&integer(b.height)&&integer(b.timestamp)&&integer(b.tx_count));if(i)check(blocks[i-1].height===b.height+1&&blocks[i-1].previousblockhash===b.id);}
  const block=blocks[2],rows=await read(fetcher,`${BTC}/block/${block.id}/txs/0`);
  check(Array.isArray(rows)&&rows.length===Math.min(25,block.tx_count));
  const g=graph('BTC','blockstream-esplora',now),seen=new Set();let omitted=0;
  for(const tx of rows.slice(0,20)){
    check(HASH.test(tx?.txid||'')&&!seen.has(tx.txid)&&tx.status?.confirmed===true&&tx.status.block_height===block.height&&tx.status.block_hash===block.id&&Array.isArray(tx.vin)&&Array.isArray(tx.vout));seen.add(tx.txid);
    const txid=tx.txid.toLowerCase(),id=g.reference(txid,'transaction');
    for(const [side,values] of [['input',tx.vin],['output',tx.vout]]){
      omitted+=Math.max(0,values.length-24);
      for(const [index,entry] of values.slice(0,24).entries()){
        const row=side==='input'?entry.prevout:entry;
        if(!row?.scriptpubkey_address){omitted++;continue;}
        check(typeof row.scriptpubkey_address==='string'&&/^[a-zA-Z0-9]{14,90}$/.test(row.scriptpubkey_address)&&integer(row.value));
        if(side==='input')check(HASH.test(entry.txid||'')&&integer(entry.vout));
        const ref=g.reference(row.scriptpubkey_address),input=side==='input';
        g.edges.push({from:input?ref:id,to:input?id:ref,kind:input?'observed_input_prevout':'created_output',
          amount_base_units:String(row.value),event_id:`${txid}:${side}:${index}`,txid,position:index,
          block_number:block.height,block_hash:block.id,block_time:new Date(block.timestamp*1000).toISOString(),
          ...(input?{outpoint:{txid:entry.txid,vout:entry.vout}}:{outpoint:{txid,vout:index}})});
      }
    }
  }
  const status=await read(fetcher,`${BTC}/block/${block.id}/status`);check(status?.in_best_chain===true);
  return g.result({height:block.height,hash:block.id,time:new Date(block.timestamp*1000).toISOString(),finality:'source-reported best chain; selected at three confirmations'},
    {transactions_returned:seen.size,transactions_in_block:block.tx_count,endpoint_records_omitted:omitted,selection:'first 20 transactions; up to 24 input and output records each'},
    `${seen.size} transactions from block ${block.height} (${block.tx_count} in source block); ${omitted} endpoint records omitted, including coinbase or non-address scripts`);
}
async function bloch(fetcher,now){
  const [page,health]=await Promise.all([read(fetcher,`${BLOCH}/transactions?limit=32`),read(fetcher,`${BLOCH}/health`).catch(()=>null)]);
  const finalized=health?.ok===true&&integer(health.finalized_height)?health.finalized_height:null;
  check(Array.isArray(page?.transactions)&&page.transactions.length<=32
    &&integer(page.as_of_height)&&integer(page.as_of_slot)&&HASH.test(page.chain_tip||'')&&page.verification==='consensus replay and state-root verification');
  const g=graph('BLCH','bloch-historical-indexer',now),seen=new Set(),blocks=new Map();let omitted=0,notFinalized=0;
  for(const tx of page.transactions){
    check(HASH.test(tx?.txid||'')&&!seen.has(tx.txid)&&HASH.test(tx.block_id||'')&&integer(tx.height)&&tx.height<=page.as_of_height&&integer(tx.slot)&&tx.slot<=page.as_of_slot&&tx.height<=tx.slot&&Array.isArray(tx.inputs)&&Array.isArray(tx.outputs));
    seen.add(tx.txid);if(finalized!==null&&tx.height>finalized){notFinalized++;continue;}
    check(!blocks.has(tx.height)||blocks.get(tx.height)===tx.block_id);blocks.set(tx.height,tx.block_id);
    const txid=tx.txid.toLowerCase(),id=g.reference(txid,'transaction');
    for(const [side,values] of [['input',tx.inputs],['output',tx.outputs]]){
      omitted+=Math.max(0,values.length-2048);const outpoints=new Set();
      for(const [index,row] of values.slice(0,2048).entries()){
        check(HASH.test(row?.script_hash||'')&&HASH.test(row.txid||'')&&integer(row.vout)&&!outpoints.has(`${row.txid}:${row.vout}`));
        outpoints.add(`${row.txid}:${row.vout}`);if(side==='output')check(row.txid.toLowerCase()===txid);
        const value=amount(row.value_sat),script=row.script_hash.toLowerCase();
        if(g.edges.length>=3000||g.nodes.size>=1100&&!g.nodes.has(`BLCH:script_hash:${script}`)){omitted++;continue;}
        const ref=g.reference(script,'script_hash'),input=side==='input';
        g.edges.push({from:input?ref:id,to:input?id:ref,kind:input?'observed_spent_outpoint_reference':'observed_created_output',
          amount_base_units:value,event_id:`${txid}:${side}:${index}`,txid,position:index,block_number:tx.height,block_hash:tx.block_id,
          outpoint:{txid:row.txid.toLowerCase(),vout:row.vout}});
      }
    }
  }
  return g.result({height:page.as_of_height,hash:page.chain_tip,...(finalized!==null?{finalized_height:finalized}:{}),
    finality:finalized!==null?'transaction heights compared with separately source-reported finalized height':'finality unavailable; indexed block references only'},
    {transactions_returned:seen.size-notFinalized,transactions_in_page:seen.size,finality_available:finalized!==null,not_finalized_omitted:notFinalized,endpoint_records_omitted:omitted,has_more:Boolean(page.next_cursor),selection:'latest 32 indexed transactions; up to 3000 endpoint records within a bounded reference set'},
    `${seen.size-notFinalized} recent indexed transactions${finalized!==null?' at or below reported finalized height '+finalized:'; finality status unavailable'}; ${omitted} endpoint records omitted`);
}
function endpoint(env){let url;try{url=new URL(env.GRAPHUS_ETHEREUM_RPC_URL);}catch{throw new Error('ethereum_rpc_not_configured');}if(url.protocol!=='https:'||url.username||url.password||url.hash)throw new Error('ethereum_rpc_not_configured');return url.href;}
async function ethereum(asset,env,fetcher,now){
  const url=endpoint(env);let id=0;
  async function rpc(method,params){const requestId=++id;const body=await read(fetcher,url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})});check(body?.jsonrpc==='2.0'&&body.id===requestId&&!body.error&&body.result!=null);return body.result;}
  const [chain,head]=await Promise.all([rpc('eth_chainId',[]),rpc('eth_getBlockByNumber',['finalized',asset==='ETH'])]);
  check(quantity(chain)===1n&&HEX.test(head?.hash||''));const height=number(head.number),timestamp=number(head.timestamp);
  const g=graph(asset,'configured-ethereum-mainnet-rpc',now),anchor={height,hash:head.hash.toLowerCase(),time:new Date(timestamp*1000).toISOString(),finality:'source-reported finalized block'};
  let scope,coverage;
  if(asset==='ETH'){
    check(Array.isArray(head.transactions)&&head.transactions.length<=20000);
    const eligible=head.transactions.filter(tx=>{check(HEX.test(tx?.hash||'')&&ADDRESS.test(tx.from||'')&&tx.blockHash?.toLowerCase()===anchor.hash&&number(tx.blockNumber)===height);return quantity(tx.value)>0n&&ADDRESS.test(tx.to||'');}).slice(0,24);
    const seen=new Set();let failed=0;
    for(let start=0;start<eligible.length;start+=8){
      await Promise.all(eligible.slice(start,start+8).map(async tx=>{
        const receipt=await rpc('eth_getTransactionReceipt',[tx.hash]);
        check(receipt.transactionHash?.toLowerCase()===tx.hash.toLowerCase()&&receipt.blockHash?.toLowerCase()===anchor.hash&&number(receipt.blockNumber)===height&&number(receipt.transactionIndex)===number(tx.transactionIndex));
        const status=quantity(receipt.status);check(status===0n||status===1n);if(status===0n){failed++;return;}
        const txid=tx.hash.toLowerCase();check(!seen.has(txid));seen.add(txid);
        g.edges.push({from:g.reference(tx.from.toLowerCase()),to:g.reference(tx.to.toLowerCase()),kind:'native_value',amount_base_units:quantity(tx.value).toString(),
          event_id:`${txid}:native`,txid,position:number(tx.transactionIndex),block_number:height,block_hash:anchor.hash,block_time:anchor.time});
      }));
    }
    g.edges.sort((a,b)=>a.position-b.position);
    scope={transactions_in_block:head.transactions.length,candidates_checked:eligible.length,successful_transfers:g.edges.length,failed_transactions_omitted:failed,selection:'first 24 positive direct-value transactions with an address recipient; successful receipts only',internal_calls_included:false};
    coverage=`${g.edges.length} successful direct ETH value records from finalized block ${height}; ${eligible.length} candidates checked out of ${head.transactions.length} transactions; internal calls excluded`;
  }else{
    const first=Math.max(0,height-3),headers=await Promise.all(Array.from({length:height-first},(_,i)=>rpc('eth_getBlockByNumber',[`0x${(first+i).toString(16)}`,false])));
    headers.push(head);const hashes=new Map();for(const [i,b] of headers.entries()){check(HEX.test(b?.hash||'')&&number(b.number)===first+i);if(i)check(b.parentHash?.toLowerCase()===headers[i-1].hash.toLowerCase());hashes.set(first+i,b.hash.toLowerCase());}
    const contract=CONTRACTS[asset];const logs=await rpc('eth_getLogs',[{address:contract,fromBlock:`0x${first.toString(16)}`,toBlock:head.number,topics:[TRANSFER]}]);
    check(Array.isArray(logs)&&logs.length<=4096);const seen=new Set(),txBlocks=new Map();
    const normalized=logs.map(log=>{
      check(log?.removed!==true&&log.address?.toLowerCase()===contract&&Array.isArray(log.topics)&&log.topics.length===3&&log.topics[0]?.toLowerCase()===TRANSFER&&HEX.test(log.data||'')&&HEX.test(log.transactionHash||''));
      const block=number(log.blockNumber),position=number(log.logIndex),txIndex=number(log.transactionIndex),txid=log.transactionHash.toLowerCase(),key=`${txid}:${position}`;
      check(hashes.get(block)===log.blockHash?.toLowerCase()&&!seen.has(key));seen.add(key);
      const txAnchor=`${block}:${log.blockHash.toLowerCase()}:${txIndex}`;check(!txBlocks.has(txid)||txBlocks.get(txid)===txAnchor);txBlocks.set(txid,txAnchor);
      const address=topic=>{check(typeof topic==='string'&&/^0x0{24}[a-f0-9]{40}$/i.test(topic));return `0x${topic.slice(-40).toLowerCase()}`;};
      return {from:address(log.topics[1]),to:address(log.topics[2]),kind:'erc20_transfer',amount_base_units:BigInt(log.data).toString(),event_id:key,txid,position,block_number:block,block_hash:hashes.get(block)};
    }).sort((a,b)=>a.block_number-b.block_number||a.position-b.position);
    for(const row of normalized.slice(0,512))g.edges.push({...row,from:g.reference(row.from),to:g.reference(row.to)});
    scope={from_block:first,to_block:height,contract,source_logs:logs.length,returned_logs:g.edges.length,truncated:logs.length>512,selection:'first 512 matching logs ordered by block and log index'};
    coverage=`${g.edges.length} of ${logs.length} source-returned ${asset} Transfer logs across finalized blocks ${first}–${height}${logs.length>512?'; capped sample':''}`;
  }
  const recheck=await rpc('eth_getBlockByNumber',[head.number,false]);check(recheck?.hash?.toLowerCase()===anchor.hash&&number(recheck.number)===height);
  return g.result(anchor,scope,coverage);
}
export async function queryNetworkGraph({asset,env={},fetcher=fetch,now=()=>new Date()}={}){
  if(!['BTC','ETH','USDT','USDC','BLCH'].includes(asset))return {status:400,body:{error:'unsupported_asset'}};
  try{return {status:200,body:await (asset==='BTC'?bitcoin(fetcher,now):asset==='BLCH'?bloch(fetcher,now):ethereum(asset,env,fetcher,now))};}
  catch(error){const code=['ethereum_rpc_not_configured','source_response_too_large','inconsistent_source_response'].includes(error.message)?error.message:'chain_source_unavailable';return {status:code==='ethereum_rpc_not_configured'?503:502,body:{error:code}};}
}
