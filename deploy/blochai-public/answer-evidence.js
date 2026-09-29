// Select observations for a reviewed topic without changing their values or
// treating unrelated network measurements as evidence about a supplied subject.
const GRAPH = ['Displayed graph references','Displayed graph records','Source graph references','Source graph records','Source sample transactions','Source omitted records','Graph source height','Graph source finalized height'];
const WALLET = ['Observed address balance','Confirmed address transactions','Pending address transactions','Observed script events','Indexed script events','Balance checkpoint height','Source history height',...GRAPH];
const TRANSACTION = ['Declared transaction value','Transaction input records','Transaction output records','Transaction fee','Derived execution gas fee','Derived blob gas fee','Transaction height','Transaction slot','Reported confirmations','Reported finalized height','Execution gas used','Effective execution gas price','Transaction gas limit','Transaction nonce','Receipt log records','Complete input record total','Complete output record total','Derived input-output fee','Coinbase transaction','Outputs reported spent','Input sequence replacement signal',...GRAPH];
const CHECKPOINT = ['Transaction height','Reported confirmations','Reported finalized height','Observed head height','Observed head slot','Graph source height','Graph source finalized height','Validator observation height','Validator observation slot','Balance checkpoint height','Source history height'];
const BLOCK = ['Observed head height','Observed head slot','Observed head epoch','Transactions in head block','Head block transaction IDs','Head block weight','Head block size','Head block gas used','Head block gas limit','Head block base fee','Transaction height','Transaction slot','Reported finalized height','Graph source height'];
const VALIDATOR = ['Source validator count','Source active validators','Source active stake','Validator observation height','Validator observation slot'];
const MEMPOOL = ['Observed mempool transactions','Observed mempool virtual size','Observed mempool bytes','Observed mempool capacity','Observed mempool total fees','Source fee estimate for 3 blocks','Source fee estimate for 6 blocks','Source next base fee','Pending address transactions'];
const HEALTH = ['Indexer lag','Indexer checkpoint slot','Indexer transaction records','Reporting nodes','Observed head height','Observed head slot','Reported finalized height','Source omitted records','Graph source height','Validator observation height'];
const RECEIPT = ['Execution gas used','Effective execution gas price','Derived execution gas fee','Derived blob gas fee','Receipt log records','Transaction gas limit','Transaction height','Reported confirmations','Reported finalized height'];
const FEES = {
  bitcoin:['Transaction fee','Derived input-output fee','Transaction virtual size','Transaction weight','Complete input record total','Complete output record total','Derived fee matches reported fee','Source fee estimate for 3 blocks','Source fee estimate for 6 blocks','Observed mempool total fees','Observed mempool virtual size'],
  ethereum:['Derived execution gas fee','Execution gas used','Effective execution gas price','Derived blob gas fee','Transaction gas limit','Head block base fee','Source gas price','Head block gas used','Head block gas limit'],
  bloch:['Transaction fee','Source next base fee','Observed mempool transactions','Observed mempool bytes'],
};

// Every approved question uses an explicit profile. New catalog topics must be
// reviewed here as well; title substrings never determine evidence relevance.
export const ANSWER_TOPIC_PROFILES = Object.freeze({
  connections:'graph',readings:'graph',graph_analysis:'graph',graph_paths:'graph',duplicate_records:'graph',
  coverage:'coverage',sampling_bias:'coverage',compare:'coverage',block_anchors:'checkpoint',
  wallet_summary:'wallet',accounts:'wallet',asset_units:'amount',
  transaction_analysis:'transaction',transactions:'transaction',utxo:'utxo',eutxo:'utxo',change_outputs:'utxo',output_references:'utxo',
  fees:'fees',bitcoin_fee_rate:'fees',fee_market:'fees',
  finality:'checkpoint',consensus:'checkpoint',reorgs:'checkpoint',
  observations:'overview',features:'overview',upgrade_status:'overview',
  freshness:'health',health:'health',
  blocks:'block',block_details:'block',block_commitments:'block',slot_epoch:'slot',
  validators:'validator',staking_lifecycle:'validator',mempool:'mempool',
  receipt_status:'receipt',ethereum_receipts:'receipt',
  token_events:'tokens',token_transfers:'tokens',token_approvals:'approvals',
});

function labelsFor(guide,profile){
  switch(profile){
    case 'graph': return GRAPH;
    case 'coverage': return ['Source omitted records','Source sample transactions',...GRAPH,'Indexer lag','Balance checkpoint height','Source history height'];
    case 'wallet': return WALLET;
    case 'amount': return ['Observed address balance','Declared transaction value','Transaction fee','Derived execution gas fee','Derived blob gas fee','Source active stake','Complete input record total','Complete output record total'];
    case 'transaction': return TRANSACTION;
    case 'utxo': return ['Transaction input records','Transaction output records','Outputs reported spent','Complete input record total','Complete output record total','Transaction fee','Coinbase transaction','Transaction height','Transaction slot',...GRAPH];
    case 'fees': return FEES[guide.network]||[];
    case 'checkpoint': return CHECKPOINT;
    case 'overview': return [...BLOCK,...HEALTH,...VALIDATOR];
    case 'health': return HEALTH;
    case 'block': return BLOCK;
    case 'slot': return ['Observed head slot','Observed head epoch','Observed head height','Transaction slot','Validator observation slot','Indexer checkpoint slot','Reported finalized height'];
    case 'validator': return VALIDATOR;
    case 'mempool': return MEMPOOL;
    case 'receipt': return RECEIPT;
    case 'tokens': return ['Receipt log records'];
    case 'approvals': return [];
    default: return guide.question_id?[]:null;
  }
}

export function answerInsightPriority(guide){
  const profile=Object.hasOwn(ANSWER_TOPIC_PROFILES,guide?.question_id)?ANSWER_TOPIC_PROFILES[guide.question_id]:null;
  if(profile==='graph')return ['graph_structure','graph_degrees','transaction_sample'];
  if(profile==='fees')return ['fee_consistency','source_freshness','source_coverage'];
  if(profile==='wallet'||profile==='amount')return ['exact_amount','transaction_sample','source_freshness'];
  if(['transaction','utxo','receipt'].includes(profile))return ['transaction_sample','fee_consistency','exact_amount','graph_structure'];
  if(['health','coverage','validator','mempool','tokens','approvals'].includes(profile))return ['source_coverage','source_freshness','graph_structure'];
  if(['checkpoint','block','slot'].includes(profile))return ['checkpoint_gap','source_freshness','source_coverage'];
  return ['exact_amount','graph_structure','source_freshness'];
}

/** Keep legacy facts visibly unattributed; reject broken explicit source links. */
export function selectAnswerEvidence(guide){
  if(!guide)return {facts:[],limitations:[]};
  const profile=Object.hasOwn(ANSWER_TOPIC_PROFILES,guide.question_id)?ANSWER_TOPIC_PROFILES[guide.question_id]:null,labels=labelsFor(guide,profile);
  const sources=Array.isArray(guide.sources)?guide.sources:[],limitations=[];
  const candidates=(Array.isArray(guide.facts)?guide.facts:[]).filter(fact=>{
    if(!fact||typeof fact.label!=='string'||typeof fact.value!=='string')return false;
    if(fact.source_id==null)return true;
    const linked=sources.filter(source=>source?.id===fact.source_id);
    return linked.length===1&&['available','partial'].includes(linked[0].status);
  });
  const relevant=labels===null?candidates:candidates.filter(fact=>labels.includes(fact.label));
  const ordered=labels===null?relevant:relevant.map((fact,index)=>({fact,index})).sort((a,b)=>labels.indexOf(a.fact.label)-labels.indexOf(b.fact.label)||a.index-b.index).map(item=>item.fact);
  const facts=guide.status==='unavailable'?[]:ordered.slice(0,guide.mode==='summary'?4:8);
  if(guide.question_id==='wallet_summary'&&guide.subject?.kind!=='address')limitations.push('No public address was supplied. This snapshot does not analyze a particular wallet or establish its balance, activity or ownership.');
  if(guide.question_id==='transaction_analysis'&&guide.subject?.kind!=='transaction')limitations.push('No transaction hash was supplied. The bounded network or address sample is not an analysis of a particular transaction.');
  if(profile==='tokens'||profile==='approvals')limitations.push(profile==='approvals'?'Token allowance and approval state are not retrieved by this snapshot. Native balances, value transfers and receipt log counts cannot establish an ERC-20 allowance or approval.':'Token transfers are not decoded by this snapshot. A receipt log count or native-value transaction does not establish an ERC-20 transfer, token amount or token balance.');
  if(profile==='receipt')limitations.push('Receipt measurements require a receipt matched to the transaction and block. Receipt logs are not automatically token transfers; failed execution does not transfer the declared value.');
  if(guide.question_id==='change_outputs')limitations.push('The returned output records do not identify which output is change or who controls an output.');
  if(guide.question_id==='staking_lifecycle')limitations.push('Aggregate validator counts and stake do not establish an individual validator\'s activation, withdrawal eligibility or earned rewards.');
  if(['features','upgrade_status','block_commitments'].includes(guide.question_id))limitations.push('Network measurements do not verify feature activation, an upgrade or block commitments. Consult the reviewed implementation references and explicit supporting records.');
  if(guide.question_id==='reorgs')limitations.push('A single snapshot cannot establish a reorganization; heights and checkpoints from different observations are not a recorded chain-history comparison.');
  if(facts.some(fact=>fact.source_id==null))limitations.push('Per-fact source attribution was not recorded for one or more selected legacy facts. The source list is context, not a verified link for those facts.');
  if(facts.some(fact=>sources.find(source=>source?.id===fact.source_id)?.status==='partial'))limitations.push('Some selected facts come from a partial source. Its stated coverage and observation time still apply.');
  if(!facts.length&&guide.status!=='unavailable')limitations.push('No directly relevant source facts were returned for this topic. Other observations in the snapshot do not fill the missing evidence.');
  return {facts,limitations};
}
