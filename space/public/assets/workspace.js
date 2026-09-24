const $=selector=>document.querySelector(selector);
const el=(tag,className,text)=>{const item=document.createElement(tag);if(className)item.className=className;if(text!==undefined)item.textContent=String(text);return item;};
const svg=(tag,attributes={})=>{const item=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attributes))item.setAttribute(key,String(value));return item;};
const integer=value=>Number.isSafeInteger(value)?new Intl.NumberFormat('en-US').format(value):'—';
const exact=value=>{try{return new Intl.NumberFormat('en-US').format(BigInt(value));}catch{return '—';}};
const decimal=(value,places)=>{try{const n=BigInt(value),unit=10n**BigInt(places),tail=(n%unit).toString().padStart(places,'0').replace(/0+$/,'');return `${exact(n/unit)}${tail?'.'+tail:''}`;}catch{return '—';}};
const utc=value=>{const date=new Date(typeof value==='number'?value*1000:value);return Number.isFinite(date.getTime())?date.toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'})+' UTC':'—';};
const configs={
  bitcoin:{name:'Bitcoin',symbol:'₿',strap:'BTC / MAINNET / UTXO',description:'Best-chain blocks, mempool observations and source fee estimates. Confirmation remains probabilistic.',ranges:['10','30'],rangeLabels:{'10':'10 blocks','30':'30 blocks'}},
  ethereum:{name:'Ethereum',symbol:'◇',strap:'ETH / MAINNET / EXECUTION',description:'Execution head, finalized checkpoint, gas use and exact base fees from Ethereum JSON-RPC.',ranges:['12','48'],rangeLabels:{'12':'12 blocks','48':'48 blocks'}},
  bloch:{name:'Bloch',symbol:'✳',strap:'BLCH / GENESIS-4 / POS',description:'Head and finality observations plus monitored connection history. Connections are not unique network peers.',ranges:['6h','24h','7d'],rangeLabels:{'6h':'6 hours','24h':'24 hours','7d':'7 days'}}
};
const params=new URLSearchParams(location.search);
const state={network:configs[params.get('network')]?params.get('network'):'bitcoin',view:params.get('view')==='analytics'?'analytics':'overview',ranges:{bitcoin:'10',ethereum:'12',bloch:'6h'},data:null,request:0,busy:false};
if(configs[state.network].ranges.includes(params.get('range')))state.ranges[state.network]=params.get('range');
const themeKey='bloch-space-theme';
try{if(localStorage.getItem(themeKey)==='dark')document.documentElement.dataset.theme='dark';}catch{}
function theme(){const dark=document.documentElement.dataset.theme==='dark';$('#theme-toggle').setAttribute('aria-label',`Switch to ${dark?'light':'dark'} theme`);$('.theme-toggle-label').textContent=dark?'Light':'Dark';$('meta[name="theme-color"]').content=dark?'#050706':'#f8faf4';}
theme();$('#theme-toggle').addEventListener('click',()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem(themeKey,document.documentElement.dataset.theme);}catch{}theme();});
function address(){const next=new URLSearchParams({network:state.network,view:state.view});if(state.view==='analytics')next.set('range',state.ranges[state.network]);return `/app/?${next}`;}
function controls(){const config=configs[state.network];document.title=`${config.name} ${state.view} — Bloch Space`;
  $('#network-strap').textContent=config.strap;$('#workspace-title').textContent=`${config.name} ${state.view==='analytics'?'analytics':'network data'}`;$('#network-description').textContent=config.description;
  document.querySelectorAll('#network-picker button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.network===state.network)));
  document.querySelectorAll('#view-picker button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===state.view)));
  const ranges=$('#range-picker');ranges.replaceChildren();ranges.hidden=state.view!=='analytics';
  if(state.view==='analytics')for(const range of config.ranges){const button=el('button','',config.rangeLabels[range]);button.type='button';button.setAttribute('aria-pressed',String(state.ranges[state.network]===range));button.addEventListener('click',()=>{if(state.ranges[state.network]===range)return;state.ranges[state.network]=range;select(true);});ranges.append(button);}
}
function card(label,value,detail){const item=el('div','workspace-stat');item.append(el('span','',label),el('strong','',value),el('small','',detail));return item;}
function cards(items){const host=$('#workspace-stats');host.replaceChildren(...items.map(item=>card(...item)));}
function record(network,kind,query){return `/?${new URLSearchParams({network,kind,query:String(query)})}`;}
function chart(title,description,rows,valueOf,format,{gapOnCoverage=false}={}){
  const panel=el('section','workspace-chart');panel.append(el('span','chart-index','OBSERVED SERIES'),el('h3','',title),el('p','',description));
  const values=rows.map(valueOf),valid=values.filter(value=>value!=null);
  if(!valid.length){panel.append(el('p','workspace-empty','No validated observations in this source window.'));return panel;}
  const min=valid.reduce((a,b)=>a<b?a:b),max=valid.reduce((a,b)=>a>b?a:b),spread=max-min;
  const graphic=svg('svg',{viewBox:'0 0 760 280',role:'img','aria-label':`${title}: ${format(min)} to ${format(max)} over ${valid.length} source points`});
  const left=48,right=728,top=22,bottom=227;
  const x=index=>left+(right-left)*index/Math.max(1,rows.length-1);
  const y=value=>spread===0n?(top+bottom)/2:bottom-Number((value-min)*100000n/spread)/100000*(bottom-top);
  for(let index=0;index<5;index++){const at=top+(bottom-top)*index/4;graphic.append(svg('line',{x1:left,y1:at,x2:right,y2:at,class:'workspace-gridline'}));}
  let segment=[];
  const flush=()=>{if(segment.length>1){const path=segment.map(([index,value],position)=>`${position?'L':'M'} ${x(index).toFixed(2)} ${y(value).toFixed(2)}`).join(' ');graphic.append(svg('path',{d:`${path} L ${x(segment.at(-1)[0]).toFixed(2)} ${bottom} L ${x(segment[0][0]).toFixed(2)} ${bottom} Z`,class:'workspace-area'}),svg('path',{d:path,class:'workspace-line'}));}segment=[];};
  rows.forEach((row,index)=>{const value=values[index];if(value==null){flush();return;}if(gapOnCoverage&&segment.length&&row.coverage!==rows[segment.at(-1)[0]].coverage)flush();segment.push([index,value]);});flush();
  rows.forEach((row,index)=>{const value=values[index];if(value==null)return;const dot=svg('circle',{cx:x(index),cy:y(value),r:rows.length>50?2.2:3.4,class:'workspace-point'});dot.append(svg('title'));dot.firstChild.textContent=`${row.axis}: ${format(value)}`;graphic.append(dot);});
  for(const [position,text,anchor] of [[left,rows[0]?.axis,'start'],[right,rows.at(-1)?.axis,'end']]){const label=svg('text',{x:position,y:bottom+27,'text-anchor':anchor,class:'workspace-axis'});label.textContent=text;graphic.append(label);}
  panel.append(graphic);const rail=el('div','workspace-chart-rail');rail.append(el('span','',`LOW ${format(min)}`),el('strong','',`${integer(valid.length)} / ${integer(rows.length)} points`),el('span','',`HIGH ${format(max)}`));panel.append(rail);return panel;
}
function table(headers,rows){const target=$('#workspace-table');target.replaceChildren();const head=el('thead'),headRow=el('tr');for(const title of headers)headRow.append(el('th','',title));head.append(headRow);const body=el('tbody');for(const cells of rows){const row=el('tr');for(const cell of cells){const td=el('td');if(cell&&typeof cell==='object'&&cell.href){const a=el('a','',cell.text);a.href=cell.href;td.append(a);}else td.textContent=cell==null?'—':String(cell);row.append(td);}body.append(row);}target.append(head,body);}
function showCharts(items){$('#workspace-charts').replaceChildren(...items);}
function provenance(data){const host=$('#workspace-source');host.replaceChildren();for(const [label,value] of [['Source',data.source],['Retrieved',utc(data.retrieved_at)],['Boundary',data.note],['Independent verification',data.independent_verification?'Yes':'No']]){const item=el('div','workspace-source-item');item.append(el('span','',label),el('strong','',value));host.append(item);}$('#workspace-json').textContent=JSON.stringify(data,null,2);}
function renderOverview(data){$('#workspace-table-title').textContent='Recent source records.';$('#workspace-csv').disabled=true;
  if(state.network==='bitcoin'){
    const blocks=(data.recent_blocks||[]).filter(block=>Number.isSafeInteger(block.height)),head=data.head||{},mempool=data.mempool||{},fees=data.fee_estimates_sat_vbyte||{};
    cards([['Best-chain height',integer(head.height),'Source reported'],['Mempool entries',integer(mempool.count),'Separate source snapshot'],['Latest block transactions',integer(head.tx_count),'Best-chain head'],['Fee estimate / 3 blocks',fees['3']==null?'—':`${Number(fees['3']).toFixed(1)} sat/vB`,'Source estimate']]);
    const rows=blocks.slice().reverse().map(block=>({axis:`#${block.height}`,tx:block.tx_count,size:block.size,height:block.height,id:block.id,time:utc(block.timestamp)}));
    showCharts([chart('Transactions per block','Recent best-chain block sample.',rows,row=>BigInt(row.tx),exact),chart('Block size','Observed block bytes in the same sample.',rows,row=>BigInt(row.size),value=>`${decimal(value,6)} MB`)]);
    table(['Height','Time (UTC)','Transactions','Size (bytes)','Block ID'],rows.slice().reverse().map(row=>[{text:`#${integer(row.height)} ↗`,href:record('bitcoin','block',row.height)},row.time,integer(row.tx),exact(row.size),row.id]));
    $('#workspace-coverage').textContent=`${integer(rows.length)} recent best-chain blocks. Mempool and fee estimates are separate snapshots; chain reorganizations can change these records.`;
  }else if(state.network==='ethereum'){
    const head=data.head||{},finalized=data.finalized||{},history=data.fee_history,oldest=history?BigInt(history.oldest_height):0n;
    const rows=(history?.gas_used_ratio||[]).map((ratio,index)=>({axis:`#${oldest+BigInt(index)}`,height:String(oldest+BigInt(index)),ratio,fee:history.base_fee_wei[index]}));
    cards([['Execution head',exact(BigInt(head.number||'0x0')),'Source latest'],['Finalized checkpoint',exact(BigInt(finalized.number||'0x0')),'Separate RPC read'],['Latest block transactions',integer(head.transactions?.length),'Transaction IDs'],['Gas price',`${decimal(data.gas_price_wei,9)} gwei`,'Source observation']]);
    showCharts([chart('Gas used / block limit','Source-reported ratio across the recent fee-history window.',rows,row=>BigInt(Math.round(row.ratio*10000)),value=>`${(Number(value)/100).toFixed(2)}%`),chart('Base fee per gas','Exact wei are preserved in the table.',rows,row=>BigInt(row.fee),value=>`${decimal(value,9)} gwei`)]);
    table(['Block','Gas used ratio','Base fee (wei)','Base fee (gwei)'],rows.slice().reverse().map(row=>[{text:`#${row.height} ↗`,href:record('ethereum','block',row.height)},`${(row.ratio*100).toFixed(2)}%`,row.fee,decimal(row.fee,9)]));
    $('#workspace-coverage').textContent=`${integer(rows.length)} source-reported fee-history blocks. The execution head and finalized checkpoint are separate reads.`;
  }else{
    const head=data.head||{},health=data.health||{},points=data.peer_history?.points||[];
    const rows=points.map(point=>({axis:utc(point.at/1000),connections:point.connections,coverage:point.reporting_nodes}));
    cards([['Head height',integer(head.height),'Network snapshot'],['Current slot',integer(head.slot),'Genesis-4 PoS'],['Reported finalized height',integer(head.finalized_height??health.finalized_height),'Source checkpoint'],['Indexed height',integer(health.indexed_to_height),'Separate indexer snapshot']]);
    showCharts([chart('Monitored connections','Socket reports; a line breaks when reporting coverage changes.',rows,row=>Number.isSafeInteger(row.connections)&&row.coverage>0?BigInt(row.connections):null,exact,{gapOnCoverage:true}),chart('Reporting-node coverage','Number of monitored nodes represented at each point.',rows,row=>Number.isSafeInteger(row.coverage)&&row.coverage>0?BigInt(row.coverage):null,exact)]);
    table(['Time (UTC)','Connections','Reporting nodes'],rows.slice().reverse().map(row=>[row.axis,row.connections==null?'—':integer(row.connections),row.coverage==null?'—':integer(row.coverage)]));
    $('#workspace-coverage').textContent=`${integer(rows.length)} recent time positions when the optional monitoring source responds. Connections are not unique peers.`;
  }
  provenance(data);
}
function renderAnalytics(data){$('#workspace-table-title').textContent='Every point, inspectable.';$('#workspace-csv').disabled=false;
  if(state.network==='bitcoin'){
    const rows=data.blocks.slice().reverse().map(block=>({axis:`#${block.height}`,time:utc(block.timestamp),height:block.height,tx:block.tx_count,size:block.size,weight:block.weight,id:block.id}));
    const sumTx=rows.reduce((sum,row)=>sum+BigInt(row.tx),0n),sumSize=rows.reduce((sum,row)=>sum+BigInt(row.size),0n);
    cards([['Observed blocks',integer(rows.length),`${integer(data.requested)} requested`],['Transactions in sample',exact(sumTx),'Sum over returned blocks'],['Average block size',`${decimal(sumSize/BigInt(rows.length||1),6)} MB`,'Source bytes divided by sample'],['Newest height',integer(rows.at(-1)?.height),'Best-chain observation']]);
    showCharts([chart('Transaction density','Transactions in each linked best-chain block.',rows,row=>BigInt(row.tx),exact),chart('Block size','Observed bytes per block.',rows,row=>BigInt(row.size),value=>`${decimal(value,6)} MB`),chart('Block weight','Source-reported weight units.',rows,row=>BigInt(row.weight),value=>`${exact(value)} WU`)]);
    table(['Height','Time (UTC)','Transactions','Size (bytes)','Weight (WU)','Block ID'],rows.slice().reverse().map(row=>[{text:`#${integer(row.height)} ↗`,href:record('bitcoin','block',row.height)},row.time,integer(row.tx),exact(row.size),exact(row.weight),row.id]));
    $('#workspace-coverage').textContent=`${integer(data.returned)} of ${integer(data.requested)} linked best-chain blocks returned${data.partial?' · partial window':''}. Reorganizations may change this view.`;
  }else if(state.network==='ethereum'){
    const history=data.fee_history,oldest=BigInt(history.oldest_height),rows=history.gas_used_ratio.map((ratio,index)=>({axis:`#${oldest+BigInt(index)}`,height:String(oldest+BigInt(index)),ratio,fee:history.base_fee_wei[index]}));
    const average=rows.reduce((sum,row)=>sum+row.ratio,0)/Math.max(1,rows.length);
    cards([['Observed blocks',integer(rows.length),`${integer(data.requested)} requested`],['Average gas used',`${(average*100).toFixed(2)}%`,'Mean source ratio'],['First base fee',`${decimal(rows[0]?.fee,9)} gwei`,'Oldest returned block'],['Latest base fee',`${decimal(rows.at(-1)?.fee,9)} gwei`,'Newest returned block']]);
    showCharts([chart('Gas utilization','Percentage of each block gas limit.',rows,row=>BigInt(Math.round(row.ratio*10000)),value=>`${(Number(value)/100).toFixed(2)}%`),chart('Base fee per gas','Exact wei remain available in the table and API.',rows,row=>BigInt(row.fee),value=>`${decimal(value,9)} gwei`)]);
    table(['Block','Gas used ratio','Base fee (wei)','Base fee (gwei)'],rows.slice().reverse().map(row=>[{text:`#${row.height} ↗`,href:record('ethereum','block',row.height)},`${(row.ratio*100).toFixed(2)}%`,row.fee,decimal(row.fee,9)]));
    $('#workspace-coverage').textContent=`${integer(data.returned)} source-reported blocks ending at execution height ${data.head.height}. Fee history alone does not establish finality.`;
  }else{
    const rows=data.points.map(point=>({axis:utc(point.at/1000),connections:point.connections,coverage:point.reporting_nodes})),valid=rows.filter(row=>Number.isSafeInteger(row.connections)&&row.coverage>0),latest=valid.at(-1);
    cards([['Measured points',integer(valid.length),`${integer(rows.length)} time positions`],['Latest connections',integer(latest?.connections),'Socket reports, not unique peers'],['Reporting nodes',integer(latest?.coverage),'Latest measured point'],['Peak connections',integer(valid.reduce((max,row)=>Math.max(max,row.connections),0)),'Within selected window']]);
    showCharts([chart('Reported connections','A line breaks at gaps or changes in monitored-node coverage.',rows,row=>Number.isSafeInteger(row.connections)&&row.coverage>0?BigInt(row.connections):null,exact,{gapOnCoverage:true}),chart('Reporting-node coverage','How many monitored nodes contributed at each position.',rows,row=>Number.isSafeInteger(row.coverage)&&row.coverage>0?BigInt(row.coverage):null,exact),chart('Connections per reporting node','Derived ratio for the sampled fleet, not a count of unique peers.',rows,row=>Number.isSafeInteger(row.connections)&&row.coverage>0?BigInt(row.connections)*1000n/BigInt(row.coverage):null,value=>decimal(value,3),{gapOnCoverage:true})]);
    table(['Time (UTC)','Connections','Reporting nodes','Connections per node'],rows.slice().reverse().map(row=>[row.axis,row.connections==null?'—':integer(row.connections),row.coverage==null?'—':integer(row.coverage),row.connections!=null&&row.coverage>0?decimal(BigInt(row.connections)*1000n/BigInt(row.coverage),3):'—']));
    $('#workspace-coverage').textContent=`${integer(data.valid_points)} measured positions of ${integer(data.returned)} returned over ${data.period}. Gaps and coverage changes are retained. These are not unique peers.`;
  }
  provenance(data);
}
function csv(){const data=state.data;let rows;
  if(state.network==='bitcoin')rows=[['height','timestamp_utc','tx_count','size_bytes','weight_wu','block_id'],...data.blocks.map(block=>[block.height,new Date(block.timestamp*1000).toISOString(),block.tx_count,block.size,block.weight,block.id])];
  else if(state.network==='ethereum'){const oldest=BigInt(data.fee_history.oldest_height);rows=[['height','gas_used_ratio','base_fee_wei'],...data.fee_history.gas_used_ratio.map((ratio,index)=>[(oldest+BigInt(index)).toString(),ratio,data.fee_history.base_fee_wei[index]])];}
  else rows=[['timestamp_utc','connections','reporting_nodes'],...data.points.map(point=>[new Date(point.at).toISOString(),point.connections??'',point.reporting_nodes??''])];
  return rows.map(columns=>columns.map(value=>`"${String(value).replace(/"/g,'""')}"`).join(',')).join('\r\n')+'\r\n';}
async function load(){const request=++state.request,network=state.network,view=state.view,range=state.ranges[network];state.busy=true;$('#workspace-refresh').disabled=true;$('#workspace-status').textContent=state.data?'Updating source…':'Connecting to source…';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{const url=view==='overview'?`/api/overview?network=${network}`:`/api/series?network=${network}&range=${range}`;
    const response=await fetch(url,{cache:'no-store',signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);if(request!==state.request)return;
    state.data=data;if(view==='overview')renderOverview(data);else renderAnalytics(data);$('#workspace-status').textContent=`Source retrieved ${utc(data.retrieved_at)}`;
  }catch(error){if(request!==state.request)return;$('#workspace-status').textContent=`${state.data?'Showing last successful view. ':'Source unavailable. '}${error.message}`;}
  finally{clearTimeout(timer);if(request===state.request){state.busy=false;$('#workspace-refresh').disabled=false;}}
}
function select(push=false){state.data=null;controls();history[push?'pushState':'replaceState'](null,'',address());$('#workspace-stats').replaceChildren();$('#workspace-charts').replaceChildren();$('#workspace-table').replaceChildren();$('#workspace-source').replaceChildren();$('#workspace-coverage').textContent='';$('#workspace-json').textContent='';$('#workspace-csv').disabled=true;load();}
document.querySelectorAll('#network-picker button').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.network===state.network)return;state.network=button.dataset.network;select(true);}));
document.querySelectorAll('#view-picker button').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.view===state.view)return;state.view=button.dataset.view;select(true);}));
$('#workspace-refresh').addEventListener('click',()=>{if(!state.busy)load();});
$('#workspace-csv').addEventListener('click',()=>{if(state.view!=='analytics'||!state.data)return;const url=URL.createObjectURL(new Blob([csv()],{type:'text/csv;charset=utf-8'})),link=el('a');link.href=url;link.download=`bloch-space-${state.network}-${state.ranges[state.network]}.csv`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});
window.addEventListener('popstate',()=>{const next=new URLSearchParams(location.search);state.network=configs[next.get('network')]?next.get('network'):'bitcoin';state.view=next.get('view')==='analytics'?'analytics':'overview';if(configs[state.network].ranges.includes(next.get('range')))state.ranges[state.network]=next.get('range');select(false);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.data&&Date.now()-new Date(state.data.retrieved_at).getTime()>60000&&!state.busy)load();});
setInterval(()=>{if(!document.hidden&&!state.busy)load();},60000);
select(false);
