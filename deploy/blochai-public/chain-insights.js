// Deterministic readings of a bounded public snapshot. No retrieval, private
// labels, ownership inference, predictions or learned risk scores are used.
const ASSETS=Object.freeze({bitcoin:{asset:'BTC',unit:'sat',decimals:8},ethereum:{asset:'ETH',unit:'wei',decimals:18},bloch:{asset:'BLCH',unit:'sat',decimals:8}});
const INTEGER=/^(0|[1-9][0-9]{0,77})$/;
const text=value=>typeof value==='string'?value:'';
const unsigned=value=>typeof value==='string'&&INTEGER.test(value);

export function formatBaseUnits(value,asset){
  const format=Object.values(ASSETS).find(item=>item.asset===asset);if(!format||!unsigned(value))return null;
  const amount=BigInt(value),scale=10n**BigInt(format.decimals),whole=amount/scale,fraction=(amount%scale).toString().padStart(format.decimals,'0').replace(/0+$/,'');
  return `${whole}${fraction?'.'+fraction:''} ${format.asset}`;
}

export function graphStatistics(graph){
  if(!graph||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges)||graph.nodes.length>40||graph.edges.length>80)return null;
  const ids=new Set(graph.nodes.map(node=>text(node?.id)));
  if(ids.has('')||ids.size!==graph.nodes.length||graph.edges.some(edge=>!edge||!ids.has(edge.source)||!ids.has(edge.target)))return null;
  const outgoing=new Map([...ids].map(id=>[id,new Set()])),incoming=new Map([...ids].map(id=>[id,new Set()])),neighbors=new Map([...ids].map(id=>[id,new Set()]));
  let selfLoops=0;
  for(const edge of graph.edges){
    if(edge.source===edge.target){selfLoops++;continue;}
    outgoing.get(edge.source).add(edge.target);incoming.get(edge.target).add(edge.source);neighbors.get(edge.source).add(edge.target);neighbors.get(edge.target).add(edge.source);
  }
  const uniqueArcs=[...outgoing.values()].reduce((sum,set)=>sum+set.size,0),n=ids.size,possible=n*(n-1),visited=new Set();let components=0;
  for(const id of ids){if(visited.has(id))continue;components++;const pending=[id];visited.add(id);while(pending.length){for(const neighbor of neighbors.get(pending.pop()))if(!visited.has(neighbor)){visited.add(neighbor);pending.push(neighbor);}}}
  return {nodes:n,records:graph.edges.length,unique_directed_connections:uniqueArcs,self_loops:selfLoops,
    duplicate_directed_records:graph.edges.length-selfLoops-uniqueArcs,
    density:possible?((BigInt(uniqueArcs)*1000000n+BigInt(Math.floor(possible/2)))/BigInt(possible)).toString().padStart(7,'0').replace(/(\d{6})$/,'.$1'):null,
    max_in_degree:Math.max(0,...[...incoming.values()].map(set=>set.size)),max_out_degree:Math.max(0,...[...outgoing.values()].map(set=>set.size)),
    isolated_nodes:[...neighbors.values()].filter(set=>!set.size).length,weak_components:components};
}

function timestamp(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))return null;const parsed=Date.parse(value);return Number.isFinite(parsed)?parsed:null;}
function age(value,now){const time=timestamp(value);if(time===null)return 'unknown';if(time>now)return 'ahead of the comparison clock';const seconds=Math.floor((now-time)/1000);return seconds<60?`${seconds}s`:seconds<3600?`${Math.floor(seconds/60)}m ${seconds%60}s`:`${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m`;}

/** Return derived facts separately; callers must not replace or truncate source facts. */
export function deriveChainInsights(guide,{now=Date.now()}={}){
  const empty={facts:[],insights:[]};if(!guide||!Object.hasOwn(ASSETS,guide.network))return empty;
  const clock=now instanceof Date?now.getTime():typeof now==='function'?new Date(now()).getTime():Number(now);if(!Number.isFinite(clock))return empty;
  const definition=ASSETS[guide.network],facts=Array.isArray(guide.facts)?guide.facts:[],sources=(Array.isArray(guide.sources)?guide.sources:[]).filter(source=>source&&typeof source.id==='string'&&source.status!=='reference');
  const ids=new Set(sources.map(source=>source.id)),available=sources.filter(source=>source.status==='available'),insights=[],derived=[];
  const matching=(...candidates)=>candidates.filter(id=>ids.has(id));
  const sourceIds=(...candidates)=>{const selected=matching(...candidates);return selected.length?selected:available.map(source=>source.id).slice(0,6);};
  const add=(id,title,content,references,status='available')=>{
    const linked=[...new Set(references)].filter(id=>ids.has(id)).slice(0,6);
    if(status==='available'&&(!linked.length||linked.some(id=>sources.find(source=>source.id===id)?.status!=='available')))status=linked.length&&linked.every(id=>sources.find(source=>source.id===id)?.status==='unavailable')?'unavailable':'partial';
    if(insights.length<8)insights.push({id,title,text:content.slice(0,600),source_ids:linked,status});
  };
  const fact=(label)=>facts.find(item=>item?.label===label&&unsigned(item.value));
  const first=fact('Observed address balance')||fact('Declared transaction value')||fact('Transaction fee')||fact('Source gas price');
  if(first&&first.unit===definition.unit){
    const formatted=formatBaseUnits(first.value,definition.asset);
    add('exact_amount','Exact amount and units',`${first.label}: ${formatted} (${first.value} ${definition.unit}). This is an exact change of notation, not a valuation or a new balance observation.`,sourceIds(first.label==='Observed address balance'?'address_observation':first.label==='Source gas price'?'network_overview':'transaction_observation'));
  }
  const transactionSource=sources.find(source=>source.id==='transaction_observation'&&source.status==='available');
  if(transactionSource&&guide.network==='bitcoin'){
    const input=fact('Complete input record total'),output=fact('Complete output record total'),fee=fact('Derived input-output fee'),reported=fact('Transaction fee');
    if([input,output,fee,reported].every(item=>item?.unit==='sat')){
      const difference=BigInt(input.value)-BigInt(output.value),consistent=difference>=0n&&difference===BigInt(fee.value)&&difference===BigInt(reported.value);
      add('fee_consistency','Fee arithmetic in the returned transaction',consistent?`Complete returned input records total ${input.value} sat and output records total ${output.value} sat. Their difference is ${fee.value} sat, matching the reported fee (${formatBaseUnits(fee.value,'BTC')}). Inputs and outputs are opposite sides of this transaction, not additive transfer volume or an ownership claim.`:'The complete returned input/output totals, derived fee and reported fee do not agree. Preserve the discrepancy and check the source; no transfer volume or ownership claim follows.',[transactionSource.id],consistent?'available':'partial');
    }
  }
  if(transactionSource&&guide.network==='ethereum'){
    const gas=fact('Execution gas used'),price=fact('Effective execution gas price'),fee=fact('Derived execution gas fee');
    if(gas?.unit==='gas'&&price?.unit==='wei/gas'&&fee?.unit==='wei'){
      const consistent=BigInt(gas.value)*BigInt(price.value)===BigInt(fee.value);
      add('fee_consistency','Receipt execution fee arithmetic',consistent?`${gas.value} gas × ${price.value} wei/gas = ${fee.value} wei (${formatBaseUnits(fee.value,'ETH')}). This calculation uses the returned receipt fields and is distinct from the declared transaction value. Blob fees remain separate when reported; no fiat price is inferred.`:'The returned execution gas, effective gas price and derived execution fee do not agree. Check the receipt/source before interpreting the execution fee; transaction value and any blob fee remain separate.',[transactionSource.id],consistent?'available':'partial');
    }
  }
  const graph=graphStatistics(guide.graph);
  if(graph&&graph.nodes){
    const graphIds=sourceIds('network_graph','address_observation','transaction_observation');
    add('graph_structure','Structure of this graph sample',`${graph.nodes} displayed references and ${graph.records} connection records produce ${graph.unique_directed_connections} distinct directed connections after excluding ${graph.self_loops} self-links and ${graph.duplicate_directed_records} repeated directed records. Directed density: ${graph.density===null?'undefined for fewer than two references':graph.density}. This measures the displayed sample only, not chain coverage or ownership.`,graphIds);
    add('graph_degrees','Neighborhoods and components',`Largest distinct inbound neighborhood: ${graph.max_in_degree}; outbound: ${graph.max_out_degree}. The displayed graph has ${graph.weak_components} weakly connected component${graph.weak_components===1?'':'s'} and ${graph.isolated_nodes} isolated reference${graph.isolated_nodes===1?'':'s'}. Direction reflects source records, not proof that value traveled between owners.`,graphIds);
    derived.push({label:'Derived unique directed connections',value:String(graph.unique_directed_connections),unit:'connections'},
      {label:'Derived graph density',value:graph.density??'undefined',unit:'directed connections / possible pairs'},
      {label:'Derived maximum distinct in-degree',value:String(graph.max_in_degree),unit:'neighbors'},
      {label:'Derived maximum distinct out-degree',value:String(graph.max_out_degree),unit:'neighbors'});
  }else if(guide.graph&&(!graph||guide.graph.nodes?.length))add('graph_unknown','Graph interpretation unavailable','The graph did not meet the bounded node/edge contract. No degree, density or connectivity claims are made.',sourceIds('network_graph','address_observation','transaction_observation'),'unavailable');

  const rows=Array.isArray(guide.transactions)?guide.transactions:[],txs=rows.filter(row=>row&&row.asset===definition.asset&&typeof row.hash==='string'&&/^(?:0x)?[a-f0-9]{64}$/i.test(row.hash)).slice(0,20),distinct=new Set(txs.map(row=>row.hash.toLowerCase()));
  if(rows.length){
    const counts=Object.fromEntries(['successful','failed','confirmed','pending','source-reported'].map(status=>[status,txs.filter(row=>row.status===status).length]));
    const statusText=Object.entries(counts).filter(([,count])=>count).map(([status,count])=>`${count} ${status}`).join(', ')||'no supported status labels';
    const ignored=rows.length-txs.length;
    add('transaction_sample','Transaction sample and reported status',`${distinct.size} distinct transaction references across ${txs.length} supported displayed records: ${statusText}.${ignored?` ${ignored} unsupported or over-limit record${ignored===1?' was':'s were'} excluded.`:''} These are source-reported states. The sample does not establish complete history, owner identity, or independent finality. Input and output values are not added into a transfer total.`,sourceIds('transaction_observation','address_observation','network_graph'),ignored?'partial':'available');
  }

  const head=fact('Observed head height'),finalized=fact('Reported finalized height'),overview=sources.find(source=>source.id==='network_overview'&&source.status==='available');
  if(head&&finalized&&head.unit==='blocks'&&finalized.unit==='blocks'&&overview){
    const gap=BigInt(head.value)-BigInt(finalized.value);
    if(gap>=0n)add('checkpoint_gap','Reported checkpoint distance',`The network overview reports head ${head.value} and finalized checkpoint ${finalized.value}: ${gap} blocks apart. The reads may have different observation times. This is a numeric distance, not a finality delay estimate, reorganization proof, or an independently verified chain state.`,[overview.id]);
    else add('checkpoint_gap','Checkpoint ordering needs review',`The reported finalized height ${finalized.value} exceeds the observed head ${head.value}. The observations cannot support a nonnegative checkpoint distance. Different retrieval times, source inconsistency or chain changes remain unresolved; a reorganization is not inferred.`,[overview.id],'partial');
  }

  if(sources.length){
    const timed=sources.slice(0,3),freshness=timed.map(source=>`${text(source.title||source.id).slice(0,48)}: retrieval age ${age(source.retrieved_at,clock)}; observation age ${age(source.observed_at,clock)} (${source.status}).`);
    add('source_freshness','Source times remain separate',`At ${new Date(clock).toISOString()}, ${freshness.join(' ')}${sources.length>timed.length?' Additional sources are listed in the source cards.':''} A recent retrieval does not make an older or undated chain observation current.`,timed.map(source=>source.id),sources.some(source=>source.status!=='available'||timestamp(source.retrieved_at)===null||timestamp(source.observed_at)===null||timestamp(source.retrieved_at)>clock||timestamp(source.observed_at)>clock)?'partial':'available');
    const missing=sources.filter(source=>source.status!=='available');
    if(missing.length)add('source_coverage','Incomplete source coverage',`${available.length} of ${sources.length} public sources are available. ${missing.map(source=>text(source.title||source.id).slice(0,48)).join(', ')} ${missing.length===1?'is':'are'} unavailable or partial. Missing records are unknown, not zero, inactive addresses or failed transactions.`,sources.map(source=>source.id),available.length?'partial':'unavailable');
  }
  return {facts:derived.slice(0,4),insights};
}
