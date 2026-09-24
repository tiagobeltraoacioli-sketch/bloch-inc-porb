/* Bounded paths through synthetic account-transfer fixtures only. */
(function (root) {
  const ACCOUNT_ASSETS = new Set(['eth', 'usdt', 'usdc']);
  const MAX_QUEUED_STATES = 50000;

  function tracePaths({transfers, walletById, asset, source, target, maxHops = 3, maxPaths = 5}) {
    if (!ACCOUNT_ASSETS.has(asset) || !Array.isArray(transfers) || transfers.length > 1000
        || !(walletById instanceof Map) || !Number.isInteger(maxHops) || maxHops < 1 || maxHops > 3
        || !Number.isInteger(maxPaths) || maxPaths < 1 || maxPaths > 10) {
      throw new Error('Unsupported or unbounded path query');
    }
    const start = walletById.get(source);
    const finish = walletById.get(target);
    if (!start || !finish || start === finish || start.asset !== asset || finish.asset !== asset) {
      throw new Error('Distinct references in one account asset are required');
    }
    const adjacency = new Map();
    for (const tx of transfers) {
      const from = walletById.get(tx.from);
      const to = walletById.get(tx.to);
      if (!from || !to || from.asset !== asset || to.asset !== asset) continue;
      if (typeof tx.id !== 'string' || typeof tx.observed !== 'string'
          || !/^\d{4}-\d{2}-\d{2}$/.test(tx.observed)
          || !Number.isSafeInteger(tx.amount) || tx.amount <= 0) {
        throw new Error('Invalid synthetic transfer');
      }
      if (!adjacency.has(tx.from)) adjacency.set(tx.from, []);
      adjacency.get(tx.from).push(tx);
    }
    for (const edges of adjacency.values()) {
      edges.sort((a, b) => a.observed.localeCompare(b.observed) || a.id.localeCompare(b.id));
    }
    const queue = [{node: source, path: [], seen: new Set([source]), lastDay: null}];
    const paths = [];
    while (queue.length && paths.length < maxPaths) {
      const current = queue.shift();
      if (current.path.length >= maxHops) continue;
      for (const tx of adjacency.get(current.node) || []) {
        // Day-only fixtures cannot establish order between events on the same day.
        if (current.seen.has(tx.to) || (current.lastDay && tx.observed <= current.lastDay)) continue;
        const path = [...current.path, tx];
        if (tx.to === target) {
          paths.push(path);
          if (paths.length >= maxPaths) break;
        } else {
          queue.push({node: tx.to, path, seen: new Set([...current.seen, tx.to]), lastDay: tx.observed});
          if (queue.length > MAX_QUEUED_STATES) throw new Error('Path search budget exceeded');
        }
      }
    }
    return {
      classification: 'synthetic_temporal_association_only',
      asset, source, target, maxHops, maxPaths,
      paths,
      caveat: 'Daily fixture order is known only across different days; paths do not prove value continuity, ownership, intent, or AML risk.',
    };
  }

  root.GraphusFlow = {tracePaths};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.GraphusFlow;
})(typeof globalThis !== 'undefined' ? globalThis : window);
