import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyGraph,nodeId,validateGraph,mergeGraph,parseAmount,formatAmount,filterGraph,analyzeGraph,findPaths,compareGraphs,evidenceCSV,graphML,LIMITS} from '../space/public/assets/graph-core.js';
import {bitcoinTransactions,blochTransaction,blochHistory,ethereumTransaction,tokenLogs,handleGraph} from '../space/chain/graph.js';

const hash=n=>n.toString(16).padStart(64,'0'),address=n=>'0x'+n.toString(16).padStart(40,'0'),tx=n=>'0x'+hash(n),at='2026-09-24T12:00:00.000Z';
const btc=['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa','1BoatSLRHtKNngkdXEeobR76b53LETtpyT'];
function graphOf(rows,extra=[]){
  const graph=emptyGraph('ethereum','ETH'),ids=[...new Set([...rows.flatMap(([a,b])=>[a,b]),...extra])];
  graph.nodes=ids.map(n=>({id:nodeId('ethereum','address',address(n)),kind:'address',reference:address(n)}));
  graph.observations=[{id:'fixture',source:'Test fixture only',scope:'Algorithm verification, never public source data',at,anchor:null}];
  graph.edges=rows.map(([a,b,height=1,index=0,amount='100'],i)=>({id:`edge-${i}`,from:nodeId('ethereum','address',address(a)),to:nodeId('ethereum','address',address(b)),kind:'native_value',amount,txid:tx(i+100),sources:['fixture'],block:{height,hash:tx(height+900),index,log:null},finality:'test'}));
  return validateGraph(graph);
}
const id=n=>nodeId('ethereum','address',address(n));
test('integer amounts retain all base units and reject imprecise filters',()=>{
  const amount=parseAmount('9007199254740993.123456789012345678','ETH');assert.equal(amount,'9007199254740993123456789012345678');
  assert.equal(formatAmount(amount,'ETH'),'9,007,199,254,740,993.123456789012345678');
  assert.throws(()=>parseAmount('0.0000001','USDT'));assert.throws(()=>parseAmount('1e20','BTC'));assert.throws(()=>parseAmount('-1','BLCH'));
});
test('UTXO records retain transaction boundaries, coinbase has no invented sender',()=>{
  const record={txid:hash(1),status:{confirmed:true,block_height:100,block_hash:hash(100)},vin:[{prevout:{scriptpubkey_address:btc[0],value:1000}}],vout:[{scriptpubkey_address:btc[1],value:900}]};
  const graph=bitcoinTransactions([record]);assert.equal(graph.nodes.length,3);assert.equal(graph.edges[0].to,graph.edges[1].from);assert.equal(graph.edges[0].kind,'input');assert.equal(graph.edges[1].amount,'900');
  const forged=structuredClone(graph);forged.edges[0].txid=hash(2);assert.throws(()=>validateGraph(forged),/transaction node/);
  const coinbase=bitcoinTransactions([{...record,vin:[{is_coinbase:true}]}]);assert.equal(coinbase.edges.length,1);assert.equal(coinbase.edges[0].kind,'output');
  const unconfirmed=bitcoinTransactions([{...record,status:{confirmed:false}}]);assert.equal(unconfirmed.edges.length,0);
});
test('source pages disclose truncation and reject unsafe amounts',()=>{
  const record={txid:hash(1),status:{confirmed:true,block_height:1,block_hash:hash(100)},vin:[],vout:Array.from({length:40},()=>({scriptpubkey_address:btc[0],value:100}))};
  const graph=bitcoinTransactions([record]);assert.equal(graph.edges.length,32);assert.match(graph.warnings[0],/8 input\/output/);
  assert.throws(()=>bitcoinTransactions([{...record,vout:[{scriptpubkey_address:btc[0],value:Number.MAX_SAFE_INTEGER+1}]}]));
});
test('Bloch transaction and history observations deduplicate the same outpoint edge',()=>{
  const txid=hash(3),script=hash(10),block=hash(20);
  const full=blochTransaction({source:'Test',note:'Test source',retrieved_at:at,transaction:{txid,height:20,index:3,block_id:block,inputs:[],outputs:[{txid,vout:0,script_hash:script,value_sat:'500'}]}});
  const history=blochHistory({address:script,observation:{source_id:'Test history',coverage:'Bounded test',retrieved_at:at,history:{next_cursor:'older'}},nodes:[{id:'script',kind:'script_hash',address:script},{id:'tx',kind:'transaction',txid}],edges:[{from:'tx',to:'script',kind:'observed_created_output',amount_base_units:'500',txid,outpoint:{txid,vout:0},block:{height:20,hash:block}}]});
  const merged=mergeGraph(history,full);assert.equal(merged.edges.length,1);assert.equal(merged.edges[0].sources.length,2);assert.equal(merged.edges[0].block.index,3);
});
test('merges are atomic, preserve sources, and reject conflicting chain views',()=>{
  const first=graphOf([[1,2,1,0,'42']]),second=structuredClone(first);second.observations[0].id='second';second.edges[0].sources=['second'];
  const merged=mergeGraph(first,second);assert.equal(merged.edges.length,1);assert.equal(merged.edges[0].sources.length,2);assert.equal(first.observations.length,1);
  second.edges[0].amount='43';assert.throws(()=>mergeGraph(first,second),/Conflicting event/);assert.equal(first.edges[0].amount,'42');
  second.edges[0].amount='42';second.edges[0].id='different';second.edges[0].block.hash=tx(999);assert.throws(()=>mergeGraph(first,second),/Conflicting transaction anchors|Conflicting block anchors/);
  const capped={...emptyGraph('ethereum','ETH'),nodes:Array.from({length:LIMITS.nodes},(_,i)=>({id:id(i+1),kind:'address',reference:address(i+1)}))};
  const one={...emptyGraph('ethereum','ETH'),nodes:[{id:id(10000),kind:'address',reference:address(10000)}]};assert.throws(()=>mergeGraph(capped,one),/5000 nodes/);assert.equal(capped.nodes.length,5000);
  assert.throws(()=>mergeGraph(first,emptyGraph('bitcoin','BTC')),/separate workspace/);
});
test('imports reject unattached evidence, invalid kinds, and conflicting transaction anchors',()=>{
  const graph=graphOf([[1,2],[2,3]]);let bad=structuredClone(graph);bad.edges[0].sources=['missing'];assert.throws(()=>validateGraph(bad),/provenance/);
  bad=structuredClone(graph);bad.edges[0].kind='erc20_transfer';assert.throws(()=>validateGraph(bad),/Asset/);
  bad=structuredClone(graph);bad.edges[1].txid=bad.edges[0].txid;bad.edges[1].block.index=2;assert.throws(()=>validateGraph(bad),/transaction anchors/);
  bad=structuredClone(graph);bad.edges[0].amount='1.5';assert.throws(()=>validateGraph(bad),/Invalid evidence/);
});
test('degree, PageRank, components, cycles and k-core distinguish repeated events',()=>{
  const graph=graphOf([[1,2],[2,3],[3,1],[3,4],[1,2]],[5]),stats=analyzeGraph(graph),by=new Map(stats.ranking.map(n=>[n.id,n]));
  assert.equal(stats.components,2);assert.deepEqual(stats.componentSizes,[4,1]);assert.equal(stats.cycleGroups,1);
  assert.equal(by.get(id(1)).degree,2);assert.equal(by.get(id(1)).outgoing,2);assert.equal(by.get(id(1)).core,2);assert.equal(by.get(id(4)).core,1);assert.equal(by.get(id(5)).core,0);
  assert.ok(Math.abs(stats.ranking.reduce((s,n)=>s+n.rank,0)-1)<1e-9);assert.equal(stats.types[0].amount,'500');
  const loop=analyzeGraph(graphOf([[1,1]]));assert.equal(loop.cycleGroups,1);assert.equal(loop.ranking[0].degree,0);
});
test('block, amount and directional neighborhood filters use exact loaded edges',()=>{
  const graph=graphOf([[1,2,1,0,'9007199254740993'],[2,3,2,0,'9007199254740992'],[4,1,1,1,'4']]);
  assert.equal(filterGraph(graph,{minimum:'9007199254740993'}).edges.length,1);
  assert.equal(filterGraph(graph,{minBlock:2}).edges.length,1);
  const ego=filterGraph(graph,{focus:id(1),hops:1,direction:'outgoing'});assert.deepEqual(ego.nodes.map(n=>n.id),[id(1),id(2)]);
});
test('path search is directed, bounded and conservative about event order',()=>{
  const graph=graphOf([[1,2,2,0],[2,3,1,0],[1,4,1,0],[4,3,2,1]]);
  assert.equal(findPaths(graph,id(1),id(3)).paths.length,2);assert.equal(findPaths(graph,id(3),id(1)).paths.length,0);
  const ordered=findPaths(graph,id(1),id(3),{temporal:true});assert.equal(ordered.paths.length,1);assert.equal(ordered.paths[0][0].to,id(4));
  const unknown=graphOf([[1,2],[2,3]]);unknown.edges.forEach(e=>e.block.index=null);assert.equal(findPaths(unknown,id(1),id(3),{temporal:true}).paths.length,0);
  assert.equal(findPaths(graph,id(1),id(3),{maxHops:1}).paths.length,0);
  assert.equal(findPaths(graph,id(1),id(3),{budget:1}).truncated,true);
});
test('UTXO ordered paths allow an input and output in the same transaction',()=>{
  const graph=bitcoinTransactions([{txid:hash(1),status:{confirmed:true,block_height:1,block_hash:hash(10)},vin:[{prevout:{scriptpubkey_address:btc[0],value:100}}],vout:[{scriptpubkey_address:btc[1],value:99}]}]);
  assert.equal(findPaths(graph,nodeId('bitcoin','address',btc[0]),nodeId('bitcoin','address',btc[1]),{temporal:true}).paths.length,1);
});
test('exports neutralize CSV formulas and escape GraphML; snapshot changes describe loaded edges',()=>{
  const graph=graphOf([[1,2]]);graph.edges[0].id='=HYPERLINK("https://example.invalid")';assert.match(evidenceCSV(graph),/"'=HYPERLINK\(""/);assert.ok(graphML(graph).includes('&quot;'));
  const after=structuredClone(graph);after.edges[0].amount='200';const difference=compareGraphs(graph,after);assert.equal(difference.changed.length,1);assert.match(difference.note,/not proof/);
});
test('Ethereum failed or unmatched receipts withhold transfer edges',()=>{
  const base={source:'Test RPC',note:'Test scope',retrieved_at:at,transaction:{hash:tx(1),from:address(1),to:address(2),value:'0x5',blockNumber:'0x1',blockHash:tx(100),transactionIndex:'0x0'},receipt_status:'available',receipt:{status:'0x1'},position:{finality_relation:'test'},token_transfers:[]};
  assert.equal(ethereumTransaction(base).edges[0].amount,'5');
  assert.equal(ethereumTransaction({...base,receipt_status:'inconsistent'}).edges.length,0);
  assert.equal(ethereumTransaction({...base,receipt:{status:'0x0'}}).edges.length,0);
  assert.equal(ethereumTransaction({...base,transaction:{...base.transaction,value:'0x0'}}).edges[0].kind,'executed_transaction');
});
const transfer='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',contract='0xdac17f958d2ee523a2206206994597c13d831ec7';
const log={address:contract,topics:[transfer,'0x'+address(1).slice(2).padStart(64,'0'),'0x'+address(2).slice(2).padStart(64,'0')],data:tx(500),transactionHash:tx(4),blockNumber:'0x64',blockHash:tx(100),transactionIndex:'0x0',logIndex:'0x1',removed:false};
test('token events preserve exact units and reject removed, duplicated or conflicting anchors',()=>{
  const head={number:'0x64',hash:tx(100)};assert.equal(tokenLogs([log],'USDT',head,at).edges[0].amount,'500');
  assert.throws(()=>tokenLogs([{...log,removed:true}],'USDT',head));assert.throws(()=>tokenLogs([log,log],'USDT',head),/duplicate/);
  assert.throws(()=>tokenLogs([{...log,blockHash:tx(101)}],'USDT',head),/anchor/);
  assert.throws(()=>tokenLogs([log,{...log,logIndex:'0x2',transactionIndex:'0x1'}],'USDT',head),/transaction anchors/);
});
test('API rejects arbitrary sources, duplicate parameters and malformed cursors before I/O',async()=>{
  let calls=0;const fetcher=()=>{calls++;throw new Error('unexpected I/O');};
  for(const query of ['network=bitcoin&asset=ETH','network=bitcoin&network=bitcoin','network=bitcoin&url=https://example.invalid','network=bloch&kind=address&query=wrong',`network=ethereum&asset=USDT&kind=address&query=${address(1)}&cursor=-1`])assert.equal((await handleGraph(new URL('https://bloch.space/api/graph?'+query),{fetcher})).status,400);
  assert.equal(calls,0);
});
test('native ETH address capability is explicit and performs no invented history call',async()=>{
  const result=await handleGraph(new URL(`https://bloch.space/api/graph?network=ethereum&kind=address&query=${address(1)}`),{fetcher:()=>{throw new Error('unexpected request');}});
  assert.equal(result.status,200);assert.equal(result.body.edges.length,0);assert.match(result.body.warnings[0],/history is unavailable/);
});
test('Bitcoin address history passes only a validated cursor to the fixed source',async()=>{
  let called='';const result=await handleGraph(new URL(`https://bloch.space/api/graph?network=bitcoin&kind=address&query=${btc[0]}&cursor=${hash(1)}`),{fetcher:async url=>{called=String(url);return Response.json([]);}});
  assert.equal(result.status,200);assert.equal(called,`https://blockstream.info/api/address/${btc[0]}/txs/chain/${hash(1)}`);assert.equal(result.body.nodes.length,1);
});
test('recent finalized token windows match every log to chained source headers',async()=>{
  const fetcher=async(_url,init)=>{const {method,params}=JSON.parse(init.body);let result;if(method==='eth_chainId')result='0x1';else if(method==='eth_getLogs')result=[log];else{const n=params[0]==='finalized'?100:Number(BigInt(params[0]));result={number:'0x'+n.toString(16),hash:tx(n),parentHash:tx(n-1)};}return Response.json({jsonrpc:'2.0',id:1,result});};
  const url=new URL('https://bloch.space/api/graph?network=ethereum&asset=USDT');const result=await handleGraph(url,{fetcher,env:{GRAPHUS_ETHEREUM_RPC_URL:'https://example.invalid'}});assert.equal(result.status,200);assert.equal(result.body.edges.length,1);
  const inconsistent=async(url,init)=>{const r=await fetcher(url,init),body=await r.json();if(JSON.parse(init.body).method==='eth_getLogs')body.result=[{...log,blockHash:tx(101)}];return Response.json(body);};assert.equal((await handleGraph(url,{fetcher:inconsistent,env:{GRAPHUS_ETHEREUM_RPC_URL:'https://example.invalid'}})).status,502);
});
