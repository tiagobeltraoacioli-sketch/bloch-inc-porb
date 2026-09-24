const canvas = document.getElementById('evidence-constellation');
const context = canvas.getContext('2d');
let realObservation=null;
let realRequest=0;
let realAddressTargets=[];
let realTransactionTargets=[];
let selectedRealTransactionId=null;
let selectedRealEventId=null;
let selectedTokenBlockBucket=null;
let realGraphViewCache=null;
let realKeyboardIndex=0;
function getRealGraphView(data){
  if(realGraphViewCache?.data===data&&realGraphViewCache.eventId===selectedRealEventId
    &&realGraphViewCache.transactionId===selectedRealTransactionId)return realGraphViewCache.view;
  const view=GraphusSourceGraphView.selectVisibleSourceNodes(data,{
    selectedEventId:selectedRealEventId,selectedTransactionId:selectedRealTransactionId});
  realGraphViewCache={data,eventId:selectedRealEventId,transactionId:selectedRealTransactionId,view};
  return view;
}
const syntheticCanvasHelp=document.getElementById('constellation-help').textContent;
const sourceStatus = document.createElement('details');
sourceStatus.className = 'source-status';
sourceStatus.innerHTML = `<summary><span class="source-status-dot" aria-hidden="true"></span><strong>Data source status</strong><span>synthetic map · optional live lookup</span></summary>
  <div class="source-status-body">
    <p>The default constellation uses generated wallet examples. Mainnet address and Bloch script-hash lookups report public source facts only when their sources respond. They do not identify owners, produce model predictions, or reveal AML scores.</p>
    <div class="source-status-scroll"><table><caption>Data availability by asset</caption><thead><tr><th scope="col">Asset</th><th scope="col">Research input</th><th scope="col">Public identifier lookup</th></tr></thead><tbody>
      <tr><th scope="row">BTC</th><td>Bounded private block sample</td><td>Esplora source reported</td></tr>
      <tr><th scope="row">ETH</th><td>Bounded private finalized-block sample</td><td>Configured RPC source reported</td></tr>
      <tr><th scope="row">USDT · ERC-20</th><td>Bounded Ethereum event sample</td><td>Configured RPC source reported</td></tr>
      <tr><th scope="row">USDC · ERC-20</th><td>Bounded Ethereum event sample</td><td>Configured RPC source reported</td></tr>
      <tr><th scope="row">BLCH</th><td>Bounded private finalized sample</td><td>Archival script-hash balance, source reported</td></tr>
    </tbody></table></div>
    <p>Sampled records do not establish network history coverage or AML effectiveness. <a href="daas.html">Read the data product status ↗</a></p>
  </div>`;
document.getElementById('wallet-search-status').after(sourceStatus);
const liveTransactionDetail=document.createElement('section');
liveTransactionDetail.className='live-transaction-detail';
liveTransactionDetail.setAttribute('aria-label','Selected public-chain transaction');
liveTransactionDetail.setAttribute('aria-live','polite');
liveTransactionDetail.hidden=true;
document.querySelector('.record-card .transaction-fan').before(liveTransactionDetail);
const sourceMetricsPanel=document.createElement('section');
sourceMetricsPanel.className='source-metrics-panel';
sourceMetricsPanel.setAttribute('aria-label','Bounded public-chain metrics');
sourceMetricsPanel.hidden=true;
liveTransactionDetail.before(sourceMetricsPanel);
const liveButton=document.createElement('button');
liveButton.type='button';liveButton.id='load-live-address';liveButton.textContent='Load public-chain address';
document.querySelector('.constellation-controls').append(liveButton);
const exportButton=document.createElement('button');
exportButton.type='button';exportButton.id='download-observation';exportButton.className='live-export';
exportButton.textContent='Download current observation JSON';exportButton.hidden=true;
liveButton.after(exportButton);
exportButton.addEventListener('click',()=>{
  try{
    const bundle=GraphusObservationExport.buildObservationBundle(realObservation);
    const blob=new Blob([JSON.stringify(bundle,null,2)+'\n'],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const filename=`graphus_${bundle.query.asset.toLowerCase()}_${bundle.query.address.replace(/[^a-zA-Z0-9]/g,'').slice(0,20)}_${bundle.exported_at.replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')}.json`;
    const link=document.createElement('a');link.href=url;link.download=filename;
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }catch(error){
    document.getElementById('wallet-search-status').textContent=`Observation export unavailable: ${error.message}`;
  }
});
function setDataMode(mode,detail){
  const status=document.getElementById('constellation-data-status');
  status.dataset.mode=mode;
  document.body.dataset.constellationMode=mode;
  document.getElementById('constellation-data-mode').textContent=mode==='source-reported'?'Source-reported public-chain data':mode==='loading'?'Loading public-chain data':'Synthetic preview';
  document.getElementById('constellation-data-detail').textContent=detail;
  exportButton.hidden=mode!=='source-reported';
  document.querySelector('.constellation-stage-top span').textContent=mode==='source-reported'?(realObservation?.asset==='BLCH'?'GRAPHUS / PUBLIC-CHAIN SCRIPT HASH':'GRAPHUS / PUBLIC-CHAIN ADDRESS'):'GRAPHUS / SYNTHETIC WALLETS';
  document.querySelector('.constellation-stage-bottom span').textContent=mode==='source-reported'?'CENTRAL STAR = SOURCE-REPORTED HELD AMOUNT':'STAR SIZE + BRIGHTNESS = HELD AMOUNT / ASSET';
  document.getElementById('constellation-help').textContent=mode==='source-reported'
    ?(realObservation?.tokenActivity
      ?'The central star is the queried public address. The canvas plots up to 36 other addresses ranked by returned log count; the selected log peer is always included. The source-record list and JSON export retain the full bounded response. Other addresses have no balance scale or owner attribution.'
      :'The central star is the queried public identifier. Squares are returned transaction records; select one by clicking it, using the source-record list, or focusing the canvas and pressing the arrow keys and Enter. Arrows show only source-returned input/output references. Bitcoin and Bloch inputs do not prove sender ownership.')
    :syntheticCanvasHelp;
  if(mode==='synthetic'){
    selectedRealTransactionId=null;
    selectedRealEventId=null;
    selectedTokenBlockBucket=null;
    liveTransactionDetail.hidden=true;
    sourceMetricsPanel.hidden=true;
    document.querySelector('.transaction-fan > p').textContent='TRANSACTION FAN / SYNTHETIC';
    canvas.setAttribute('aria-label','Synthetic wallet constellation. Use arrow keys to choose a wallet, then Enter to inspect it.');
  }
}
function formatObservedBalance(baseUnits,asset,decimals){
  if(!/^\d+$/.test(baseUnits||''))return 'Unavailable';
  const precision=decimals??({BTC:8,ETH:18,USDT:6,USDC:6,BLCH:8}[asset]??0);
  const whole=BigInt(baseUnits)/10n**BigInt(precision);
  const fraction=(BigInt(baseUnits)%10n**BigInt(precision)).toString().padStart(precision,'0').replace(/0+$/,'');
  return `${whole.toLocaleString('en-US')}${fraction?'.'+fraction:''} ${asset} (${BigInt(baseUnits).toLocaleString('en-US')} base units)`;
}
function assetForLiveAddress(address){
  if(activeAsset==='blch'&&/^[0-9a-fA-F]{64}$/.test(address))return 'BLCH';
  if(/^0x[0-9a-fA-F]{40}$/.test(address))return ['usdt','usdc'].includes(activeAsset)?activeAsset.toUpperCase():'ETH';
  if(/^(bc1[ac-hj-np-z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/i.test(address))return 'BTC';
  return null;
}
function renderSourceMetrics(data){
  sourceMetricsPanel.replaceChildren();
  let metrics,graphView;
  try{
    metrics=GraphusSourceMetrics.summarizeObservation(data);
    graphView=getRealGraphView(data);
  }
  catch{
    const message=document.createElement('p');message.textContent='Bounded observation metrics are unavailable for this source response.';
    sourceMetricsPanel.append(message);sourceMetricsPanel.hidden=false;return;
  }
  const heading=document.createElement('h3');heading.textContent='Observed data · source bounded';
  const grid=document.createElement('div');grid.className='source-metrics-grid';
  const add=(label,value,note)=>{
    const item=document.createElement('div');
    const name=document.createElement('small');name.textContent=label;
    const number=document.createElement('strong');number.textContent=value;
    const caption=document.createElement('span');caption.textContent=note;
    item.append(name,number,caption);grid.append(item);
  };
  add('Canvas points',`${graphView.visible.length} / ${graphView.total}`,
    graphView.omitted?`${graphView.omitted} returned points omitted from the canvas; full bounded evidence remains in the JSON export`:'All returned source points are plotted');
  if(metrics.kind==='utxo_observations'){
    add('Transaction records',String(metrics.transaction_records),'Returned in this bounded response');
    add('Directed references',String(metrics.returned_edges),'Input and output references remain separate');
    add('Other identifiers',String(metrics.observed_other_identifiers),'Observed in returned records; no owner grouping');
    if(metrics.source_reported_confirmed_tx_count!==null)
      add('Source tx count',String(metrics.source_reported_confirmed_tx_count),'Address aggregate reported by source; not this page size');
    const labels=metrics.asset==='BTC'
      ?[['observed_input_prevout','Input prevouts referenced'],['created_output','Outputs created']]
      :[['observed_spent_outpoint_reference','Spent outpoints referenced'],['observed_created_output','Script outputs created']];
    for(const [kind,label] of labels){
      const group=metrics.groups[kind];
      add(label,formatObservedBalance(group.base_units,metrics.asset),`${group.count} returned ${group.count===1?'reference':'references'}; not economic transfer volume`);
    }
  }else if(metrics.kind==='erc20_transfer_logs'){
    add('Transfer logs',String(metrics.returned_events),'Returned in the bounded finalized-block window');
    add('Other addresses',String(metrics.observed_other_identifiers),'Seen in returned logs; no owner grouping');
    const anchors=data.tokenAnchorComparison;
    if(anchors){
      add('Balance block',String(anchors.balance.height),anchors.balance.hash);
      add('Log window head',String(anchors.logs.height),anchors.logs.hash);
      add('Balance retrieved',data.observation?.retrieved_at||'Unavailable','Separate source request');
      add('Logs retrieved',data.tokenObservation?.retrieved_at||'Unavailable','Separate source request');
      const distance=Math.abs(anchors.height_difference);
      add('Anchor comparison',anchors.status==='same_source_anchor'?'Same source block':`${distance} ${distance===1?'block':'blocks'} apart`,
        anchors.status==='same_source_anchor'?'Matching height and hash; not a balance reconciliation':'Balance and log results were retrieved at separate finalized heads');
    }
    add('Active blocks',`${metrics.block_activity.active_blocks} / ${metrics.block_activity.total_blocks}`,'Blocks with at least one returned Transfer log');
    add('Busiest block',metrics.block_activity.busiest_block
      ?`${metrics.block_activity.busiest_block.height} · ${metrics.block_activity.busiest_block.count} logs`:'None observed',
      'Among returned logs in this window');
    for(const [direction,label] of [['incoming','Incoming logs'],['outgoing','Outgoing logs'],['self','Self logs']]){
      const group=metrics.groups[direction];
      add(label,formatObservedBalance(group.base_units,metrics.asset,6),`${group.count} returned ${group.count===1?'log':'logs'}`);
    }
  }else add('Activity coverage','Balance only','No transaction index is connected for this observation');
  sourceMetricsPanel.append(heading,grid);
  if(metrics.kind==='erc20_transfer_logs'&&metrics.block_activity.buckets.length){
    const timeline=document.createElement('div');timeline.className='source-block-timeline';
    const title=document.createElement('h4');title.textContent='Returned logs by block range';
    const description=document.createElement('p');description.textContent='Bars count returned logs, including empty ranges. Choose a range to filter the source-record list; the constellation still shows the full returned window.';
    const controls=document.createElement('div');controls.className='source-block-timeline-controls';
    const all=document.createElement('button');all.type='button';all.textContent='All returned logs';
    all.setAttribute('aria-pressed',String(!selectedTokenBlockBucket));
    all.addEventListener('click',()=>filterTokenBlockBucket(null));controls.append(all);
    const peak=Math.max(1,...metrics.block_activity.buckets.map(bucket=>bucket.count));
    for(const bucket of metrics.block_activity.buckets){
      const button=document.createElement('button');button.type='button';
      button.setAttribute('aria-pressed',String(selectedTokenBlockBucket?.from===bucket.from&&selectedTokenBlockBucket?.to===bucket.to));
      const label=document.createElement('span');label.textContent=`${bucket.from}–${bucket.to} · ${bucket.count} ${bucket.count===1?'log':'logs'}`;
      const bar=document.createElement('span');bar.className='source-block-timeline-bar';
      const fill=document.createElement('i');fill.style.width=`${bucket.count/peak*100}%`;bar.append(fill);
      const directions=document.createElement('small');
      directions.textContent=`in ${bucket.groups.incoming.count} · out ${bucket.groups.outgoing.count} · self ${bucket.groups.self.count}`;
      button.append(label,bar,directions);
      button.addEventListener('click',()=>filterTokenBlockBucket({from:bucket.from,to:bucket.to}));
      controls.append(button);
    }
    timeline.append(title,description,controls);sourceMetricsPanel.append(timeline);
  }
  const provenance=document.createElement('p');
  provenance.textContent=`Source: ${metrics.source}. Blocks: ${metrics.block_range?`${metrics.block_range.from}–${metrics.block_range.to}`:'not supplied'}. Coverage: ${metrics.coverage}. ${metrics.caveat}`;
  sourceMetricsPanel.append(provenance);
  sourceMetricsPanel.hidden=false;
}
function filterTokenBlockBucket(bucket){
  selectedTokenBlockBucket=bucket;
  selectedRealEventId=null;
  liveTransactionDetail.hidden=true;
  if(realObservation?.tokenActivity)renderLiveSourceRecords(realObservation);
  draw();
}
function renderLiveSourceRecords(data){
  const activity=data.tokenActivity;
  setText('record-related',activity
    ?`${activity.event_count} Transfer logs in a bounded window · ${data.nodes.length-1} observed peer addresses`
    :`${data.nodes?.length||0} source nodes · ${data.edges?.length||0} observation links`);
  const list=document.getElementById('transaction-list');list.replaceChildren();
  if(activity){
    const heading=document.createElement('p');
    const window=data.tokenObservation?.block_window;
    const shown=selectedTokenBlockBucket
      ?activity.events.filter(event=>event.block_number>=selectedTokenBlockBucket.from&&event.block_number<=selectedTokenBlockBucket.to)
      :activity.events;
    heading.className='live-source-record';
    heading.textContent=`${activity.event_count} source-reported Transfer logs, blocks ${window?.from??'—'}–${window?.to??'—'}. ${selectedTokenBlockBucket?`Showing ${shown.length} in selected range ${selectedTokenBlockBucket.from}–${selectedTokenBlockBucket.to}. `:''}The balance above was queried separately. Peer balances are unknown.`;
    list.append(heading);
    for(const event of shown.slice().reverse()){
      const row=document.createElement('button');row.type='button';row.className='live-source-record';
      row.dataset.eventId=event.event_id;
      row.setAttribute('aria-pressed',String(event.event_id===selectedRealEventId));
      row.textContent=`${event.direction} · ${formatObservedBalance(event.amount_base_units,data.asset,6)} · block ${event.block_number} · tx ${event.transaction_hash} · from ${event.from} · to ${event.to}`;
      row.addEventListener('click',()=>selectRealTokenEvent(event.event_id));
      list.append(row);
    }
    if(!shown.length){const empty=document.createElement('p');empty.className='live-source-record';empty.textContent='No Transfer logs were returned in this selected range.';list.append(empty);}
  }else{
    (data.nodes||[]).forEach(node=>{
      const actionable=(node.kind==='address'&&node.address)||node.kind==='transaction';
      const row=document.createElement(actionable?'button':'div');
      row.className='live-source-record';
      row.textContent=`${node.kind||'record'} · ${node.txid||node.address||node.id}${node.balance?.base_units?` · ${formatObservedBalance(node.balance.base_units,data.asset,node.balance.decimals)}`:''}`;
      if(node.kind==='transaction'){
        row.type='button';row.dataset.transactionId=node.id;
        row.setAttribute('aria-pressed',String(node.id===selectedRealTransactionId));
        row.addEventListener('click',()=>selectRealTransaction(node.id));
      }else if(row.tagName==='BUTTON'){
        row.type='button';
        row.addEventListener('click',()=>inspectRealAddress(node.address));
      }
      list.append(row);
    });
  }
  if(!list.childElementCount)list.textContent='No bounded transaction records were returned. Balance provenance is shown above.';
  renderSourceMetrics(data);
}
function selectRealTokenEvent(id){
  const data=realObservation;
  const event=data?.tokenActivity?.events?.find(item=>item.event_id===id);
  if(!event)return;
  selectedRealEventId=id;
  liveTransactionDetail.replaceChildren();
  const heading=document.createElement('h3');heading.textContent='Observed ERC-20 Transfer log';
  const summary=document.createElement('p');
  summary.textContent=`${data.asset} · ${event.direction} · ${formatObservedBalance(event.amount_base_units,data.asset,6)}. This log does not establish address ownership, intent, or complete transaction history.`;
  liveTransactionDetail.append(heading,summary);
  const facts=document.createElement('dl');
  for(const [label,value] of [
    ['Event ID',event.event_id],['Transaction hash',event.transaction_hash],
    ['Block height',event.block_number],['Block hash',event.block_hash],
    ['Transaction index',event.transaction_index],['Log index',event.log_index],
    ['From address',event.from],['To address',event.to],
    ['Token contract',data.tokenActivityContract||'Source-configured contract'],
    ['Source',data.tokenObservation?.source_id||'Public-chain source'],
    ['Observation scope',data.tokenObservation?.coverage||'Bounded finalized-block window'],
  ]){
    const item=document.createElement('div');
    const name=document.createElement('dt');name.textContent=label;
    const detail=document.createElement('dd');detail.textContent=String(value??'Unavailable');
    item.append(name,detail);facts.append(item);
  }
  liveTransactionDetail.append(facts);
  liveTransactionDetail.hidden=false;
  for(const button of document.querySelectorAll('#transaction-list [data-event-id]'))
    button.setAttribute('aria-pressed',String(button.dataset.eventId===id));
  setText('evidence-reference',id);
  draw();
}
function selectRealTransaction(id){
  const data=realObservation;
  const node=data?.nodes?.find(item=>item.kind==='transaction'&&item.id===id);
  if(!node)return;
  selectedRealTransactionId=id;
  const edges=(data.edges||[]).filter(edge=>edge.from===id||edge.to===id);
  liveTransactionDetail.replaceChildren();
  const heading=document.createElement('h3');heading.textContent='Observed transaction';
  const summary=document.createElement('p');
  summary.textContent=`${node.txid||id} · source-reported block ${node.block?.height??'unavailable'} · ${edges.length} returned input/output references. These edges do not prove who controlled an input.`;
  liveTransactionDetail.append(heading,summary);
  const facts=document.createElement('dl');
  for(const [label,value] of [
    ['Transaction ID',node.txid||id],['Block hash',node.block?.hash||'Unavailable'],
    ['Block time',node.block?.time||'Unavailable'],
    ['Source',data.observation?.source_id||'Public-chain source'],
    ['Observation scope',data.observation?.coverage||'Bounded source response'],
  ]){
    const item=document.createElement('div');
    const name=document.createElement('dt');name.textContent=label;
    const detail=document.createElement('dd');detail.textContent=value;
    item.append(name,detail);facts.append(item);
  }
  liveTransactionDetail.append(facts);
  const edgeList=document.createElement('ol');
  for(const edge of edges.slice(0,24)){
    const item=document.createElement('li');
    item.textContent=`${edge.kind.replaceAll('_',' ')} · ${formatObservedBalance(edge.amount_base_units,data.asset)} · ${edge.from} → ${edge.to}`;
    edgeList.append(item);
  }
  if(edges.length)liveTransactionDetail.append(edgeList);
  if(edges.length>24){const more=document.createElement('p');more.textContent=`Showing 24 of ${edges.length} references returned for this transaction.`;liveTransactionDetail.append(more);}
  liveTransactionDetail.hidden=false;
  for(const button of document.querySelectorAll('#transaction-list [data-transaction-id]')){
    button.setAttribute('aria-pressed',String(button.dataset.transactionId===id));
  }
  setText('evidence-reference',node.txid||id);
  draw();
}
function combineTokenActivity(wallet,activity){
  if(activity.status!=='source-reported'||activity.network!==wallet.network||activity.asset!==wallet.asset
    ||activity.address?.toLowerCase()!==wallet.address?.toLowerCase()
    ||!Array.isArray(activity.nodes)||!Array.isArray(activity.edges)
    ||!Array.isArray(activity.activity?.events)||activity.edges.length>256||activity.nodes.length>513){
    throw new Error('inconsistent_token_activity');
  }
  const anchors=GraphusSourceMetrics.compareTokenAnchors(wallet,activity);
  const root=wallet.nodes?.find(node=>node.address?.toLowerCase()===wallet.address.toLowerCase());
  return {...wallet,address:activity.address,
    nodes:activity.nodes.map(node=>node.address?.toLowerCase()===activity.address.toLowerCase()?{...node,balance:root?.balance}:node),
    edges:activity.edges,tokenActivity:activity.activity,tokenActivityContract:activity.contract,
    tokenObservation:activity.observation,tokenAnchorComparison:anchors};
}
async function loadLiveAddress(){
  const address=document.getElementById('record-search').value.trim();
  const asset=assetForLiveAddress(address);
  if(!asset){
    realObservation=null;clearWallet();
    setDataMode('synthetic','Enter a Bitcoin or Ethereum mainnet address, or choose BLCH and enter a 64-hex script hash. For USDT or USDC, choose that asset filter first.');
    draw();return;
  }
  const requestId=++realRequest;
  selectedRealTransactionId=null;
  selectedRealEventId=null;
  selectedTokenBlockBucket=null;
  realKeyboardIndex=0;
  liveTransactionDetail.hidden=true;
  sourceMetricsPanel.hidden=true;
  liveButton.disabled=true;
  setDataMode('loading',`Requesting ${asset} address facts from the configured public-chain source…`);
  try{
    const query=new URLSearchParams({network:asset==='BTC'?'bitcoin':asset==='BLCH'?'bloch':'ethereum',asset,address});
    const response=await fetch(`/api/chain/wallet?${query}`,{headers:{Accept:'application/json'}});
    const data=await response.json();
    if(requestId!==realRequest)return;
    if(!response.ok||data.status!=='source-reported')throw new Error(data.error||data.reason||`Source returned HTTP ${response.status}`);
    clearWallet();
    realObservation=data;
    const unit=data.balance?.unit||'base units';
    const baseUnits=data.balance?.base_units;
    setDataMode('source-reported',`${data.asset} · ${data.observation?.source_id||'public-chain source'} · retrieved ${data.observation?.retrieved_at||'time unavailable'} · independently verified by Graphus: no. Control and ownership are unknown.`);
    document.getElementById('wallet-search-status').textContent=`${data.asset} public-chain ${data.asset==='BLCH'?'script hash':'address'} loaded from ${data.observation?.source_id||'a configured source'}. The constellation shows bounded source records and a source-reported held amount.`;
    setText('record-type',`PUBLIC-CHAIN ${data.asset==='BLCH'?'SCRIPT HASH':'ADDRESS'} / ${data.asset}`);
    setText('record-id',data.address);
    setText('record-summary',`Source-reported ${data.asset==='BLCH'?'script-hash':'address'} facts. The central star scales with the reported held amount; satellite points are source records, not identified people or owners.`);
    setText('record-asset',data.asset);
    setText('record-holdings',formatObservedBalance(baseUnits,data.asset,data.balance?.decimals));
    setText('record-time',data.balance?.block?.time||data.observation?.retrieved_at||'—');
    setText('record-source',data.observation?.source_id||'—');
    setText('record-meaning','No model output or AML score.');
    setText('evidence-network',data.network||'—');
    setText('evidence-type',`Source-reported ${data.asset==='BLCH'?'script-hash':'address'} balance and bounded activity`);
    setText('evidence-reference',data.balance?.block?.hash||data.balance?.block?.height||data.observation?.head_before_balance?.state_root||'Source tip');
    setText('evidence-finality',data.balance?.scope||'Source reported');
    setText('evidence-limit',(data.observation?.limitations||[]).join(' ' )||'No independent chain-state verification.');
    document.querySelector('.transaction-fan > p').textContent='SOURCE RECORDS / PUBLIC CHAIN';
    renderLiveSourceRecords(data);
    const canvasInstruction=['BTC','BLCH'].includes(data.asset)
      ?'Focus and use arrow keys to choose a returned transaction, then Enter to inspect.'
      :data.asset==='ETH'?'No transaction index is connected for native ETH.'
        :'Select returned Transfer logs in the source-record list when available.';
    canvas.setAttribute('aria-label',`Source-reported ${data.asset} ${data.asset==='BLCH'?'script hash':'address'} ${data.address}; balance ${baseUnits??'unavailable'} ${unit}. ${canvasInstruction}`);
    draw();
    if(data.asset==='USDT'||data.asset==='USDC'){
      try{
        const activityQuery=new URLSearchParams({asset:data.asset,address:data.address});
        const activityResponse=await fetch(`/api/chain/activity?${activityQuery}`,{headers:{Accept:'application/json'}});
        const activityData=await activityResponse.json();
        if(requestId!==realRequest)return;
        if(!activityResponse.ok)throw new Error(activityData.error||`HTTP ${activityResponse.status}`);
        realObservation=combineTokenActivity(data,activityData);
        renderLiveSourceRecords(realObservation);
        const anchors=realObservation.tokenAnchorComparison;
        const anchorNote=anchors.status==='same_source_anchor'
          ?`Balance and logs share source-reported block ${anchors.balance.height} (${anchors.balance.hash}). This does not reconcile the balance with the bounded logs.`
          :`Balance at source-reported block ${anchors.balance.height}; log window ends at separate source-reported block ${anchors.logs.height}. Do not reconcile their amounts.`;
        setDataMode('source-reported',`${data.asset} balance retrieved ${data.observation?.retrieved_at||'time unavailable'}; ${activityData.activity.event_count} separate Transfer logs in finalized blocks ${activityData.observation.block_window.from}–${activityData.observation.block_window.to}. ${anchorNote} No independent Graphus verification or owner inference.`);
        draw();
      }catch(activityError){
        if(requestId!==realRequest)return;
        const note=document.createElement('p');note.className='live-source-record';
        note.textContent=`Bounded Transfer logs unavailable: ${activityError.message}. The source-reported balance remains available.`;
        document.getElementById('transaction-list').prepend(note);
      }
    }
  }catch(error){
    if(requestId!==realRequest)return;
    realObservation=null;
    selectedRealTransactionId=null;selectedRealEventId=null;liveTransactionDetail.hidden=true;
    clearWallet();
    setDataMode('synthetic',`Public-chain lookup unavailable: ${error.message}. The map remains a synthetic preview.`);
    draw();
  }finally{if(requestId===realRequest)liveButton.disabled=false;}
}
liveButton.addEventListener('click',loadLiveAddress);
function inspectRealAddress(address){
  const input=document.getElementById('record-search');
  input.value=address;
  input.dispatchEvent(new Event('input',{bubbles:true}));
  loadLiveAddress();
}
document.getElementById('record-search').addEventListener('keydown',event=>{if(event.key==='Enter'&&assetForLiveAddress(event.currentTarget.value.trim())){event.preventDefault();loadLiveAddress();}});
const assetKeys = ['btc', 'eth', 'usdt', 'usdc', 'blch'];
const colors = {btc:'#e9c985',eth:'#b4d7a4',usdt:'#87c9ab',usdc:'#c6ced1',blch:'#baff28'};
const units = {btc:'sat',eth:'wei',usdt:'token units',usdc:'token units',blch:'sat'};
const sourceNames = {btc:'Synthetic Bitcoin fixture',eth:'Synthetic Ethereum fixture',usdt:'Synthetic ERC-20 USDT fixture',usdc:'Synthetic ERC-20 USDC fixture',blch:'Synthetic Bloch fixture'};
const networks = {btc:'Bitcoin / synthetic network',eth:'Ethereum / synthetic network',usdt:'Ethereum ERC-20 / synthetic network',usdc:'Ethereum ERC-20 / synthetic network',blch:'Bloch / synthetic network'};
const semantics = {btc:'Bitcoin uses UTXOs. An input outpoint alone does not identify a sender or owner.',blch:'Bloch uses eUTXOs. An input outpoint alone does not identify a sender or owner.',eth:'Account transfers in this fixture simplify gas, internal calls and trace boundaries.',usdt:'ERC-20 transfer events do not by themselves describe all contract effects.',usdc:'ERC-20 transfer events do not by themselves describe all contract effects.'};
const centers = {btc:[.20,.28],eth:[.53,.20],usdt:[.79,.34],usdc:[.67,.72],blch:[.26,.75]};
const fraction = value => value - Math.floor(value);
const random = seed => fraction(Math.sin(seed * 12.9898 + 78.233) * 43758.5453);
const wallets = [];
for (let index = 0; index < 70; index++) {
  const asset = assetKeys[index % assetKeys.length];
  const serial = String(Math.floor(index / assetKeys.length) + 1).padStart(3,'0');
  const [cx, cy] = centers[asset];
  const angle = random(index + 1) * Math.PI * 2;
  const radius = Math.sqrt(random(index + 101)) * .15;
  const x = Math.max(.07,Math.min(.93,cx + Math.cos(angle)*radius));
  const y = Math.max(.11,Math.min(.89,cy + Math.sin(angle)*radius));
  const id = `SIM-${asset.toUpperCase()}-${serial}`;
  const address=`${asset}:simulated:${String(Math.floor(index / assetKeys.length)+1).padStart(5,'0')}`;
  const heldStart=8_000_000*(Math.floor(index/assetKeys.length)+1)**2;
  wallets.push({id,address,asset,x,y,transactions:[],volume:0,holdings:heldStart,index});
}
const walletById = new Map(wallets.map(wallet=>[wallet.id,wallet]));
const transfers=[];
for (let assetIndex=0;assetIndex<assetKeys.length;assetIndex++) {
  for (let serial=0;serial<14;serial++) {
    const from=wallets[serial*assetKeys.length+assetIndex];
    const count=2+((serial*3+assetIndex)%5);
    for (let sequence=1;sequence<=count;sequence++) {
      const to=wallets[((serial+sequence*2+1)%14)*assetKeys.length+assetIndex];
      const tx={
        id:`SIM-TX-${from.asset.toUpperCase()}-${String(transfers.length+1).padStart(4,'0')}`,
        from:from.id,to:to.id,
        amount:1000+((from.index+7)*(sequence+11)*73)%900000,
        observed:`2026-09-${String(3+((serial+sequence+assetIndex)%18)).padStart(2,'0')}`,
      };
      transfers.push(tx);
      from.holdings-=tx.amount;
      to.holdings+=tx.amount;
      from.transactions.push({...tx,direction:'OUT',counterparty:to.id});
      to.transactions.push({...tx,direction:'IN',counterparty:from.id});
    }
  }
}
for(const wallet of wallets){
  wallet.transactions.sort((a,b)=>a.observed.localeCompare(b.observed)||a.id.localeCompare(b.id));
  wallet.volume=wallet.transactions.reduce((sum,tx)=>sum+tx.amount,0);
}
const heldRangeByAsset=Object.fromEntries(assetKeys.map(asset=>{
  const values=wallets.filter(wallet=>wallet.asset===asset).map(wallet=>wallet.holdings);
  return [asset,[Math.min(...values),Math.max(...values)]];
}));
const relationMap=new Map();
for(const tx of transfers){
  const key=[tx.from,tx.to].sort().join('|');
  if(!relationMap.has(key))relationMap.set(key,[walletById.get(tx.from),walletById.get(tx.to)]);
}
const relations=[...relationMap.values()];

let activeAsset = 'all';
let search = '';
let selectedWallet = null;
let selectedTransaction = null;
let activeRoute = null;
let selectedNetworkEvent = null;
let networkStepFilter = 0;
let neighborhoodHops = 1;
let neighborhoodLevels = new Map();
let width = 0, height = 0, dpr = 1, tick = 0;
let paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let transactionDots = [];
let keyboardWalletIndex = 0;
document.getElementById('record-id').setAttribute('aria-live','polite');

function visible(wallet) { return activeAsset === 'all' || wallet.asset === activeAsset; }
function matchesSearch(wallet) { return !search || wallet.id.toLowerCase().includes(search) || wallet.address.toLowerCase().includes(search); }
function magnitude(wallet) {
  const [minimum,maximum]=heldRangeByAsset[wallet.asset];
  if(maximum===minimum)return .5;
  return (Math.log1p(wallet.holdings)-Math.log1p(minimum))/(Math.log1p(maximum)-Math.log1p(minimum));
}
const neighborhoodControl=document.createElement('div');
neighborhoodControl.className='neighborhood-control';
neighborhoodControl.innerHTML='<label for="neighborhood-hops">Network steps</label><select id="neighborhood-hops" disabled><option value="1">1 step</option><option value="2">2 steps</option></select>';
document.querySelector('.constellation-controls').append(neighborhoodControl);
const neighborhoodSelect=document.getElementById('neighborhood-hops');
function rebuildNeighborhood(){
  neighborhoodLevels=new Map();
  if(!search||!selectedWallet)return;
  neighborhoodLevels.set(selectedWallet.id,0);
  let frontier=[selectedWallet.id];
  for(let depth=1;depth<=neighborhoodHops;depth++){
    const next=new Set();
    for(const id of frontier){
      for(const tx of walletById.get(id).transactions){
        if(!neighborhoodLevels.has(tx.counterparty))next.add(tx.counterparty);
      }
    }
    frontier=[...next].sort();
    for(const id of frontier)neighborhoodLevels.set(id,depth);
  }
}
neighborhoodSelect.addEventListener('change',()=>{
  neighborhoodHops=Number(neighborhoodSelect.value);
  selectedNetworkEvent=null;networkStepFilter=0;
  rebuildNeighborhood();renderSearchStatus();renderNetworkEvidence();renderList();draw();
});
const networkPanel=document.createElement('section');
networkPanel.className='network-evidence';
networkPanel.setAttribute('aria-labelledby','network-evidence-title');
networkPanel.innerHTML='<div class="network-evidence-heading"><span>NETWORK EVIDENCE / SYNTHETIC</span><h2 id="network-evidence-title">Open each observed link.</h2><p>Each row is one generated transfer event, scoped to this asset and graph step. Adjacency does not prove ownership, value continuity, or intent.</p></div><div class="network-evidence-toolbar"><label for="network-step">Show events</label><select id="network-step" disabled><option value="0">All steps</option><option value="1">Step 1</option><option value="2">Step 2</option></select></div><p id="network-evidence-summary" class="network-evidence-summary" role="status" aria-live="polite">Search a synthetic ETH, USDT or USDC point to inspect its links.</p><div id="network-evidence-list" class="network-evidence-list"></div><div id="network-evidence-detail" class="network-evidence-detail" aria-live="polite">Select a link event to see its fixture evidence.</div>';
document.getElementById('constellation-help').after(networkPanel);
const networkSummary=document.getElementById('network-evidence-summary');
const networkList=document.getElementById('network-evidence-list');
const networkDetail=document.getElementById('network-evidence-detail');
const networkStepSelect=document.getElementById('network-step');
networkStepSelect.addEventListener('change',()=>{
  networkStepFilter=Number(networkStepSelect.value);selectedNetworkEvent=null;
  renderNetworkEvidence();draw();
});
function neighborhoodEvents(){
  if(!search||!selectedWallet||!['eth','usdt','usdc'].includes(selectedWallet.asset))return [];
  return transfers.filter(tx=>{
    if(walletById.get(tx.from).asset!==selectedWallet.asset)return false;
    const from=neighborhoodLevels.get(tx.from),to=neighborhoodLevels.get(tx.to);
    return from!==undefined&&to!==undefined&&Math.min(from,to)<neighborhoodHops;
  }).sort((a,b)=>{
    const stepA=Math.min(neighborhoodLevels.get(a.from),neighborhoodLevels.get(a.to));
    const stepB=Math.min(neighborhoodLevels.get(b.from),neighborhoodLevels.get(b.to));
    return stepA-stepB||a.observed.localeCompare(b.observed)||a.id.localeCompare(b.id);
  });
}
function renderNetworkEvidence(){
  networkList.replaceChildren();networkDetail.textContent='Select a link event to see its fixture evidence.';
  if(!selectedWallet||!search){networkStepSelect.disabled=true;networkSummary.textContent='Search a synthetic ETH, USDT or USDC point to inspect its links.';return;}
  if(!['eth','usdt','usdc'].includes(selectedWallet.asset)){
    networkStepSelect.disabled=true;
    networkSummary.textContent='BTC and BLCH input outpoints do not identify direct senders. No account-style link evidence is asserted here.';return;
  }
  networkStepSelect.disabled=false;
  networkStepSelect.querySelector('option[value="2"]').disabled=neighborhoodHops===1;
  const allEvents=neighborhoodEvents();
  const first=allEvents.filter(tx=>Math.min(neighborhoodLevels.get(tx.from),neighborhoodLevels.get(tx.to))===0).length;
  const events=networkStepFilter?allEvents.filter(tx=>Math.min(neighborhoodLevels.get(tx.from),neighborhoodLevels.get(tx.to))+1===networkStepFilter):allEvents;
  networkSummary.textContent=`${allEvents.length} generated direct-transfer events · ${first} at step 1 · ${allEvents.length-first} at step 2 · showing ${events.length} · ${sourceNames[selectedWallet.asset]}`;
  events.forEach(tx=>{
    const step=Math.min(neighborhoodLevels.get(tx.from),neighborhoodLevels.get(tx.to))+1;
    const button=document.createElement('button');button.type='button';button.className='network-event';button.setAttribute('aria-pressed','false');
    const heading=document.createElement('strong');heading.textContent=`STEP ${step} · ${tx.id}`;
    const route=document.createElement('span');route.textContent=`${tx.from} → ${tx.to}`;
    const detail=document.createElement('small');detail.textContent=`${tx.observed} · ${tx.amount.toLocaleString('en-US')} ${units[selectedWallet.asset]} · synthetic fixture`;
    button.append(heading,route,detail);
    button.addEventListener('click',()=>{
      selectedNetworkEvent=tx;
      networkList.querySelectorAll('button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
      networkDetail.replaceChildren();
      const evidence=document.createElement('p');
      evidence.textContent=`${tx.id} · step ${step} · ${tx.from} → ${tx.to} · ${tx.observed} · ${tx.amount.toLocaleString('en-US')} ${units[selectedWallet.asset]} · ${sourceNames[selectedWallet.asset]}. This is a generated event, not a chain record or AML conclusion.`;
      const actions=document.createElement('div');
      for(const [label,id] of [['Focus sender',tx.from],['Focus recipient',tx.to]]){
        const focus=document.createElement('button');focus.type='button';focus.textContent=label;
        focus.addEventListener('click',()=>selectWallet(walletById.get(id),true));actions.append(focus);
      }
      networkDetail.append(evidence,actions);draw();
    });
    networkList.append(button);
  });
}
function focusedPeers() {
  if(!search||!selectedWallet)return [];
  return [...neighborhoodLevels.keys()].filter(id=>id!==selectedWallet.id).sort();
}
function displayedPeers() {
  const peers=new Set(focusedPeers());
  for(const tx of activeRoute||[]){
    if(tx.from!==selectedWallet?.id)peers.add(tx.from);
    if(tx.to!==selectedWallet?.id)peers.add(tx.to);
  }
  return [...peers].sort();
}
function displayed(wallet) {
  return visible(wallet) && (!search || Boolean(selectedWallet && (wallet.id===selectedWallet.id || displayedPeers().includes(wallet.id))));
}
function point(wallet) {
  if(search&&selectedWallet){
    if(wallet.id===selectedWallet.id)return {x:width*.5,y:height*.5};
    const depth=neighborhoodLevels.get(wallet.id)||2;
    const peers=displayedPeers().filter(id=>(neighborhoodLevels.get(id)||2)===depth);
    const index=peers.indexOf(wallet.id);
    if(index>=0){
      const angle=-Math.PI*.5+index*Math.PI*2/peers.length;
      const radius=neighborhoodHops===2
        ?Math.min(width*(depth===1?.24:.43),height*(depth===1?.26:.43),depth===1?150:235)
        :Math.max(110,Math.min(width*.32,height*.32,205));
      return {x:width*.5+Math.cos(angle)*radius,y:height*.5+Math.sin(angle)*radius};
    }
  }
  return {x:wallet.x*width,y:wallet.y*height};
}
function resize() {
  const rect = canvas.getBoundingClientRect();
  width=rect.width;height=rect.height;dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  context.setTransform(dpr,0,0,dpr,0,0);
  draw();
}
function line(a,b,color,alpha=.25,lineWidth=1) {
  context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);
  context.strokeStyle=color;context.globalAlpha=alpha;context.lineWidth=lineWidth;context.stroke();context.globalAlpha=1;
}
function arrow(a,b,color) {
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
  if(length<20)return;
  const ux=dx/length,uy=dy/length;
  const tip={x:b.x-ux*14,y:b.y-uy*14};
  line({x:a.x+ux*10,y:a.y+uy*10},tip,color,.86,2.2);
  context.beginPath();context.moveTo(tip.x,tip.y);
  context.lineTo(tip.x-ux*8-uy*5,tip.y-uy*8+ux*5);
  context.lineTo(tip.x-ux*8+uy*5,tip.y-uy*8-ux*5);
  context.closePath();context.fillStyle=color;context.fill();
}
function star(x,y,r,color,alpha=1) {
  context.save();context.globalAlpha=alpha;context.shadowBlur=r*3.4;context.shadowColor=color;
  context.fillStyle=color;context.beginPath();context.arc(x,y,r,0,Math.PI*2);context.fill();context.restore();
}
function draw() {
  if (!width || !height) return;
  context.clearRect(0,0,width,height);
  const gradient=context.createRadialGradient(width*.5,height*.5,20,width*.5,height*.5,Math.max(width,height)*.8);
  gradient.addColorStop(0,'#1d301b');gradient.addColorStop(.55,'#0b150c');gradient.addColorStop(1,'#050806');
  context.fillStyle=gradient;context.fillRect(0,0,width,height);
  if(realObservation){drawRealObservation(realObservation);return;}
  for (const [asset,[cx,cy]] of Object.entries(centers)) {
    if(search)continue;
    if (activeAsset !== 'all' && activeAsset !== asset) continue;
    context.save();context.globalAlpha=.13;context.strokeStyle=colors[asset];context.lineWidth=1;
    context.beginPath();context.ellipse(cx*width,cy*height,width*.16,height*.20,0,0,Math.PI*2);context.stroke();
    context.fillStyle=colors[asset];context.font='11px ui-monospace, monospace';context.letterSpacing='2px';
    context.fillText(`${asset.toUpperCase()} FIELD`,cx*width-width*.065,cy*height-height*.17);context.restore();
  }
  for (const [from,to] of relations) {
    if (!displayed(from)||!displayed(to)) continue;
    if(search&&selectedWallet){
      const fromStep=neighborhoodLevels.get(from.id),toStep=neighborhoodLevels.get(to.id);
      if(fromStep===undefined||toStep===undefined||Math.min(fromStep,toStep)>=neighborhoodHops)continue;
    }
    const selected=selectedWallet && (from.id===selectedWallet.id||to.id===selectedWallet.id);
    line(point(from),point(to),selected?'#c8eba3':'#9bb296',selected?.48:.12,selected?1.5:.8);
  }
  if(selectedWallet&&displayed(selectedWallet)){
    for(const tx of selectedWallet.transactions){
      const from=walletById.get(tx.from),to=walletById.get(tx.to);
      arrow(point(from),point(to),tx.direction==='OUT'?'#d7dfbc':'#baff28');
    }
  }
  if(activeRoute){
    for(const tx of activeRoute){
      const from=walletById.get(tx.from),to=walletById.get(tx.to);
      if(displayed(from)&&displayed(to))arrow(point(from),point(to),'#e5f7b0');
    }
  }
  if(selectedNetworkEvent){
    const from=walletById.get(selectedNetworkEvent.from),to=walletById.get(selectedNetworkEvent.to);
    if(displayed(from)&&displayed(to))arrow(point(from),point(to),'#e5f7b0');
  }
  const keyboardChoice=document.activeElement===canvas?wallets.filter(displayed)[keyboardWalletIndex]:null;
  for (const wallet of wallets) {
    if (!displayed(wallet)) continue;
    const p=point(wallet);
    const selected=selectedWallet?.id===wallet.id;
    const level=magnitude(wallet);
    const twinkle=.62+.22*level+.12*Math.sin(tick*.023+wallet.index*2.3);
    const depth=neighborhoodLevels.get(wallet.id)||0;
    star(p.x,p.y,selected?12:4+level*7.2,colors[wallet.asset],selected?1:twinkle*(search?(depth===2?.75:1):(matchesSearch(wallet)?1:.35)));
    if (selected) {
      context.strokeStyle='#baff28';context.lineWidth=1.5;context.beginPath();context.arc(p.x,p.y,13,0,Math.PI*2);context.stroke();
      context.fillStyle='#f3f5ef';context.font='700 12px ui-monospace, monospace';context.fillText(wallet.id,p.x+17,p.y-13);
    }
    if(activeRoute?.some(tx=>tx.from===wallet.id||tx.to===wallet.id)){
      context.strokeStyle='#e5f7b0';context.lineWidth=1.5;context.beginPath();context.arc(p.x,p.y,selected?19:12+level*7.2,0,Math.PI*2);context.stroke();
    }
    if(selectedNetworkEvent&&(selectedNetworkEvent.from===wallet.id||selectedNetworkEvent.to===wallet.id)){
      context.strokeStyle='#e5f7b0';context.lineWidth=2;context.beginPath();context.arc(p.x,p.y,selected?21:14+level*7.2,0,Math.PI*2);context.stroke();
    }
    if (wallet===keyboardChoice) {
      context.strokeStyle='#f3f5ef';context.lineWidth=2;context.beginPath();context.arc(p.x,p.y,selected?18:13,0,Math.PI*2);context.stroke();
    }
  }
  transactionDots=[];
  if (selectedWallet && displayed(selectedWallet)) {
    const base=point(selectedWallet);const count=selectedWallet.transactions.length;
    const fan={x:Math.max(105,Math.min(width-105,base.x)),y:Math.max(108,Math.min(height-108,base.y))};
    if (Math.hypot(fan.x-base.x,fan.y-base.y)>2) line(base,fan,'#baff28',.7,1.5);
    selectedWallet.transactions.forEach((tx,index)=>{
      const angle=-Math.PI*.85+index*(Math.PI*1.7/Math.max(1,count-1));
      const p={x:fan.x+Math.cos(angle)*74,y:fan.y+Math.sin(angle)*74};
      line(fan,p,'#d4e5a5',.65,1.3);star(p.x,p.y,selectedTransaction?.id===tx.id?6:4.5,'#e8f5bd');
      transactionDots.push({tx,p});
    });
  }
}
function balanceSize(baseUnits,asset){
  if(!/^\d+$/.test(baseUnits||''))return 7;
  if(BigInt(baseUnits)===0n)return 5;
  const digitCount=baseUnits.length;
  const leading=Number(baseUnits.slice(0,Math.min(6,digitCount)))/10**(Math.min(6,digitCount)-1);
  const exponent=digitCount-1+Math.log10(leading);
  const reference={BTC:8,ETH:18,USDT:11,USDC:11,BLCH:8}[asset]??8;
  return Math.max(5,Math.min(22,10+4*(exponent-reference)));
}
function drawRealObservation(observation){
  const nodes=observation.nodes||[];
  const center={x:width*.5,y:height*.5};
  const sameAddress=(address)=>['ETH','USDT','USDC'].includes(observation.asset)
    ?address?.toLowerCase()===observation.address.toLowerCase()
    :address===observation.address;
  const graphView=getRealGraphView(observation);
  const satellites=graphView.visible;
  const orbit=Math.max(80,Math.min(width*.34,height*.34,225));
  const positions=new Map();
  realAddressTargets=[];
  realTransactionTargets=[];
  satellites.forEach((node,index)=>{
    const angle=-Math.PI/2+index*Math.PI*2/Math.max(1,satellites.length);
    const radius=orbit*(index%3===0?.76:index%3===1?.9:1.08);
    positions.set(node.id,{x:center.x+Math.cos(angle)*radius,y:center.y+Math.sin(angle)*radius});
  });
  const focusIds=new Set(nodes.filter(node=>sameAddress(node.address)).map(node=>node.id));
  for(const edge of observation.edges||[]){
    const a=focusIds.has(edge.from)?center:positions.get(edge.from);
    const b=focusIds.has(edge.to)?center:positions.get(edge.to);
    if(a&&b&&a!==b)arrow(a,b,(selectedRealTransactionId&&(edge.from===selectedRealTransactionId||edge.to===selectedRealTransactionId))
      ||(selectedRealEventId&&edge.event_id===selectedRealEventId)?'#e9ffb0':'#a9bba6');
  }
  satellites.forEach(node=>{
    const p=positions.get(node.id);
    if(node.kind==='transaction'){
      const selected=node.id===selectedRealTransactionId;
      context.fillStyle=selected?'#e9ffb0':'#d0d9ca';context.globalAlpha=selected?1:.75;
      context.fillRect(p.x-(selected?6:4),p.y-(selected?6:4),selected?12:8,selected?12:8);
      context.globalAlpha=1;
      realTransactionTargets.push({node,p});
      if(document.activeElement===canvas&&realTransactionTargets.length-1===realKeyboardIndex){
        context.strokeStyle='#f0f3eb';context.lineWidth=1.5;context.strokeRect(p.x-9,p.y-9,18,18);
      }
    }else if(node.kind==='address'){
      const radius=node.balance?.base_units?balanceSize(node.balance.base_units,observation.asset):5;
      if(node.balance?.base_units)star(p.x,p.y,radius,colors[observation.asset?.toLowerCase()]||'#baff28',.8);
      else {context.beginPath();context.arc(p.x,p.y,radius,0,Math.PI*2);context.strokeStyle='#aab5a7';context.lineWidth=1.4;context.stroke();}
      realAddressTargets.push({address:node.address,p,radius});
    }
  });
  const radius=balanceSize(observation.balance?.base_units,observation.asset);
  star(center.x,center.y,radius,colors[observation.asset?.toLowerCase()]||'#baff28');
  context.fillStyle='#f0f3eb';context.font='700 12px ui-monospace, monospace';
  context.fillText(observation.address.slice(0,12)+'…',center.x+radius+12,center.y-9);
  context.font='11px ui-monospace, monospace';context.fillStyle='#aac39b';
  context.fillText(observation.asset==='BLCH'?'SOURCE-REPORTED SCRIPT BALANCE':'SOURCE-REPORTED ADDRESS BALANCE',20,32);
  context.fillText(`${satellites.length} / ${graphView.total} SOURCE POINTS SHOWN · NO OWNER CLAIM`,20,height-22);
}
function frame() {if(!paused){tick++;draw();}requestAnimationFrame(frame);}
function setText(id,value) {document.getElementById(id).textContent=value;}
function renderEvidence(wallet,tx=null) {
  setText('evidence-network',networks[wallet.asset]);
  setText('evidence-type',tx?'Synthetic transfer event':'Synthetic wallet point');
  setText('evidence-reference',tx?.id||wallet.id);
  setText('evidence-finality','Not applicable; no chain transaction or block exists');
  setText('evidence-limit',semantics[wallet.asset]+' No identity, geographic location or AML conclusion follows from this fixture.');
}
const temporalPanel=document.createElement('article');
temporalPanel.className='temporal-panel';
temporalPanel.innerHTML='<div class="temporal-heading"><span>03 / DAILY FLOW</span><h3>Trace activity by day</h3><p>Select a day to inspect its synthetic events. Teal bars show inbound volume; rose bars show outbound volume. Empty days remain visible. Direction describes this fixture only.</p></div><div id="temporal-days" class="temporal-days" role="group" aria-label="Synthetic daily wallet flow"></div><div id="temporal-detail" class="temporal-detail" aria-live="polite">Select a wallet star.</div>';
document.querySelector('.analytics-grid').after(temporalPanel);
function renderTemporal(wallet) {
  const days=document.getElementById('temporal-days');
  const detail=document.getElementById('temporal-detail');
  days.replaceChildren();detail.replaceChildren();
  const first=Date.parse(wallet.transactions[0].observed+'T00:00:00Z');
  const last=Date.parse(wallet.transactions.at(-1).observed+'T00:00:00Z');
  const dates=Array.from({length:Math.round((last-first)/86400000)+1},(_,index)=>new Date(first+index*86400000).toISOString().slice(0,10));
  const buckets=dates.map(date=>({date,events:wallet.transactions.filter(tx=>tx.observed===date)}));
  const maxVolume=Math.max(...buckets.map(day=>day.events.reduce((sum,tx)=>sum+tx.amount,0)));
  function selectDay(day,button) {
    days.querySelectorAll('button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    detail.replaceChildren();
    const inbound=day.events.filter(tx=>tx.direction==='IN');
    const outbound=day.events.filter(tx=>tx.direction==='OUT');
    const volume=day.events.reduce((sum,tx)=>sum+tx.amount,0);
    const peers=new Set(day.events.map(tx=>tx.counterparty));
    const summary=document.createElement('p');
    summary.textContent=`${day.date} · ${day.events.length} ${day.events.length===1?'event':'events'} · ${inbound.length} in / ${outbound.length} out · ${volume.toLocaleString('en-US')} ${units[wallet.asset]} · ${peers.size} distinct peer ${peers.size===1?'point':'points'}`;
    detail.append(summary);
    if(!day.events.length){const empty=document.createElement('p');empty.textContent='No synthetic events observed on this day.';detail.append(empty);return;}
    const list=document.createElement('div');list.className='temporal-events';
    day.events.forEach(tx=>{
      const event=document.createElement('button');event.type='button';
      event.textContent=`${tx.id} · ${tx.direction} · ${tx.amount.toLocaleString('en-US')} ${units[wallet.asset]} · ${tx.counterparty}`;
      event.addEventListener('click',()=>selectTransaction(wallet,tx));list.append(event);
    });
    detail.append(list);
  }
  buckets.forEach(day=>{
    const inbound=day.events.filter(tx=>tx.direction==='IN').reduce((sum,tx)=>sum+tx.amount,0);
    const outbound=day.events.filter(tx=>tx.direction==='OUT').reduce((sum,tx)=>sum+tx.amount,0);
    const button=document.createElement('button');button.type='button';button.className='temporal-day';button.setAttribute('aria-pressed','false');
    button.setAttribute('aria-label',`${day.date}: ${day.events.length} synthetic events, ${inbound.toLocaleString('en-US')} ${units[wallet.asset]} inbound and ${outbound.toLocaleString('en-US')} outbound`);
    const bars=document.createElement('span');bars.className='temporal-bars';bars.setAttribute('aria-hidden','true');
    for(const [direction,value] of [['in',inbound],['out',outbound]]){
      const bar=document.createElement('i');bar.className=direction;bar.style.height=value?`${Math.max(3,100*value/maxVolume)}%`:'0';bars.append(bar);
    }
    const label=document.createElement('span');label.textContent=day.date.slice(8);
    button.append(bars,label);button.addEventListener('click',()=>selectDay(day,button));days.append(button);
  });
  const latest=buckets.at(-1);selectDay(latest,days.lastElementChild);
}
const pathPanel=document.createElement('article');
pathPanel.className='path-explorer';
pathPanel.innerHTML=`<div class="path-heading"><span>04 / TEMPORAL PATHS</span><h3>Trace between two points</h3><p>Explore up to three directed steps inside one synthetic Ethereum asset. Events on the same day cannot be ordered, so they do not form successive steps. A path is an association, never proof that the same value moved through each point.</p></div>
  <div class="path-controls"><div><label for="path-source">Source point</label><output id="path-source">Select a wallet</output></div><div><label for="path-target">Target point</label><select id="path-target" disabled></select></div><div><label for="path-hops">Maximum steps</label><select id="path-hops"><option value="1">1 step</option><option value="2">2 steps</option><option value="3" selected>3 steps</option></select></div></div>
  <p id="path-summary" class="path-summary" role="status" aria-live="polite">Select a synthetic ETH, USDT or USDC point.</p><div id="path-results" class="path-results"></div>`;
temporalPanel.after(pathPanel);
const pathTarget=document.getElementById('path-target');
const pathHops=document.getElementById('path-hops');
pathHops.disabled=true;
const pathSummary=document.getElementById('path-summary');
const pathResults=document.getElementById('path-results');
function updatePathResults(){
  activeRoute=null;pathResults.replaceChildren();
  if(!selectedWallet||!['eth','usdt','usdc'].includes(selectedWallet.asset)){draw();return;}
  let result;
  try {
    result=GraphusFlow.tracePaths({transfers,walletById,asset:selectedWallet.asset,
      source:selectedWallet.id,target:pathTarget.value,maxHops:Number(pathHops.value),maxPaths:5});
  } catch {
    pathSummary.textContent='This synthetic path query exceeds its limits. Choose a different target or fewer steps.';
    draw();return;
  }
  pathSummary.textContent=result.paths.length
    ?`${result.paths.length} synthetic ${result.paths.length===1?'path':'paths'} found · ${selectedWallet.asset.toUpperCase()} only · daily order only`
    :`No ordered synthetic path found within ${pathHops.value} ${pathHops.value==='1'?'step':'steps'}. Try another target or step limit.`;
  result.paths.forEach((path,index)=>{
    const button=document.createElement('button');button.type='button';button.className='path-result';
    button.setAttribute('aria-pressed','false');
    const heading=document.createElement('strong');
    heading.textContent=`Route ${String(index+1).padStart(2,'0')} · ${path.length} ${path.length===1?'step':'steps'}`;
    const sequence=document.createElement('span');
    sequence.textContent=[path[0].from,...path.map(tx=>tx.to)].join(' → ');
    const events=document.createElement('small');
    events.textContent=path.map(tx=>`${tx.observed} · ${tx.id} · ${tx.amount.toLocaleString('en-US')} ${units[selectedWallet.asset]}`).join('  |  ');
    button.append(heading,sequence,events);
    button.addEventListener('click',()=>{
      activeRoute=path;
      pathResults.querySelectorAll('button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
      draw();
    });
    pathResults.append(button);
  });
  draw();
}
function renderPathExplorer(wallet){
  document.getElementById('path-source').textContent=wallet.id;
  pathTarget.replaceChildren();
  if(!['eth','usdt','usdc'].includes(wallet.asset)){
    activeRoute=null;pathTarget.disabled=true;pathHops.disabled=true;
    const unavailable=document.createElement('option');unavailable.textContent='Unavailable for this asset';
    pathTarget.append(unavailable);
    pathSummary.textContent='BTC and BLCH input outpoints do not identify a direct sender. No account-style path is drawn for these assets.';
    pathResults.replaceChildren();draw();return;
  }
  pathTarget.disabled=false;pathHops.disabled=false;
  wallets.filter(item=>item.asset===wallet.asset&&item.id!==wallet.id).forEach(item=>{
    const option=document.createElement('option');option.value=item.id;option.textContent=item.id;
    pathTarget.append(option);
  });
  const firstOutgoing=transfers.find(tx=>tx.from===wallet.id);
  if(firstOutgoing)pathTarget.value=firstOutgoing.to;
  updatePathResults();
}
pathTarget.addEventListener('change',updatePathResults);
pathHops.addEventListener('change',updatePathResults);
const motifPanel=document.createElement('article');
motifPanel.className='motif-panel';
motifPanel.innerHTML=`<div class="motif-heading"><span>05 / OBSERVED SHAPES</span><h3>Read the activity pattern</h3><p>Direct peer counts and ordered event pairs describe this synthetic fixture. A close succession of events does not prove the same funds moved, shared ownership, or suspicious intent.</p></div>
  <div class="motif-toolbar"><label for="motif-gap">Pair window</label><select id="motif-gap"><option value="1">1 day</option><option value="2" selected>2 days</option><option value="3">3 days</option></select><span>Only different days can establish sequence in this fixture.</span></div>
  <div id="motif-metrics" class="motif-metrics"></div><p id="motif-summary" class="motif-summary" role="status" aria-live="polite">Select a synthetic wallet point.</p><div id="motif-pairs" class="motif-pairs"></div>`;
pathPanel.after(motifPanel);
const motifGap=document.getElementById('motif-gap');
const motifMetrics=document.getElementById('motif-metrics');
const motifSummary=document.getElementById('motif-summary');
const motifPairs=document.getElementById('motif-pairs');
function motifMetric(label,value,note){
  const card=document.createElement('div');
  const heading=document.createElement('span');heading.textContent=label;
  const number=document.createElement('strong');number.textContent=value;
  const detail=document.createElement('small');detail.textContent=note;
  card.append(heading,number,detail);motifMetrics.append(card);
}
function renderMotifs(wallet){
  motifMetrics.replaceChildren();motifPairs.replaceChildren();
  const account=['eth','usdt','usdc'].includes(wallet.asset);
  motifMetric('OBSERVED EVENTS',String(wallet.transactions.length),'synthetic fixture');
  if(!account){
    motifMetric('DIRECT INBOUND PEERS','Unknown','input outpoints do not identify senders');
    motifMetric('DIRECT OUTBOUND PEERS','Unknown','no account-style sender assertion');
    motifMetric('ORDERED EVENT PAIRS','—','not computed for UTXO / eUTXO');
    motifSummary.textContent='BTC and BLCH show observed outputs and input references, but these synthetic arrows cannot support direct peer or pass-through claims.';
    motifGap.disabled=true;return;
  }
  motifGap.disabled=false;
  const inbound=wallet.transactions.filter(tx=>tx.direction==='IN');
  const outbound=wallet.transactions.filter(tx=>tx.direction==='OUT');
  const inboundPeers=new Set(inbound.map(tx=>tx.counterparty));
  const outboundPeers=new Set(outbound.map(tx=>tx.counterparty));
  const maxDays=Number(motifGap.value);
  const pairs=[];
  for(const incoming of inbound){
    for(const outgoing of outbound){
      const days=Math.round((Date.parse(outgoing.observed+'T00:00:00Z')-Date.parse(incoming.observed+'T00:00:00Z'))/86400000);
      if(days>0&&days<=maxDays)pairs.push({incoming,outgoing,days});
    }
  }
  pairs.sort((a,b)=>a.days-b.days||a.incoming.id.localeCompare(b.incoming.id)||a.outgoing.id.localeCompare(b.outgoing.id));
  motifMetric('DIRECT INBOUND PEERS',String(inboundPeers.size),`${inbound.length} inbound events`);
  motifMetric('DIRECT OUTBOUND PEERS',String(outboundPeers.size),`${outbound.length} outbound events`);
  motifMetric('ORDERED EVENT PAIRS',String(pairs.length),`within ${maxDays} ${maxDays===1?'day':'days'}`);
  motifSummary.textContent=pairs.length
    ?`${pairs.length} ordered synthetic event ${pairs.length===1?'pair':'pairs'} · ${sourceNames[wallet.asset]} · value continuity unproven`
    :`No ordered event pair within ${maxDays} ${maxDays===1?'day':'days'} for this synthetic point.`;
  pairs.forEach(({incoming,outgoing,days})=>{
    const row=document.createElement('div');row.className='motif-pair';
    const label=document.createElement('strong');label.textContent=`${days}-day interval · ${incoming.counterparty} → ${wallet.id} → ${outgoing.counterparty}`;
    const details=document.createElement('span');
    details.textContent=`IN ${incoming.id} · ${incoming.amount.toLocaleString('en-US')} ${units[wallet.asset]}  /  OUT ${outgoing.id} · ${outgoing.amount.toLocaleString('en-US')} ${units[wallet.asset]}`;
    const actions=document.createElement('div');
    for(const [caption,tx] of [['Inspect inbound',incoming],['Inspect outbound',outgoing]]){
      const button=document.createElement('button');button.type='button';button.textContent=caption;
      button.addEventListener('click',()=>selectTransaction(wallet,tx));actions.append(button);
    }
    row.append(label,details,actions);motifPairs.append(row);
  });
}
motifGap.addEventListener('change',()=>{if(selectedWallet)renderMotifs(selectedWallet);});
motifGap.disabled=true;
for(const [label,id,caption] of [['DAILY VOLUME SLOPE','analysis-slope','synthetic units per day'],['LINEAR FIT R²','analysis-fit','descriptive, not a risk signal']]){
  const card=document.createElement('article');
  const heading=document.createElement('span');heading.textContent=label;
  const value=document.createElement('strong');value.id=id;value.textContent='—';
  const note=document.createElement('small');note.textContent=caption;
  card.append(heading,value,note);document.querySelector('.analytics-summary').append(card);
}
function renderAnalytics(wallet) {
  const txs=wallet.transactions;
  const inbound=txs.filter(tx=>tx.direction==='IN').length;
  const total=txs.reduce((sum,tx)=>sum+tx.amount,0);
  const links=relations.filter(([from,to])=>from.id===wallet.id||to.id===wallet.id).length;
  const dates=txs.map(tx=>Date.parse(tx.observed+'T00:00:00Z'));
  const days=Math.round((Math.max(...dates)-Math.min(...dates))/86400000)+1;
  setText('ml-inbound',String(inbound));setText('ml-outbound',String(txs.length-inbound));
  setText('ml-relations',String(links));setText('ml-window',`${days} days · synthetic`);
  setText('analysis-events',String(txs.length));setText('analysis-direction',`${inbound} / ${txs.length-inbound}`);
  setText('analysis-volume',total.toLocaleString('en-US'));setText('analysis-unit',units[wallet.asset]);
  setText('analysis-held',wallet.holdings.toLocaleString('en-US'));
  setText('analysis-connections',String(links));setText('analysis-span',String(days));
  setText('analysis-concentration',`${(100*Math.max(...txs.map(tx=>tx.amount))/total).toFixed(1)}%`);
  const start=Math.min(...dates),end=Math.max(...dates);
  const daily=Array.from({length:Math.round((end-start)/86400000)+1},()=>0);
  txs.forEach(tx=>{daily[Math.round((Date.parse(tx.observed+'T00:00:00Z')-start)/86400000)]+=tx.amount;});
  const n=daily.length,meanX=(n-1)/2,meanY=total/n;
  const denominator=daily.reduce((sum,_,index)=>sum+(index-meanX)**2,0);
  const slope=denominator?daily.reduce((sum,value,index)=>sum+(index-meanX)*(value-meanY),0)/denominator:0;
  const variation=daily.reduce((sum,value)=>sum+(value-meanY)**2,0);
  const error=daily.reduce((sum,value,index)=>sum+(value-(meanY+slope*(index-meanX)))**2,0);
  const r2=variation?Math.max(0,1-error/variation):0;
  setText('analysis-slope',`${slope>=0?'+':''}${Math.round(slope).toLocaleString('en-US')}`);
  setText('analysis-fit',r2.toFixed(2));
  const chart=document.getElementById('activity-chart');chart.replaceChildren();
  const max=Math.max(...txs.map(tx=>tx.amount));
  txs.forEach((tx,index)=>{
    const bar=document.createElement('div');bar.className='activity-bar';
    bar.title=`${tx.id}: ${tx.amount} ${units[wallet.asset]} · ${tx.direction}`;
    const column=document.createElement('i');column.style.height=`${Math.max(8,100*tx.amount/max)}%`;
    column.className=tx.direction==='IN'?'in':'out';
    const label=document.createElement('span');label.textContent=String(index+1).padStart(2,'0');
    bar.append(column,label);chart.append(bar);
  });
  const ledger=document.getElementById('analysis-ledger');ledger.replaceChildren();
  txs.forEach(tx=>{
    const row=document.createElement('tr');
    [tx.id+' · '+tx.counterparty,tx.observed,tx.direction,tx.amount.toLocaleString('en-US')+' '+units[wallet.asset],'Synthetic fixture'].forEach(value=>{
      const cell=document.createElement('td');cell.textContent=value;row.append(cell);
    });
    ledger.append(row);
  });
}
const flowPanel=document.createElement('div');flowPanel.className='wallet-flow';
const flowTitle=document.createElement('p');flowTitle.textContent='WALLET FLOW / FOLLOW A COUNTERPARTY';
const flowList=document.createElement('div');flowList.id='wallet-flow-list';flowList.textContent='Select a wallet.';
flowPanel.append(flowTitle,flowList);
document.querySelector('.record-card .transaction-fan').after(flowPanel);
const noteLink=document.createElement('a');noteLink.className='wallet-note-link';noteLink.href='account.html';
noteLink.textContent='Open annotation workspace ↗';flowPanel.after(noteLink);
function renderFlows(wallet){
  flowList.replaceChildren();
  const peers=new Map();
  wallet.transactions.forEach(tx=>{
    const key=tx.counterparty;
    const entry=peers.get(key)||{inbound:0,outbound:0,volume:0};
    entry[tx.direction==='IN'?'inbound':'outbound']++;
    entry.volume+=tx.amount;peers.set(key,entry);
  });
  [...peers.entries()].sort((a,b)=>b[1].volume-a[1].volume).forEach(([id,entry])=>{
    const button=document.createElement('button');button.type='button';
    button.textContent=`${id} · ${entry.inbound} in / ${entry.outbound} out · ${entry.volume.toLocaleString('en-US')} ${units[wallet.asset]} →`;
    button.addEventListener('click',()=>selectWallet(walletById.get(id),Boolean(search)));
    flowList.append(button);
  });
}
function updateSearchUrl() {
  const url=new URL(window.location.href);
  url.searchParams.delete('address');url.searchParams.delete('wallet');
  const entered=document.getElementById('record-search').value.trim();
  const liveAsset=assetForLiveAddress(entered);
  if(liveAsset){
    url.searchParams.set('asset',liveAsset.toLowerCase());
    url.searchParams.set('address',entered);
  }else if(search)url.searchParams.set('wallet',selectedWallet?.id||search);
  window.history.replaceState(null,'',url);
}
function renderSearchStatus() {
  const status=document.getElementById('wallet-search-status');
  if(!search){status.textContent='Search a synthetic wallet ID or address to isolate its local constellation.';return;}
  const matches=wallets.filter(wallet=>visible(wallet)&&matchesSearch(wallet));
  if(!matches.length){status.textContent=`No synthetic wallet matches “${search}” in this asset filter.`;return;}
  const direct=[...neighborhoodLevels.values()].filter(depth=>depth===1).length;
  const second=[...neighborhoodLevels.values()].filter(depth=>depth===2).length;
  status.textContent=`${matches.length} ${matches.length===1?'match':'matches'} · ${selectedWallet.id} centered with ${direct} immediate ${direct===1?'point':'points'} and ${second} second-step illustrative ${second===1?'point':'points'} · ${selectedWallet.transactions.length} wallet events. Select another result below to change focus.`;
}
function clearWallet() {
  selectedWallet=null;selectedTransaction=null;activeRoute=null;selectedNetworkEvent=null;
  networkStepFilter=0;networkStepSelect.value='0';
  neighborhoodHops=1;neighborhoodLevels=new Map();neighborhoodSelect.value='1';neighborhoodSelect.disabled=true;
  setText('record-type','SELECT A WALLET');setText('record-id',search?'No matching wallet.':'Each dot opens a fan.');
  setText('record-summary',search?'Try a synthetic wallet ID such as SIM-BTC-001 or change the asset filter.':'Open a wallet point to inspect its synthetic transactions and relationships.');
  for(const id of ['record-asset','record-holdings','record-time','record-related','ml-inbound','ml-outbound','ml-relations','ml-window','analysis-events','analysis-direction','analysis-held','analysis-volume','analysis-connections','analysis-span','analysis-concentration','analysis-slope','analysis-fit'])setText(id,'—');
  setText('record-source','Synthetic fixture');setText('record-meaning','No trained or validated model.');
  for(const id of ['evidence-network','evidence-type','evidence-reference'])setText(id,'—');
  setText('evidence-finality','Not applicable to synthetic data');setText('evidence-limit','Select a wallet to inspect the fixture.');
  document.getElementById('transaction-list').textContent='Select a wallet.';
  flowList.textContent='Select a wallet.';
  document.getElementById('activity-chart').replaceChildren();
  document.getElementById('analysis-ledger').innerHTML='<tr><td colspan="5">Select a wallet star.</td></tr>';
  document.getElementById('temporal-days').replaceChildren();document.getElementById('temporal-detail').textContent='Select a wallet star.';
  document.getElementById('path-source').textContent='Select a wallet';
  pathTarget.replaceChildren();pathTarget.disabled=true;pathHops.disabled=true;pathResults.replaceChildren();
  pathSummary.textContent='Select a synthetic ETH, USDT or USDC point.';
  motifMetrics.replaceChildren();motifPairs.replaceChildren();motifSummary.textContent='Select a synthetic wallet point.';motifGap.disabled=true;
  renderNetworkEvidence();
}
function selectWallet(wallet,updateQuery=false) {
  if(realObservation){realObservation=null;setDataMode('synthetic','Generated example wallets and transfers; no public-chain address is loaded.');}
  if(updateQuery){search=wallet.id.toLowerCase();document.getElementById('record-search').value=wallet.id;}
  selectedWallet=wallet;selectedTransaction=null;selectedNetworkEvent=null;
  networkStepFilter=0;networkStepSelect.value='0';
  const expanded=Boolean(search&&['eth','usdt','usdc'].includes(wallet.asset));
  if(!expanded){neighborhoodHops=1;neighborhoodSelect.value='1';}
  neighborhoodSelect.disabled=!expanded;
  rebuildNeighborhood();
  renderNetworkEvidence();
  noteLink.href=`account.html?wallet=${encodeURIComponent(wallet.address)}`;
  setText('record-type','SYNTHETIC WALLET / '+wallet.asset.toUpperCase());
  setText('record-id',wallet.id);
  setText('record-summary',`${wallet.address} · Star size and brightness represent a synthetic held amount, scaled within this asset. The amount begins with a generated balance and changes with the synthetic transfers; it is not an observed chain balance or AML risk.`);
  setText('record-asset',wallet.asset.toUpperCase());
  setText('record-holdings',`${wallet.holdings.toLocaleString('en-US')} ${units[wallet.asset]}`);
  setText('record-time',wallet.transactions[0].observed+' to '+wallet.transactions.at(-1).observed);
  setText('record-source',sourceNames[wallet.asset]);
  setText('record-related',`${wallet.transactions.length} synthetic transactions · ${wallet.volume.toLocaleString('en-US')} ${units[wallet.asset]}`);
  setText('record-meaning','Feature windows and temporal ML are research; no trained model or score.');
  renderEvidence(wallet);
  renderAnalytics(wallet);
  renderTemporal(wallet);
  renderPathExplorer(wallet);
  renderMotifs(wallet);
  renderFlows(wallet);
  const list=document.getElementById('transaction-list');list.replaceChildren();
  wallet.transactions.forEach(tx=>{
    const button=document.createElement('button');button.type='button';
    button.textContent=`${tx.id} · ${tx.direction} · ${tx.amount} ${units[wallet.asset]} · ${tx.counterparty}`;
    button.addEventListener('click',()=>selectTransaction(wallet,tx));list.append(button);
  });
  document.querySelector('.record-card').scrollTop=0;
  renderSearchStatus();updateSearchUrl();renderList();draw();
}
function selectTransaction(wallet,tx) {
  selectedTransaction=tx;
  setText('record-type','SYNTHETIC TRANSACTION / '+wallet.asset.toUpperCase());
  setText('record-id',tx.id);
  setText('record-summary',`${tx.direction} event with ${tx.counterparty} in an illustrative wallet flow. Amount: ${tx.amount} ${units[wallet.asset]}. The same synthetic transfer is visible from both wallets.`);
  setText('record-asset',wallet.asset.toUpperCase());setText('record-time',tx.observed);
  setText('record-holdings',`${wallet.holdings.toLocaleString('en-US')} ${units[wallet.asset]}`);
  setText('record-source',sourceNames[wallet.asset]);setText('record-related',`${wallet.id} ↔ ${tx.counterparty}`);
  setText('record-meaning','No AML finding or model output; source and finality would be required for a real event.');
  renderEvidence(wallet,tx);
  renderAnalytics(wallet);
  draw();
}
function renderList() {
  const list=document.getElementById('accessible-records');list.replaceChildren();
  const matches=search&&selectedWallet
    ?wallets.filter(displayed).sort((a,b)=>(neighborhoodLevels.get(a.id)??3)-(neighborhoodLevels.get(b.id)??3)||a.id.localeCompare(b.id))
    :wallets.filter(wallet=>visible(wallet)&&matchesSearch(wallet));
  if(!matches.length){const empty=document.createElement('p');empty.textContent='No synthetic wallets match this search and asset filter.';list.append(empty);return;}
  matches.forEach(wallet=>{
    const button=document.createElement('button');button.type='button';
    const depth=neighborhoodLevels.get(wallet.id);
    const position=search&&selectedWallet?(depth===0?'focus':depth===1?'step 1':depth===2?'step 2':'route point'):null;
    button.textContent=`${wallet.id} · ${wallet.address} · held ${wallet.holdings.toLocaleString('en-US')} ${units[wallet.asset]} · ${wallet.transactions.length} tx${position?' · '+position:''}`;
    button.addEventListener('click',()=>selectWallet(wallet,Boolean(search)));list.append(button);
  });
}
canvas.addEventListener('click',event=>{
  if(realObservation){
    const rect=canvas.getBoundingClientRect();
    const x=event.clientX-rect.left,y=event.clientY-rect.top;
    const transaction=realTransactionTargets.find(target=>Math.hypot(x-target.p.x,y-target.p.y)<13);
    if(transaction){selectRealTransaction(transaction.node.id);return;}
    const hit=realAddressTargets.find(target=>Math.hypot(x-target.p.x,y-target.p.y)<Math.max(13,target.radius+5));
    if(hit)inspectRealAddress(hit.address);
    return;
  }
  const rect=canvas.getBoundingClientRect();const x=event.clientX-rect.left,y=event.clientY-rect.top;
  const txHit=transactionDots.find(({p})=>Math.hypot(x-p.x,y-p.y)<12);
  if(txHit && selectedWallet){selectTransaction(selectedWallet,txHit.tx);return;}
  let nearest=null,distance=14;
  for(const wallet of wallets.filter(displayed)){const p=point(wallet),d=Math.hypot(x-p.x,y-p.y);if(d<distance){nearest=wallet;distance=d;}}
  if(nearest)selectWallet(nearest,Boolean(search));
});
canvas.addEventListener('keydown',event=>{
  if(realObservation){
    if(!realTransactionTargets.length)return;
    if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(event.key)){
      event.preventDefault();
      realKeyboardIndex=(realKeyboardIndex+(event.key==='ArrowRight'||event.key==='ArrowDown'?1:-1)+realTransactionTargets.length)%realTransactionTargets.length;
      canvas.setAttribute('aria-label',`Transaction ${realKeyboardIndex+1} of ${realTransactionTargets.length}: ${realTransactionTargets[realKeyboardIndex].node.txid}. Press Enter to inspect.`);
      draw();
    }else if(event.key==='Enter'||event.key===' '){
      event.preventDefault();selectRealTransaction(realTransactionTargets[realKeyboardIndex].node.id);
    }
    return;
  }
  const options=wallets.filter(displayed);
  if(!options.length)return;
  if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(event.key)){
    event.preventDefault();
    keyboardWalletIndex=(keyboardWalletIndex+(event.key==='ArrowRight'||event.key==='ArrowDown'?1:-1)+options.length)%options.length;
    canvas.setAttribute('aria-label',`${options[keyboardWalletIndex].id}, wallet ${keyboardWalletIndex+1} of ${options.length}. Press Enter to inspect.`);
    draw();
  } else if(event.key==='Enter'||event.key===' '){
    event.preventDefault();
    selectWallet(options[keyboardWalletIndex],Boolean(search));
  }
});
canvas.addEventListener('focus',()=>{
  if(realObservation){
    realKeyboardIndex=0;
    if(realTransactionTargets.length)canvas.setAttribute('aria-label',`Transaction 1 of ${realTransactionTargets.length}: ${realTransactionTargets[0].node.txid}. Press Enter to inspect.`);
    draw();return;
  }
  const options=wallets.filter(displayed);
  const index=options.findIndex(wallet=>wallet===selectedWallet);
  keyboardWalletIndex=index>=0?index:0;
  if(options.length)canvas.setAttribute('aria-label',`${options[keyboardWalletIndex].id}, wallet ${keyboardWalletIndex+1} of ${options.length}. Press Enter to inspect.`);
  draw();
});
canvas.addEventListener('blur',draw);
document.querySelectorAll('[data-constellation-asset]').forEach(button=>button.addEventListener('click',()=>{
  activeAsset=button.dataset.constellationAsset;
  liveButton.textContent=activeAsset==='blch'?'Load BLCH script hash':'Load public-chain address';
  document.getElementById('record-search').placeholder=activeAsset==='blch'?'64-hex Bloch script hash':'Address or synthetic wallet ID';
  keyboardWalletIndex=0;
  document.querySelectorAll('[data-constellation-asset]').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',String(item===button));});
  if(selectedWallet&&!visible(selectedWallet))clearWallet();
  if(search){const match=wallets.find(wallet=>visible(wallet)&&matchesSearch(wallet));if(match&&!selectedWallet)selectWallet(match);}
  renderSearchStatus();renderList();draw();
}));
document.getElementById('record-search').addEventListener('input',event=>{
  realRequest++;
  liveButton.disabled=false;
  if(realObservation){realObservation=null;setDataMode('synthetic','Generated example wallets and transfers; enter a mainnet address and load it to view public-chain facts.');}
  search=event.target.value.trim().toLowerCase();
  keyboardWalletIndex=0;
  document.getElementById('wallet-browser').open=Boolean(search);
  const match=wallets.find(wallet=>visible(wallet)&&matchesSearch(wallet));
  if(search&&match)selectWallet(match);
  else {clearWallet();renderSearchStatus();renderList();updateSearchUrl();draw();}
});
document.getElementById('clear-wallet-search').addEventListener('click',()=>{
  realRequest++;liveButton.disabled=false;realObservation=null;setDataMode('synthetic','Generated example wallets and transfers; no public-chain address is loaded.');
  const input=document.getElementById('record-search');input.value='';search='';document.getElementById('wallet-browser').open=false;clearWallet();renderSearchStatus();renderList();updateSearchUrl();draw();input.focus();
});
const pauseButton=document.getElementById('pause-constellation');
pauseButton.addEventListener('click',()=>{paused=!paused;pauseButton.setAttribute('aria-pressed',String(paused));pauseButton.textContent=paused?'Resume motion':'Pause motion';draw();});
if(paused){pauseButton.setAttribute('aria-pressed','true');pauseButton.textContent='Resume motion';}
new ResizeObserver(resize).observe(canvas);
const initialUrl=new URL(window.location.href);
const initialAsset=initialUrl.searchParams.get('asset')?.toLowerCase();
const initialAddress=initialUrl.searchParams.get('address');
const initialWallet=initialUrl.searchParams.get('wallet')||initialAddress;
if(initialAsset&&['btc','eth','usdt','usdc','blch'].includes(initialAsset)){
  document.querySelector(`[data-constellation-asset="${initialAsset}"]`).click();
}
if(initialWallet){const input=document.getElementById('record-search');input.value=initialWallet;input.dispatchEvent(new Event('input',{bubbles:true}));}
renderList();renderSearchStatus();resize();requestAnimationFrame(frame);
renderNetworkEvidence();
if(initialAddress&&assetForLiveAddress(initialAddress))loadLiveAddress();
