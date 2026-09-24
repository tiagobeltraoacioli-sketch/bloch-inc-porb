import test from 'node:test';
import assert from 'node:assert/strict';
import {queryNetworkGraph} from '../graphus/chain/network-graph.js';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),A=require('../graphus/assets/analytics_engine.js');
const hash=n=>n.toString(16).padStart(64,'0'),hex=n=>'0x'+hash(n),address=n=>'0x'+n.toString(16).padStart(40,'0');
const now=()=>new Date('2026-09-24T13:00:00Z'),response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
function blochFixture(change=()=>{}){
  const page={as_of_slot:120,as_of_height:100,chain_tip:hash(100),verification:'consensus replay and state-root verification',next_cursor:'next',
    transactions:[{txid:hash(1),block_id:hash(98),slot:115,height:98,
      inputs:[{txid:hash(2),vout:0,script_hash:hash(10),value_sat:'9007199254740993'}],
      outputs:[{txid:hash(1),vout:0,script_hash:hash(20),value_sat:'9007199254740992'}]}]};
  change(page);return async url=>response(url.endsWith('/health')?{ok:true,finalized_height:99}:page);
}
test('Bloch recent graph preserves exact amounts, outpoints, transaction nodes and anchor metadata',async()=>{
  const result=await queryNetworkGraph({asset:'BLCH',fetcher:blochFixture(),now});assert.equal(result.status,200);
  assert.equal(result.body.edges.length,2);assert.equal(result.body.edges[0].amount_base_units,'9007199254740993');
  assert.deepEqual(result.body.edges[0].outpoint,{txid:hash(2),vout:0});
  assert.equal(result.body.nodes.filter(n=>n.kind==='transaction').length,1);
  const normalized=A.normalize(result.body);assert.equal(normalized.edges[0].block_hash,hash(98));
  assert.equal(normalized.anchor.height,100);assert.equal(normalized.scope.has_more,true);
  assert.equal(A.analyze(normalized).groups.length,2);
});
test('Bloch excludes unfinalized transactions and rejects malformed or repeated observations',async()=>{
  const pending=await queryNetworkGraph({asset:'BLCH',fetcher:blochFixture(p=>p.transactions[0].height=100),now});
  assert.equal(pending.status,200);assert.equal(pending.body.edges.length,0);assert.equal(pending.body.scope.not_finalized_omitted,1);
  for(const change of [p=>p.transactions.push(p.transactions[0]),p=>p.transactions[0].outputs[0].txid=hash(2),p=>p.transactions[0].inputs[0].value_sat='1.5']){
    const r=await queryNetworkGraph({asset:'BLCH',fetcher:blochFixture(change),now});assert.equal(r.status,502);
  }
});
test('an unavailable Bloch health source preserves indexed facts with unknown finality',async()=>{
  const fetcher=blochFixture();
  const result=await queryNetworkGraph({asset:'BLCH',fetcher:(url,init)=>url.endsWith('/health')?Promise.reject(new Error('offline')):fetcher(url,init),now});
  assert.equal(result.status,200);assert.equal(result.body.edges.length,2);assert.equal(result.body.scope.finality_available,false);
  assert.equal('finalized_height' in result.body.anchor,false);assert.match(result.body.coverage,/finality status unavailable/);
});
test('Bloch retains large consolidation input sets while enforcing the graph reference budget',async()=>{
  const fetcher=blochFixture(page=>{page.transactions[0].inputs=Array.from({length:1500},(_,i)=>({txid:hash(i+100),vout:0,script_hash:hash(i+1000),value_sat:'1'}));});
  const result=await queryNetworkGraph({asset:'BLCH',fetcher,now});assert.equal(result.status,200);
  assert.ok(result.body.edges.length>1000);assert.ok(result.body.nodes.length<=1200);assert.ok(result.body.scope.endpoint_records_omitted>0);
  assert.ok(A.normalize(result.body).edges.length>1000);
});
function bitcoinFixture({orphan=false,wrongBlock=false,large=false}={}){
  const blocks=[102,101,100].map(n=>({id:hash(n),height:n,timestamp:1800000000,tx_count:1,previousblockhash:hash(n-1)}));
  const row={txid:hash(1),status:{confirmed:true,block_height:100,block_hash:hash(wrongBlock?99:100)},
    vin:[{is_coinbase:true}],vout:Array.from({length:large?30:1},()=>({scriptpubkey_address:'1BoatSLRHtKNngkdXEeobR76b53LETtpyT',value:123456789}))};
  return async url=>response(url.endsWith('/blocks')?blocks:url.endsWith('/status')?{in_best_chain:!orphan}:[row]);
}
test('Bitcoin preserves coinbase output evidence, omits unknown sender and checks canonical membership',async()=>{
  const result=await queryNetworkGraph({asset:'BTC',fetcher:bitcoinFixture(),now});assert.equal(result.status,200);
  assert.equal(result.body.edges.length,1);assert.equal(result.body.edges[0].kind,'created_output');assert.equal(result.body.scope.endpoint_records_omitted,1);
  assert.equal(A.analyze(A.normalize(result.body)).connections,1);
  for(const opts of [{orphan:true},{wrongBlock:true}])assert.equal((await queryNetworkGraph({asset:'BTC',fetcher:bitcoinFixture(opts),now})).status,502);
  const capped=await queryNetworkGraph({asset:'BTC',fetcher:bitcoinFixture({large:true}),now});assert.equal(capped.body.edges.length,24);assert.equal(capped.body.scope.endpoint_records_omitted,7);
});
const contracts={USDT:'0xdac17f958d2ee523a2206206994597c13d831ec7',USDC:'0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'};
const transfer='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
function ethereumFixture(asset,{badReceipt=false,failed=false,reorg=false,duplicate=false,badChain=false,logsCount=2}={}){
  let blockReads=0;
  return async (url,init)=>{
    const call=JSON.parse(init.body),{method,params}=call;let result;
    if(method==='eth_chainId')result=badChain?'0x2':'0x1';
    else if(method==='eth_getBlockByNumber'){
      const height=params[0]==='finalized'?100:Number(BigInt(params[0]));blockReads++;
      result={number:'0x'+height.toString(16),hash:hex(reorg&&blockReads>1&&height===100?999:height),parentHash:hex(height-1),timestamp:'0x6b49d200',
        transactions:asset==='ETH'?[{hash:hex(1),from:address(1),to:address(2),value:'0x20000000000001',blockHash:hex(100),blockNumber:'0x64',transactionIndex:'0x0'}]:[]};
    }else if(method==='eth_getTransactionReceipt')result={transactionHash:hex(1),blockHash:hex(badReceipt?99:100),blockNumber:'0x64',transactionIndex:'0x0',status:failed?'0x0':'0x1'};
    else if(method==='eth_getLogs'){
      result=Array.from({length:logsCount},(_,i)=>({removed:false,address:contracts[asset],topics:[transfer,hex(1),hex(i===1?1:2)],data:hex(9007199254740993n),blockHash:hex(100),blockNumber:'0x64',transactionHash:hex(i+1),transactionIndex:'0x'+i.toString(16),logIndex:'0x'+i.toString(16)}));
      if(duplicate)result.push(result[0]);
    }else throw new Error(method);
    return response({jsonrpc:'2.0',id:call.id,result});
  };
}
const env={GRAPHUS_ETHEREUM_RPC_URL:'https://rpc.example.test/private-key'};
test('native ETH network graph requires successful anchored receipts and exact direct value',async()=>{
  const result=await queryNetworkGraph({asset:'ETH',env,fetcher:ethereumFixture('ETH'),now});assert.equal(result.status,200);
  assert.equal(result.body.edges[0].amount_base_units,'9007199254740993');assert.equal(result.body.scope.internal_calls_included,false);
  assert.equal(JSON.stringify(result).includes('private-key'),false);
  const failed=await queryNetworkGraph({asset:'ETH',env,fetcher:ethereumFixture('ETH',{failed:true}),now});assert.equal(failed.body.edges.length,0);assert.equal(failed.body.scope.failed_transactions_omitted,1);
  for(const options of [{badReceipt:true},{reorg:true},{badChain:true}])assert.equal((await queryNetworkGraph({asset:'ETH',env,fetcher:ethereumFixture('ETH',options),now})).status,502);
});
test('USDT and USDC logs stay contract-scoped and preserve self transfers once',async()=>{
  for(const asset of ['USDT','USDC']){
    const result=await queryNetworkGraph({asset,env,fetcher:ethereumFixture(asset),now});assert.equal(result.status,200);
    assert.equal(result.body.scope.contract,contracts[asset]);assert.equal(result.body.edges.length,2);
    assert.equal(result.body.edges[1].from,result.body.edges[1].to);
    assert.equal(result.body.edges[0].amount_base_units,'9007199254740993');
    assert.equal(A.analyze(A.normalize(result.body)).groups[0].amount,'18014398509481986');
    assert.equal((await queryNetworkGraph({asset,env,fetcher:ethereumFixture(asset,{duplicate:true}),now})).status,502);
  }
});
test('dense token responses disclose the cap and keep all returned graph records internally bounded',async()=>{
  const result=await queryNetworkGraph({asset:'USDC',env,fetcher:ethereumFixture('USDC',{logsCount:600}),now});
  assert.equal(result.status,200);assert.equal(result.body.edges.length,512);assert.equal(result.body.scope.source_logs,600);assert.equal(result.body.scope.truncated,true);
});
test('unsupported assets, missing configuration and excessive source bodies fail without fixture fallback',async()=>{
  assert.equal((await queryNetworkGraph({asset:'SOL'})).status,400);
  assert.equal((await queryNetworkGraph({asset:'ETH',env:{}})).status,503);
  const result=await queryNetworkGraph({asset:'BTC',fetcher:async()=>new Response('{}',{headers:{'content-length':String(4*1024*1024)}})});
  assert.equal(result.status,502);assert.equal(result.body.error,'source_response_too_large');assert.equal('nodes' in result.body,false);
});
