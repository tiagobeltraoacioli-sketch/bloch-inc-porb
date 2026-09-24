// SPDX-License-Identifier: AGPL-3.0-or-later
// Read-only, bounded public-chain facts for Bloch Space.
import {queryChainWallet} from '../../graphus/chain/real-chain.js';
import {queryEthereumActivity} from '../../graphus/chain/ethereum-activity.js';
import {queryBlochHistoryPage} from '../../graphus/chain/bloch-chain.js';

const BTC = 'https://blockstream.info/api';
const BLOCH = 'https://blochl1.com';
const HEX64 = /^(?:0x)?[0-9a-fA-F]{64}$/;
const ETH_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BTC_ADDRESS = /^(?:[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[ac-hj-np-z02-9]{11,87})$/i;
const DECIMAL = /^(0|[1-9][0-9]{0,15})$/;
const MAX_BYTES = 3 * 1024 * 1024;
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TOKENS = new Map([
  ['0xdac17f958d2ee523a2206206994597c13d831ec7', 'USDT'],
  ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 'USDC'],
]);
const ZERO_ADDRESS = `0x${'0'.repeat(40)}`;

const reply = (status, body) => ({status, body});
const bad = (message, status = 400) => reply(status, {error: message});
const isHex64 = value => HEX64.test(value || '');
const quantity = value => {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) throw new Error('invalid_rpc_quantity');
  return BigInt(value);
};
const safeNumber = value => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('invalid_source_number');
  return n;
};
const iso = seconds => new Date(safeNumber(seconds) * 1000).toISOString();

async function json(fetcher, url, init = {}) {
  const response = await fetcher(url, {signal: AbortSignal.timeout(8500), ...init});
  if (!response.ok) throw new Error(response.status === 404 ? 'not_found' : 'source_unavailable');
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_BYTES) throw new Error('response_too_large');
  if (!response.body?.getReader) throw new Error('invalid_source_response');
  const reader = response.body.getReader();
  let bytes = 0;
  const parts = [];
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error('response_too_large'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const decoder = new TextDecoder();
  const text = parts.map(part => decoder.decode(part, {stream: true})).join('') + decoder.decode();
  try { return JSON.parse(text); } catch { throw new Error('invalid_source_response'); }
}

async function rpcResult(fetcher, endpoint, method, params, allowNull = false) {
  const body = await json(fetcher, endpoint, {
    method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}),
  });
  if (body?.jsonrpc !== '2.0' || body.id !== 1 || body.error || !Object.hasOwn(body, 'result') ||
      (!allowNull && body.result == null)) throw new Error('rpc_unavailable');
  return body.result;
}
const rpc = (fetcher, endpoint, method, params) => rpcResult(fetcher, endpoint, method, params);

function ethereumEndpoint(env) {
  const value = env.GRAPHUS_ETHEREUM_RPC_URL;
  let url;
  try { url = new URL(value); } catch { throw new Error('ethereum_rpc_not_configured'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('ethereum_rpc_not_configured');
  return url.href;
}

function source(network, name, retrievedAt, note) {
  return {network, source: name, retrieved_at: retrievedAt, independent_verification: false, note};
}

async function bitcoinOverview(fetcher, now) {
  const blocks = await json(fetcher, `${BTC}/blocks`);
  if (!Array.isArray(blocks) || !blocks.length || !isHex64(blocks[0]?.id)) throw new Error('invalid_source_response');
  const [mempool, fees, recentMempool] = await Promise.allSettled([
    json(fetcher, `${BTC}/mempool`), json(fetcher, `${BTC}/fee-estimates`),
    json(fetcher, `${BTC}/mempool/recent`),
  ]);
  return {
    ...source('bitcoin', 'Blockstream Esplora', now(), 'Best-chain, mempool histogram and recent mempool entries are separate source snapshots; confirmation is probabilistic.'),
    head: blocks[0], recent_blocks: blocks.slice(0, 10),
    mempool: mempool.status === 'fulfilled' ? mempool.value : null,
    fee_estimates_sat_vbyte: fees.status === 'fulfilled' ? fees.value : null,
    recent_mempool: recentMempool.status === 'fulfilled' && Array.isArray(recentMempool.value) ?
      recentMempool.value.filter(tx => isHex64(tx?.txid) && Number.isSafeInteger(tx.fee) && tx.fee >= 0 &&
        Number.isSafeInteger(tx.vsize) && tx.vsize > 0).slice(0,10) : [],
  };
}

async function ethereumOverview(fetcher, env, now) {
  const endpoint = ethereumEndpoint(env);
  const chainId = await rpc(fetcher, endpoint, 'eth_chainId', []);
  if (quantity(chainId) !== 1n) throw new Error('ethereum_network_mismatch');
  const [head, finalized, gasPrice, feeHistory] = await Promise.all([
    rpc(fetcher, endpoint, 'eth_getBlockByNumber', ['latest', false]),
    rpc(fetcher, endpoint, 'eth_getBlockByNumber', ['finalized', false]),
    rpc(fetcher, endpoint, 'eth_gasPrice', []),
    rpc(fetcher, endpoint, 'eth_feeHistory', ['0xc', 'latest', []]).then(ethereumFeeHistoryFacts).catch(() => null),
  ]);
  if (!isHex64(head?.hash) || !isHex64(finalized?.hash)) throw new Error('invalid_source_response');
  return {
    ...source('ethereum', 'configured Ethereum JSON-RPC', now(), 'Latest and finalized are distinct source-reported checkpoints.'),
    head, finalized, gas_price_wei: quantity(gasPrice).toString(), fee_history:feeHistory,
  };
}

export function ethereumFeeHistoryFacts(history,maxCount=12) {
  const ratios=history?.gasUsedRatio, fees=history?.baseFeePerGas;
  if(!Array.isArray(ratios)||!ratios.length||ratios.length>maxCount||!Array.isArray(fees)||fees.length!==ratios.length+1)throw new Error('invalid_source_response');
  if(!ratios.every(value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1))throw new Error('invalid_source_response');
  const oldest=quantity(history.oldestBlock);
  if(oldest+BigInt(ratios.length)>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('invalid_source_response');
  return {oldest_height:oldest.toString(),gas_used_ratio:ratios,base_fee_wei:fees.slice(0,-1).map(value=>quantity(value).toString()),
    next_base_fee_wei:quantity(fees.at(-1)).toString()};
}

async function bitcoinSeries(fetcher,range,now){
  const requested=Number(range),blocks=[];
  let nextUrl=`${BTC}/blocks`,partial=false;
  while(blocks.length<requested){
    let page;
    try{page=await json(fetcher,nextUrl);}catch(error){if(!blocks.length)throw error;partial=true;break;}
    if(!Array.isArray(page)||!page.length||page.length>10){if(!blocks.length)throw new Error('invalid_source_response');partial=true;break;}
    for(const block of page){
      const previous=blocks.at(-1);
      if(!isHex64(block?.id)||!isHex64(block?.previousblockhash)||!Number.isSafeInteger(block.height)||block.height<0||
        !Number.isSafeInteger(block.timestamp)||block.timestamp<0||!Number.isSafeInteger(block.tx_count)||block.tx_count<0||
        !Number.isSafeInteger(block.size)||block.size<0||!Number.isSafeInteger(block.weight)||block.weight<0||
        previous&&(block.height!==previous.height-1||previous.previousblockhash.toLowerCase()!==block.id.toLowerCase())){
        if(!blocks.length)throw new Error('invalid_source_response');partial=true;break;
      }
      blocks.push({id:block.id,height:block.height,previousblockhash:block.previousblockhash,timestamp:block.timestamp,
        tx_count:block.tx_count,size:block.size,weight:block.weight});
      if(blocks.length===requested)break;
    }
    if(partial||blocks.length===requested||page.length<10||blocks.at(-1).height===0)break;
    nextUrl=`${BTC}/blocks/${blocks.at(-1).height-1}`;
  }
  return {...source('bitcoin','Blockstream Esplora',now(),'Consecutive source-reported best-chain blocks; later requests may observe a reorganization.'),
    requested,returned:blocks.length,partial:partial||blocks.length<requested,blocks};
}

async function ethereumSeries(fetcher,env,range,now){
  const endpoint=ethereumEndpoint(env),requested=Number(range);
  const [chainId,head]=await Promise.all([rpc(fetcher,endpoint,'eth_chainId',[]),rpc(fetcher,endpoint,'eth_getBlockByNumber',['latest',false])]);
  if(quantity(chainId)!==1n||!isHex64(head?.hash))throw new Error('ethereum_network_mismatch');
  const height=quantity(head.number),raw=await rpc(fetcher,endpoint,'eth_feeHistory',[`0x${requested.toString(16)}`,head.number,[]]);
  const history=ethereumFeeHistoryFacts(raw,requested);
  if(BigInt(history.oldest_height)+BigInt(history.gas_used_ratio.length)-1n!==height)throw new Error('invalid_source_response');
  return {...source('ethereum','configured Ethereum JSON-RPC',now(),'Fee history is source-reported and anchored to one requested execution height; finalized status is a separate observation.'),
    requested,returned:history.gas_used_ratio.length,head:{height:height.toString(),hash:head.hash},fee_history:history};
}

async function blochPeerSeries(fetcher,range,now){
  const response=await json(fetcher,`${BLOCH}/api/v1/observability/peer-history?period=${range}`),data=response?.data;
  const points=data?.points,limit={"6h":75,"24h":99,"7d":171}[range];
  if(data?.period!==range||!Array.isArray(points)||points.length>limit||points.some((point,index)=>
    !Number.isSafeInteger(point?.at)||point.at<0||index>0&&point.at<=points[index-1].at||
    point.connections!=null&&(!Number.isSafeInteger(point.connections)||point.connections<0)||
    point.reporting_nodes!=null&&(!Number.isSafeInteger(point.reporting_nodes)||point.reporting_nodes<0)))throw new Error('invalid_source_response');
  return {...source('bloch','Bloch monitored-node observability',now(),'Aggregate socket connections across monitored nodes; changing coverage and gaps are retained. This is not a unique-peer count.'),
    period:range,points,returned:points.length,valid_points:points.filter(point=>point.connections!=null&&point.reporting_nodes!=null).length};
}

async function blochOverview(fetcher, now) {
  const [networkResult, healthResult, transactionsResult, holdersResult, peersResult, historyResult, mempoolResult] = await Promise.allSettled([
    json(fetcher, `${BLOCH}/api/v1/network`),
    json(fetcher, `${BLOCH}/indexer/health`),
    json(fetcher, `${BLOCH}/indexer/transactions?limit=8`),
    json(fetcher, `${BLOCH}/indexer/holders?limit=64`),
    json(fetcher, `${BLOCH}/api/v1/observability/peer-distribution`),
    json(fetcher, `${BLOCH}/api/v1/observability/peer-history?period=6h`),
    rpc(fetcher, `${BLOCH}/rpc`, 'getmempoolinfo', []),
  ]);
  const network = networkResult.status === 'fulfilled' && networkResult.value?.data?.head?.data ? networkResult.value : null;
  const health = healthResult.status === 'fulfilled' && healthResult.value?.ok ? healthResult.value : null;
  const transactions = transactionsResult.status === 'fulfilled' && Array.isArray(transactionsResult.value?.transactions) ? transactionsResult.value : null;
  const holders = holdersResult.status === 'fulfilled' && Array.isArray(holdersResult.value?.holders) ? holdersResult.value : null;
  const peerSource=peersResult.status==='fulfilled'?peersResult.value?.data:null;
  const peerBins=peerSource?.bins;
  const peers=Array.isArray(peerBins)&&peerBins.length<=256&&Number.isSafeInteger(peerSource?.reporting_nodes)&&peerSource.reporting_nodes>=0&&
    Number.isSafeInteger(peerSource?.peer_sampled_at)&&peerBins.every(bin=>Number.isSafeInteger(bin?.connections_per_node)&&bin.connections_per_node>=0&&Number.isSafeInteger(bin?.reporting_nodes)&&bin.reporting_nodes>0)&&
    peerBins.reduce((sum,bin)=>sum+bin.reporting_nodes,0)===peerSource.reporting_nodes?
    {bins:peerBins,reporting_nodes:peerSource.reporting_nodes,sampled_at:peerSource.peer_sampled_at,scope:'connection_counts_across_monitored_nodes'}:null;
  const historySource=historyResult.status==='fulfilled'?historyResult.value?.data:null;
  const historyPoints=historySource?.points;
  const peerHistory=historySource?.period==='6h'&&Array.isArray(historyPoints)&&historyPoints.length<=75&&historyPoints.every((point,index)=>
    Number.isSafeInteger(point?.at)&&point.at>=0&&(index===0||point.at>historyPoints[index-1].at)&&
    (point.connections==null||Number.isSafeInteger(point.connections)&&point.connections>=0)&&
    (point.reporting_nodes==null||Number.isSafeInteger(point.reporting_nodes)&&point.reporting_nodes>=0))?
    {period:'6h',points:historyPoints,scope:'aggregate_connection_reports_across_monitored_nodes'}:null;
  const mempoolSource=mempoolResult.status==='fulfilled'?mempoolResult.value:null;
  const mempool=Number.isSafeInteger(mempoolSource?.size)&&mempoolSource.size>=0&&Number.isSafeInteger(mempoolSource?.max)&&mempoolSource.max>0&&
    Number.isSafeInteger(mempoolSource?.bytes)&&mempoolSource.bytes>=0?{
      size:mempoolSource.size,max:mempoolSource.max,bytes:mempoolSource.bytes,
      next_base_fee_millisat_per_gas:/^[0-9]+$/.test(mempoolSource.next_base_fee_millisat_per_gas||'')?mempoolSource.next_base_fee_millisat_per_gas:null,
      source_node:mempoolSource.corroboration?.source_node||null,
    }:null;
  if (!network && !health) throw new Error('source_unavailable');
  const head = network?.data.head.data ?? {
    block_id: health.chain_tip,
    height: health.indexed_to_height,
    slot: health.indexed_to_slot,
    finalized_height: health.finalized_height,
    epoch: Math.floor(health.indexed_to_slot / 32),
  };
  return {
    ...source('bloch', network ? 'Bloch Explorer and verified historical indexer' : 'Bloch verified historical indexer', now(), network ? 'The indexer and network head are separate snapshots; unavailable supplemental panels are left empty.' : 'Network-head comparison unavailable; showing the verified indexer snapshot.'),
    head, corroboration: network ? network.data.head.corroboration ?? network.corroboration : {level:'indexer verified snapshot'},
    health, recent_transactions: transactions?.transactions ?? [], holders, peers, peer_history:peerHistory, mempool_details:mempool,
    network_diagnostics:network?{
      sampled_at:network.data.sampled_at,
      build:{version:network.data.build?.data?.build_version??null,commit:network.data.build?.data?.commit??null,tree_state:network.data.build?.data?.tree_state??null},
      plane:network.data.plane??null,witness:network.data.witness??null,
      nodes:Array.isArray(network.data.nodes)?network.data.nodes.slice(0,32).map(node=>({
        id:typeof node.id==='string'?node.id:null,role:typeof node.role==='string'?node.role:null,
        status:typeof node.status==='string'?node.status:null,
        height:Number.isSafeInteger(node.chain?.height)?node.chain.height:null,
        slot:Number.isSafeInteger(node.chain?.slot)?node.chain.slot:null,
        latency_ms:Number.isSafeInteger(node.latency_ms)?node.latency_ms:null,
      })):[],
      reorg_events:Array.isArray(network.data.head?.corroboration?.reorg_events)?network.data.head.corroboration.reorg_events.slice(0,8).map(event=>({
        signal:typeof event.signal==='string'?event.signal:null,
        kind:typeof event.kind==='string'?event.kind:null,
        at:Number.isSafeInteger(event.at)?event.at:null,
        was:Number.isSafeInteger(event.was)?event.was:null,
        now:Number.isSafeInteger(event.now)?event.now:null,
      })):[],
    }:null,
  };
}

async function blochValidators(fetcher, offset, now) {
  const page=await json(fetcher,`${BLOCH}/g4/validators?offset=${offset}&limit=32`);
  const total=page?.counts?.total,active=page?.counts?.active,rows=page?.validators;
  if(page?.offset!==offset||page?.limit!==32||!Number.isSafeInteger(total)||total<0||total>4096||
    !Number.isSafeInteger(active)||active<0||active>total||!Array.isArray(rows)||rows.length>32||page.returned!==rows.length||
    (offset+rows.length<total&&rows.length!==32)||
    !Number.isSafeInteger(page.generated_at)||page.generated_at<0||!isHex64(page.head?.block_id)||
    !Number.isSafeInteger(page.head?.height)||page.head.height<0||!Number.isSafeInteger(page.head?.slot)||page.head.slot<page.head.height)throw new Error('invalid_source_response');
  const validators=rows.map((row,index)=>{
    if(row?.index!==offset+index)throw new Error('invalid_source_response');
    if(typeof row.unavailable==='string')return {index:row.index,unavailable:row.unavailable.slice(0,120)};
    if(!isHex64(row.pubkey_hash)||typeof row.state!=='string'||row.state.length>32||
      !/^[0-9]{1,40}$/.test(row.own_stake_sat||'')||!/^[0-9]{1,40}$/.test(row.effective_stake_sat||'')||
      !/^[0-9]{1,6}$/.test(row.commission_bps||'')||typeof row.slashed!=='boolean')throw new Error('invalid_source_response');
    return {index:row.index,pubkey_hash:row.pubkey_hash,state:row.state,
      own_stake_sat:row.own_stake_sat,effective_stake_sat:row.effective_stake_sat,
      commission_bps:row.commission_bps,slashed:row.slashed,
      withdrawal_credentials:isHex64(row.withdrawal_credentials)?row.withdrawal_credentials:null};
  });
  return {...source('bloch','Bloch Explorer validator aggregator',now(),'A 32-index source page, generated separately from the network overview; missing rows remain explicit.'),
    head:{height:page.head.height,slot:page.head.slot,block_id:page.head.block_id},
    counts:{total,active,total_active_stake_sat:/^[0-9]{1,40}$/.test(page.counts.total_active_stake_sat||'')?page.counts.total_active_stake_sat:null},
    validators,offset,returned:validators.length,next_offset:offset+validators.length<total&&validators.length?offset+32:null,
    generated_at:page.generated_at,corroboration:{state:typeof page.corroboration?.state==='string'?page.corroboration.state:'unavailable',
      differing:Array.isArray(page.corroboration?.differing)?page.corroboration.differing.filter(value=>typeof value==='string').slice(0,16):[]}};
}

async function bitcoinBlock(fetcher, query, now, offset = 0) {
  let hash = query.replace(/^0x/, '').toLowerCase();
  if (DECIMAL.test(query)) {
    const response = await fetcher(`${BTC}/block-height/${query}`, {signal: AbortSignal.timeout(8500)});
    if (!response.ok) throw new Error(response.status === 404 ? 'not_found' : 'source_unavailable');
    hash = (await response.text()).trim();
  }
  if (!isHex64(hash)) throw new Error('invalid_source_response');
  const [block, txids, status] = await Promise.all([
    json(fetcher, `${BTC}/block/${hash}`),
    json(fetcher, `${BTC}/block/${hash}/txids`),
    json(fetcher, `${BTC}/block/${hash}/status`),
  ]);
  if (block?.id !== hash || !Array.isArray(txids) || typeof status?.in_best_chain !== 'boolean') throw new Error('invalid_source_response');
  return {...source('bitcoin', 'Blockstream Esplora', now(), 'Transaction IDs are paged in groups of 32; best-chain membership may change.'), block, status, transaction_ids: txids.slice(offset, offset + 32), total_transactions: txids.length, offset, next_offset:offset + 32 < txids.length ? offset + 32 : null};
}

async function bitcoinTx(fetcher, query, now) {
  const [transaction, outspends, blocks] = await Promise.all([
    json(fetcher, `${BTC}/tx/${query}`), json(fetcher, `${BTC}/tx/${query}/outspends`),
    json(fetcher, `${BTC}/blocks`).catch(() => null),
  ]);
  if (transaction?.txid !== query || !Array.isArray(transaction.vin) || !Array.isArray(transaction.vout) || !Array.isArray(outspends)) throw new Error('invalid_source_response');
  const headHeight = Number.isSafeInteger(blocks?.[0]?.height) && blocks[0].height >= 0 && isHex64(blocks[0].id) ? blocks[0].height : null;
  return {...source('bitcoin', 'Blockstream Esplora', now(), 'Transaction status and best-chain head are separate source snapshots; confirmation depth may change. Inputs do not establish ownership.'), transaction, outspends, facts:bitcoinTransactionFacts(transaction, headHeight)};
}

export function bitcoinTransactionFacts(tx, headHeight = null) {
  const coinbase = tx.vin?.some(input => input.is_coinbase === true) ?? false;
  const validSats = value => Number.isSafeInteger(value) && value >= 0;
  const inputs = Array.isArray(tx.vin) ? tx.vin : [];
  const outputs = Array.isArray(tx.vout) ? tx.vout : [];
  const prevoutsWithValue = inputs.filter(input => validSats(input?.prevout?.value)).length;
  const inputTotal = !coinbase && inputs.length && prevoutsWithValue === inputs.length ?
    inputs.reduce((sum, input) => sum + BigInt(input.prevout.value), 0n) : null;
  const outputTotal = outputs.length && outputs.every(output => validSats(output?.value)) ?
    outputs.reduce((sum, output) => sum + BigInt(output.value), 0n) : null;
  const difference = inputTotal !== null && outputTotal !== null && inputTotal >= outputTotal ? inputTotal - outputTotal : null;
  const feeCheck = coinbase ? 'not_applicable' : inputTotal === null || outputTotal === null ? 'unavailable' :
    difference === null ? 'inconsistent_values' : !validSats(tx.fee) ? 'reported_fee_unavailable' :
      difference === BigInt(tx.fee) ? 'matches_source_fee' : 'differs_from_source_fee';
  const weight = Number(tx.weight);
  const fee = Number(tx.fee);
  const virtualSize = Number.isSafeInteger(weight) && weight > 0 ? Math.ceil(weight / 4) : null;
  const blockHeight = tx.status?.block_height;
  const confirmations = tx.status?.confirmed !== true ? 0 : Number.isSafeInteger(headHeight) && Number.isSafeInteger(blockHeight) &&
    blockHeight >= 0 && headHeight >= blockHeight ? headHeight - blockHeight + 1 : null;
  return {
    coinbase,
    virtual_size_vb: virtualSize,
    fee_rate_sat_vb: !coinbase && virtualSize && Number.isSafeInteger(fee) && fee >= 0 ? (fee / virtualSize).toFixed(2) : null,
    signals_rbf: !coinbase && tx.vin?.some(input => Number.isSafeInteger(input.sequence) && input.sequence < 0xfffffffe) === true,
    confirmations,
    head_height:headHeight,
    flow:{input_total_sat:inputTotal?.toString() ?? null,output_total_sat:outputTotal?.toString() ?? null,
      derived_fee_sat:difference?.toString() ?? null,prevouts_with_value:prevoutsWithValue,input_count:inputs.length,fee_check:feeCheck},
  };
}

export function ethereumReceiptFacts(receipt, transactionType = null) {
  if (!receipt) return {gas_fee_wei:null, blob_fee_wei:null, total_fee_wei:null, blob_fee_status:'unavailable', blob_gas_used:null, blob_gas_price_wei:null, token_transfers:[], token_transfer_count:0};
  let gasFee = null;
  try {
    if (receipt.gasUsed != null && receipt.effectiveGasPrice != null) gasFee = (quantity(receipt.gasUsed) * quantity(receipt.effectiveGasPrice)).toString();
  } catch { /* Preserve the raw receipt without an invented fee. */ }
  const hasBlobField = receipt.blobGasUsed != null || receipt.blobGasPrice != null;
  let isBlobType = false;
  try { isBlobType = (receipt.type ?? transactionType) != null && quantity(receipt.type ?? transactionType) === 3n; }
  catch { /* An invalid type does not justify a zero blob fee. */ isBlobType = true; }
  let blobFee = null, blobGasUsed = null, blobGasPrice = null;
  let blobFeeStatus = hasBlobField || isBlobType ? 'incomplete' : 'not_applicable';
  if (receipt.blobGasUsed != null && receipt.blobGasPrice != null) {
    try {
      blobGasUsed = quantity(receipt.blobGasUsed).toString();
      blobGasPrice = quantity(receipt.blobGasPrice).toString();
      blobFee = (BigInt(blobGasUsed) * BigInt(blobGasPrice)).toString();
      blobFeeStatus = 'available';
    } catch { /* Partial or malformed blob fields cannot establish a total. */ }
  }
  const totalFee = gasFee == null || blobFeeStatus === 'incomplete' ? null :
    (BigInt(gasFee) + BigInt(blobFee ?? '0')).toString();
  const transfers = [];
  if (receipt.status === '0x1' && Array.isArray(receipt.logs)) {
    for (const log of receipt.logs) {
      const asset = TOKENS.get(log.address?.toLowerCase());
      if (!asset || !Array.isArray(log.topics) || log.topics.length !== 3 || log.topics[0]?.toLowerCase() !== TRANSFER ||
          !/^0x[0-9a-f]{64}$/i.test(log.topics[1] || '') || !/^0x[0-9a-f]{64}$/i.test(log.topics[2] || '') ||
          !/^0x[0-9a-f]{64}$/i.test(log.data || '') ||
          !/^0x0{24}[0-9a-f]{40}$/i.test(log.topics[1]) || !/^0x0{24}[0-9a-f]{40}$/i.test(log.topics[2])) continue;
      const from = `0x${log.topics[1].slice(-40).toLowerCase()}`;
      const to = `0x${log.topics[2].slice(-40).toLowerCase()}`;
      transfers.push({asset, from, to, amount_base_units:BigInt(log.data).toString(),
        kind:from === ZERO_ADDRESS ? 'mint' : to === ZERO_ADDRESS ? 'burn' : 'transfer', log_index:log.logIndex ?? null});
    }
  }
  return {gas_fee_wei:gasFee, blob_fee_wei:blobFee, total_fee_wei:totalFee,
    blob_fee_status:blobFeeStatus, blob_gas_used:blobGasUsed, blob_gas_price_wei:blobGasPrice,
    token_transfers:transfers.slice(0,64), token_transfer_count:transfers.length};
}

async function ethereumBlock(fetcher, env, query, now, offset = 0) {
  const endpoint = ethereumEndpoint(env);
  const byHash = isHex64(query);
  const method = byHash ? 'eth_getBlockByHash' : 'eth_getBlockByNumber';
  const tag = byHash ? `0x${query.replace(/^0x/, '')}` : `0x${BigInt(query).toString(16)}`;
  const block = await rpcResult(fetcher, endpoint, method, [tag, false], true);
  if (block == null) throw new Error('not_found');
  if (!isHex64(block?.hash) || !Array.isArray(block.transactions)) throw new Error('invalid_source_response');
  const finalized = await rpc(fetcher, endpoint, 'eth_getBlockByNumber', ['finalized', false]);
  return {
    ...source('ethereum', 'configured Ethereum JSON-RPC', now(), 'Transaction IDs are paged in groups of 32. Finality is compared to the source-reported finalized checkpoint.'),
    block: {...block, transactions: []}, transaction_ids:block.transactions.slice(offset, offset + 32),
    total_transactions: block.transactions.length, offset, next_offset:offset + 32 < block.transactions.length ? offset + 32 : null,
    finalized_height: safeNumber(quantity(finalized.number)),
  };
}

async function ethereumTx(fetcher, env, query, now) {
  const endpoint = ethereumEndpoint(env);
  const transaction = await rpcResult(fetcher, endpoint, 'eth_getTransactionByHash', [query], true);
  if (transaction == null) throw new Error('not_found');
  const [receiptResult, finalized, latestHeight] = await Promise.all([
    rpcResult(fetcher, endpoint, 'eth_getTransactionReceipt', [query], true).then(value => ({value, unavailable:false})).catch(() => ({value:null, unavailable:true})),
    rpc(fetcher, endpoint, 'eth_getBlockByNumber', ['finalized', false]).catch(() => null),
    rpc(fetcher, endpoint, 'eth_blockNumber', []).catch(() => null),
  ]);
  if (transaction?.hash?.toLowerCase() !== query.toLowerCase()) throw new Error('invalid_source_response');
  const receipt = receiptResult.value;
  const receiptStatus = receiptResult.unavailable ? 'source_unavailable' : receipt == null ?
    transaction.blockNumber == null ? 'pending' : 'missing' : ethereumReceiptMatches(transaction, receipt) ? 'available' : 'inconsistent';
  const position = ethereumTransactionPosition(transaction, receiptStatus, finalized, latestHeight);
  return {
    ...source('ethereum', 'configured Ethereum JSON-RPC', now(), 'Receipt availability, execution status and finality are separate. Latest and finalized heights are separate source snapshots.'),
    transaction, receipt, receipt_status:receiptStatus, position, finalized_height:position.finalized_height,
    ...ethereumReceiptFacts(receiptStatus === 'available' ? receipt : null, transaction.type),
  };
}

function ethereumReceiptMatches(tx, receipt) {
  try {
    return isHex64(receipt.transactionHash) && isHex64(receipt.blockHash) && isHex64(tx.blockHash) &&
      receipt.transactionHash.toLowerCase() === tx.hash.toLowerCase() &&
      receipt.blockHash?.toLowerCase() === tx.blockHash?.toLowerCase() &&
      quantity(receipt.blockNumber) === quantity(tx.blockNumber);
  } catch { return false; }
}

export function ethereumTransactionPosition(tx, receiptStatus, finalized, latestHeight) {
  const height = block => {
    try { return isHex64(block?.hash) ? safeNumber(quantity(block.number)) : null; }
    catch { return null; }
  };
  const finalizedHeight = height(finalized);
  let headHeight = null;
  try { if (latestHeight != null) headHeight = safeNumber(quantity(latestHeight)); }
  catch { /* An invalid head height cannot establish confirmation depth. */ }
  let transactionHeight = null;
  try { if (tx.blockNumber != null) transactionHeight = safeNumber(quantity(tx.blockNumber)); }
  catch { /* An invalid height cannot establish position. */ }
  const confirmed = receiptStatus === 'available' && transactionHeight != null;
  return {
    head_height:headHeight,
    finalized_height:finalizedHeight,
    confirmations:confirmed && headHeight != null && headHeight >= transactionHeight ? headHeight - transactionHeight + 1 : null,
    finality_relation:confirmed && finalizedHeight != null ?
      transactionHeight <= finalizedHeight ? 'at_or_below_reported_checkpoint' : 'above_reported_checkpoint' : 'unavailable',
  };
}

async function blochBlock(fetcher, query, now, offset = 0) {
  const envelope = await json(fetcher, `${BLOCH}/api/v1/block/${query}`);
  if (!envelope?.data?.block_id || !envelope.corroboration) throw new Error('invalid_source_response');
  let transactions = null;
  if (envelope.data.tx_count > 0) {
    try { transactions = await json(fetcher, `${BLOCH}/indexer/block/${envelope.data.block_id}/transactions`); }
    catch { transactions = null; }
  }
  const ids = transactions?.transactions?.map(row => row.txid) ?? [];
  return {...source('bloch', 'Bloch Explorer and verified historical indexer', now(), 'Slot is the primary PoS position; empty slots have no block.'), block: envelope.data, corroboration: envelope.corroboration, transaction_ids:ids.slice(offset, offset + 32), total_transactions:ids.length || envelope.data.tx_count, offset, next_offset:offset + 32 < ids.length ? offset + 32 : null};
}

async function blochTx(fetcher, query, now) {
  const [transaction, healthResult] = await Promise.all([
    json(fetcher, `${BLOCH}/indexer/tx/${query}`),
    json(fetcher, `${BLOCH}/indexer/health`).catch(() => null),
  ]);
  if (transaction?.txid !== query) throw new Error('invalid_source_response');
  const health = healthResult?.ok ? healthResult : null;
  return {...source('bloch', 'Bloch verified historical indexer', now(), 'Transaction and health may be separate indexer snapshots; finality is shown with the comparison scope. Input references do not prove ownership.'), transaction, position:blochTransactionPosition(transaction, health)};
}

export function blochTransactionPosition(tx, health) {
  const height = safeNumber(tx.height);
  const indexedHeight = safeNumber(tx.as_of_height);
  const indexedSlot = safeNumber(tx.as_of_slot);
  if (height > indexedHeight || !isHex64(tx.chain_tip)) throw new Error('invalid_source_response');
  const result = {
    indexed_depth_blocks:indexedHeight - height + 1,
    indexed_to_height:indexedHeight,
    indexed_to_slot:indexedSlot,
    indexed_chain_tip:tx.chain_tip,
    finalized_height:null,
    finality_relation:'unavailable',
    comparison_scope:'transaction_snapshot_only',
  };
  if (!health || !Number.isSafeInteger(health.finalized_height) || health.finalized_height < 0 ||
      !Number.isSafeInteger(health.indexed_to_height) || health.finalized_height > health.indexed_to_height ||
      !Number.isSafeInteger(health.indexed_to_slot) || health.indexed_to_slot < health.indexed_to_height ||
      !isHex64(health.chain_tip)) return result;
  result.finalized_height = health.finalized_height;
  result.finality_relation = height <= health.finalized_height ? 'at_or_below_reported_checkpoint' : 'above_reported_checkpoint';
  result.comparison_scope = health.indexed_to_height === indexedHeight && health.indexed_to_slot === indexedSlot &&
    health.chain_tip.toLowerCase() === tx.chain_tip.toLowerCase() ? 'matched_indexer_tip' : 'separate_indexer_snapshots';
  return result;
}

async function address(fetcher, env, network, asset, query, now) {
  const chain = {bitcoin:'bitcoin-mainnet', ethereum:'ethereum-mainnet', bloch:'bloch-mainnet'}[network];
  const result = await queryChainWallet({network: chain, asset, address: query, env, fetcher});
  if (result.status !== 200) return reply(result.status, result.body);
  let activity = null;
  let utxos = null;
  if (network === 'ethereum' && ['USDT', 'USDC'].includes(asset)) {
    const response = await queryEthereumActivity({asset, address: query, env, fetcher});
    if (response.status === 200) activity = response.body;
  }
  if (network === 'bitcoin') {
    try {
      const rows = await json(fetcher, `${BTC}/address/${encodeURIComponent(query)}/utxo`);
      if (Array.isArray(rows)) utxos = {items:rows.slice(0,32),total:rows.length,coverage:'source_address_utxo_set_at_separate_retrieval'};
    } catch { /* The Graphus balance remains independently usable. */ }
  }
  if (network === 'bloch') {
    try {
      const page = await json(fetcher, `${BLOCH}/indexer/utxos/${query.toLowerCase()}?limit=32`);
      if (Array.isArray(page?.utxos)) utxos = {items:page.utxos,total:page.total,as_of_slot:page.as_of_slot,coverage:'first_32_indexed_unspent_outputs'};
    } catch { /* The Graphus balance remains independently usable. */ }
  }
  return reply(200, {...source(network, 'Graphus public-chain adapter', now(), 'Graphus queries one identifier and a bounded observation window; UTXO details, when available, are a separate source snapshot.'), wallet: result.body, token_activity: activity, utxos});
}

export async function handleExplore(url, {env = {}, fetcher = fetch, now = () => new Date().toISOString()} = {}) {
  if (url.search.length > 256) return bad('query_too_long');
  const route = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const network = url.searchParams.get('network');
  if (!['bitcoin', 'ethereum', 'bloch'].includes(network)) return bad('invalid_network');
  const query = url.searchParams.get('query')?.trim() ?? '';
  const offsetRaw = url.searchParams.get('offset');
  const offset = offsetRaw == null ? 0 : Number(offsetRaw);
  const cursor = url.searchParams.get('cursor');
  const range = url.searchParams.get('range');
  const asset = (url.searchParams.get('asset') || {bitcoin:'BTC', ethereum:'ETH', bloch:'BLCH'}[network]).toUpperCase();
  if ([...url.searchParams.keys()].some(key => !['network', 'query', 'asset', 'offset', 'cursor','range'].includes(key)) || [...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length > 1)) return bad('invalid_parameters');
  if(range!=null&&route!=='series')return bad('invalid_range');
  if (cursor != null && (route !== 'history' || !/^[a-zA-Z0-9_-]{1,160}$/.test(cursor))) return bad('invalid_cursor');
  if (offsetRaw != null && (!['block','validators'].includes(route) || !/^(0|[1-9][0-9]{0,5})$/.test(offsetRaw) || !Number.isSafeInteger(offset)||route==='validators'&&(offset%32!==0||offset>4096))) return bad('invalid_offset');
  if (route !== 'address' && url.searchParams.has('asset')) return bad('invalid_parameters');
  if (['overview','validators','series'].includes(route) && query) return bad('invalid_parameters');
  if (!['overview','validators','series'].includes(route) && (!query || query.length > 100)) return bad('invalid_query');
  if(route==='series'){
    if(!(network==='bitcoin'&&['10','30'].includes(range)||network==='ethereum'&&['12','48'].includes(range)||network==='bloch'&&['6h','24h','7d'].includes(range)))return bad('invalid_range');
    try{return reply(200,await (network==='bitcoin'?bitcoinSeries(fetcher,range,now):network==='ethereum'?ethereumSeries(fetcher,env,range,now):blochPeerSeries(fetcher,range,now)));}
    catch{return bad('source_unavailable',503);}
  }
  if (route === 'validators') {
    if(network!=='bloch')return bad('invalid_network');
    try{return reply(200,await blochValidators(fetcher,offset,now));}
    catch{return bad('source_unavailable',503);}
  }
  if (route === 'history') {
    if (network !== 'bloch' || !/^[0-9a-fA-F]{64}$/.test(query)) return bad('invalid_history_address');
    const result = await queryBlochHistoryPage({address:query,cursor,fetcher,now:()=>new Date(now())});
    if (result.status !== 200) return reply(result.status,result.body);
    return reply(200,{...source('bloch','Bloch verified historical indexer',now(),'Cursor page is a separate indexed history observation; it is not the balance snapshot.'),page:result.body});
  }
  if (route === 'address' && !(
    network === 'bitcoin' && asset === 'BTC' && BTC_ADDRESS.test(query) ||
    network === 'ethereum' && ['ETH', 'USDT', 'USDC'].includes(asset) && ETH_ADDRESS.test(query) ||
    network === 'bloch' && asset === 'BLCH' && /^[0-9a-fA-F]{64}$/.test(query)
  )) return bad('invalid_address_or_asset');
  if (route === 'block' && !(isHex64(query) || DECIMAL.test(query))) return bad('invalid_block');
  if (route === 'tx' && !isHex64(query)) return bad('invalid_transaction');
  if (!['overview', 'address', 'block', 'tx'].includes(route)) return bad('not_found', 404);
  try {
    if (route === 'address') return address(fetcher, env, network, asset, query, now);
    const body = route === 'overview' ? await ({bitcoin:bitcoinOverview, ethereum:(f,n) => ethereumOverview(f,env,n), bloch:blochOverview}[network])(fetcher, now)
      : route === 'block' ? await ({bitcoin:bitcoinBlock, ethereum:(f,q,n,o) => ethereumBlock(f,env,q,n,o), bloch:blochBlock}[network])(fetcher, network === 'bloch' ? query.replace(/^0x/, '').toLowerCase() : query, now, offset)
      : await ({bitcoin:bitcoinTx, ethereum:(f,q,n) => ethereumTx(f,env,`0x${q.replace(/^0x/, '')}`,n), bloch:blochTx}[network])(fetcher, query.replace(/^0x/, '').toLowerCase(), now);
    if (body?.error) return bad(body.error, body.error === 'source_not_found' ? 404 : 502);
    return reply(200, body);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'source_unavailable';
    return bad(reason === 'not_found' ? reason : 'source_unavailable', reason === 'not_found' ? 404 : 503);
  }
}
