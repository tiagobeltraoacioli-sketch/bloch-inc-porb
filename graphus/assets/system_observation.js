// Only committed public evidence is summarized. Availability is not source health.
export function summarizeSample(packet){
  if(!packet)return null;
  const {dataset:d,diagnostics:q}=packet;
  return {asset:d.asset,network:d.network,source:d.source,retrieved_at:d.retrieved_at,
    anchor:{height:d.anchor.height,hash:d.anchor.hash,finality:d.anchor.finality??null},
    coverage:d.coverage,dataset_sha256:packet.dataset_sha256,
    pages:q.source_pages,references:q.references,records:q.records,transactions:q.transactions,
    blocks:q.blocks,missing_timestamps:q.records_without_timestamp};
}

export function supportsCapturedSample(node){
  return node.access==='public'&&node.actions.some(action=>['capture','constellation','analytics'].includes(action));
}

export function sampleForModule(node,observation,asset='all'){
  const sample=observation?.sample;
  return sample&&supportsCapturedSample(node)&&node.assets.includes(sample.asset)&&(asset==='all'||asset===sample.asset)?sample:null;
}
