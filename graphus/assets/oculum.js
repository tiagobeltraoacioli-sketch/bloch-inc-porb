const canvas=document.getElementById('oculum-canvas');
const context=canvas.getContext('2d');
const assetSelect=document.getElementById('oculum-asset');
const addressInput=document.getElementById('oculum-address');
const identifierLabel=document.getElementById('oculum-identifier-label');
const form=document.getElementById('oculum-form');
const addButton=document.getElementById('oculum-add');
const batchInput=document.getElementById('oculum-batch-input');
const batchButton=document.getElementById('oculum-batch-add');
const blochButton=document.getElementById('oculum-load-bloch');
const sourceStatus=document.getElementById('oculum-source-status');
const coverage=document.getElementById('oculum-coverage');
const count=document.getElementById('oculum-count');
const list=document.getElementById('oculum-list');
const detail=document.getElementById('oculum-detail');
const filter=document.getElementById('oculum-filter');
const tooltip=document.getElementById('oculum-tooltip');
const colors={BTC:'#e9c985',ETH:'#b4d7a4',USDT:'#87c9ab',USDC:'#c6ced1',BLCH:'#baff28'};
const records=new Map();
const activityByKey=new Map();
const evidenceByKey=new Map();
let blochIndex=null;
const MAX_SAMPLE_PER_ASSET=64;
const MAX_BATCH=16;
let selectedKey=null;
let points=[];
let width=0,height=0,dpr=1;

function recordKey(asset,address){
  const normalized=asset==='BTC'&&!/^bc1/i.test(address)?address:address.toLowerCase();
  return `${asset}:${normalized}`;
}
function decimalLog(amount){
  if(!/^\d+$/.test(amount)||BigInt(amount)===0n)return 0;
  const digits=amount.replace(/^0+/, '');
  const take=Math.min(6,digits.length);
  return digits.length-take+Math.log10(Number(digits.slice(0,take)));
}
function formattedAmount(amount,asset,decimals){
  if(!/^\d+$/.test(amount||''))return 'Unavailable';
  const precision=decimals??({BTC:8,ETH:18,USDT:6,USDC:6,BLCH:8}[asset]??0);
  const scale=10n**BigInt(precision);
  const integer=BigInt(amount)/scale;
  const fraction=(BigInt(amount)%scale).toString().padStart(precision,'0').replace(/0+$/,'');
  return `${integer.toLocaleString('en-US')}${fraction?'.'+fraction:''} ${asset}`;
}
function observedTime(value){
  if(!value)return 'Not supplied by source';
  const parsed=new Date(value);
  if(Number.isNaN(parsed.getTime()))return String(value);
  return parsed.toISOString().replace('T',' ').replace('.000Z','Z');
}
function appendTime(parent,label,value){
  const row=document.createElement('div');
  const dt=document.createElement('dt');dt.textContent=label;
  const dd=document.createElement('dd');
  if(value&&!Number.isNaN(new Date(value).getTime())){
    const time=document.createElement('time');time.dateTime=new Date(value).toISOString();time.textContent=observedTime(value);dd.append(time);
  }else dd.textContent=observedTime(value);
  row.append(dt,dd);parent.append(row);
}
function currentRecords(){
  const asset=assetSelect.value.toUpperCase();
  return [...records.values()].filter(record=>record.asset===asset)
    .sort((a,b)=>BigInt(a.baseUnits)===BigInt(b.baseUnits)?a.address.localeCompare(b.address):(BigInt(a.baseUnits)>BigInt(b.baseUnits)?-1:1));
}
function assetRecordCount(asset){return [...records.values()].filter(record=>record.asset===asset).length;}
function clearBlochRecords(){
  for(const [key,record] of records)if(record.asset==='BLCH'){
    records.delete(key);evidenceByKey.delete(key);
  }
  blochIndex=null;
  selectedKey=null;
}
function setStatus(message,kind='neutral'){
  const dot=document.createElement('span');dot.className='oculum-source-dot';dot.setAttribute('aria-hidden','true');
  const body=document.createElement('div');
  const heading=document.createElement('strong');heading.textContent=kind==='success'?'Source-reported data':kind==='loading'?'Loading source':kind==='error'?'Lookup unavailable':'Source status';
  const paragraph=document.createElement('p');paragraph.textContent=message;
  body.append(heading,paragraph);sourceStatus.replaceChildren(dot,body);
  sourceStatus.dataset.state=kind;
}
function addRecord({asset,address,balance,observation,network,origin,independentVerification}){
  if(!address||!/^\d+$/.test(balance?.base_units||''))return false;
  const key=recordKey(asset,address);
  if(!records.has(key)&&assetRecordCount(asset)>=MAX_SAMPLE_PER_ASSET)return false;
  activityByKey.delete(key);
  if(origin==='indexed Bloch script hash')evidenceByKey.delete(key);
  records.set(key,{
    key,asset,address,baseUnits:balance.base_units,decimals:balance.decimals,
    unit:balance.unit,block:balance.block||null,scope:balance.scope||'source reported',
    contract:balance.contract||null,independentVerification:independentVerification===true,
    utxoCount:Number.isSafeInteger(balance.utxo_count)?balance.utxo_count:null,
    corroboration:balance.corroboration||observation?.corroboration||null,
    source:observation?.source_id||'public-chain source',
    retrievedAt:balance.retrieved_at||observation?.retrieved_at||null,
    coverage:observation?.coverage||'bounded address lookup',
    sourceHead:observation?.head_before_balance||null,
    neighborhood:observation?.neighborhood||null,
    limitations:Array.isArray(observation?.limitations)?observation.limitations:[],network,origin,
  });
  return true;
}
function renderDetail(record){
  detail.replaceChildren();
  if(!record){detail.textContent='Select a plotted identifier to inspect its exact amount and source.';return;}
  const title=document.createElement('h3');title.textContent=record.address;
  const dl=document.createElement('dl');
  const rows=[
    ['Held amount, source reported',formattedAmount(record.baseUnits,record.asset,record.decimals)],
    ['Exact base units',`${BigInt(record.baseUnits).toLocaleString('en-US')} ${record.unit}`],
    ['Network',record.network||'—'],
    ['Source',record.source],
    ['Balance scope',record.scope.replaceAll('_',' ')],
    ['Block anchor',record.block?`${record.block.height??'—'} · ${record.block.hash??'hash unavailable'}`:'No single pinned block for this source aggregate'],
    ['Source coverage',record.coverage.replaceAll('_',' ')],
    ['Origin',record.origin],
    ['Independent verification',record.independentVerification?'Yes':'No'],
  ];
  if(record.contract)rows.push(['Token contract',record.contract]);
  if(record.utxoCount!==null)rows.push(['Source-reported UTXOs',String(record.utxoCount)]);
  if(record.corroboration?.level)rows.push(['Source corroboration',record.corroboration.level]);
  if(record.sourceHead)rows.push(['Source head before balance',`slot ${record.sourceHead.slot} · height ${record.sourceHead.height} · source-finalized height ${record.sourceHead.finalized_height} · state root ${record.sourceHead.state_root}`]);
  if(record.neighborhood)rows.push(['Observed-neighbor lookups',`${record.neighborhood.enriched??0} balances returned of ${record.neighborhood.attempted??0} attempted`]);
  for(const [label,value] of rows){
    const row=document.createElement('div');
    const dt=document.createElement('dt');dt.textContent=label;
    const dd=document.createElement('dd');dd.textContent=value;
    row.append(dt,dd);dl.append(row);
  }
  appendTime(dl,'Retrieved at (UTC)',record.retrievedAt);
  if(record.block?.time)appendTime(dl,'Source block time (UTC)',record.block.time);
  const caveat=document.createElement('p');
  caveat.textContent=record.origin==='indexed Bloch script hash'
    ?'This ranks positive script hashes in the Bloch source index at one reported chain tip. A script hash does not identify an owner or all holdings controlled by one wallet. Graphus has not independently replayed the source state.'
    :'An address or script hash does not identify an owner or all holdings controlled by one wallet. Retrieval times and block anchors can differ. This queried sample is not a network-wide holder ranking.';
  detail.append(title,dl,caveat);
  const graphUrl=new URL('/constellation',location.origin);
  graphUrl.searchParams.set('asset',record.asset.toLowerCase());
  graphUrl.searchParams.set('address',record.address);
  const graphLink=document.createElement('a');
  graphLink.className='oculum-graph-link';
  graphLink.href=graphUrl.pathname+graphUrl.search;
  graphLink.textContent='Open this identifier in the source constellation ↗';
  detail.append(graphLink);
  if(record.limitations.length){
    const heading=document.createElement('h4');heading.textContent='Source limitations';
    const notes=document.createElement('ul');
    for(const limitation of record.limitations){const li=document.createElement('li');li.textContent=limitation;notes.append(li);}
    detail.append(heading,notes);
  }
  if(record.asset==='USDT'||record.asset==='USDC')renderTokenActivity(record);
  if(record.asset==='BTC'||record.asset==='BLCH')renderObservedActivity(record);
}
function renderObservedActivity(record){
  const panel=document.createElement('section');panel.className='oculum-activity';
  const heading=document.createElement('h4');heading.textContent=record.asset==='BTC'?'Observed Bitcoin transaction page':'Bloch script history';
  panel.append(heading);
  const state=evidenceByKey.get(record.key);
  if(!state&&record.origin==='indexed Bloch script hash'){
    const note=document.createElement('p');note.textContent='Loading a separate bounded script-history query…';panel.append(note);
    const request={status:'loading'};evidenceByKey.set(record.key,request);
    loadIndexedBlochEvidence(record,request);
  }else if(state?.status==='error'){
    const note=document.createElement('p');note.textContent=`History unavailable: ${state.error}. The indexed balance above remains a separate source observation.`;panel.append(note);
  }else if(state?.status==='loaded'){
    const data=state.data;
    const edges=Array.isArray(data.edges)?data.edges:[];
    const note=document.createElement('p');
    note.textContent=record.asset==='BTC'
      ?`${data.activity?.confirmed_tx_count??'—'} source-reported confirmed address transactions; ${edges.length} directed input/output observations returned from ${data.observation?.coverage||'a bounded page'}. Retrieved ${observedTime(data.observation?.retrieved_at)}. Inputs do not prove sender ownership.`
      :`${data.activity?.bounded_events??0} events in this bounded script-history response${Number.isSafeInteger(data.activity?.total_source_reported)?` of ${data.activity.total_source_reported} source-reported total`:''}. Retrieved ${observedTime(data.observation?.retrieved_at)}. History and the ranked balance are separate moving-chain observations.`;
    panel.append(note);
    if(edges.length){
      const list=document.createElement('ol');
      for(const edge of edges.slice(0,12)){
        const item=document.createElement('li');
        const title=document.createElement('strong');
        const label={observed_input_prevout:'Input prevout referenced',created_output:'Output created',
          observed_created_output:'Script output created',observed_spent_outpoint_reference:'Script outpoint spent'}[edge.kind]||'Observed transaction edge';
        title.textContent=`${label} · ${formattedAmount(edge.amount_base_units,record.asset,8)}`;
        const tx=document.createElement('span');tx.textContent=`Tx ${edge.txid} · block ${edge.block?.height??'—'}`;
        const path=document.createElement('small');path.textContent=`${edge.from} → ${edge.to}`;
        item.append(title,tx,path);list.append(item);
      }
      panel.append(list);
      if(edges.length>12){const more=document.createElement('p');more.textContent=`Showing 12 of ${edges.length} returned edges. The source response is already bounded and is not a complete transaction history.`;panel.append(more);}
    }else{
      const empty=document.createElement('p');empty.textContent='No transaction edges were returned in this bounded source view. This does not establish that the identifier has no history.';panel.append(empty);
    }
  }else{
    const note=document.createElement('p');note.textContent='No bounded transaction evidence was returned with this balance.';panel.append(note);
  }
  detail.append(panel);
}
async function loadIndexedBlochEvidence(record,request){
  try{
    const query=new URLSearchParams({network:'bloch',asset:'BLCH',address:record.address});
    const response=await fetch(`/api/chain/wallet?${query}`,{headers:{Accept:'application/json'}});
    const data=await response.json();
    if(!response.ok||data.status!=='source-reported')throw new Error(data.error||`HTTP ${response.status}`);
    if(evidenceByKey.get(record.key)!==request)return;
    evidenceByKey.set(record.key,{status:'loaded',data});
  }catch(error){
    if(evidenceByKey.get(record.key)!==request)return;
    evidenceByKey.set(record.key,{status:'error',error:error.message});
  }
  if(selectedKey===record.key)renderDetail(record);
}
function renderTokenActivity(record){
  const panel=document.createElement('section');panel.className='oculum-activity';
  const heading=document.createElement('h4');heading.textContent='Bounded token transfer logs';panel.append(heading);
  const state=activityByKey.get(record.key);
  if(!state){
    const message=document.createElement('p');message.textContent='Loading recent source-reported Transfer logs…';panel.append(message);
    const request={status:'loading'};
    activityByKey.set(record.key,request);
    loadTokenActivity(record,request);
  }else if(state.status==='error'){
    const message=document.createElement('p');message.textContent=`Transfer logs unavailable: ${state.error}. Balance above remains a separate source observation.`;panel.append(message);
  }else if(state.status==='loaded'){
    const data=state.data;
    const description=document.createElement('p');
    const window=data.observation?.block_window;
    description.textContent=`${data.activity?.event_count??0} events in source-reported finalized blocks ${window?.from??'—'}–${window?.to??'—'}; retrieved ${observedTime(data.observation?.retrieved_at)}. This bounded window is separate from the balance observation.`;
    panel.append(description);
    const events=(data.activity?.events||[]).slice(-8).reverse();
    if(events.length){
      const eventList=document.createElement('ol');
      for(const event of events){
        const row=document.createElement('li');
        const summary=document.createElement('strong');summary.textContent=`${event.direction} · ${formattedAmount(event.amount_base_units,record.asset,6)} · block ${event.block_number}`;
        const tx=document.createElement('span');tx.textContent=`Tx ${event.transaction_hash} · log ${event.log_index}`;
        const peers=document.createElement('small');peers.textContent=`From ${event.from} · To ${event.to}`;
        row.append(summary,tx,peers);eventList.append(row);
      }
      panel.append(eventList);
      if(data.activity.event_count>events.length){const remainder=document.createElement('p');remainder.textContent=`Showing the latest ${events.length} of ${data.activity.event_count} events in this bounded window.`;panel.append(remainder);}
    }else{
      const empty=document.createElement('p');empty.textContent='No Transfer logs returned for this identifier in the bounded block window. This is not evidence of no earlier activity.';panel.append(empty);
    }
  }else{
    const message=document.createElement('p');message.textContent='Loading recent source-reported Transfer logs…';panel.append(message);
  }
  detail.append(panel);
}
async function loadTokenActivity(record,request){
  try{
    const query=new URLSearchParams({asset:record.asset,address:record.address});
    const response=await fetch(`/api/chain/activity?${query}`,{headers:{Accept:'application/json'}});
    const data=await response.json();
    if(!response.ok||data.status!=='source-reported')throw new Error(data.error||`HTTP ${response.status}`);
    if(activityByKey.get(record.key)!==request)return;
    activityByKey.set(record.key,{status:'loaded',data});
  }catch(error){
    if(activityByKey.get(record.key)!==request)return;
    activityByKey.set(record.key,{status:'error',error:error.message});
  }
  if(selectedKey===record.key)renderDetail(record);
}
function renderList(items){
  list.replaceChildren();
  if(!items.length){list.textContent='Add a mainnet address or script hash to begin a bounded comparison.';return;}
  const query=filter.value.trim().toLowerCase();
  const visible=items.filter(record=>record.address.toLowerCase().includes(query));
  if(!visible.length){list.textContent='No identifier in this queried sample matches the filter.';return;}
  visible.forEach(record=>{
    const index=items.indexOf(record);
    const button=document.createElement('button');button.type='button';
    button.className=record.key===selectedKey?'selected':'';
    button.setAttribute('aria-pressed',String(record.key===selectedKey));
    const rank=document.createElement('small');rank.textContent=`${blochIndex&&record.asset==='BLCH'?'INDEX RANK':'SAMPLE RANK'} ${String(index+1).padStart(2,'0')} · ${record.origin}`;
    const address=document.createElement('strong');address.textContent=record.address;
    const amount=document.createElement('span');amount.textContent=formattedAmount(record.baseUnits,record.asset,record.decimals);
    const source=document.createElement('small');source.textContent=`${record.source} · ${observedTime(record.retrievedAt)} · ${record.block?'block anchored':'no shared block anchor'}`;
    button.append(rank,address,amount,source);
    button.addEventListener('click',()=>select(record.key));list.append(button);
  });
}
function select(key){
  selectedKey=key;
  render();
  const record=records.get(selectedKey);
  if(record)updateSelectedUrl(record);
}
function updateSelectedUrl(record){
  const url=new URL(location.href);
  url.searchParams.set('asset',record.asset.toLowerCase());
  url.searchParams.set('address',record.address);
  history.replaceState(null,'',url);
}
function resize(){
  const rect=canvas.getBoundingClientRect();
  width=rect.width;height=rect.height;dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  context.setTransform(dpr,0,0,dpr,0,0);
  draw();
}
function draw(){
  if(!width||!height)return;
  context.clearRect(0,0,width,height);
  const background=context.createRadialGradient(width*.48,height*.42,10,width*.5,height*.5,Math.max(width,height)*.7);
  background.addColorStop(0,'#1a2b19');background.addColorStop(.55,'#0b150c');background.addColorStop(1,'#050806');
  context.fillStyle=background;context.fillRect(0,0,width,height);
  context.strokeStyle='rgba(207,223,199,.11)';context.lineWidth=1;
  for(const part of [.2,.35,.5]){
    context.beginPath();context.ellipse(width*.5,height*.5,width*part,height*part,0,0,Math.PI*2);context.stroke();
  }
  const items=currentRecords();
  points=[];
  if(!items.length){
    context.fillStyle='#b5c2af';context.font='13px ui-monospace, monospace';
    context.textAlign='center';context.fillText('SEARCH AN ADDRESS TO ACTIVATE THE HEAT MAP',width*.5,height*.5);context.textAlign='left';
    return;
  }
  const values=items.map(item=>decimalLog(item.baseUnits));
  const low=Math.min(...values),high=Math.max(...values);
  items.forEach((record,index)=>{
    const level=high===low?.5:(values[index]-low)/(high-low);
    const angle=-Math.PI/2+(index-1)*2.399963229728653;
    const orbit=index===0?0:Math.min(width,height)*.40*Math.sqrt(index/Math.max(1,items.length-1));
    const x=width*.5+Math.cos(angle)*orbit,y=height*.5+Math.sin(angle)*orbit;
    points.push({record,x,y,level,radius:(items.length>24?4:6)+(items.length>24?10:16)*level});
  });
  for(const point of points){
    const radius=36+82*point.level;
    const glow=context.createRadialGradient(point.x,point.y,0,point.x,point.y,radius);
    const color=colors[point.record.asset]||'#baff28';
    glow.addColorStop(0,`rgba(186,255,40,${(.10+.23*point.level).toFixed(3)})`);
    glow.addColorStop(.45,`rgba(186,255,40,${(.04+.11*point.level).toFixed(3)})`);
    glow.addColorStop(1,'rgba(186,255,40,0)');
    context.fillStyle=glow;context.beginPath();context.arc(point.x,point.y,radius,0,Math.PI*2);context.fill();
    context.save();context.shadowBlur=15+35*point.level;context.shadowColor=color;
    context.globalAlpha=.55+.45*point.level;context.fillStyle=color;
    context.beginPath();context.arc(point.x,point.y,point.radius,0,Math.PI*2);context.fill();context.restore();
    if(point.record.key===selectedKey){
      context.strokeStyle='#f0f3eb';context.lineWidth=1.5;
      context.beginPath();context.arc(point.x,point.y,point.radius+7,0,Math.PI*2);context.stroke();
    }
    if(items.length<=24||point.record.key===selectedKey||items.indexOf(point.record)<8){
      context.fillStyle='#edf4e8';context.font='11px ui-monospace, monospace';
      context.fillText(point.record.address.slice(0,10)+'…',point.x+point.radius+10,point.y-8);
    }
  }
}
function render(){
  const items=currentRecords();
  const indexed=assetSelect.value.toUpperCase()==='BLCH'&&Boolean(blochIndex);
  document.getElementById('oculum-map-label').textContent=indexed?'OCULUM / BLOCH INDEXED SCRIPT BALANCES':'OCULUM / TOP 64 QUERIED IDENTIFIERS';
  document.getElementById('oculum-scope-label').textContent=indexed?'WITHIN BLOCH INDEX · ONE CHAIN TIP':'WITHIN ASSET · QUERIED SAMPLE';
  if(selectedKey&&!items.some(item=>item.key===selectedKey))selectedKey=items[0]?.key||null;
  if(!selectedKey&&items.length)selectedKey=items[0].key;
  count.textContent=`${items.length} ${items.length===1?'point':'points'}`;
  document.getElementById('oculum-empty').hidden=items.length>0;
  renderCoverage(items);
  renderList(items);
  renderDetail(items.find(item=>item.key===selectedKey));
  draw();
}
function renderCoverage(items){
  coverage.replaceChildren();
  if(assetSelect.value.toUpperCase()==='BLCH'&&blochIndex){
    const intro=document.createElement('p');
    intro.textContent=`${blochIndex.coverage.returned} ranked positive script hashes from ${blochIndex.coverage.positive_script_hashes_in_index} with positive balance in the Bloch source index. One reported tip: height ${blochIndex.anchor.height}, slot ${blochIndex.anchor.slot}, block ${blochIndex.anchor.block_id}.`;
    coverage.append(intro);
    const facts=document.createElement('ul');facts.className='oculum-quality-facts';
    for(const line of [
      `Indexed total: ${formattedAmount(blochIndex.coverage.indexed_total_sat,'BLCH',8)} across the source UTXO view.`,
      `Source lag: ${blochIndex.coverage.lag_slots} slots at retrieval ${observedTime(blochIndex.retrieved_at)}.`,
      blochIndex.coverage.health_head_advanced?'The source health head advanced after this ranked snapshot; values remain anchored to the earlier reported block.':blochIndex.coverage.health_head_behind?'The source health response reported an earlier nearby block; this ranking retains its own reported block anchor.':'The source health check reported the same block as this ranked snapshot.',
      `Source verification: ${blochIndex.coverage.source_verification}; Graphus has not independently replayed state.`,
      'A script hash is not a person or proof of common ownership. A reorganization can change the reported tip.',
    ]){const li=document.createElement('li');li.textContent=line;facts.append(li);}
    coverage.append(facts);
    return;
  }
  const intro=document.createElement('p');
  intro.textContent=items.length
    ?`${items.length} source-reported balances in this session's ${assetSelect.value.toUpperCase()} sample. Ranking is limited to these identifiers; there is no global holder denominator.`
    :'No identifiers loaded. Global largest-holder coverage is not available.';
  coverage.append(intro);
  if(!items.length)return;
  const sources=new Set(items.map(item=>item.source));
  const anchors=new Set(items.filter(item=>item.block?.hash).map(item=>item.block.hash));
  const pinned=items.filter(item=>item.block?.hash).length;
  const queried=items.filter(item=>item.origin.startsWith('queried ')).length;
  const dates=items.filter(item=>item.retrievedAt).map(item=>new Date(item.retrievedAt).getTime()).filter(Number.isFinite).sort((a,b)=>a-b);
  const metrics=document.createElement('div');metrics.className='oculum-quality-grid';
  for(const [label,value,note] of [
    ['Sample',`${items.length}/${MAX_SAMPLE_PER_ASSET}`,'Session limit for this asset; not chain coverage'],
    ['Direct queries',String(queried),'Other points are bounded observed neighbors'],
    ['Block anchored',`${pinned}/${items.length}`,'Anchor reported by source; not independently checked'],
    ['Sources',String(sources.size),'Independent verification is not implied'],
  ]){
    const cell=document.createElement('div');const small=document.createElement('small');small.textContent=label;
    const strong=document.createElement('strong');strong.textContent=value;
    const caption=document.createElement('span');caption.textContent=note;
    cell.append(small,strong,caption);metrics.append(cell);
  }
  coverage.append(metrics);
  const facts=document.createElement('ul');facts.className='oculum-quality-facts';
  const lines=[
    `Retrieved (UTC): ${dates.length?`${observedTime(new Date(dates[0]).toISOString())} to ${observedTime(new Date(dates.at(-1)).toISOString())}`:'not supplied'}.`,
    `Block alignment: ${pinned===items.length&&anchors.size===1?'all points report one block hash':pinned===0?'no point has a pinned block':'mixed or partial anchors; points are not one snapshot'}.`,
    'Source-reported values only; no independent balance reconciliation or ownership attribution.',
  ];
  for(const line of lines){const li=document.createElement('li');li.textContent=line;facts.append(li);}
  coverage.append(facts);
}
async function lookupAndAdd(asset,address,{includeNeighbors=true}={}){
  if(!blochIndex&&!records.has(recordKey(asset,address))&&assetRecordCount(asset)>=MAX_SAMPLE_PER_ASSET)throw new Error(`This asset sample is limited to ${MAX_SAMPLE_PER_ASSET} identifiers.`);
  if(asset==='BLCH'&&!/^[0-9a-f]{64}$/i.test(address))throw new Error('BLCH requires a 64-hex script hash.');
  const network=asset==='BTC'?'bitcoin':asset==='BLCH'?'bloch':'ethereum';
  const query=new URLSearchParams({network,asset,address});
  const response=await fetch(`/api/chain/wallet?${query}`,{headers:{Accept:'application/json'}});
  const data=await response.json();
  if(!response.ok||data.status!=='source-reported')throw new Error(data.message||data.error||`HTTP ${response.status}`);
  if(asset==='BLCH'&&blochIndex)clearBlochRecords();
  if(!addRecord({asset,address:data.address,balance:data.balance,observation:data.observation,network:data.network,origin:asset==='BLCH'?'queried script hash':'queried address',independentVerification:data.independent_verification}))throw new Error('Asset sample capacity was reached.');
  if(asset==='BTC'||asset==='BLCH')evidenceByKey.set(recordKey(asset,data.address),{status:'loaded',data});
  let enriched=0;
  if(includeNeighbors){
    for(const node of data.nodes||[]){
      if(node.kind!=='address'||node.address===data.address||!node.balance)continue;
      const before=records.size;
      if(addRecord({asset,address:node.address,balance:node.balance,observation:{...data.observation,retrieved_at:node.balance.retrieved_at,coverage:'bounded observed-neighbor address summary'},network:data.network,origin:'address seen in bounded BTC transaction page',independentVerification:data.independent_verification})&&records.size>before)enriched++;
    }
  }
  selectedKey=recordKey(asset,data.address);
  render();
  updateSelectedUrl(records.get(selectedKey));
  return {source:data.observation?.source_id||'public source',enriched};
}
async function loadBlochIndex(){
  blochButton.disabled=true;addButton.disabled=true;batchButton.disabled=true;
  setStatus('Loading the ranked Bloch script balances and checking the source tip…','loading');
  try{
    const response=await fetch('/api/chain/holders?asset=BLCH',{headers:{Accept:'application/json'}});
    const data=await response.json();
    if(!response.ok||data.status!=='source-reported'||!Array.isArray(data.holders))throw new Error(data.error||`HTTP ${response.status}`);
    clearBlochRecords();
    for(const row of data.holders){
      addRecord({asset:'BLCH',address:row.script_hash,
        balance:{base_units:row.balance_sat,decimals:8,unit:'sat',scope:'indexed_canonical_script_hash_balance',
          utxo_count:row.utxo_count,block:{height:data.anchor.height,hash:data.anchor.block_id,slot:data.anchor.slot}},
        observation:{source_id:data.source,retrieved_at:data.retrieved_at,
          coverage:'positive script hashes in indexed canonical state',limitations:data.limitations},
        network:data.network,origin:'indexed Bloch script hash',independentVerification:data.independent_verification});
    }
    blochIndex=data;
    assetSelect.value='blch';updateIdentifierInput();
    render();
    setStatus(`${data.coverage.returned} Bloch scripts ranked at source height ${data.anchor.height}; ${data.coverage.positive_script_hashes_in_index} positive scripts in the index. Source-reported, with no owner attribution.`,'success');
  }catch(error){setStatus(`Bloch index unavailable: ${error.message}. Previously loaded values, if any, remain on screen with their original anchor.`,'error');}
  finally{blochButton.disabled=false;addButton.disabled=false;batchButton.disabled=false;}
}
async function addAddress(event){
  event?.preventDefault();
  const asset=assetSelect.value.toUpperCase(),address=addressInput.value.trim();
  addButton.disabled=true;batchButton.disabled=true;
  setStatus(`Loading ${asset} source data for ${address}…`,'loading');
  try{
    const result=await lookupAndAdd(asset,address);
    setStatus(`${asset} source-reported balance loaded from ${result.source}${asset==='BTC'?`; ${result.enriched} observed-neighbor balances added`:''}. No ownership attribution.`, 'success');
  }catch(error){setStatus(`Lookup unavailable: ${error.message}. No balance was added.`,'error');}
  finally{addButton.disabled=false;batchButton.disabled=false;}
}
async function addBatch(){
  const asset=assetSelect.value.toUpperCase();
  const inputs=[...new Set(batchInput.value.split(/[\s,;]+/).map(value=>value.trim()).filter(Boolean))];
  if(!inputs.length||inputs.length>MAX_BATCH){setStatus(`Paste 1 to ${MAX_BATCH} identifiers for one asset per batch.`,'error');return;}
  addButton.disabled=true;batchButton.disabled=true;assetSelect.disabled=true;
  let loaded=0,failed=0;
  setStatus(`Querying ${inputs.length} ${asset} identifiers from public sources…`,'loading');
  let cursor=0;
  async function worker(){
    while(cursor<inputs.length){
      const address=inputs[cursor++];
      try{await lookupAndAdd(asset,address,{includeNeighbors:false});loaded++;}
      catch{failed++;}
      setStatus(`${loaded+failed}/${inputs.length} checked · ${loaded} loaded · ${failed} unavailable. Ranking covers this queried sample only.`,'loading');
    }
  }
  try{await Promise.all([worker(),worker()]);
    setStatus(`${loaded} ${asset} balances loaded; ${failed} unavailable. The map ranks at most ${MAX_SAMPLE_PER_ASSET} identifiers queried for this asset, not the entire network.`,failed?'error':'success');
    if(!failed)batchInput.value='';
  }finally{addButton.disabled=false;batchButton.disabled=false;assetSelect.disabled=false;}
}

form.addEventListener('submit',addAddress);
batchButton.addEventListener('click',addBatch);
blochButton.addEventListener('click',loadBlochIndex);
assetSelect.addEventListener('change',()=>{
  updateIdentifierInput();render();
  const record=records.get(selectedKey);
  if(record&&record.asset===assetSelect.value.toUpperCase())updateSelectedUrl(record);
  else{const url=new URL(location.href);url.searchParams.delete('address');url.searchParams.set('asset',assetSelect.value);history.replaceState(null,'',url);}
});
function updateIdentifierInput(){
  const blch=assetSelect.value.toUpperCase()==='BLCH';
  identifierLabel.textContent=blch?'Script hash (64 hex)':'Address';
  addressInput.placeholder=blch?'Paste a 64-hex Bloch script hash':'Paste a public address';
  addressInput.maxLength=blch?64:128;
}
filter.addEventListener('input',()=>renderList(currentRecords()));
canvas.addEventListener('click',event=>{
  const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
  const hit=[...points].reverse().find(point=>Math.hypot(x-point.x,y-point.y)<Math.max(14,point.radius+7));
  if(hit)select(hit.record.key);
});
canvas.addEventListener('pointermove',event=>{
  const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
  const hit=[...points].reverse().find(point=>Math.hypot(x-point.x,y-point.y)<Math.max(16,point.radius+8));
  if(!hit){tooltip.hidden=true;return;}
  tooltip.textContent=`${hit.record.address} · ${formattedAmount(hit.record.baseUnits,hit.record.asset,hit.record.decimals)} · ${hit.record.source}`;
  tooltip.hidden=false;
  tooltip.style.left=`${Math.min(x+14,Math.max(8,width-tooltip.offsetWidth-8))}px`;
  tooltip.style.top=`${Math.max(8,y-52)}px`;
});
canvas.addEventListener('pointerleave',()=>{tooltip.hidden=true;});
new ResizeObserver(resize).observe(canvas);
const url=new URL(location.href);
const initialAddress=url.searchParams.get('address');
const initialAsset=url.searchParams.get('asset');
if(initialAsset&&colors[initialAsset.toUpperCase()])assetSelect.value=initialAsset.toLowerCase();
updateIdentifierInput();
if(initialAddress){addressInput.value=initialAddress;addAddress();}
else if(assetSelect.value==='blch')loadBlochIndex();
render();
