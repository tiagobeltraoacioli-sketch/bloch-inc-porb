const canvas=document.getElementById('oculum-canvas');
const context=canvas.getContext('2d');
const assetSelect=document.getElementById('oculum-asset');
const addressInput=document.getElementById('oculum-address');
const form=document.getElementById('oculum-form');
const addButton=document.getElementById('oculum-add');
const sourceStatus=document.getElementById('oculum-source-status');
const coverage=document.getElementById('oculum-coverage');
const count=document.getElementById('oculum-count');
const list=document.getElementById('oculum-list');
const detail=document.getElementById('oculum-detail');
const colors={BTC:'#e9c985',ETH:'#b4d7a4',USDT:'#87c9ab',USDC:'#c6ced1'};
const records=new Map();
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
  const precision=decimals??({BTC:8,ETH:18,USDT:6,USDC:6}[asset]??0);
  const scale=10n**BigInt(precision);
  const integer=BigInt(amount)/scale;
  const fraction=(BigInt(amount)%scale).toString().padStart(precision,'0').replace(/0+$/,'');
  return `${integer.toLocaleString('en-US')}${fraction?'.'+fraction:''} ${asset}`;
}
function currentRecords(){
  const asset=assetSelect.value.toUpperCase();
  return [...records.values()].filter(record=>record.asset===asset)
    .sort((a,b)=>BigInt(a.baseUnits)===BigInt(b.baseUnits)?a.address.localeCompare(b.address):(BigInt(a.baseUnits)>BigInt(b.baseUnits)?-1:1));
}
function setStatus(message,kind='neutral'){
  const dot=document.createElement('span');dot.className='oculum-source-dot';dot.setAttribute('aria-hidden','true');
  const body=document.createElement('div');
  const heading=document.createElement('strong');heading.textContent=kind==='success'?'Source-reported data':kind==='loading'?'Loading source':kind==='error'?'Lookup unavailable':'Source status';
  const paragraph=document.createElement('p');paragraph.textContent=message;
  body.append(heading,paragraph);sourceStatus.replaceChildren(dot,body);
  sourceStatus.dataset.state=kind;
}
function addRecord({asset,address,balance,observation,network,origin}){
  if(!address||!/^\d+$/.test(balance?.base_units||''))return false;
  const key=recordKey(asset,address);
  if(!records.has(key)&&records.size>=24)return false;
  records.set(key,{
    key,asset,address,baseUnits:balance.base_units,decimals:balance.decimals,
    unit:balance.unit,block:balance.block||null,scope:balance.scope||'source reported',
    source:observation?.source_id||'public-chain source',
    retrievedAt:balance.retrieved_at||observation?.retrieved_at||null,
    coverage:observation?.coverage||'bounded address lookup',
    limitations:observation?.limitations||[],network,origin,
  });
  return true;
}
function renderDetail(record){
  detail.replaceChildren();
  if(!record){detail.textContent='Select a plotted address to inspect its exact amount and source.';return;}
  const title=document.createElement('h3');title.textContent=record.address;
  const dl=document.createElement('dl');
  const rows=[
    ['Held amount, source reported',formattedAmount(record.baseUnits,record.asset,record.decimals)],
    ['Exact base units',`${BigInt(record.baseUnits).toLocaleString('en-US')} ${record.unit}`],
    ['Network',record.network||'—'],
    ['Source',record.source],
    ['Retrieved at',record.retrievedAt||'—'],
    ['Block',record.block?`${record.block.height??'—'} · ${record.block.hash??'hash unavailable'}`:'No single pinned block for this source aggregate'],
    ['Coverage',record.coverage],
    ['Origin',record.origin],
  ];
  for(const [label,value] of rows){
    const row=document.createElement('div');
    const dt=document.createElement('dt');dt.textContent=label;
    const dd=document.createElement('dd');dd.textContent=value;
    row.append(dt,dd);dl.append(row);
  }
  const caveat=document.createElement('p');
  caveat.textContent='Address balance does not identify the owner or all addresses controlled by one wallet. Points may have different retrieval times; this is not a network-wide holder ranking.';
  detail.append(title,dl,caveat);
}
function renderList(items){
  list.replaceChildren();
  if(!items.length){list.textContent='Add a mainnet address to begin a bounded comparison.';return;}
  items.forEach((record,index)=>{
    const button=document.createElement('button');button.type='button';
    button.className=record.key===selectedKey?'selected':'';
    button.setAttribute('aria-pressed',String(record.key===selectedKey));
    button.textContent=`${String(index+1).padStart(2,'0')} · ${record.address} · ${formattedAmount(record.baseUnits,record.asset,record.decimals)}`;
    button.addEventListener('click',()=>select(record.key));list.append(button);
  });
}
function select(key){
  selectedKey=key;
  render();
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
    const orbit=index===0?0:Math.min(Math.min(width,height)*.40,65+Math.sqrt(index-1)*64);
    const x=width*.5+Math.cos(angle)*orbit,y=height*.5+Math.sin(angle)*orbit;
    points.push({record,x,y,level,radius:6+16*level});
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
    context.fillStyle='#edf4e8';context.font='11px ui-monospace, monospace';
    context.fillText(point.record.address.slice(0,10)+'…',point.x+point.radius+10,point.y-8);
  }
}
function render(){
  const items=currentRecords();
  if(selectedKey&&!items.some(item=>item.key===selectedKey))selectedKey=items[0]?.key||null;
  if(!selectedKey&&items.length)selectedKey=items[0].key;
  count.textContent=`${items.length} ${items.length===1?'address':'addresses'}`;
  document.getElementById('oculum-empty').hidden=items.length>0;
  coverage.textContent=items.length
    ?`${items.length} source-reported address balances in this session's ${assetSelect.value.toUpperCase()} sample. Ranked only within this sample; retrieval times and source anchors can differ.`
    :'No addresses loaded. Global largest-holder coverage is not available.';
  renderList(items);
  renderDetail(items.find(item=>item.key===selectedKey));
  draw();
}
async function addAddress(event){
  event?.preventDefault();
  const asset=assetSelect.value.toUpperCase(),address=addressInput.value.trim();
  if(records.size>=24&&!records.has(recordKey(asset,address))){setStatus('This session is limited to 24 addresses. Reload before adding more.','error');return;}
  if(asset==='BLCH'){setStatus('BLCH holder balances require a complete finalized state source.','error');return;}
  const network=asset==='BTC'?'bitcoin':'ethereum';
  addButton.disabled=true;setStatus(`Loading ${asset} source data for ${address}…`,'loading');
  try{
    const query=new URLSearchParams({network,asset,address});
    const response=await fetch(`/api/chain/wallet?${query}`,{headers:{Accept:'application/json'}});
    const data=await response.json();
    if(!response.ok||data.status!=='source-reported')throw new Error(data.error||`HTTP ${response.status}`);
    addRecord({asset,address:data.address,balance:data.balance,observation:data.observation,network:data.network,origin:'queried address'});
    let enriched=0;
    for(const node of data.nodes||[]){
      if(node.kind!=='address'||node.address===data.address||!node.balance)continue;
      if(addRecord({asset,address:node.address,balance:node.balance,observation:{...data.observation,retrieved_at:node.balance.retrieved_at,coverage:'bounded observed-neighbor address summary'},network:data.network,origin:'address seen in bounded BTC transaction page'}))enriched++;
    }
    selectedKey=recordKey(asset,data.address);
    setStatus(`${asset} source-reported balance loaded from ${data.observation?.source_id||'public source'}; ${enriched} observed-neighbor balances added. No ownership attribution.`, 'success');
    render();
  }catch(error){setStatus(`Lookup unavailable: ${error.message}. No balance was added.`,'error');}
  finally{addButton.disabled=false;}
}

form.addEventListener('submit',addAddress);
assetSelect.addEventListener('change',render);
canvas.addEventListener('click',event=>{
  const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
  const hit=[...points].reverse().find(point=>Math.hypot(x-point.x,y-point.y)<Math.max(14,point.radius+7));
  if(hit)select(hit.record.key);
});
new ResizeObserver(resize).observe(canvas);
const url=new URL(location.href);
const initialAddress=url.searchParams.get('address');
const initialAsset=url.searchParams.get('asset');
if(initialAsset&&colors[initialAsset.toUpperCase()])assetSelect.value=initialAsset.toLowerCase();
if(initialAddress){addressInput.value=initialAddress;addAddress();}
render();
