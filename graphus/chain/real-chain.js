const BITCOIN_API = 'https://blockstream.info/api';
const TOKEN_CONTRACTS = Object.freeze({
  USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
});
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_TRANSACTIONS = 8;
const MAX_TRANSACTION_ENDPOINTS = 24;

function failure(code, status = 502) {
  return {status, body: {error: code}};
}

function safeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function decimalBaseUnits(value) {
  if (!safeInteger(value)) throw new Error('invalid_source_amount');
  return BigInt(value).toString();
}

function hexQuantity(value) {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) {
    throw new Error('invalid_rpc_quantity');
  }
  return BigInt(value);
}

function safeNumber(value) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('invalid_rpc_quantity');
  return Number(value);
}

function ethAddress(address) {
  return typeof address === 'string' && /^0x[0-9a-fA-F]{40}$/.test(address);
}

function btcAddress(address) {
  if (typeof address !== 'string' || address.length > 90) return false;
  if (/^(?:bc1)[ac-hj-np-z02-9]{11,87}$/i.test(address)) {
    return address === address.toLowerCase() || address === address.toUpperCase();
  }
  return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address);
}

async function readJson(response) {
  if (!response.ok) throw new Error(response.status === 404 ? 'source_not_found' : 'source_unavailable');
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new Error('source_response_too_large');
  let body;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    body = '';
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) throw new Error('source_response_too_large');
        body += decoder.decode(value, {stream: true});
      }
      body += decoder.decode();
    } finally { reader.releaseLock(); }
  } else {
    body = await response.text();
    if (body.length > MAX_RESPONSE_BYTES) throw new Error('source_response_too_large');
  }
  try { return JSON.parse(body); }
  catch { throw new Error('invalid_source_response'); }
}

async function fetchJson(fetcher, url, init = {}) {
  const response = await fetcher(url, {signal: AbortSignal.timeout(9000), ...init});
  return readJson(response);
}

function transactionEvidence(address, transactions) {
  const nodes = new Map();
  const edges = [];
  const addressNode = value => {
    const id = `bitcoin:address:${value}`;
    if (!nodes.has(id)) nodes.set(id, {id, kind: 'address', address: value});
    return id;
  };
  addressNode(address);
  for (const tx of transactions.slice(0, MAX_TRANSACTIONS)) {
    if (!/^[0-9a-f]{64}$/i.test(tx?.txid || '') || tx?.status?.confirmed !== true) continue;
    const txid = tx.txid.toLowerCase();
    const txNode = `bitcoin:tx:${txid}`;
    const block = {
      height: safeInteger(tx.status.block_height) ? tx.status.block_height : null,
      hash: /^[0-9a-f]{64}$/i.test(tx.status.block_hash || '') ? tx.status.block_hash.toLowerCase() : null,
      time: safeInteger(tx.status.block_time) ? new Date(tx.status.block_time * 1000).toISOString() : null,
    };
    nodes.set(txNode, {id: txNode, kind: 'transaction', txid, block});
    for (const [index, input] of (Array.isArray(tx.vin) ? tx.vin : []).slice(0, MAX_TRANSACTION_ENDPOINTS).entries()) {
      const prevout = input?.prevout;
      if (!btcAddress(prevout?.scriptpubkey_address) || !safeInteger(prevout?.value)) continue;
      edges.push({
        from: addressNode(prevout.scriptpubkey_address), to: txNode,
        kind: 'observed_input_prevout', amount_base_units: decimalBaseUnits(prevout.value),
        txid, position: index, block,
      });
    }
    for (const [index, output] of (Array.isArray(tx.vout) ? tx.vout : []).slice(0, MAX_TRANSACTION_ENDPOINTS).entries()) {
      if (!btcAddress(output?.scriptpubkey_address) || !safeInteger(output?.value)) continue;
      edges.push({
        from: txNode, to: addressNode(output.scriptpubkey_address),
        kind: 'created_output', amount_base_units: decimalBaseUnits(output.value),
        txid, position: index, block,
      });
    }
  }
  return {nodes: [...nodes.values()], edges};
}

async function bitcoinWallet(address, fetcher, now) {
  const endpoint = `${BITCOIN_API}/address/${encodeURIComponent(address)}`;
  const summary = await fetchJson(fetcher, endpoint);
  if (summary?.address !== address) throw new Error('source_address_mismatch');
  const chain = summary.chain_stats;
  const mempool = summary.mempool_stats;
  if (!chain || !mempool || !safeInteger(chain.funded_txo_sum) || !safeInteger(chain.spent_txo_sum)
      || !safeInteger(chain.tx_count) || !safeInteger(mempool.tx_count)) throw new Error('invalid_source_response');
  const balance = BigInt(chain.funded_txo_sum) - BigInt(chain.spent_txo_sum);
  if (balance < 0n) throw new Error('invalid_source_amount');
  let evidence = {nodes: [{id: `bitcoin:address:${address}`, kind: 'address', address}], edges: []};
  let transactionCoverage = 'unavailable';
  try {
    const txs = await fetchJson(fetcher, `${endpoint}/txs/chain`);
    if (!Array.isArray(txs)) throw new Error('invalid_source_response');
    evidence = transactionEvidence(address, txs);
    transactionCoverage = `first_page_up_to_${MAX_TRANSACTIONS}_confirmed_transactions`;
  } catch {
    // Balance remains available if the optional transaction page fails.
  }
  return {
    status: 'source-reported', independent_verification: false,
    network: 'bitcoin-mainnet', asset: 'BTC', address,
    balance: {base_units: balance.toString(), unit: 'sat', scope: 'source_confirmed_address_aggregate', block: null},
    activity: {confirmed_tx_count: chain.tx_count, mempool_tx_count: mempool.tx_count},
    observation: {
      source_id: 'blockstream-esplora', source_url: endpoint,
      retrieved_at: now().toISOString(), coverage: transactionCoverage,
      limitations: [
        'Balance is the source-reported confirmed aggregate for one address, not a multi-address wallet or owner.',
        'The balance is not independently reconciled to a locally validated UTXO set or pinned to one block.',
        'The displayed transaction page is incomplete history; inputs and outputs do not establish sender ownership.',
        'Querying this public API discloses the searched address to its operator.',
      ],
    },
    ...evidence,
  };
}

async function rpc(fetcher, endpoint, method, params, id) {
  const response = await fetchJson(fetcher, endpoint, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id, method, params}),
  });
  if (response?.jsonrpc !== '2.0' || response.id !== id || response.error || response.result == null) {
    throw new Error('invalid_rpc_response');
  }
  return response.result;
}

async function ethereumWallet(address, asset, env, fetcher, now) {
  const endpoint = env.GRAPHUS_ETHEREUM_RPC_URL;
  let rpcUrl;
  try { rpcUrl = new URL(endpoint); }
  catch { throw new Error('ethereum_rpc_not_configured'); }
  if (rpcUrl.protocol !== 'https:' || rpcUrl.username || rpcUrl.password) {
    throw new Error('ethereum_rpc_not_configured');
  }
  const chainId = await rpc(fetcher, rpcUrl.href, 'eth_chainId', [], 1);
  if (hexQuantity(chainId) !== 1n) throw new Error('ethereum_network_mismatch');
  const block = await rpc(fetcher, rpcUrl.href, 'eth_getBlockByNumber', ['finalized', false], 2);
  if (!block || !/^[0-9a-f]{64}$/i.test((block.hash || '').replace(/^0x/, ''))) {
    throw new Error('invalid_rpc_response');
  }
  const height = safeNumber(hexQuantity(block.number));
  const time = new Date(safeNumber(hexQuantity(block.timestamp)) * 1000).toISOString();
  if (time === 'Invalid Date') throw new Error('invalid_rpc_response');
  const blockRef = {height, hash: block.hash.toLowerCase(), time};
  const tag = block.number;
  let amount;
  if (asset === 'ETH') {
    amount = hexQuantity(await rpc(fetcher, rpcUrl.href, 'eth_getBalance', [address, tag], 3));
  } else {
    const data = `0x70a08231${address.slice(2).toLowerCase().padStart(64, '0')}`;
    const result = await rpc(fetcher, rpcUrl.href, 'eth_call', [{to: TOKEN_CONTRACTS[asset], data}, tag], 3);
    if (typeof result !== 'string' || !/^0x[0-9a-f]{64}$/i.test(result)) throw new Error('invalid_rpc_response');
    amount = BigInt(result);
  }
  return {
    status: 'source-reported', independent_verification: false,
    network: 'ethereum-mainnet', asset, address,
    balance: {
      base_units: amount.toString(), unit: asset === 'ETH' ? 'wei' : 'token-base-unit',
      scope: 'source_reported_finalized_block', block: blockRef,
      ...(asset !== 'ETH' ? {contract: TOKEN_CONTRACTS[asset], decimals: 6} : {}),
    },
    activity: null,
    observation: {
      source_id: 'configured-ethereum-json-rpc', source_url: null,
      retrieved_at: now().toISOString(), coverage: 'single_address_balance_at_source_reported_finalized_block',
      limitations: [
        'The RPC source reports chain ID, finality, block and balance; Graphus has not independently reconciled them.',
        'One Ethereum address is not evidence of a natural person or all addresses in a wallet.',
        'No transactions or flow edges are returned because a balance query is not a transaction index.',
        'Querying the configured RPC discloses the searched address to its operator.',
      ],
    },
    nodes: [{id: `ethereum:address:${address.toLowerCase()}`, kind: 'address', address}], edges: [],
  };
}

export async function queryChainWallet({network, asset, address, env = {}, fetcher = fetch, now = () => new Date()}) {
  const chain = String(network || '').toLowerCase();
  const token = String(asset || (chain.startsWith('bitcoin') || chain === 'btc' ? 'BTC' : 'ETH')).toUpperCase();
  if (chain === 'bloch' || chain === 'bloch-mainnet' || token === 'BLCH') {
    return failure('real_bloch_wallet_state_unavailable', 501);
  }
  try {
    if (chain === 'bitcoin' || chain === 'bitcoin-mainnet' || chain === 'btc') {
      if (token !== 'BTC' || !btcAddress(address)) return failure('invalid_address_or_asset', 400);
      return {status: 200, body: await bitcoinWallet(address, fetcher, now)};
    }
    if (chain === 'ethereum' || chain === 'ethereum-mainnet' || chain === 'eth') {
      if (!['ETH', 'USDT', 'USDC'].includes(token) || !ethAddress(address)) return failure('invalid_address_or_asset', 400);
      return {status: 200, body: await ethereumWallet(address, token, env, fetcher, now)};
    }
    return failure('unsupported_network', 400);
  } catch (error) {
    if (error.message === 'ethereum_rpc_not_configured') return failure(error.message, 503);
    if (error.message === 'source_not_found') return failure(error.message, 404);
    if (error.message === 'ethereum_network_mismatch') return failure(error.message, 502);
    return failure('chain_source_unavailable', 502);
  }
}
