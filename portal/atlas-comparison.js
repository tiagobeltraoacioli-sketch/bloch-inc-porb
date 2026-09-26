import {authorize, audit, budget, digest, json, requireValue, statement} from './security.js';
import {readAnalysis} from './intelligence.js';

export const COMPARISON_VERSION = 'porb-atlas-comparison-1.0.0';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FIELDS = ['from', 'to', 'kind', 'amount_base_units', 'txid', 'position', 'block_number', 'block_hash', 'block_time'];
const sort = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const incident = (edge, reference) => !reference || edge.from === reference || edge.to === reference;
const record = edge => edge ? Object.fromEntries(FIELDS.map(key => [key, edge[key] ?? null])) : null;
const delta = (before, after) => ({baseline: before, current: after, delta: after - before});
const validText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;

async function checked(run) {
  const graph = run?.graph;
  requireValue(graph && UUID.test(run.id) && /^[a-f0-9]{64}$/.test(run.digest || '') && await digest(JSON.stringify(graph)) === run.digest, 'analysis_integrity_failed', 409);
  requireValue(run.asset === graph.asset && ['BTC', 'ETH', 'USDT', 'USDC', 'BLCH'].includes(graph.asset)
    && validText(graph.network, 60) && validText(graph.source, 160) && Number.isSafeInteger(run.created_at)
    && Array.isArray(graph.nodes) && graph.nodes.length <= 1200 && Array.isArray(graph.edges) && graph.edges.length <= 4000
    && Array.isArray(graph.snapshots) && graph.snapshots.length > 0 && graph.snapshots.length <= 8, 'invalid_retained_graph', 422);
  const nodes = new Map(), edges = new Map(), blocks = new Map();
  const block = (height, hash) => {
    requireValue(Number.isSafeInteger(height) && height >= 0 && /^(0x)?[a-f0-9]{64}$/i.test(hash || ''), 'invalid_retained_anchor', 422);
    hash = hash.toLowerCase();
    requireValue(!blocks.has(height) || blocks.get(height) === hash, 'inconsistent_retained_blocks', 409);
    blocks.set(height, hash);
  };
  for (const node of graph.nodes) {
    requireValue(validText(node.id, 200) && node.id.startsWith(graph.asset + ':') && !nodes.has(node.id), 'invalid_retained_node', 422);
    nodes.set(node.id, node);
  }
  for (const snapshot of graph.snapshots) block(snapshot.anchor?.height, snapshot.anchor?.hash);
  for (const edge of graph.edges) {
    requireValue(validText(edge.event_id, 180) && !edges.has(edge.event_id) && nodes.has(edge.from) && nodes.has(edge.to)
      && validText(edge.kind, 80) && /^(0|[1-9][0-9]{0,77})$/.test(edge.amount_base_units || '') && typeof edge.amount_base_units === 'string'
      && /^(0x)?[a-f0-9]{64}$/i.test(edge.txid || '') && Number.isSafeInteger(edge.position) && edge.position >= 0
      && (edge.block_time === undefined || (validText(edge.block_time, 40) && Number.isFinite(Date.parse(edge.block_time)))), 'invalid_retained_event', 422);
    block(edge.block_number, edge.block_hash); edges.set(edge.event_id, edge);
  }
  return {run, graph, nodes, edges, blocks};
}

function describe({run, graph}, reference) {
  const heights = graph.edges.map(edge => edge.block_number);
  return {id: run.id, dataset_sha256: run.digest, created_at: run.created_at, model_version: run.model_version,
    nodes: graph.nodes.length, records: graph.edges.length, selected_records: graph.edges.filter(edge => incident(edge, reference)).length,
    block_range: heights.length ? {minimum: Math.min(...heights), maximum: Math.max(...heights)} : null,
    requested_pages: graph.requested_pages ?? null, returned_pages: graph.returned_pages ?? graph.snapshots.length,
    next_cursor: graph.next_cursor ?? null, stopped: graph.stopped ?? null, collection_time: graph.collection_time ?? null,
    coverage: graph.coverage ?? null, snapshots: graph.snapshots};
}
function totals(graph, reference) {
  const groups = new Map();
  for (const edge of graph.edges) {
    if (!incident(edge, reference)) continue;
    const direction = !reference ? 'recorded' : edge.from === reference && edge.to === reference ? 'self' : edge.from === reference ? 'outgoing' : 'incoming';
    const key = JSON.stringify([edge.kind, direction]), group = groups.get(key) || {kind: edge.kind, direction, records: 0, amount: 0n};
    group.records++; group.amount += BigInt(edge.amount_base_units); groups.set(key, group);
  }
  return groups;
}
function references(graph) {
  const rows = new Map(graph.nodes.map(node => [node.id, {records: 0, neighbors: new Set()}]));
  for (const edge of graph.edges) {
    for (const id of new Set([edge.from, edge.to])) rows.get(id).records++;
    if (edge.from !== edge.to) {rows.get(edge.from).neighbors.add(edge.to); rows.get(edge.to).neighbors.add(edge.from);}
  }
  return rows;
}

export async function compareAnalyses(baseline, current, reference = null) {
  requireValue(reference === null || validText(reference, 200), 'invalid_comparison_reference');
  const [a, b] = await Promise.all([checked(baseline), checked(current)]);
  requireValue(['asset', 'network', 'source'].every(key => a.graph[key] === b.graph[key]), 'incompatible_comparison_sources', 422);
  const contracts = side => [...new Set(side.graph.snapshots.map(s => {
    const value = s.scope?.contract;
    requireValue(value === undefined || (typeof value === 'string' && /^0x[a-f0-9]{40}$/i.test(value)), 'invalid_retained_contract', 422);
    return value?.toLowerCase();
  }).filter(Boolean))].sort(sort);
  const ac = contracts(a), bc = contracts(b);
  requireValue(ac.length <= 1 && bc.length <= 1 && (!ac.length || !bc.length || ac[0] === bc[0]), 'incompatible_comparison_contracts', 422);
  requireValue(!reference || a.nodes.has(reference) || b.nodes.has(reference), 'comparison_reference_unobserved', 404);
  const counts = {shared: 0, changed: 0, only_baseline: 0, only_current: 0}, events = [];
  for (const id of [...new Set([...a.edges.keys(), ...b.edges.keys()])].sort(sort)) {
    const before = a.edges.get(id), after = b.edges.get(id);
    if (reference && !(before && incident(before, reference)) && !(after && incident(after, reference))) continue;
    const left = record(before), right = record(after), changed = before && after ? FIELDS.filter(key => left[key] !== right[key]) : [];
    const status = !before ? 'only_current' : !after ? 'only_baseline' : changed.length ? 'changed' : 'shared'; counts[status]++;
    events.push({event_id: id, status, changed_fields: changed, baseline: left, current: right});
  }
  const at = totals(a.graph, reference), bt = totals(b.graph, reference), amounts = [];
  for (const key of [...new Set([...at.keys(), ...bt.keys()])].sort(sort)) {
    const left = at.get(key), right = bt.get(key), meta = left || right;
    amounts.push({kind: meta.kind, direction: meta.direction, records: delta(left?.records || 0, right?.records || 0),
      amount_base_units: {baseline: String(left?.amount || 0n), current: String(right?.amount || 0n), delta: String((right?.amount || 0n) - (left?.amount || 0n))}});
  }
  const ar = references(a.graph), br = references(b.graph), referenceRows = [];
  for (const id of (reference ? [reference] : [...new Set([...ar.keys(), ...br.keys()])].sort(sort))) {
    const left = ar.get(id), right = br.get(id);
    referenceRows.push({id, presence: left && right ? 'both' : left ? 'only_baseline' : 'only_current', records: delta(left?.records || 0, right?.records || 0), neighbors: delta(left?.neighbors.size || 0, right?.neighbors.size || 0)});
  }
  const overlapping = [...a.blocks.keys()].filter(height => b.blocks.has(height)).sort((x, y) => x - y);
  const conflicts = overlapping.filter(height => a.blocks.get(height) !== b.blocks.get(height)).map(height => ({height, baseline_hash: a.blocks.get(height), current_hash: b.blocks.get(height)}));
  const notes = ['Only the two retained source samples are compared. No source collection or independent chain verification is performed.',
    'Records match by exact source event ID. Absence from a sample does not establish inactivity, deletion or a chain reorganization.',
    'Block conflicts describe source disagreement at an observed height; they do not identify a canonical block.',
    'Amounts are exact base-unit integers grouped by record kind and direction. UTXO inputs and outputs must not be added as transfer volume.',
    'Red and Blue scores are sample-relative. No score trend or AML conclusion is calculated.',
    'A dataset hash checks retained bytes against the stored digest; it does not authenticate the upstream source.'];
  if (current.created_at < baseline.created_at) notes.push('The current selection was saved before the baseline. Delta always means current minus baseline.');
  if (baseline.id === current.id) notes.push('Both sides select the same saved analysis.');
  if (['USDT', 'USDC'].includes(b.graph.asset) && [...a.graph.snapshots, ...b.graph.snapshots].some(s => !s.scope?.contract)) notes.push('Contract metadata is missing on at least one source page. Token contract equivalence could not be fully checked.');
  if (a.graph.requested_pages !== b.graph.requested_pages || a.graph.returned_pages !== b.graph.returned_pages) notes.push('Collection page bounds differ. Count changes may reflect sampling coverage.');
  const result = {version: COMPARISON_VERSION, asset: b.graph.asset, network: b.graph.network, source: b.graph.source, reference,
    baseline: describe(a, reference), current: describe(b, reference), counts, amounts,
    blocks: {scope: 'entire_samples', overlapping_heights: overlapping.length, conflicts}, references: referenceRows, events, notes,
    limits: {nodes_per_sample: 1200, records_per_sample: 4000, pages_per_sample: 8, event_rows: 8000, response_bytes: 16000000, truncated: false}};
  const serialized = JSON.stringify(result);
  requireValue(new TextEncoder().encode(serialized).length <= 15999800, 'comparison_response_capacity', 422);
  // SHA-256 covers JSON.stringify(report without report_sha256), including ordering.
  return {...result, report_sha256: await digest(serialized)};
}

export async function atlasComparisonRoute(request, env, principal) {
  authorize(principal, 'analyses:read'); authorize(principal, 'scores:read');
  requireValue(request.method === 'GET', 'method_not_allowed', 405);
  const query = new URL(request.url).searchParams, baseline = query.get('baseline'), current = query.get('current');
  requireValue(UUID.test(baseline || '') && UUID.test(current || ''), 'invalid_comparison_analysis');
  const reference = query.has('reference') ? query.get('reference') : null;
  requireValue(reference === null || validText(reference, 200), 'invalid_comparison_reference');
  await budget(env, `atlas-compare:${principal.tenant_id}`, 20, 60);
  const read = async id => {
    const manifest = await statement(env.PORB_DB, 'SELECT digest,asset,created_at,model_version FROM analyses WHERE id=? AND tenant_id=?', id, principal.tenant_id).first();
    requireValue(manifest, 'analysis_unavailable', 404);
    const run = await readAnalysis(env.PORB_DB, principal.tenant_id, id);
    requireValue(run.id === id && Object.keys(manifest).every(key => manifest[key] === run[key]), 'analysis_integrity_failed', 409);
    return run;
  };
  const before = await read(baseline), after = baseline === current ? before : await read(current);
  const report = await compareAnalyses(before, after, reference);
  await audit(env.PORB_DB, principal, 'atlas.compare.read', `${baseline}:${current}:${report.report_sha256}`).run();
  return json(report);
}
