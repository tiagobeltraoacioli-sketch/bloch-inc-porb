// Public-chain evidence graph. References are not owners; paths are not traced funds.
export const LIMITS=Object.freeze({nodes:5000,edges:12000,observations:200});
export const ASSETS={BTC:{network:'bitcoin',decimals:8},BLCH:{network:'bloch',decimals:8},ETH:{network:'ethereum',decimals:18},USDT:{network:'ethereum',decimals:6},USDC:{network:'ethereum',decimals:6}};
const hash=/^[a-f0-9]{64}$/,ethHash=/^0x[a-f0-9]{64}$/,ethAddress=/^0x[a-f0-9]{40}$/;
export const validReference=(network,kind,value)=>typeof value==='string'&&(kind==='transaction'?(network==='ethereum'?ethHash:hash).test(value):network==='bloch'?hash.test(value):network==='ethereum'?ethAddress.test(value):/^(?:[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[ac-hj-np-z02-9]{11,87})$/.test(value));
export const nodeId=(network,kind,reference)=>`${network}:${kind}:${reference}`;
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const amount=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,99})$/.test(v);
const text=(v,n)=>typeof v==='string'&&v.length>0&&v.length<=n;
const fail=message=>{throw new Error(message);};
export function emptyGraph(network='bloch',asset='BLCH'){return {schema:'bloch-space-graph/1',network,asset,nodes:[],edges:[],observations:[],warnings:[],cursors:[]};}
export function validateGraph(raw){
  if(raw?.schema!=='bloch-space-graph/1'||!Object.hasOwn(ASSETS,raw.asset)||ASSETS[raw.asset].network!==raw.network)fail('Unsupported graph network or asset.');
  for(const key of ['nodes','edges','observations'])if(!Array.isArray(raw[key])||raw[key].length>LIMITS[key])fail(`Graph exceeds ${LIMITS[key]} ${key}.`);
  const observations=raw.observations.map(o=>{
    if(!text(o.id,180)||!text(o.source,200)||!text(o.at,40)||!Number.isFinite(Date.parse(o.at))||!text(o.scope,2000)||o.anchor!=null&&JSON.stringify(o.anchor).length>4000)fail('Invalid source observation.');
    return {id:o.id,source:o.source,at:o.at,scope:o.scope,anchor:o.anchor??null};
  });
  const sources=new Set(observations.map(o=>o.id));if(sources.size!==observations.length)fail('Duplicate source observation.');
  const nodes=raw.nodes.map(n=>{
    if(!['address','script','transaction'].includes(n?.kind)||!validReference(raw.network,n.kind,n.reference)||n.id!==nodeId(raw.network,n.kind,n.reference)||raw.network==='bloch'&&n.kind==='address'||raw.network!=='bloch'&&n.kind==='script')fail('Invalid chain reference.');
    return {id:n.id,kind:n.kind,reference:n.reference};
  });
  const ids=new Map(nodes.map(n=>[n.id,n]));if(ids.size!==nodes.length)fail('Duplicate graph reference.');
  const kinds=raw.network==='ethereum'?['native_value','executed_transaction','erc20_transfer']:['input','output'];
  const edgeIds=new Set(),transactionAnchors=new Map(),blockHashes=new Map();
  const edges=raw.edges.map(e=>{
    if(!text(e?.id,350)||edgeIds.has(e.id)||!ids.has(e.from)||!ids.has(e.to)||!kinds.includes(e.kind)||!amount(e.amount)||!validReference(raw.network,'transaction',e.txid))fail('Invalid evidence edge.');
    if(raw.network==='ethereum'&&(['USDT','USDC'].includes(raw.asset)?e.kind!=='erc20_transfer':e.kind==='erc20_transfer'))fail('Asset and edge type disagree.');
    if(raw.network!=='ethereum'&&(e.kind==='input'?(ids.get(e.from).kind==='transaction'||ids.get(e.to).kind!=='transaction'):(ids.get(e.from).kind!=='transaction'||ids.get(e.to).kind==='transaction')))fail('UTXO edges must retain the transaction boundary.');
    if(raw.network!=='ethereum'&&ids.get(e.kind==='input'?e.to:e.from).reference!==e.txid)fail('The edge transaction does not match its transaction node.');
    if(raw.network==='ethereum'&&(ids.get(e.from).kind!=='address'||ids.get(e.to).kind!=='address'))fail('Ethereum transfer endpoints must be addresses.');
    if(!Array.isArray(e.sources)||!e.sources.length||e.sources.some(s=>!sources.has(s)))fail('Missing edge provenance.');
    const b=e.block||{};
    if(b.height!=null&&!integer(b.height)||b.hash!=null&&!(raw.network==='ethereum'?ethHash:hash).test(b.hash)||b.index!=null&&!integer(b.index)||b.log!=null&&!integer(b.log))fail('Invalid edge anchor.');
    const previous=transactionAnchors.get(e.txid)||{};
    if(['height','hash','index'].some(k=>b[k]!=null&&previous[k]!=null&&b[k]!==previous[k]))fail('Conflicting transaction anchors.');
    transactionAnchors.set(e.txid,Object.fromEntries(['height','hash','index'].map(k=>[k,b[k]??previous[k]])));
    if(b.height!=null&&b.hash!=null){if(blockHashes.has(b.height)&&blockHashes.get(b.height)!==b.hash)fail('Conflicting block anchors. Start a separate workspace for another chain view.');blockHashes.set(b.height,b.hash);}
    edgeIds.add(e.id);
    return {id:e.id,from:e.from,to:e.to,kind:e.kind,amount:e.amount,txid:e.txid,sources:[...new Set(e.sources)],block:{height:b.height??null,hash:b.hash??null,index:b.index??null,log:b.log??null},finality:typeof e.finality==='string'?e.finality.slice(0,120):'source-reported'};
  });
  return {...emptyGraph(raw.network,raw.asset),nodes,edges,observations,warnings:Array.isArray(raw.warnings)?raw.warnings.filter(w=>typeof w==='string').slice(0,100).map(w=>w.slice(0,1000)):[],
    cursors:Array.isArray(raw.cursors)?raw.cursors.filter(c=>c&&validReference(raw.network,'address',c.query)&&typeof c.cursor==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(c.cursor)).slice(0,100).map(c=>({query:c.query,cursor:c.cursor})):[]};
}
export function mergeGraph(current,packet){
  const a=validateGraph(current),b=validateGraph(packet);
  if(a.asset!==b.asset||a.network!==b.network)fail('Start a separate workspace for another asset or network.');
  const nodes=new Map(a.nodes.map(n=>[n.id,n])),edges=new Map(a.edges.map(e=>[e.id,e])),observations=new Map(a.observations.map(o=>[o.id,o]));
  for(const n of b.nodes)nodes.set(n.id,n);
  for(const o of b.observations){if(observations.has(o.id)&&JSON.stringify(observations.get(o.id))!==JSON.stringify(o))fail('Conflicting observation identifier.');observations.set(o.id,o);}
  for(const e of b.edges){
    const old=edges.get(e.id);
    if(!old){edges.set(e.id,e);continue;}
    if(['from','to','kind','amount','txid'].some(k=>old[k]!==e[k])||['height','hash','index','log'].some(k=>old.block[k]!=null&&e.block[k]!=null&&old.block[k]!==e.block[k]))fail('Conflicting event evidence. Start a new workspace to inspect the changed source.');
    edges.set(e.id,{...old,sources:[...new Set([...old.sources,...e.sources])],block:Object.fromEntries(Object.keys(old.block).map(k=>[k,old.block[k]??e.block[k]]))});
  }
  const result={...a,nodes:[...nodes.values()],edges:[...edges.values()],observations:[...observations.values()],warnings:[...new Set([...a.warnings,...b.warnings])],cursors:b.cursors};
  return validateGraph(result); // Capacity checks happen before the caller mutates its workspace.
}
export function parseAmount(value,asset){
  if(!Object.hasOwn(ASSETS,asset)||typeof value!=='string'||!/^\d{1,70}(?:\.\d{1,18})?$/.test(value))fail('Use a nonnegative decimal amount.');
  const [whole,fraction='']=value.split('.'),d=ASSETS[asset].decimals;
  if(fraction.length>d)fail(`Use at most ${d} decimal places for ${asset}.`);
  return (BigInt(whole)*10n**BigInt(d)+BigInt(fraction.padEnd(d,'0')||'0')).toString();
}
export function formatAmount(value,asset){const d=ASSETS[asset].decimals,n=BigInt(value),base=10n**BigInt(d),part=(n%base).toString().padStart(d,'0').replace(/0+$/,'');return `${(n/base).toLocaleString('en-US')}${part?'.'+part:''}`;}
export function filterGraph(graph,{minimum='0',kind='all',minBlock=null,maxBlock=null,focus=null,hops=0,direction='both'}={}){
  if(!amount(minimum))fail('Invalid amount filter.');
  let edges=graph.edges.filter(e=>BigInt(e.amount)>=BigInt(minimum)&&(kind==='all'||e.kind===kind)&&(minBlock==null||e.block.height!=null&&e.block.height>=minBlock)&&(maxBlock==null||e.block.height!=null&&e.block.height<=maxBlock));
  if(focus&&hops>0){const found=new Set([focus]);let frontier=new Set([focus]);for(let i=0;i<Math.min(hops,3);i++){const next=new Set();for(const e of edges){if(direction!=='incoming'&&frontier.has(e.from))next.add(e.to);if(direction!=='outgoing'&&frontier.has(e.to))next.add(e.from);}frontier=new Set([...next].filter(n=>!found.has(n)));for(const id of next)found.add(id);}edges=edges.filter(e=>found.has(e.from)&&found.has(e.to));const used=new Set(edges.flatMap(e=>[e.from,e.to]));used.add(focus);return {...graph,nodes:graph.nodes.filter(n=>used.has(n.id)),edges};}
  const active=minimum!=='0'||kind!=='all'||minBlock!=null||maxBlock!=null,used=new Set(edges.flatMap(e=>[e.from,e.to]));
  return {...graph,edges,nodes:active?graph.nodes.filter(n=>used.has(n.id)):graph.nodes};
}
export function analyzeGraph(graph){
  const adjacency=new Map(graph.nodes.map(n=>[n.id,new Set()])),out=new Map(graph.nodes.map(n=>[n.id,new Set()])),incoming=new Map(graph.nodes.map(n=>[n.id,new Set()]));
  const counts=new Map(graph.nodes.map(n=>[n.id,{...n,incoming:0,outgoing:0}])),types=new Map(),timeline=new Map();
  for(const e of graph.edges){counts.get(e.from).outgoing++;counts.get(e.to).incoming++;out.get(e.from).add(e.to);incoming.get(e.to).add(e.from);if(e.from!==e.to){adjacency.get(e.from).add(e.to);adjacency.get(e.to).add(e.from);}const t=types.get(e.kind)||{kind:e.kind,count:0,amount:0n};t.count++;t.amount+=BigInt(e.amount);types.set(e.kind,t);if(e.block.height!=null)timeline.set(e.block.height,(timeline.get(e.block.height)||0)+1);}
  let component=0;const seen=new Set(),sizes=[];
  for(const n of graph.nodes){if(seen.has(n.id))continue;const stack=[n.id];seen.add(n.id);let size=0;while(stack.length){const id=stack.pop();counts.get(id).component=component;size++;for(const next of adjacency.get(id))if(!seen.has(next)){seen.add(next);stack.push(next);}}sizes.push(size);component++;}
  // Iterative Kosaraju avoids call-stack limits in long imported chains.
  const visited=new Set(),order=[];
  for(const n of graph.nodes){if(visited.has(n.id))continue;const stack=[[n.id,false]];while(stack.length){const [id,done]=stack.pop();if(done){order.push(id);continue;}if(visited.has(id))continue;visited.add(id);stack.push([id,true]);for(const next of out.get(id))if(!visited.has(next))stack.push([next,false]);}}
  visited.clear();let cycleGroups=0;
  for(const id of order.reverse()){if(visited.has(id))continue;const group=[],stack=[id];visited.add(id);while(stack.length){const at=stack.pop();group.push(at);for(const next of incoming.get(at))if(!visited.has(next)){visited.add(next);stack.push(next);}}if(group.length>1||out.get(id).has(id)){cycleGroups++;for(const at of group)counts.get(at).cycleGroup=cycleGroups;}}
  const degree=new Map([...adjacency].map(([id,links])=>[id,links.size])),alive=new Set(degree.keys());let core=0;
  while(alive.size){let minimum=Infinity,target=null;for(const id of alive)if(degree.get(id)<minimum){minimum=degree.get(id);target=id;}core=Math.max(core,minimum);counts.get(target).core=core;alive.delete(target);for(const next of adjacency.get(target))if(alive.has(next))degree.set(next,degree.get(next)-1);}
  const n=graph.nodes.length;let ranks=new Map(graph.nodes.map(x=>[x.id,1/Math.max(n,1)]));
  for(let i=0;i<40&&n;i++){let dangling=0;for(const [id,links] of out)if(!links.size)dangling+=ranks.get(id);const next=new Map(graph.nodes.map(x=>[x.id,.15/n+.85*dangling/n]));for(const [id,links]of out)for(const to of links)next.set(to,next.get(to)+.85*ranks.get(id)/links.size);const delta=[...next].reduce((s,[id,v])=>s+Math.abs(v-ranks.get(id)),0);ranks=next;if(delta<1e-9)break;}
  const histogram=new Map();for(const c of counts.values()){c.degree=adjacency.get(c.id).size;c.rank=ranks.get(c.id)||0;histogram.set(c.degree,(histogram.get(c.degree)||0)+1);}
  return {nodes:n,edges:graph.edges.length,components:component,componentSizes:sizes,cycleGroups,maxCore:core,ranking:[...counts.values()].sort((a,b)=>b.degree-a.degree||a.id.localeCompare(b.id)),types:[...types.values()].map(t=>({...t,amount:t.amount.toString()})),timeline:[...timeline].sort((a,b)=>a[0]-b[0]),histogram:[...histogram].sort((a,b)=>a[0]-b[0])};
}
function follows(previous,next){
  if(next.block.height==null)return false;if(!previous)return true;
  if(next.block.height!==previous.block.height)return next.block.height>previous.block.height;
  if(next.txid===previous.txid)return previous.block.log==null||next.block.log==null||next.block.log>=previous.block.log;
  return next.block.index!=null&&previous.block.index!=null&&next.block.index>previous.block.index;
}
export function findPaths(graph,from,to,{maxHops=6,temporal=false,maxPaths=5,budget=20000}={}){
  if(!Number.isInteger(maxHops)||maxHops<1||maxHops>8)fail('Choose one to eight edges.');
  const out=new Map(graph.nodes.map(n=>[n.id,[]]));for(const e of graph.edges)out.get(e.from).push(e);
  if(!out.has(from)||!out.has(to))return {paths:[],truncated:false,examined:0};
  const queue=[{id:from,path:[],visited:new Set([from])}],paths=[];let cursor=0,examined=0,truncated=false;
  while(cursor<queue.length&&paths.length<maxPaths){const current=queue[cursor++];if(current.path.length>=maxHops)continue;for(const e of out.get(current.id)){
    if(++examined>budget){truncated=true;break;}
    if(temporal&&!follows(current.path.at(-1),e))continue;
    const path=[...current.path,e];if(e.to===to){paths.push(path);if(paths.length===maxPaths)break;continue;}
    if(current.visited.has(e.to))continue;
    if(queue.length>=5000){truncated=true;continue;}
    queue.push({id:e.to,path,visited:new Set([...current.visited,e.to])});
  }if(examined>budget)break;}
  return {paths,truncated:truncated||paths.length===maxPaths,examined};
}
export function compareGraphs(before,after){
  if(before.network!==after.network||before.asset!==after.asset)fail('Snapshots must use the same network and asset.');
  const old=new Map(before.edges.map(e=>[e.id,e])),current=new Map(after.edges.map(e=>[e.id,e]));
  return {added:after.edges.filter(e=>!old.has(e.id)).map(e=>e.id),removed:before.edges.filter(e=>!current.has(e.id)).map(e=>e.id),changed:after.edges.filter(e=>old.has(e.id)&&(e.amount!==old.get(e.id).amount||e.block.hash!==old.get(e.id).block.hash)).map(e=>e.id),note:'Changes between the two loaded workspaces, not proof of a chain reorganization or complete activity.'};
}
export function evidenceCSV(graph){const rows=[['network','asset','event_id','from','to','kind','amount_base_units','transaction','block_height','block_hash','source_observations'],...graph.edges.map(e=>[graph.network,graph.asset,e.id,e.from,e.to,e.kind,e.amount,e.txid,e.block.height??'',e.block.hash??'',e.sources.join('|')])];return rows.map(r=>r.map(v=>{const s=String(v);return '"'+(/^[=+@\-\t\r]/.test(s)?"'":'')+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');}
export function graphML(graph){const escape=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');return '<?xml version="1.0" encoding="UTF-8"?><graphml xmlns="http://graphml.graphdrawing.org/xmlns">'+['kind','reference','amount','txid','sources','block_height','block_hash','asset'].map(k=>`<key id="${k}" for="all" attr.name="${k}" attr.type="string"/>`).join('')+'<graph id="'+escape(graph.network)+'" edgedefault="directed">'+graph.nodes.map(n=>`<node id="${escape(n.id)}"><data key="kind">${n.kind}</data><data key="reference">${escape(n.reference)}</data></node>`).join('')+graph.edges.map(e=>`<edge id="${escape(e.id)}" source="${escape(e.from)}" target="${escape(e.to)}">`+Object.entries({kind:e.kind,amount:e.amount,txid:e.txid,sources:e.sources.join('|'),block_height:e.block.height??'',block_hash:e.block.hash??'',asset:graph.asset}).map(([k,v])=>`<data key="${k}">${escape(v)}</data>`).join('')+'</edge>').join('')+'</graph></graphml>';}
