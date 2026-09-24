import assert from 'node:assert/strict';
import test from 'node:test';
import {queryEthereumActivity} from '../graphus/chain/ethereum-activity.js';
import {onRequest} from '../graphus/functions/api/[[path]].js';

const address = '0x0000000000000000000000000000000000000001';
const other = '0x0000000000000000000000000000000000000002';
const contract = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const topic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const indexed = value => `0x${'0'.repeat(24)}${value.slice(2)}`;
const hash = `0x${'a'.repeat(64)}`;
const env = {GRAPHUS_ETHEREUM_RPC_URL: 'https://rpc.example.test/'};
const now = () => new Date('2026-09-23T12:00:00.000Z');
const reply = (id, result) => new Response(JSON.stringify({jsonrpc: '2.0', id, result}), {
  headers: {'content-type': 'application/json'},
});
function log({from = other, to = address, index = 0, number = '0x64', blockHash = hash} = {}) {
  return {
    address: contract, topics: [topic, indexed(from), indexed(to)], data: `0x${'0'.repeat(59)}f4240`,
    blockNumber: number, blockHash, transactionHash: `0x${'b'.repeat(64)}`,
    transactionIndex: '0x2', logIndex: `0x${index.toString(16)}`, removed: false,
  };
}
function source({incoming = [], outgoing = [], chainId = '0x1', block = null, historicalBlock = null} = {}) {
  const calls = [];
  const fetcher = async (_url, init) => {
    const request = JSON.parse(init.body); calls.push(request);
    if (request.method === 'eth_chainId') return reply(request.id, chainId);
    if (request.method === 'eth_getBlockByNumber') return reply(request.id, request.params[0] === 'finalized'
      ? block || {number: '0x64', hash, timestamp: '0x5'}
      : historicalBlock);
    if (request.method === 'eth_getLogs') return reply(request.id, request.id === 3 ? incoming : outgoing);
    throw new Error('unexpected request');
  };
  return {fetcher, calls};
}

test('USDC activity is exact bounded Transfer-log evidence with source provenance', async () => {
  const inbound = log();
  const outbound = log({from: address, to: other, index: 1});
  const {fetcher, calls} = source({incoming: [inbound], outgoing: [outbound]});
  const result = await queryEthereumActivity({address, asset: 'USDC', env, fetcher, now});
  assert.equal(result.status, 200);
  const body = result.body;
  assert.equal(body.status, 'source-reported');
  assert.equal(body.independent_verification, false);
  assert.equal(body.activity.event_count, 2);
  assert.deepEqual(body.activity.events.map(event => event.direction), ['incoming', 'outgoing']);
  assert.deepEqual(body.activity.events.map(event => event.amount_base_units), ['1000000', '1000000']);
  assert.equal(body.activity.events[0].block_number, 100);
  assert.equal(body.activity.events[0].transaction_index, 2);
  assert.equal(body.activity.events[1].log_index, 1);
  assert.equal(body.nodes.length, 2);
  assert.equal(body.edges.length, 2);
  assert.deepEqual(body.observation.block_window, {from: 37, to: 100, width: 64});
  assert.equal(body.observation.finalized_head.hash, hash);
  assert.equal(body.observation.window_end_anchor.hash, hash);
  assert.equal(body.observation.retrieved_at, '2026-09-23T12:00:00.000Z');
  assert.equal(calls.length, 4);
  assert.equal(calls[2].params[0].address, contract);
  assert.equal(calls[2].params[0].fromBlock, '0x25');
  assert.equal(calls[2].params[0].toBlock, '0x64');
  assert.deepEqual(calls[2].params[0].topics, [topic, null, indexed(address)]);
  assert.deepEqual(calls[3].params[0].topics, [topic, indexed(address)]);
});

test('older finalized windows use their own block anchor and reject an inconsistent end log', async () => {
  const historicalHash=`0x${'c'.repeat(64)}`;
  const historicalBlock={number:'0x24',hash:historicalHash,timestamp:'0x4'};
  const {fetcher,calls}=source({historicalBlock,incoming:[log({number:'0x24',blockHash:historicalHash})]});
  const result=await queryEthereumActivity({address,asset:'USDC',toBlock:'36',env,fetcher,now});
  assert.equal(result.status,200);
  assert.deepEqual(result.body.observation.block_window,{from:0,to:36,width:37});
  assert.equal(result.body.observation.finalized_head.height,100);
  assert.equal(result.body.observation.finalized_head.hash,hash);
  assert.equal(result.body.observation.window_end_anchor.height,36);
  assert.equal(result.body.observation.window_end_anchor.hash,historicalHash);
  assert.equal(calls[2].params[0],'0x24');
  assert.equal(calls[3].params[0].toBlock,'0x24');
  const mismatch=source({historicalBlock,incoming:[log({number:'0x24'})]});
  assert.deepEqual(await queryEthereumActivity({address,asset:'USDC',toBlock:'36',env,fetcher:mismatch.fetcher,now}),
    {status:502,body:{error:'chain_source_unavailable'}});
});

test('historical window input is bounded by the finalized head',async()=>{
  for(const value of ['-1','01','1.2','9007199254740992','']){
    const response=await onRequest({request:new Request(`https://bloch-graphus.pages.dev/api/chain/activity?asset=USDC&address=${address}&to_block=${encodeURIComponent(value)}`),env:{}});
    assert.equal(response.status,400);
    assert.equal((await response.json()).error,'invalid_to_block');
  }
  const {fetcher,calls}=source();
  assert.deepEqual(await queryEthereumActivity({address,asset:'USDC',toBlock:'101',env,fetcher,now}),
    {status:400,body:{error:'to_block_not_finalized'}});
  assert.equal(calls.length,2);
});

test('a pinned historical link rejects a different source block before reading logs',async()=>{
  const historicalHash=`0x${'c'.repeat(64)}`;
  const historicalBlock={number:'0x24',hash:historicalHash,timestamp:'0x4'};
  const same=source({historicalBlock});
  const result=await queryEthereumActivity({address,asset:'USDC',toBlock:'36',
    expectedHash:historicalHash.toUpperCase().replace('0X','0x'),env,fetcher:same.fetcher,now});
  assert.equal(result.status,200);
  const mismatch=source({historicalBlock});
  assert.deepEqual(await queryEthereumActivity({address,asset:'USDC',toBlock:'36',
    expectedHash:hash,env,fetcher:mismatch.fetcher,now}),
  {status:409,body:{error:'window_anchor_mismatch'}});
  assert.equal(mismatch.calls.length,3);
  for(const params of [{expectedHash:hash},{toBlock:'36',expectedHash:'bad'}]){
    const invalid=await queryEthereumActivity({address,asset:'USDC',env,...params});
    assert.deepEqual(invalid,{status:400,body:{error:'invalid_expected_hash'}});
  }
});

test('self transfer appearing in both filters is represented once', async () => {
  const self = log({from: address, to: address});
  const {fetcher} = source({incoming: [self], outgoing: [self]});
  const result = await queryEthereumActivity({address, asset: 'USDC', env, fetcher, now});
  assert.equal(result.status, 200);
  assert.equal(result.body.activity.event_count, 1);
  assert.equal(result.body.activity.events[0].direction, 'self');
});

test('wrong network and mismatched head log fail closed', async () => {
  const wrong = source({chainId: '0x5'});
  assert.deepEqual(await queryEthereumActivity({address, asset: 'USDC', env, fetcher: wrong.fetcher, now}),
    {status: 502, body: {error: 'ethereum_network_mismatch'}});
  assert.equal(wrong.calls.length, 1);
  const mismatch = source({incoming: [log({blockHash: `0x${'c'.repeat(64)}`})]});
  assert.deepEqual(await queryEthereumActivity({address, asset: 'USDC', env, fetcher: mismatch.fetcher, now}),
    {status: 502, body: {error: 'chain_source_unavailable'}});
});

test('dense window returns no partial activity', async () => {
  const {fetcher} = source({incoming: Array.from({length: 129}, (_, index) => log({index}))});
  assert.deepEqual(await queryEthereumActivity({address, asset: 'USDC', env, fetcher, now}),
    {status: 413, body: {error: 'ethereum_activity_window_too_dense'}});
});

test('native ETH activity is explicitly unavailable without an index', async () => {
  assert.deepEqual(await queryEthereumActivity({address, asset: 'ETH', env, now}),
    {status: 501, body: {error: 'native_eth_activity_requires_transaction_index'}});
  const response = await onRequest({
    request: new Request(`https://bloch-graphus.pages.dev/api/chain/activity?asset=ETH&address=${address}`),
    env: {},
  });
  assert.equal(response.status, 501);
  assert.deepEqual(await response.json(), {error: 'native_eth_activity_requires_transaction_index'});
});
