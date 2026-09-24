const network=document.body.dataset.network;
const $=selector=>document.querySelector(selector);
const node=(tag,className,text)=>{const item=document.createElement(tag);if(className)item.className=className;if(text!==undefined)item.textContent=String(text);return item;};
const svgNode=(tag,attributes={})=>{const item=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attributes))item.setAttribute(key,String(value));return item;};
const clear=item=>item.replaceChildren();
const number=value=>Number.isSafeInteger(value)?new Intl.NumberFormat('en-US').format(value):'—';
const exact=value=>{try{return new Intl.NumberFormat('en-US').format(BigInt(value));}catch{return '—';}};
const fixed=(raw,places)=>{try{const n=BigInt(raw),unit=10n**BigInt(places),fraction=(n%unit).toString().padStart(places,'0').replace(/0+$/,'');return `${exact(n/unit)}${fraction?'.'+fraction:''}`;}catch{return '—';}};
const utc=value=>{const date=new Date(typeof value==='number'?value*1000:value);return Number.isFinite(date.getTime())?date.toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'})+' UTC':'—';};
const choices={bitcoin:['10','30'],ethereum:['12','48'],bloch:['6h','24h','7d']}[network];
const label={bitcoin:{'10':'10 blocks','30':'30 blocks'},ethereum:{'12':'12 blocks','48':'48 blocks'},bloch:{'6h':'6 hours','24h':'24 hours','7d':'7 days'}}[network];
const themeKey='bloch-space-theme';
try{if(localStorage.getItem(themeKey)==='dark')document.documentElement.dataset.theme='dark';}catch{}
function theme(){const dark=document.documentElement.dataset.theme==='dark';$('#theme-toggle').setAttribute('aria-label',`Switch to ${dark?'light':'dark'} theme`);$('.theme-toggle-label').textContent=dark?'Light':'Dark';$('meta[name="theme-color"]').content=dark?'#050706':'#f8faf4';}
theme();$('#theme-toggle').addEventListener('click',()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem(themeKey,document.documentElement.dataset.theme);}catch{}theme();});

function card(label,value,detail){const item=node('div','analytics-stat');item.append(node('span','',label),node('strong','',value),node('small','',detail));return item;}
function rawRows(data){
  if(network==='bitcoin')return data.blocks.slice().reverse().map(block=>({axis:`#${block.height}`,time:utc(block.timestamp),height:block.height,transactions:block.tx_count,size:block.size,weight:block.weight,id:block.id,href:`/?network=bitcoin&kind=block&query=${block.height}`}));
  if(network==='ethereum'){const history=data.fee_history,oldest=BigInt(history.oldest_height);return history.gas_used_ratio.map((ratio,index)=>({axis:`#${oldest+BigInt(index)}`,height:(oldest+BigInt(index)).toString(),ratio,fee:history.base_fee_wei[index],href:`/?network=ethereum&kind=block&query=${oldest+BigInt(index)}`}));}
  return data.points.map(point=>({axis:utc(point.at/1000),at:point.at,connections:point.connections,reporting_nodes:point.reporting_nodes}));
}
function lineChart(title,description,rows,measure,format,segmentOnCoverage=false){
  const panel=node('section','analytics-chart');panel.append(node('div','chart-index',`${network.toUpperCase()} / OBSERVED SERIES`),node('h3','',title),node('p','',description));
  const values=rows.map(measure),valid=values.filter(value=>value!=null);
  if(!valid.length){panel.append(node('p','analytics-empty','No validated points in this source window.'));return panel;}
  const min=valid.reduce((a,b)=>b<a?b:a),max=valid.reduce((a,b)=>b>a?b:a),spread=max-min;
  const svg=svgNode('svg',{viewBox:'0 0 760 280',role:'img','aria-label':`${title}: ${format(min)} to ${format(max)} across ${valid.length} source points. The vertical axis is scaled to this window.`});
  const left=54,right=730,top=24,bottom=230;
  const x=index=>left+(right-left)*index/Math.max(1,rows.length-1);
  const y=value=>spread===0n?(top+bottom)/2:bottom-Number((value-min)*100000n/spread)/100000*(bottom-top);
  for(let index=0;index<5;index++){const at=top+(bottom-top)*index/4;svg.append(svgNode('line',{x1:left,y1:at,x2:right,y2:at,class:'chart-gridline'}));}
  let segment=[];const flush=()=>{if(segment.length>1){const line=segment.map(([index,value],position)=>`${position?'L':'M'} ${x(index).toFixed(2)} ${y(value).toFixed(2)}`).join(' ');const area=`${line} L ${x(segment.at(-1)[0]).toFixed(2)} ${bottom} L ${x(segment[0][0]).toFixed(2)} ${bottom} Z`;svg.append(svgNode('path',{d:area,class:'chart-area'}),svgNode('path',{d:line,class:'chart-stroke'}));}segment=[];};
  rows.forEach((row,index)=>{const value=values[index];if(value==null){flush();return;}if(segmentOnCoverage&&segment.length&&row.reporting_nodes!==rows[segment.at(-1)[0]].reporting_nodes)flush();segment.push([index,value]);});flush();
  rows.forEach((row,index)=>{const value=values[index];if(value==null)return;const dot=svgNode('circle',{cx:x(index),cy:y(value),r:rows.length<=48?3.4:2.1,class:'chart-dot'}),tip=svgNode('title');tip.textContent=`${row.axis}: ${format(value)}`;dot.append(tip);svg.append(dot);});
  const minLabel=svgNode('text',{x:left,y:bottom+25,class:'chart-axis'});minLabel.textContent=rows[0].axis;
  const maxLabel=svgNode('text',{x:right,y:bottom+25,'text-anchor':'end',class:'chart-axis'});maxLabel.textContent=rows.at(-1).axis;
  svg.append(minLabel,maxLabel);panel.append(svg);
  const rail=node('div','analytics-chart-rail');rail.append(node('span','',`LOW ${format(min)}`),node('strong','',`${number(valid.length)} / ${number(rows.length)} points`),node('span','',`HIGH ${format(max)}`));panel.append(rail);
  return panel;
}
function table(headers,rows){const target=$('#analytics-table');clear(target);const head=node('thead'),headRow=node('tr');for(const title of headers)headRow.append(node('th','',title));head.append(headRow);const body=node('tbody');for(const values of rows){const tr=node('tr');for(const value of values){const td=node('td');if(value&&typeof value==='object'&&value.href){const a=node('a','',value.text);a.href=value.href;td.append(a);}else td.textContent=value==null?'—':String(value);tr.append(td);}body.append(tr);}target.append(head,body);}
function render(data){const rows=rawRows(data),summary=$('#analytics-summary'),charts=$('#analytics-charts');clear(summary);clear(charts);$('#download-csv').disabled=!rows.length;
  if(network==='bitcoin'){
    const transactions=rows.reduce((total,row)=>total+BigInt(row.transactions),0n),bytes=rows.reduce((total,row)=>total+BigInt(row.size),0n);
    summary.append(card('Observed blocks',number(rows.length),`${number(data.requested)} requested`),card('Transactions in sample',exact(transactions),'Sum over displayed blocks'),card('Average block size',`${fixed(bytes/BigInt(Math.max(1,rows.length)),6)} MB`,'Source bytes divided by sample'),card('Newest height',number(rows.at(-1)?.height),'Source best-chain window'));
    charts.append(lineChart('Transaction density','Transactions in each returned block. The window is linked by previous-block hashes.',rows,row=>BigInt(row.transactions),value=>exact(value)),lineChart('Block size','Observed block bytes; vertical scale follows the returned sample.',rows,row=>BigInt(row.size),value=>`${fixed(value,6)} MB`),lineChart('Block weight','Source-reported weight units per block.',rows,row=>BigInt(row.weight),value=>`${exact(value)} WU`));
    table(['Height','Time (UTC)','Transactions','Size (bytes)','Weight (WU)','Block ID'],rows.slice().reverse().map(row=>[{text:`#${number(row.height)} ↗`,href:row.href},row.time,number(row.transactions),exact(row.size),exact(row.weight),row.id]));
    $('#analytics-coverage').textContent=`${number(data.returned)} of ${number(data.requested)} requested contiguous blocks returned${data.partial?' · source window stopped before the requested depth':''}. This is a best-chain observation; reorganization is possible.`;
  }else if(network==='ethereum'){
    const total=rows.reduce((sum,row)=>sum+BigInt(Math.round(row.ratio*10000)),0n),average=rows.length?Number(total/BigInt(rows.length))/100:0;
    summary.append(card('Observed blocks',number(rows.length),`${number(data.requested)} requested`),card('Average gas used',`${average.toFixed(2)}%`,'Source ratio over this window'),card('First base fee',`${fixed(rows[0]?.fee,9)} gwei`,'Oldest returned block'),card('Latest base fee',`${fixed(rows.at(-1)?.fee,9)} gwei`,'Newest returned block'));
    charts.append(lineChart('Gas utilization','Percentage of each block gas limit reported by eth_feeHistory.',rows,row=>BigInt(Math.round(row.ratio*10000)),value=>`${(Number(value)/100).toFixed(2)}%`),lineChart('Base fee per gas','Exact wei are preserved in the table and API; chart labels use gwei.',rows,row=>BigInt(row.fee),value=>`${fixed(value,9)} gwei`));
    table(['Block','Gas used ratio','Base fee (wei)','Base fee (gwei)'],rows.slice().reverse().map(row=>[{text:`#${row.height} ↗`,href:row.href},`${(row.ratio*100).toFixed(2)}%`,row.fee,fixed(row.fee,9)]));
    $('#analytics-coverage').textContent=`${number(data.returned)} source-reported execution blocks ending at height ${data.head.height} / ${data.head.hash}. Finality is not established by fee history.`;
  }else{
    const valid=rows.filter(row=>Number.isSafeInteger(row.connections)&&Number.isSafeInteger(row.reporting_nodes)&&row.reporting_nodes>0),peak=valid.reduce((max,row)=>Math.max(max,row.connections),0),last=valid.at(-1);
    summary.append(card('Measured points',number(valid.length),`${number(rows.length)} returned time positions`),card('Latest connections',number(last?.connections),'Socket reports, not unique peers'),card('Reporting nodes',number(last?.reporting_nodes),'At latest measured point'),card('Peak connections',number(peak),'Within selected window'));
    charts.append(lineChart('Reported connections','A line breaks when the count of reporting nodes changes or a source point is absent.',rows,row=>Number.isSafeInteger(row.connections)&&row.reporting_nodes>0?BigInt(row.connections):null,value=>`${exact(value)} sockets`,true),lineChart('Reporting-node coverage','How many monitored nodes contributed to each source point.',rows,row=>Number.isSafeInteger(row.reporting_nodes)&&row.reporting_nodes>0?BigInt(row.reporting_nodes):null,value=>`${exact(value)} nodes`),lineChart('Connections per reporting node','Derived ratio for this sampled fleet only; not a count of unique remote peers.',rows,row=>Number.isSafeInteger(row.connections)&&row.reporting_nodes>0?BigInt(row.connections)*1000n/BigInt(row.reporting_nodes):null,value=>`${fixed(value,3)} / node`,true));
    table(['Time (UTC)','Connections','Reporting nodes','Connections per node'],rows.slice().reverse().map(row=>[row.axis,row.connections==null?'—':number(row.connections),row.reporting_nodes==null?'—':number(row.reporting_nodes),row.connections!=null&&row.reporting_nodes>0?fixed(BigInt(row.connections)*1000n/BigInt(row.reporting_nodes),3):'—']));
    $('#analytics-coverage').textContent=`${number(data.valid_points)} of ${number(data.returned)} positions measured over ${data.period}. Gaps and shifts in reporting-node coverage are preserved; these figures are not unique network peers.`;
  }
  const provenance=$('#analytics-provenance');clear(provenance);for(const [key,value] of [['Source',data.source],['Retrieved',utc(data.retrieved_at)],['Boundary',data.note],['Requested range',label[activeRange]],['Independent verification',data.independent_verification?'Yes':'No']]){const item=node('div','analytics-provenance-item');item.append(node('span','',key),node('strong','',value));provenance.append(item);}
  $('#analytics-json').textContent=JSON.stringify(data,null,2);
}
function csv(data){const rows=rawRows(data);const lines=network==='bitcoin'?[['height','timestamp_utc','tx_count','size_bytes','weight_wu','block_id'],...rows.map(row=>[row.height,row.time,row.transactions,row.size,row.weight,row.id])]:network==='ethereum'?[['height','gas_used_ratio','base_fee_wei'],...rows.map(row=>[row.height,row.ratio,row.fee])]:[['timestamp_utc','connections','reporting_nodes'],...rows.map(row=>[row.axis,row.connections??'',row.reporting_nodes??''])];return lines.map(columns=>columns.map(value=>`"${String(value).replace(/"/g,'""')}"`).join(',')).join('\r\n')+'\r\n';}
let activeRange=choices[0],current=null,pending=false;
const selected=new URLSearchParams(location.search).get('range');if(choices.includes(selected))activeRange=selected;
function controls(){const host=$('#range-controls');clear(host);for(const range of choices){const button=node('button','',label[range]);button.type='button';button.setAttribute('aria-pressed',String(range===activeRange));button.addEventListener('click',()=>refresh(range));host.append(button);}}
async function refresh(range=activeRange){if(pending)return;pending=true;$('#analytics-refresh').disabled=true;$('#analytics-status').textContent=current?'Updating source window…':'Reading source window…';
  try{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);let response;try{response=await fetch(`/api/series?network=${network}&range=${encodeURIComponent(range)}`,{signal:controller.signal,cache:'no-store'});}finally{clearTimeout(timer);}
    const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
    activeRange=range;current=data;history.replaceState(null,'',`${location.pathname}?range=${range}`);controls();render(data);$('#analytics-status').textContent=`Source retrieved ${utc(data.retrieved_at)}`;
  }catch(error){$('#analytics-status').textContent=`${current?'Showing last successful window. ':'Source unavailable. '}${error.message}`;}
  finally{pending=false;$('#analytics-refresh').disabled=false;}
}
$('#analytics-refresh').addEventListener('click',()=>refresh());$('#download-csv').addEventListener('click',()=>{if(!current)return;const url=URL.createObjectURL(new Blob([csv(current)],{type:'text/csv;charset=utf-8'})),a=node('a');a.href=url;a.download=`bloch-space-${network}-${activeRange}-series.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});
controls();refresh();
