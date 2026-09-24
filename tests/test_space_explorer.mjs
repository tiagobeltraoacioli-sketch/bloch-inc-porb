import assert from 'node:assert/strict';
import test from 'node:test';
import {handleExplore} from '../space/chain/explorer.js';

const hash = 'a'.repeat(64);
const block = 'b'.repeat(64);
const url = (route, query) => new URL(`https://bloch.space/api/${route}?${query}`);
const answer = value => new Response(JSON.stringify(value), {headers:{'content-type':'application/json'}});

test('Bloch Space refuses unknown networks, writes, and unbounded parameters', async () => {
  assert.equal((await handleExplore(url('overview','network=solana'))).status,400);
  assert.equal((await handleExplore(url('tx',`network=bitcoin&query=${hash}&extra=1`))).status,400);
  assert.equal((await handleExplore(url('tx',`network=bitcoin&query=${hash}&query=${block}`))).status,400);
  assert.equal((await handleExplore(url('address',`network=ethereum&query=${hash}&asset=USDT`))).status,400);
});

test('Bitcoin block response bounds transaction IDs and preserves source status', async () => {
  const fetcher = async input => {
    const path = new URL(input).pathname;
    if (path.endsWith('/block-height/12')) return new Response(hash);
    if (path.endsWith(`/block/${hash}`)) return answer({id:hash,height:12,tx_count:40});
    if (path.endsWith(`/block/${hash}/txids`)) return answer(Array.from({length:40},(_,n)=>String(n).padStart(64,'0')));
    if (path.endsWith(`/block/${hash}/status`)) return answer({in_best_chain:true});
    throw new Error(`Unexpected request ${path}`);
  };
  const response=await handleExplore(url('block','network=bitcoin&query=12'),{fetcher,now:()=> '2026-09-24T00:00:00.000Z'});
  assert.equal(response.status,200);
  assert.equal(response.body.block.id,hash);
  assert.equal(response.body.status.in_best_chain,true);
  assert.equal(response.body.total_transactions,40);
  assert.equal(response.body.transaction_ids.length,32);
});

test('Ethereum transaction preserves receipt status and a separate finalized checkpoint', async () => {
  const methods=[];
  const fetcher=async (_input,init) => {
    const request=JSON.parse(init.body);methods.push(request.method);
    const result={eth_getTransactionByHash:{hash:`0x${hash}`,value:'0x0',blockNumber:'0x11'},eth_getTransactionReceipt:{status:'0x1',gasUsed:'0x5208'},eth_getBlockByNumber:{number:'0x10'}}[request.method];
    return answer({jsonrpc:'2.0',id:1,result});
  };
  const response=await handleExplore(url('tx',`network=ethereum&query=0x${hash}`),{fetcher,env:{GRAPHUS_ETHEREUM_RPC_URL:'https://ethereum-rpc.publicnode.com'}});
  assert.equal(response.status,200);
  assert.equal(response.body.transaction.hash,`0x${hash}`);
  assert.equal(response.body.receipt.status,'0x1');
  assert.equal(response.body.finalized_height,16);
  assert.deepEqual(methods.sort(),['eth_getBlockByNumber','eth_getTransactionByHash','eth_getTransactionReceipt'].sort());
});

test('Bloch overview keeps head, indexer and holder snapshots separate', async () => {
  const fetcher=async input => {
    const path=new URL(input).pathname;
    if(path.endsWith('/api/v1/network'))return answer({data:{head:{data:{height:100,slot:128,block_id:block},corroboration:{level:'final'}}}});
    if(path.endsWith('/indexer/health'))return answer({ok:true,indexed_to_height:99,indexed_to_slot:127});
    if(path.endsWith('/indexer/transactions'))return answer({transactions:[]});
    if(path.endsWith('/indexer/holders'))return answer({holders:[],total_script_hashes_with_balance:0});
    throw new Error(`Unexpected request ${path}`);
  };
  const response=await handleExplore(url('overview','network=bloch'),{fetcher});
  assert.equal(response.status,200);
  assert.equal(response.body.head.height,100);
  assert.equal(response.body.health.indexed_to_height,99);
  assert.equal(response.body.corroboration.level,'final');
});

test('Bloch overview falls back to the verified indexer when the network head is unavailable', async () => {
  const fetcher=async input => {
    const path=new URL(input).pathname;
    if(path.endsWith('/api/v1/network'))throw new Error('timeout');
    if(path.endsWith('/indexer/health'))return answer({ok:true,indexed_to_height:99,indexed_to_slot:127,finalized_height:90,chain_tip:block});
    if(path.endsWith('/indexer/transactions'))return answer({transactions:[]});
    if(path.endsWith('/indexer/holders'))return answer({holders:[],total_script_hashes_with_balance:0});
    throw new Error(`Unexpected request ${path}`);
  };
  const response=await handleExplore(url('overview','network=bloch'),{fetcher});
  assert.equal(response.status,200);
  assert.equal(response.body.head.slot,127);
  assert.equal(response.body.head.block_id,block);
  assert.equal(response.body.corroboration.level,'indexer verified snapshot');
});
