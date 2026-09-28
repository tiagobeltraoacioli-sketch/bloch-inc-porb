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
