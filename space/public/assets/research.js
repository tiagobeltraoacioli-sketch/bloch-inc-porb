import {analyze,dataset} from './science.js';

const node=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!=null)n.textContent=text;return n;};
const svg=(tag,attrs={})=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
const fmt=value=>value==null||!Number.isFinite(value)?'—':new Intl.NumberFormat('en-US',{maximumFractionDigits:3,notation:Math.abs(value)>1e6?'compact':'standard'}).format(value);
const colors=['#42dca3','#a798ff','#edb96b','#65afff'];
function panel(title,note){const p=node('section','workspace-chart research-chart');p.append(node('span','chart-index','BLOCH SPACE / RESEARCH'),node('h3','',title),node('p','',note));return p;}
function plot(title,note,rows,series,{scatter=false,bar=false}={}){
  const p=panel(title,note),values=rows.flatMap(r=>series.map(s=>r[s.key])).filter(v=>typeof v==='number'&&Number.isFinite(v));
  if(!values.length){p.append(node('p','workspace-empty','Insufficient observations for this panel.'));return p;}
  const low=bar?Math.min(0,...values):Math.min(...values),high=Math.max(...values),span=high-low||1;
  const g=svg('svg',{viewBox:'0 0 640 250',role:'img','aria-label':`${title}. ${rows.length} positions. Range ${fmt(low)} to ${fmt(high)}.`});
  const x=i=>52+i*558/Math.max(1,rows.length-1),y=v=>208-(v-low)/span*173;
  for(let i=0;i<5;i++){const at=35+i*173/4;g.append(svg('line',{x1:52,x2:615,y1:at,y2:at,class:'workspace-gridline'}));const t=svg('text',{x:46,y:at+3,'text-anchor':'end',class:'workspace-axis'});t.textContent=fmt(high-i*(high-low)/4);g.append(t);}
  const tip=node('div','research-tooltip','Point details: hover or focus a mark.');tip.setAttribute('aria-live','polite');
  series.forEach((s,j)=>{
    let path='',previous=null;
    rows.forEach((r,i)=>{const v=r[s.key];if(typeof v!=='number'||!Number.isFinite(v)){previous=null;return;}
      path+=`${previous===r.group?'L':'M'}${x(i)},${y(v)} `;previous=r.group;
      const mark=bar?svg('rect',{x:x(i)-Math.min(14,240/rows.length),y:Math.min(y(v),y(0)),width:Math.min(28,480/rows.length),height:Math.max(1,Math.abs(y(v)-y(0))),fill:colors[j]}):svg('circle',{cx:x(i),cy:y(v),r:scatter?4:3,fill:colors[j]});
      mark.setAttribute('tabindex','0');const detail=`${r.label} · ${s.label}: ${fmt(v)}`;mark.setAttribute('aria-label',detail);const t=svg('title');t.textContent=detail;mark.append(t);mark.addEventListener('focus',()=>{tip.textContent=detail;});mark.addEventListener('pointerenter',()=>{tip.textContent=detail;});g.append(mark);
    });
    if(!bar&&!scatter)g.prepend(svg('path',{d:path,fill:'none',stroke:colors[j],'stroke-width':2}));
  });
  for(const [i,anchor]of [[0,'start'],[rows.length-1,'end']]){const t=svg('text',{x:x(i),y:234,'text-anchor':anchor,class:'workspace-axis'});t.textContent=String(rows[i].label).replace('T',' ').slice(0,22);g.append(t);}
  const legend=node('div','research-legend');series.forEach((s,i)=>{const item=node('span',`series-${i}`,s.label);legend.append(item);});p.append(g,legend,tip);return p;
}
function matrix(report){const p=panel('Feature correlation','Pearson r on pairwise complete observations in this window. Correlation does not establish causation.'),grid=node('table','research-matrix');
  const head=node('tr');head.append(node('th','','r'));for(const f of report.features)head.append(node('th','',f[1]));grid.append(head);
  report.features.forEach((f,i)=>{const row=node('tr');row.append(node('th','',f[1]));report.features.forEach((_,j)=>{const cell=node('td','',fmt(report.correlation[i][j]));cell.dataset.level=report.correlation[i][j]==null?'empty':report.correlation[i][j]>.5?'high':report.correlation[i][j]<-.5?'low':'mid';row.append(cell);});grid.append(row);});p.append(grid);return p;
}
function scatter(report){const a=report.features[0],b=report.features[1],p=panel('Structural groups',`${a[1]} × ${b[1]}. K-means on standardized source features; groups describe this sample only.`),c=report.clusters;
  if(!c.available){p.append(node('p','workspace-empty',c.reason));return p;}
  const rows=c.labels.map(l=>({...report.rows[l.index],cluster:l.cluster})),xs=rows.map(r=>r[a[0]]),ys=rows.map(r=>r[b[0]]),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys),g=svg('svg',{viewBox:'0 0 640 250',role:'img','aria-label':`${c.k} descriptive clusters. X ${a[1]}, Y ${b[1]}.`});
  for(let i=0;i<5;i++)g.append(svg('line',{x1:45,x2:605,y1:30+i*44,y2:30+i*44,class:'workspace-gridline'}));
  const tip=node('div','research-tooltip',`${c.k} groups · ${rows.length} complete observations · ${c.iterations} iterations`);
  for(const r of rows){const mark=svg('circle',{cx:45+(r[a[0]]-xmin)/(xmax-xmin||1)*560,cy:208-(r[b[0]]-ymin)/(ymax-ymin||1)*178,r:5,fill:colors[r.cluster],tabindex:0});const detail=`${r.label}: ${a[1]} ${fmt(r[a[0]])}; ${b[1]} ${fmt(r[b[0]])}; group ${r.cluster+1}`;mark.setAttribute('aria-label',detail);const t=svg('title');t.textContent=detail;mark.append(t);mark.addEventListener('pointerenter',()=>{tip.textContent=detail;});mark.addEventListener('focus',()=>{tip.textContent=detail;});g.append(mark);}
  const labels=node('p','',`X: ${fmt(xmin)}–${fmt(xmax)} ${a[2]} · Y: ${fmt(ymin)}–${fmt(ymax)} ${b[2]}`);p.append(g,labels,tip);return p;
}
export function renderResearch(data,network,mode,ui,selected=null){
  const report=analyze(network,data,selected),[key,title,unit]=report.feature,stats=report.statistics;
  const host=document.querySelector('#workspace-feature');host.replaceChildren();
  const toolbar=node('div','research-toolbar'),label=node('label','','Analyze a feature'),select=node('select');select.setAttribute('aria-label','Research feature');
  dataset(network,data).features.forEach(([id,name])=>{const option=node('option','',name);option.value=id;option.selected=id===key;select.append(option);});label.append(select);select.addEventListener('change',()=>renderResearch(data,network,mode,ui,select.value));
  const exportButton=node('button','','Export research JSON ↓');exportButton.type='button';exportButton.addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({...report,source_response:data},null,2)],{type:'application/json'})),a=node('a');a.href=url;a.download=`bloch-space-${network}-${key}-research.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  toolbar.append(label,node('span','',`MODEL ${report.version} · ${unit}`),exportButton);host.append(toolbar);
  const rows=report.rows.map((r,i)=>({...r,observed:r[key],average:report.rolling[i].average,lower:report.rolling[i].lower,upper:report.rolling[i].upper,z:report.rolling[i].z}));
  const plots=[plot(`${title} / observed + rolling mean`,'Mean uses up to five preceding positions, within unchanged coverage.',rows,[{key:'observed',label:unit},{key:'average',label:'Prior rolling mean'}]),
    plot('Empirical distribution',`${stats.n} valid observations. Equal-width bins, no extrapolated history.`,report.histogram.map(b=>({label:`${fmt(b.low)}–${fmt(b.high)}`,count:b.count,group:0})),[{key:'count',label:'Observations'}],{bar:true}),
    plot('Rolling dispersion envelope','Prior mean ± 2 sample standard deviations. A descriptive band, not a confidence guarantee.',rows,[{key:'observed',label:'Observed'},{key:'lower',label:'Lower band'},{key:'upper',label:'Upper band'}]),
    plot('Deviation from recent behavior','Z-score against preceding observations; |z| ≥ 3 marks a statistical deviation, not illicit activity.',rows,[{key:'z',label:'Prior-window z-score'}],{bar:true}),matrix(report),scatter(report),
    plot('Autocorrelation by lag','Pairs remain inside uninterrupted coverage groups. Constant or insufficient series have no coefficient.',report.autocorrelation.map(r=>({label:`Lag ${r.lag}`,value:r.value,group:0})),[{key:'value',label:'Pearson r'}],{bar:true})];
  const v=report.validation;
  if(v.available){plots.push(plot('Walk-forward model evaluation',`${v.train_rows} initial training rows; ${v.evaluation_rows} later one-step evaluations. No future observations enter training.`,v.points.map(r=>({...r,group:0})),[{key:'actual',label:'Observed'},{key:'prediction',label:'AR(1)'},{key:'baseline',label:'Persistence'}]));
    plots.push(plot('Out-of-sample residuals','Observed minus one-step prediction, on the evaluation window only.',v.points.map(r=>({...r,group:0})),[{key:'error',label:'Residual'}],{bar:true}));
    const model=node('div','research-model');model.append(node('strong','',`AR(1) MAE ${fmt(v.mae)} ${unit} · persistence MAE ${fmt(v.baseline_mae)} ${unit}`),node('p','',`RMSE ${fmt(v.rmse)} · skill ${v.skill==null?'unavailable':fmt(v.skill*100)+'%'} relative to persistence. ${v.note}`));host.append(model);
  }else{const empty=panel('Walk-forward model evaluation',v.reason);empty.append(node('p','workspace-empty','Choose a larger source window. Missing positions and reporting changes are not filled with synthetic data.'));plots.push(empty);}
  ui.cards(mode==='ml'?[['Evaluation rows',v.available?String(v.evaluation_rows):'Pending','Chronological holdout'],['Model MAE',v.available?fmt(v.mae):'—',unit],['Baseline MAE',v.available?fmt(v.baseline_mae):'—','Persistence baseline'],['Structural groups',report.clusters.available?String(report.clusters.k):'—','Unsupervised, descriptive']]:[['Valid observations',String(stats.n),`${stats.missing} missing positions`],['Mean',fmt(stats.mean),unit],['Median',fmt(stats.median),unit],['Standard deviation',fmt(stats.std),'Sample, n − 1']]);
  ui.showCharts(mode==='ml'?[plots[7],plots[5],...(plots[8]?[plots[8]]:[]),plots[3],plots[4],plots[6]]:plots);
  document.querySelector('#workspace-table-title').textContent='Research observations and derived features';
  ui.table(['Source position',`${title} (${unit})`,'Prior mean','Prior z-score','Group','Signal'],rows.map((r,i)=>[r.label,fmt(r[key]),fmt(r.average),fmt(r.z),report.clusters.labels?.find(l=>l.index===i)?.cluster!=null?String(report.clusters.labels.find(l=>l.index===i).cluster+1):'—',r.z!=null&&Math.abs(r.z)>=3?'Statistical deviation':'—']));
  document.querySelector('#workspace-coverage').textContent=`${data.note} Derived analysis uses floating-point measurements. Window p05 / p95: ${fmt(stats.p05)} / ${fmt(stats.p95)} ${unit}. Models are exploratory; no risk or ownership inference.`;
  ui.provenance(data);
}

export function renderGraphus(data,network,ui){
  const manifest=data.manifest,holders=data.holders?.holders||[];
  ui.cards([['Connected platform','Graphus','Bloch Inc / data infrastructure'],['Asset scope','5','BTC · ETH · USDT · USDC · BLCH'],['Holder records',network==='bloch'?String(holders.length):'Not indexed','Positive Bloch script balances'],['Score access','Private','BI-PoRB separate service']]);
  const plots=[];
  if(network==='bloch'&&holders.length){
    const total=BigInt(data.holders.coverage.indexed_total_sat),sum=holders.reduce((s,h)=>s+BigInt(h.balance_sat),0n),rows=holders.map((h,i)=>({label:`#${i+1}`,share:total?Number(BigInt(h.balance_sat)*1000000n/total)/10000:0,group:0}));
    plots.push(plot('Indexed balance concentration','Share of total indexed BLCH balance by script reference. Scripts do not identify people.',rows,[{key:'share',label:'% of indexed balance'}],{bar:true}));
    let cumulative=0;plots.push(plot('Cumulative share / returned rank','Descending rank, using the full indexed balance as denominator.',rows.map(r=>({...r,cumulative:cumulative+=r.share})),[{key:'cumulative',label:'Cumulative %'}]));
    ui.table(['Rank','Script reference','Exact balance (sat)','UTXOs'],holders.map(h=>[h.rank,{text:h.script_hash,href:`/?network=bloch&kind=address&query=${h.script_hash}`},h.balance_sat,h.utxo_count]));
    document.querySelector('#workspace-coverage').textContent=`Returned ${holders.length} script references hold ${total?fmt(Number(sum*1000000n/total)/10000):'—'}% of indexed balance. Source height ${data.holders.anchor.height}. No owner clustering or global identity ranking.`;
  }else{
    ui.table(['Network','Asset','Available adapter'],(manifest.initial_assets||[]).map(a=>[a.network,a.asset,a.status]));
    document.querySelector('#workspace-coverage').textContent='Graphus provides bounded source queries. Bitcoin and Ethereum global holder indexes are not available while dedicated nodes synchronize.';
  }
  ui.showCharts(plots);document.querySelector('#workspace-table-title').textContent=network==='bloch'&&holders.length?'Indexed holder evidence':'Graphus adapter catalog';
  const host=document.querySelector('#workspace-feature');host.replaceChildren();const p=node('div','research-model');p.append(node('strong','','Graphus × Bloch Space × BI-PoRB'),node('p','','Explore transaction relationships, source-anchored balance observations, the 84-field data atlas and the separate account workspace.'));
  const links=node('div','research-links');for(const [label,href]of [['Constellation ↗','https://bloch-graphus.xyz/constellation.html'],['Oculum ↗','https://bloch-graphus.xyz/oculum'],['Data atlas ↗','https://bloch-graphus.xyz/catalog.html'],['Bloch L1 explorer ↗','https://blochl1.com/'],['BI-PoRB workspace','/account/']]){const a=node('a','',label);a.href=href;links.append(a);}p.append(links);host.append(p);ui.provenance(data);
}
