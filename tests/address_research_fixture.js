import {emptyGraph,nodeId,ASSETS,validateGraph} from '../space/public/assets/graph-core.js';
import {handleResearch} from '../space/chain/address-research.js';
export const RESEARCH_AMOUNT='900719925474099312345';
export function researchFixture(asset='USDT',{count=12,reference,fanout=false,repeated=0,self=false}={}){
  const network=ASSETS[asset].network,kind=network==='bloch'?'script':'address',graph=emptyGraph(network,asset);
  const refs=Array.from({length:count},(_,i)=>network==='bitcoin'?'1'+'ABCDEFGHJKLMNPQRSTUVWXYZ'[i].repeat(26):(network==='ethereum'?'0x':'')+(i+1).toString(16).padStart(network==='ethereum'?40:64,'0'));
  if(reference)refs[0]=reference;
  graph.nodes=refs.map(reference=>({id:nodeId(network,kind,reference),kind,reference}));
  graph.observations=[{id:'synthetic-address-research',source:'SYNTHETIC ADDRESS RESEARCH FIXTURE',scope:`Isolated tests only; ${count} comparable references`,at:'2026-09-26T12:00:00Z',anchor:{height:100,hash:(network==='ethereum'?'0x':'')+'f'.repeat(64)}}];
  for(let i=1;i<count;i++){
    const txid=(network==='ethereum'?'0x':'')+(i+100).toString(16).padStart(64,'0'),tx=nodeId(network,'transaction',txid),base={amount:RESEARCH_AMOUNT,txid,sources:['synthetic-address-research'],block:{height:100,hash:(network==='ethereum'?'0x':'')+'f'.repeat(64),index:i,log:network==='ethereum'&&asset!=='ETH'?i:null},finality:'synthetic-only'};
    if(network==='ethereum')graph.edges.push({...base,id:'event-'+i,from:graph.nodes[fanout||i<8?0:i-1].id,to:graph.nodes[i].id,kind:asset==='ETH'?'native_value':'erc20_transfer'});
    else{graph.nodes.push({id:tx,kind:'transaction',reference:txid});graph.edges.push({...base,id:'input-'+i,from:graph.nodes[i<8?0:i-1].id,to:tx,kind:'input'},{...base,id:'output-'+i,from:tx,to:graph.nodes[i].id,kind:'output'});}
  }
  if(network==='ethereum'&&graph.edges.length){
    for(let i=0;i<repeated;i++){const txid='0x'+(i+10000).toString(16).padStart(64,'0');graph.edges.push({...graph.edges[0],id:'repeated-'+i,txid,block:{...graph.edges[0].block,index:i+10000,log:i+10000}});}
    if(self)graph.edges.push({...graph.edges[0],id:'self-event',to:graph.nodes[0].id,amount:'0',txid:'0x'+'e'.repeat(64),block:{height:null,hash:null,index:null,log:null}});
  }
  const data={network,source:'SYNTHETIC ADDRESS RESEARCH FIXTURE',retrieved_at:'2026-09-26T12:00:00Z',note:'Separate synthetic ledger snapshot',independent_verification:false,wallet:{network:network+'-mainnet',asset,address:refs[0],balance:{base_units:RESEARCH_AMOUNT,unit:asset==='ETH'?'wei':asset==='USDT'||asset==='USDC'?'token base units':'sat',scope:'synthetic-record',block:null},activity:{confirmed_tx_count:7},observation:{source_id:'synthetic-ledger',coverage:'Test balance at a separate observation',retrieved_at:'2026-09-26T11:00:00Z',limitations:[]},nodes:[],edges:[]},utxos:null,token_activity:null};
  return {graph:validateGraph(graph),data,reference:refs[0],network,asset};
}
export async function researchReport(asset='USDT',options={}){
  const fixture=researchFixture(asset,options),url=new URL('https://bloch.space/api/research?'+new URLSearchParams({network:fixture.network,asset,query:fixture.reference}));
  return handleResearch(url,{explore:async()=>({status:options.ledgerUnavailable?503:200,body:fixture.data}),graph:async()=>({status:options.graphUnavailable?502:200,body:fixture.graph}),now:()=> '2026-09-26T12:01:00Z'});
}
