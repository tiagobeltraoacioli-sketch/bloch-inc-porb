const PAGE = 20, NODE_LIMIT = 160;
const label = node => node.address || node.txid;
const short = value => value.length > 30 ? `${value.slice(0,14)}…${value.slice(-10)}` : value;
const nodeLabel = node => `${node.kind.replaceAll('_',' ')} · ${label(node)}`;
const el = (tag, text, cls) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
const svg = (tag, attrs = {}) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key,value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};
function button(text, action, cls = 'secondary') {
  const node = el('button', text, cls); node.type = 'button'; node.onclick = action; return node;
}
function link(text, href) {
  const node = el('a', text); node.href = href; node.target = '_blank'; node.rel = 'noopener noreferrer'; return node;
}
function caseSensitive(value, asset) {
  // Legacy Bitcoin base58 references are case-sensitive. Hex and bech32 are not.
  return asset === 'BTC' && !/^(bc1|[a-f0-9]{64}$)/i.test(value);
}
export function searchGraph(graph, query) {
  const raw = query.trim();
  const matches = value => caseSensitive(value,graph.asset) ? value.includes(raw) : value.toLowerCase().includes(raw.toLowerCase());
  const exact = value => caseSensitive(value,graph.asset) ? value === raw : value.toLowerCase() === raw.toLowerCase();
  const nodes = graph.nodes.filter(node => matches(label(node))).sort((a,b) => Number(exact(label(b))) - Number(exact(label(a))) || label(a).localeCompare(label(b)));
  // Account-chain transaction hashes occur on records, without transaction nodes.
  const transactions = raw ? [...new Set(graph.edges.map(edge => edge.txid))].filter(txid => matches(txid) && !nodes.some(node => node.txid === txid)) : [];
  return [...nodes.map(node => ({type:'node', id:node.id, reference:label(node), kind:node.kind})), ...transactions.map(txid => ({type:'transaction', id:txid, reference:txid, kind:'transaction'}))];
}
export function queryLinks(asset, reference, kind = 'address') {
  const valid = kind === 'transaction' ? /^(0x)?[a-f0-9]{64}$/i.test(reference)
    : asset === 'BTC' ? /^(bc1[ac-hj-np-z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/i.test(reference)
      : asset === 'BLCH' ? /^[a-f0-9]{64}$/i.test(reference) : /^0x[a-f0-9]{40}$/i.test(reference);
  if (!valid) return [];
  if (kind === 'transaction') return [['Open transaction source ↗', `${asset === 'BTC' ? 'https://blockstream.info' : asset === 'BLCH' ? 'https://blochl1.com' : 'https://etherscan.io'}/tx/${reference}`]];
  const query = new URLSearchParams({asset:asset.toLowerCase(), address:reference});
  return [['Query address in Graphus ↗', `https://bloch-graphus.xyz/constellation.html?${query}`], ['Query balance in Oculum ↗', `https://bloch-graphus.xyz/oculum.html?${query}`]];
}
export function visibleGraph(graph, selection, neighborhood = false, limit = NODE_LIMIT) {
  const degree = new Map(), required = new Set();
  let related = [];
  if (selection?.type === 'node') {
    required.add(selection.id);
    related = graph.edges.filter(e => e.from === selection.id || e.to === selection.id);
  } else if (selection?.type === 'transaction') related = graph.edges.filter(e => e.txid === selection.id);
  else if (selection?.type === 'connection') related = graph.edges.filter(e => e.from === selection.from && e.to === selection.to);
  for (const edge of related) { required.add(edge.from); required.add(edge.to); }
  for (const edge of graph.edges) {
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
  }
  const candidates = graph.nodes.filter(n => !neighborhood || !selection || required.has(n.id));
  const nodes = candidates.sort((a,b) => Number(b.id === selection?.id) - Number(a.id === selection?.id) || Number(required.has(b.id)) - Number(required.has(a.id)) || (degree.get(b.id)||0) - (degree.get(a.id)||0) || a.id.localeCompare(b.id)).slice(0,limit);
  const ids = new Set(nodes.map(n => n.id)), groups = new Map();
  for (const edge of graph.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) continue;
    const key = `${edge.from}\n${edge.to}`;
    if (!groups.has(key)) groups.set(key, {from:edge.from,to:edge.to,records:[]});
    groups.get(key).records.push(edge);
  }
  const connections = [...groups.values()].sort((a,b) => Number(required.has(b.from)||required.has(b.to)) - Number(required.has(a.from)||required.has(a.to))).slice(0,600);
  return {nodes,connections,degree,required,candidates:candidates.length};
}

export class GraphExplorer {
  constructor(host, onNode) {
    this.host = host; this.onNode = onNode; this.analysis = null; this.selection = null;
    host.innerHTML = `<div class="panel-heading"><div><p class="eyebrow">INTERACTIVE SOURCE GRAPH</p><h2>Explore references & connections</h2></div><button type="button" id="graph-reset" class="secondary">Reset view</button></div>
      <form id="graph-search-form" class="graph-search"><label>Search an address, script or transaction<input id="graph-search" type="search" maxlength="200" autocomplete="off" spellcheck="false" placeholder="Paste a public reference or part of one" aria-describedby="graph-search-note"></label><button type="submit">Find reference</button></form>
      <p id="graph-search-note" class="subtle">Search covers this saved sample. Query Graphus to inspect another public address.</p>
      <div id="graph-query-links" class="graph-actions"></div><div id="graph-search-results" class="graph-results"></div><div id="graph-search-pages" class="graph-actions"></div>
      <div class="graph-tools"><label class="check"><input id="graph-neighborhood" type="checkbox">Selected neighborhood</label><button id="graph-zoom-out" type="button" class="secondary" aria-label="Zoom graph out">−</button><button id="graph-zoom-in" type="button" class="secondary" aria-label="Zoom graph in">+</button><button id="graph-fit" type="button" class="secondary">Fit</button></div>
      <div class="graph-layout"><div><svg id="graph-chart" viewBox="0 0 720 420" role="group" aria-label="Interactive observed network" aria-describedby="graph-note"></svg><p id="graph-note" class="subtle"></p><p class="subtle">Select a point or arrow. Drag the background to pan; use + / − to zoom. Circles: wallet/script. Diamonds: transaction. Arrows: recorded direction.</p></div><aside id="graph-inspector" class="graph-inspector" aria-label="Selected reference details"><p>Select a graph item or search for a reference.</p></aside></div>
      <section id="graph-records" hidden><div class="panel-heading"><h3>Selected source records</h3><label>Direction<select id="graph-direction"><option value="all">All records</option><option value="in">Incoming</option><option value="out">Outgoing</option></select></label></div><p id="graph-record-count" class="subtle" role="status"></p><div class="table-wrap"><table><thead><tr><th>Block / transaction</th><th>Origin → destination</th><th>Record type</th><th>Exact base units</th><th>Evidence</th></tr></thead><tbody id="graph-ledger"></tbody></table></div><div id="graph-record-pages" class="graph-actions"></div><div id="graph-event-detail" class="detail" hidden></div></section>
      <p id="graph-announcement" class="subtle" role="status" aria-live="polite"></p>`;
    this.$ = id => host.querySelector(`#${id}`);
    this.$('graph-search').oninput = () => { this.searchPage = 0; this.search(); };
    this.$('graph-search-form').onsubmit = event => {
      event.preventDefault(); this.searchPage = 0; const rows = this.search();
      if (rows.length) this.choose(rows[0]);
    };
    this.$('graph-reset').onclick = () => this.load(this.analysis);
    this.$('graph-neighborhood').onchange = () => this.draw();
    this.$('graph-direction').onchange = () => { this.recordPage = 0; this.records(); };
    this.$('graph-fit').onclick = () => this.fit();
    this.$('graph-zoom-in').onclick = () => this.zoom(.75);
    this.$('graph-zoom-out').onclick = () => this.zoom(1.333333);
    const chart = this.$('graph-chart');
    chart.addEventListener('pointerdown', event => {
      if (event.target.closest('[role=button]')) return;
      this.drag = {x:event.clientX,y:event.clientY,box:[...this.box]}; chart.setPointerCapture(event.pointerId);
    });
    chart.addEventListener('pointermove', event => {
      if (!this.drag) return;
      const rect=chart.getBoundingClientRect(), scale=Math.min(rect.width/this.box[2],rect.height/this.box[3]);
      this.box[0]=this.drag.box[0]-(event.clientX-this.drag.x)/scale;
      this.box[1]=this.drag.box[1]-(event.clientY-this.drag.y)/scale; this.viewport();
    });
    chart.addEventListener('pointerup', () => this.drag=null);
    chart.addEventListener('pointercancel', () => this.drag=null);
  }
  clear() {
    this.analysis=null; this.selection=null; this.host.hidden=true;
    for (const id of ['graph-chart','graph-inspector','graph-ledger','graph-event-detail','graph-search-results','graph-query-links']) this.$(id).replaceChildren();
  }
  load(analysis) {
    if (!analysis) { this.clear(); return; }
    this.analysis=analysis; this.host.hidden=false; this.selection=null; this.searchPage=this.recordPage=0;
    this.$('graph-search').value=''; this.$('graph-neighborhood').checked=false; this.$('graph-direction').value='all';
    this.$('graph-inspector').replaceChildren(el('p','Select a graph item or search for a reference.'));
    this.$('graph-announcement').textContent=''; this.$('graph-records').hidden=true;
    this.search(); this.draw(); this.fit(); this.onNode(null);
  }
  search() {
    if (!this.analysis) return [];
    const query=this.$('graph-search').value.trim(), results=searchGraph(this.analysis.graph,query);
    this.$('graph-search-results').replaceChildren(...results.slice(this.searchPage*PAGE,(this.searchPage+1)*PAGE).map(row => {
      const b=button(`${short(row.reference)} · ${row.kind.replaceAll('_',' ')}`,()=>this.choose(row)); b.title=row.reference; return b;
    }));
    this.$('graph-search-note').textContent=results.length ? `${results.length} matching references in this saved sample. Select a result or press Enter to open the first match.` : 'No match in this saved sample. This does not establish absence of activity on the network. Query the public source below or collect another sample.';
    const kind=/^(0x)?[a-f0-9]{64}$/i.test(query)&&this.analysis.asset!=='BLCH'?'transaction':'address';
    this.$('graph-query-links').replaceChildren(...queryLinks(this.analysis.asset,query,kind).map(([text,url])=>link(text,url)));
    this.paginate('graph-search-pages',results.length,this.searchPage,page=>{this.searchPage=page;this.search();});
    return results;
  }
  paginate(id,count,page,action) {
    const pages=Math.max(1,Math.ceil(count/PAGE)), prev=button('← Previous',()=>action(page-1)),next=button('Next →',()=>action(page+1));
    prev.disabled=page===0;next.disabled=page>=pages-1;
    this.$(id).replaceChildren(prev,el('span',`Page ${page+1} / ${pages} · ${count} results`,'subtle'),next);
  }
  selectNode(id) { this.choose({type:'node',id}); }
  choose(selection) {
    if (!this.analysis) return;
    this.selection=selection;this.recordPage=0;this.$('graph-direction').value='all';
    const graph=this.analysis.graph, box=this.$('graph-inspector');box.replaceChildren();
    const node=selection.type==='node'?graph.nodes.find(n=>n.id===selection.id):null;
    if (node) {
      box.append(el('p','SELECTED REFERENCE','eyebrow'),el('h3',label(node)),el('p',node.kind.replaceAll('_',' ')));
      const row=this.analysis.scores.rows.find(r=>r.id===node.id);
      if(row)box.append(el('p',`Red ${row.red===null?'unavailable':row.red.toFixed(2)} · Blue ${row.blue.toFixed(2)}`),el('p',`${row.incoming_events} incoming · ${row.outgoing_events} outgoing · ${row.neighbors} adjacent references`),button('View score factors',()=>{const detail=document.getElementById('wallet-detail');detail.scrollIntoView({block:'center'});detail.focus({preventScroll:true});}));
      box.append(button('Copy reference',async()=>{try{await navigator.clipboard.writeText(label(node));this.announce('Reference copied.');}catch{this.announce('Copy unavailable. Select the reference text to copy.');}}));
      for(const [text,url] of queryLinks(this.analysis.asset,label(node),node.kind))box.append(link(text,url));
      this.onNode(row||null);
    } else {
      box.append(el('p',selection.type==='transaction'?'SELECTED TRANSACTION':'SELECTED CONNECTION','eyebrow'));
      if(selection.type==='transaction') {
        box.append(el('h3',selection.id));
        for(const [text,url] of queryLinks(this.analysis.asset,selection.id,'transaction'))box.append(link(text,url));
      } else for(const id of [selection.from,selection.to])box.append(this.referenceButton(id));
      this.onNode(null);
    }
    box.append(el('p',`Source: ${graph.source}`,'subtle'),el('p','Connections describe returned records. UTXO transaction adjacency does not identify an owner or a counterparty.','subtle'));
    this.announce(`Selected ${node?label(node):selection.type==='transaction'?selection.id:'directed connection'}.`);
    this.$('graph-direction').disabled=selection.type!=='node';this.records();this.draw();this.fit();
  }
  announce(text) { this.$('graph-announcement').textContent=text; }
  referenceButton(id) {
    const node=this.analysis.graph.nodes.find(n=>n.id===id), b=button(short(label(node)),()=>this.selectNode(id),'reference-button');
    b.title=label(node);return b;
  }
  records() {
    const selection=this.selection;if(!selection)return;
    const direction=this.$('graph-direction').value;
    const rows=this.analysis.graph.edges.filter(e=>selection.type==='transaction'?e.txid===selection.id:selection.type==='connection'?e.from===selection.from&&e.to===selection.to:direction==='in'?e.to===selection.id:direction==='out'?e.from===selection.id:e.from===selection.id||e.to===selection.id).sort((a,b)=>b.block_number-a.block_number||a.event_id.localeCompare(b.event_id));
    this.$('graph-records').hidden=false;this.$('graph-event-detail').hidden=true;
    this.$('graph-record-count').textContent=`${rows.length} matching records. Exact integer amounts retain the source asset's base units. Click a transaction or endpoint to explore it.`;
    this.$('graph-ledger').replaceChildren(...rows.slice(this.recordPage*PAGE,(this.recordPage+1)*PAGE).map(e=>{
      const row=el('tr'),tx=el('td',`#${e.block_number}`),txButton=button(short(e.txid),()=>this.choose({type:'transaction',id:e.txid}),'reference-button');txButton.title=e.txid;tx.append(txButton);
      const endpoints=el('td');endpoints.append(this.referenceButton(e.from),el('span',' → '),this.referenceButton(e.to));
      const details=el('td');details.append(button('Inspect record',()=>this.inspect(e)));
      row.append(tx,endpoints,el('td',e.kind.replaceAll('_',' ')),el('td',e.amount_base_units),details);return row;
    }));
    this.paginate('graph-record-pages',rows.length,this.recordPage,page=>{this.recordPage=page;this.records();});
  }
  inspect(edge) {
    const box=this.$('graph-event-detail');box.hidden=false;box.replaceChildren(el('h3','Source record'),el('pre',JSON.stringify({asset:this.analysis.asset,source:this.analysis.graph.source,...edge},null,2)));
    for(const [text,url] of queryLinks(this.analysis.asset,edge.txid,'transaction'))box.append(link(text,url));
    this.announce(`Inspecting record ${edge.event_id}.`);
  }
  fit() {this.box=[0,0,720,420];this.viewport();}
  viewport() {this.$('graph-chart').setAttribute('viewBox',this.box.join(' '));}
  zoom(factor) {
    const width=Math.max(180,Math.min(1440,this.box[2]*factor)),height=width*420/720;
    this.box=[this.box[0]+(this.box[2]-width)/2,this.box[1]+(this.box[3]-height)/2,width,height];this.viewport();
  }
  draw() {
    const graph=this.analysis.graph,view=visibleGraph(graph,this.selection,this.$('graph-neighborhood').checked),chart=this.$('graph-chart');
    const defs=svg('defs'),marker=svg('marker',{id:'graph-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto-start-reverse'});
    marker.append(svg('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#879eaf'}));defs.append(marker);chart.replaceChildren(defs);
    const positions=new Map(view.nodes.map((node,i)=>{const a=i*2.399963229728653,r=Math.sqrt((i+1)/view.nodes.length);return [node.id,{x:360+Math.cos(a)*r*315,y:210+Math.sin(a)*r*170}];}));
    for(const group of view.connections) {
      const a=positions.get(group.from),b=positions.get(group.to),dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy)||1;
      const path=a===b?`M ${a.x-5} ${a.y} C ${a.x-40} ${a.y-45}, ${a.x+40} ${a.y-45}, ${a.x+5} ${a.y}`:`M ${a.x+dx/distance*9} ${a.y+dy/distance*9} Q ${(a.x+b.x)/2-dy*.09} ${(a.y+b.y)/2+dx*.09} ${b.x-dx/distance*10} ${b.y-dy/distance*10}`;
      const active=this.selection?.type==='connection'?group.from===this.selection.from&&group.to===this.selection.to:this.selection?.type==='transaction'?group.records.some(e=>e.txid===this.selection.id):group.from===this.selection?.id||group.to===this.selection?.id;
      const connection=svg('g',{'data-from':group.from,'data-to':group.to,class:`graph-connection${active?' selected':''}`,role:'button',tabindex:0,'aria-label':`${group.records.length} records from ${label(graph.nodes.find(n=>n.id===group.from))} to ${label(graph.nodes.find(n=>n.id===group.to))}`});
      connection.append(svg('path',{d:path,class:'graph-edge-hit'}),svg('path',{d:path,class:'graph-edge','marker-end':'url(#graph-arrow)'}));
      this.activate(connection,()=>this.choose({type:'connection',from:group.from,to:group.to}));chart.append(connection);
    }
    for(const node of view.nodes) {
      const p=positions.get(node.id),r=4+Math.min(5,Math.log1p(view.degree.get(node.id)||0)),selected=node.id===this.selection?.id;
      const group=svg('g',{transform:`translate(${p.x} ${p.y})`,class:`graph-node${selected?' selected':''}${node.kind==='transaction'?' transaction':''}`,'data-node-id':node.id,role:'button',tabindex:0,'aria-label':nodeLabel(node),'aria-pressed':String(selected)});
      group.append(svg('circle',{r:13,class:'graph-node-hit'}));
      group.append(node.kind==='transaction'?svg('path',{d:`M 0 ${-r} L ${r} 0 L 0 ${r} L ${-r} 0 Z`,class:'graph-node-dot'}):svg('circle',{r,class:'graph-node-dot'}));
      const title=svg('title');title.textContent=nodeLabel(node);group.append(title);
      this.activate(group,()=>this.selectNode(node.id));chart.append(group);
    }
    this.$('graph-note').textContent=`${view.nodes.length} / ${view.candidates} references displayed (${graph.nodes.length} in dataset) · ${view.connections.reduce((n,g)=>n+g.records.length,0)} / ${graph.edges.length} records drawn in ${view.connections.length} directed connections. Search and the record list include data beyond the drawing limit.`;
  }
  activate(node,action) {
    node.onclick=action;node.onkeydown=event=>{
      if(event.key==='Enter'||event.key===' '){
        event.preventDefault();action();
        const replacement=[...this.$('graph-chart').querySelectorAll('[role=button]')].find(item=>item.dataset.nodeId===node.dataset.nodeId&&item.dataset.from===node.dataset.from&&item.dataset.to===node.dataset.to);
        replacement?.focus({preventScroll:true});
      }
    };
  }
}
