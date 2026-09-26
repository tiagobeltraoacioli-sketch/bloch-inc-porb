import {ASSETS} from './atlas_registry.js';
import {utcTimestamp} from './atlas_statistics.js';

export const PATH_VERSION = 'graphus-atlas-paths-1.0.0';
export const PATH_LIMITS = Object.freeze({nodes:1200, records:4000, pages:8, hops:6, paths:20, expansions:20000, seconds:604800});
export class PathError extends Error {constructor(code, status = 400) {super(code); this.status = status;}}
const check = (ok, code, status) => {if (!ok) throw new PathError(code, status);};
const sha = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2,'0')).join('');
const order = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const text = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
const hash = v => typeof v === 'string' && /^(0x)?[a-f0-9]{64}$/i.test(v);
const integer = (v, max) => Number.isSafeInteger(v) && v >= 1 && v <= max;
const zeroAddress = id => /:address:0x0{40}$/i.test(id);
const record = e => Object.fromEntries(['event_id','from','to','kind','amount_base_units','txid','position','block_number','block_hash','block_time'].map(k => [k,e[k] ?? null]));

export function pathParameters(input) {
  check(input && Object.keys(input).every(k => ['from','to','max_hops','max_paths','max_gap_seconds','max_duration_seconds','minimum','start','end'].includes(k)), 'unexpected_path_parameters');
  const p = {from:input.from, to:input.to, max_hops:input.max_hops ?? 4, max_paths:input.max_paths ?? 10,
    max_gap_seconds:input.max_gap_seconds ?? 86400, max_duration_seconds:input.max_duration_seconds ?? 604800,
    minimum:input.minimum ?? '0', start:input.start ?? null, end:input.end ?? null};
  check(text(p.from,200) && text(p.to,200) && p.from !== p.to, 'distinct_path_references_required');
  check(integer(p.max_hops,6) && integer(p.max_paths,20), 'invalid_path_limits');
  check(integer(p.max_gap_seconds,604800) && integer(p.max_duration_seconds,604800) && p.max_gap_seconds <= p.max_duration_seconds, 'invalid_path_duration');
  check(typeof p.minimum === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(p.minimum), 'invalid_path_minimum');
  check((p.start === null || utcTimestamp(p.start) !== null) && (p.end === null || utcTimestamp(p.end) !== null), 'invalid_path_utc_range');
  check(!p.start || !p.end || utcTimestamp(p.start) <= utcTimestamp(p.end), 'invalid_path_utc_range');
  if (p.start) p.start = new Date(utcTimestamp(p.start)).toISOString();
  if (p.end) p.end = new Date(utcTimestamp(p.end)).toISOString();
  return p;
}

export async function traceAtlasPaths(graph, input, context = {}) {
  const p = pathParameters(input), asset = graph && Object.hasOwn(ASSETS,graph.asset) ? ASSETS[graph.asset] : null;
  check(asset && graph.network === asset.network && text(graph.source,300) && Array.isArray(graph.nodes) && graph.nodes.length <= 1200
    && Array.isArray(graph.edges) && graph.edges.length <= 4000 && Array.isArray(graph.snapshots) && graph.snapshots.length >= 1 && graph.snapshots.length <= 8, 'invalid_path_dataset', 422);
  const bytes = JSON.stringify(graph); check(new TextEncoder().encode(bytes).length <= 6000000,'path_dataset_capacity',422);
  const datasetHash = await sha(bytes);
  check(!context.dataset_sha256 || context.dataset_sha256 === datasetHash, 'path_dataset_integrity_failed', 409);
  const nodes = new Map(), ids = new Set(), blocks = new Map();
  for (const n of graph.nodes) {
    check(n && text(n.id,200) && ['address','script_hash','transaction'].includes(n.kind) && n.id === `${graph.asset}:${n.kind}:${n.kind === 'transaction' ? n.txid : n.address}` && !nodes.has(n.id),'invalid_path_node',422);
    nodes.set(n.id,n);
  }
  check(nodes.has(p.from) && nodes.has(p.to),'path_reference_unobserved',404);
  if(asset.standard !== 'UTXO')check([p.from,p.to].every(id => nodes.get(id).kind === 'address' && /^0x[a-f0-9]{40}$/i.test(nodes.get(id).address)), 'path_address_reference_required',422);
  const block = (height, blockHash, time = null) => {
    check(Number.isSafeInteger(height) && height >= 0 && hash(blockHash),'invalid_path_block',422);
    const previous = blocks.get(height);
    check(!previous || (previous.hash === blockHash.toLowerCase() && (previous.time === null || time === null || previous.time === time)), 'inconsistent_path_block',422);
    blocks.set(height,{hash:blockHash.toLowerCase(),time:time ?? previous?.time ?? null});
  };
  for (const s of graph.snapshots) {
    block(s.anchor?.height,s.anchor?.hash);
    if (asset.contract && s.scope?.contract !== undefined) check(typeof s.scope.contract === 'string' && s.scope.contract.toLowerCase() === asset.contract,'path_contract_mismatch',422);
  }
  const excluded = {unsupported_kind:0, unsupported_endpoint:0, missing_timestamp:0, invalid_timestamp:0, outside_window:0, below_minimum:0, self_event:0};
  const eligible = [], kind = graph.asset === 'ETH' ? 'native_value' : 'erc20_transfer';
  for (const e of graph.edges) {
    check(e && text(e.event_id,180) && !ids.has(e.event_id) && nodes.has(e.from) && nodes.has(e.to) && text(e.kind,80)
      && typeof e.amount_base_units === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(e.amount_base_units) && hash(e.txid)
      && (e.position === undefined || Number.isSafeInteger(e.position) && e.position >= 0), 'invalid_path_record',422);
    ids.add(e.event_id); const time = utcTimestamp(e.block_time); block(e.block_number,e.block_hash,time);
    const accountEndpoints = [e.from,e.to].every(id => nodes.get(id).kind === 'address' && /^0x[a-f0-9]{40}$/i.test(nodes.get(id).address));
    const reason = e.kind !== kind ? 'unsupported_kind' : !accountEndpoints ? 'unsupported_endpoint' : e.block_time === undefined || e.block_time === null ? 'missing_timestamp' : time === null ? 'invalid_timestamp'
      : (p.start && time < utcTimestamp(p.start)) || (p.end && time > utcTimestamp(p.end)) ? 'outside_window'
      : BigInt(e.amount_base_units) < BigInt(p.minimum) ? 'below_minimum' : e.from === e.to ? 'self_event' : null;
    if (reason) {excluded[reason]++; continue;} eligible.push({edge:e,time});
  }
  const applicable = asset.standard !== 'UTXO';
  const adjacency = new Map(), neighbors = new Map();
  for (const item of eligible) {
    const e = item.edge; if (!adjacency.has(e.from)) adjacency.set(e.from,[]); adjacency.get(e.from).push(item);
    for (const [a,b] of [[e.from,e.to],[e.to,e.from]]) {if (!neighbors.has(a)) neighbors.set(a,new Set()); neighbors.get(a).add(b);}
  }
  for (const rows of adjacency.values()) rows.sort((a,b) => a.time - b.time || order(a.edge.event_id,b.edge.event_id));
  const paths = [], queue = [{node:p.from, nodes:[p.from], steps:[], first:null, last:null, height:null}];
  let head = 0, expansions = 0, stop = null;
  const pruned = {time_order:0, block_order:0, gap:0, duration:0, repeated_reference:0, zero_address_intermediary:0};
  // Breadth-first traversal returns shorter paths first. All work, including
  // rejected candidate edges, consumes the bounded expansion budget.
  search: while (applicable && head < queue.length) {
    const state = queue[head++]; if (state.steps.length >= p.max_hops) continue;
    if (state.steps.length && zeroAddress(state.node)) {pruned.zero_address_intermediary++; continue;}
    for (const {edge:e,time} of adjacency.get(state.node) || []) {
      if (expansions >= PATH_LIMITS.expansions) {stop = 'expansion_limit'; break search;} expansions++;
      if (state.last !== null && time <= state.last) {pruned.time_order++; continue;}
      if (state.height !== null && e.block_number <= state.height) {pruned.block_order++; continue;}
      if (state.last !== null && time - state.last > p.max_gap_seconds * 1000) {pruned.gap++; continue;}
      if (state.first !== null && time - state.first > p.max_duration_seconds * 1000) {pruned.duration++; continue;}
      if (state.nodes.includes(e.to)) {pruned.repeated_reference++; continue;}
      const next = {node:e.to, nodes:[...state.nodes,e.to], steps:[...state.steps,{...record(e),gap_seconds:state.last === null ? null : (time-state.last)/1000}], first:state.first ?? time, last:time, height:e.block_number};
      if (e.to === p.to) {
        if (paths.length === p.max_paths) {stop = 'path_limit'; break search;}
        paths.push({index:paths.length+1, hops:next.steps.length, references:next.nodes, started_at:new Date(next.first).toISOString(), ended_at:new Date(time).toISOString(),
          duration_seconds:(time-next.first)/1000, high_degree_references:next.nodes.filter(id => (neighbors.get(id)?.size || 0) >= 10).map(id => ({id,neighbors:neighbors.get(id).size})), steps:next.steps});
      } else if (next.steps.length < p.max_hops) queue.push(next);
    }
  }
  const notes = ['Paths are ordered source observations, not proof that the same funds moved through each reference or that references share an owner.',
    'Successive steps require strictly increasing UTC block timestamps and block heights. Equal-time or within-block order is not inferred.',
    'Only simple directed paths are searched; repeated references and self events are excluded. The zero address cannot be an intermediary.',
    'Each event amount remains an exact base-unit string. Amounts on different steps are not added or treated as conserved value.',
    'No path found describes this bounded sample and these limits; it does not establish absence on the chain.',
    'Results are ordered by hop count, then deterministic traversal of event time and event ID. This is not a risk or probability ranking.',
    'Neighbor counts use eligible sample records. Degree of ten or more is a structural caveat, not service attribution.',
    'Digest verification checks retained bytes, not source truth, canonical consensus or independent finality.'];
  if (context.imported) notes.push('Imported source claims have not been independently verified.');
  if (asset.contract && graph.snapshots.some(s => !s.scope?.contract)) notes.push('Some retained pages lack contract metadata. Asset identity relies on the declared capture and configured adapter.');
  if (p.minimum === '0') notes.push('Zero-value events remain eligible; use a positive minimum to exclude them.');
  const report = {version:PATH_VERSION, state:applicable ? 'available' : 'not_applicable',
    reason:applicable ? null : 'BTC and BLCH input/output references do not establish account-to-account senders. Account-style temporal paths are not calculated.',
    asset:graph.asset, network:graph.network, asset_id:asset.id, unit:asset.unit, decimals:asset.decimals, parameters:p,
    provenance:{dataset_sha256:datasetHash, analysis_id:context.analysis_id ?? null, source:graph.source, snapshots:graph.snapshots,
      coverage:graph.coverage ?? null, imported:Boolean(context.imported), parent_selection:context.selection ?? null, independent_verification:false},
    coverage:{records:graph.edges.length, eligible_records:applicable ? eligible.length : 0, excluded, complete_history:false},
    search:{expansions, pruned, returned_paths:paths.length, truncated:stop !== null, stop_reason:stop, complete_within_query:applicable && stop === null, limits:PATH_LIMITS}, paths, notes};
  return {...report,report_sha256:await sha(JSON.stringify(report))};
}
