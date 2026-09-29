// Public chain observations only. This module never reads portal sessions or AML data.
const NETWORKS = Object.freeze({bitcoin: 'BTC', ethereum: 'ETH', bloch: 'BLCH'});
const PORTALS = new Set(['graphus', 'space', 'explorer', 'rednblue']);
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_NODES = 40, MAX_EDGES = 80, MAX_TRANSACTIONS = 20;
const MAX_TRANSACTION_SIDE = 24, MAX_TRANSACTION_REFERENCES = 80;
const transactionMetadata = new WeakMap();
const HASH = /^[a-f0-9]{64}$/i;
const ETH_ADDRESS = /^0x[a-f0-9]{40}$/i;
const AMOUNT = /^(0|[1-9][0-9]{0,77})$/;
const integer = value => Number.isSafeInteger(value) && value >= 0;
const decimal = value => typeof value === 'string' && AMOUNT.test(value);
const validHash = value => typeof value === 'string' && HASH.test(value.replace(/^0x/, ''));
const hash = (value, network) => `${network === 'ethereum' ? '0x' : ''}${value.replace(/^0x/, '').toLowerCase()}`;
const fixedCoverage = 'Bounded source-reported public observations, not complete history or independent verification. References do not establish identity, ownership, or continuity of value. Input and output records are separate, not additive transfer volume.';

function address(value, network) {
  if (typeof value !== 'string') return false;
  if (network === 'ethereum') return ETH_ADDRESS.test(value);
  if (network === 'bloch') return HASH.test(value);
  if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(value)) return true;
  return /^bc1[ac-hj-np-z02-9]{11,87}$/i.test(value) && (value === value.toLowerCase() || value === value.toUpperCase());
}

export function validateChainQuery({portal, network, subject} = {}) {
  if (!PORTALS.has(portal) || !Object.hasOwn(NETWORKS, network) || portal === 'explorer' && network !== 'bloch') {
    throw new TypeError('invalid_chain_query');
  }
  if (subject !== undefined && subject !== null) {
    if (typeof subject !== 'object' || Array.isArray(subject) || Object.keys(subject).some(key => !['kind', 'value'].includes(key)) ||
      !['address', 'transaction'].includes(subject.kind) || typeof subject.value !== 'string' || subject.value.length > 90 ||
      !(subject.kind === 'address' ? address(subject.value, network) : validHash(subject.value))) throw new TypeError('invalid_chain_query');
  }
  return {portal, network, ...(subject ? {subject: {kind: subject.kind, value: subject.kind === 'transaction' ? hash(subject.value, network) : network === 'bitcoin' ? subject.value : subject.value.toLowerCase()}} : {})};
}

function iso(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function epoch(value, multiplier = 1000) {
  if (!integer(value) || value > 8640000000000000 / multiplier) return null;
  return new Date(value * multiplier).toISOString();
}
function quantity(value) {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][a-f0-9]{0,63})$/i.test(value)) return null;
  return BigInt(value).toString();
}
function quantityNumber(value) {
  const normalized = quantity(value);
  return normalized !== null && BigInt(normalized) <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(normalized) : null;
}
function clock(now) {
  const value = now();
  const result = value instanceof Date ? value.toISOString() : iso(value);
  if (!result) throw new TypeError('invalid_clock');
  return result;
}
function context() {
  return {sources: [], facts: [], transactions: [], graph: {nodes: [], edges: []}, status: 'unavailable', coverage: fixedCoverage, observed_at: null};
}
function fact(result, label, value, unit) {
  if (result.facts.length >= 48 || !(integer(value) || decimal(value) || typeof value === 'boolean')) return;
  result.facts.push({label, value: String(value), ...(unit ? {unit} : {})});
}
function rateFact(result,label,value,unit){
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e9||result.facts.length>=48)return;
  result.facts.push({label,value:String(value),unit});
}
function emptySource(id, title, url, retrievedAt, coverage) {
  return {id, title, url, retrieved_at: retrievedAt, observed_at: null, status: 'unavailable', coverage};
}

async function read(fetcher, url) {
  const response = await fetcher(url, {method: 'GET', redirect: 'manual', credentials: 'omit',
    headers: {Accept: 'application/json', 'User-Agent': 'BlochAI-Public-Context/1.0'}, signal: AbortSignal.timeout(12000)});
  if (!response.ok || response.status >= 300 || !response.headers.get('content-type')?.toLowerCase().includes('application/json') ||
      Number(response.headers.get('content-length')) > MAX_BYTES || response.url && response.url !== url) throw new Error('source_unavailable');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('source_unavailable');
  let bytes = 0, body = ''; const decoder = new TextDecoder();
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new Error('source_unavailable');
      body += decoder.decode(value, {stream: true});
    }
    body += decoder.decode();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const data = JSON.parse(body);
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.error) throw new Error('source_unavailable');
  return data;
}

function addNode(result, network, kind, value) {
  if (!(kind === 'transaction' ? validHash(value) : address(value, network))) return null;
  const normalized = kind === 'transaction' ? hash(value, network) : network === 'bitcoin' ? value : value.toLowerCase();
  const id = `${network}:${kind}:${normalized}`;
  if (result.graph.nodes.some(node => node.id === id)) return id;
  if (result.graph.nodes.length >= MAX_NODES) return null;
  result.graph.nodes.push({id, label: normalized, kind});
  return id;
}
function addEdge(result, source, target, amount, unit) {
  if (!source || !target || result.graph.edges.length >= MAX_EDGES) return;
  result.graph.edges.push({source, target, ...(decimal(amount) ? {label: `${amount} ${unit}`} : {})});
}
function addTransaction(result, network, row) {
  if (!validHash(row.hash)) return null;
  const txid = hash(row.hash, network);
  // A full transaction list must still accept evidence for an existing hash.
  let normalized = result.transactions.find(item => item.hash === txid);
  if (!normalized) {
    if (result.transactions.length >= MAX_TRANSACTIONS) return null;
    normalized = {hash: txid, asset: NETWORKS[network], status: 'source-reported', record_type: network === 'ethereum' ? 'account' : 'utxo'};
    if (normalized.record_type === 'utxo') Object.assign(normalized, {inputs: [], outputs: []});
    result.transactions.push(normalized);
    transactionMetadata.set(normalized, {conflicts: new Set(), inputs: new Map(), outputs: new Map(), seenInputs: new Set(), seenOutputs: new Set(), graph: false, omitted: false});
  }
  const metadata = transactionMetadata.get(normalized);
  const merge = (key, value) => {
    if (value === undefined || metadata.conflicts.has(key)) return;
    if (normalized[key] === undefined || key === 'status' && normalized.status === 'source-reported') normalized[key] = value;
    else if (normalized[key] !== value) {
      if (['block_height', 'block_hash', 'slot', 'timestamp'].includes(key)) {
        // Conflicting anchors cannot support a selectively retained block/time.
        for (const field of ['block_height', 'block_hash', 'slot', 'timestamp']) {delete normalized[field]; metadata.conflicts.add(field);}
        normalized.status = 'source-reported'; metadata.conflicts.add('status');
      } else {delete normalized[key]; metadata.conflicts.add(key);}
      if (key === 'status') normalized.status = 'source-reported';
    }
  };
  if (['successful', 'failed', 'confirmed', 'pending'].includes(row.status)) merge('status', row.status);
  if (network === 'ethereum') {
    for (const key of ['from', 'to']) if (address(row[key], network)) merge(key, row[key].toLowerCase());
    if (decimal(row.amount)) merge('amount', row.amount);
  }
  if (iso(row.timestamp)) merge('timestamp', iso(row.timestamp));
  for (const key of ['block_height', 'slot']) if (integer(row[key]) || decimal(row[key])) merge(key, String(row[key]));
  if (validHash(row.block_hash)) merge('block_hash', hash(row.block_hash, network));
  return normalized;
}

function addTransactionReference(result, transaction, network, side, row, position) {
  if (!transaction || transaction.record_type !== 'utxo') return;
  const metadata = transactionMetadata.get(transaction), fields = {};
  const outpoint = row.outpoint;
  if (validHash(outpoint?.txid) && integer(outpoint?.vout) && (side === 'inputs' || hash(outpoint.txid, network) === transaction.hash)) {
    fields.reference = `${hash(outpoint.txid, network)}:${outpoint.vout}`;
  } else if (outpoint !== undefined) metadata.omitted = true;
  if (address(row.address, network)) fields.address = network === 'bitcoin' ? row.address : row.address.toLowerCase();
  if (decimal(row.amount)) fields.amount = row.amount;
  const key = fields.reference || `position:${position}`;
  const seen = side === 'inputs' ? metadata.seenInputs : metadata.seenOutputs;
  seen.add(key);
  if (!Object.keys(fields).length) {metadata.omitted = true; return;}
  const existing = metadata[side].get(key);
  if (existing) {
    for (const [field, value] of Object.entries(fields)) {
      if (existing.conflicts.has(field)) continue;
      if (existing.row[field] === undefined) existing.row[field] = value;
      else if (existing.row[field] !== value) {
        delete existing.row[field]; existing.conflicts.add(field); metadata.conflicts.add(`${side}.${field}`);
      }
    }
    return;
  }
  const total = result.transactions.reduce((sum, item) => sum + (item.inputs?.length || 0) + (item.outputs?.length || 0), 0);
  if (transaction[side].length >= MAX_TRANSACTION_SIDE || total >= MAX_TRANSACTION_REFERENCES) {metadata.omitted = true; return;}
  transaction[side].push(fields);
  metadata[side].set(key, {row: fields, conflicts: new Set()});
}

function transactionCoverage(transaction) {
  const metadata = transactionMetadata.get(transaction), lines = [];
  if (transaction.record_type === 'utxo') {
    lines.push(`UTXO sample: ${transaction.inputs.length}/${metadata.seenInputs.size} input and ${transaction.outputs.length}/${metadata.seenOutputs.size} output source records returned.`,
      'No single sender, recipient or transfer amount is inferred. Input/output values are not additive transfer volume.',
      `Caps: ${MAX_TRANSACTION_SIDE} per side; ${MAX_TRANSACTION_REFERENCES} references per snapshot.`);
    if (metadata.graph) lines.push('The source graph is bounded; complete transaction inputs/outputs are not established.');
    if (metadata.omitted) lines.push('Some source records or fields were omitted by validation or export limits.');
  } else lines.push('Native account record; amount is the declared native value, not an ERC-20 transfer. Failed execution does not transfer the declared value.');
  if (!transaction.timestamp) lines.push('Transaction time is unavailable from this source snapshot.');
  if (metadata.conflicts.size) lines.push(`Conflicting metadata omitted: ${[...metadata.conflicts].sort().join(', ')}.`);
  return lines.join(' ').slice(0, 600);
}
function projectGraph(result, data, network) {
  if (!Array.isArray(data.nodes) || data.nodes.length > 1200 || !Array.isArray(data.edges) || data.edges.length > 4000) throw new Error('invalid_source');
  const mapping = new Map(), sourceNodes = new Map();
  for (const node of data.nodes) {
    if (!node || typeof node.id !== 'string' || node.id.length > 200 || sourceNodes.has(node.id)) continue;
    const kind = node.kind === 'transaction' ? 'transaction' : node.kind === 'script_hash' ? 'script_hash' : node.kind === 'address' ? 'address' : null;
    if (!kind) continue;
    const value = kind === 'transaction' ? node.txid : node.address;
    sourceNodes.set(node.id, node);
    const id = addNode(result, network, kind, value);
    if (id) mapping.set(node.id, id);
    if (kind === 'transaction') {
      const transaction = addTransaction(result, network, {hash: value, timestamp: node.block?.time,
        block_height: node.block?.height, block_hash: node.block?.hash, slot: node.block?.slot});
      if (transaction) transactionMetadata.get(transaction).graph = true;
    }
  }
  for (const [index, edge] of data.edges.entries()) {
    if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue;
    addEdge(result, mapping.get(edge.from), mapping.get(edge.to), edge.amount_base_units, network === 'ethereum' ? 'wei' : 'sat');
    if (!validHash(edge.txid)) continue;
    const from = sourceNodes.get(edge.from), to = sourceNodes.get(edge.to);
    const native = network === 'ethereum' && edge.kind === 'native_value' && from?.kind === 'address' && to?.kind === 'address' && address(from.address, network) && address(to.address, network);
    const input = network === 'bitcoin' ? edge.kind === 'observed_input_prevout' : network === 'bloch' && edge.kind === 'observed_spent_outpoint_reference';
    const output = network === 'bitcoin' ? edge.kind === 'created_output' : network === 'bloch' && edge.kind === 'observed_created_output';
    const transactionNode = input ? to : output ? from : null, endpoint = input ? from : output ? to : null;
    const utxo = network !== 'ethereum' && (input || output) && transactionNode?.kind === 'transaction' && validHash(transactionNode.txid) &&
      hash(transactionNode.txid, network) === hash(edge.txid, network) && ['address', 'script_hash'].includes(endpoint?.kind) && address(endpoint.address, network);
    if (!native && !utxo) continue;
    const transaction = addTransaction(result, network, {hash: edge.txid, timestamp: edge.block_time,
      block_height: edge.block_number, block_hash: edge.block_hash, slot: edge.slot,
      ...(native ? {from: from.address, to: to.address, amount: edge.amount_base_units} : {})});
    if (!transaction) continue;
    transactionMetadata.get(transaction).graph = true;
    // Both representations may occur; contradictory anchors remain unknown.
    addTransaction(result, network, {hash: edge.txid, timestamp: edge.block?.time,
      block_height: edge.block?.height, block_hash: edge.block?.hash, slot: edge.block?.slot});
    if (utxo) addTransactionReference(result, transaction, network, input ? 'inputs' : 'outputs',
      {address: endpoint.address, amount: edge.amount_base_units, outpoint: edge.outpoint}, integer(edge.position) ? edge.position : index);
  }
  fact(result, 'Source graph references', data.nodes.length, 'references');
  fact(result, 'Source graph records', data.edges.length, 'records');
  fact(result, 'Displayed graph references', result.graph.nodes.length, 'references');
  fact(result, 'Displayed graph records', result.graph.edges.length, 'records');
}

function projectWallet(result, data, network, subject) {
  if (data.network !== `${network}-mainnet` || data.asset !== NETWORKS[network] ||
      !address(data.address, network) || (network === 'bitcoin' ? data.address !== subject.value : data.address.toLowerCase() !== subject.value) ||
      !decimal(data.balance?.base_units)) throw new Error('invalid_source');
  fact(result, 'Observed address balance', data.balance.base_units, network === 'ethereum' ? 'wei' : 'sat');
  fact(result, 'Confirmed address transactions', data.activity?.confirmed_tx_count, 'transactions');
  fact(result, 'Pending address transactions', data.activity?.mempool_tx_count, 'transactions');
  fact(result, 'Observed script events', data.activity?.bounded_events, 'events');
  fact(result, 'Indexed script events', data.activity?.total_source_reported, 'events');
  fact(result, 'Balance checkpoint height', data.balance?.block?.height, 'blocks');
  fact(result, 'Source history height', data.observation?.history?.source_anchor?.height, 'blocks');
  projectGraph(result, data, network);
  result.observed_at = iso(data.balance?.block?.time) || null;
}

function projectTransaction(result, data, network, subject) {
  if (data.network !== network || !data.transaction || typeof data.transaction !== 'object') throw new Error('invalid_source');
  const tx = data.transaction;
  const txid = network === 'ethereum' ? tx.hash : tx.txid;
  if (!validHash(txid) || hash(txid, network) !== subject.value) throw new Error('invalid_source');
  const txNode = addNode(result, network, 'transaction', txid);
  if (network === 'ethereum') {
    const amount = quantity(tx.value);
    if (!address(tx.from, network) || tx.to !== null && !address(tx.to, network) || amount === null) throw new Error('invalid_source');
    const receipt = data.receipt_status === 'available' && validHash(data.receipt?.transactionHash) && data.receipt.transactionHash.toLowerCase() === txid.toLowerCase() &&
      validHash(tx.blockHash) && validHash(data.receipt?.blockHash) && data.receipt.blockHash.toLowerCase() === tx.blockHash.toLowerCase() &&
      quantity(tx.blockNumber)!==null && quantity(data.receipt?.blockNumber)===quantity(tx.blockNumber) ? data.receipt : null;
    const status = receipt && quantity(receipt.status) === '1' ? 'successful' : receipt && quantity(receipt.status) === '0' ? 'failed' : tx.blockNumber === null ? 'pending' : 'source-reported';
    const time = epoch(quantityNumber(tx.blockTimestamp));
    addTransaction(result, network, {hash: txid, from: tx.from, to: tx.to, amount, status, timestamp: time,
      block_height: quantity(tx.blockNumber), block_hash: tx.blockHash});
    addEdge(result, addNode(result, network, 'address', tx.from), txNode, amount, 'wei');
    if (tx.to !== null) addEdge(result, txNode, addNode(result, network, 'address', tx.to), amount, 'wei');
    fact(result, 'Declared transaction value', amount, 'wei');
    fact(result, 'Transaction gas limit', quantity(tx.gas), 'gas');
    fact(result, 'Transaction nonce', quantity(tx.nonce), 'nonce');
    if(receipt){
      const used=quantity(receipt.gasUsed),price=quantity(receipt.effectiveGasPrice);
      fact(result,'Execution gas used',used,'gas');
      fact(result,'Effective execution gas price',price,'wei/gas');
      if(used!==null&&price!==null)fact(result,'Derived execution gas fee',(BigInt(used)*BigInt(price)).toString(),'wei');
      const blobUsed=quantity(receipt.blobGasUsed),blobPrice=quantity(receipt.blobGasPrice);
      if(blobUsed!==null&&blobPrice!==null)fact(result,'Derived blob gas fee',(BigInt(blobUsed)*BigInt(blobPrice)).toString(),'wei');
      if(Array.isArray(receipt.logs)&&receipt.logs.length<=20000)fact(result,'Receipt log records',receipt.logs.length,'logs');
    }
    fact(result, 'Transaction height', quantityNumber(tx.blockNumber), 'blocks');
    fact(result, 'Reported confirmations', data.position?.confirmations, 'blocks');
    fact(result, 'Reported finalized height', data.position?.finalized_height, 'blocks');
    result.observed_at = time;
  } else {
    const inputs = network === 'bitcoin' ? tx.vin : tx.inputs, outputs = network === 'bitcoin' ? tx.vout : tx.outputs;
    if (!Array.isArray(inputs) || !Array.isArray(outputs) || inputs.length > 20000 || outputs.length > 20000) throw new Error('invalid_source');
    const time = network === 'bitcoin' ? epoch(tx.status?.block_time) : null;
    const transaction = addTransaction(result, network, {hash: txid, timestamp: time,
      block_height: network === 'bitcoin' ? tx.status?.block_height : tx.height,
      block_hash: network === 'bitcoin' ? tx.status?.block_hash : tx.block_id, slot: network === 'bloch' ? tx.slot : undefined,
      status: network === 'bitcoin' && typeof tx.status?.confirmed === 'boolean' ? tx.status.confirmed ? 'confirmed' : 'pending' : 'source-reported'});
    for (const [direction, rows] of [['input', inputs], ['output', outputs]]) {
      for (const [index, item] of rows.entries()) {
        const row = network === 'bitcoin' && direction === 'input' ? item?.prevout : item;
        const value = network === 'bitcoin' ? row?.scriptpubkey_address : row?.script_hash;
        const amount = network === 'bitcoin' && integer(row?.value) ? String(row.value) : row?.value_sat;
        let outpoint;
        if (network === 'bitcoin' && direction === 'output') {
          if (item && typeof item === 'object' && !Array.isArray(item)) outpoint = {txid, vout: index};
        } else if (item && (item.txid !== undefined || item.vout !== undefined)) outpoint = {txid: item.txid, vout: item.vout};
        addTransactionReference(result, transaction, network, direction === 'input' ? 'inputs' : 'outputs',
          {address: value, amount, outpoint}, index);
        if (index >= 80) continue;
        if (!address(value, network) || !decimal(amount)) continue;
        const node = addNode(result, network, network === 'bloch' ? 'script_hash' : 'address', value);
        addEdge(result, direction === 'input' ? node : txNode, direction === 'input' ? txNode : node, amount, 'sat');
      }
    }
    fact(result, 'Transaction input records', inputs.length, 'records');
    fact(result, 'Transaction output records', outputs.length, 'records');
    fact(result, 'Displayed graph records', result.graph.edges.length, 'records');
    fact(result, 'Transaction height', network === 'bitcoin' ? tx.status?.block_height : tx.height, 'blocks');
    fact(result, 'Transaction slot', network === 'bloch' ? tx.slot : null, 'slots');
    fact(result, 'Transaction fee', network === 'bitcoin' ? tx.fee : tx.fee_sat, 'sat');
    if(network==='bitcoin'){
      const coinbase=inputs.some(input=>input?.is_coinbase===true);
      fact(result,'Coinbase transaction',coinbase);
      if(integer(tx.weight)&&tx.weight>0){fact(result,'Transaction weight',tx.weight,'weight units');fact(result,'Transaction virtual size',Math.ceil(tx.weight/4),'vbytes');}
      const inputValues=inputs.map(input=>input?.prevout?.value),outputValues=outputs.map(output=>output?.value);
      const inputTotal=!coinbase&&inputValues.length&&inputValues.every(integer)?inputValues.reduce((sum,value)=>sum+BigInt(value),0n):null;
      const outputTotal=outputValues.length&&outputValues.every(integer)?outputValues.reduce((sum,value)=>sum+BigInt(value),0n):null;
      if(inputTotal!==null)fact(result,'Complete input record total',inputTotal.toString(),'sat');
      if(outputTotal!==null)fact(result,'Complete output record total',outputTotal.toString(),'sat');
      if(inputTotal!==null&&outputTotal!==null&&inputTotal>=outputTotal){
        fact(result,'Derived input-output fee',(inputTotal-outputTotal).toString(),'sat');
        if(integer(tx.fee))fact(result,'Derived fee matches reported fee',inputTotal-outputTotal===BigInt(tx.fee));
      }
      // RBF is an observed sequence signal, not a guarantee of replacement policy.
      if(!coinbase&&inputs.length&&inputs.every(input=>integer(input?.sequence)&&input.sequence<=0xffffffff))fact(result,'Input sequence replacement signal',inputs.some(input=>input.sequence<0xfffffffe));
      if(Array.isArray(data.outspends)&&data.outspends.length===outputs.length&&data.outspends.every(row=>typeof row?.spent==='boolean'))fact(result,'Outputs reported spent',data.outspends.filter(row=>row.spent).length,'outputs');
    }
    fact(result, 'Reported finalized height', data.position?.finalized_height, 'blocks');
    result.observed_at = time;
  }
}

function projectOverview(result, data, network) {
  if (data.network !== network || !data.head || typeof data.head !== 'object') throw new Error('invalid_source');
  const head = data.head;
  const height = network === 'ethereum' ? quantityNumber(head.number) : head.height;
  if (!integer(height)) throw new Error('invalid_source');
  fact(result, 'Observed head height', height, 'blocks');
  if (network === 'bitcoin') {
    fact(result, 'Transactions in head block', head.tx_count, 'transactions');
    fact(result, 'Observed mempool transactions', data.mempool?.count, 'transactions');
    fact(result, 'Observed mempool virtual size', data.mempool?.vsize, 'vbytes');
    fact(result, 'Observed mempool total fees', data.mempool?.total_fee, 'sat');
    fact(result, 'Head block weight', head.weight, 'weight units');
    fact(result, 'Head block size', head.size, 'bytes');
    for(const target of ['3','6'])rateFact(result,`Source fee estimate for ${target} blocks`,data.fee_estimates_sat_vbyte?.[target],'sat/vbyte');
    result.observed_at = epoch(head.timestamp);
  } else if (network === 'ethereum') {
    fact(result, 'Reported finalized height', quantityNumber(data.finalized?.number), 'blocks');
    fact(result, 'Source gas price', data.gas_price_wei, 'wei/gas');
    fact(result, 'Head block gas used', quantity(head.gasUsed), 'gas');
    fact(result, 'Head block gas limit', quantity(head.gasLimit), 'gas');
    fact(result, 'Head block base fee', quantity(head.baseFeePerGas), 'wei/gas');
    if(Array.isArray(head.transactions)&&head.transactions.length<=20000)fact(result,'Head block transaction IDs',head.transactions.length,'transactions');
    result.observed_at = epoch(quantityNumber(head.timestamp));
  } else {
    fact(result, 'Observed head slot', head.slot, 'slots');
    fact(result, 'Reported finalized height', head.finalized_height, 'blocks');
    fact(result, 'Indexer lag', data.health?.lag_slots, 'slots');
    fact(result, 'Reporting nodes', data.peers?.reporting_nodes, 'nodes');
    fact(result, 'Observed mempool transactions', data.mempool_details?.size, 'transactions');
    fact(result, 'Observed mempool capacity', data.mempool_details?.max, 'transactions');
    fact(result, 'Observed mempool bytes', data.mempool_details?.bytes, 'bytes');
    fact(result, 'Source next base fee', data.mempool_details?.next_base_fee_millisat_per_gas, 'millisat/gas');
    fact(result, 'Observed head epoch', head.epoch, 'epochs');
    fact(result, 'Indexer transaction records', data.health?.transactions, 'transactions');
    fact(result, 'Indexer checkpoint slot', data.health?.indexed_to_slot, 'slots');
    result.observed_at = epoch(data.network_diagnostics?.sampled_at, 1);
  }
}

function projectNetwork(result, data, network) {
  if (data.network !== `${network}-mainnet` || data.asset !== NETWORKS[network] || !integer(data.anchor?.height)) throw new Error('invalid_source');
  fact(result, 'Graph source height', data.anchor.height, 'blocks');
  fact(result, 'Graph source finalized height', data.anchor.finalized_height, 'blocks');
  fact(result, 'Source sample transactions', data.scope?.transactions_returned ?? data.scope?.successful_transfers, 'transactions');
  fact(result, 'Source omitted records', data.scope?.endpoint_records_omitted, 'records');
  projectGraph(result, data, network);
  result.observed_at = iso(data.anchor.time);
}

function projectValidators(result, data) {
  const total = data.counts?.total, active = data.counts?.active;
  if (data.offset !== 0 || data.limit !== 32 || !integer(total) || total > 4096 || !integer(active) || active > total ||
      !Array.isArray(data.validators) || data.validators.length > 32 || data.returned !== data.validators.length ||
      !integer(data.head?.height) || !integer(data.head?.slot) || data.head.slot < data.head.height || !validHash(data.head.block_id) ||
      !integer(data.generated_at)) throw new Error('invalid_source');
  fact(result, 'Source validator count', total, 'validators');
  fact(result, 'Source active validators', active, 'validators');
  fact(result, 'Validator observation height', data.head.height, 'blocks');
  fact(result, 'Validator observation slot', data.head.slot, 'slots');
  fact(result, 'Source active stake', data.counts.total_active_stake_sat, 'sat');
  result.observed_at = epoch(data.generated_at);
}

function plans(query) {
  const {network, subject} = query, asset = NETWORKS[network];
  if (subject?.kind === 'address') return [{id: 'address_observation', title: 'Public address observation',
    url: `https://bloch-graphus.xyz/api/chain/wallet?${new URLSearchParams({network, asset, address: subject.value})}`,
    coverage: network === 'ethereum' ? 'One address balance at a source-reported finalized block. Native Ethereum transaction history is unavailable from this balance endpoint.' : network === 'bitcoin' ? 'One address aggregate and up to eight confirmed transactions. This is not a complete wallet history; neighbor observations may use different retrieval times.' : 'One script hash balance and up to 64 indexed events. Balance and history are separate source observations; the script hash does not identify an owner.',
    project: (result, data) => projectWallet(result, data, network, subject)}];
  if (subject?.kind === 'transaction') return [{id: 'transaction_observation', title: 'Public transaction observation',
    url: `https://bloch.space/api/tx?${new URLSearchParams({network, query: subject.value})}`,
    coverage: network==='ethereum'?'One transaction with a matching receipt when available. Execution gas and blob gas fees are separate; failed execution does not transfer the declared value. Logs are not automatically token transfers. References do not prove ownership.':'One transaction with bounded input/output references. Input and output totals are separate record totals, not transfer volume. Fee arithmetic requires complete non-coinbase input values. Outspends and checkpoints are separate observations, not ownership evidence.',
    project: (result, data) => projectTransaction(result, data, network, subject)}];
  return [{id: 'network_overview', title: 'Public network overview',
    url: `https://bloch.space/api/overview?network=${network}`,
    coverage: 'Source-reported network overview. Head, finalized checkpoint, mempool, and indexer values may have different observation times. Fee estimates are source observations and do not guarantee confirmation.',
    project: (result, data) => projectOverview(result, data, network)},
  {id: 'network_graph', title: 'Bounded public network graph',
    url: `https://bloch-graphus.xyz/api/chain/network?asset=${asset}`,
    coverage: network === 'bitcoin' ? 'Up to 20 transactions, with up to 24 input and output records per transaction, from a source best-chain block selected at least three confirmations deep.' : network === 'ethereum' ? 'Up to 24 successful direct-value transactions in one source-finalized block. Internal calls and full account history are excluded.' : 'Up to 32 indexed transactions and 3000 endpoint records. Transaction heights are compared with a separately reported finalized height when available.',
    project: (result, data) => projectNetwork(result, data, network)},
  ...(network === 'bloch' ? [{id: 'validator_counts', title: 'Public Bloch validator counts',
    url: 'https://blochl1.com/g4/validators?offset=0&limit=32',
    coverage: 'Aggregate counts from the source validator service, observed separately from the network head. Individual validator keys, labels, and state records are excluded.',
    project: projectValidators}] : [])];
}

/** Fetch only validated public observations. Invalid inputs throw before any source call. */
export async function fetchChainContext({portal, network, subject, fetcher = fetch, now = () => new Date()} = {}) {
  const query = validateChainQuery({portal, network, subject});
  const observed = await Promise.all(plans(query).map(async plan => {
    const result = context();
    const source = emptySource(plan.id, plan.title, plan.url, clock(now), plan.coverage);
    try {
      const data = await read(fetcher, plan.url);
      plan.project(result, data);
      result.facts = result.facts.map(fact => ({...fact, source_id: plan.id}));
      result.transactions = result.transactions.map(transaction => ({...transaction, source_id: plan.id, coverage: transactionCoverage(transaction)}));
      source.status = 'available';
      source.retrieved_at = iso(data.retrieved_at) || iso(data.observation?.retrieved_at) || source.retrieved_at;
      source.observed_at = result.observed_at;
      result.status = 'available';
    } catch {
      // Malformed, missing, redirected, or unavailable sources never become empty successful data.
      result.facts = []; result.transactions = []; result.graph = {nodes: [], edges: []}; result.observed_at = null;
    }
    result.sources = [source];
    return result;
  }));
  const result = context();
  result.network = query.network;
  result.subject = query.subject || null;
  result.sources = observed.flatMap(item => item.sources);
  result.facts = observed.flatMap(item => item.facts).slice(0, 48);
  result.transactions = observed.flatMap(item => item.transactions).slice(0, MAX_TRANSACTIONS);
  let remainingReferences = MAX_TRANSACTION_REFERENCES;
  for (const transaction of result.transactions) {
    for (const side of ['inputs', 'outputs']) if (transaction[side]) {
      const kept = transaction[side].slice(0, Math.min(MAX_TRANSACTION_SIDE, remainingReferences));
      if (kept.length !== transaction[side].length) transaction.coverage = `Additional reference records omitted by the ${MAX_TRANSACTION_REFERENCES}-record snapshot limit. ${transaction.coverage}`.slice(0, 600);
      transaction[side] = kept; remainingReferences -= kept.length;
    }
  }
  const graph = observed.find(item => item.graph.nodes.length)?.graph;
  if (graph) result.graph = graph;
  const available = result.sources.filter(source => source.status === 'available').length;
  result.status = available === result.sources.length ? 'available' : available ? 'partial' : 'unavailable';
  result.observed_at = observed.find(item => item.observed_at)?.observed_at || null;
  result.coverage = `${fixedCoverage} Exports include at most ${MAX_TRANSACTIONS} transactions, ${MAX_NODES} graph references, and ${MAX_EDGES} graph records. Transaction input/output references are capped at ${MAX_TRANSACTION_SIDE} per side and ${MAX_TRANSACTION_REFERENCES} per snapshot. ${result.sources.map(source => source.coverage).join(' ')}`;
  return result;
}
