/* Exact, bounded public-chain observation counts; never an ownership or volume estimate. */
(function (root) {
  const UTXO_KINDS = {
    BTC: ['observed_input_prevout', 'created_output'],
    BLCH: ['observed_spent_outpoint_reference', 'observed_created_output'],
  };
  const DECIMAL = /^(0|[1-9][0-9]*)$/;

  function amount(value) {
    if (typeof value !== 'string' || value.length > 39 || !DECIMAL.test(value)) {
      throw new Error('Invalid source amount');
    }
    return BigInt(value);
  }

  function blockRange(values) {
    const heights=values.filter(value=>Number.isSafeInteger(value)&&value>=0);
    return heights.length?{from:Math.min(...heights),to:Math.max(...heights)}:null;
  }

  function summarizeObservation(data) {
    if (!data || !['BTC','BLCH','ETH','USDT','USDC'].includes(data.asset)
        || !Array.isArray(data.nodes) || !Array.isArray(data.edges)
        || data.nodes.length > 513 || data.edges.length > 512) {
      throw new Error('Unbounded source observation');
    }
    const asset=data.asset;
    const source=data.tokenObservation?.source_id||data.observation?.source_id||'public-chain source';
    if (UTXO_KINDS[asset]) {
      const groups={};
      for (const kind of UTXO_KINDS[asset]) groups[kind]={count:0,base_units:'0'};
      const totals=Object.fromEntries(UTXO_KINDS[asset].map(kind=>[kind,0n]));
      for (const edge of data.edges) {
        if (!Object.hasOwn(groups,edge?.kind)) throw new Error('Unexpected source edge');
        totals[edge.kind]+=amount(edge.amount_base_units);
        groups[edge.kind].count++;
      }
      for (const kind of UTXO_KINDS[asset]) groups[kind].base_units=totals[kind].toString();
      const txNodes=data.nodes.filter(node=>node?.kind==='transaction');
      const peers=new Set(data.nodes.filter(node=>(node?.kind==='address'||node?.kind==='script_hash')
        &&node.address!==data.address).map(node=>node.address));
      return {
        kind:'utxo_observations',asset,source,
        transaction_records:new Set(txNodes.map(node=>node.id)).size,
        returned_edges:data.edges.length,observed_other_identifiers:peers.size,
        block_range:blockRange(txNodes.map(node=>node.block?.height)),groups,
        source_reported_confirmed_tx_count:asset==='BTC'&&Number.isSafeInteger(data.activity?.confirmed_tx_count)
          ?data.activity.confirmed_tx_count:null,
        coverage:data.observation?.coverage||'bounded source response',
        caveat:'Input references and created outputs are separate observations. Their sums are not transfer volume or evidence of input ownership.',
      };
    }
    if (asset==='ETH') {
      return {kind:'balance_only',asset,source,
        block_range:blockRange([data.balance?.block?.height]),
        coverage:data.observation?.coverage||'single address balance',
        caveat:'No native ETH transaction index is connected to this view.'};
    }
    if(!data.tokenActivity)return {kind:'balance_only',asset,source,
      block_range:blockRange([data.balance?.block?.height]),
      coverage:data.observation?.coverage||'single token balance',
      caveat:'A bounded Transfer-log window is not available in this response.'};
    const events=data.tokenActivity?.events;
    if (!Array.isArray(events) || events.length>256) {
      throw new Error('Unbounded token activity');
    }
    const groups={incoming:{count:0,base_units:'0'},outgoing:{count:0,base_units:'0'},self:{count:0,base_units:'0'}};
    const totals={incoming:0n,outgoing:0n,self:0n};
    const peers=new Set();
    for (const event of events) {
      if (!Object.hasOwn(groups,event?.direction)) throw new Error('Invalid token direction');
      totals[event.direction]+=amount(event.amount_base_units);
      groups[event.direction].count++;
      if(event.from&&event.from.toLowerCase()!==data.address.toLowerCase())peers.add(event.from.toLowerCase());
      if(event.to&&event.to.toLowerCase()!==data.address.toLowerCase())peers.add(event.to.toLowerCase());
    }
    for(const direction of Object.keys(groups))groups[direction].base_units=totals[direction].toString();
    return {kind:'erc20_transfer_logs',asset,source,
      returned_events:events.length,observed_other_identifiers:peers.size,
      block_range:data.tokenObservation?.block_window||blockRange(events.map(event=>event.block_number)),
      groups,coverage:data.tokenObservation?.coverage||'bounded Transfer log window',
      caveat:'Only returned Transfer logs are counted. These amounts are not a complete transaction history or a balance reconciliation.'};
  }

  root.GraphusSourceMetrics={summarizeObservation};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.GraphusSourceMetrics;
})(typeof globalThis!=='undefined'?globalThis:window);
