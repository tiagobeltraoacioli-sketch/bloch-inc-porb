const canvas = document.getElementById('evidence-constellation');
const context = canvas.getContext('2d');
const assetKeys = ['btc', 'eth', 'usdt', 'usdc', 'blch'];
const colors = {btc:'#f2b96c',eth:'#9cc7ff',usdt:'#77d8c2',usdc:'#75bdf0',blch:'#ef8b80'};
const units = {btc:'sat',eth:'wei',usdt:'token units',usdc:'token units',blch:'sat'};
const sourceNames = {btc:'Synthetic Bitcoin fixture',eth:'Synthetic Ethereum fixture',usdt:'Synthetic ERC-20 USDT fixture',usdc:'Synthetic ERC-20 USDC fixture',blch:'Synthetic Bloch fixture'};
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
  wallets.push({id,address,asset,x,y,transactions:[],volume:0,index});
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
      from.transactions.push({...tx,direction:'OUT',counterparty:to.id});
      to.transactions.push({...tx,direction:'IN',counterparty:from.id});
    }
  }
}
for(const wallet of wallets){
  wallet.transactions.sort((a,b)=>a.observed.localeCompare(b.observed)||a.id.localeCompare(b.id));
  wallet.volume=wallet.transactions.reduce((sum,tx)=>sum+tx.amount,0);
}
const maxVolumeByAsset=Object.fromEntries(assetKeys.map(asset=>[asset,Math.max(...wallets.filter(wallet=>wallet.asset===asset).map(wallet=>wallet.volume))]));
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
let width = 0, height = 0, dpr = 1, tick = 0;
let paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let transactionDots = [];

function visible(wallet) { return activeAsset === 'all' || wallet.asset === activeAsset; }
function matchesSearch(wallet) { return !search || wallet.id.toLowerCase().includes(search) || wallet.address.toLowerCase().includes(search); }
function magnitude(wallet) {
  const activity=wallet.transactions.length/20;
  const volume=wallet.volume/maxVolumeByAsset[wallet.asset];
  return Math.min(1,.5*activity+.5*volume);
}
function point(wallet) { return {x:wallet.x*width,y:wallet.y*height}; }
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
  gradient.addColorStop(0,'#153752');gradient.addColorStop(.55,'#0a1b2a');gradient.addColorStop(1,'#07111b');
  context.fillStyle=gradient;context.fillRect(0,0,width,height);
  for (const [asset,[cx,cy]] of Object.entries(centers)) {
    if (activeAsset !== 'all' && activeAsset !== asset) continue;
    context.save();context.globalAlpha=.13;context.strokeStyle=colors[asset];context.lineWidth=1;
    context.beginPath();context.ellipse(cx*width,cy*height,width*.16,height*.20,0,0,Math.PI*2);context.stroke();
    context.fillStyle=colors[asset];context.font='11px ui-monospace, monospace';context.letterSpacing='2px';
    context.fillText(`${asset.toUpperCase()} FIELD`,cx*width-width*.065,cy*height-height*.17);context.restore();
  }
  for (const [from,to] of relations) {
    if (!visible(from)||!visible(to)) continue;
    const selected=selectedWallet && (from.id===selectedWallet.id||to.id===selectedWallet.id);
    line(point(from),point(to),selected?'#9bc6e2':'#6da8c8',selected?.48:.12,selected?1.5:.8);
  }
  if(selectedWallet&&visible(selectedWallet)){
    for(const tx of selectedWallet.transactions){
      const from=walletById.get(tx.from),to=walletById.get(tx.to);
      arrow(point(from),point(to),tx.direction==='OUT'?'#f3a295':'#91d9d4');
    }
  }
  for (const wallet of wallets) {
    if (!visible(wallet)) continue;
    const p=point(wallet);
    const selected=selectedWallet?.id===wallet.id;
    const level=magnitude(wallet);
    const twinkle=.62+.22*level+.12*Math.sin(tick*.023+wallet.index*2.3);
    star(p.x,p.y,selected?12:4+level*7.2,colors[wallet.asset],selected?1:twinkle*(matchesSearch(wallet)?1:.35));
    if (selected) {
      context.strokeStyle='#f5b1a7';context.lineWidth=1.5;context.beginPath();context.arc(p.x,p.y,13,0,Math.PI*2);context.stroke();
      context.fillStyle='#f2f7fb';context.font='700 12px ui-monospace, monospace';context.fillText(wallet.id,p.x+17,p.y-13);
    }
  }
  transactionDots=[];
  if (selectedWallet && visible(selectedWallet)) {
    const base=point(selectedWallet);const count=selectedWallet.transactions.length;
    const fan={x:Math.max(105,Math.min(width-105,base.x)),y:Math.max(108,Math.min(height-108,base.y))};
    if (Math.hypot(fan.x-base.x,fan.y-base.y)>2) line(base,fan,'#f4aa9f',.7,1.5);
    selectedWallet.transactions.forEach((tx,index)=>{
      const angle=-Math.PI*.85+index*(Math.PI*1.7/Math.max(1,count-1));
      const p={x:fan.x+Math.cos(angle)*74,y:fan.y+Math.sin(angle)*74};
      line(fan,p,'#f2d5a2',.65,1.3);star(p.x,p.y,selectedTransaction?.id===tx.id?6:4.5,'#f9e2b6');
      transactionDots.push({tx,p});
    });
  }
}
function frame() {if(!paused){tick++;draw();}requestAnimationFrame(frame);}
function setText(id,value) {document.getElementById(id).textContent=value;}
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
    button.addEventListener('click',()=>selectWallet(walletById.get(id)));
    flowList.append(button);
  });
}
function selectWallet(wallet) {
  selectedWallet=wallet;selectedTransaction=null;
  noteLink.href=`account.html?wallet=${encodeURIComponent(wallet.address)}`;
  setText('record-type','SYNTHETIC WALLET / '+wallet.asset.toUpperCase());
  setText('record-id',wallet.id);
  setText('record-summary',`${wallet.address} · Illustrative wallet point with a fan of independently inspectable synthetic transactions. Star magnitude combines event count and within-asset volume, never AML risk.`);
  setText('record-asset',wallet.asset.toUpperCase());
  setText('record-time',wallet.transactions[0].observed+' to '+wallet.transactions.at(-1).observed);
  setText('record-source',sourceNames[wallet.asset]);
  setText('record-related',`${wallet.transactions.length} synthetic transactions · ${wallet.volume.toLocaleString('en-US')} ${units[wallet.asset]}`);
  setText('record-meaning','Feature windows and temporal ML are research; no trained model or score.');
  renderAnalytics(wallet);
  renderFlows(wallet);
  const list=document.getElementById('transaction-list');list.replaceChildren();
  wallet.transactions.forEach(tx=>{
    const button=document.createElement('button');button.type='button';
    button.textContent=`${tx.id} · ${tx.direction} · ${tx.amount} ${units[wallet.asset]} · ${tx.counterparty}`;
    button.addEventListener('click',()=>selectTransaction(wallet,tx));list.append(button);
  });
  draw();
}
function selectTransaction(wallet,tx) {
  selectedTransaction=tx;
  setText('record-type','SYNTHETIC TRANSACTION / '+wallet.asset.toUpperCase());
  setText('record-id',tx.id);
  setText('record-summary',`${tx.direction} event with ${tx.counterparty} in an illustrative wallet flow. Amount: ${tx.amount} ${units[wallet.asset]}. The same synthetic transfer is visible from both wallets.`);
  setText('record-asset',wallet.asset.toUpperCase());setText('record-time',tx.observed);
  setText('record-source',sourceNames[wallet.asset]);setText('record-related',`${wallet.id} ↔ ${tx.counterparty}`);
  setText('record-meaning','No AML finding or model output; source and finality would be required for a real event.');
  renderAnalytics(wallet);
  draw();
}
function renderList() {
  const list=document.getElementById('accessible-records');list.replaceChildren();
  wallets.filter(wallet=>visible(wallet)&&matchesSearch(wallet)).forEach(wallet=>{
    const button=document.createElement('button');button.type='button';button.textContent=`${wallet.id} · ${wallet.address} · ${wallet.transactions.length} tx`;
    button.addEventListener('click',()=>selectWallet(wallet));list.append(button);
  });
}
canvas.addEventListener('click',event=>{
  const rect=canvas.getBoundingClientRect();const x=event.clientX-rect.left,y=event.clientY-rect.top;
  const txHit=transactionDots.find(({p})=>Math.hypot(x-p.x,y-p.y)<12);
  if(txHit && selectedWallet){selectTransaction(selectedWallet,txHit.tx);return;}
  let nearest=null,distance=14;
  for(const wallet of wallets.filter(visible)){const p=point(wallet),d=Math.hypot(x-p.x,y-p.y);if(d<distance){nearest=wallet;distance=d;}}
  if(nearest)selectWallet(nearest);
});
document.querySelectorAll('[data-constellation-asset]').forEach(button=>button.addEventListener('click',()=>{
  activeAsset=button.dataset.constellationAsset;
  document.querySelectorAll('[data-constellation-asset]').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',String(item===button));});
  if(selectedWallet&&!visible(selectedWallet)){selectedWallet=null;selectedTransaction=null;}
  renderList();draw();
}));
document.getElementById('record-search').addEventListener('input',event=>{
  search=event.target.value.trim().toLowerCase();renderList();
  const match=wallets.find(wallet=>visible(wallet)&&matchesSearch(wallet));
  if(search&&match)selectWallet(match);else draw();
});
const pauseButton=document.getElementById('pause-constellation');
pauseButton.addEventListener('click',()=>{paused=!paused;pauseButton.setAttribute('aria-pressed',String(paused));pauseButton.textContent=paused?'Resume motion':'Pause motion';draw();});
if(paused){pauseButton.setAttribute('aria-pressed','true');pauseButton.textContent='Resume motion';}
new ResizeObserver(resize).observe(canvas);
renderList();resize();requestAnimationFrame(frame);
