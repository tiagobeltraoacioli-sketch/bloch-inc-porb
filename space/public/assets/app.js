const $ = selector => document.querySelector(selector);
const themeStorageKey='bloch-space-theme';
try{if(localStorage.getItem(themeStorageKey)==='dark')document.documentElement.dataset.theme='dark';}catch{}
function setTheme(theme,persist=false){
  document.documentElement.dataset.theme=theme;
  const next=theme==='light'?'dark':'light';
  const toggle=$('#theme-toggle');toggle.setAttribute('aria-label',`Switch to ${next} theme`);toggle.title=`Switch to ${next} theme`;
  toggle.querySelector('.theme-toggle-label').textContent=next==='light'?'Light':'Dark';
  $('meta[name="theme-color"]').content=theme==='light'?'#f8faf4':'#050706';
  if(persist)try{localStorage.setItem(themeStorageKey,theme);}catch{}
}
setTheme(document.documentElement.dataset.theme==='dark'?'dark':'light');
$('#theme-toggle').addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='light'?'dark':'light',true));
const state = {network:'bitcoin', overview:null, result:null, request:0, navigation:0};
const titles = {bitcoin:'Bitcoin / mainnet', ethereum:'Ethereum / mainnet', bloch:'Bloch / Genesis-4'};
const hints = {bitcoin:'Search a Bitcoin address, transaction ID, block hash or height.',ethereum:'Search an Ethereum address, transaction hash, block hash or height. Choose ETH, USDT or USDC for addresses.',bloch:'Search a 64-hex script hash, transaction ID, block ID or slot.'};
const assetDecimals = {BTC:8, ETH:18, USDT:6, USDC:6, BLCH:8};
const clear = node => node.replaceChildren();
const element = (tag, className, text) => {const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;};
const compact = value => {const text=String(value??'—');return text.length>27?`${text.slice(0,15)}…${text.slice(-9)}`:text;};
const count = value => Number.isSafeInteger(value)?new Intl.NumberFormat('en-US').format(value):value==null?'—':String(value);
const hexNumber = value => {try{return count(Number(BigInt(value)));}catch{return '—';}};
const decimal = (raw, places) => {try{const n=BigInt(raw);const base=10n**BigInt(places);const whole=(n/base).toString();const part=(n%base).toString().padStart(places,'0').replace(/0+$/,'');return `${new Intl.NumberFormat('en-US').format(BigInt(whole))}${part?'.'+part.slice(0,8):''}`;}catch{return '—';}};
const time = value => {const date=new Date(typeof value==='number'?value*1000:value);return Number.isFinite(date.getTime())?date.toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'})+' UTC':'—';};
const message = (text, error=false) => {const node=$('#message');node.hidden=!text;node.textContent=text;node.dataset.state=error?'error':'info';};
const note = text => element('p','result-copy',text);

async function api(route, network, query, asset, offset=0) {
  const params=new URLSearchParams({network});
  if(query)params.set('query',query);
  if(asset && route==='address')params.set('asset',asset);
  if(route==='block'&&offset>0)params.set('offset',String(offset));
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(`/api/${route}?${params}`,{signal:controller.signal,cache:'no-store'});
    const body=await response.json();
    if(!response.ok)throw new Error(body.error||`Source returned ${response.status}`);
    return body;
  }finally{clearTimeout(timer);}
}

function metric(label,value,detail='') {const box=element('div','metric');box.append(element('span','',label),element('strong','',value));if(detail)box.append(element('small','',detail));return box;}
function signal(label,value) {const box=element('div','signal-item');box.append(element('span','',label),element('strong','',value));return box;}
function row(label,detail,side='',action=null) {const item=element('div','record-row');const main=element('div');if(action){const button=element('button','',label);button.type='button';button.addEventListener('click',action);main.append(button);}else main.append(element('strong','',label));if(detail)main.append(element('small','',detail));item.append(main,element('span','',side));return item;}
function card(kicker,title) {const section=element('section','result-card');section.append(element('p','eyebrow',kicker),element('h3','',title));return section;}
function fields(container, entries) {const list=element('dl','field-grid');for(const [label,value] of entries){const item=element('div','field');item.append(element('dt','',label),element('dd','',value??'—'));list.append(item);}container.append(list);}
function provenance(data, additional=[]) {const section=card('SOURCE / SCOPE','How this answer was made');const list=element('div','provenance');for(const [label,value] of [['Source',data.source],['Retrieved',time(data.retrieved_at)],['Independent verification',data.independent_verification?'Yes':'No'],['Boundary',data.note],...additional]){const box=element('div');box.append(element('span','',label),element('strong','',value??'—'));list.append(box);}section.append(list);return section;}
async function copyRecordText(value,button){
  const original=button.textContent;
  try{
    if(!navigator.clipboard?.writeText)throw new Error('clipboard_unavailable');
    await navigator.clipboard.writeText(value);
    button.textContent='Copied ✓';
  }catch{button.textContent='Copy unavailable';}
  setTimeout(()=>{button.textContent=original;},2300);
}
function recordIdentity(value){
  const container=element('div','record-identity');container.append(element('div','record-id',value));
  const actions=element('div','record-actions');
  const copyId=element('button','','Copy ID');copyId.type='button';copyId.setAttribute('aria-live','polite');copyId.addEventListener('click',()=>copyRecordText(value,copyId));
  const copyLink=element('button','','Copy link');copyLink.type='button';copyLink.setAttribute('aria-live','polite');copyLink.addEventListener('click',()=>copyRecordText(new URL(`${location.pathname}${location.search}`,'https://bloch.space').href,copyLink));
  actions.append(copyId,copyLink);container.append(actions);return container;
}
function referenceSection(container,items){
  if(!items.length)return;
  container.append(element('h4','subhead','Explore related records'));
  const list=element('div','record-list');
  for(const item of items)list.append(row(item.label,compact(item.query),'↗',()=>openRecord(item.kind,item.query,item.asset)));
  container.append(list);
}
function batchedRows(container,entries,render,batchSize=60){
  const list=element('div','record-list');container.append(list);
  let shown=0;
  const controls=element('div','record-pages');
  const more=element('button','','');more.type='button';
  const appendNext=()=>{
    const end=Math.min(shown+batchSize,entries.length);
    for(;shown<end;shown++)list.append(render(entries[shown],shown));
    more.textContent=`Show next ${Math.min(batchSize,entries.length-shown)} · ${count(shown)} of ${count(entries.length)} shown`;
    controls.hidden=shown===entries.length;
  };
  more.addEventListener('click',appendNext);controls.append(more);container.append(controls);appendNext();
}
function openRecord(kind,query,asset) {$('#search-kind').value=kind;$('#search-input').value=query;if(state.network==='ethereum'&&asset)$('#search-asset').value=asset;search(kind,query,asset);}

function renderHolders(page) {
  const panel=$('#holder-map');clear(panel);panel.hidden=!page?.holders?.length;
  if(panel.hidden)return;
  const title=element('div','holder-map-head');title.append(element('strong','',`GRAPHUS OCULUM / TOP ${count(page.returned)} SCRIPT REFERENCES`),element('span','',`H${count(page.as_of_height)} · ${64-page.returned} open positions`));panel.append(title);
  const grid=element('div','holder-map-grid');grid.setAttribute('role','list');grid.setAttribute('aria-label','64 ranked Bloch script positions');
  const largest=BigInt(page.holders[0].balance_sat);
  for(let index=0;index<64;index++){
    const holder=page.holders[index];const cell=element('div','holder-map-cell');cell.setAttribute('role','listitem');
    if(holder){const ratio=Math.log1p(99*Number(holder.balance_sat)/Number(largest))/Math.log(100);const size=Math.round(8+ratio*31);const button=element('button','holder-dot',String(index+1));button.type='button';button.style.setProperty('--dot-size',`${size}px`);button.style.setProperty('--dot-glow',`${Math.round(2+ratio*24)}px`);button.title=`#${index+1} · ${decimal(holder.balance_sat,8)} BLCH · ${holder.utxo_count} UTXOs`;button.setAttribute('aria-label',`Rank ${index+1}: ${decimal(holder.balance_sat,8)} BLCH, inspect script`);button.addEventListener('click',()=>openRecord('address',holder.script_hash,'BLCH'));cell.append(button);}
    else{cell.classList.add('holder-map-empty');cell.setAttribute('aria-label',`Position ${index+1}: no funded script reference`);cell.append(element('span','holder-empty-dot'));}
    grid.append(cell);
  }
  panel.append(grid,element('p','holder-map-note','Exact indexed eUTXO balances. Size and glow use a visual scale; script references do not identify wallet owners.'));
}

function renderBitcoinMempool(mempool,recent) {
  const panel=$('#btc-mempool');clear(panel);panel.hidden=true;
  const raw=mempool?.fee_histogram;
  if(!Array.isArray(raw)||!raw.length||raw.length>512)return;
  const bins=raw.filter(pair=>Array.isArray(pair)&&pair.length===2&&Number.isFinite(pair[0])&&pair[0]>=0&&Number.isSafeInteger(pair[1])&&pair[1]>0);
  if(bins.length!==raw.length||bins.some((pair,index)=>index&&pair[0]>bins[index-1][0]))return;
  const total=bins.reduce((sum,pair)=>sum+pair[1],0);
  if(!Number.isSafeInteger(total)||total<=0)return;
  panel.hidden=false;
  const header=element('div','mempool-head');header.append(element('strong','',`MEMPOOL FEE DEPTH / ${count(bins.length)} SOURCE BINS`),element('span','',`${(total/1e6).toFixed(2)}M vB in histogram`));panel.append(header);
  panel.append(element('p','mempool-range',`Higher fee bins first · ${bins[0][0].toFixed(2)} to ${bins.at(-1)[0].toFixed(2)} sat/vB`));
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 720 220');svg.setAttribute('role','img');svg.setAttribute('aria-label','Cumulative mempool virtual bytes ordered from higher to lower fee-rate bins.');
  const ns='http://www.w3.org/2000/svg';const svgEl=(tag,attrs,text)=>{const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=String(text);return node;};
  const left=32,right=690,top=22,bottom=182;
  const logMin=Math.log1p(bins.at(-1)[0]),logRange=Math.max(.001,Math.log1p(bins[0][0])-logMin);
  const y=rate=>bottom-(Math.log1p(rate)-logMin)/logRange*(bottom-top);
  let cumulative=0,path=`M ${left} ${y(bins[0][0]).toFixed(2)}`;
  for(let index=0;index<bins.length;index++){cumulative+=bins[index][1];path+=` H ${(left+(right-left)*cumulative/total).toFixed(2)}`;if(index+1<bins.length)path+=` V ${y(bins[index+1][0]).toFixed(2)}`;}
  svg.append(svgEl('line',{x1:left,y1:bottom,x2:right,y2:bottom,stroke:'#6b8067','stroke-width':1}));
  for(const budget of [1e6,3e6,6e6]){if(budget>=total)continue;const x=left+(right-left)*budget/total;svg.append(svgEl('line',{x1:x,y1:top,x2:x,y2:bottom,stroke:'#779268','stroke-dasharray':'3 5',opacity:.6}));svg.append(svgEl('text',{x:x+4,y:top+11,fill:'#b4c7a9','font-size':10,'font-family':'monospace'},`${budget/1e6}M`));}
  svg.append(svgEl('path',{d:`${path} L ${right} ${bottom} L ${left} ${bottom} Z`,fill:'#baff281b'}),svgEl('path',{d:path,fill:'none',stroke:'#baff28','stroke-width':2,'stroke-linejoin':'round'}));
  svg.append(svgEl('text',{x:left,y:209,fill:'#95a791','font-size':10,'font-family':'monospace'},'0 vB'),svgEl('text',{x:right,y:209,fill:'#95a791','font-size':10,'font-family':'monospace','text-anchor':'end'},`${(total/1e6).toFixed(2)}M vB`));
  panel.append(svg);
  const thresholds=element('div','mempool-thresholds');
  for(const budget of [1e6,3e6,6e6]){if(budget>total)continue;let covered=0;const pair=bins.find(item=>(covered+=item[1])>=budget);if(pair)thresholds.append(metric(`Bin floor at ${budget/1e6}M vB`,`${pair[0].toFixed(2)} sat/vB`));}
  if(thresholds.childElementCount)panel.append(thresholds);
  panel.append(element('p','mempool-note','Cumulative source histogram from higher to lower fee bins. Bin floors are observed backlog positions, not confirmation forecasts or fee recommendations.'));
  if(recent?.length){panel.append(element('h4','subhead','Recent mempool entries / source observed'));const list=element('div','record-list mempool-recent');for(const tx of recent)list.append(row(compact(tx.txid),`${count(tx.vsize)} vB · ${count(tx.fee)} sat fee`,`${(tx.fee/tx.vsize).toFixed(2)} sat/vB`,()=>openRecord('tx',tx.txid)));panel.append(list);}
}

function renderOverview(data) {
  state.overview=data;
  const network=state.network;
  $('#network-title').textContent=titles[network];
  const metrics=$('#metrics'),signals=$('#signal'),latest=$('#latest-list');clear(metrics);clear(signals);clear(latest);
  renderHolders(network==='bloch'?data.holders:null);
  if(network==='bitcoin')renderBitcoinMempool(data.mempool,data.recent_mempool);else{clear($('#btc-mempool'));$('#btc-mempool').hidden=true;}
  $('#network-status').textContent='Source live';$('#network-status').dataset.state='ok';
  $('#source-line').textContent=`${data.source} · retrieved ${time(data.retrieved_at)} · ${data.note}`;
  if(network==='bitcoin'){
    const h=data.head, mem=data.mempool||{}, fees=data.fee_estimates_sat_vbyte||{};
    metrics.append(metric('Best chain height',count(h.height),'Source reported'),metric('Transactions in block',count(h.tx_count)),metric('Block size',`${count(h.size)} bytes`),metric('Mempool count',count(mem.count),'Node view'),metric('Mempool volume',mem.vsize==null?'—':`${count(mem.vsize)} vB`),metric('Fee target / 3 blocks',fees['3']==null?'—':`${Number(fees['3']).toFixed(1)} sat/vB`));
    signals.append(signal('Current block',compact(h.id)),signal('Block timestamp',time(h.timestamp)),signal('Confirmation model','Probabilistic proof of work'));
    $('#latest-note').textContent='Ten best-chain blocks reported by Blockstream Esplora.';
    for(const block of data.recent_blocks||[])latest.append(row(`#${count(block.height)} · ${compact(block.id)}`,`${count(block.tx_count)} transactions · ${time(block.timestamp)}`,`${count(block.size)} B`,()=>openRecord('block',String(block.height))));
  }else if(network==='ethereum'){
    const h=data.head,f=data.finalized;
    const height=hexNumber(h.number),final=hexNumber(f.number);
    metrics.append(metric('Latest block',height,'Source reported'),metric('Finalized block',final,'Consensus checkpoint'),metric('Transactions',count(h.transactions?.length)),metric('Gas used',hexNumber(h.gasUsed)),metric('Gas limit',hexNumber(h.gasLimit)),metric('Gas price',`${decimal(data.gas_price_wei,'9')} gwei`));
    signals.append(signal('Latest hash',compact(h.hash)),signal('Finalized hash',compact(f.hash)),signal('Finality gap',`${count(Number(BigInt(h.number)-BigInt(f.number)))} blocks`));
    $('#latest-note').textContent='First 24 transaction IDs from the latest RPC block.';
    for(const tx of (h.transactions||[]).slice(0,24))latest.append(row(compact(tx),'Transaction in latest block','ETH',()=>openRecord('tx',tx)));
  }else{
    const h=data.head,health=data.health,holders=data.holders;
    metrics.append(metric('Head height',count(h.height),'PoS block count'),metric('Head slot',count(h.slot),'Epoch position'),metric('Finalized height',count(h.finalized_height),'Network claim'),metric('Epoch',count(h.epoch)),metric('Indexed transactions',count(health?.transactions)),metric('Funded script references',count(holders?.total_script_hashes_with_balance),'eUTXO only'));
    signals.append(signal('Head block',compact(h.block_id)),signal('Indexer slot',count(health?.indexed_to_slot)),signal('Corroboration',data.corroboration?.level||'unknown'));
    $('#latest-note').textContent='Recent indexed transfers; blocks without transactions remain visible by slot search.';
    for(const tx of data.recent_transactions||[])latest.append(row(compact(tx.txid),`Slot ${count(tx.slot)} · ${tx.kind}`,`${tx.fee_sat??'—'} sat fee`,()=>openRecord('tx',tx.txid)));
  }
}

function graph(wallet, activity, asset) {
  const nodes=(activity?.nodes?.length?activity.nodes:wallet?.nodes)||[];
  const edges=(activity?.edges?.length?activity.edges:wallet?.edges)||[];
  if(!nodes.length || !edges.length)return note('No bounded relationship edges were returned for this identifier. A balance alone cannot supply a transaction graph.');
  const panel=element('div','graph-panel');const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 700 330');svg.setAttribute('role','group');svg.setAttribute('aria-label','Observed network references and transaction edges. Select a point to inspect a record. Source limitations follow below.');
  const positions=new Map();const shown=nodes.slice(0,15);const center=shown[0];positions.set(center.id,{x:350,y:165});shown.slice(1).forEach((node,index)=>{const angle=2*Math.PI*index/Math.max(1,shown.length-1)-Math.PI/2;positions.set(node.id,{x:350+245*Math.cos(angle),y:165+120*Math.sin(angle)});});
  const ns='http://www.w3.org/2000/svg';const svgEl=(name,attrs)=>{const item=document.createElementNS(ns,name);for(const [key,value] of Object.entries(attrs))item.setAttribute(key,String(value));return item;};
  for(const edge of edges.slice(0,24)){const a=positions.get(edge.from),b=positions.get(edge.to);if(!a||!b)continue;const line=svgEl('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#60884b','stroke-width':1.2,opacity:.75});svg.append(line);}
  for(const node of shown){
    const p=positions.get(node.id),root=node.id===center.id;
    const txid=node.kind==='transaction'&&/^(?:0x)?[0-9a-f]{64}$/i.test(node.txid||'')?node.txid:null;
    const address=node.kind!=='transaction'&&(
      state.network==='ethereum'&&/^0x[0-9a-f]{40}$/i.test(node.address||'')||
      state.network==='bloch'&&/^[0-9a-f]{64}$/i.test(node.address||'')||
      state.network==='bitcoin'&&/^(?:[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[ac-hj-np-z02-9]{11,87})$/i.test(node.address||'')
    )?node.address:null;
    const target=txid?()=>openRecord('tx',txid):address?()=>openRecord('address',address,asset):null;
    const point=svgEl('g',{class:target?'graph-point graph-point-open':'graph-point'});
    if(target){point.setAttribute('tabindex','0');point.setAttribute('role','button');point.setAttribute('aria-label',`Open ${txid?'transaction':'address'} ${txid||address}`);point.addEventListener('click',target);point.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();target();}});}
    if(target)point.append(svgEl('circle',{cx:p.x,cy:p.y,r:root?29:21,fill:'transparent',stroke:'none'}));
    const circle=svgEl('circle',{cx:p.x,cy:p.y,r:root?24:node.kind==='transaction'?10:15,fill:root?'#baff28':node.kind==='transaction'?'#4e7050':'#1d3a20',stroke:'#baff28','stroke-width':root?2:1});
    const title=svgEl('title',{});title.textContent=node.address||node.txid||node.id;circle.append(title);point.append(circle);
    const label=svgEl('text',{x:p.x,y:p.y+(root?42:29),'text-anchor':'middle',fill:'#b9cbb3','font-size':10,'font-family':'monospace'});label.textContent=compact(node.address||node.txid||node.id).slice(0,15);point.append(label);svg.append(point);
  }
  panel.append(svg);const wrapper=element('div');wrapper.append(panel,element('p','graph-caption',`Observed sample: ${shown.length} of ${nodes.length} references, up to 24 of ${edges.length} direct evidence edges. Select a point to inspect its address or transaction. Lines show source events, not ownership or inferred value paths.`));return wrapper;
}

function renderAddress(data,query,asset) {
  const wallet=data.wallet||{},balance=wallet.balance||{},observed=wallet.observation||{};
  const unit=asset==='BTC'?'BTC':asset==='ETH'?'ETH':asset==='BLCH'?'BLCH':asset;
  const left=card(`${state.network.toUpperCase()} / ${asset} / ADDRESS`,`Public reference`);
  left.append(recordIdentity(wallet.address||query));
  fields(left,[['Source-reported balance',`${decimal(balance.base_units,assetDecimals[asset])} ${unit}`],['Exact base units',`${balance.base_units??'—'} ${balance.unit??''}`],['Balance scope',balance.scope],['Block height',balance.block?.height==null?'Not pinned':count(balance.block.height)],['Observed transactions',wallet.activity?.confirmed_tx_count??wallet.activity?.bounded_events??'Bounded or unavailable'],['Mempool transactions',wallet.activity?.mempool_tx_count??'—']]);
  left.append(element('h4','subhead','Observed relationships'),graph(wallet,data.token_activity,asset));
  if(data.utxos?.items?.length){left.append(element('h4','subhead',`Unspent outputs / showing ${data.utxos.items.length} of ${count(data.utxos.total)}`));const list=element('div','record-list');for(const output of data.utxos.items){const txid=output.txid;list.append(row(`${compact(txid)}:${output.vout}`,output.status?.confirmed?'Source confirmed':data.utxos.as_of_slot?`Indexed at slot ${count(data.utxos.as_of_slot)}`:'Source status unavailable',`${decimal(output.value??output.value_sat,8)} ${unit}`,()=>openRecord('tx',txid)));}left.append(list);}
  const activity=data.token_activity?.activity?.events||[];
  if(activity.length){left.append(element('h4','subhead',`${asset} Transfer logs / bounded window`));const list=element('div','record-list');for(const event of activity.slice(0,30))list.append(row(`${event.direction} · ${decimal(event.amount_base_units,6)} ${asset}`,`Block ${count(event.block_number)} · ${compact(event.transaction_hash)}`,compact(event.from===wallet.address?.toLowerCase()?event.to:event.from),()=>openRecord('tx',event.transaction_hash)));left.append(list);}
  const aside=provenance(data,[['Graphus source',observed.source_id],['Coverage',observed.coverage],['UTXO details',data.utxos?.coverage??'Unavailable or not applicable'],['Balance block',balance.block?.hash??'Moving source state'],['Limitations',(observed.limitations||[]).join(' ')]]);
  return [left,aside];
}

function renderBlock(data,query) {
  const block=data.block||{},network=state.network;
  const id=block.id||block.hash||block.block_id||query;
  const height=network==='ethereum'?hexNumber(block.number):count(block.height);
  const left=card(`${network.toUpperCase()} / BLOCK`,`Block ${network==='bloch'?'at slot '+count(block.slot):'#'+height}`);
  left.append(recordIdentity(id));
  const values=network==='bitcoin'?[['Height',height],['Timestamp',time(block.timestamp)],['Transactions',count(block.tx_count)],['Size',`${count(block.size)} bytes`],['Weight',count(block.weight)],['Merkle root',block.merkle_root],['Previous block',block.previousblockhash],['Best chain',data.status?.in_best_chain?'Yes':'No']]
    :network==='ethereum'?[['Height',height],['Timestamp',time(Number(BigInt(block.timestamp)))],['Transactions',count(data.total_transactions)],['Finalized checkpoint',count(data.finalized_height)],['Gas used',hexNumber(block.gasUsed)],['Gas limit',hexNumber(block.gasLimit)],['Base fee',block.baseFeePerGas?`${decimal(BigInt(block.baseFeePerGas).toString(),9)} gwei`:'—'],['Parent hash',block.parentHash]]
    :[['Height',height],['Slot',count(block.slot)],['Epoch',count(block.epoch)],['Timestamp',time(block.timestamp)],['Transactions',count(block.tx_count)],['Attestations',count(block.attestation_count)],['Finality',block.finality||'—'],['Proposer index',count(block.proposer_index)],['State root',block.state_root],['Parent',block.parent]];
  fields(left,values);
  const parent=network==='bitcoin'?block.previousblockhash:network==='ethereum'?block.parentHash:block.parent;
  if(typeof parent==='string'&&/^(?:0x)?[0-9a-f]{64}$/i.test(parent))referenceSection(left,[{label:'Parent block',query:parent,kind:'block'}]);
  const ids=data.transaction_ids;
  if(ids?.length){left.append(element('h4','subhead',`Transactions / ${count(data.offset+1)}–${count(data.offset+ids.length)} of ${count(data.total_transactions??block.tx_count??ids.length)}`));const list=element('div','record-list');for(const tx of ids)list.append(row(compact(tx),'Open transaction','↗',()=>openRecord('tx',tx)));left.append(list);}
  if(data.offset>0||data.next_offset!=null){const pages=element('div','record-pages');if(data.offset>0){const previous=element('button','','← Previous 32');previous.type='button';previous.addEventListener('click',()=>search('block',query,null,Math.max(0,data.offset-32)));pages.append(previous);}if(data.next_offset!=null){const next=element('button','','Next 32 →');next.type='button';next.addEventListener('click',()=>search('block',query,null,data.next_offset));pages.append(next);}left.append(pages);}
  const aside=provenance(data,[['Block identity',id],['Finality / corroboration',network==='bloch'?`${block.finality||'unknown'} · ${data.corroboration?.level||'unknown'}`:network==='ethereum'?(BigInt(block.number)<=BigInt(data.finalized_height)?'At or below finalized checkpoint':'Above finalized checkpoint'):data.status?.in_best_chain?'Source best chain; reorganization possible':'Outside source best chain']]);
  return [left,aside];
}

function renderTransaction(data,query) {
  const tx=data.transaction||{},network=state.network;
  const id=tx.txid||tx.hash||query;
  const left=card(`${network.toUpperCase()} / TRANSACTION`,'Transaction detail');left.append(recordIdentity(id));
  const ethReceipt=data.receipt_status==='available'?data.receipt:null;
  const receiptLabel={available:'Matches transaction',pending:'Pending',missing:'Missing for mined transaction',source_unavailable:'Source unavailable',inconsistent:'Block identity mismatch'}[data.receipt_status]||'Unavailable';
  const ethFinality=data.position?.finality_relation==='at_or_below_reported_checkpoint'?'At or below reported checkpoint':data.position?.finality_relation==='above_reported_checkpoint'?'Above reported checkpoint':'Unavailable';
  const values=network==='bitcoin'?[['Confirmation',tx.status?.confirmed?'Source confirmed':'Unconfirmed'],['Confirmation depth',data.facts?.confirmations==null?'Head unavailable':`${count(data.facts.confirmations)} blocks`],['Best-chain head snapshot',count(data.facts?.head_height)],['Block height',tx.status?.block_height==null?'Mempool':count(tx.status.block_height)],['Fee',data.facts?.coinbase?'Coinbase':`${count(tx.fee)} sat`],['Fee rate',data.facts?.fee_rate_sat_vb==null?'—':`${data.facts.fee_rate_sat_vb} sat/vB`],['Virtual size',data.facts?.virtual_size_vb==null?'—':`${count(data.facts.virtual_size_vb)} vB`],['Signals replaceability',data.facts?.coinbase?'Not applicable':data.facts?.signals_rbf?'Yes':'No'],['Size',`${count(tx.size)} bytes`],['Weight',count(tx.weight)],['Version',count(tx.version)],['Locktime',count(tx.locktime)],['Inputs',count(tx.vin?.length)],['Outputs',count(tx.vout?.length)]]
    :network==='ethereum'?[['Block',tx.blockNumber?hexNumber(tx.blockNumber):'Pending'],['Receipt',receiptLabel],['Execution',ethReceipt?.status==='0x1'?'Successful':ethReceipt?.status==='0x0'?'Reverted':'Unavailable'],['Confirmations',data.position?.confirmations==null?'Unavailable':`${count(data.position.confirmations)} blocks`],['Latest head snapshot',count(data.position?.head_height)],['Finalized height',count(data.position?.finalized_height)],['Finality relation',ethFinality],['From',tx.from],['To',tx.to||'Contract creation'],['Value',`${decimal(BigInt(tx.value||'0x0').toString(),18)} ETH`],['Transaction type',tx.type==null?'—':hexNumber(tx.type)],['Gas limit',hexNumber(tx.gas)],['Gas used',ethReceipt?hexNumber(ethReceipt.gasUsed):'—'],['Effective gas price',ethReceipt?.effectiveGasPrice?`${decimal(BigInt(ethReceipt.effectiveGasPrice).toString(),9)} gwei`:'—'],['Execution gas fee',data.gas_fee_wei==null?'—':`${data.gas_fee_wei} wei`],['Blob gas used',data.blob_gas_used??'—'],['Blob gas price',data.blob_gas_price_wei==null?'—':`${data.blob_gas_price_wei} wei`],['Blob fee',data.blob_fee_status==='not_applicable'?'Not applicable':data.blob_fee_wei==null?'Unavailable':`${data.blob_fee_wei} wei`],['Total transaction fee',data.total_fee_wei==null?'Unavailable':`${decimal(data.total_fee_wei,18)} ETH`],['Exact total fee',data.total_fee_wei==null?'Unavailable':`${data.total_fee_wei} wei`],['Nonce',hexNumber(tx.nonce)]]
    :[['Height',count(tx.height)],['Slot',count(tx.slot)],['Transaction index',count(tx.index)],['Indexed depth',data.position?.indexed_depth_blocks==null?'—':`${count(data.position.indexed_depth_blocks)} blocks`],['Finalized height',count(data.position?.finalized_height)],['Finality relation',data.position?.finality_relation==='unavailable'?'Unavailable':`${data.position.finality_relation==='at_or_below_reported_checkpoint'?'At or below':'Above'} reported checkpoint`],['Comparison scope',data.position?.comparison_scope==='matched_indexer_tip'?'Same indexer tip':data.position?.comparison_scope==='separate_indexer_snapshots'?'Separate indexer snapshots':'Transaction snapshot only'],['Kind',tx.kind],['Fee',`${tx.fee_sat??'—'} sat`],['Stake',`${tx.stake_sat??'—'} sat`],['Size',`${count(tx.size_bytes)} bytes`],['Block',tx.block_id],['Inputs',count(tx.inputs?.length)],['Outputs',count(tx.outputs?.length)]];
  fields(left,values);
  const related=[];
  const blockRef=network==='bitcoin'?tx.status?.block_hash:network==='ethereum'?tx.blockHash:tx.block_id;
  if(typeof blockRef==='string'&&/^(?:0x)?[0-9a-f]{64}$/i.test(blockRef))related.push({label:'Containing block',query:blockRef,kind:'block'});
  if(network==='ethereum')for(const [label,address] of [['Sender',tx.from],['Recipient',tx.to]]){
    if(typeof address==='string'&&/^0x[0-9a-f]{40}$/i.test(address))related.push({label,query:address,kind:'address',asset:'ETH'});
  }
  referenceSection(left,related);
  const sides=network==='bitcoin'?[['Inputs',tx.vin?.map(input=>({id:input.prevout?.scriptpubkey_address||input.txid||'Coinbase',target:input.prevout?.scriptpubkey_address,amount:input.prevout?.value,detail:`${compact(input.txid)}:${input.vout}`}))],['Outputs',tx.vout?.map((out,index)=>({id:out.scriptpubkey_address||out.scriptpubkey||`Output ${index}`,target:out.scriptpubkey_address,amount:out.value,detail:`vout ${index} · ${data.outspends?.[index]?.spent?'spent':'unspent at source'}`}))]]
    :network==='bloch'?[['Inputs',tx.inputs?.map(input=>({id:input.script_hash,target:input.script_hash,amount:input.value_sat,detail:`${compact(input.txid)}:${input.vout}`}))],['Outputs',tx.outputs?.map(out=>({id:out.script_hash,target:out.script_hash,amount:out.value_sat,detail:`vout ${out.vout}`}))]]:[];
  for(const [title,entries] of sides){if(!entries?.length)continue;left.append(element('h4','subhead',`${title} / ${entries.length}`));batchedRows(left,entries,entry=>row(compact(entry.id),entry.detail,entry.amount==null?'—':`${decimal(entry.amount,8)} ${network==='bitcoin'?'BTC':'BLCH'}`,entry.target?()=>openRecord('address',entry.target,network==='bitcoin'?'BTC':'BLCH'):null));}
  if(network==='ethereum'&&data.token_transfers?.length){left.append(element('h4','subhead',`USDT / USDC Transfer logs / showing ${data.token_transfers.length} of ${count(data.token_transfer_count)}`));const list=element('div','record-list');for(const transfer of data.token_transfers){const item=row(`${transfer.kind} · ${decimal(transfer.amount_base_units,6)} ${transfer.asset}`,`Log ${hexNumber(transfer.log_index)}`,transfer.asset);const parties=element('div','transfer-parties');for(const [label,address] of [['From',transfer.from],['To',transfer.to]]){if(typeof address!=='string'||!/^0x[0-9a-f]{40}$/i.test(address))continue;const button=element('button','',`${label} ${compact(address)}`);button.type='button';button.title=address;button.addEventListener('click',()=>openRecord('address',address,transfer.asset));parties.append(button);}item.firstChild.append(parties);list.append(item);}left.append(list);}
  if(network==='ethereum'&&ethReceipt?.logs?.length){left.append(element('h4','subhead',`Receipt logs / ${ethReceipt.logs.length}`));batchedRows(left,ethReceipt.logs,log=>row(compact(log.address),`Log ${hexNumber(log.logIndex)} · ${compact(log.topics?.[0])}`,`${log.topics?.length??0} topics`,typeof log.address==='string'&&/^0x[0-9a-f]{40}$/i.test(log.address)?()=>openRecord('address',log.address,'ETH'):null),32);}
  const aside=provenance(data,[['Block reference',tx.block_id||tx.blockHash||tx.status?.block_hash||'Unconfirmed'],...(network==='bloch'?[['Indexed tip at receipt',`${count(data.position?.indexed_to_height)} / slot ${count(data.position?.indexed_to_slot)}`],['Indexed chain tip',data.position?.indexed_chain_tip],['Indexer verification',tx.verification]]:[]),['Source scope',network==='bitcoin'?'Mempool and best-chain state can change.':network==='ethereum'?'Receipt identity is checked against the transaction. Confirmation depth and finality height come from separate RPC snapshots.':'Indexed depth is block distance at the transaction snapshot. Finality relation uses the separate health response unless chain tips match.']]);
  return [left,aside];
}

function showResult(kind,data,query,asset) {
  const section=$('#result-section'),root=$('#result');clear(root);const grid=element('div','result-grid');
  grid.append(...(kind==='address'?renderAddress(data,query,asset):kind==='block'?renderBlock(data,query):renderTransaction(data,query)));
  root.append(grid);section.hidden=false;section.scrollIntoView({behavior:'smooth',block:'start'});
}

function detect(query) {if(/^[0-9]+$/.test(query))return 'block';if(/^0x[0-9a-f]{40}$/i.test(query))return 'address';if(/^(bc1|[13])[a-z0-9]{20,90}$/i.test(query))return 'address';return 'tx';}
function setHistory(params,mode){
  if(mode==='none')return;
  const target=`/?${params}`;
  if(`${location.pathname}${location.search}`===target)return;
  if(mode==='push')history.pushState(null,'',target);
  else history.replaceState(null,'',target);
}
async function search(kind,query,asset,offset=0,historyMode='push') {
  if(historyMode==='push')state.navigation++;
  const network=state.network;asset=network==='bitcoin'?'BTC':network==='bloch'?'BLCH':['ETH','USDT','USDC'].includes(asset)?asset:'ETH';const requested=kind==='auto'?detect(query):kind;const sequence=++state.request;
  message('Looking up the source record…');
  try{
    let resolved=requested;let data;
    try{data=await api(resolved,network,query,asset,offset);}catch(error){
      if(kind==='auto'&&/^(?:0x)?[0-9a-f]{64}$/i.test(query)&&resolved==='tx'&&error.message==='not_found'){
        resolved='block';
        try{data=await api(resolved,network,query,asset,offset);}catch(blockError){
          if(network==='bloch'&&blockError.message==='not_found'){resolved='address';data=await api(resolved,network,query,'BLCH');asset='BLCH';}
          else throw blockError;
        }
      }else throw error;
    }
    if(sequence!==state.request)return;
    state.result={kind:resolved,query,asset,offset};message('');showResult(resolved,data,query,asset);
    const params=new URLSearchParams({network,kind:resolved,query});if(resolved==='address')params.set('asset',asset);if(resolved==='block'&&offset>0)params.set('offset',String(offset));
    setHistory(params,historyMode);
  }catch(error){if(sequence!==state.request)return;message(`Lookup unavailable: ${error.message}. Check the identifier and source coverage.`,true);}
}

async function switchNetwork(network,historyMode='push') {
  if(!titles[network])return;
  if(historyMode==='push')state.navigation++;
  state.network=network;const sequence=++state.request;
  state.result=null;
  for(const tab of document.querySelectorAll('[data-network]'))tab.setAttribute('aria-selected',String(tab.dataset.network===network));
  $('#network-title').textContent=titles[network];$('#search-hint').textContent=hints[network];$('#search-input').placeholder=network==='bloch'?'Script hash, transaction ID, block ID or slot':network==='ethereum'?'Ethereum address, transaction, block hash or height':'Bitcoin address, transaction, block hash or height';
  $('#search-asset').style.display=network==='ethereum'?'block':'none';
  $('#network-status').textContent='Connecting';$('#network-status').dataset.state='pending';
  clear($('#metrics'));clear($('#signal'));clear($('#latest-list'));$('#source-line').textContent='Querying the selected public source…';
  clear($('#holder-map'));$('#holder-map').hidden=true;
  clear($('#btc-mempool'));$('#btc-mempool').hidden=true;
  $('#result-section').hidden=true;message('');
  setHistory(new URLSearchParams({network}),historyMode);
  try{const data=await api('overview',network);if(sequence!==state.request)return;renderOverview(data);}catch(error){if(sequence!==state.request)return;$('#network-status').textContent='Source unavailable';$('#network-status').dataset.state='error';$('#source-line').textContent=`${error.message}. Retry by selecting the network again.`;message(`Network overview unavailable: ${error.message}`,true);}
}

document.querySelectorAll('[data-network]').forEach(tab=>tab.addEventListener('click',()=>switchNetwork(tab.dataset.network)));
$('#search-form').addEventListener('submit',event=>{event.preventDefault();const query=$('#search-input').value.trim();if(query)search($('#search-kind').value,query,$('#search-asset').value);});
$('#clear-result').addEventListener('click',()=>{state.navigation++;state.request++;state.result=null;$('#result-section').hidden=true;message('');setHistory(new URLSearchParams({network:state.network}),'push');});
async function restoreLocation(historyMode='none'){
  const navigation=++state.navigation;
  const params=new URLSearchParams(location.search);
  const network=titles[params.get('network')]?params.get('network'):'bitcoin';
  const kind=['auto','block','tx','address'].includes(params.get('kind'))?params.get('kind'):'auto';
  const query=params.get('query')||'';
  const asset=network==='ethereum'&&['ETH','USDT','USDC'].includes(params.get('asset'))?params.get('asset'):'ETH';
  const offset=/^(0|[1-9][0-9]{0,5})$/.test(params.get('offset')||'')?Number(params.get('offset')):0;
  $('#search-kind').value=kind;$('#search-input').value=query;$('#search-asset').value=asset;
  await switchNetwork(network,'none');
  if(navigation!==state.navigation)return;
  if(query)await search(kind,query,asset,offset,historyMode);
}
window.addEventListener('popstate',()=>restoreLocation());
restoreLocation('replace');
setInterval(()=>{if(!document.hidden&&!state.result)switchNetwork(state.network,'none');},60000);
