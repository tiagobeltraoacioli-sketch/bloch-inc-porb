import test from 'node:test';
import assert from 'node:assert/strict';
import {compareAnalyses} from '../portal/atlas-comparison.js';
import {mergePage} from '../portal/data.js';
import {digest} from '../portal/security.js';
import {setup, sourceGraph, credentials} from './porb_helpers.mjs';

const baselineId = '11111111-1111-4111-8111-111111111111', currentId = '22222222-2222-4222-8222-222222222222';
async function run(graph, id = baselineId, time = 1000) {return {id, asset: graph.asset, graph, digest: await digest(JSON.stringify(graph)), model_version: 'fixture-model', created_at: time};}
function graph() {const page = sourceGraph(); page.edges = page.edges.slice(0, 3); return mergePage(null, page, 'ETH');}
async function pair() {const a = graph(), b = structuredClone(a); b.edges.splice(0, 1); b.edges[0].amount_base_units = '900719925474099312345'; b.edges.push({...a.edges[0], event_id: 'new-event'}); return [await run(a), await run(b, currentId, 2000)];}

test('retained comparison classifies exact event identity, preserves integers and hashes the complete deterministic report', async () => {
  const [a, b] = await pair(), before = JSON.stringify([a, b]), report = await compareAnalyses(a, b);
  assert.deepEqual(report.counts, {shared: 1, changed: 1, only_baseline: 1, only_current: 1});
  assert.deepEqual(report.events.find(e => e.status === 'changed').changed_fields, ['amount_base_units']);
  assert.equal(report.amounts[0].amount_base_units.delta, String(900719925474099312345n - 2000000000000000000n));
  assert.deepEqual(await compareAnalyses(a, b), report); assert.equal(JSON.stringify([a, b]), before);
  const {report_sha256, ...body} = report; assert.equal(await digest(JSON.stringify(body)), report_sha256);
  assert.equal(report.limits.truncated, false); assert.equal(report.baseline.dataset_sha256, a.digest);
});
test('reference filtering matches before classifying changed endpoints, and self events count once', async () => {
  const a = graph(), reference = a.edges[0].from; a.edges = [a.edges[0], {...a.edges[0], event_id: 'self', to: reference}];
  const b = structuredClone(a); b.edges[0].from = b.nodes[3].id;
  const report = await compareAnalyses(await run(a), await run(b, currentId), reference);
  assert.deepEqual(report.counts, {shared: 1, changed: 1, only_baseline: 0, only_current: 0});
  assert.deepEqual(report.references[0].records, {baseline: 2, current: 1, delta: -1});
  assert.deepEqual(report.references[0].neighbors, {baseline: 1, current: 0, delta: -1});
  assert.equal(report.amounts.find(r => r.direction === 'self').records.baseline, 1);
  assert.equal(report.amounts.find(r => r.direction === 'outgoing').amount_base_units.current, '0');
  assert.equal(report.current.selected_records, 1);
});
test('a reference observed only in the baseline remains comparable and absence is disclosed', async () => {
  const a = graph(), id = a.edges[0].from, b = structuredClone(a); b.edges = b.edges.filter(e => e.from !== id); b.nodes = b.nodes.filter(n => n.id !== id);
  const report = await compareAnalyses(await run(a), await run(b, currentId), id);
  assert.equal(report.references[0].presence, 'only_baseline'); assert.equal(report.counts.only_baseline, 1);
  assert.equal(report.current.selected_records, 0); assert.ok(report.notes.some(n => n.includes('inactivity')));
  await assert.rejects(compareAnalyses(await run(a), await run(b), id.toUpperCase()), /comparison_reference_unobserved/);
});
test('UTXO input and output amounts stay in separate groups', async () => {
  const a = graph(); a.edges[0].kind = 'utxo_input'; a.edges[1].kind = 'utxo_output'; a.edges[2].kind = 'utxo_output';
  const report = await compareAnalyses(await run(a), await run(a, currentId));
  assert.equal(report.amounts.length, 2); assert.equal(report.amounts.find(r => r.kind === 'utxo_input').amount_base_units.baseline, '1000000000000000000');
  assert.equal(report.amounts.find(r => r.kind === 'utxo_output').amount_base_units.baseline, '5000000000000000000');
  assert.ok(!Object.hasOwn(report, 'total_volume'));
});
test('block conflicts use overlapping retained anchors and do not claim a canonical reorganization', async () => {
  const a = graph(), b = structuredClone(a), hash = '0x' + 'f'.repeat(64);
  for (const edge of b.edges) edge.block_hash = hash; b.snapshots[0].anchor.hash = hash;
  const report = await compareAnalyses(await run(a), await run(b, currentId));
  assert.equal(report.blocks.overlapping_heights, 1); assert.equal(report.blocks.conflicts.length, 1);
  assert.equal(report.blocks.conflicts[0].current_hash, hash); assert.equal(report.counts.changed, 3);
  assert.ok(report.notes.some(n => n.includes('canonical block')));
});
test('incompatible sources/contracts, corrupt digests and inconsistent retained data fail closed', async () => {
  const a = await run(graph()), corrupt = structuredClone(a); corrupt.graph.edges[0].amount_base_units = '7';
  await assert.rejects(compareAnalyses(a, corrupt), /analysis_integrity_failed/);
  for (const field of ['asset', 'network', 'source']) {const b = structuredClone(a.graph); b[field] = field === 'asset' ? 'BTC' : 'other-source'; if (field === 'asset') {for (const n of b.nodes) n.id = n.id.replace('ETH:', 'BTC:'); for (const e of b.edges) {e.from = e.from.replace('ETH:', 'BTC:'); e.to = e.to.replace('ETH:', 'BTC:');}} await assert.rejects(compareAnalyses(a, await run(b, currentId)), /incompatible_comparison_sources/);}
  const token = graph(); token.asset = 'USDT'; for (const n of token.nodes) n.id = n.id.replace('ETH:', 'USDT:'); for (const e of token.edges) {e.from = e.from.replace('ETH:', 'USDT:'); e.to = e.to.replace('ETH:', 'USDT:');}
  token.snapshots[0].scope.contract = '0x' + '1'.repeat(40); const other = structuredClone(token); other.snapshots[0].scope.contract = '0x' + '2'.repeat(40);
  await assert.rejects(compareAnalyses(await run(token), await run(other, currentId)), /incompatible_comparison_contracts/);
  delete other.snapshots[0].scope.contract; assert.ok((await compareAnalyses(await run(token), await run(other, currentId))).notes.some(n => n.includes('Contract metadata is missing')));
  const inconsistent = graph(); inconsistent.edges[0].block_hash = '0x' + 'f'.repeat(64);
  await assert.rejects(compareAnalyses(a, await run(inconsistent)), /inconsistent_retained_blocks/);
  const duplicate = graph(); duplicate.edges.push(duplicate.edges[0]); await assert.rejects(compareAnalyses(a, await run(duplicate)), /invalid_retained_event/);
});
test('empty samples, missing legacy page metadata and reversed time remain explicit', async () => {
  const a = graph(); a.edges = []; a.nodes = [];
  const report = await compareAnalyses(await run(a, baselineId, 2000), await run(a, currentId, 1000));
  assert.equal(report.baseline.requested_pages, null); assert.equal(report.baseline.block_range, null); assert.deepEqual(report.events, []);
  assert.equal(report.blocks.overlapping_heights, 1); assert.ok(report.notes.some(n => n.includes('saved before')));
});
test('complete maximum-size event unions are bounded without silent truncation', async () => {
  const a = graph(), b = graph();
  for (const [side, prefix] of [[a, 'a'], [b, 'b']]) side.edges = Array.from({length: 4000}, (_, i) => ({...side.edges[0], event_id: `${prefix}-${i}`}));
  const report = await compareAnalyses(await run(a), await run(b, currentId));
  assert.equal(report.events.length, 8000); assert.equal(report.counts.only_baseline, 4000); assert.ok(JSON.stringify(report).length < report.limits.response_bytes);
  b.edges.push({...b.edges[0], event_id: 'over-capacity'}); await assert.rejects(compareAnalyses(await run(a), await run(b)), /invalid_retained_graph/);
});
test('private comparison API enforces scope and organization, verifies database manifests, audits and performs no upstream reads', async () => {
  const h = await setup(); try {
    const cookie = await h.login(), first = await (await h.call('/v1/analyses', 'POST', {asset: 'ETH', pages: 1}, cookie)).json(), second = await (await h.call('/v1/analyses', 'POST', {asset: 'ETH', pages: 2}, cookie)).json();
    const path = `/v1/atlas/compare?baseline=${first.id}&current=${second.id}`, calls = h.calls();
    assert.equal((await h.call(path)).status, 401);
    const key = async scopes => (await (await h.call('/keys', 'POST', {label: 'Comparison tests', days: 1, password: credentials.password, scopes}, cookie)).json()).key;
    for (const scopes of [['analyses:read'], ['scores:read']]) assert.equal((await h.call(path, 'GET', undefined, await key(scopes))).status, 403);
    const access = await key(['analyses:read', 'scores:read']), response = await h.call(path, 'GET', undefined, access); assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/); assert.equal((await response.json()).counts.only_current, 39); assert.equal(h.calls(), calls);
    assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='atlas.compare.read'").get().n, 1);
    assert.equal((await h.call(path + '&baseline=' + first.id, 'GET', undefined, cookie)).status, 400);
    assert.equal((await h.call(path + '&extra=1', 'GET', undefined, cookie)).status, 400);
    assert.equal((await h.call(path + '&reference=', 'GET', undefined, cookie)).status, 400);
    assert.equal((await h.call(path, 'POST', {}, cookie)).status, 405);
    assert.equal((await h.call(path, 'GET', undefined, cookie, {headers: {'x-porb-tenant': crypto.randomUUID()}})).status, 409);
    h.sqlite.prepare('UPDATE analyses SET digest=? WHERE id=?').run('0'.repeat(64), first.id);
    assert.equal((await h.call(path, 'GET', undefined, cookie)).status, 409);
    h.sqlite.prepare('UPDATE analyses SET digest=? WHERE id=?').run(first.digest, first.id);
    const payload = structuredClone(first); payload.graph.edges[0].amount_base_units = '1';
    h.sqlite.prepare('UPDATE analysis_parts SET payload=? WHERE analysis_id=? AND part=0').run(JSON.stringify(payload), first.id);
    assert.equal((await h.call(path, 'GET', undefined, cookie)).status, 409);
    const other = crypto.randomUUID(); h.sqlite.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(other, 'Other fixture tenant', 'research', Date.now());
    h.sqlite.prepare('UPDATE analyses SET tenant_id=? WHERE id=?').run(other, first.id);
    assert.equal((await h.call(path, 'GET', undefined, cookie)).status, 404); assert.equal(h.calls(), calls);
  } finally {h.sqlite.close();}
});
test('comparison has a tenant-wide 20-per-minute budget', async () => {
  const h = await setup(); try {
    const cookie = await h.login(), first = await (await h.call('/v1/analyses', 'POST', {asset: 'ETH', pages: 1}, cookie)).json(), path = `/v1/atlas/compare?baseline=${first.id}&current=${first.id}`;
    for (let i = 0; i < 20; i++) assert.equal((await h.call(path, 'GET', undefined, cookie)).status, 200);
    const response = await h.call(path, 'GET', undefined, cookie); assert.equal(response.status, 429); assert.ok(Number(response.headers.get('retry-after')) > 0);
  } finally {h.sqlite.close();}
});
