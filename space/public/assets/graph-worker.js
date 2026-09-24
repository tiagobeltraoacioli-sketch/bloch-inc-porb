import {analyzeGraph} from './graph-core.js';
let generation=0;
self.onmessage=async({data})=>{
  const token=++generation,{graph,layout,id}=data,stats=analyzeGraph(graph);postMessage({id,type:'stats',stats});
  const list=graph.nodes.map((n,i)=>{const angle=i*2.39996323,radius=20+Math.sqrt(i)*18;return {id:n.id,x:Math.cos(angle)*radius,y:Math.sin(angle)*radius,vx:0,vy:0};}),index=new Map(list.map((n,i)=>[n.id,i]));
  const pairs=graph.edges.map(e=>[index.get(e.from),index.get(e.to)]),ranks=new Map(stats.ranking.map(n=>[n.id,n]));
  const send=(done=false)=>postMessage({id,type:'positions',positions:list.map(n=>({id:n.id,x:n.x,y:n.y})),done});
  if(layout==='timeline'){
    const heights=new Map();for(const e of graph.edges)if(e.block.height!=null)for(const at of [e.from,e.to])heights.set(at,Math.min(heights.get(at)??Infinity,e.block.height));
    const blocks=[...new Set(heights.values())].sort((a,b)=>a-b),lanes=new Map();
    list.forEach(n=>{const h=heights.get(n.id),position=h==null?blocks.length:blocks.indexOf(h),lane=lanes.get(position)||0;lanes.set(position,lane+1);n.x=position*130;n.y=(lane%2?1:-1)*Math.ceil(lane/2)*34;});send(true);return;
  }
  if(layout==='radial'){
    const groups=new Map();for(const n of list){const c=ranks.get(n.id).component;if(!groups.has(c))groups.set(c,[]);groups.get(c).push(n);}
    [...groups.values()].forEach((nodes,c)=>{const angle=c*2.39996323,d=Math.sqrt(c)*480;nodes.forEach((n,i)=>{const a=i*2*Math.PI/nodes.length,r=nodes.length===1?0:Math.max(90,nodes.length*7);n.x=Math.cos(angle)*d+Math.cos(a)*r;n.y=Math.sin(angle)*d+Math.sin(a)*r;});});send(true);return;
  }
  const steps=list.length>2000?95:150;
  for(let step=0;step<steps;step++){
    if(token!==generation)return;
    const cells=new Map(),size=90;for(const n of list){const key=`${Math.floor(n.x/size)},${Math.floor(n.y/size)}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(n);}
    for(const n of list){const cx=Math.floor(n.x/size),cy=Math.floor(n.y/size);for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(const other of cells.get(`${cx+x},${cy+y}`)||[]){if(n===other)continue;let dx=n.x-other.x,dy=n.y-other.y,d2=dx*dx+dy*dy+12;if(d2<.001)dx=.1;const f=140/d2;n.vx+=dx*f;n.vy+=dy*f;}n.vx-=n.x*.0009;n.vy-=n.y*.0009;}
    for(const [a,b]of pairs){const one=list[a],two=list[b],dx=two.x-one.x,dy=two.y-one.y,d=Math.hypot(dx,dy)||1,f=(d-70)/d*.012;one.vx+=dx*f;one.vy+=dy*f;two.vx-=dx*f;two.vy-=dy*f;}
    const cooling=1-step/steps*.7;for(const n of list){n.x+=Math.max(-12,Math.min(12,n.vx))*cooling;n.y+=Math.max(-12,Math.min(12,n.vy))*cooling;n.vx*=.48;n.vy*=.48;}
    if(step%15===0){send();await new Promise(resolve=>setTimeout(resolve,0));}
  }
  send(true);
};
