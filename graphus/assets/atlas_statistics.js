const mean = values => values.reduce((sum,x)=>sum+x,0)/values.length;
const check = (ok,message) => { if(!ok)throw new Error(message); };
export const finite = value => Number.isFinite(value)?value:null;
export function utcTimestamp(value){
  if(typeof value!=='string')return null;
  const match=value.match(/^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.(\d{1,3}))?)?Z$/);if(!match)return null;
  const time=Date.parse(value),expected=`${match[1]}T${match[2]}:${match[3]}:${match[4]||'00'}.${(match[5]||'').padEnd(3,'0')}Z`;
  return Number.isFinite(time)&&new Date(time).toISOString()===expected?time:null;
}
export function describe(values) {
  if(!values.length)return {n:0,mean:null,median:null,minimum:null,maximum:null,std:null};
  const sorted=values.slice().sort((a,b)=>a-b),m=mean(sorted),middle=Math.floor(sorted.length/2);
  return {n:sorted.length,mean:m,median:sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2,
    minimum:sorted[0],maximum:sorted.at(-1),std:sorted.length>1?Math.sqrt(sorted.reduce((s,x)=>s+(x-m)**2,0)/(sorted.length-1)):null};
}
// Lower tabulated degrees of freedom give a conservative two-sided 95% interval.
const critical95 = df => [[1,12.706205],[2,4.302653],[3,3.182447],[4,2.776446],[5,2.570582],[6,2.446912],[7,2.364624],[8,2.306005],[9,2.262158],[10,2.228139],[12,2.178813],[15,2.13145],[20,2.085964],[30,2.042273],[40,2.021076],[60,2.000299],[120,1.979931]].filter(([n])=>n<=df).at(-1)[1];
export function regression(points) {
  if(points.length<3)return {available:false,reason:'At least three observed UTC days are required.',n:points.length};
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),mx=mean(xs),my=mean(ys);
  const sxx=xs.reduce((s,x)=>s+(x-mx)**2,0);
  if(!sxx)return {available:false,reason:'Distinct observation days are required.',n:points.length};
  const slope=points.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0)/sxx,intercept=my-slope*mx;
  const residuals=points.map(p=>({day:p.day,observed:p.y,fitted:intercept+slope*p.x,residual:p.y-intercept-slope*p.x}));
  const sse=residuals.reduce((s,p)=>s+p.residual**2,0),sst=ys.reduce((s,y)=>s+(y-my)**2,0),df=points.length-2;
  const stderr=Math.sqrt(sse/df/sxx),critical=critical95(df),rmse=Math.sqrt(sse/df);
  return {available:true,n:points.length,slope,intercept,r_squared:sst>0?Math.max(0,1-sse/sst):null,rmse,degrees_of_freedom:df,
    slope_interval_95:{lower:slope-critical*stderr,upper:slope+critical*stderr,standard_error:stderr,critical,
      method:'Conservative tabulated Student t; conditional on independent, homoscedastic residuals. Sampling uncertainty is not covered.'},
    residuals,outlier_days:rmse?residuals.filter(p=>Math.abs(p.residual)>2*rmse).map(p=>p.day):[],
    warnings:['Only days with returned records enter the fit. Missing days are excluded, never zero-filled.',
      'Small samples, autocorrelation, unequal daily coverage and multiple testing invalidate predictive or causal readings.']};
}
export function wilson(successes,total) {
  if(!total)return null;
  const z=1.95996398454,p=successes/total,d=1+z*z/total,center=(p+z*z/(2*total))/d;
  const half=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/d;
  return {lower:Math.max(0,center-half),upper:Math.min(1,center+half),level:.95,method:'Wilson score'};
}
export function distributionDrift(baseline,current) {
  check(baseline.length>0&&current.length>0&&[...baseline,...current].every(x=>Number.isFinite(x)),'Drift requires finite baseline and current values.');
  const sorted=baseline.slice().sort((a,b)=>a-b),cuts=[...new Set([.2,.4,.6,.8].map(q=>sorted[Math.floor((sorted.length-1)*q)]))];
  const bins=Array.from({length:cuts.length+1},()=>({baseline:0,current:0}));
  const index=x=>{const i=cuts.findIndex(c=>x<=c);return i<0?cuts.length:i;};
  baseline.forEach(x=>bins[index(x)].baseline++);current.forEach(x=>bins[index(x)].current++);
  let psi=0;for(const b of bins){b.baseline_share=(b.baseline+.5)/(baseline.length+.5*bins.length);b.current_share=(b.current+.5)/(current.length+.5*bins.length);psi+=(b.current_share-b.baseline_share)*Math.log(b.current_share/b.baseline_share);}
  return {psi,cutpoints:cuts,bins,baseline_n:baseline.length,current_n:current.length,smoothing:.5,
    interpretation:'Descriptive distribution shift in baseline quantile bins; not an accuracy estimate or automatic release threshold.'};
}
export function evaluateHoldout(input) {
  check(input&&Object.keys(input).every(k=>['schema_version','model_version','training_cutoff','training_entities','rows','review_capacity','threshold','baseline_probabilities','label_origin'].includes(k)),'Unexpected evaluation fields.');
  check(input.schema_version===1&&typeof input.model_version==='string'&&input.model_version.length>0&&input.model_version.length<=120,'A versioned model declaration is required.');
  const cutoff=utcTimestamp(input.training_cutoff);
  check(cutoff!==null,'A valid ISO UTC training cutoff is required.');
  check(['synthetic','reviewed-outcomes'].includes(input.label_origin),'Declare synthetic or reviewed-outcomes label origin.');
  check(Array.isArray(input.training_entities)&&input.training_entities.length<=10000&&input.training_entities.every(x=>typeof x==='string'&&x.length>0&&x.length<=200),'Invalid training entity declaration.');
  check(Array.isArray(input.rows)&&input.rows.length>0&&input.rows.length<=10000,'Expected one to 10,000 holdout records.');
  const training=new Set(input.training_entities),ids=new Set(),entities=new Set();
  for(const row of input.rows){
    check(row&&Object.keys(row).every(k=>['id','entity','observed_at','probability','label'].includes(k)),'Unexpected holdout fields.');
    check(typeof row.id==='string'&&row.id.length>0&&row.id.length<=200&&!ids.has(row.id),'Duplicate or invalid holdout record.');ids.add(row.id);
    check(typeof row.entity==='string'&&row.entity.length>0&&row.entity.length<=200&&!training.has(row.entity),'Training and holdout entities overlap.');entities.add(row.entity);
    check(utcTimestamp(row.observed_at)!==null&&utcTimestamp(row.observed_at)>cutoff,'Holdout times must be valid ISO UTC dates later than the training cutoff.');
    check(Number.isFinite(row.probability)&&row.probability>=0&&row.probability<=1&&[0,1].includes(row.label),'Invalid probability or binary label.');
  }
  const capacity=input.review_capacity,threshold=input.threshold??.5;
  check(Number.isInteger(capacity)&&capacity>=1&&capacity<=input.rows.length,'Review capacity must be within the holdout size.');
  check(Number.isFinite(threshold)&&threshold>=0&&threshold<=1,'Invalid decision threshold.');
  const ranked=input.rows.slice().sort((a,b)=>b.probability-a.probability||a.id.localeCompare(b.id,'en'));
  const reviewed=ranked.slice(0,capacity),hits=reviewed.filter(r=>r.label===1).length;
  const counts={true_positive:0,false_positive:0,true_negative:0,false_negative:0};
  const bins=Array.from({length:10},(_,i)=>({lower:i/10,upper:(i+1)/10,n:0,probability_sum:0,positive:0}));
  let brier=0;
  for(const r of ranked){counts[r.probability>=threshold?(r.label?'true_positive':'false_positive'):(r.label?'false_negative':'true_negative')]++;
    const b=bins[Math.min(9,Math.floor(r.probability*10))];b.n++;b.probability_sum+=r.probability;b.positive+=r.label;brier+=(r.probability-r.label)**2;}
  let ece=0;const reliability=bins.map(b=>{const probability=b.n?b.probability_sum/b.n:null,frequency=b.n?b.positive/b.n:null;if(b.n)ece+=b.n/ranked.length*Math.abs(probability-frequency);return {lower:b.lower,upper:b.upper,n:b.n,mean_probability:probability,observed_fraction:frequency};});
  const positives=counts.true_positive+counts.false_negative,negatives=counts.true_negative+counts.false_positive;
  let drift=null;if(input.baseline_probabilities!==undefined){check(Array.isArray(input.baseline_probabilities)&&input.baseline_probabilities.length<=10000&&input.baseline_probabilities.every(p=>Number.isFinite(p)&&p>=0&&p<=1),'Invalid baseline probabilities.');drift=distributionDrift(input.baseline_probabilities,ranked.map(r=>r.probability));}
  return {schema_version:1,model_version:input.model_version,label_origin:input.label_origin,training_cutoff:input.training_cutoff,
    validation_cohort:{records:ranked.length,entities:entities.size,declared_training_entities:training.size,time_disjoint:true,entity_disjoint:true,
      first:new Date(Math.min(...ranked.map(r=>Date.parse(r.observed_at)))).toISOString(),last:new Date(Math.max(...ranked.map(r=>Date.parse(r.observed_at)))).toISOString(),declaration_verified_independently:false},
    precision_at_review_capacity:{capacity,hits,precision:hits/capacity,interval:wilson(hits,capacity),ties_at_cutoff:ranked.filter(r=>r.probability===reviewed.at(-1).probability).length,tie_break:'record id ascending'},
    recall_and_false_positive_rate:{threshold,...counts,recall:positives?counts.true_positive/positives:null,false_positive_rate:negatives?counts.false_positive/negatives:null,
      recall_interval:wilson(counts.true_positive,positives),false_positive_interval:wilson(counts.false_positive,negatives)},
    calibration_and_drift:{brier_score:brier/ranked.length,expected_calibration_error:ece,reliability,drift},
    release_approved:false,limitations:['User-supplied labels and training declarations are not independently verified.',
      'Repeated entities can make row-level Wilson intervals optimistic. No model is promoted by this report.',
      'Review labels, selection bias, subgroup performance and independent validation before consequential use.']};
}
