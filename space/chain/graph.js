import {handleExplore} from './explorer.js';
import {queryBlochHistoryPage} from '../../graphus/chain/bloch-chain.js';
import {queryEthereumActivity} from '../../graphus/chain/ethereum-activity.js';
import {emptyGraph,validateGraph,mergeGraph,nodeId,validReference,ASSETS} from '../public/assets/graph-core.js';

const BTC='https://blockstream.info/api',BLOCH='https://blochl1.com';
const CONTRACTS={USDT:'0xdac17f958d2ee523a2206206994597c13d831ec7',USDC:'0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'};
const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const units=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,99})$/.test(v);
const hex=v=>typeof v==='string'&&/^0x[0-9a-f]{1,64}$/i.test(v);
const number=v=>{if(!hex(v)||!Number.isSafeInteger(Number(BigInt(v))))throw new Error('invalid_source_quantity');return Number(BigInt(v));};
async function read(fetcher,url,init={}){
  const r=await fetcher(url,{...init,signal:AbortSignal.timeout(9000)});if(!r.ok)throw new Error(r.status===404?'record_not_found':'source_unavailable');
  const reader=r.body.getReader(),decoder=new TextDecoder();let text='',bytes=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4*1024*1024){await reader.cancel();throw new Error('source_response_limit');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
  return JSON.parse(text);
}
async function rpc(fetcher,env,method,params){
  const url=new URL(env.GRAPHUS_ETHEREUM_RPC_URL);if(url.protocol!=='https:'||url.username||url.password)throw new Error('rpc_not_configured');
  const body=await read(fetcher,url.href,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});if(body.error||body.id!==1||body.result==null)throw new Error('rpc_unavailable');return body.result;
}
function builder(network,asset,source,scope,at=new Date().toISOString(),anchor=null){
  const graph=emptyGraph(network,asset),observation={id:crypto.randomUUID(),source,at,scope,anchor};graph.observations.push(observation);const nodes=new Map();
  const addNode=(kind,reference)=>{
    if(typeof reference!=='string')throw new Error('invalid_source_reference');
    if(network!=='bitcoin'||reference.startsWith('bc1')||kind==='transaction')reference=reference.toLowerCase();
    if(!validReference(network,kind,reference))throw new Error('invalid_source_reference');
    const id=nodeId(network,kind,reference);nodes.set(id,{id,kind,reference});return id;
  };
  return {graph,node:addNode,edge:(record)=>graph.edges.push({...record,sources:[observation.id]}),done:()=>validateGraph({...graph,nodes:[...nodes.values()]})};
}
export function bitcoinTransactions(transactions,{query=null,source='Blockstream Esplora',scope='Bounded confirmed transaction page',at=new Date().toISOString(),next=null}={}){
  if(!Array.isArray(transactions)||transactions.length>25)throw new Error('invalid_bitcoin_page');
  const b=builder('bitcoin','BTC',source,scope,at);if(query)b.node('address',query);
  let omitted=0;
  for(const tx of transactions){
    if(tx?.status?.confirmed!==true){if(validReference('bitcoin','transaction',tx?.txid))b.node('transaction',tx.txid);b.graph.warnings.push('Unconfirmed transaction: transfer edges are withheld from this confirmed-evidence workspace.');continue;}
    if(!Array.isArray(tx.vin)||!Array.isArray(tx.vout)||!integer(tx.status.block_height)||!validReference('bitcoin','transaction',tx.status.block_hash))throw new Error('invalid_bitcoin_transaction');
    const id=tx.txid?.toLowerCase(),txNode=b.node('transaction',id),block={height:tx.status.block_height,hash:tx.status.block_hash,index:null,log:null};
    for(const [direction,records] of [['input',tx.vin],['output',tx.vout]]){
      omitted+=Math.max(0,records.length-32);
      for(const [i,r] of records.slice(0,32).entries()){
        const record=direction==='input'?r.prevout:r;if(direction==='input'&&r.is_coinbase)continue;
        if(!record?.scriptpubkey_address){omitted++;continue;}
        if(!integer(record.value))throw new Error('invalid_source_amount');
        const ref=b.node('address',record.scriptpubkey_address),event=`bitcoin:BTC:${direction}:${id}:${i}`;
        b.edge({id:event,from:direction==='input'?ref:txNode,to:direction==='input'?txNode:ref,kind:direction,amount:String(record.value),txid:id,block,finality:'source-confirmed; probabilistic'});
      }
    }
  }
  if(omitted)b.graph.warnings.push(`${omitted} input/output positions omitted: maximum 32 per side per transaction, coinbase has no sender, and some scripts have no address.`);
  if(next&&query)b.graph.cursors.push({query,cursor:next});
  return b.done();
}
export function blochTransaction(data){
  const tx=data.transaction,b=builder('bloch','BLCH',data.source,data.note,data.retrieved_at,{height:tx.height,hash:tx.block_id}),txid=tx.txid,txNode=b.node('transaction',txid);
  if(!Array.isArray(tx.inputs)||!Array.isArray(tx.outputs)||!integer(tx.height)||!validReference('bloch','transaction',tx.block_id))throw new Error('invalid_bloch_transaction');
  const block={height:tx.height,hash:tx.block_id,index:integer(tx.index)?tx.index:null,log:null};
  for(const [kind,records]of [['input',tx.inputs],['output',tx.outputs]]){
    if(records.length>256)b.graph.warnings.push(`${kind}: showing the first 256 of ${records.length} positions.`);
    for(const [i,r]of records.slice(0,256).entries()){
      if(!units(r.value_sat)||!integer(r.vout??i))throw new Error('invalid_bloch_output');
      if(kind==='output'&&r.txid!=null&&r.txid!==txid)throw new Error('mismatched_bloch_output');
      const ref=b.node('script',r.script_hash),outpoint=kind==='input'?r.txid:txid;
      if(!validReference('bloch','transaction',outpoint))throw new Error('invalid_bloch_outpoint');
      b.edge({id:`bloch:BLCH:${kind}:${txid}:${outpoint}:${r.vout??i}`,from:kind==='input'?ref:txNode,to:kind==='input'?txNode:ref,kind,amount:r.value_sat,txid,block,finality:data.position?.finality_relation||'source-reported'});
    }
  }
  return b.done();
}
export function blochHistory(data){
  const b=builder('bloch','BLCH',data.observation.source_id,data.observation.coverage,data.observation.retrieved_at,data.observation.history.source_anchor??null);
  const map=new Map(data.nodes.map(n=>[n.id,b.node(n.kind==='transaction'?'transaction':'script',n.txid||n.address)]));
  for(const e of data.edges){const kind=e.kind==='observed_created_output'?'output':'input';b.edge({id:`bloch:BLCH:${kind}:${e.txid}:${e.outpoint.txid}:${e.outpoint.vout}`,from:map.get(e.from),to:map.get(e.to),kind,amount:e.amount_base_units,txid:e.txid,block:e.block,finality:'indexed history observation'});}
  const cursor=data.observation.history.next_cursor;if(cursor)b.graph.cursors.push({query:data.address,cursor});
  return b.done();
}
export function tokenActivity(data){
  const b=builder('ethereum',data.asset,data.observation.source_id,data.observation.coverage,data.observation.retrieved_at,data.observation.window_end_anchor);
  b.node('address',data.address);
  for(const e of data.activity.events)b.edge({id:`ethereum:${data.asset}:log:${e.transaction_hash}:${e.log_index}`,from:b.node('address',e.from),to:b.node('address',e.to),kind:'erc20_transfer',amount:e.amount_base_units,txid:e.transaction_hash,block:{height:e.block_number,hash:e.block_hash,index:e.transaction_index,log:e.log_index},finality:'source-reported finalized log'});
  if(data.observation.block_window.from>0)b.graph.cursors.push({query:data.address,cursor:String(data.observation.block_window.from-1)});
  return b.done();
}
export function ethereumTransaction(data,asset='ETH'){
  const tx=data.transaction,b=builder('ethereum',asset,data.source,data.note,data.retrieved_at),txid=tx.hash?.toLowerCase();
  b.node('transaction',txid);
  if(data.receipt_status!=='available'||data.receipt?.status!=='0x1'){b.graph.warnings.push('Transfer edges withheld: a matching successful receipt is unavailable.');return b.done();}
  const block={height:number(tx.blockNumber),hash:tx.blockHash.toLowerCase(),index:hex(tx.transactionIndex)?number(tx.transactionIndex):null,log:null};
  if(asset==='ETH'){
    if(!hex(tx.value))throw new Error('invalid_source_value');
    const to=tx.to||data.receipt.contractAddress;
    if(to){const value=BigInt(tx.value).toString();b.edge({id:`ethereum:ETH:tx:${txid}`,from:b.node('address',tx.from.toLowerCase()),to:b.node('address',to.toLowerCase()),kind:value==='0'?'executed_transaction':'native_value',amount:value,txid,block,finality:data.position.finality_relation});}
    else b.graph.warnings.push('Successful creation receipt has no destination; no value edge is drawn.');
  }else for(const e of data.token_transfers.filter(t=>t.asset===asset)){
    if(!hex(e.log_index))continue;const log=number(e.log_index);
    const raw=data.receipt.logs.find(l=>hex(l.logIndex)&&number(l.logIndex)===log);
    if(!raw||raw.removed===true||raw.transactionHash?.toLowerCase()!==txid||raw.blockHash?.toLowerCase()!==block.hash||number(raw.blockNumber)!==block.height||number(raw.transactionIndex)!==block.index)throw new Error('inconsistent_receipt_log');
    b.edge({id:`ethereum:${asset}:log:${txid}:${log}`,from:b.node('address',e.from),to:b.node('address',e.to),kind:'erc20_transfer',amount:e.amount_base_units,txid,block:{...block,log},finality:data.position.finality_relation});
  }
  if(asset!=='ETH'&&data.token_transfer_count>64)b.graph.warnings.push('Receipt transfer records are capped at 64 across supported tokens.');
  return b.done();
}
export function tokenLogs(logs,asset,head,at=new Date().toISOString()){
  if(!Array.isArray(logs)||logs.length>20000)throw new Error('invalid_log_page');
  const height=number(head.number),hash=head.hash?.toLowerCase();if(!validReference('ethereum','transaction',hash))throw new Error('invalid_log_anchor');
  const b=builder('ethereum',asset,'configured Ethereum JSON-RPC',`First 512 ${asset} Transfer logs in finalized blocks ${Math.max(0,height-3)}–${height}; no internal execution traces.`,at,{height,hash}),seen=new Set(),blocks=new Map();
  for(const log of logs.slice(0,512)){
    if(log.removed===true||log.address?.toLowerCase()!==CONTRACTS[asset]||log.topics?.length!==3||log.topics[0]?.toLowerCase()!==TRANSFER||!/^0x0{24}[a-f0-9]{40}$/i.test(log.topics[1])||!/^0x0{24}[a-f0-9]{40}$/i.test(log.topics[2])||!/^0x[a-f0-9]{64}$/i.test(log.data))throw new Error('invalid_transfer_log');
    const h=number(log.blockNumber),bh=log.blockHash.toLowerCase(),index=number(log.transactionIndex),position=number(log.logIndex),txid=log.transactionHash.toLowerCase();
    if(h<Math.max(0,height-3)||h>height||h===height&&bh!==hash||blocks.has(h)&&blocks.get(h)!==bh)throw new Error('inconsistent_log_anchor');blocks.set(h,bh);
    const id=`ethereum:${asset}:log:${txid}:${position}`;if(seen.has(id))throw new Error('duplicate_log_event');seen.add(id);
    b.edge({id,from:b.node('address','0x'+log.topics[1].slice(-40).toLowerCase()),to:b.node('address','0x'+log.topics[2].slice(-40).toLowerCase()),kind:'erc20_transfer',amount:BigInt(log.data).toString(),txid,block:{height:h,hash:bh,index,log:position},finality:'source-reported finalized log'});
  }
  if(logs.length>512)b.graph.warnings.push(`${logs.length} logs returned; only the first 512 are included.`);
  return b.done();
}
export async function handleGraph(url,{env={},fetcher=fetch,explore=handleExplore,activity=queryEthereumActivity}={}){
  const p=url.searchParams,network=p.get('network'),asset=p.get('asset')||{bitcoin:'BTC',ethereum:'ETH',bloch:'BLCH'}[network],kind=p.get('kind')||'recent';
  let query=p.get('query')||'',cursor=p.get('cursor');
  const bad=error=>({status:400,body:{error}});
  if(url.search.length>512)return bad('query_too_long');
  if(!Object.hasOwn(ASSETS,asset)||ASSETS[asset].network!==network||!['recent','address','tx'].includes(kind))return bad('invalid_graph_scope');
  if([...p.keys()].some(k=>!['network','asset','kind','query','cursor'].includes(k)||p.getAll(k).length!==1))return bad('invalid_parameters');
  if(network!=='bitcoin'||kind==='tx'||query.toLowerCase().startsWith('bc1'))query=query.toLowerCase();
  if(kind==='recent'&&(query||cursor)||kind!=='recent'&&!validReference(network,kind==='tx'?'transaction':'address',query))return bad('invalid_reference');
  if(cursor&&(kind!=='address'||network==='bitcoin'&&!/^[a-f0-9]{64}$/.test(cursor)||network==='bloch'&&!/^[a-zA-Z0-9_-]{1,160}$/.test(cursor)||network==='ethereum'&&!/^(0|[1-9][0-9]{0,14})$/.test(cursor)))return bad('invalid_cursor');
  const tx=async(id,expected=null)=>{if(!validReference(network,'transaction',id))throw new Error('invalid_source_transaction');const response=await explore(new URL(`https://bloch.space/api/tx?${new URLSearchParams({network,query:id})}`),{env,fetcher});if(response.status!==200)throw new Error(response.body.error||'transaction_unavailable');if(expected&&(response.body.transaction.blockHash?.toLowerCase()!==expected.hash.toLowerCase()||number(response.body.transaction.blockNumber)!==number(expected.number)))throw new Error('sample_block_mismatch');return network==='bitcoin'?bitcoinTransactions([response.body.transaction],{source:response.body.source,scope:response.body.note,at:response.body.retrieved_at}):network==='bloch'?blochTransaction(response.body):ethereumTransaction(response.body,asset);};
  try{
    let graph;
    if(kind==='tx')graph=await tx(query);
    else if(kind==='address'&&network==='bitcoin'){
      const records=await read(fetcher,`${BTC}/address/${encodeURIComponent(query)}/txs/chain${cursor?'/'+cursor:''}`);
      graph=bitcoinTransactions(records,{query,scope:'Up to 25 confirmed source transactions, with at most 32 inputs and 32 outputs per transaction. This is not complete history.',next:records.length===25?records.at(-1)?.txid:null});
    }else if(kind==='address'&&network==='bloch'){
      const response=await queryBlochHistoryPage({address:query,cursor,fetcher});if(response.status!==200)throw new Error(response.body.error);graph=blochHistory(response.body);
    }else if(kind==='address'&&network==='ethereum'&&asset!=='ETH'){
      const response=await activity({address:query,asset,toBlock:cursor,env,fetcher});if(response.status!==200)throw new Error(response.body.error);graph=tokenActivity(response.body);
    }else if(kind==='address'){
      const b=builder(network,asset,'Bloch Space capability boundary','Native ETH address transaction history requires an index; it is not served by this source.');b.node('address',query);b.graph.warnings.push('Native ETH address history is unavailable. Load a transaction or the recent finalized-block sample.');graph=b.done();
    }else if(network==='bitcoin'){
      const blocks=await read(fetcher,`${BTC}/blocks`),block=blocks[0];if(!validReference(network,'transaction',block?.id))throw new Error('invalid_bitcoin_head');
      const transactions=await read(fetcher,`${BTC}/block/${block.id}/txs`);if(transactions.some(t=>t.status?.block_hash!==block.id))throw new Error('bitcoin_block_mismatch');
      graph=bitcoinTransactions(transactions,{scope:`First transaction page of Bitcoin block ${block.height}; source best-chain snapshot. Up to 32 inputs and outputs per transaction.`});
    }else if(network==='ethereum'&&asset!=='ETH'){
      const [chain,head]=await Promise.all([rpc(fetcher,env,'eth_chainId',[]),rpc(fetcher,env,'eth_getBlockByNumber',['finalized',false])]);if(chain!=='0x1')throw new Error('wrong_ethereum_chain');
      const end=number(head.number),start=Math.max(0,end-3),headers=await Promise.all(Array.from({length:end-start},(_,i)=>rpc(fetcher,env,'eth_getBlockByNumber',['0x'+(start+i).toString(16),false])));headers.push(head);
      for(const [i,header]of headers.entries())if(number(header.number)!==start+i||!validReference('ethereum','transaction',header.hash?.toLowerCase())||i&&header.parentHash?.toLowerCase()!==headers[i-1].hash.toLowerCase())throw new Error('inconsistent_window_headers');
      const logs=await rpc(fetcher,env,'eth_getLogs',[{address:CONTRACTS[asset],fromBlock:'0x'+start.toString(16),toBlock:head.number,topics:[TRANSFER]}]);
      if(!Array.isArray(logs)||logs.some(l=>headers[number(l.blockNumber)-start]?.hash?.toLowerCase()!==l.blockHash?.toLowerCase()))throw new Error('log_header_mismatch');
      const after=await rpc(fetcher,env,'eth_getBlockByNumber',[head.number,false]);if(after.hash?.toLowerCase()!==head.hash.toLowerCase())throw new Error('changed_source_head');graph=tokenLogs(logs,asset,head);
    }else{
      let ids=[],expected=null;
      if(network==='bloch'){const page=await read(fetcher,`${BLOCH}/indexer/transactions?limit=6`);ids=(page.transactions||[]).map(t=>t.txid).slice(0,6);}
      else{const [chain,head]=await Promise.all([rpc(fetcher,env,'eth_chainId',[]),rpc(fetcher,env,'eth_getBlockByNumber',['finalized',false])]);if(chain!=='0x1')throw new Error('wrong_ethereum_chain');if(!validReference(network,'transaction',head.hash?.toLowerCase())||!Array.isArray(head.transactions))throw new Error('invalid_source_block');ids=head.transactions.slice(0,6);expected=head;}
      graph=emptyGraph(network,asset);let succeeded=0;
      for(let offset=0;offset<ids.length;offset+=2){const results=await Promise.allSettled(ids.slice(offset,offset+2).map(id=>tx(id,expected)));for(const result of results){if(result.status==='fulfilled'){graph=mergeGraph(graph,result.value);succeeded++;}else graph.warnings.push('One sampled transaction could not be read.');}}
      if(ids.length&&!succeeded)throw new Error('sample_transactions_unavailable');
      graph.warnings.push(`${succeeded} of ${ids.length} sampled transactions loaded; a bounded source sample, not a network-wide graph.`);
    }
    return {status:200,body:graph};
  }catch(error){return {status:502,body:{error:'graph_source_unavailable',detail:['record_not_found','source_response_limit','sample_transactions_unavailable'].includes(error.message)?error.message:'The source could not provide a consistent bounded observation.'}};}
}
