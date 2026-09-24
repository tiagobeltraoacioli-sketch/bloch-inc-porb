/* Canvas selection from a bounded source response. Rank is observed record count, never risk. */
(function(root){
  function selectVisibleSourceNodes(data,{selectedEventId=null,selectedTransactionId=null,maxPoints=36}={}){
    if(!data||typeof data.address!=='string'||!Array.isArray(data.nodes)||!Array.isArray(data.edges)
        ||data.nodes.length>513||data.edges.length>512
        ||!Number.isSafeInteger(maxPoints)||maxPoints<1||maxPoints>36){
      throw new Error('Unbounded graph view');
    }
    const accountStyle=['ETH','USDT','USDC'].includes(data.asset);
    const sameAddress=value=>accountStyle
      ?typeof value==='string'&&value.toLowerCase()===data.address?.toLowerCase()
      :value===data.address;
    const focusIds=new Set(data.nodes.filter(node=>sameAddress(node?.address)).map(node=>node.id));
    const candidates=new Map();
    for(const node of data.nodes){
      if(node?.id&&typeof node.id==='string'&&!focusIds.has(node.id)&&!candidates.has(node.id))
        candidates.set(node.id,node);
    }
    const degree=new Map([...candidates.keys()].map(id=>[id,0]));
    const priority=new Set();
    if(selectedTransactionId&&candidates.has(selectedTransactionId))priority.add(selectedTransactionId);
    for(const edge of data.edges){
      for(const id of new Set([edge?.from,edge?.to])){
        if(degree.has(id))degree.set(id,degree.get(id)+1);
      }
      if((selectedEventId&&edge?.event_id===selectedEventId)
          ||(selectedTransactionId&&(edge?.from===selectedTransactionId||edge?.to===selectedTransactionId))){
        if(candidates.has(edge.from))priority.add(edge.from);
        if(candidates.has(edge.to))priority.add(edge.to);
      }
    }
    const ordered=[...candidates.values()].sort((left,right)=>{
      if(!accountStyle){
        const selectedTx=Number(right.id===selectedTransactionId)-Number(left.id===selectedTransactionId);
        if(selectedTx)return selectedTx;
        const tx=Number(right.kind==='transaction')-Number(left.kind==='transaction');
        if(tx)return tx;
      }
      const selected=Number(priority.has(right.id))-Number(priority.has(left.id));
      if(selected)return selected;
      const count=degree.get(right.id)-degree.get(left.id);
      if(count)return count;
      const leftKey=String(left.address||left.txid||left.id);
      const rightKey=String(right.address||right.txid||right.id);
      return leftKey<rightKey?-1:leftKey>rightKey?1:0;
    });
    const visible=ordered.slice(0,maxPoints);
    return {visible,total:ordered.length,omitted:Math.max(0,ordered.length-visible.length),
      selection_rule:accountStyle?'returned_log_count':'transaction_then_reference_count'};
  }
  root.GraphusSourceGraphView={selectVisibleSourceNodes};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.GraphusSourceGraphView;
})(typeof globalThis!=='undefined'?globalThis:window);
