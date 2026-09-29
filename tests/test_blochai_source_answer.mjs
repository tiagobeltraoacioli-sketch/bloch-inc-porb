import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceBasedAnswer} from '../deploy/blochai-public/source-answer.js';

const guide={network:'bitcoin',title:'Wallet/address analysis',mode:'summary',status:'available',facts:[{label:'Observed address balance',value:'3463000859',unit:'sat'}],knowledge:[{text:'A public address does not establish wallet ownership.'}],sources:[{title:'Public address observation',status:'available',coverage:'Up to eight confirmed transactions; not complete history.',observed_at:null,retrieved_at:'2026-09-28T12:00:00Z'}]};
test('source answers preserve exact base units and distinguish coverage from interpretation',()=>{
  const output=sourceBasedAnswer(guide);
  assert.match(output,/Observed address balance: 3463000859 sat/);assert.match(output,/Up to eight confirmed transactions/);assert.match(output,/Observed: not recorded/);assert.match(output,/2026-09-28T12:00:00Z/);
  assert.doesNotMatch(output,/\$|34,630|verified by|block hash/i);
});
test('unavailable facts stay unknown and examples do not invent transactions',()=>{
  const output=sourceBasedAnswer({...guide,mode:'example',status:'unavailable',facts:[],sources:[]});
  assert.match(output,/Hypothetical reading exercise/);assert.match(output,/Missing data does not mean zero activity/);assert.match(output,/No live source was recorded/);assert.doesNotMatch(output,/3463000859/);
  assert.match(sourceBasedAnswer({...guide,mode:'checklist'}),/1\. A public address/);
  assert.match(sourceBasedAnswer(null),/saved source context is unavailable/);
});
test('computed explanations prioritize the selected topic and preserve partial-source qualifications',()=>{
  const insights=[
    {id:'exact_amount',title:'Exact units',text:'34.63000859 BTC; no price conversion.',status:'available'},
    {id:'source_freshness',title:'Source time',text:'Retrieval age is not chain age.',status:'partial'},
    {id:'graph_structure',title:'Sampled graph',text:'Two unique directed connections in the bounded sample.',status:'partial'},
    {id:'graph_degrees',title:'Sampled degrees',text:'No ownership or risk is inferred.',status:'available'},
  ];
  const original=structuredClone(insights);
  const graph=sourceBasedAnswer({...guide,question_id:'graph_analysis',insights});
  assert.match(graph,/Sampled graph \(partial\): Two unique directed connections/);
  assert.match(graph,/Sampled degrees: No ownership or risk is inferred/);
  assert.doesNotMatch(graph,/Exact units:/);
  const wallet=sourceBasedAnswer({...guide,question_id:'wallet_summary',insights});
  assert.match(wallet,/Exact units: 34\.63000859 BTC/);
  assert.match(wallet,/Source time \(partial\): Retrieval age is not chain age/);
  assert.deepEqual(insights,original);
});

test('saved answer selections cannot override current topic relevance or exact source facts',()=>{
  const current={...guide,network:'ethereum',question_id:'fees',facts:[{label:'Source gas price',value:'9007199254740993',unit:'wei/gas'}],answer_facts:[{label:'Invented transfer',value:'1000',unit:'ETH'}],answer_coverage:'No limits apply.'};
  const answer=sourceBasedAnswer(current);
  assert.match(answer,/Source gas price: 9007199254740993 wei\/gas/);
  assert.doesNotMatch(answer,/Invented transfer|1000 ETH|No limits apply/);
});
