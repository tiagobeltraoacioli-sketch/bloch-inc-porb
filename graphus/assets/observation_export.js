/* A bounded public-chain evidence export. No score, person, or private source field is copied. */
(function(root){
  const pick=(object,keys)=>Object.fromEntries(keys
    .filter(key=>object&&Object.hasOwn(object,key)
      &&(object[key]===null||typeof object[key]==='string'||typeof object[key]==='boolean'
        ||typeof object[key]==='number'&&Number.isFinite(object[key])))
    .map(key=>[key,object[key]]));
  const block=value=>value&&typeof value==='object'
    ?pick(value,['height','slot','hash','time']):null;
  const balance=value=>{
    if(!value||typeof value!=='object')return null;
    return {...pick(value,['base_units','unit','scope','decimals','contract','utxo_count','retrieved_at']),
      block:block(value.block)};
  };
  const anchor=value=>value&&typeof value==='object'
    ?pick(value,['height','hash','time']):null;
  const source=value=>value&&typeof value==='object'
    ?{...pick(value,['source_id','retrieved_at','coverage']),
      limitations:Array.isArray(value.limitations)?value.limitations.filter(item=>typeof item==='string').slice(0,12):[],
      ...(value.finalized_head?{finalized_head:anchor(value.finalized_head)}:{}),
      ...(value.window_end_anchor?{window_end_anchor:anchor(value.window_end_anchor)}:{}),
      ...(value.block_window?{block_window:pick(value.block_window,['from','to','width'])}:{}),
      ...(value.source_response_consistency?{source_response_consistency:pick(value.source_response_consistency,
        ['block_heights','transaction_hashes','log_positions','duplicate_direction_hits'])}:{}),
      ...(value.head_before_balance?{head_before_balance:pick(value.head_before_balance,['slot','height','finalized_height','state_root'])}:{}),
      ...(value.history?{history:pick(value.history,['as_of_slot','total','events_returned','has_more','requested_cursor','next_cursor','source','page_number'])}:{}),
      ...(value.history_page_retrieved_at?{history_page_retrieved_at:value.history_page_retrieved_at}:{})}
    :null;
  const node=value=>({
    ...pick(value,['id','kind','address','txid']),
    ...(value.block?{block:block(value.block)}:{}),
    ...(value.balance?{balance:balance(value.balance)}:{}),
  });
  const edge=value=>({
    ...pick(value,['from','to','kind','amount_base_units','txid','position','event_id','transaction_hash','transaction_index','log_index','block_number','block_hash']),
    ...(value.block?{block:block(value.block)}:{}),
    ...(value.outpoint?{outpoint:pick(value.outpoint,['txid','vout'])}:{}),
  });
  const event=value=>pick(value,['event_id','block_number','block_hash','transaction_hash','transaction_index','log_index','from','to','direction','amount_base_units']);

  function buildObservationBundle(data,exportedAt=new Date().toISOString()){
    if(data?.status!=='source-reported'||!Array.isArray(data.nodes)||!Array.isArray(data.edges)
        ||typeof data.address!=='string'||data.address.length>100){
      throw new Error('No bounded public-chain observation to export');
    }
    const metrics=root.GraphusSourceMetrics.summarizeObservation(data);
    const timestamp=new Date(exportedAt).toISOString();
    const tokenEvents=data.tokenActivity?.events;
    const bundle={
      schema_version:1,kind:'graphus_public_chain_observation',exported_at:timestamp,
      status:'source-reported',independent_verification:false,aml_score_included:false,
      query:pick(data,['network','asset','address']),
      balance:balance(data.balance),
      source:source(data.observation),
      records:{nodes:data.nodes.map(node),edges:data.edges.map(edge)},
      metrics,
      ...(data.activity?{source_activity:pick(data.activity,['confirmed_tx_count','mempool_tx_count','bounded_events','total_source_reported'])}:{}),
      ...(Array.isArray(tokenEvents)?{token_logs:{
        contract:data.tokenActivityContract,
        source:source(data.tokenObservation),
        anchor_comparison:data.tokenAnchorComparison?{
          ...pick(data.tokenAnchorComparison,['status','height_difference']),
          balance:anchor(data.tokenAnchorComparison.balance),
          logs:anchor(data.tokenAnchorComparison.logs),
        }:null,
        event_count:tokenEvents.length,
        events:tokenEvents.map(event),
      }}:{}),
      limitations:[
        'This is a bounded, source-reported public-chain observation, not independently verified network history.',
        'Returned records do not establish beneficial ownership, identity, intent, AML risk, or complete transaction history.',
        'Balances and activity from separate requests are not reconciled unless a common source-reported anchor is explicitly shown; matching anchors still do not imply complete history.',
      ],
    };
    if(new TextEncoder().encode(JSON.stringify(bundle)).byteLength>2_000_000)
      throw new Error('Observation export exceeds size limit');
    return bundle;
  }
  root.GraphusObservationExport={buildObservationBundle};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.GraphusObservationExport;
})(typeof globalThis!=='undefined'?globalThis:window);
