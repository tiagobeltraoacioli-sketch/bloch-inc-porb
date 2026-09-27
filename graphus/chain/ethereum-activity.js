// A bounded source-reported Ethereum observation, not a transaction index.
const CONTRACTS = Object.freeze({
  USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
});
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const WINDOW_BLOCKS = 64;
const MAX_LOGS_PER_DIRECTION = 128;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const QUANTITY = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;

function fail(code, status = 502) { return {status, body: {error: code}}; }
function quantity(value) {
  if (typeof value !== 'string' || !QUANTITY.test(value)) throw new Error('invalid_rpc_response');
  return BigInt(value);
}
function boundedNumber(value) {
  const parsed = quantity(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('invalid_rpc_response');
  return Number(parsed);
}
function rpcEndpoint(env) {
  let url;
  try { url = new URL(env.GRAPHUS_ETHEREUM_RPC_URL); }
  catch { throw new Error('ethereum_rpc_not_configured'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('ethereum_rpc_not_configured');
  }
  return url.href;
}
async function rpc(fetcher, endpoint, method, params, id) {
  const response = await fetcher(endpoint, {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id, method, params}),
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error('chain_source_unavailable');
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) throw new Error('source_response_too_large');
  let text = '';
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) throw new Error('source_response_too_large');
        text += decoder.decode(value, {stream: true});
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
  } else {
    text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) throw new Error('source_response_too_large');
  }
  let payload;
  try { payload = JSON.parse(text); }
  catch { throw new Error('invalid_rpc_response'); }
  if (payload?.jsonrpc !== '2.0' || payload.id !== id || payload.error || payload.result == null) {
    throw new Error('invalid_rpc_response');
  }
  return payload.result;
}
function topicAddress(topic) {
  if (typeof topic !== 'string' || !HEX32.test(topic) || topic.slice(2, 26) !== '0'.repeat(24)) {
    throw new Error('invalid_rpc_log');
  }
  return `0x${topic.slice(-40).toLowerCase()}`;
}
function normalizeLog(log, {contract, address, first, last, finalizedHash}) {
  if (!log || typeof log !== 'object' || log.removed === true ||
      typeof log.address !== 'string' || log.address.toLowerCase() !== contract ||
      !Array.isArray(log.topics) || log.topics.length !== 3 ||
      typeof log.topics[0] !== 'string' || log.topics[0].toLowerCase() !== TRANSFER ||
      typeof log.data !== 'string' || !HEX32.test(log.data) ||
      typeof log.blockHash !== 'string' || !HEX32.test(log.blockHash) ||
      typeof log.transactionHash !== 'string' || !HEX32.test(log.transactionHash)) {
    throw new Error('invalid_rpc_log');
  }
  const from = topicAddress(log.topics[1]);
  const to = topicAddress(log.topics[2]);
  if (from !== address && to !== address) throw new Error('invalid_rpc_log');
  const blockNumber = boundedNumber(log.blockNumber);
  const transactionIndex = boundedNumber(log.transactionIndex);
  const logIndex = boundedNumber(log.logIndex);
  if (blockNumber < first || blockNumber > last) throw new Error('invalid_rpc_log');
  if (blockNumber === last && log.blockHash.toLowerCase() !== finalizedHash) throw new Error('invalid_rpc_log');
  return {
    event_id: `${log.transactionHash.toLowerCase()}:${logIndex}`,
    block_number: blockNumber, block_hash: log.blockHash.toLowerCase(),
    transaction_hash: log.transactionHash.toLowerCase(), transaction_index: transactionIndex,
    log_index: logIndex, from, to,
    direction: from === address && to === address ? 'self' : from === address ? 'outgoing' : 'incoming',
    amount_base_units: BigInt(log.data).toString(),
  };
}

export async function queryEthereumActivity({address, asset, toBlock = null, expectedHash = null, env = {}, fetcher = fetch, now = () => new Date(), checkpoint}) {
  const token = String(asset || '').toUpperCase();
  if (!ADDRESS.test(address || '') || !['ETH', 'USDT', 'USDC'].includes(token)) {
    return fail('invalid_address_or_asset', 400);
  }
  if (token === 'ETH') return fail('native_eth_activity_requires_transaction_index', 501);
  if (toBlock !== null && (typeof toBlock !== 'string' || !/^(0|[1-9][0-9]*)$/.test(toBlock)
      || !Number.isSafeInteger(Number(toBlock)))) return fail('invalid_to_block', 400);
  if (expectedHash !== null && (toBlock === null || typeof expectedHash !== 'string'
      || !HEX32.test(expectedHash))) return fail('invalid_expected_hash', 400);
  try {
    const endpoint = rpcEndpoint(env);
    const shared = checkpoint ? await checkpoint() : null;
    const chainId = checkpoint ? shared.chainId : await rpc(fetcher, endpoint, 'eth_chainId', [], 1);
    if (quantity(chainId) !== 1n) return fail('ethereum_network_mismatch');
    const block = checkpoint ? shared.block : await rpc(fetcher, endpoint, 'eth_getBlockByNumber', ['finalized', false], 2);
    if (!block || typeof block.hash !== 'string' || !HEX32.test(block.hash)) {
      throw new Error('invalid_rpc_response');
    }
    const finalizedHeight = boundedNumber(block.number);
    const last = toBlock === null ? finalizedHeight : Number(toBlock);
    if (last > finalizedHeight) return fail('to_block_not_finalized', 400);
    const windowEnd = last === finalizedHeight ? block
      : await rpc(fetcher, endpoint, 'eth_getBlockByNumber', [`0x${last.toString(16)}`, false], 5);
    if (!windowEnd || boundedNumber(windowEnd.number) !== last
        || typeof windowEnd.hash !== 'string' || !HEX32.test(windowEnd.hash)) throw new Error('invalid_rpc_response');
    if (expectedHash !== null && windowEnd.hash.toLowerCase() !== expectedHash.toLowerCase())
      return fail('window_anchor_mismatch', 409);
    const finalizedTime = new Date(boundedNumber(block.timestamp) * 1000);
    if (!Number.isFinite(finalizedTime.getTime())) throw new Error('invalid_rpc_response');
    const timestamp = boundedNumber(windowEnd.timestamp);
    const blockTime = new Date(timestamp * 1000);
    if (!Number.isFinite(blockTime.getTime())) throw new Error('invalid_rpc_response');
    const first = Math.max(0, last - WINDOW_BLOCKS + 1);
    const normalizedAddress = address.toLowerCase();
    const contract = CONTRACTS[token];
    const topic = `0x${'0'.repeat(24)}${normalizedAddress.slice(2)}`;
    const base = {address: contract, fromBlock: `0x${first.toString(16)}`, toBlock: `0x${last.toString(16)}`};
    const inbound = await rpc(fetcher, endpoint, 'eth_getLogs', [{...base, topics: [TRANSFER, null, topic]}], 3);
    const outbound = await rpc(fetcher, endpoint, 'eth_getLogs', [{...base, topics: [TRANSFER, topic]}], 4);
    if (!Array.isArray(inbound) || !Array.isArray(outbound)) throw new Error('invalid_rpc_response');
    if (inbound.length > MAX_LOGS_PER_DIRECTION || outbound.length > MAX_LOGS_PER_DIRECTION) {
      return fail('ethereum_activity_window_too_dense', 413);
    }
    const events = new Map();
    const blockHashes = new Map();
    const transactionAnchors = new Map();
    const logPositions = new Map();
    for (const [logs, direction] of [[inbound, 'incoming'], [outbound, 'outgoing']]) {
      for (const log of logs) {
        const event = normalizeLog(log, {contract, address: normalizedAddress, first, last, finalizedHash: windowEnd.hash.toLowerCase()});
        if (event.direction !== direction && event.direction !== 'self') throw new Error('invalid_rpc_log');
        const knownBlockHash = blockHashes.get(event.block_number);
        if (knownBlockHash && knownBlockHash !== event.block_hash) throw new Error('inconsistent_rpc_log_block');
        blockHashes.set(event.block_number, event.block_hash);
        const transactionAnchor = `${event.block_number}:${event.block_hash}:${event.transaction_index}`;
        const knownTransactionAnchor = transactionAnchors.get(event.transaction_hash);
        if (knownTransactionAnchor && knownTransactionAnchor !== transactionAnchor)
          throw new Error('inconsistent_rpc_log_transaction');
        transactionAnchors.set(event.transaction_hash, transactionAnchor);
        const position = `${event.block_hash}:${event.log_index}`;
        const knownEvent = logPositions.get(position);
        if (knownEvent && knownEvent !== event.event_id) throw new Error('inconsistent_rpc_log_position');
        logPositions.set(position, event.event_id);
        const previous = events.get(event.event_id);
        if (previous && JSON.stringify(previous) !== JSON.stringify(event)) throw new Error('invalid_rpc_log');
        events.set(event.event_id, event);
      }
    }
    const ordered = [...events.values()].sort((a, b) => a.block_number - b.block_number || a.transaction_index - b.transaction_index || a.log_index - b.log_index);
    const nodes = new Map([[normalizedAddress, {id: `ethereum:address:${normalizedAddress}`, kind: 'address', address: normalizedAddress}]]);
    for (const event of ordered) {
      for (const value of [event.from, event.to]) {
        if (!nodes.has(value)) nodes.set(value, {id: `ethereum:address:${value}`, kind: 'address', address: value});
      }
    }
    return {status: 200, body: {
      status: 'source-reported', independent_verification: false,
      network: 'ethereum-mainnet', asset: token, address: normalizedAddress,
      contract, decimals: 6, activity: {event_count: ordered.length, events: ordered},
      nodes: [...nodes.values()],
      edges: ordered.map(event => ({
        from: `ethereum:address:${event.from}`, to: `ethereum:address:${event.to}`,
        kind: 'erc20_transfer_log', event_id: event.event_id, amount_base_units: event.amount_base_units,
        block_number: event.block_number, block_hash: event.block_hash,
        transaction_hash: event.transaction_hash, transaction_index: event.transaction_index, log_index: event.log_index,
      })),
      observation: {
        source_id: 'configured-ethereum-json-rpc', retrieved_at: now().toISOString(),
        finalized_head: {height: finalizedHeight, hash: block.hash.toLowerCase(), time: finalizedTime.toISOString()},
        window_end_anchor: {height: last, hash: windowEnd.hash.toLowerCase(), time: blockTime.toISOString()},
        block_window: {from: first, to: last, width: last - first + 1},
        source_response_consistency: {
          block_heights: blockHashes.size, transaction_hashes: transactionAnchors.size,
          log_positions: logPositions.size,
          duplicate_direction_hits: inbound.length + outbound.length - ordered.length,
        },
        coverage: 'erc20_transfer_logs_in_64_or_fewer_source_reported_finalized_blocks',
        limitations: [
          'Only Transfer logs from the fixed token contract and bounded block window are included; this is not complete address history.',
          'The RPC source reports finality and logs; Graphus has not independently verified or reconciled them.',
          'A log links addresses only. It does not establish ownership, identity, intent, or AML risk.',
          'Contract behavior outside emitted Transfer logs is not represented. Balance must be queried separately at a named block.',
          'Querying the configured RPC discloses the searched address to its operator.',
        ],
      },
    }};
  } catch (error) {
    if (error.message === 'ethereum_rpc_not_configured') return fail(error.message, 503);
    console.error('ethereum_activity_source_failure', error.name, error.message);
    return fail('chain_source_unavailable');
  }
}

export async function queryEthereumReceipt({hash, expectedBlock, expectedHash, expectedIndex,
  env = {}, fetcher = fetch, now = () => new Date()}) {
  if (typeof hash !== 'string' || !HEX32.test(hash)
      || typeof expectedBlock !== 'string' || !/^(0|[1-9][0-9]*)$/.test(expectedBlock)
      || !Number.isSafeInteger(Number(expectedBlock))
      || typeof expectedHash !== 'string' || !HEX32.test(expectedHash)
      || typeof expectedIndex !== 'string' || !/^(0|[1-9][0-9]*)$/.test(expectedIndex)
      || !Number.isSafeInteger(Number(expectedIndex))) return fail('invalid_transaction_reference', 400);
  try {
    const endpoint = rpcEndpoint(env);
    if (quantity(await rpc(fetcher, endpoint, 'eth_chainId', [], 1)) !== 1n)
      return fail('ethereum_network_mismatch');
    const finalized = await rpc(fetcher, endpoint, 'eth_getBlockByNumber', ['finalized', false], 2);
    if (!finalized || typeof finalized.hash !== 'string' || !HEX32.test(finalized.hash))
      throw new Error('invalid_rpc_response');
    const finalizedHeight = boundedNumber(finalized.number);
    const normalizedHash = hash.toLowerCase();
    const transaction = await rpc(fetcher, endpoint, 'eth_getTransactionByHash', [normalizedHash], 3);
    const receipt = await rpc(fetcher, endpoint, 'eth_getTransactionReceipt', [normalizedHash], 4);
    const sameHash = value => typeof value === 'string' && HEX32.test(value)
      && value.toLowerCase() === normalizedHash;
    const sameAddress = (left, right) => left === null && right === null
      || typeof left === 'string' && typeof right === 'string'
        && ADDRESS.test(left) && ADDRESS.test(right) && left.toLowerCase() === right.toLowerCase();
    if (!sameHash(transaction?.hash) || !sameHash(receipt?.transactionHash)
        || typeof transaction.blockHash !== 'string' || !HEX32.test(transaction.blockHash)
        || typeof receipt.blockHash !== 'string' || !HEX32.test(receipt.blockHash)
        || transaction.blockHash.toLowerCase() !== receipt.blockHash.toLowerCase()
        || !sameAddress(transaction.from, receipt.from)
        || !sameAddress(transaction.to, receipt.to)
        || typeof transaction.from !== 'string' || !ADDRESS.test(transaction.from))
      throw new Error('inconsistent_rpc_receipt');
    const height = boundedNumber(transaction.blockNumber);
    const index = boundedNumber(transaction.transactionIndex);
    if (height !== boundedNumber(receipt.blockNumber)
        || index !== boundedNumber(receipt.transactionIndex)
        || height > finalizedHeight) throw new Error('inconsistent_rpc_receipt');
    if (height !== Number(expectedBlock) || index !== Number(expectedIndex)
        || transaction.blockHash.toLowerCase() !== expectedHash.toLowerCase())
      return fail('transaction_anchor_mismatch', 409);
    const block = await rpc(fetcher, endpoint, 'eth_getBlockByNumber', [`0x${height.toString(16)}`, false], 5);
    if (!block || boundedNumber(block.number) !== height
        || typeof block.hash !== 'string' || !HEX32.test(block.hash)
        || block.hash.toLowerCase() !== transaction.blockHash.toLowerCase())
      throw new Error('inconsistent_rpc_receipt');
    const status = boundedNumber(receipt.status);
    if (status !== 0 && status !== 1) throw new Error('invalid_rpc_receipt');
    const gasUsed = quantity(receipt.gasUsed);
    const gasPrice = quantity(receipt.effectiveGasPrice);
    const gasLimit = quantity(transaction.gas);
    const value = quantity(transaction.value);
    if (gasUsed > gasLimit) throw new Error('invalid_rpc_receipt');
    const blockTime = new Date(boundedNumber(block.timestamp) * 1000);
    if (!Number.isFinite(blockTime.getTime())) throw new Error('invalid_rpc_receipt');
    return {status: 200, body: {
      status: 'source-reported', network: 'ethereum-mainnet', transaction_hash: normalizedHash,
      block: {height, hash: block.hash.toLowerCase(), time: blockTime.toISOString()},
      transaction_index: index, execution_status: status === 1 ? 'success' : 'reverted',
      transaction_from: transaction.from.toLowerCase(),
      transaction_to: transaction.to === null ? null : transaction.to.toLowerCase(),
      value_wei: value.toString(), gas_limit: gasLimit.toString(),
      gas_used: gasUsed.toString(), effective_gas_price_wei: gasPrice.toString(),
      execution_gas_fee_wei: (gasUsed * gasPrice).toString(),
      observation: {source_id: 'configured-ethereum-json-rpc', retrieved_at: now().toISOString(),
        source_finalized_head: {height: finalizedHeight, hash: finalized.hash.toLowerCase()},
        coverage: 'one source-reported finalized transaction and receipt',
        limitations: [
          'The source receipt is checked against the selected log reference and source-reported canonical block; Graphus does not independently verify chain history.',
          'The transaction sender is not necessarily the owner of the queried token address or any log participant.',
          'Execution gas fee is gas used multiplied by effective gas price; blob fees and other transaction costs are excluded.',
        ]},
    }};
  } catch (error) {
    if (error.message === 'ethereum_rpc_not_configured') return fail(error.message, 503);
    console.error('ethereum_receipt_source_failure', error.name, error.message);
    return fail('chain_source_unavailable');
  }
}
