const RPC_URL='https://blochl1.com/rpc';
const INDEXER_BASE='https://blochl1.com/indexer';
const MAX_BYTES=2*1024*1024;
const HASH=/^[0-9a-f]{64}$/i;
const DECIMAL=/^(0|[1-9][0-9]*)$/;
const HISTORY_LIMIT=64;
const CURSOR=/^[a-zA-Z0-9_-]{1,160}$/;

async function sourceJson(fetcher,url,init={}){
  const response=await fetcher(url,{signal:AbortSignal.timeout(8000),...init});
  if(!response.ok)throw new Error('bloch_source_unavailable');
  const length=Number(response.headers.get('content-length'));
  if(Number.isFinite(length)&&length>MAX_BYTES)throw new Error('bloch_response_too_large');
  const reader=response.body?.getReader();
  if(!reader)throw new Error('invalid_bloch_response');
  const decoder=new TextDecoder();
  let body='',bytes=0;
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;
      if(bytes>MAX_BYTES)throw new Error('bloch_response_too_large');
      body+=decoder.decode(value,{stream:true});
    }
    body+=decoder.decode();
  }finally{reader.releaseLock();}
  try{return JSON.parse(body);}catch{throw new Error('invalid_bloch_response');}
}

async function rpc(fetcher,method,params,id){
  const body=await sourceJson(fetcher,RPC_URL,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id,method,params}),
  });
  if(body?.jsonrpc!=='2.0'||body.id!==id||body.error||!body.result)throw new Error('invalid_bloch_rpc_response');
  return body.result;
}

function safeHead(head){
  if(!Number.isSafeInteger(head?.slot)||!Number.isSafeInteger(head?.height)
    ||!Number.isSafeInteger(head?.finalized_height)||head.slot<0||head.height<0
    ||head.finalized_height<0||head.finalized_height>head.height||head.height>head.slot
    ||!HASH.test(head?.state_root||'')){
    throw new Error('invalid_bloch_head');
  }
  return {slot:head.slot,height:head.height,finalized_height:head.finalized_height,state_root:head.state_root.toLowerCase()};
}

function safeBalance(balance,scriptHash){
  if(balance?.script_hash?.toLowerCase()!==scriptHash||!DECIMAL.test(balance?.balance_sat||'')
    ||!Number.isSafeInteger(balance?.utxo_count)||balance.utxo_count<0){
    throw new Error('invalid_bloch_balance');
  }
  const amount=BigInt(balance.balance_sat);
  if(amount>0n&&balance.utxo_count===0)throw new Error('invalid_bloch_balance');
  const level=balance.corroboration?.level;
  if(!['final','corroborated','uncorroborated','node_local'].includes(level))throw new Error('invalid_bloch_corroboration');
  return {base_units:amount.toString(),unit:'sat',scope:'source_reported_script_hash_state',block:null,utxo_count:balance.utxo_count,corroboration:balance.corroboration};
}

function historyEvidence(scriptHash,page){
  if(page?.script_hash?.toLowerCase()!==scriptHash||!Array.isArray(page?.events)
    ||page.events.length>HISTORY_LIMIT
    ||!Number.isSafeInteger(page?.as_of_slot)||page.as_of_slot<0
    ||(page.as_of_height!=null||page.chain_tip!=null)
      &&(!Number.isSafeInteger(page.as_of_height)||page.as_of_height<0
        ||page.as_of_height>page.as_of_slot||!HASH.test(page.chain_tip||''))
    ||page.next_cursor!=null&&(!CURSOR.test(page.next_cursor)||typeof page.next_cursor!=='string')
    ||page.next_cursor!=null&&page.events.length===0
    ||page.total!=null&&(!Number.isSafeInteger(page.total)||page.total<page.events.length)){
    throw new Error('invalid_bloch_history');
  }
  const nodes=[{id:`bloch:script:${scriptHash}`,kind:'script_hash',address:scriptHash}];
  const edges=[];
  const seen=new Set();
  const eventKeys=new Set();
  const transactionBlocks=new Map();
  for(const event of page.events){
    if(!['created','spent'].includes(event?.kind)||!HASH.test(event?.transaction_id||'')
      ||!HASH.test(event?.txid||'')||!DECIMAL.test(event?.value_sat||'')
      ||!Number.isSafeInteger(event?.vout)||event.vout<0
      ||!Number.isSafeInteger(event?.slot)||!Number.isSafeInteger(event?.height)
      ||event.height<0||event.height>event.slot||event.slot>page.as_of_slot
      ||page.as_of_height!=null&&event.height>page.as_of_height
      ||!HASH.test(event?.block_id||''))
      throw new Error('invalid_bloch_history_event');
    const txid=event.transaction_id.toLowerCase();
    const outpointTxid=event.txid.toLowerCase();
    const blockHash=event.block_id.toLowerCase();
    const eventKey=`${event.kind}:${txid}:${outpointTxid}:${event.vout}`;
    const blockKey=`${event.height}:${event.slot}:${blockHash}`;
    if(eventKeys.has(eventKey)||transactionBlocks.has(txid)&&transactionBlocks.get(txid)!==blockKey)
      throw new Error('inconsistent_bloch_history_event');
    eventKeys.add(eventKey);transactionBlocks.set(txid,blockKey);
    const id=`bloch:tx:${txid}`;
    if(!seen.has(id)){seen.add(id);nodes.push({id,kind:'transaction',txid,block:{height:event.height,slot:event.slot,hash:blockHash}});}
    edges.push({
      from:event.kind==='created'?id:`bloch:script:${scriptHash}`,
      to:event.kind==='created'?`bloch:script:${scriptHash}`:id,
      kind:event.kind==='created'?'observed_created_output':'observed_spent_outpoint_reference',
      amount_base_units:event.value_sat,txid,
      outpoint:{txid:outpointTxid,vout:event.vout},
      block:{height:event.height,slot:event.slot,hash:blockHash},
    });
  }
  return {nodes,edges,history:{as_of_slot:page.as_of_slot,total:page.total??null,
    events_returned:page.events.length,has_more:Boolean(page.next_cursor),
    next_cursor:page.next_cursor||null,source:page.source||'bloch-historical-indexer',
    ...(page.as_of_height!=null?{source_anchor:{height:page.as_of_height,hash:page.chain_tip.toLowerCase()}}:{})}};
}

async function fetchHistoryEvidence(scriptHash,cursor,fetcher){
  const query=new URLSearchParams({limit:String(HISTORY_LIMIT)});
  if(cursor!==null)query.set('cursor',cursor);
  const page=await sourceJson(fetcher,`${INDEXER_BASE}/history/${scriptHash}?${query}`);
  const evidence=historyEvidence(scriptHash,page);
  if(cursor!==null&&evidence.history.next_cursor===cursor)
    throw new Error('invalid_bloch_history');
  evidence.history.requested_cursor=cursor;
  return evidence;
}

export async function queryBlochHistoryPage({address,cursor=null,fetcher=fetch,now=()=>new Date()}){
  if(typeof address!=='string'||!HASH.test(address))
    return {status:400,body:{error:'invalid_bloch_script_hash'}};
  if(cursor!==null&&(typeof cursor!=='string'||!CURSOR.test(cursor)))
    return {status:400,body:{error:'invalid_history_cursor'}};
  const scriptHash=address.toLowerCase();
  try{
    const evidence=await fetchHistoryEvidence(scriptHash,cursor,fetcher);
    return {status:200,body:{status:'source-reported',independent_verification:false,
      network:'bloch-mainnet',asset:'BLCH',address:scriptHash,
      activity:{bounded_events:evidence.history.events_returned,total_source_reported:evidence.history.total},
      observation:{source_id:evidence.history.source,retrieved_at:now().toISOString(),
        coverage:'bounded_64_script_hash_history_page',history:evidence.history,
        limitations:['This cursor page is a separate source-reported history observation, not a balance snapshot or complete history.',
          'Input outpoint references do not establish the identity or owner of a sender.']},
      nodes:evidence.nodes,edges:evidence.edges}};
  }catch(error){
    return {status:502,body:{error:error.message==='bloch_response_too_large'?error.message:'bloch_source_unavailable'}};
  }
}

export async function queryBlochScriptHash({address,fetcher=fetch,now=()=>new Date()}){
  if(typeof address!=='string'||!HASH.test(address))return {status:400,body:{error:'invalid_bloch_script_hash'}};
  const scriptHash=address.toLowerCase();
  try{
    const head=safeHead(await rpc(fetcher,'getchaininfo',[],1));
    const balance=safeBalance(await rpc(fetcher,'getbalance',[scriptHash],2),scriptHash);
    const retrievedAt=now().toISOString();
    let evidence={nodes:[{id:`bloch:script:${scriptHash}`,kind:'script_hash',address:scriptHash}],edges:[],history:null};
    try{
      evidence=await fetchHistoryEvidence(scriptHash,null,fetcher);
    }catch{
      // History is optional for a positive balance, but required to disambiguate a zero.
    }
    if(balance.base_units==='0'&&!evidence.edges.length){
      return {status:422,body:{error:'indeterminate_bloch_script_hash',message:'A zero balance does not establish that an arbitrary script hash was ever used.'}};
    }
    evidence.nodes[0].balance={...balance,retrieved_at:retrievedAt};
    return {status:200,body:{
      status:'source-reported',independent_verification:false,
      network:'bloch-mainnet',asset:'BLCH',address:scriptHash,balance,
      activity:evidence.history?{bounded_events:evidence.history.events_returned,total_source_reported:evidence.history.total}:null,
      observation:{
        source_id:'bloch-archival-rpc',retrieved_at:retrievedAt,
        coverage:evidence.history?'bounded_first_64_script_hash_events':'balance_only_history_unavailable',
        head_before_balance:head,history:evidence.history,
        corroboration:balance.corroboration,
        limitations:[
          'Genesis-4 uses a 32-byte script hash, not a person or a conventional wallet address.',
          'The archival balance and head are separate moving-chain calls; the head is not an exact balance snapshot.',
          'Finality and archival corroboration are reported by the Bloch explorer; Graphus has not independently replayed state.',
          'Historical events are bounded and cannot establish complete transaction history or input ownership.',
        ],
      },
      nodes:evidence.nodes,edges:evidence.edges,
    }};
  }catch(error){
    return {status:502,body:{error:error.message==='bloch_response_too_large'?error.message:'bloch_source_unavailable'}};
  }
}
