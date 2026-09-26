import {emptyGraph,nodeId,ASSETS,validateGraph} from '../space/public/assets/graph-core.js';
export function spaceGraphFixture(asset='BLCH'){
  const network=ASSETS[asset].network,graph=emptyGraph(network,asset),kind=network==='bloch'?'script':'address';
  const refs=network==='bitcoin'?['1BoatSLRHtKNngkdXEeobR76b53LETtpyT','1BitcoinEaterAddressDontSendf59kuE']:network==='bloch'?['1'.repeat(64),'2'.repeat(64)]:['0x'+'1'.repeat(40),'0x'+'2'.repeat(40)];
  graph.nodes=refs.map(reference=>({id:nodeId(network,kind,reference),kind,reference}));const txid=(network==='ethereum'?'0x':'')+'3'.repeat(64),tx={id:nodeId(network,'transaction',txid),kind:'transaction',reference:txid};
  graph.observations=[{id:'synthetic-module-fixture',source:'SYNTHETIC BROWSER FIXTURE',scope:'Isolated module integration verification',at:'2026-09-24T12:00:00Z'}];
  const base={amount:'900719925474099312345',txid,sources:['synthetic-module-fixture'],block:{height:100,hash:(network==='ethereum'?'0x':'')+'4'.repeat(64),index:0,log:asset==='USDT'||asset==='USDC'?0:null},finality:'synthetic-test-only'};
  if(network==='ethereum')graph.edges=[{...base,id:'fixture-transfer',from:graph.nodes[0].id,to:graph.nodes[1].id,kind:['USDT','USDC'].includes(asset)?'erc20_transfer':'native_value'}];
  else{graph.nodes.push(tx);graph.edges=[{...base,id:'fixture-input',from:graph.nodes[0].id,to:tx.id,kind:'input'},{...base,id:'fixture-output',from:tx.id,to:graph.nodes[1].id,kind:'output'}];}
  return validateGraph(graph);
}
export function spaceDataFixture(network='bloch',route='overview'){
  const common={network,source:'SYNTHETIC BROWSER FIXTURE',retrieved_at:'2026-09-24T12:00:00Z',note:'Isolated integration verification only',independent_verification:false};
  const points=Array.from({length:72},(_,i)=>({at:Date.UTC(2026,8,24,0,i*10),connections:20+i%11,reporting_nodes:4}));
  const fee_history={oldest_height:'100',gas_used_ratio:Array.from({length:48},(_,i)=>.5+Math.sin(i)*.2),base_fee_wei:Array.from({length:49},(_,i)=>String(1000000000+i*1000000)),reward_wei:Array.from({length:48},()=>['1','2','3'])};
  const blocks=Array.from({length:30},(_,i)=>({height:130-i,id:(130-i).toString(16).padStart(64,'0'),timestamp:1790244000-i*600,tx_count:1000+i,size:1000000+i*1000,weight:4000000-i*500}));
  if(route==='graphus')return {...common,manifest:{initial_assets:[]},holders:{holders:[]},errors:[]};
  if(route==='validators')return {...common,validators:[],offset:0,next_offset:null,total:0};
  if(route==='series')return {...common,head:{height:'147'},range:'synthetic',requested:network==='bitcoin'?30:48,returned:network==='bitcoin'?30:network==='ethereum'?48:72,blocks,fee_history,points,valid_points:72,period:'24h'};
  if(route==='intelligence')return {...common,projection:[],recommended_fees_sat_vbyte:{},mempool_comparison:{}};
  if(network==='bitcoin')return {...common,head:blocks[0],recent_blocks:blocks,mempool:{count:100},fee_estimates_sat_vbyte:{'3':2}};
  if(network==='ethereum')return {...common,head:{number:'0x93',transactions:[],gasUsed:'0x100',gasLimit:'0x200'},finalized:{number:'0x92'},fee_history,gas_price_wei:'2000000000'};
  return {...common,head:{height:100,slot:200,finalized_height:99},health:{indexed_to_height:100},peer_history:{points}};
}
