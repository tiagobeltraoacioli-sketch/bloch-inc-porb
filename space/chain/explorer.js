// SPDX-License-Identifier: AGPL-3.0-or-later
// Read-only, bounded public-chain facts for Bloch Space.
import {queryChainWallet} from '../../graphus/chain/real-chain.js';
import {queryEthereumActivity} from '../../graphus/chain/ethereum-activity.js';

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

async function rpc(fetcher, endpoint, method, params) {
  const body = await json(fetcher, endpoint, {
    method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}),
  });
  if (body?.jsonrpc !== '2.0' || body.id !== 1 || body.error || body.result == null) throw new Error('rpc_unavailable');
  return body.result;
}

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
  const [mempool, fees] = await Promise.allSettled([
    json(fetcher, `${BTC}/mempool`), json(fetcher, `${BTC}/fee-estimates`),
  ]);
  return {
    ...source('bitcoin', 'Blockstream Esplora', now(), 'Best-chain and mempool values are source reported; confirmation is probabilistic.'),
    head: blocks[0], recent_blocks: blocks.slice(0, 10),
    mempool: mempool.status === 'fulfilled' ? mempool.value : null,
    fee_estimates_sat_vbyte: fees.status === 'fulfilled' ? fees.value : null,
  };
}

async function ethereumOverview(fetcher, env, now) {
  const endpoint = ethereumEndpoint(env);
  const chainId = await rpc(fetcher, endpoint, 'eth_chainId', []);
  if (quantity(chainId) !== 1n) throw new Error('ethereum_network_mismatch');
  const [head, finalized, gasPrice] = await Promise.all([
    rpc(fetcher, endpoint, 'eth_getBlockByNumber', ['latest', false]),
    rpc(fetcher, endpoint, 'eth_getBlockByNumber', ['finalized', false]),
    rpc(fetcher, endpoint, 'eth_gasPrice', []),
  ]);
  if (!isHex64(head?.hash) || !isHex64(finalized?.hash)) throw new Error('invalid_source_response');
  return {
    ...source('ethereum', 'configured Ethereum JSON-RPC', now(), 'Latest and finalized are distinct source-reported checkpoints.'),
    head, finalized, gas_price_wei: quantity(gasPrice).toString(),
  };
}

async function blochOverview(fetcher, now) {
  const [networkResult, healthResult, transactionsResult, holdersResult] = await Promise.allSettled([
    json(fetcher, `${BLOCH}/api/v1/network`),
    json(fetcher, `${BLOCH}/indexer/health`),
    json(fetcher, `${BLOCH}/indexer/transactions?limit=8`),
    json(fetcher, `${BLOCH}/indexer/holders?limit=64`),
  ]);
  const network = networkResult.status === 'fulfilled' && networkResult.value?.data?.head?.data ? networkResult.value : null;
  const health = healthResult.status === 'fulfilled' && healthResult.value?.ok ? healthResult.value : null;
  const transactions = transactionsResult.status === 'fulfilled' && Array.isArray(transactionsResult.value?.transactions) ? transactionsResult.value : null;
  const holders = holdersResult.status === 'fulfilled' && Array.isArray(holdersResult.value?.holders) ? holdersResult.value : null;
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
    health, recent_transactions: transactions?.transactions ?? [], holders,
  };
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
  const [transaction, outspends] = await Promise.all([
    json(fetcher, `${BTC}/tx/${query}`), json(fetcher, `${BTC}/tx/${query}/outspends`),
  ]);
  if (transaction?.txid !== query || !Array.isArray(transaction.vin) || !Array.isArray(transaction.vout) || !Array.isArray(outspends)) throw new Error('invalid_source_response');
  return {...source('bitcoin', 'Blockstream Esplora', now(), 'Inputs identify spent outpoints, not a single sender or owner. Sequence-based replacement is a signal, not a guarantee.'), transaction, outspends, facts:bitcoinTransactionFacts(transaction)};
}

export function bitcoinTransactionFacts(tx) {
  const coinbase = tx.vin?.some(input => input.is_coinbase === true) ?? false;
  const weight = Number(tx.weight);
  const fee = Number(tx.fee);
  const virtualSize = Number.isSafeInteger(weight) && weight > 0 ? Math.ceil(weight / 4) : null;
  return {
    coinbase,
    virtual_size_vb: virtualSize,
    fee_rate_sat_vb: !coinbase && virtualSize && Number.isSafeInteger(fee) && fee >= 0 ? (fee / virtualSize).toFixed(2) : null,
    signals_rbf: !coinbase && tx.vin?.some(input => Number.isSafeInteger(input.sequence) && input.sequence < 0xfffffffe) === true,
  };
}

export function ethereumReceiptFacts(receipt) {
  if (!receipt) return {gas_fee_wei:null, token_transfers:[], token_transfer_count:0};
  let gasFee = null;
  try {
    if (receipt.gasUsed != null && receipt.effectiveGasPrice != null) gasFee = (quantity(receipt.gasUsed) * quantity(receipt.effectiveGasPrice)).toString();
  } catch { /* Preserve the raw receipt without an invented fee. */ }
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
  return {gas_fee_wei:gasFee, token_transfers:transfers.slice(0,64), token_transfer_count:transfers.length};
}

async function ethereumBlock(fetcher, env, query, now, offset = 0) {
  const endpoint = ethereumEndpoint(env);
  const byHash = isHex64(query);
  const method = byHash ? 'eth_getBlockByHash' : 'eth_getBlockByNumber';
  const tag = byHash ? `0x${query.replace(/^0x/, '')}` : `0x${BigInt(query).toString(16)}`;
  let block;
  try { block = await rpc(fetcher, endpoint, method, [tag, false]); }
  catch (error) { if (error.message === 'rpc_unavailable') throw new Error('not_found'); throw error; }
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
  let transaction;
  try { transaction = await rpc(fetcher, endpoint, 'eth_getTransactionByHash', [query]); }
  catch (error) { if (error.message === 'rpc_unavailable') throw new Error('not_found'); throw error; }
  const [receipt, finalized] = await Promise.all([
    rpc(fetcher, endpoint, 'eth_getTransactionReceipt', [query]).catch(() => null),
    rpc(fetcher, endpoint, 'eth_getBlockByNumber', ['finalized', false]),
  ]);
  if (transaction?.hash?.toLowerCase() !== query.toLowerCase()) throw new Error('invalid_source_response');
  return {
    ...source('ethereum', 'configured Ethereum JSON-RPC', now(), 'Receipt status is execution success; finality is a separate checkpoint.'),
    transaction, receipt, finalized_height: safeNumber(quantity(finalized.number)), ...ethereumReceiptFacts(receipt),
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
  const asset = (url.searchParams.get('asset') || {bitcoin:'BTC', ethereum:'ETH', bloch:'BLCH'}[network]).toUpperCase();
  if ([...url.searchParams.keys()].some(key => !['network', 'query', 'asset', 'offset'].includes(key)) || [...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length > 1)) return bad('invalid_parameters');
  if (offsetRaw != null && (route !== 'block' || !/^(0|[1-9][0-9]{0,5})$/.test(offsetRaw) || !Number.isSafeInteger(offset))) return bad('invalid_offset');
  if (route !== 'address' && url.searchParams.has('asset')) return bad('invalid_parameters');
  if (route === 'overview' && query) return bad('invalid_parameters');
  if (route !== 'overview' && (!query || query.length > 100)) return bad('invalid_query');
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
