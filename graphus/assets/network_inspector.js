(function(root){
  'use strict';
  function inspect(data,id){
    const node=data.nodes.find(n=>n.id===id);if(!node)throw new Error('Unknown graph reference.');
    const rows=data.edges.filter(e=>e.from===id||e.to===id),groups=new Map(),peers=new Map(),blocks=new Set();let missing=0,self=0;
    for(const e of rows){
      const direction=e.from===id&&e.to===id?'self':e.to===id?'incoming':'outgoing',key=direction+':'+e.kind;
      if(!groups.has(key))groups.set(key,{direction,kind:e.kind,records:0,base_units:0n});const group=groups.get(key);group.records++;group.base_units+=BigInt(e.amount);
      if(direction==='self')self++;else{const other=e.from===id?e.to:e.from;if(!peers.has(other))peers.set(other,{id:other,incoming:0,outgoing:0,records:0});const peer=peers.get(other);peer[direction]++;peer.records++;}
      if(Number.isSafeInteger(e.block))blocks.add(e.block);if(!Number.isFinite(Date.parse(e.block_time)))missing++;
    }
    return {id,records:rows.length,self_records:self,transactions:new Set(rows.map(e=>e.txid)).size,blocks:blocks.size,first_block:blocks.size?Math.min(...blocks):null,last_block:blocks.size?Math.max(...blocks):null,records_without_timestamp:missing,
      groups:[...groups.values()].map(g=>({...g,base_units:g.base_units.toString()})).sort((a,b)=>a.direction.localeCompare(b.direction)||a.kind.localeCompare(b.kind)),
      peers:[...peers.values()].sort((a,b)=>b.records-a.records||a.id.localeCompare(b.id))};
  }
  function matches(node,query,asset){const value=node.label,needle=query.trim();return asset==='BTC'&&node.kind==='address'&&/^[13]/.test(value)?value.includes(needle):value.toLowerCase().includes(needle.toLowerCase());}
  const api={inspect,matches};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.GraphusNetworkInspector=api;
})(typeof globalThis!=='undefined'?globalThis:this);
