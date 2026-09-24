const network=document.body.dataset.network;
const $=selector=>document.querySelector(selector);
const make=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;};
const clear=node=>node.replaceChildren();
const count=value=>Number.isSafeInteger(value)?new Intl.NumberFormat('en-US').format(value):'—';
const short=value=>{const text=String(value??'—');return text.length>25?`${text.slice(0,13)}…${text.slice(-8)}`:text;};
const money=(raw,places=8)=>{try{const value=BigInt(raw),base=10n**BigInt(places);return `${new Intl.NumberFormat('en-US').format(value/base)}${value%base?'.'+(value%base).toString().padStart(places,'0').replace(/0+$/,''):''}`;}catch{return '—';}};
const ethHeight=value=>{try{return count(Number(BigInt(value)));}catch{return '—';}};
const when=value=>{const date=new Date(typeof value==='number'?value*1000:value);return Number.isFinite(date.getTime())?date.toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'})+' UTC':'—';};
const record=(kind,query,asset)=>{const params=new URLSearchParams({network,kind,query:String(query)});if(asset)params.set('asset',asset);return `/?${params}`;};
const themeKey='bloch-space-theme';
try{if(localStorage.getItem(themeKey)==='dark')document.documentElement.dataset.theme='dark';}catch{}
function theme(){const dark=document.documentElement.dataset.theme==='dark';$('#theme-toggle').setAttribute('aria-label',`Switch to ${dark?'light':'dark'} theme`);$('.theme-toggle-label').textContent=dark?'Light':'Dark';$('meta[name="theme-color"]').content=dark?'#050706':'#f8faf4';}
theme();$('#theme-toggle').addEventListener('click',()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem(themeKey,document.documentElement.dataset.theme);}catch{}theme();});
$('#chain-search').addEventListener('submit',event=>{event.preventDefault();const query=$('#chain-query').value.trim();if(query)location.href=record('auto',query);});

function metric(label,value,detail){const box=make('div','chain-metric');box.append(make('span','',label),make('strong','',value),make('small','',detail));return box;}
function chart(title,description,items){
  const panel=make('section','chain-chart');panel.append(make('h3','',title),make('p','',description));
  const valid=items.filter(item=>{try{return BigInt(item.value)>=0n;}catch{return false;}}).slice(0,24);
  if(!valid.length){panel.append(make('p','chain-unavailable','No validated observations in this source response.'));return panel;}
  const maximum=valid.reduce((max,item)=>BigInt(item.value)>max?BigInt(item.value):max,0n)||1n;
  const list=make('div','chart-rows');
  for(const item of valid){const line=make(item.href?'a':'div','chart-row');if(item.href)line.href=item.href;
    line.append(make('span','chart-label',item.label));const track=make('span','chart-track');const fill=make('span','chart-fill');fill.style.width=`${Math.max(1,Number(BigInt(item.value)*10000n/maximum)/100)}%`;track.append(fill);line.append(track,make('strong','chart-value',item.display));list.append(line);}
  panel.append(list);return panel;
}
function recordRow(label,detail,side,href){const link=make('a','chain-record');link.href=href;const main=make('span');main.append(make('strong','',label),make('small','',detail));link.append(main,make('em','',side));return link;}
function sourceDetails(data,extra=[]){const host=$('#chain-provenance');clear(host);
  for(const [label,value] of [['Source',data.source],['Retrieved',when(data.retrieved_at)],['Source boundary',data.note],...extra]){const box=make('div','source-detail');box.append(make('span','',label),make('strong','',value??'Unavailable'));host.append(box);}
  $('#chain-json').textContent=JSON.stringify(data,null,2);
}
function initValidatorSection(){
  const section=make('section','chain-section');section.id='validator-section';
  const head=make('div','chain-section-head'),heading=make('div');heading.append(make('p','eyebrow','VALIDATOR REGISTRY'),make('h2','','Validator records'));
  head.append(heading,make('p','','32 indices per aggregator page. Missing records remain visible; the list is not an operator count.'));
  const status=make('p','chain-scope','Loading validator records…'),chartHost=make('div','chain-charts'),list=make('div','chain-records');
  const controls=make('div','validator-controls'),previous=make('button','','← Previous 32'),next=make('button','','Next 32 →');
  previous.type=next.type='button';controls.append(previous,next);section.append(head,status,chartHost,list,controls);
  $('#chain-nodes').closest('.chain-section').before(section);
  let offset=0,busy=false;
  async function load(nextOffset){
    if(busy)return;busy=true;previous.disabled=next.disabled=true;status.textContent='Loading validator source page…';
    try{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);let response;
      try{response=await fetch(`/api/validators?network=bloch&offset=${nextOffset}`,{signal:controller.signal,cache:'no-store'});}finally{clearTimeout(timer);}
      const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
      offset=nextOffset;clear(chartHost);clear(list);
      const rows=data.validators||[],stakeRows=rows.filter(row=>row.effective_stake_sat).slice().sort((a,b)=>BigInt(b.effective_stake_sat)>BigInt(a.effective_stake_sat)?1:-1).slice(0,16);
      chartHost.append(chart('Effective stake / current page','Largest 16 readable records in this page only. Effective stake is a consensus weight, not operator ownership.',stakeRows.map(row=>({label:`#${count(row.index)} ${short(row.pubkey_hash)}`,value:row.effective_stake_sat,display:`${money(row.effective_stake_sat)} BLCH`}))));
      for(const row of rows){const card=make('div','chain-record'),main=make('span');main.append(make('strong','',`#${count(row.index)} · ${row.pubkey_hash?short(row.pubkey_hash):'Record unavailable'}`),make('small','',row.unavailable||`Own ${money(row.own_stake_sat)} BLCH · effective ${money(row.effective_stake_sat)} BLCH · commission ${row.commission_bps} bps`));card.append(main,make('em','',row.unavailable?'Unavailable':row.slashed?'Slashed':row.state));list.append(card);}
      status.textContent=`Indices ${count(offset)}–${count(offset+rows.length-1)} of ${count(data.counts?.total)} · generated ${when(data.generated_at)} · ${data.corroboration?.state||'unavailable'} aggregator comparison. Separate from the head above.`;
      previous.hidden=offset===0;next.hidden=data.next_offset==null;
      next.dataset.offset=String(data.next_offset??'');
    }catch(error){status.textContent=`Validator page unavailable: ${error.message}. Retry with a page button.`;}
    finally{busy=false;previous.disabled=next.disabled=false;}
  }
  previous.addEventListener('click',()=>load(Math.max(0,offset-32)));
  next.addEventListener('click',()=>load(Number(next.dataset.offset||offset)));
  load(0);
}
function renderBitcoin(data){
  const h=data.head||{},m=data.mempool||{},fees=data.fee_estimates_sat_vbyte||{},blocks=(data.recent_blocks||[]).filter(row=>Number.isSafeInteger(row.height));
  $('#chain-metrics').append(metric('Best chain height',count(h.height),'Source reported'),metric('Mempool entries',count(m.count),'Node view'),metric('Mempool size',m.vsize==null?'—':`${count(m.vsize)} vB`,'Reported virtual bytes'),metric('Latest block transactions',count(h.tx_count),'Best chain block'),metric('Fee target / 3 blocks',fees['3']==null?'—':`${Number(fees['3']).toFixed(1)} sat/vB`,'Source estimate'),metric('Recent block sample',count(blocks.length),'Up to ten blocks'));
  const charts=$('#chain-charts');charts.append(chart('Transactions per block','Ten recent source blocks. Each bar opens its full block record.',blocks.slice().reverse().map(b=>({label:`#${count(b.height)}`,value:b.tx_count,display:count(b.tx_count),href:record('block',b.height)}))),chart('Block size','Bytes in the same bounded best-chain sample.',blocks.slice().reverse().map(b=>({label:`#${count(b.height)}`,value:b.size,display:`${(b.size/1e6).toFixed(2)} MB`,href:record('block',b.height)}))));
  const bins=(m.fee_histogram||[]).filter(pair=>Array.isArray(pair)&&pair.length===2&&Number.isFinite(pair[0])&&pair[0]>=0&&Number.isSafeInteger(pair[1])&&pair[1]>0).sort((a,b)=>b[0]-a[0]).slice(0,16);
  if(bins.length)charts.append(chart('Mempool fee depth','Highest 16 source fee-rate bins; bar length shows virtual bytes, not a confirmation forecast.',bins.map(([fee,size])=>({label:`${fee.toFixed(1)} sat/vB`,value:size,display:`${(size/1e6).toFixed(2)}M vB`}))));
  $('#chain-coverage').textContent='Up to ten recent best-chain blocks. Reorganizations can change this view.';
  for(const b of blocks)$('#chain-records').append(recordRow(`#${count(b.height)} · ${short(b.id)}`,when(b.timestamp),`${count(b.tx_count)} tx`,record('block',b.height)));
  sourceDetails(data,[['Mempool snapshot','Separate from block observations'],['Fee estimate','Source-reported estimate, not advice']]);
}
function renderEthereum(data){
  const h=data.head||{},f=data.finalized||{},history=data.fee_history,ratios=history?.gas_used_ratio||[],fees=history?.base_fee_wei||[];
  const latest=Number(BigInt(h.number)),finalized=Number(BigInt(f.number));
  $('#chain-metrics').append(metric('Latest block',count(latest),'Execution head'),metric('Finalized checkpoint',count(finalized),'Separate RPC read'),metric('Checkpoint distance',`${count(latest-finalized)} blocks`,'Height difference only'),metric('Latest transactions',count(h.transactions?.length),'IDs in latest block'),metric('Gas used',ethHeight(h.gasUsed),'Latest block'),metric('Gas price',`${money(data.gas_price_wei,9)} gwei`,'Source observation'));
  if(history){const oldest=BigInt(history.oldest_height);const charts=$('#chain-charts');charts.append(chart('Gas used / block limit','Up to twelve source-reported blocks; each bar opens its block.',ratios.map((ratio,index)=>({label:`#${(oldest+BigInt(index)).toString()}`,value:Math.round(ratio*10000),display:`${(ratio*100).toFixed(1)}%`,href:record('block',(oldest+BigInt(index)).toString())}))),chart('Base fee per gas','Exact wei remain in the API; displayed bars use gwei.',fees.map((fee,index)=>({label:`#${(oldest+BigInt(index)).toString()}`,value:fee,display:`${money(fee,9)} gwei`,href:record('block',(oldest+BigInt(index)).toString())}))));}
  else $('#chain-charts').append(make('p','chain-unavailable','Optional fee history is unavailable from this RPC source.'));
  $('#chain-coverage').textContent='First 24 transaction IDs returned with the latest block; this is not a full chain feed.';
  for(const tx of (h.transactions||[]).slice(0,24))$('#chain-records').append(recordRow(short(tx),`Block #${count(latest)}`,'Open ↗',record('tx',tx)));
  sourceDetails(data,[['Latest block hash',h.hash],['Finalized block hash',f.hash],['Checkpoint scope','Source-reported consensus checkpoint; not independently verified']]);
}
function peerTrend(history){
  const points=history?.points||[],valid=points.filter(p=>Number.isSafeInteger(p.connections)&&Number.isSafeInteger(p.reporting_nodes)&&p.reporting_nodes>0);
  if(valid.length<2)return null;
  const panel=make('section','chain-chart peer-trend');panel.append(make('h3','','Monitored connection trend'),make('p','',`Six-hour source series · ${count(valid.length)} measured points. Gaps or reporting-node changes interrupt the line. Connections are not distinct peers.`));
  const low=Math.min(...valid.map(p=>p.connections)),high=Math.max(...valid.map(p=>p.connections)),first=points[0].at,last=points.at(-1).at;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 640 170');svg.setAttribute('role','img');svg.setAttribute('aria-label',`${count(low)} to ${count(high)} reported connections across monitored nodes, from ${when(first/1000)} to ${when(last/1000)}`);
  const x=at=>20+600*(at-first)/Math.max(1,last-first),y=value=>145-120*(value-low)/Math.max(1,high-low);
  let segment=[];const paths=[];const flush=()=>{if(segment.length>1)paths.push(segment.map((p,i)=>`${i?'L':'M'}${x(p.at).toFixed(1)} ${y(p.connections).toFixed(1)}`).join(' '));segment=[];};
  for(const point of points){if(!Number.isSafeInteger(point.connections)||!Number.isSafeInteger(point.reporting_nodes)||point.reporting_nodes<=0){flush();continue;}if(segment.length&&segment.at(-1).reporting_nodes!==point.reporting_nodes)flush();segment.push(point);}flush();
  for(const path of paths){const line=document.createElementNS('http://www.w3.org/2000/svg','path');line.setAttribute('d',path);line.setAttribute('fill','none');line.setAttribute('stroke','currentColor');line.setAttribute('stroke-width','2');svg.append(line);}
  panel.append(svg,make('p','',`${when(first/1000)} → ${when(last/1000)} · ${count(low)}–${count(high)} connections. The visual axis is scaled to this source window.`));return panel;
}
function renderBloch(data){
  const h=data.head||{},health=data.health||{},holders=data.holders,peers=data.peers,mempool=data.mempool_details,diagnostics=data.network_diagnostics;
  $('#chain-metrics').append(metric('Head height',count(h.height),'PoS block count'),metric('Head slot',count(h.slot),'Epoch position'),metric('Reported finalized height',count(h.finalized_height),'Network claim'),metric('Epoch',count(h.epoch),'Head response'),metric('Active validators',h.validators?`${count(h.validators.active)} / ${count(h.validators.total)}`:'—','Network head'),metric('Active stake',h.total_active_stake_sat?`${money(h.total_active_stake_sat)} BLCH`:'—','Network head'),metric('Indexed transactions',count(health.transactions),'Verified indexer'),metric('Funded script references',count(holders?.total_script_hashes_with_balance),'Indexed eUTXO references'),metric('Monitored nodes',count(peers?.reporting_nodes),'Connection distribution'),metric('Node-local mempool',count(mempool?.size),'Separate RPC call'),metric('Mempool capacity',count(mempool?.max),'Source reported'),metric('Indexer slot',count(health.indexed_to_slot),'Separate snapshot'),metric('Archival observers',diagnostics?.plane?`${count(diagnostics.plane.responding)} / ${count(diagnostics.plane.of)}`:'—','Edge observer plane'),metric('Head agreement',diagnostics?.plane?.agree_on_head===true?'Reported yes':diagnostics?.plane?.agree_on_head===false?'Reported no':'—','Source diagnostic'));
  const charts=$('#chain-charts');
  if(Number.isSafeInteger(h.slot_in_epoch)&&Number.isSafeInteger(h.slots_per_epoch)&&h.slots_per_epoch>0){const panel=make('section','chain-chart epoch-chart');panel.append(make('h3','','Epoch position'),make('p','',`Slot ${count(h.slot_in_epoch)} of ${count(h.slots_per_epoch)} in epoch ${count(h.epoch)}. A slot is not necessarily a produced block.`));const track=make('div','epoch-track');for(let i=0;i<h.slots_per_epoch&&i<128;i++)track.append(make('i',i<=h.slot_in_epoch?'filled':''));panel.append(track,make('p','',`Justified epoch ${count(h.justified?.epoch)} · finalized epoch ${count(h.finalized?.epoch)} · reported head height ${count(h.height)}`));charts.append(panel);}
  if(peers?.bins?.length)charts.append(chart('Connections across monitored nodes',`Sampled ${when(peers.sampled_at/1000)}. These are socket counts, not distinct network peers.`,peers.bins.map(bin=>({label:`${count(bin.connections_per_node)} connections`,value:bin.reporting_nodes,display:`${count(bin.reporting_nodes)} nodes`}))));
  else charts.append(make('p','chain-unavailable','Monitored connection distribution is unavailable.'));
  const trend=peerTrend(data.peer_history);if(trend)charts.append(trend);
  if(holders?.holders?.length)charts.append(chart('Largest funded script references','Top 16 of a bounded indexer holder page. Script hashes do not identify people or complete wallets.',holders.holders.slice(0,16).map(holder=>({label:`#${count(holder.rank)} ${short(holder.script_hash)}`,value:holder.balance_sat,display:`${money(holder.balance_sat)} BLCH`,href:record('address',holder.script_hash,'BLCH')}))));
  $('#chain-coverage').textContent=`First ${count(holders?.holders?.length)} funded script references of ${count(holders?.total_script_hashes_with_balance)} source-reported. One script is not one owner.`;
  for(const holder of holders?.holders?.slice(0,32)||[])$('#chain-records').append(recordRow(`#${count(holder.rank)} · ${short(holder.script_hash)}`,`${count(holder.utxo_count)} UTXOs`,`${money(holder.balance_sat)} BLCH`,record('address',holder.script_hash,'BLCH')));
  for(const tx of data.recent_transactions||[])$('#chain-extra-records').append(recordRow(short(tx.txid),`Slot ${count(tx.slot)} · ${tx.kind||'transaction'}`,`${tx.fee_sat??'—'} sat fee`,record('tx',tx.txid)));
  for(const node of diagnostics?.nodes||[]){const card=make('div','chain-record');const main=make('span');main.append(make('strong','',`${node.id||'Observer'} · ${node.role||'role unavailable'}`),make('small','',`Height ${count(node.height)} · slot ${count(node.slot)} · latency ${count(node.latency_ms)} ms`));card.append(main,make('em','',node.status||'unobserved'));$('#chain-nodes').append(card);}
  if(diagnostics?.reorg_events?.length){const section=$('#chain-reorgs');section.append(make('h3','','Recorded chain-change signals'));const list=make('div','chain-records');for(const event of diagnostics.reorg_events){const card=make('div','chain-record');const main=make('span');main.append(make('strong','',`${event.signal||'Signal'} · ${event.kind||'unspecified'}`),make('small','',`${event.at?when(event.at/1000):'Time unavailable'} · previous ${count(event.was)} · reported ${count(event.now)}`));card.append(main);list.append(card);}section.append(list,make('p','chain-scope','These are source-recorded events, not a complete reorganization history or independent finality proof.'));}
  const sameTip=health.chain_tip&&health.chain_tip===h.block_id&&health.indexed_to_height===h.height&&health.indexed_to_slot===h.slot;
  sourceDetails(data,[['Network head',h.block_id],['Indexer chain tip',health.chain_tip],['Head / indexer comparison',sameTip?'Same reported block ID, height and slot':'Separate or unavailable positions'],['Peer sample',peers?when(peers.sampled_at/1000):'Unavailable'],['Node build',diagnostics?.build?.version],['Build tree state',diagnostics?.build?.tree_state],['Supply RPC','getsupply is not served by the current public implementation']]);
}

let current=null,pending=false;
async function refresh(){if(pending)return;pending=true;$('#chain-refresh').disabled=true;$('#chain-status').textContent=current?'Refreshing source data…':'Loading source data…';
  try{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);let response;
    try{response=await fetch(`/api/overview?network=${network}`,{signal:controller.signal,cache:'no-store'});}finally{clearTimeout(timer);}
    const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
    current=data;for(const id of ['chain-metrics','chain-charts','chain-records','chain-extra-records','chain-nodes','chain-reorgs']){const node=$(`#${id}`);if(node)clear(node);}
    if(network==='bitcoin')renderBitcoin(data);else if(network==='ethereum')renderEthereum(data);else renderBloch(data);
    $('#chain-status').textContent=`Source retrieved ${when(data.retrieved_at)}`;
  }catch(error){$('#chain-status').textContent=`${current?'Showing last successful snapshot. ':'Source unavailable. '}${error.message}`;}
  finally{pending=false;$('#chain-refresh').disabled=false;}
}
$('#chain-refresh').addEventListener('click',refresh);refresh();setInterval(()=>{if(!document.hidden)refresh();},60000);
if(network==='bloch')initValidatorSection();
