import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {tracePaths} = require('../graphus/assets/flow_paths.js');
const walletById = new Map([
  ['A', {asset: 'eth'}], ['B', {asset: 'eth'}], ['C', {asset: 'eth'}],
  ['D', {asset: 'eth'}], ['T', {asset: 'usdt'}],
]);
const transfers = [
  {id: 'e1', from: 'A', to: 'B', observed: '2026-09-01', amount: 10},
  {id: 'same-day', from: 'B', to: 'C', observed: '2026-09-01', amount: 10},
  {id: 'e2', from: 'B', to: 'C', observed: '2026-09-02', amount: 9},
  {id: 'direct', from: 'A', to: 'C', observed: '2026-09-04', amount: 7},
  {id: 'cycle', from: 'B', to: 'A', observed: '2026-09-03', amount: 8},
  {id: 'other-asset', from: 'T', to: 'A', observed: '2026-09-02', amount: 100},
];

test('returns deterministic, bounded, time-ordered account paths', () => {
  const query = {walletById, transfers, asset: 'eth', source: 'A', target: 'C', maxHops: 3};
  const found = tracePaths(query);
  assert.equal(found.classification, 'synthetic_temporal_association_only');
  assert.deepEqual(found.paths.map(path => path.map(tx => tx.id)), [['direct'], ['e1', 'e2']]);
  assert.deepEqual(tracePaths({...query, transfers: [...transfers].reverse()}).paths,
    found.paths);
  assert.deepEqual(tracePaths({...query, maxHops: 1}).paths.map(path => path.map(tx => tx.id)),
    [['direct']]);
  assert.equal(found.paths.some(path => path.some(tx => tx.id === 'same-day')), false);
});

test('rejects UTXO paths, mixed assets and unbounded queries', () => {
  assert.throws(() => tracePaths({walletById, transfers, asset: 'btc', source: 'A', target: 'C'}),
    /Unsupported/);
  assert.throws(() => tracePaths({walletById, transfers, asset: 'eth', source: 'A', target: 'T'}),
    /Distinct references/);
  assert.throws(() => tracePaths({walletById, transfers, asset: 'eth', source: 'A', target: 'C', maxHops: 4}),
    /Unsupported/);
  assert.throws(() => tracePaths({walletById, transfers: [...transfers, {id: 'bad', from: 'A', to: 'B', observed: '2026-09-05', amount: 0}], asset: 'eth', source: 'A', target: 'C'}),
    /Invalid synthetic transfer/);
});
