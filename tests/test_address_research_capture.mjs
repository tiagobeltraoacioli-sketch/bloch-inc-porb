import assert from 'node:assert/strict';
import test from 'node:test';
import {handleResearch} from '../space/chain/address-research.js';
import {verifyResearch} from '../space/public/assets/address-research-core.js';

const reference='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40),hash='0x'+'a'.repeat(64),txid='0x'+'b'.repeat(64);
const contracts={USDT:'0xdac17f958d2ee523a2206206994597c13d831ec7',USDC:'0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'};
const transfer='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const indexed=value=>'0x'+value.slice(2).padStart(64,'0');
const url=asset=>new URL('https://bloch.space/api/research?'+new URLSearchParams({network:'ethereum',asset,query:reference}));
function source({logsFail=false,balanceFail=false}={}){
  const calls=[];
  const fetcher=async(_url,init)=>{
    assert.ok(init.signal);const request=JSON.parse(init.body);calls.push(request);let result;
    if(request.method==='eth_chainId')result='0x1';
    else if(request.method==='eth_getBlockByNumber')result={number:'0x64',hash,timestamp:'0x5'};
    else if(request.method==='eth_call'){
      if(balanceFail)return new Response(null,{status:503});result='0x'+'f'.repeat(64);
    }else if(request.method==='eth_getLogs'){
      if(logsFail)return new Response(null,{status:503});
      const filter=request.params[0];result=filter.topics[1]===null?[{address:filter.address,topics:[transfer,indexed(other),indexed(reference)],data:'0x'+'e'.repeat(64),blockNumber:'0x64',blockHash:hash,transactionHash:txid,transactionIndex:'0x0',logIndex:'0x0',removed:false}]:[];
    }else throw new Error('unexpected_rpc_method');
    return Response.json({jsonrpc:'2.0',id:request.id,result});
  };
  return {calls,fetcher};
}
const collect=(asset,fetcher)=>handleResearch(url(asset),{env:{GRAPHUS_ETHEREUM_RPC_URL:'https://rpc.example.test'},fetcher,now:()=> '2026-09-27T02:00:00Z'});

test('token ledger and graph consume one validated activity capture while balance keeps its own observation',async()=>{
  for(const asset of ['USDT','USDC']){
    const {calls,fetcher}=source(),response=await collect(asset,fetcher);assert.equal(response.status,200);
    const report=await verifyResearch(response.body),{ledger,graph}=report.modules;assert.equal(ledger.status,'available');assert.equal(graph.status,'available');
    const activity=ledger.data.token_activity,edge=graph.data.edges[0],observation=graph.data.observations[0];
    assert.equal(activity.contract,contracts[asset]);assert.equal(activity.activity.event_count,1);assert.equal(edge.amount,BigInt('0x'+'e'.repeat(64)).toString());assert.equal(edge.txid,txid);
    assert.equal(observation.at,activity.observation.retrieved_at);assert.deepEqual(observation.anchor,activity.observation.window_end_anchor);
    assert.equal(calls.filter(c=>c.method==='eth_getLogs').length,2,'Exactly one inbound and one outbound source call');assert.equal(calls.length,7,'Three balance calls and four activity calls');
    assert.equal(ledger.data.wallet.balance.base_units,BigInt('0x'+'f'.repeat(64)).toString());assert.match(report.coverage,/different anchors/);
  }
});
test('shared activity failure leaves the balance usable without an implicit retry; a new request collects again',async()=>{
  const failed=source({logsFail:true}),response=await collect('USDT',failed.fetcher);assert.equal(response.status,200);
  const m=response.body.modules;assert.equal(m.ledger.status,'available');assert.equal(m.ledger.data.token_activity,null);assert.equal(m.graph.status,'unavailable');assert.equal(m.machine_learning.status,'unavailable');
  assert.equal(failed.calls.filter(c=>c.method==='eth_getLogs').length,1,'A failed capture is shared without a hidden second attempt');
  const restored=source(),next=await collect('USDT',restored.fetcher);assert.equal(next.body.modules.graph.status,'available');assert.equal(restored.calls.length,7);
});
test('balance failures cannot hide token evidence and concurrent assets never share captures across requests',async()=>{
  const failed=source({balanceFail:true}),response=await collect('USDC',failed.fetcher);assert.equal(response.status,200);assert.equal(response.body.modules.ledger.status,'unavailable');assert.equal(response.body.modules.graph.status,'available');
  assert.equal(failed.calls.filter(c=>c.method==='eth_getLogs').length,2);
  const shared=source(),responses=await Promise.all(['USDT','USDC'].map(asset=>collect(asset,shared.fetcher)));assert.equal(shared.calls.length,14);
  for(const [i,asset]of ['USDT','USDC'].entries()){
    assert.equal(responses[i].body.scope.asset,asset);assert.equal(responses[i].body.modules.ledger.data.token_activity.contract,contracts[asset]);
    assert.equal(shared.calls.filter(c=>c.method==='eth_getLogs'&&c.params[0].address===contracts[asset]).length,2);
  }
});
