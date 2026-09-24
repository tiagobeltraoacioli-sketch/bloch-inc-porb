import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {queryBalanceSample} from '../graphus/chain/balance-sample.js';
import {queryNetworkGraph} from '../graphus/chain/network-graph.js';
const require=createRequire(import.meta.url),S=require('../graphus/assets/network_session.js'),A=require('../graphus/assets/analytics_engine.js');
const hash=n=>n.toString(16).padStart(64,'0'),hex=n=>'0x'+hash(n),address=n=>'0x'+n.toString(16).padStart(40,'0');
const response=v=>new Response(JSON.stringify(v)),env={GRAPHUS_ETHEREUM_RPC_URL:'https://rpc.example/private-key'},now=()=>new Date('2026-09-24T14:00:00Z');
const page=(height=100,amount='9007199254740993')=>({status:'source-reported',asset:'ETH',network:'ethereum-mainnet',source:'rpc',retrieved_at:now().toISOString(),anchor:{height,hash:hex(height)},scope:{},coverage:'bounded',nodes:[{id:'a',kind:'address',address:address(1)},{id:'b',kind:'address',address:address(2)}],edges:[{from:'a',to:'b',kind:'native_value',event_id:`event:${height}`,txid:hex(height+1000),block_hash:hex(height),block_number:height,amount_base_units:amount,position:0}],next_cursor:String(height-1)});
test('collection deduplicates overlapping events and retains exact amounts and per-page source lineage',()=>{
  const a=S.merge(null,page()),again=S.merge(a,page());assert.equal(again.edges.length,1);assert.equal(again.added,0);assert.equal(again.snapshots.length,1);
  const older=S.merge(again,page(99));assert.equal(older.edges.length,2);assert.equal(older.anchor.height,100);assert.equal(older.snapshots.length,2);assert.equal(older.edges[0].amount_base_units,'9007199254740993');assert.equal(a.edges.length,1);
  assert.deepEqual(S.candidates(older).map(r=>r.address),[address(1),address(2)]);
  const imported=A.fromCollection({kind:'graphus_network_collection',schema_version:1,dataset:older});assert.equal(imported.edges[0].amount,'9007199254740993');assert.equal(imported.snapshots.length,2);assert.equal(imported.snapshots[1].anchor.height,99);
  assert.throws(()=>A.fromCollection({kind:'graphus_network_collection',schema_version:2,dataset:older}),/Invalid/);
});
test('collection refuses conflicting blocks, altered event values, mixed assets and capacity overflow',()=>{
  const a=S.merge(null,page());assert.throws(()=>S.merge(a,page(100,'1')),/Conflicting/);
  const reorg=page();reorg.anchor.hash=hex(999);assert.throws(()=>S.merge(a,reorg),/block changed/);
  const other=page();other.network='another-network';assert.throws(()=>S.merge(a,other),/mix/);
  let many=null;for(let i=0;i<32;i++)many=S.merge(many,page(100-i));assert.throws(()=>S.merge(many,page(1)),/capacity/);
});
function rpcFixture({reorg=false,failAddress=false,badChain=false,token=false}={}){
  const calls=[];return {calls,fetcher:async(url,init)=>{const call=JSON.parse(init.body);calls.push(call);let result;
    if(call.method==='eth_chainId')result=badChain?'0x2':'0x1';
    else if(call.method==='eth_getBlockByNumber')result={hash:hex(reorg&&call.params[0]!=='finalized'?101:100),number:'0x64',timestamp:'0x6b49d200',transactions:[],parentHash:hex(99)};
    else if(call.method==='eth_getBalance'){if(failAddress&&call.params[0]===address(2))return response({jsonrpc:'2.0',id:call.id,error:{message:'private upstream failure'}});result='0x20000000000001';}
    else if(call.method==='eth_call'){assert.equal(call.params[0].to,'0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');result=hex(9007199254740993n);}
    else throw Error(call.method);return response({jsonrpc:'2.0',id:call.id,result});}};
}
test('EVM balance batches pin one finalized block, preserve exact integers and disclose partial failures',async()=>{
  const f=rpcFixture({failAddress:true}),r=await queryBalanceSample({asset:'ETH',addresses:[address(1),address(2),address(1)],env,fetcher:f.fetcher,now});
  assert.equal(r.status,200);assert.equal(r.body.balances.length,1);assert.equal(r.body.balances[0].balance.base_units,'9007199254740993');assert.deepEqual(r.body.unavailable,[address(2)]);assert.equal(r.body.coverage.requested,2);assert.equal(r.body.coverage.same_block,true);
  assert.ok(f.calls.filter(c=>c.method==='eth_getBalance').every(c=>c.params[1]==='0x64'));
  assert.equal(JSON.stringify(r).includes('private-key'),false);assert.equal(JSON.stringify(r).includes('private upstream'),false);
  for(const opts of [{reorg:true},{badChain:true}])assert.equal((await queryBalanceSample({asset:'ETH',addresses:[address(1)],env,fetcher:rpcFixture(opts).fetcher})).status,502);
  const token=await queryBalanceSample({asset:'USDC',addresses:[address(1)],env,fetcher:rpcFixture().fetcher});assert.equal(token.status,200);assert.equal(token.body.balances[0].balance.decimals,6);
});
test('BTC balances use confirmed aggregates without inventing a shared block or replacing failures with zero',async()=>{
  const addr='1BoatSLRHtKNngkdXEeobR76b53LETtpyT';const fetcher=async()=>response({address:addr,chain_stats:{funded_txo_sum:123456789,spent_txo_sum:1,funded_txo_count:3,spent_txo_count:1}});
  const r=await queryBalanceSample({asset:'BTC',addresses:[addr],fetcher});assert.equal(r.body.anchor,null);assert.equal(r.body.coverage.same_block,false);assert.equal(r.body.balances[0].balance.base_units,'123456788');assert.equal(r.body.balances[0].balance.utxo_count,2);
  const fail=await queryBalanceSample({asset:'BTC',addresses:[addr],fetcher:async()=>response({})});assert.equal(fail.body.balances.length,0);assert.deepEqual(fail.body.unavailable,[addr]);
  for(const args of [{asset:'BLCH',addresses:[hash(1)]},{asset:'ETH',addresses:Array(17).fill(address(1))},{asset:'BTC',addresses:['../../secret']}])assert.equal((await queryBalanceSample(args)).status,400);
});
test('graph cursors validate format, finalize bounds and preserve Bloch snapshot identity',async()=>{
  for(const [asset,cursor] of [['ETH','1e3'],['ETH','-1'],['BLCH','anything']])assert.equal((await queryNetworkGraph({asset,cursor})).status,400);
  const future=await queryNetworkGraph({asset:'ETH',cursor:'101',env,fetcher:rpcFixture().fetcher});assert.equal(future.status,400);
  const bloom={transactions:[],as_of_height:100,as_of_slot:150,chain_tip:hash(100),verification:'consensus replay and state-root verification',next_cursor:null};
  const fetcher=async url=>response(url.endsWith('/health')?{ok:true,finalized_height:99}:bloom);
  const valid=await queryNetworkGraph({asset:'BLCH',cursor:`100-${hash(100)}-32`,fetcher});assert.equal(valid.status,200);
  const mismatch=await queryNetworkGraph({asset:'BLCH',cursor:`99-${hash(99)}-32`,fetcher});assert.equal(mismatch.status,502);
});
