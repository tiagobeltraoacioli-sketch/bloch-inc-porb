// Bounded, reproducible descriptive statistics and exploratory models.
export const MODEL_VERSION = 'space-research-1.0.0';
const finite = value => typeof value === 'number' && Number.isFinite(value);
export const mean = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
export function quantile(xs,p) {
  const a=xs.filter(finite).slice().sort((a,b)=>a-b);
  if(!a.length)return null;
  const i=(a.length-1)*p,low=Math.floor(i);
  return a[low]+(a[Math.ceil(i)]-a[low])*(i-low);
}
export function describe(xs) {
  const a=xs.filter(finite),n=a.length,m=mean(a),variance=n>1?mean(a.map(v=>(v-m)**2))*n/(n-1):null;
  return {n,missing:xs.length-n,mean:m,median:quantile(a,.5),std:variance==null?null:Math.sqrt(variance),
    min:n?Math.min(...a):null,max:n?Math.max(...a):null,p05:quantile(a,.05),p25:quantile(a,.25),p75:quantile(a,.75),p95:quantile(a,.95)};
}
export function correlation(xs,ys) {
  const pairs=xs.map((x,i)=>[x,ys[i]]).filter(([x,y])=>finite(x)&&finite(y));
  if(pairs.length<3)return null;
  const mx=mean(pairs.map(p=>p[0])),my=mean(pairs.map(p=>p[1]));
  let xy=0,xx=0,yy=0;
  for(const [x,y] of pairs){xy+=(x-mx)*(y-my);xx+=(x-mx)**2;yy+=(y-my)**2;}
  return xx&&yy?Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy))):null;
}
export function histogram(xs,bins=10) {
  const a=xs.filter(finite);if(!a.length)return [];
  const low=Math.min(...a),high=Math.max(...a);
  if(low===high)return [{low,high,count:a.length}];
  const width=(high-low)/bins,result=Array.from({length:bins},(_,i)=>({low:low+i*width,high:low+(i+1)*width,count:0}));
  for(const value of a)result[Math.min(bins-1,Math.floor((value-low)/width))].count++;
  return result;
}
export function dataset(network,data) {
  if(network==='bitcoin')return {features:[['transactions','Transactions','tx'],['size','Block size','MB'],['weight','Block weight','MWU']],
    rows:(data.blocks||[]).slice().reverse().map(b=>({label:`#${b.height}`,group:0,transactions:b.tx_count,size:b.size/1e6,weight:b.weight/1e6,reference:b.id}))};
  if(network==='ethereum'){
    const h=data.fee_history;return {features:[['gas','Gas utilization','%'],['fee','Base fee','gwei']],rows:(h?.gas_used_ratio||[]).map((v,i)=>({label:`#${BigInt(h.oldest_height)+BigInt(i)}`,group:0,gas:v*100,fee:Number(h.base_fee_wei[i])/1e9,reference:String(BigInt(h.oldest_height)+BigInt(i))}))};
  }
  let group=0,previous=null;
  return {features:[['connections','Monitored connections','sockets'],['perNode','Connections per node','sockets / node'],['coverage','Reporting nodes','nodes']],rows:(data.points||[]).map(p=>{
    const valid=finite(p.connections)&&p.reporting_nodes>0;
    if(!valid||previous!==p.reporting_nodes)group++;
    previous=valid?p.reporting_nodes:null;
    return {label:new Date(p.at).toISOString(),group,connections:valid?p.connections:null,perNode:valid?p.connections/p.reporting_nodes:null,coverage:p.reporting_nodes,reference:String(p.at)};
  })};
}
export function rolling(rows,key,window=5) {
  return rows.map((row,i)=>{
    if(!finite(row[key]))return {average:null,lower:null,upper:null,z:null};
    const history=rows.slice(Math.max(0,i-window),i).filter(r=>r.group===row.group&&finite(r[key])).map(r=>r[key]);
    const stats=describe(history),ready=history.length>=3;
    return {average:ready?stats.mean:null,lower:ready?stats.mean-2*stats.std:null,upper:ready?stats.mean+2*stats.std:null,z:ready&&stats.std>0?(row[key]-stats.mean)/stats.std:null};
  });
}
export function autocorrelation(rows,key,maxLag=10) {
  return Array.from({length:Math.min(maxLag,Math.floor(rows.length/3))},(_,i)=>{
    const lag=i+1,pairs=rows.slice(lag).map((r,j)=>[r,rows[j]]).filter(([a,b])=>a.group===b.group&&finite(a[key])&&finite(b[key]));
    return {lag,value:correlation(pairs.map(p=>p[0][key]),pairs.map(p=>p[1][key])),pairs:pairs.length};
  });
}
export function cluster(rows,features,k=3) {
  const input=rows.map((row,index)=>({index,values:features.map(f=>row[f])})).filter(r=>r.values.every(finite));
  if(input.length<k*3)return {available:false,reason:`At least ${k*3} complete rows are required.`};
  const stats=features.map((_,i)=>describe(input.map(r=>r.values[i])));
  if(stats.every(s=>!s.std))return {available:false,reason:'Constant features do not support distinct clusters.'};
  const points=input.map(r=>r.values.map((v,i)=>(v-stats[i].mean)/(stats[i].std||1)));
  const distance=(a,b)=>a.reduce((s,v,i)=>s+(v-b[i])**2,0);
  const centers=[points[0].slice()];
  while(centers.length<k){let next=0,best=-1;points.forEach((p,i)=>{const d=Math.min(...centers.map(c=>distance(p,c)));if(d>best){best=d;next=i;}});if(best<1e-12)break;centers.push(points[next].slice());}
  if(centers.length<2)return {available:false,reason:'Too few distinct observations.'};
  let labels=[],iterations=0;
  for(;iterations<60;iterations++){
    const next=points.map(p=>centers.reduce((best,c,i)=>distance(p,c)<distance(p,centers[best])?i:best,0));
    const same=next.every((n,i)=>n===labels[i]);labels=next;
    centers.forEach((c,j)=>{const members=points.filter((_,i)=>labels[i]===j);if(members.length)centers[j]=c.map((_,d)=>mean(members.map(p=>p[d])));});
    if(same)break;
  }
  return {available:true,k:centers.length,iterations:iterations+1,labels:input.map((r,i)=>({index:r.index,cluster:labels[i]})),
    centers:centers.map(c=>c.map((v,i)=>v*(stats[i].std||1)+stats[i].mean)),inertia:points.reduce((s,p,i)=>s+distance(p,centers[labels[i]]),0),
    note:'Descriptive k-means fitted to the displayed window. Standardized features; deterministic farthest-point initialization. Groups are not risk classes or out-of-sample predictions.'};
}
// Fit AR(1) on past pairs only. Every evaluation point is predicted before it
// enters the training set; persistence is evaluated at the same positions.
export function walkForward(rows,key) {
  const last=rows.at(-1);
  const a=last&&finite(last[key])?rows.filter(r=>r.group===last.group&&finite(r[key])):[];
  if(a.length<24)return {available:false,reason:'24 consecutive observations with stable source coverage are required.',observations:a.length};
  const start=Math.max(16,Math.floor(a.length*.75)),out=[];
  for(let i=start;i<a.length;i++){
    const history=a.slice(0,i).map(r=>r[key]),x=history.slice(0,-1),y=history.slice(1),mx=mean(x),my=mean(y);
    const xx=x.reduce((s,v)=>s+(v-mx)**2,0),xy=x.reduce((s,v,j)=>s+(v-mx)*(y[j]-my),0);
    const slope=xx>0?xy/xx:0,intercept=my-slope*mx,prediction=intercept+slope*history.at(-1),actual=a[i][key];
    out.push({label:a[i].label,actual,prediction,baseline:history.at(-1),training_rows:i,error:actual-prediction});
  }
  const mae=mean(out.map(p=>Math.abs(p.error))),baseline=mean(out.map(p=>Math.abs(p.actual-p.baseline)));
  return {available:true,model:'Expanding-window AR(1) / ordinary least squares',version:MODEL_VERSION,train_rows:start,evaluation_rows:out.length,
    mae,rmse:Math.sqrt(mean(out.map(p=>p.error**2))),baseline_mae:baseline,skill:baseline>0?1-mae/baseline:null,points:out,
    note:'One-step historical evaluation on the latest uninterrupted coverage segment. Exploratory small sample, not a trading forecast or AML score.'};
}
export function analyze(network,source,key) {
  const data=dataset(network,source),feature=data.features.find(f=>f[0]===key)||data.features[0];key=feature[0];
  const values=data.rows.map(r=>r[key]);
  return {version:MODEL_VERSION,network,feature,features:data.features,rows:data.rows,statistics:describe(values),histogram:histogram(values),
    rolling:rolling(data.rows,key),autocorrelation:autocorrelation(data.rows,key),
    correlation:data.features.map(a=>data.features.map(b=>correlation(data.rows.map(r=>r[a[0]]),data.rows.map(r=>r[b[0]])))),
    clusters:cluster(data.rows,data.features.map(f=>f[0])),validation:walkForward(data.rows,key),
    provenance:{source:source.source,retrieved_at:source.retrieved_at,note:source.note,independent_verification:source.independent_verification},
    precision:'Derived floating-point measurements for analysis; source responses retain original integer units.'};
}
