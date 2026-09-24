(function(root){
  'use strict';
  const A=typeof module!=='undefined'&&module.exports?require('./analytics_engine.js'):root.GraphusAnalytics;
  const MAX_PAGES=32,MAX_NODES=1200,MAX_EDGES=4000;
  function merge(previous,page){
    if(page?.status!=='source-reported'||!page.anchor||!page.source||!page.retrieved_at)throw new Error('Invalid public source snapshot.');
    A.normalize(page);
    if(previous&&(previous.asset!==page.asset||previous.network!==page.network||previous.source!==page.source))throw new Error('Cannot mix different assets, networks or sources.');
    const old=previous?.snapshots||[],snapshots=[...old],nodes=new Map((previous?.nodes||[]).map(n=>[n.id,n])),edges=new Map((previous?.edges||[]).map(e=>[e.event_id,e]));
    const hashes=new Map();
    for(const row of [...old.map(s=>({block_number:s.anchor.height,block_hash:s.anchor.hash})),...(previous?.edges||[]),{block_number:page.anchor.height,block_hash:page.anchor.hash},...page.edges]){
      if(!Number.isSafeInteger(row.block_number)||!row.block_hash)throw new Error('A returned record has no block anchor.');
      const hash=row.block_hash.toLowerCase();if(hashes.has(row.block_number)&&hashes.get(row.block_number)!==hash)throw new Error('Source block changed. Clear the session and reload before combining these observations.');hashes.set(row.block_number,hash);
    }
    let added=0;
    for(const row of page.edges){
      const prior=edges.get(row.event_id);
      if(prior&&['from','to','kind','amount_base_units','block_number','block_hash','txid','position'].some(k=>prior[k]!==row[k]))throw new Error('Conflicting source event. Clear the session and reload.');
      if(!prior){edges.set(row.event_id,row);added++;}
    }
    for(const row of page.nodes)nodes.set(row.id,{id:row.id,kind:row.kind,...(row.address?{address:row.address}:{}),...(row.txid?{txid:row.txid}:{})});
    const signature=JSON.stringify([page.anchor,page.edges.map(e=>e.event_id)]);
    if(!snapshots.some(s=>s.signature===signature))snapshots.push({signature,source:page.source,retrieved_at:page.retrieved_at,anchor:page.anchor,scope:page.scope,coverage:page.coverage,records:page.edges.length});
    if(nodes.size>MAX_NODES||edges.size>MAX_EDGES||snapshots.length>MAX_PAGES)throw new Error('Session capacity reached (1,200 references / 4,000 records / 32 snapshots). Export or clear this session to collect another sample.');
    const anchor=!previous||page.anchor.height>=previous.anchor.height?page.anchor:previous.anchor;
    return {status:'source-reported',asset:page.asset,network:page.network,source:page.source,retrieved_at:page.retrieved_at,anchor,
      independent_verification:false,nodes:[...nodes.values()],edges:[...edges.values()],snapshots,
      scope:{snapshots:snapshots.length,unique_records:edges.size,complete_chain_history:false},
      coverage:`${edges.size} unique connection records from ${snapshots.length} bounded source snapshots collected in this tab. Gaps and sampling omissions remain unknown.`,
      added,last_cursor:page.next_cursor??null};
  }
  function candidates(page){
    const counts=new Map();for(const e of page.edges){counts.set(e.from,(counts.get(e.from)||0)+1);if(e.to!==e.from)counts.set(e.to,(counts.get(e.to)||0)+1);}
    return page.nodes.filter(n=>n.kind!=='transaction'&&n.address&&!/^0x0{40}$/i.test(n.address)).map(n=>({address:n.address,connections:counts.get(n.id)||0})).sort((a,b)=>b.connections-a.connections||a.address.localeCompare(b.address));
  }
  const api={merge,candidates,MAX_PAGES,MAX_NODES,MAX_EDGES};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.GraphusNetworkSession=api;
})(typeof globalThis!=='undefined'?globalThis:this);
