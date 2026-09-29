import test from 'node:test';
import assert from 'node:assert/strict';
import {ANSWER_TOPIC_PROFILES,selectAnswerEvidence} from '../deploy/blochai-public/answer-evidence.js';
import {KNOWLEDGE} from '../deploy/blochai-public/knowledge.js';
import {buildPublicGuide,compactObservations} from '../deploy/blochai-public/chain-guide.js';
import {sourceBasedAnswer} from '../deploy/blochai-public/source-answer.js';

const source=(id,status='available')=>({id,title:id,status,url:'https://bloch.space/api/overview?network=bloch',observed_at:'2026-09-28T12:00:00Z',retrieved_at:'2026-09-28T12:01:00Z',coverage:'A bounded source snapshot.'});
const fact=(label,value='1',unit='records',source_id='network_overview')=>({label,value,unit,source_id});
const context=overrides=>({network:'bloch',subject:null,mode:'summary',question_id:'validators',status:'available',sources:[source('network_overview'),source('network_graph'),source('validator_counts')],facts:[],transactions:[],graph:{nodes:[],edges:[]},coverage:'Bounded public observations.',observed_at:null,...overrides});

test('every approved public topic has an explicit evidence profile',()=>{
  for(const entry of Object.values(KNOWLEDGE))for(const id of Object.keys(entry.topics))assert.ok(Object.hasOwn(ANSWER_TOPIC_PROFILES,id),id);
});

test('validator facts win over earlier network facts and retain exact values and original ordering',()=>{
  const irrelevant=Array.from({length:20},(_,i)=>fact('Observed head height',String(i),'blocks'));
  const validators=[fact('Source validator count','139','validators','validator_counts'),fact('Source active validators','130','validators','validator_counts'),fact('Source active stake','9007199254740993123','sat','validator_counts'),fact('Validator observation height','100','blocks','validator_counts'),fact('Validator observation slot','150','slots','validator_counts')];
  const guide=context({facts:[...irrelevant,...validators]}),before=structuredClone(guide);
  assert.deepEqual(selectAnswerEvidence(guide).facts,validators.slice(0,4));
  assert.equal(selectAnswerEvidence({...guide,mode:'explain'}).facts.length,5);
  assert.deepEqual(guide,before);
  const answer=sourceBasedAnswer(guide);
  assert.match(answer,/Source active stake: 9007199254740993123 sat/);
  assert.match(answer,/Source: validator_counts \[validator_counts\] \(available\)/);
  assert.doesNotMatch(answer,/Observed head height:/);
});

test('the selected topic changes evidence while preserving the same complete source snapshot',()=>{
  const facts=[fact('Observed head height','100','blocks'),fact('Displayed graph references','40','references','network_graph'),fact('Displayed graph records','80','records','network_graph'),fact('Source active validators','130','validators','validator_counts'),fact('Source next base fee','1500','millisat/gas')];
  const guide=context({facts}),before=structuredClone(facts);
  assert.deepEqual(selectAnswerEvidence({...guide,question_id:'graph_analysis'}).facts.map(row=>row.label),['Displayed graph references','Displayed graph records']);
  assert.deepEqual(selectAnswerEvidence({...guide,question_id:'fees'}).facts,[facts[4]]);
  assert.deepEqual(selectAnswerEvidence({...guide,question_id:'validators'}).facts,[facts[3]]);
  assert.deepEqual(facts,before);
});

test('summary and detailed modes bound selected facts without truncating the complete guide',()=>{
  const labels=['Declared transaction value','Transaction input records','Transaction output records','Transaction fee','Derived execution gas fee','Derived blob gas fee','Transaction height','Transaction slot','Reported confirmations','Reported finalized height','Execution gas used'];
  const facts=labels.map((label,index)=>fact(label,String(index))),input=context({question_id:'transaction_analysis',subject:{kind:'transaction',value:'a'.repeat(64)},facts});
  assert.equal(selectAnswerEvidence(input).facts.length,4);
  for(const mode of ['explain','checklist','example'])assert.equal(selectAnswerEvidence({...input,mode}).facts.length,8);
  assert.equal(input.facts.length,11);
});

test('fee selection is network-specific and never changes exact base units or decimal estimates',()=>{
  const facts=[fact('Observed head height','100','blocks'),fact('Source gas price','9007199254740993','wei/gas'),fact('Source next base fee','1500','millisat/gas'),fact('Source fee estimate for 3 blocks','1.25','sat/vbyte')];
  for(const [network,expected] of [['bitcoin',facts[3]],['ethereum',facts[1]],['bloch',facts[2]]]){
    const selected=selectAnswerEvidence(context({question_id:'fees',network,facts}));
    assert.deepEqual(selected.facts,[expected]);
    assert.match(sourceBasedAnswer(context({question_id:'fees',network,facts})),new RegExp(expected.value.replace('.','\\.')+' '+expected.unit));
  }
});

test('explicit attribution requires one available or partial live source, with legacy attribution visibly absent',()=>{
  const named=source('address_observation'),legacy={label:'Observed address balance',value:'17',unit:'sat'};
  const guide=context({question_id:'wallet_summary',network:'bitcoin',subject:{kind:'address',value:'public-address'},sources:[named,source('partial','partial'),source('offline','unavailable'),source('manual','reference')],facts:[
    fact('Observed address balance','1','sat','missing'),fact('Observed address balance','2','sat','offline'),fact('Observed address balance','3','sat','manual'),
    fact('Observed address balance','4','sat','partial'),fact('Observed address balance','5','sat','address_observation'),legacy,
  ]});
  const selected=selectAnswerEvidence(guide);
  assert.deepEqual(selected.facts.map(row=>row.value),['4','5','17']);
  assert.match(selected.limitations.join(' '),/partial source/);assert.match(selected.limitations.join(' '),/legacy facts/);
  const answer=sourceBasedAnswer(guide);
  assert.match(answer,/Observed address balance: 17 sat\. Per-fact source attribution: not recorded/);
  assert.doesNotMatch(answer,/Observed address balance: [123] sat/);
  assert.deepEqual(selectAnswerEvidence({...guide,sources:[named,{...named}]}).facts,[legacy]);
});

test('missing subjects and unsupported token evidence are explicit, never replaced by unrelated measurements',()=>{
  const facts=[fact('Observed head height','100','blocks'),fact('Declared transaction value','999','wei'),fact('Receipt log records','7','logs')];
  const wallet=selectAnswerEvidence(context({question_id:'wallet_summary',facts}));
  assert.equal(wallet.facts.length,0);assert.match(wallet.limitations.join(' '),/No public address was supplied/);
  assert.match(selectAnswerEvidence(context({question_id:'transaction_analysis',facts})).limitations.join(' '),/No transaction hash was supplied/);
  const tokens=selectAnswerEvidence(context({network:'ethereum',question_id:'token_transfers',facts}));
  assert.deepEqual(tokens.facts,[facts[2]]);assert.match(tokens.limitations.join(' '),/not establish an ERC-20 transfer/);
  const approvals=selectAnswerEvidence(context({network:'ethereum',question_id:'token_approvals',facts}));
  assert.deepEqual(approvals.facts,[]);assert.match(approvals.limitations.join(' '),/cannot establish an ERC-20 allowance or approval/);
  assert.doesNotMatch(sourceBasedAnswer(context({network:'ethereum',question_id:'token_approvals',facts})),/Declared transaction value:|Receipt log records:/);
});

test('counterfactual topic names do not acquire privileges from title fragments and unavailable snapshots stay unknown',()=>{
  const facts=[fact('Source active validators','139','validators','validator_counts'),fact('Observed head height','100','blocks')];
  for(const question_id of ['not_a_validators_topic','__proto__','constructor'])assert.deepEqual(selectAnswerEvidence(context({question_id,facts})).facts,[]);
  assert.deepEqual(selectAnswerEvidence(context({question_id:'validators',status:'unavailable',facts})).facts,[]);
  assert.doesNotMatch(sourceBasedAnswer(context({question_id:'validators',status:'unavailable',facts})),/Source active validators: 139/);
});

test('public guide adds bounded selected evidence and topic reference sets without rewriting upstream observations',()=>{
  const facts=[fact('Observed head height','100','blocks'),fact('Source active validators','139','validators','validator_counts')],input=context({facts}),before=structuredClone(input);
  const guide=buildPublicGuide('explorer','validators','summary',input,{now:Date.parse('2026-09-28T12:01:00Z')});
  assert.deepEqual(guide.facts,facts);assert.deepEqual(guide.answer_facts,[facts[1]]);assert.equal(typeof guide.answer_coverage,'string');
  assert.deepEqual(input,before);
  for(const note of guide.knowledge){
    assert.deepEqual(note.source_ids,KNOWLEDGE.explorer.topics.validators.sources.map(source=>source.id));
    assert.equal(note.reference_scope,'topic');assert.equal(note.source_id,undefined);
  }
  const payload=compactObservations(guide);
  assert.deepEqual(payload.facts,facts);assert.equal(payload.answer_facts,undefined);assert.equal(payload.answer_coverage,undefined);assert.equal(payload.knowledge,undefined);
  assert.ok(guide.insights.length);assert.match(sourceBasedAnswer(guide),/Topic reference set:/);
});
