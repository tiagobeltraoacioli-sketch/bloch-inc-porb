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
    return reply({address: btcAddress, chain_stats: {funded_txo_sum: 12000, spent_txo_sum: 2000, tx_count: 3}, mempool_stats: {tx_count: 1}});
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
  assert.equal(calls.length, 2);
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

test('wrong Ethereum chain, invalid address and unsupported Bloch state fail closed', async () => {
  const wrongChain = await queryChainWallet({
    network: 'ethereum', address: ethAddress, env: {GRAPHUS_ETHEREUM_RPC_URL: 'https://rpc.example.test/'},
    fetcher: async () => reply({jsonrpc: '2.0', id: 1, result: '0x5'}), now,
  });
  assert.deepEqual(wrongChain, {status: 502, body: {error: 'ethereum_network_mismatch'}});
  const invalid = await queryChainWallet({network: 'bitcoin', address: 'not-an-address', now});
  assert.deepEqual(invalid, {status: 400, body: {error: 'invalid_address_or_asset'}});
  const bloch = await queryChainWallet({network: 'bloch', asset: 'BLCH', address: 'anything', now});
  assert.deepEqual(bloch, {status: 501, body: {error: 'real_bloch_wallet_state_unavailable'}});
});

test('public chain route answers before optional account database configuration', async () => {
  const response = await onRequest({
    request: new Request('https://bloch-graphus.pages.dev/api/chain/wallet?network=bloch&asset=BLCH&address=unknown'),
    env: {},
  });
  assert.equal(response.status, 501);
  assert.deepEqual(await response.json(), {error: 'real_bloch_wallet_state_unavailable'});
});
