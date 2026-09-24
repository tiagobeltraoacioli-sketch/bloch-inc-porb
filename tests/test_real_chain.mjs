import assert from 'node:assert/strict';
import test from 'node:test';
import {queryChainWallet} from '../graphus/chain/real-chain.js';
import {onRequest} from '../graphus/functions/api/[[path]].js';

const now = () => new Date('2026-09-23T12:00:00.000Z');
const btcAddress = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
const otherAddress = 'bc1qg9x6grhe53g0w70t8ddz3fp0e4js8swzce4mp6';
const ethAddress = '0x0000000000000000000000000000000000000001';

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {status, headers: {'content-type': 'application/json'}});
}

test('Bitcoin address balance is exact and transaction edges remain observations', async () => {
  const calls = [];
  const fetcher = async url => {
    calls.push(url);
    if (url.endsWith('/txs/chain')) return reply([{
      txid: 'a'.repeat(64),
      status: {confirmed: true, block_height: 880000, block_hash: 'b'.repeat(64), block_time: 1735689600},
      vin: [{prevout: {scriptpubkey_address: btcAddress, value: 3000}}],
      vout: [{scriptpubkey_address: otherAddress, value: 2700}],
    }]);
    const address = url.endsWith(otherAddress) ? otherAddress : btcAddress;
    return reply({address, chain_stats: {funded_txo_sum: 12000, spent_txo_sum: 2000, tx_count: 3}, mempool_stats: {tx_count: 1}});
  };
  const result = await queryChainWallet({network: 'bitcoin', address: btcAddress, fetcher, now});
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'source-reported');
  assert.equal(result.body.independent_verification, false);
  assert.deepEqual(result.body.balance, {base_units: '10000', unit: 'sat', scope: 'source_confirmed_address_aggregate', block: null});
  assert.equal(result.body.activity.confirmed_tx_count, 3);
  assert.equal(result.body.edges.length, 2);
  assert.equal(result.body.edges[0].kind, 'observed_input_prevout');
  assert.equal(result.body.edges[1].kind, 'created_output');
  assert.equal(result.body.edges[1].amount_base_units, '2700');
  assert.equal(result.body.observation.retrieved_at, '2026-09-23T12:00:00.000Z');
  assert.equal(result.body.observation.neighborhood.enriched, 1);
  assert.equal(result.body.nodes.find(node => node.address === otherAddress).balance.base_units, '10000');
  assert.equal(calls.length, 3);
});

test('Bitcoin neighbor enrichment is six-address bounded, deterministic and three-way concurrent', async () => {
  const neighbors = 'BCDEFGHJKL'.split('').map(letter => `1${'A'.repeat(24)}${letter}`);
  const requested = [];
  let active = 0;
  let maximumActive = 0;
  let tick = 0;
  const clock = () => new Date(Date.UTC(2026, 8, 23, 12, 0, tick++));
  const fetcher = async url => {
    if (url.endsWith('/txs/chain')) return reply([{
      txid: 'c'.repeat(64),
      status: {confirmed: true, block_height: 880000, block_hash: 'd'.repeat(64), block_time: 1735689600},
      vin: [{prevout: {scriptpubkey_address: btcAddress, value: 5000}}],
      vout: neighbors.map(address => ({scriptpubkey_address: address, value: 100})),
    }]);
    const address = url.slice(url.lastIndexOf('/') + 1);
    if (address !== btcAddress) {
      requested.push(address);
      active++;
      maximumActive = Math.max(maximumActive, active);
      await new Promise(resolve => setTimeout(resolve, 2));
      active--;
    }
    return reply({address, chain_stats: {funded_txo_sum: 10000, spent_txo_sum: 1000, tx_count: 2}, mempool_stats: {tx_count: 0}});
  };
  const result = await queryChainWallet({network: 'bitcoin', address: btcAddress, fetcher, now: clock});
  assert.equal(result.status, 200);
  assert.deepEqual(requested, neighbors.slice(0, 6));
  assert.ok(maximumActive <= 3 && maximumActive >= 2);
  assert.deepEqual(result.body.observation.neighborhood, {
    selection: 'first_6_unique_non_query_address_nodes_in_lexicographic_order', attempted: 6, enriched: 6,
  });
  const enriched = result.body.nodes.filter(node => node.address && node.address !== btcAddress && node.balance);
  assert.equal(enriched.length, 6);
  assert.equal(new Set(enriched.map(node => node.balance.retrieved_at)).size, 6);
  assert.equal(result.body.nodes.filter(node => node.address && node.address !== btcAddress && !node.balance).length, 4);
});

test('Bitcoin reports balance even when bounded transaction evidence is unavailable', async () => {
  const fetcher = async url => url.endsWith('/txs/chain')
    ? reply({error: 'down'}, 503)
    : reply({address: btcAddress, chain_stats: {funded_txo_sum: 7, spent_txo_sum: 2, tx_count: 1}, mempool_stats: {tx_count: 0}});
  const result = await queryChainWallet({network: 'bitcoin', address: btcAddress, fetcher, now});
  assert.equal(result.status, 200);
  assert.equal(result.body.balance.base_units, '5');
  assert.equal(result.body.observation.coverage, 'unavailable');
  assert.deepEqual(result.body.edges, []);
});

test('failed neighbor lookup never becomes a zero balance or a failed root query', async () => {
  const fetcher = async url => {
    if (url.endsWith('/txs/chain')) return reply([{
      txid: 'a'.repeat(64), status: {confirmed: true, block_height: 1, block_hash: 'b'.repeat(64), block_time: 1},
      vin: [], vout: [{scriptpubkey_address: otherAddress, value: 100}],
    }]);
    if (url.endsWith(otherAddress)) return reply({error: 'temporary outage'}, 503);
    return reply({address: btcAddress, chain_stats: {funded_txo_sum: 100, spent_txo_sum: 0, tx_count: 1}, mempool_stats: {tx_count: 0}});
  };
  const result = await queryChainWallet({network: 'bitcoin', address: btcAddress, fetcher, now});
  assert.equal(result.status, 200);
  assert.equal(result.body.balance.base_units, '100');
  assert.equal(result.body.nodes.find(node => node.address === otherAddress).balance, null);
  assert.equal(result.body.observation.neighborhood.attempted, 1);
  assert.equal(result.body.observation.neighborhood.enriched, 0);
});

test('Bitcoin balances preserve exact safe integer satoshis and reject imprecise source numbers', async () => {
  const base = {
    address: btcAddress,
    chain_stats: {funded_txo_sum: Number.MAX_SAFE_INTEGER, spent_txo_sum: Number.MAX_SAFE_INTEGER - 2, tx_count: 0},
    mempool_stats: {tx_count: 0},
  };
  const valid = await queryChainWallet({
    network: 'bitcoin', address: btcAddress, now,
    fetcher: async url => reply(url.endsWith('/txs/chain') ? [] : base),
  });
  assert.equal(valid.status, 200);
  assert.equal(valid.body.balance.base_units, '2');
  assert.equal(valid.body.nodes.find(node => node.address === btcAddress).balance.base_units, '2');

  const invalid = await queryChainWallet({
    network: 'bitcoin', address: btcAddress, now,
    fetcher: async () => reply({...base, chain_stats: {...base.chain_stats, funded_txo_sum: Number.MAX_SAFE_INTEGER + 1}}),
  });
  assert.deepEqual(invalid, {status: 502, body: {error: 'chain_source_unavailable'}});
});

test('unsafe neighbor source number leaves only that neighbor balance unavailable', async () => {
  const fetcher = async url => {
    if (url.endsWith('/txs/chain')) return reply([{
      txid: 'a'.repeat(64), status: {confirmed: true, block_height: 1, block_hash: 'b'.repeat(64), block_time: 1},
      vin: [], vout: [{scriptpubkey_address: otherAddress, value: 100}],
    }]);
    const address = url.endsWith(otherAddress) ? otherAddress : btcAddress;
    return reply({address, chain_stats: {funded_txo_sum: address === otherAddress ? Number.MAX_SAFE_INTEGER + 1 : 7, spent_txo_sum: 0, tx_count: 1}, mempool_stats: {tx_count: 0}});
  };
  const result = await queryChainWallet({network: 'bitcoin', address: btcAddress, fetcher, now});
  assert.equal(result.status, 200);
  assert.equal(result.body.balance.base_units, '7');
  assert.equal(result.body.nodes.find(node => node.address === otherAddress).balance, null);
  assert.deepEqual(result.body.observation.neighborhood, {
    selection: 'first_6_unique_non_query_address_nodes_in_lexicographic_order', attempted: 1, enriched: 0,
  });
});

test('Ethereum token balance uses the same source-reported finalized block and fixed contract', async () => {
  const requests = [];
  const fetcher = async (_url, init) => {
    const request = JSON.parse(init.body);
    requests.push(request);
    const result = request.method === 'eth_chainId' ? '0x1'
      : request.method === 'eth_getBlockByNumber'
        ? {number: '0x64', hash: `0x${'c'.repeat(64)}`, timestamp: '0x5'}
        : `0x${'0'.repeat(63)}a`;
    return reply({jsonrpc: '2.0', id: request.id, result});
  };
  const result = await queryChainWallet({
    network: 'ethereum', asset: 'USDC', address: ethAddress,
    env: {GRAPHUS_ETHEREUM_RPC_URL: 'https://rpc.example.test/'}, fetcher, now,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.balance.base_units, '10');
  assert.equal(result.body.balance.block.height, 100);
  assert.equal(result.body.balance.contract, '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
  assert.equal(result.body.independent_verification, false);
  assert.deepEqual(result.body.edges, []);
  assert.equal(requests[2].params[1], '0x64');
  assert.equal(requests[2].params[0].to, result.body.balance.contract);
});

test('wrong Ethereum chain and malformed Bitcoin or Bloch identifiers fail closed', async () => {
  const wrongChain = await queryChainWallet({
    network: 'ethereum', address: ethAddress, env: {GRAPHUS_ETHEREUM_RPC_URL: 'https://rpc.example.test/'},
    fetcher: async () => reply({jsonrpc: '2.0', id: 1, result: '0x5'}), now,
  });
  assert.deepEqual(wrongChain, {status: 502, body: {error: 'ethereum_network_mismatch'}});
  const invalid = await queryChainWallet({network: 'bitcoin', address: 'not-an-address', now});
  assert.deepEqual(invalid, {status: 400, body: {error: 'invalid_address_or_asset'}});
  const bloch = await queryChainWallet({network: 'bloch', asset: 'BLCH', address: 'anything', now});
  assert.deepEqual(bloch, {status: 400, body: {error: 'invalid_bloch_script_hash'}});
});

test('public chain route answers before optional account database configuration', async () => {
  const response = await onRequest({
    request: new Request('https://bloch-graphus.pages.dev/api/chain/wallet?network=bloch&asset=BLCH&address=unknown'),
    env: {},
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {error: 'invalid_bloch_script_hash'});
});
