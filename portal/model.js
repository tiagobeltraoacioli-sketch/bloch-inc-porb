import {describe, correlation, cluster, histogram} from '../space/public/assets/science.js';

export const VERSION = 'porb-observation-1.0.0';
export const FEATURES = ['log_in_events','log_out_events','log_neighbors','log_in_amount','log_out_amount','direction_balance','neighbor_concentration','log_active_blocks'];
export const MODEL_CARD = {
  version: VERSION, name: 'BI-PoRB observation scores', networks: ['Bitcoin','Ethereum','Bloch'],
  scale: [0,100], red: '100 × Isolation Forest isolation score within this asset sample. Higher values indicate shorter isolation paths.',
  blue: 'Record completeness: 30% block hash and height, 25% transaction and event reference, 25% exact amount, 20% block timestamp.',
  blue_scope: 'Completeness of observed records only; it does not measure chain coverage, truth, identity or source independence.',
  features: FEATURES, algorithm: {trees:64,subsample:64,seed:20260924,minimum_wallets:20,minimum_distinct_vectors:3},
  training: 'Unsupervised fit on each saved asset sample; deterministic sorted input and seed. No identity or behavioral labels.',
  evaluation: 'Two disjoint 32-tree ensembles measure computational stability. Their spread is not a confidence interval or predictive accuracy.',
  interpretation: 'Descriptive indices of observed data. No judgment about a wallet, owner, legality, trustworthiness or creditworthiness.',
  comparability: 'Red depends on the asset, cohort and sampling window. Different runs and networks are not calibrated against each other.',
  graph_semantics: 'For UTXO networks, neighbors are adjacent transactions, not inferred counterparties. Inputs and outputs remain separate; no common ownership inference.',
  amount_precision: 'Original amounts remain exact integer strings. Log10(1 + amount) is a floating-point model feature.',
};

const average = a => a.reduce((s,v)=>s+v,0)/a.length;
const round = n => Math.round(n*100)/100;
const expected = n => n<=1?0:n===2?1:2*(Math.log(n-1)+0.5772156649015329)-2*(n-1)/n;
function generator(seed) {let s=seed>>>0;return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296;};}
function grow(points,depth,limit,random) {
  if(points.length<2||depth>=limit)return {size:points.length};
  const ranges=FEATURES.map((_,j)=>{const a=points.map(p=>p[j]);return [Math.min(...a),Math.max(...a)];});
  const dimensions=ranges.map((r,i)=>r[1]>r[0]?i:-1).filter(i=>i>=0);
  if(!dimensions.length)return {size:points.length};
  const dimension=dimensions[Math.floor(random()*dimensions.length)], [min,max]=ranges[dimension];
  const cut=min+(max-min)*(0.0000001+random()*0.9999998);
  return {dimension,cut,left:grow(points.filter(p=>p[dimension]<cut),depth+1,limit,random),right:grow(points.filter(p=>p[dimension]>=cut),depth+1,limit,random)};
}
function path(tree,point,depth=0) {return tree.size!==undefined?depth+expected(tree.size):path(point[tree.dimension]<tree.cut?tree.left:tree.right,point,depth+1);}

export function isolationForest(rows) {
  const points=rows.map(row=>FEATURES.map(f=>row[f]));
  if(points.length<20||new Set(points.map(p=>JSON.stringify(p))).size<3)return {available:false,reason:'At least 20 wallets and three distinct feature vectors are required.',scores:[]};
  const size=Math.min(points.length,64),random=generator(20260924),forest=[];
  for(let t=0;t<64;t++){
    const sample=points.slice();for(let i=0;i<size;i++){const j=i+Math.floor(random()*(sample.length-i));[sample[i],sample[j]]=[sample[j],sample[i]];}
    forest.push(grow(sample.slice(0,size),0,Math.ceil(Math.log2(size)),random));
  }
  return {available:true,trees:64,sample_size:size,seed:20260924,scores:points.map(point=>{
    const lengths=forest.map(tree=>path(tree,point)), c=expected(size), a=100*2**(-average(lengths.slice(0,32))/c),b=100*2**(-average(lengths.slice(32))/c);
    return {red:round(100*2**(-average(lengths)/c)),ensemble_spread:round(Math.abs(a-b))};
  })};
}

export function scoreGraph(graph) {
  const ids=new Set(graph.nodes.map(n=>n.id));
  if(ids.size!==graph.nodes.length||graph.nodes.length>1200||graph.edges.length>4000)throw new Error('invalid_graph');
  const wallets=new Map(graph.nodes.filter(n=>n.kind==='address'||n.kind==='script_hash').map(n=>[n.id,{node:n,incoming:0,outgoing:0,inAmount:0n,outAmount:0n,neighbors:new Map(),blocks:new Set(),events:0,complete:[0,0,0,0]}]));
  const seen=new Set();
  for(const e of graph.edges){
    if(!ids.has(e.from)||!ids.has(e.to)||typeof e.event_id!=='string'||seen.has(e.event_id)||!/^(0|[1-9][0-9]{0,77})$/.test(e.amount_base_units))throw new Error('invalid_graph');
    seen.add(e.event_id);
    for(const [id,other,incoming] of [[e.to,e.from,true],[e.from,e.to,false]]){
      const w=wallets.get(id);if(!w)continue;
      if(incoming){w.incoming++;w.inAmount+=BigInt(e.amount_base_units);}else{w.outgoing++;w.outAmount+=BigInt(e.amount_base_units);}
      w.events++;w.neighbors.set(other,(w.neighbors.get(other)||0)+1);
      if(Number.isSafeInteger(e.block_number)&&e.block_number>=0)w.blocks.add(e.block_number);
      const evidence=[Number.isSafeInteger(e.block_number)&&e.block_number>=0&&/^(0x)?[a-f0-9]{64}$/i.test(e.block_hash||''),Boolean(e.txid&&e.event_id),true,typeof e.block_time==='string'&&Number.isFinite(Date.parse(e.block_time))];
      evidence.forEach((ok,i)=>{if(ok)w.complete[i]++;});
    }
  }
  const rows=[...wallets.values()].filter(w=>w.events>0).sort((a,b)=>a.node.id.localeCompare(b.node.id,'en')).map(w=>{
    const components=w.complete.map(n=>n/w.events),features={log_in_events:Math.log1p(w.incoming),log_out_events:Math.log1p(w.outgoing),log_neighbors:Math.log1p(w.neighbors.size),
      log_in_amount:Math.log10(Number(w.inAmount)+1),log_out_amount:Math.log10(Number(w.outAmount)+1),direction_balance:(w.incoming-w.outgoing)/w.events,
      neighbor_concentration:[...w.neighbors.values()].reduce((s,n)=>s+(n/w.events)**2,0),log_active_blocks:Math.log1p(w.blocks.size)};
    return {id:w.node.id,address:w.node.address,kind:w.node.kind,incoming_events:w.incoming,outgoing_events:w.outgoing,neighbors:w.neighbors.size,active_blocks:w.blocks.size,
      incoming_base_units:String(w.inAmount),outgoing_base_units:String(w.outAmount),features,blue:round(100*components.reduce((s,c,i)=>s+c*[.30,.25,.25,.20][i],0)),blue_components:components};
  });
  const vectors=rows.map(r=>r.features),forest=isolationForest(vectors),groups=cluster(vectors,FEATURES),stats=FEATURES.map(f=>{const s=describe(vectors.map(v=>v[f]));if(s.std!==null&&s.std<=1e-12*Math.max(1,Math.abs(s.mean)))s.std=0;return s;});
  const labels=new Map((groups.labels||[]).map(x=>[x.index,x.cluster]));
  rows.forEach((row,i)=>{
    Object.assign(row,forest.available?forest.scores[i]:{red:null,ensemble_spread:null},{cluster:labels.get(i)??null});
    row.factors=FEATURES.map((feature,j)=>({feature,value:row.features[feature],cohort_mean:stats[j].mean,standard_deviation:stats[j].std,z:stats[j].std?(row.features[feature]-stats[j].mean)/stats[j].std:0})).sort((a,b)=>Math.abs(b.z)-Math.abs(a.z)).slice(0,3);
  });
  return {model:MODEL_CARD,asset:graph.asset,cohort_size:rows.length,ml:{...forest,scores:undefined},clusters:groups,rows,
    distributions:{red:histogram(rows.map(r=>r.red)),blue:histogram(rows.map(r=>r.blue))},statistics:{red:describe(rows.map(r=>r.red)),blue:describe(rows.map(r=>r.blue))},
    correlation:{features:FEATURES,matrix:FEATURES.map((a,i)=>FEATURES.map((b,j)=>stats[i].std&&stats[j].std?correlation(vectors.map(v=>v[a]),vectors.map(v=>v[b])):null))},
    factor_note:'Factors describe standardized feature differences from the cohort; they are not causal explanations or feature attributions of the forest.'};
}
