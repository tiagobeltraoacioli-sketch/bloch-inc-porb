// Public descriptive measurements only. No score, identity or external allegation.
export const PROFILE_VERSION = 'graphus-evidence-1.0.0';
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const fraction = (a,b) => b ? Number(a * 1000000n / b) / 1000000 : 0;

export function evidenceProfile(graph) {
  const nodes = new Map(graph.nodes.map(node => [node.id,node]));
  const incoming = new Map(), outgoing = new Map(), blocks = new Set(), transactions = new Set(), kinds = new Map();
  let first = null, last = null, missing = 0, self = 0, zero = 0;
  for (const edge of graph.edges) {
    const amount = edge.amount_base_units ?? edge.amount, block = edge.block_number ?? edge.block;
    if (!nodes.has(edge.from) || !nodes.has(edge.to) || typeof amount !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(amount)) throw new Error('Invalid evidence record.');
    if (!kinds.has(edge.kind)) kinds.set(edge.kind,{kind:edge.kind,records:0,base_units:0n});
    const group = kinds.get(edge.kind); group.records++; group.base_units += BigInt(amount);
    if (BigInt(amount) === 0n) zero++;
    if (edge.from === edge.to) self++;
    else {
      if (!outgoing.has(edge.from)) outgoing.set(edge.from,new Set());
      if (!incoming.has(edge.to)) incoming.set(edge.to,new Set());
      outgoing.get(edge.from).add(edge.to); incoming.get(edge.to).add(edge.from);
    }
    if (Number.isSafeInteger(block) && block >= 0) blocks.add(block);
    if (edge.txid) transactions.add(edge.txid);
    const stamp = time(edge.block_time);
    if (stamp === null) missing++;
    else { first = first === null ? stamp : Math.min(first,stamp); last = last === null ? stamp : Math.max(last,stamp); }
  }
  let reciprocal = 0;
  for (const [from,peers] of outgoing) for (const to of peers) if (from < to && outgoing.get(to)?.has(from)) reciprocal++;
  const heights = [...blocks].sort((a,b) => a-b), references = [...nodes.values()].filter(n => n.kind !== 'transaction');
  const fanIn = references.map(n => incoming.get(n.id)?.size || 0), fanOut = references.map(n => outgoing.get(n.id)?.size || 0);
  return {
    version:PROFILE_VERSION,asset:graph.asset,records:graph.edges.length,transactions:transactions.size,
    references:references.length,record_types:[...kinds.values()].map(k => ({...k,base_units:String(k.base_units)})).sort((a,b) => a.kind.localeCompare(b.kind)),
    temporal:{records_with_timestamp:graph.edges.length-missing,records_without_timestamp:missing,
      first_observed_at:first === null ? null : new Date(first).toISOString(),last_observed_at:last === null ? null : new Date(last).toISOString(),
      observed_span_seconds:first === null ? null : (last-first)/1000},
    blocks:{returned:heights.length,first:heights[0]??null,last:heights.at(-1)??null,
      heights_without_records:heights.length ? heights.at(-1)-heights[0]+1-heights.length : 0},
    structure:{maximum_incoming_neighbors:Math.max(0,...fanIn),maximum_outgoing_neighbors:Math.max(0,...fanOut),
      references_with_multiple_incoming_neighbors:fanIn.filter(n => n > 1).length,references_with_multiple_outgoing_neighbors:fanOut.filter(n => n > 1).length,
      reciprocal_reference_pairs:reciprocal,self_reference_records:self,zero_amount_records:zero},
    interpretation:'Measurements describe returned records only. Heights without records are unknown, not empty blocks. UTXO neighbors are transaction references; reciprocal adjacency does not establish chronological value flow or common ownership. Amounts remain separated by record type.',
  };
}

export function balanceProfile(records) {
  const identities = new Set(records.map(r => JSON.stringify([r.asset,r.network??null,r.contract??null,r.decimals??null,r.unit??null])));
  if (identities.size > 1) throw new Error('Balance observations must share asset, network, contract and units.');
  const amounts = records.map(r => {
    if (!/^(0|[1-9][0-9]{0,77})$/.test(r.baseUnits)) throw new Error('Invalid exact balance.');
    return BigInt(r.baseUnits);
  }).sort((a,b) => a < b ? -1 : a > b ? 1 : 0);
  const total = amounts.reduce((s,n) => s+n,0n), anchors = new Set(), times = records.map(r => time(r.retrievedAt)).filter(t => t !== null);
  let unanchored = 0;
  for (const record of records) {
    if (Number.isSafeInteger(record.block?.height) && typeof record.block?.hash === 'string' && /^(0x)?[a-f0-9]{64}$/i.test(record.block.hash)) anchors.add(`${record.block.height}:${record.block.hash.toLowerCase()}`);
    else unanchored++;
  }
  return {version:PROFILE_VERSION,records:records.length,total_base_units:String(total),zero_balances:amounts.filter(n => n === 0n).length,
    largest_share:total ? fraction(amounts.at(-1),total) : null,top_five_share:total ? fraction(amounts.slice(-5).reduce((s,n) => s+n,0n),total) : null,
    concentration_hhi:total ? fraction(amounts.reduce((s,n) => s+n*n,0n),total*total) : null,
    distinct_block_anchors:anchors.size,unanchored_records:unanchored,shared_block_anchor:records.length > 0 && !unanchored && anchors.size === 1,
    retrieval_span_seconds:times.length ? (Math.max(...times)-Math.min(...times))/1000 : null,missing_retrieval_times:records.length-times.length,
    interpretation:'Concentration describes these queried identifiers only. Different anchors are separate balance observations, not a synchronized network snapshot. No owner aggregation or AML classification.'};
}
