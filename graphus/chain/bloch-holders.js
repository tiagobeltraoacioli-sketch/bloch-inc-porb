const BASE = 'https://blochl1.com/indexer';
const HASH = /^[0-9a-f]{64}$/i;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const MAX_BYTES = 128 * 1024;

async function sourceJson(fetcher, path) {
  const response = await fetcher(`${BASE}/${path}`, {signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error('bloch_indexer_unavailable');
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_BYTES) throw new Error('bloch_indexer_response_too_large');
  const body = await response.text();
  if (new TextEncoder().encode(body).length > MAX_BYTES) throw new Error('bloch_indexer_response_too_large');
  try { return JSON.parse(body); }
  catch { throw new Error('invalid_bloch_indexer_response'); }
}

function validInteger(value) { return Number.isSafeInteger(value) && value >= 0; }

function validate(holders, health) {
  if (health?.ok !== true || health.live_head_available !== true || health.lag_slots !== 0
    || health.verification !== 'consensus replay and state-root verification'
    || !HASH.test(health.chain_tip || '') || !validInteger(health.indexed_to_height)
    || !validInteger(health.indexed_to_slot) || !Array.isArray(holders?.holders)
    || !HASH.test(holders.chain_tip || '') || !validInteger(holders.as_of_height)
    || !validInteger(holders.as_of_slot) || !validInteger(holders.returned)
    || !validInteger(holders.total_script_hashes_with_balance)
    || !DECIMAL.test(holders.indexed_total_sat || '')
    || holders.returned !== holders.holders.length || holders.returned > 64
    || holders.returned !== Math.min(64, holders.total_script_hashes_with_balance)
    || health.indexed_to_height < holders.as_of_height
    || health.indexed_to_slot < holders.as_of_slot
    || (health.indexed_to_height === holders.as_of_height
      && (holders.as_of_slot !== health.indexed_to_slot
        || holders.chain_tip.toLowerCase() !== health.chain_tip.toLowerCase()))) return false;
  let previous = null;
  const seen = new Set();
  for (const [index, row] of holders.holders.entries()) {
    if (row?.rank !== index + 1 || !HASH.test(row.script_hash || '')
      || !DECIMAL.test(row.balance_sat || '') || !validInteger(row.utxo_count)
      || BigInt(row.balance_sat) === 0n || row.utxo_count === 0
      || seen.has(row.script_hash.toLowerCase())) return false;
    const amount = BigInt(row.balance_sat);
    if (previous !== null && amount > previous) return false;
    previous = amount;
    seen.add(row.script_hash.toLowerCase());
  }
  if (holders.total_script_hashes_with_balance <= 64) {
    const sum = holders.holders.reduce((total, row) => total + BigInt(row.balance_sat), 0n);
    if (sum !== BigInt(holders.indexed_total_sat)) return false;
  }
  return true;
}

export async function queryBlochHolders({fetcher = fetch, now = () => new Date()} = {}) {
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const [holders, health] = await Promise.all([
        sourceJson(fetcher, 'holders?limit=64'), sourceJson(fetcher, 'health'),
      ]);
      if (validate(holders, health)) return {status: 200, body: {
        status: 'source-reported', asset: 'BLCH', network: 'bloch-mainnet',
        ranking_unit: 'script_hash', scope: 'indexed_canonical_state',
        independent_verification: false,
        source: 'bloch-historical-indexer', retrieved_at: now().toISOString(),
        anchor: {height: holders.as_of_height, slot: holders.as_of_slot, block_id: holders.chain_tip.toLowerCase()},
        coverage: {
          returned: holders.returned,
          positive_script_hashes_in_index: holders.total_script_hashes_with_balance,
          indexed_total_sat: holders.indexed_total_sat,
          lag_slots: health.lag_slots,
          health_head_advanced: health.indexed_to_height > holders.as_of_height,
          source_verification: health.verification,
          source: health.source || null,
        },
        holders: holders.holders.map(row => ({
          rank: row.rank, script_hash: row.script_hash.toLowerCase(),
          balance_sat: row.balance_sat, utxo_count: row.utxo_count,
        })),
        limitations: [
          'Ranking covers positive script hashes in the source index at one reported chain tip.',
          'A script hash is not a person, legal entity, or proven single-wallet owner.',
          'The indexer reports consensus replay and state-root verification; Graphus has not independently reproduced it.',
          'The chain tip can change on a reorganization; this snapshot is not a finality guarantee.',
        ],
      }};
    }
    return {status: 503, body: {error: 'bloch_indexer_anchor_changed'}};
  } catch (error) {
    return {status: 502, body: {error: error.message === 'bloch_indexer_response_too_large'
      ? error.message : 'bloch_indexer_unavailable'}};
  }
}
