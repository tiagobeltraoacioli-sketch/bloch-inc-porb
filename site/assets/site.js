const $ = (selector) => document.querySelector(selector);
const format = new Intl.NumberFormat('en-US');
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

function renderMetrics(data) {
  const m = data.metrics;
  const items = [
    ['TRANSACTIONS OBSERVED', format.format(m.transactions_observed), 'Synthetic sample, not chain volume', ''],
    ['WALLETS IN SAMPLE', format.format(m.wallets_observed), 'Fictional identifiers only', ''],
    ['TRANSACTIONS WITH SIGNALS', format.format(m.transactions_with_signals), 'Advisory flags, not findings of crime', 'red'],
    ['CASES FOR REVIEW', format.format(m.review_queue), 'Illustrative human queue', 'blue'],
    ['MEDIAN RED SCORE', String(m.red_median), '0–1000 / transaction risk', 'red'],
    ['MEDIAN BLUE SCORE', String(m.blue_median), '0–1000 / wallet context', 'blue'],
    ['LIVE PROVIDER FEEDS', '0', 'No third-party API connected', ''],
    ['CONSENSUS DEPENDENCY', '0', 'External and optional service', ''],
  ];
  $('#metrics').innerHTML = items.map(([label, value, sub, color]) => `<article class="metric ${color}"><span class="label">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><span class="sub">${escapeHtml(sub)}</span></article>`).join('');
  const p = data.provenance;
  $('#overview-source').textContent = `SOURCE ${p.source_ids.join(', ')} · OBSERVED ${p.observed_at} · METHOD ${p.model_version} · SAMPLE ${format.format(p.sample_size)} TRANSACTIONS · MISSINGNESS ${p.missingness}`;
}

function lineChart(points) {
  const width = 900, height = 240, left = 43, right = 14, top = 15, bottom = 32;
  const x = (index) => left + index * (width - left - right) / (points.length - 1);
  const y = (value) => top + (1000 - value) * (height - top - bottom) / 1000;
  const path = (key) => points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(' ');
  const grid = [0,250,500,750,1000].map((v) => `<line class="gridline" x1="${left}" y1="${y(v)}" x2="${width-right}" y2="${y(v)}"/><text x="0" y="${y(v)+4}">${v}</text>`).join('');
  const labels = points.map((point,index) => `<text x="${x(index)}" y="${height-4}" text-anchor="middle">${escapeHtml(point.day)}</text>`).join('');
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${grid}<path class="redline" d="${path('red')}"/><path class="blueline" d="${path('blue')}"/>${labels}</svg>`;
}

function barRows(rows, label, max, kind) {
  return rows.map((row) => `<div class="bar-row ${kind}"><span>${escapeHtml(label(row))}</span><span class="track"><span class="fill" style="width:${Math.round(row.count / max * 100)}%"></span></span><strong>${format.format(row.count)}</strong></div>`).join('');
}

function renderTables(data) {
  $('#trend-table tbody').innerHTML = data.trend.map((r) => `<tr><td>${escapeHtml(r.day)}</td><td>${r.red}</td><td>${r.blue}</td><td>${r.signals}</td></tr>`).join('');
  $('#risk-table tbody').innerHTML = data.risk_distribution.map((r) => `<tr><td>${escapeHtml(r.label)}</td><td>${format.format(r.count)}</td></tr>`).join('');
  $('#typology-table tbody').innerHTML = data.typologies.map((r) => `<tr><td>${escapeHtml(r.code)}</td><td>${escapeHtml(r.name)}</td><td>${r.count}</td></tr>`).join('');
  $('#source-table tbody').innerHTML = data.sources.map((r) => `<tr><td>${escapeHtml(r.source_id)}</td><td>${escapeHtml(r.purpose)}</td><td>${escapeHtml(r.observed_at.slice(0,10))}</td><td>${escapeHtml(r.expires_at.slice(0,10))}</td></tr>`).join('');
  $('#review-table tbody').innerHTML = data.reviews.map((r) => `<tr><td>${escapeHtml(r.case_id)}</td><td>${escapeHtml(r.signal)}</td><td>${escapeHtml(r.state)}</td><td>${r.age_hours} h</td></tr>`).join('');
}

async function main() {
  try {
    const response = await fetch('assets/demo.json', {cache:'no-store'});
    if (!response.ok) throw new Error('fixture unavailable');
    const data = await response.json();
    if (data.mode !== 'synthetic_demo') throw new Error('unexpected data mode');
    renderMetrics(data);
    $('#trend-chart').innerHTML = lineChart(data.trend);
    $('#risk-chart').innerHTML = barRows(data.risk_distribution, (r) => r.label, Math.max(...data.risk_distribution.map((r) => r.count)), 'red');
    $('#typology-chart').innerHTML = barRows(data.typologies, (r) => r.code + ' ' + r.name, Math.max(...data.typologies.map((r) => r.count)), 'blue');
    renderTables(data);
  } catch (error) {
    $('#overview-source').textContent = 'Synthetic fixture unavailable. Please reload the preview.';
    $('#metrics').innerHTML = '<p class="metric">Demo data could not be loaded.</p>';
  }
}
main();
