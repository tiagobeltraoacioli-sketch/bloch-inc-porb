const $ = id => document.getElementById(id);
const el = (tag, text, cls) => {const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node;};
const labels = {shared: 'Unchanged', changed: 'Changed', only_baseline: 'Only in baseline', only_current: 'Only in current'};
const date = value => new Date(value).toLocaleString();
const signed = value => BigInt(value) > 0n ? '+' + value : String(value);
const save = (name, value, type) => {const url = URL.createObjectURL(new Blob([value], {type})), link = el('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);};
// Quoting alone does not prevent spreadsheet formula evaluation.
const csv = value => '"' + String(value ?? '').replace(/^[\s]*[=+@-]/, match => "'" + match).replaceAll('"', '""') + '"';
const table = (headers, rows) => {const box = el('div', undefined, 'atlas-compare-table'), table = el('table'), head = el('thead'), tr = el('tr'), body = el('tbody'); for (const header of headers) tr.append(el('th', header)); head.append(tr); for (const row of rows) {const tr = el('tr'); for (const value of row) {const td = el('td'); td.append(value instanceof Node ? value : String(value ?? 'Not observed')); tr.append(td);} body.append(tr);} table.append(head, body); box.append(table); return box;};

export function comparisonWorkspace(request) {
  let analysis = null, node = '', report = null, version = 0, busy = false, page = 0, referencePage = 0, key = '';
  const ready = () => Boolean(analysis && $('compare-baseline').value);
  function invalidate(message = 'Choose a baseline and compare the retained samples.') {
    version++; report = null; busy = false; page = 0; referencePage = 0;
    $('compare-result').hidden = true; $('compare-result').replaceChildren(); $('compare-ledger').replaceChildren(); $('compare-references').replaceChildren();
    $('compare-browser').hidden = true; $('compare-status').textContent = message;
    $('compare-json').disabled = true; $('compare-csv').disabled = true; $('compare-run').disabled = !ready();
  }
  function sync(runs, current, selectedNode) {
    const next = `${current?.id || ''}:${selectedNode || ''}`;
    const oldBaseline = $('compare-baseline').value;
    analysis = current; node = selectedNode || '';
    const candidates = runs.filter(run => run.asset === current?.asset && run.id !== current?.id);
    $('compare-baseline').replaceChildren(new Option(candidates.length ? 'Select a baseline' : 'No other saved sample of this asset', ''));
    for (const run of candidates) $('compare-baseline').append(new Option(`${run.asset} · ${date(run.created_at)} · ${run.records} records · ${run.id.slice(0, 8)}`, run.id));
    if (candidates.some(run => run.id === oldBaseline)) $('compare-baseline').value = oldBaseline;
    $('compare-baseline').disabled = !candidates.length; $('compare-reference').disabled = !current;
    $('compare-use-reference').disabled = !node;
    $('compare-current').textContent = current ? `Current: ${current.asset} · saved ${date(current.created_at)} · ${current.id}` : 'Select the current saved analysis above.';
    if (next !== key || oldBaseline !== $('compare-baseline').value) {key = next; $('compare-reference').value = ''; invalidate();}
    $('compare-run').disabled = !ready() || busy;
  }
  const matches = () => report?.events.filter(row => ($('compare-category').value === 'all' || row.status === $('compare-category').value)
    && $('compare-search').value.trim().toLowerCase().split(/\s+/).filter(Boolean).every(term => [row.event_id, ...Object.values(row.baseline || {}), ...Object.values(row.current || {})].some(value => String(value).toLowerCase().includes(term)))) || [];
  function ledger() {
    const rows = matches(), pages = Math.max(1, Math.ceil(rows.length / 20)); page = Math.min(page, pages - 1);
    $('compare-ledger').replaceChildren();
    for (const row of rows.slice(page * 20, page * 20 + 20)) {
      const details = el('details', undefined, 'atlas-compare-event'), summary = el('summary');
      summary.append(el('span', labels[row.status], 'atlas-record-badge'), el('code', row.event_id)); details.append(summary);
      details.addEventListener('toggle', () => {if (!details.open || details.childElementCount > 1) return;
        details.append(el('p', row.changed_fields.length ? 'Changed fields: ' + row.changed_fields.join(', ') : row.status === 'shared' ? 'All retained event fields match.' : 'This source event ID is observed on one side only.'));
        details.append(table(['Retained field', 'Baseline', 'Current'], ['from', 'to', 'kind', 'amount_base_units', 'txid', 'position', 'block_number', 'block_hash', 'block_time'].map(field => [field, row.baseline?.[field], row.current?.[field]])));
      }); $('compare-ledger').append(details);
    }
    if (!rows.length) $('compare-ledger').append(el('p', 'No events match these filters.'));
    $('compare-page').textContent = `${rows.length} matching events · page ${page + 1} of ${pages}`;
    $('compare-previous').disabled = page === 0; $('compare-next').disabled = page + 1 >= pages; $('compare-csv').disabled = !rows.length;
  }
  function referenceRows() {
    const query = $('compare-reference-search').value.trim().toLowerCase(), rows = report?.references.filter(row => row.id.toLowerCase().includes(query)) || [], pages = Math.max(1, Math.ceil(rows.length / 20)); referencePage = Math.min(referencePage, pages - 1);
    $('compare-references').replaceChildren(table(['Reference', 'Presence', 'Records B → C (Δ)', 'Neighbors B → C (Δ)', 'Scope'], rows.slice(referencePage * 20, referencePage * 20 + 20).map(row => {
      const button = el('button', 'Focus reference'); button.onclick = () => {$('compare-reference').value = row.id; invalidate(); compare();};
      return [row.id, row.presence === 'both' ? 'Both samples' : labels[row.presence], `${row.records.baseline} → ${row.records.current} (${signed(row.records.delta)})`, `${row.neighbors.baseline} → ${row.neighbors.current} (${signed(row.neighbors.delta)})`, button];
    })));
    $('compare-reference-page').textContent = `${rows.length} references · page ${referencePage + 1} of ${pages}`; $('compare-reference-previous').disabled = referencePage === 0; $('compare-reference-next').disabled = referencePage + 1 >= pages;
  }
  function render() {
    const box = $('compare-result'); box.hidden = false; box.replaceChildren();
    const metrics = el('div', undefined, 'atlas-summary');
    for (const [key, value] of Object.entries(report.counts)) {const card = el('div'); card.append(el('strong', String(value)), el('span', labels[key])); metrics.append(card);} box.append(metrics);
    box.append(el('p', report.reference ? 'Scope: ' + report.reference : 'Scope: all retained events in the two samples.'), el('p', `Across the complete samples: ${report.blocks.overlapping_heights} overlapping observed block heights · ${report.blocks.conflicts.length} conflicting hashes. Event counts use exact source event IDs.`));
    if (report.blocks.conflicts.length) {const details = el('details'); details.append(el('summary', 'Inspect block hash disagreements'), table(['Height', 'Baseline hash', 'Current hash'], report.blocks.conflicts.map(row => [row.height, row.baseline_hash, row.current_hash]))); box.append(details);}
    box.append(el('h3', 'Amounts by kind and direction'), el('p', 'Exact base units. Delta = current − baseline. Input and output records remain separate; these totals are not net transfer volume.'), table(['Kind / direction', 'Records B → C', 'Baseline amount', 'Current amount', 'Amount Δ'], report.amounts.map(row => [`${row.kind} / ${row.direction}`, `${row.records.baseline} → ${row.records.current}`, row.amount_base_units.baseline, row.amount_base_units.current, signed(row.amount_base_units.delta)])));
    const provenance = el('details'); provenance.append(el('summary', 'Source coverage, dataset hashes and interpretation'));
    for (const side of ['baseline', 'current']) {const run = report[side], link = el('a', 'Inspect retained analysis ↗'); link.href = '/portal/?' + new URLSearchParams({view: 'analyses', analysis: run.id, ...(report.reference ? {node: report.reference} : {})}); provenance.append(el('h3', `${side === 'baseline' ? 'Baseline' : 'Current'} · ${date(run.created_at)}`), link, el('pre', JSON.stringify(run, null, 2)));}
    for (const note of report.notes) provenance.append(el('p', note)); provenance.append(el('p', `Report SHA-256: ${report.report_sha256}`, 'atlas-record-meta')); box.append(provenance);
    $('compare-browser').hidden = false; $('compare-json').disabled = false; ledger(); referenceRows();
  }
  async function compare() {
    if (!ready() || busy) return;
    invalidate('Comparing retained evidence and verifying dataset hashes…'); const run = version; busy = true; $('compare-run').disabled = true;
    const query = new URLSearchParams({baseline: $('compare-baseline').value, current: analysis.id}), reference = $('compare-reference').value.trim(); if (reference) query.set('reference', reference);
    try {const result = await request('/v1/atlas/compare?' + query); if (run !== version) return; report = result; render(); $('compare-status').textContent = `Compared ${result.baseline.selected_records} baseline and ${result.current.selected_records} current records. No new collection was started.`;}
    catch (error) {if (run === version) $('compare-status').textContent = `Comparison unavailable: ${error.message}. No previous result is displayed.`;}
    finally {if (run === version) {busy = false; $('compare-run').disabled = !ready();}}
  }
  $('compare-run').onclick = compare;
  $('compare-baseline').onchange = () => invalidate(); $('compare-reference').oninput = () => invalidate();
  $('compare-use-reference').onclick = () => {$('compare-reference').value = node; invalidate();};
  $('compare-clear-reference').onclick = () => {$('compare-reference').value = ''; invalidate();};
  $('compare-category').onchange = () => {page = 0; ledger();}; $('compare-search').oninput = () => {page = 0; ledger();};
  $('compare-previous').onclick = () => {page--; ledger();}; $('compare-next').onclick = () => {page++; ledger();};
  $('compare-reference-search').oninput = () => {referencePage = 0; referenceRows();}; $('compare-reference-previous').onclick = () => {referencePage--; referenceRows();}; $('compare-reference-next').onclick = () => {referencePage++; referenceRows();};
  $('compare-json').onclick = () => {if (report) save(`atlas-comparison-${report.report_sha256.slice(0, 12)}.json`, JSON.stringify(report, null, 2), 'application/json');};
  $('compare-csv').onclick = () => {
    if (!report) return; const fields = ['from', 'to', 'kind', 'amount_base_units', 'txid', 'position', 'block_number', 'block_hash', 'block_time'];
    const headers = ['report_sha256', 'baseline_id', 'current_id', 'asset', 'reference', 'event_id', 'status', 'changed_fields', ...['baseline', 'current'].flatMap(side => fields.map(field => side + '_' + field))];
    const rows = matches().map(row => [report.report_sha256, report.baseline.id, report.current.id, report.asset, report.reference, row.event_id, row.status, row.changed_fields.join('|'), ...['baseline', 'current'].flatMap(side => fields.map(field => row[side]?.[field]))]);
    save('atlas-comparison-matching-events.csv', [headers, ...rows].map(row => row.map(csv).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  };
  return {sync, reset() {key = ''; analysis = null; node = ''; $('compare-baseline').replaceChildren(); $('compare-reference').value = ''; $('compare-search').value = ''; $('compare-reference-search').value = ''; invalidate('');}};
}
