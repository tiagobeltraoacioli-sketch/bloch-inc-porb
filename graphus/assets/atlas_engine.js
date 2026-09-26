import {ATLAS_VERSION,ASSETS,FIELDS} from './atlas_registry.js';
import {validateEvidenceCollection,compareEvidence} from './system_evidence.js';
import {describe,regression,distributionDrift,utcTimestamp} from './atlas_statistics.js';

const DAY=86400000,HOUR=3600000;
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?Date.parse(value):null;
const iso=value=>value===null?null:new Date(value).toISOString();
const ratio=(a,b)=>b===0n?null:Number(a*1000000000n/b)/1e9;
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b,'en'))):v);
const sha=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const result=(value,reason=null,state=reason?'partial':'available')=>({state,value,reason});
const unavailable=reason=>result(null,reason,'unavailable');
const na=reason=>result(null,reason,'not_applicable');
const sourceOrigins={
  'blockstream-esplora':'https://blockstream.info/api',
  'bloch-historical-indexer':'https://blochl1.com/indexer',
  'configured-ethereum-mainnet-rpc':null,
};
const publicSources=[
  {id:'ofac-sdn-official',jurisdiction:'US',reference:'https://ofac.treasury.gov/sanctions-list-service',parser:'ofac-identifiers-1.0.1',ttl_seconds:21600},
  {id:'un-consolidated',jurisdiction:'UN',reference:'https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list',parser:'atlas-official-1.0.0',ttl_seconds:21600},
  {id:'uk-sanctions',jurisdiction:'UK',reference:'https://www.gov.uk/government/publications/the-uk-sanctions-list',parser:'atlas-official-1.0.0',ttl_seconds:21600},
  {id:'eu-financial-sanctions',jurisdiction:'EU',reference:'https://webgate.ec.europa.eu/fsd/fsf',parser:'atlas-official-1.0.0',ttl_seconds:21600},
];
export {publicSources as ATLAS_SOURCES};

function groups(records,reference=null) {
  const totals=new Map();
  for(const e of records){
    const direction=!reference?'all':e.from===reference&&e.to===reference?'self':e.to===reference?'incoming':'outgoing',key=`${e.kind}:${direction}`;
    if(!totals.has(key))totals.set(key,{kind:e.kind,direction,records:0,total:0n,amounts:[],peers:new Map()});
    const g=totals.get(key),amount=BigInt(e.amount_base_units),peer=reference?(e.to===reference?e.from:e.to):`${e.from}\0${e.to}`;
    g.records++;g.total+=amount;g.amounts.push(amount);g.peers.set(peer,(g.peers.get(peer)||0n)+amount);
  }
  return [...totals.values()].sort((a,b)=>`${a.kind}:${a.direction}`.localeCompare(`${b.kind}:${b.direction}`,'en')).map(g=>{
    const amounts=g.amounts.sort((a,b)=>a>b?-1:a<b?1:0),peers=[...g.peers.values()].sort((a,b)=>a>b?-1:a<b?1:0);
    return {kind:g.kind,direction:g.direction,records:g.records,base_units:String(g.total),distinct_adjacent_references:g.peers.size,
      largest_event_share:ratio(amounts[0],g.total),top_ten_event_share:ratio(amounts.slice(0,10).reduce((s,n)=>s+n,0n),g.total),
      largest_peer_share:ratio(peers[0],g.total),peer_hhi:g.total?ratio(peers.reduce((s,n)=>s+n*n,0n),g.total*g.total):null};
  });
}
function referenceMetrics(nodes,records) {
  const map=new Map(nodes.map(n=>[n.id,{id:n.id,reference:n.address||n.txid,kind:n.kind,incoming:new Set(),outgoing:new Set(),incoming_count:0,outgoing_count:0,self_count:0,records:0,first:null,last:null}]));
  for(const e of records){
    const time=stamp(e.block_time),from=map.get(e.from),to=map.get(e.to);
    if(from===to){from.self_count++;from.records++;}
    else {from.outgoing_count++;from.records++;from.outgoing.add(to.id);to.incoming_count++;to.records++;to.incoming.add(from.id);}
    if(time!==null)for(const r of new Set([from,to])){r.first=r.first===null?time:Math.min(r.first,time);r.last=r.last===null?time:Math.max(r.last,time);}
  }
  return [...map.values()].map(r=>({id:r.id,reference:r.reference,kind:r.kind,records:r.records,incoming_count:r.incoming_count,outgoing_count:r.outgoing_count,self_count:r.self_count,
    fan_in:r.incoming.size,fan_out:r.outgoing.size,neighbors:new Set([...r.incoming,...r.outgoing]).size,first_observed:iso(r.first),last_observed:iso(r.last)})).sort((a,b)=>a.id.localeCompare(b.id,'en'));
}
function paths(records,reference,maxHops) {
  if(!reference)return null;
  const adjacency=new Map();for(const e of records){if(!adjacency.has(e.from))adjacency.set(e.from,new Set());adjacency.get(e.from).add(e.to);}
  const reached=new Map([[reference,0]]),queue=[reference];
  for(let i=0;i<queue.length;i++){const id=queue[i],depth=reached.get(id);if(depth>=maxHops)continue;
    for(const next of [...(adjacency.get(id)||[])].sort()){if(!reached.has(next)){reached.set(next,depth+1);queue.push(next);}}}
  return {root:reference,max_hops:maxHops,reachable:[...reached].filter(([id])=>id!==reference).map(([id,hops])=>({id,hops})),
    interpretation:'Shortest directed topological distance. No chronology, ownership or continuity of value is established.'};
}
function temporalCandidates(records,reference,maxHops) {
  const ordered=records.filter(e=>stamp(e.block_time)!==null&&e.from!==e.to).slice().sort((a,b)=>stamp(a.block_time)-stamp(b.block_time)||a.event_id.localeCompare(b.event_id,'en'));
  const incoming=ordered.filter(e=>e.to===reference),outgoing=ordered.filter(e=>e.from===reference),pairs=[];
  let i=0,prior=null;
  for(const out of outgoing){while(i<incoming.length&&stamp(incoming[i].block_time)<stamp(out.block_time))prior=incoming[i++];
    if(prior)pairs.push({incoming_event:prior.event_id,outgoing_event:out.event_id,seconds:(stamp(out.block_time)-stamp(prior.block_time))/1000,
      incoming_base_units:prior.amount_base_units,outgoing_base_units:out.amount_base_units,amount_ratio:ratio(BigInt(out.amount_base_units),BigInt(prior.amount_base_units))});}
  const adjacency=new Map();for(const e of ordered){if(!adjacency.has(e.from))adjacency.set(e.from,[]);adjacency.get(e.from).push(e);}
  const cycles=[],stack=[{node:reference,last:-Infinity,path:[],visited:new Set([reference])}];let expansions=0,truncated=false;
  outer:while(stack.length){const item=stack.pop();if(item.path.length>=maxHops)continue;
    for(const e of adjacency.get(item.node)||[]){if(++expansions>20000){truncated=true;break outer;}const time=stamp(e.block_time);if(time<=item.last)continue;
      if(e.to===reference&&item.path.length){cycles.push({event_ids:[...item.path,e.event_id],hops:item.path.length+1,returned_at:e.block_time});if(cycles.length>=20){truncated=true;break outer;}}
      else if(!item.visited.has(e.to))stack.push({node:e.to,last:time,path:[...item.path,e.event_id],visited:new Set([...item.visited,e.to])});}}
  return {dwell:{...describe(pairs.map(p=>p.seconds)),pairs: pairs.slice(0,100),pairs_total:pairs.length,preview_limit:100,
      method:'For each outgoing event, nearest strictly earlier incoming event. Incoming observations can be reused; these are not coin matches.'},
    pass_through:{horizon_seconds:3600,pairs:pairs.filter(p=>p.seconds<=3600).slice(0,100),total:pairs.filter(p=>p.seconds<=3600).length,
      method:'Nearest-prior observation pairs within one hour, without an intent or conserved-value assertion.'},
    cycles:{candidates:cycles,truncated,expansions,max_expansions:20000,max_hops:maxHops,method:'Simple directed paths with strictly increasing block timestamps; equal-time events are excluded.'}};
}
function timeAnalysis(records,reference,start,end) {
  const timed=records.filter(e=>stamp(e.block_time)!==null),missing=records.length-timed.length;
  const times=timed.map(e=>stamp(e.block_time)),first=times.length?Math.min(...times):null,last=times.length?Math.max(...times):null;
  const lower=start??first,upper=end??last;
  if(lower!==null&&upper!==null)check(upper-lower<=366*DAY,'Limit the analysis window to 366 days.');
  const dayMap=new Map();
  for(const e of timed){const key=new Date(stamp(e.block_time)).toISOString().slice(0,10);if(!dayMap.has(key))dayMap.set(key,[]);dayMap.get(key).push(e);}
  const daily=[];
  if(lower!==null&&upper!==null){const a=Math.floor(lower/DAY)*DAY,b=Math.floor(upper/DAY)*DAY;check((b-a)/DAY<366,'Limit the analysis to 366 UTC day buckets.');
    for(let t=a;t<=b;t+=DAY){const day=iso(t).slice(0,10),rows=dayMap.get(day)||[];daily.push({day,state:rows.length?'observed':'missing',events:rows.length||null,
      exact_totals:rows.length?groups(rows,reference):null,complete_day:false});}}
  const origin=daily.length?Date.parse(daily[0].day+'T00:00:00Z'):null;
  const fit=regression(daily.filter(r=>r.events!==null).map(r=>({day:r.day,x:(Date.parse(r.day+'T00:00:00Z')-origin)/DAY,y:r.events})));
  const bands=[{name:'0–1 hour',minimum_age_hours:0,maximum_age_hours:1,count:0},{name:'1–24 hours',minimum_age_hours:1,maximum_age_hours:24,count:0},{name:'24–168 hours',minimum_age_hours:24,maximum_age_hours:168,count:0}];
  let outside=0;for(const e of timed){const age=(upper-stamp(e.block_time))/HOUR,b=bands.find(b=>age>=b.minimum_age_hours&&age<b.maximum_age_hours);if(b)b.count++;else outside++;}
  const events=[...new Map(timed.map(e=>[`${e.txid}:${stamp(e.block_time)}`,stamp(e.block_time)])).values()].sort((a,b)=>a-b),gaps=events.slice(1).map((t,i)=>(t-events[i])/1000),summary=describe(gaps);
  const burst=gaps.length>=3&&summary.mean+summary.std>0?(summary.std-summary.mean)/(summary.std+summary.mean):null;
  return {first:iso(first),last:iso(last),start:iso(lower),end:iso(upper),missing,with_timestamp:timed.length,daily,fit,
    bands:{as_of:iso(upper),bands,outside_bands:outside,missing_timestamps:missing,boundary:'Minimum age inclusive; maximum age exclusive.'},
    burstiness:{value:burst,inter_event_gap_seconds:summary,distinct_transaction_times:events.length,
      method:'(sample standard deviation − mean) / (sample standard deviation + mean) of consecutive transaction-time gaps.',
      warning:burst===null?'At least three gaps and nonzero spread or mean are required.':'Sparse, sampled and equal block timestamps can dominate this statistic.'}};
}

export async function analyzeAtlas(packet,options={}) {
  check(options&&typeof options==='object'&&!Array.isArray(options)&&Object.keys(options).every(k=>['reference','start','end','max_hops','kind','minimum','baseline','now','imported'].includes(k)),'Unexpected Atlas options.');
  const validated=await validateEvidenceCollection(packet),d=validated.dataset,asset=ASSETS[d.asset];
  check(d.snapshots.every(s=>s.scope.contract===undefined||asset.contract&&typeof s.scope.contract==='string'&&s.scope.contract.toLowerCase()===asset.contract),'Source token contract does not match the pinned asset.');
  const now=options.now??new Date().toISOString();check(stamp(now)!==null,'Invalid analysis time.');
  const hops=options.max_hops??4;check(Number.isInteger(hops)&&hops>=1&&hops<=6,'Path depth must be between one and six.');
  const kind=options.kind||'all';check(kind==='all'||globalThis.GraphusAnalytics.KINDS[d.asset].includes(kind),'Invalid record kind.');
  const minimum=options.minimum||'0';check(typeof minimum==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(minimum),'Minimum amount must be an unsigned integer of at most 78 digits.');
  const boundary=(value,name)=>{if(value===undefined||value===null||value==='')return null;check(utcTimestamp(value)!==null,`${name} must be a valid ISO UTC date ending in Z.`);return utcTimestamp(value);};
  const start=boundary(options.start,'Start'),end=boundary(options.end,'End');check(start===null||end===null||start<=end,'Start must not follow end.');
  check(!options.reference||typeof options.reference==='string'&&options.reference.length<=200,'Invalid reference.');
  const node=options.reference?d.nodes.find(n=>{
    const value=n.address||n.txid,q=options.reference;
    return n.id===q||(d.asset==='BTC'&&n.kind==='address'&&/^[13]/.test(value)?value===q:value.toLowerCase()===q.toLowerCase());}):null;
  check(!options.reference||node,'Reference is not present in this captured dataset.');
  const reference=node?.id||null;
  let excludedMissing=0;
  const windowRecords=d.edges.filter(e=>{if(kind!=='all'&&e.kind!==kind||BigInt(e.amount_base_units)<BigInt(minimum))return false;const t=stamp(e.block_time);
    if((start!==null||end!==null)&&t===null){if(!reference||e.from===reference||e.to===reference)excludedMissing++;return false;}return (start===null||t>=start)&&(end===null||t<=end);});
  const records=windowRecords.filter(e=>!reference||e.from===reference||e.to===reference).slice().sort((a,b)=>a.event_id.localeCompare(b.event_id,'en'));
  const refs=referenceMetrics(d.nodes,windowRecords),selected=refs.find(r=>r.id===reference),volumes=groups(records,reference),temporal=timeAnalysis(records,reference,start,end);
  const scopedNodes=new Set(records.flatMap(e=>[e.from,e.to]));
  const account=asset.standard!=='UTXO',candidates=reference&&account?temporalCandidates(windowRecords,reference,hops):null;
  let baseline=null,comparison=null,drift=null;
  if(options.baseline){baseline=await validateEvidenceCollection(options.baseline);comparison=compareEvidence(baseline,validated);
    const oldRefs=referenceMetrics(baseline.dataset.nodes,baseline.dataset.edges).filter(n=>n.kind!=='transaction'&&n.records);
    const newRefs=referenceMetrics(d.nodes,d.edges).filter(n=>n.kind!=='transaction'&&n.records);
    if(oldRefs.length&&newRefs.length)drift=distributionDrift(oldRefs.map(r=>r.neighbors),newRefs.map(r=>r.neighbors));}
  const heights=[...new Set(records.map(e=>e.block_number))].sort((a,b)=>a-b),ranges=[];
  for(const s of d.snapshots){const from=s.scope.from_block??s.anchor.height,to=s.scope.to_block??s.anchor.height;ranges.push({from,to,anchor:s.anchor,returned_records:s.records,selection:s.scope.selection??null,coverage:s.coverage});}
  const flags=['bounded_sample','source_reported','unknown_full_history'];
  if(options.imported)flags.push('imported_source_claims_unverified');
  if(temporal.missing||excludedMissing)flags.push('missing_timestamps');
  if(d.snapshots.some(s=>s.scope.truncated||s.scope.endpoint_records_omitted>0))flags.push('source_omissions');
  if(stamp(now)-stamp(d.retrieved_at)>6*HOUR)flags.push('snapshot_older_than_six_hours');
  if(stamp(d.retrieved_at)>stamp(now))flags.push('source_retrieval_in_future');
  if(comparison?.conflicting_blocks.length)flags.push('baseline_block_conflict');
  if(!records.length)flags.push('empty_selection');
  const observation={start:temporal.start,end:temporal.end,records:records.length,records_with_timestamp:temporal.with_timestamp,
    records_without_timestamp:temporal.missing,excluded_missing_timestamps:excludedMissing,complete_history:false,complete_days:0,
    source_records:d.edges.length,window_records:windowRecords.length,source_pages:d.snapshots.length,
    interpretation:'Counts and exact totals describe selected returned records. Missing days and unreturned history remain unknown.'};
  const values={};const set=(key,value,reason=null)=>{values[key]=result(value,reason);};
  set('network_id',d.network);set('asset_id',asset.id);set('asset_standard',asset.standard);set('asset_decimals',asset.decimals);
  values.contract_address=asset.contract?result(asset.contract):na('Native asset; no token contract.');
  set('source_endpoint',{source_id:d.source,public_origin:sourceOrigins[d.source]??null,independently_verified:false,
    endpoint_disclosed:d.source==='configured-ethereum-mainnet-rpc'?false:Object.hasOwn(sourceOrigins,d.source)},'Source identity is recorded. RPC credentials, source rights and uptime are not inferred.');
  set('chain_height',d.anchor);set('coverage_window',{ranges,first_record_height:heights[0]??null,last_record_height:heights.at(-1)??null,complete_chain_history:false});
  const recordField=(key,property,reason=null)=>{const present=records.filter(e=>e[property]!==null&&e[property]!==undefined);
    values[key]=present.length?result({record_property:property,records:records.length,present:present.length,examples:present.slice(0,3).map(e=>({event_id:e.event_id,value:e[property]}))},reason|| (present.length<records.length?'Some records lack this field.':null)):unavailable('No selected record supplies this field.');};
  for(const [key,property] of Object.entries({transaction_id:'txid',event_index:'position',block_hash:'block_hash',block_height_or_slot:'block_number',amount_raw:'amount_base_units',outpoint:'outpoint',flow_from:'from',flow_to:'to',flow_edge_type:'kind'}))recordField(key,property);
  if(account)values.outpoint=na('Account-chain records have no UTXO outpoints.');
  set('observed_at',d.snapshots.map(s=>({source:s.source,retrieved_at:s.retrieved_at})));set('ingested_at',now,'Analysis acceptance time; no persistent public ingestion ledger is claimed.');
  set('transaction_success',{record_semantics:globalThis.GraphusAnalytics.KINDS[d.asset],policy:d.asset==='ETH'?'Matched successful transaction receipts':asset.contract?'Transfer logs in source-finalized blocks':'Source-reported included UTXO observations',independently_verified:false});
  values.receipt_log_identity=asset.contract?result({contract:asset.contract,signature:'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',transaction_property:'txid',log_index_property:'position',block_hash_property:'block_hash'}):na('Only ERC-20 Transfer records have log identities.');
  set('finality_state',d.snapshots.map(s=>({anchor:s.anchor,state:s.anchor.finality||'unknown',finalized_height:s.anchor.finalized_height??null})));
  const heads=d.snapshots.filter(s=>Number.isSafeInteger(s.scope.source_head_height)).map(s=>({height:s.scope.source_head_height,hash:s.scope.source_head_hash??null,kind:s.scope.source_head_kind,observed_in_capture:s.retrieved_at})).sort((a,b)=>stamp(a.observed_in_capture)-stamp(b.observed_in_capture));
  const head=heads.at(-1),latest=heights.at(-1)??null;
  values.confirmations=d.asset==='BTC'&&d.snapshots.every(s=>s.anchor.finality?.includes('at least three confirmations'))?result({minimum_at_selection:3,exact_current_depth:null},'The adapter retains a selection lower bound, not a live head observation.'):unavailable('No independent head-to-event confirmation count is recorded. See source finality.');
  if(d.asset==='BTC'&&head?.kind==='best-chain'&&latest!==null&&head.height>=latest)values.confirmations=result({source_head:head,minimum_at_capture:head.height-latest+1,maximum_at_capture:head.height-heights[0]+1,record_formula:'source head height − record block height + 1',current_depth:null},'Depth is source-reported at capture; it is not a current or universal finality guarantee.');
  values.reorg_revision=comparison?result({compared_snapshots:2,conflicting_blocks:comparison.conflicting_blocks,canonical_revision:null},'Conflicts are detected; a canonical reorg cannot be confirmed from two bounded samples.'):unavailable('Pin a baseline and compare another capture to detect overlapping block conflicts.');
  values.source_lag=head&&latest!==null&&head.height>=latest?result({source_head:head,latest_selected_record_height:latest,blocks:head.height-latest},'Distance to the reported best-chain or finalized head at capture. This describes sampling lag, not node synchronization or independent consensus verification.'):unavailable('No compatible source head and selected record height are available. Older packets may lack head metadata.');
  set('missing_range',{observed_heights:heights,unreturned_heights_within_span:heights.length?heights.at(-1)-heights[0]+1-heights.length:0,omissions:d.snapshots.map(s=>({anchor_height:s.anchor.height,records_omitted:s.scope.endpoint_records_omitted??null,truncated:s.scope.truncated??null})),backfill:'bounded cursor pages; unknown history outside them'});
  set('parse_version',{source_adapters:[...new Set(d.snapshots.map(s=>s.scope.adapter_version??null))],schema:1,transform:ATLAS_VERSION},d.snapshots.some(s=>!s.scope.adapter_version)?'Older source packets do not declare an adapter revision.':null);
  values.reconciliation_result=comparison?result(comparison,'Same-source sample consistency comparison; not independent-source reconciliation.'):unavailable('No comparison baseline supplied.');
  set('data_quality_flags',flags);set('address_or_script',reference?{id:node.id,kind:node.kind,reference:node.address||node.txid}:{count:scopedNodes.size,reference_table:'references'});
  set('counterparty_count',selected?{count:selected.neighbors,semantics:account?'adjacent address references':'adjacent transaction references'}:{reference_table:'references',column:'neighbors'},'References are not persons or confirmed counterparties.');
  set('inbound_outbound_count',selected?{incoming:selected.incoming_count,outgoing:selected.outgoing_count,self:selected.self_count}:{reference_table:'references',columns:['incoming_count','outgoing_count','self_count']});
  set('volume_by_asset',{asset:d.asset,unit:asset.unit,decimals:asset.decimals,groups:volumes},'Record types and directions have separate totals. UTXO inputs and outputs are never added as transfer volume.');
  const peers=refs.filter(r=>r.kind!=='transaction'&&r.records),highDegree=peers.filter(r=>r.neighbors>=10).map(r=>({id:r.id,neighbors:r.neighbors}));
  set('shared_service_warning',{degree_threshold:10,high_degree_references:highDegree,known_service_attribution:false},'High degree in a bounded sample may reflect infrastructure, selection or ordinary activity; no service identity is assigned.');
  values.path_hop_count=reference?result(paths(windowRecords,reference,hops)):unavailable('Select a reference to compute directed distances.');
  set('first_last_observed',{first:temporal.first,last:temporal.last,missing_timestamps:temporal.missing},temporal.missing?'Block times are absent from some or all selected records.':null);
  values.activity_1h_24h_7d=temporal.with_timestamp?result(temporal.bands,'Disjoint observed-record bands, not full-chain activity.'):unavailable('No selected block timestamps.');
  values.burstiness=temporal.burstiness.value===null?unavailable(temporal.burstiness.warning):result(temporal.burstiness,temporal.burstiness.warning);
  for(const [key,property] of [['dwell_time','dwell'],['pass_through_candidate','pass_through'],['cycle_candidate','cycles']]){
    values[key]=!reference?unavailable('Select a reference.'):!account?na('This timestamp heuristic requires direct account transfers; UTXO ownership and coin continuity are not inferred.'):
      !temporal.with_timestamp?unavailable('No selected block timestamps.'):result(candidates[property],'Bounded observation pattern; no ownership, intent or conserved-value claim.');}
  set('fan_in_fan_out',selected?{fan_in:selected.fan_in,fan_out:selected.fan_out}:{reference_table:'references',columns:['fan_in','fan_out']});
  set('value_concentration',volumes.map(({kind,direction,base_units,largest_event_share,top_ten_event_share,largest_peer_share,peer_hhi})=>({kind,direction,denominator_base_units:base_units,largest_event_share,top_ten_event_share,largest_peer_share,peer_hhi})), 'Shares use selected nonnegative amounts within each record type; zero totals have null shares.');
  set('source_registry_id',{chain_source:{id:d.source,adapter:'graphus-network-v1'},official_sources:publicSources,source_rights:'Must be reviewed for the intended use; public availability does not establish redistribution rights.'});
  set('snapshot_digest',{algorithm:'SHA-256',dataset_sha256:validated.dataset_sha256,encoding:validated.digest_encoding,authenticates_source:false});
  set('claim_observed_expires',{chain_observed_at:d.retrieved_at,chain_claim_expires:null,official_snapshot_ttl_seconds:21600},'Chain observations are historical snapshots. Official claims have separate private retrieval and expiry records.');
  set('feature_schema',FIELDS.filter(f=>['Wallet & flow','Time & behavior','Statistical analysis'].includes(f.layer)).map(f=>({name:f.name,definition:f.meaning,units:f.units,method:f.method,missing_value:f.missing_value})));
  set('feature_value',{fields: ['counterparty_count','inbound_outbound_count','volume_by_asset','fan_in_fan_out','value_concentration','activity_1h_24h_7d','burstiness','trend_slope'],score_included:false});
  const parameters={reference,start:iso(start),end:iso(end),max_hops:hops,kind,minimum};
  set('feature_revision',{transform:ATLAS_VERSION,dataset_sha256:validated.dataset_sha256,parameters_sha256:await sha(canonical(parameters)),baseline_sha256:baseline?.dataset_sha256??null});
  set('model_version',{public_transform:ATLAS_VERSION,public_aml_model:null,private_observation_model_endpoint:'https://rednblue.space/api/porb/v1/model'});
  set('uncertainty_and_alternatives',{quality_flags:flags,alternatives:['Unequal source sampling','Incomplete time coverage','Shared infrastructure','Unobserved internal calls or transfers','UTXO change outputs'],causality_established:false});
  set('observation_window',observation);set('daily_event_rate',{unit:'returned records per UTC bucket',days:temporal.daily.map(({day,state,events,complete_day})=>({day,state,events,complete_day})),network_rate:null},'An observed bucket is not a complete day; missing days have null counts.');
  set('daily_volume_series',{asset:d.asset,unit:asset.unit,decimals:asset.decimals,days:temporal.daily.map(({day,state,exact_totals})=>({day,state,groups:exact_totals}))});
  set('regression_specification',{response:'returned record count',predictor:'elapsed UTC days from first bucket',intercept:true,method:'ordinary least squares',n:temporal.fit.n,
    missing_days:'excluded',zero_amount_events:'retained',amount_filter:minimum,cohort:'selected sample and reference',origin:temporal.daily[0]?.day??null});
  values.trend_slope=temporal.fit.available?result({value:temporal.fit.slope,unit:'returned records per elapsed UTC day',intercept:temporal.fit.intercept},'Descriptive sample trend; varying coverage can explain the slope.'):unavailable(temporal.fit.reason);
  values.confidence_interval=temporal.fit.available?result(temporal.fit.slope_interval_95,'Conditional model interval; source sampling uncertainty is not estimated.'):unavailable(temporal.fit.reason);
  values.fit_diagnostics=temporal.fit.available?result(temporal.fit):unavailable(temporal.fit.reason);
  const cohort=selected?peers.filter(r=>r.id!==selected.id&&r.kind===selected.kind):peers;
  const distribution=describe(cohort.map(r=>r.neighbors));
  set('cohort_comparison',{asset:d.asset,reference:reference,peer_count:cohort.length,neighbor_count:distribution,
    selected_neighbor_z:selected&&distribution.std>0?(selected.neighbors-distribution.mean)/distribution.std:null,
    selection:'Same asset, source, observation filters and reference kind; selected reference excluded from its own peer baseline.'},'Sample-relative description; no identity labels or normative baseline.');
  set('multiple_testing_warning',{hypotheses_tested:0,inferential_p_values:false,warning:'Exploring many references, features or windows creates selection effects. These descriptive views do not control false discoveries.'});
  set('causal_limitations',['Partial and source-dependent coverage','Block timestamps do not establish within-block order','Association and path proximity do not establish causation','No ownership or independent source verification']);
  values.calibration_and_drift=drift?result({neighbor_distribution_drift:drift,calibration:null},'Calibration requires a labeled holdout. Drift compares full captured reference sets, before filters.'):unavailable('Pin a baseline for structural drift, or import a declared holdout for calibration.');
  for(const f of FIELDS){
    if(f.release_gate)values[f.name]=result(null,f.release_gate,'gated');
    else if(f.access!=='public')values[f.name]=result(null,'Open the authenticated organization workspace with the required scope. Public Atlas exports never include this field.','private');
    else if(!values[f.name])values[f.name]=unavailable('Import a declared, time-separated and entity-disjoint holdout in Evaluation to calculate this field.');
  }
  const digest=await sha(canonical({version:ATLAS_VERSION,input:validated.dataset_sha256,baseline:baseline?.dataset_sha256??null,parameters,evaluated_at:now,imported:options.imported===true}));
  return {kind:'graphus_data_atlas',schema_version:1,version:ATLAS_VERSION,analysis_id:digest,generated_at:now,asset:d.asset,network:d.network,
    provenance:{dataset_sha256:validated.dataset_sha256,baseline_sha256:baseline?.dataset_sha256??null,source:d.source,source_retrieved_at:d.retrieved_at,
      snapshots:d.snapshots,imported:options.imported===true,independent_verification:false},parameters,observation,
    fields:values,references:refs.filter(r=>r.records>0||r.id===reference),records,daily:temporal.daily,comparison,drift,
    aml_scores:false,identity_attribution:false};
}

export function atlasCsv(report) {
  const escape=value=>{let text=typeof value==='string'?value:JSON.stringify(value);if(/^[\s]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  const header=['field','state','value','reason','asset','dataset_sha256','analysis_id'];
  return [header,...FIELDS.map(f=>{const r=report.fields[f.name];return [f.name,r.state,r.value,r.reason,report.asset,report.provenance.dataset_sha256,report.analysis_id];})].map(row=>row.map(escape).join(',')).join('\r\n')+'\r\n';
}
