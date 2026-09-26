import {atlasSelection, atlasSubject, atlasReviews, atlasRecords, atlasRecordSummary, atlasLink} from './atlas-context.js';
import {comparisonWorkspace} from './atlas-comparison.js';
const $ = id => document.getElementById(id);
const el = (tag, text, cls) => {const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node;};
const date = value => new Date(value).toLocaleString();
const number = value => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US', {maximumFractionDigits: 2}) : 'Unavailable';
let data = null, editing = null, analysis = null, selectedNode = '', runs = [], recordPage = 0;
let contextVersion = 0, selectionVersion = 0, editorVersion = 0, loadingAnalysis = false;
let sourceVersion = 0, sourceExpiry = null;
let issuingGrant = false, savingRecord = false;
let pendingSelection = atlasSelection(new URLSearchParams(location.search));
const canWrite = () => Boolean(data?.granted_scopes.includes('cases:write'));
const subject = () => atlasSubject(analysis, selectedNode);
const selected = () => analysis?.scores.rows.find(row => row.id === selectedNode);
const note = (id, text) => {$(id).textContent = text;};

function dismissToken() {$('private-grant-token').textContent = ''; $('private-grant-token').hidden = true; $('grant-dismiss').hidden = true;}
function lock(message, login = false) {
  contextVersion++; selectionVersion++; sourceVersion++; sourceExpiry = null; data = null; analysis = null; selectedNode = ''; runs = []; editing = null;
  comparison.reset();
  for (const id of ['private-records', 'private-context', 'private-grant-list', 'atlas-selected-evidence', 'private-source-output', 'private-summary']) $(id).replaceChildren();
  for (const id of ['atlas-saved-analysis', 'atlas-saved-reference', 'grant-review']) $(id).replaceChildren();
  for (const id of ['atlas-reference-search', 'record-search']) $(id).value = '';
  for (const id of ['grant-scope', 'grant-eligibility', 'private-write-status', 'private-grant-status', 'private-source-status', 'atlas-saved-status']) $(id).textContent = '';
  $('record-selected-only').checked = false;
  for (const id of ['private-record', 'private-grant-form', 'private-source-form']) $(id).reset();
  dismissToken(); $('private-workspace').hidden = true; $('private-login').hidden = !login; $('private-reload').hidden = login;
  note('private-status', message);
}
async function request(path, method = 'GET', body) {
  const version = contextVersion;
  const response = await fetch('/api/porb' + path, {method, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    headers: {accept: 'application/json', ...(data ? {'x-porb-tenant': data.tenant.id} : {}), ...(method === 'GET' ? {} : {'content-type': 'application/json', 'x-porb-action': '1'})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  const result = await response.json();
  if (version !== contextVersion) throw new Error('Workspace changed. Reload before continuing.');
  if (!response.ok) {
    const message = result.error === 'organization_changed_reload' ? 'Your active organization changed. Reload to open its Atlas.' : response.status === 401 ? 'Sign in to open your organization’s private records.' : result.error || `HTTP ${response.status}`;
    if (response.status === 401 || result.error === 'organization_changed_reload') lock(message, response.status === 401);
    const error = new Error(message); error.status = response.status; throw error;
  }
  return result;
}
const api = (path, method, body) => request('/v1/atlas/' + path, method, body);
const comparison = comparisonWorkspace(request);
function download(name, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type: 'application/json'})), link = el('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function clearEditor() {
  editorVersion++; editing = null; $('private-record').reset(); note('private-save', 'Save record'); note('private-editor-title', 'Create a record');
  note('private-editor-note', 'Purpose, lawful basis and source rights are your declarations. A new review starts open until you explicitly record a decision.');
}
function edit(record) {
  editorVersion++; editing = record;
  for (const [id, key] of [['private-kind', 'kind'], ['private-subject', 'subject'], ['private-body', 'body'], ['private-purpose', 'purpose'], ['private-basis', 'lawful_basis'], ['private-licence', 'source_licence'], ['private-state', 'status']]) $(id).value = record[key];
  $('private-retention').value = Math.max(1, Math.min(365, Math.ceil((record.expires_at - Date.now()) / 86400000)));
  note('private-save', 'Save revision'); note('private-editor-title', `Edit record · revision ${record.revision}`);
  note('private-editor-note', 'Saving restarts retention from this write. Changing review scope or state can block existing grants.');
  $('private-editor-title').scrollIntoView({block: 'start'}); $('private-body').focus();
}
function filters() {return {query: $('record-search').value, kind: $('record-kind').value, status: $('record-state').value,
  subject: $('record-selected-only').checked ? subject() || '' : null};}
function renderRecords() {
  if (!data) return;
  const rows = atlasRecords(data.records, filters()), pages = Math.max(1, Math.ceil(rows.length / 10)); recordPage = Math.min(recordPage, pages - 1);
  const stats = atlasRecordSummary(data.records), labels = {active: 'Active records', open: 'Open records', reviews: 'Completed reviews', expiring: 'Expire within 7 days'};
  $('private-summary').replaceChildren(...Object.entries(stats).map(([key, value]) => {const card = el('div'); card.append(el('strong', String(value)), el('span', labels[key])); return card;}));
  note('private-record-count', `${rows.length} matching records · ${stats.active} active records in this organization.`);
  note('record-page', `Page ${recordPage + 1} of ${pages}`); $('record-previous').disabled = recordPage === 0; $('record-next').disabled = recordPage + 1 >= pages; $('record-export').disabled = !rows.length;
  $('private-records').replaceChildren();
  for (const record of rows.slice(recordPage * 10, recordPage * 10 + 10)) {
    const card = el('article', undefined, 'atlas-panel'); card.append(el('span', record.kind, 'atlas-record-badge'), el('span', record.status, 'atlas-record-badge'), el('h3', record.subject), el('p', record.body, 'atlas-record-body'));
    const expiry = el('p', `Revision ${record.revision} · updated ${date(record.updated_at)} · expires ${date(record.expires_at)}`, 'atlas-record-meta');
    if (record.expires_at <= Date.now() + 7 * 86400000) {expiry.classList.add('atlas-expiring'); expiry.append(' · Expires within 7 days');}
    card.append(expiry);
    const details = el('details'); details.append(el('summary', 'Purpose, source rights and record identity'), el('p', `Purpose: ${record.purpose}`), el('p', `Lawful basis: ${record.lawful_basis}`), el('p', `Source rights: ${record.source_licence}`), el('p', `Record ID: ${record.id}`, 'atlas-record-meta')); card.append(details);
    if (canWrite()) {
      const actions = el('div', undefined, 'atlas-actions'), update = el('button', 'Edit record'), remove = el('button', 'Delete record');
      update.onclick = () => edit(record);
      remove.onclick = async () => {remove.disabled = true; try {await api(`records/${record.id}`, 'DELETE', {revision: record.revision}); if (editing?.id === record.id) clearEditor(); await load(); note('private-write-status', 'Record deleted; audit event retained.');} catch (error) {note('private-write-status', error.message); remove.disabled = false;}};
      actions.append(update, remove); card.append(actions);
    }
    $('private-records').append(card);
  }
  if (!rows.length) $('private-records').append(el('p', data.records.length ? 'No records match these filters.' : 'No retained Atlas records in this organization.'));
}
function renderReviews() {
  const scope = subject(), days = Number($('grant-days').value), old = $('grant-review').value;
  const reviews = atlasReviews(data?.records || [], scope, days);
  $('grant-review').replaceChildren(new Option(reviews.length ? 'Choose a current review' : 'No eligible review', ''));
  for (const review of reviews) $('grant-review').append(new Option(`${review.status} · ${review.body.slice(0, 90)} · expires ${date(review.expires_at)}`, review.id));
  if (reviews.some(review => review.id === old)) $('grant-review').value = old;
  else if (reviews.length === 1) $('grant-review').value = reviews[0].id;
  $('grant-review').disabled = !reviews.length; $('grant-issue').disabled = !scope || !$('grant-review').value || loadingAnalysis || issuingGrant;
  note('grant-scope', scope ? `${analysis.asset} · ${selected().address} · saved ${date(analysis.created_at)}` : 'No saved reference selected.');
  note('grant-eligibility', !scope ? 'Select a saved reference to see its eligible reviews.' : !reviews.length ? 'A reviewed or resolved record for this exact reference must remain valid throughout the requested lifetime. Create a review or shorten the grant lifetime.' : `${reviews.length} current review(s) cover the requested ${days} day(s). Eligibility is checked again when the token is issued.`);
}
function renderSelection() {
  const row = selected(), scope = subject(); $('atlas-selected-evidence').replaceChildren(); $('atlas-selected-evidence').hidden = !row;
  $('atlas-start-review').disabled = !scope || !canWrite() || loadingAnalysis; $('atlas-clear-reference').disabled = !analysis && !loadingAnalysis;
  $('record-selected-only').disabled = !scope; if (!scope) $('record-selected-only').checked = false;
  $('atlas-open-graph').hidden = !row;
  if (row) {
    const box = $('atlas-selected-evidence'); box.append(el('h3', row.address)); const grid = el('div', undefined, 'atlas-selected-grid');
    for (const [label, value] of [['Red · structural deviation', number(row.red)], ['Blue · record completeness', number(row.blue)], ['Observed records', String(analysis.graph.edges.filter(edge => edge.from === row.id || edge.to === row.id).length)]]) {const item = el('div'); item.append(el('span', label), el('strong', value)); grid.append(item);}
    box.append(grid, el('p', `${analysis.asset} · ${row.kind} · ${analysis.graph.source} · ${date(analysis.created_at)}`), el('p', `Dataset SHA-256: ${analysis.digest}`, 'atlas-record-meta'), el('p', analysis.graph.coverage), el('p', 'Scores describe the retained sample. They do not establish ownership or a validated AML assessment.', 'atlas-note'));
    const query = new URLSearchParams({view: 'analyses', analysis: analysis.id, node: row.id}); $('atlas-open-graph').href = '/portal/?' + query;
  }
  renderReviews(); renderRecords(); comparison.sync(runs, analysis, selectedNode);
}
function referenceOptions() {
  const query = $('atlas-reference-search').value.trim().toLowerCase(), rows = (analysis?.scores.rows || []).filter(row => !query || row.address.toLowerCase().includes(query));
  const active = selected(); if (active && !rows.some(row => row.id === active.id)) rows.unshift(active);
  $('atlas-saved-reference').replaceChildren(new Option('Select a reference', ''));
  for (const row of rows) $('atlas-saved-reference').append(new Option(row.address, row.id));
  $('atlas-saved-reference').value = selectedNode; $('atlas-saved-reference').disabled = !analysis || !rows.length;
  note('atlas-saved-status', analysis ? `${rows.length} reference option(s) · ${analysis.records} retained records · ${analysis.pages} source pages. Selected references stay visible while searching.` : runs.length ? 'Choose a retained analysis to inspect its references.' : 'No retained analyses. Collect a sample in Data & scores first.');
}
async function selectAnalysis(id, node = null) {
  const run = ++selectionVersion; analysis = null; selectedNode = ''; loadingAnalysis = Boolean(id); dismissToken(); $('atlas-reference-search').value = ''; $('atlas-reference-search').disabled = true; referenceOptions(); renderSelection();
  if (!id) {loadingAnalysis = false; history.replaceState(null, '', atlasLink()); return;}
  note('atlas-saved-status', 'Opening saved evidence…');
  try {
    const result = await request('/v1/analyses/' + id); if (run !== selectionVersion) return;
    analysis = result; selectedNode = result.scores.rows.some(row => row.id === node) ? node : ''; loadingAnalysis = false;
    $('atlas-reference-search').disabled = false; referenceOptions(); renderSelection(); history.replaceState(null, '', atlasLink(id, selectedNode));
    if (node && !selectedNode) note('atlas-saved-status', 'That reference is absent from this saved analysis. Select one of its retained references.');
  } catch (error) {if (run === selectionVersion) {loadingAnalysis = false; referenceOptions(); renderSelection(); note('atlas-saved-status', `Saved evidence unavailable: ${error.message}`);}}
}
async function loadAnalyses() {
  const result = await request('/v1/analyses'); runs = result.analyses;
  $('atlas-saved-analysis').replaceChildren(new Option('Select an analysis', ''));
  for (const run of runs) $('atlas-saved-analysis').append(new Option(`${run.asset} · ${date(run.created_at)} · ${run.wallets} references`, run.id));
  if (analysis && runs.some(run => run.id === analysis.id)) $('atlas-saved-analysis').value = analysis.id;
  else if (analysis) await selectAnalysis('');
  if (pendingSelection.analysis) {const initial = pendingSelection; pendingSelection = {}; if (runs.some(run => run.id === initial.analysis)) {$('atlas-saved-analysis').value = initial.analysis; await selectAnalysis(initial.analysis, initial.node);} else note('atlas-saved-status', 'The linked analysis is no longer retained or belongs to another organization.');}
  else referenceOptions();
  comparison.sync(runs, analysis, selectedNode);
}
async function load() {
  try {
    data = await api('private'); $('private-login').hidden = true; $('private-reload').hidden = true; $('private-workspace').hidden = false;
    note('private-status', `${data.tenant.name} · ${data.records.length} retained Atlas records.`);
    for (const control of $('private-record').elements) control.disabled = !canWrite();
    const {records, ...context} = data; note('private-context', JSON.stringify(context, null, 2)); $('private-purge').hidden = data.access_audit === null;
    $('private-grants').hidden = data.score_grants === null; $('private-grants-link').hidden = data.score_grants === null;
    $('private-grant-list').replaceChildren();
    for (const grant of data.score_grants || []) {
      const card = el('article', undefined, 'atlas-panel'); card.append(el('h3', grant.named_grantee), el('p', grant.purpose), el('p', `${grant.analysis_id} / ${grant.node_id}`), el('p', `Expires ${date(grant.expires_at)}`));
      const review = data.records.find(record => record.id === grant.review_record_id);
      const valid = review && review.expires_at > Date.now() && review.kind === 'review' && ['reviewed', 'resolved'].includes(review.status) && review.subject === `${grant.analysis_id}:${grant.node_id}`;
      card.append(el('p', valid ? 'Review state permits access; issuer role and retained analysis are checked on each read.' : 'Access blocked: the scoped review is no longer current.', 'atlas-note'));
      const button = el('button', 'Revoke grant'); button.onclick = async () => {button.disabled = true; try {await api(`grants/${grant.id}/revoke`, 'POST', {}); dismissToken(); await load(); note('private-grant-status', 'Grant revoked immediately.');} catch (error) {note('private-grant-status', error.message); button.disabled = false;}};
      card.append(button); $('private-grant-list').append(card);
    }
    renderSelection();
  } catch (error) {if (data) note('private-status', `Refresh failed: ${error.message}. Previously loaded records remain visible.`); else {note('private-status', error.message); if (error.status !== 401) $('private-reload').hidden = false;} throw error;}
}

$('private-record').addEventListener('submit', async event => {
  event.preventDefault(); if (!canWrite() || savingRecord) return; savingRecord = true; $('private-save').disabled = true;
  const version = editorVersion, recordId = editing?.id;
  const body = {kind: $('private-kind').value, subject: $('private-subject').value, body: $('private-body').value, purpose: $('private-purpose').value, lawful_basis: $('private-basis').value, source_licence: $('private-licence').value, status: $('private-state').value, retention_days: Number($('private-retention').value), ...(editing ? {revision: editing.revision} : {})};
  try {await api(recordId ? `records/${recordId}` : 'records', 'POST', body); if (version === editorVersion) clearEditor(); await load(); note('private-write-status', 'Record saved with an access audit event.');}
  catch (error) {note('private-write-status', error.message === 'record_unavailable_or_revision_conflict' ? 'This record changed, expired or is no longer available. Refresh records and reopen the latest revision; your draft remains in the form.' : error.message);}
  finally {savingRecord = false; $('private-save').disabled = !canWrite();}
});
$('private-cancel').onclick = clearEditor;
$('private-reload').onclick = () => location.reload();
$('private-refresh').onclick = async () => {const button = $('private-refresh'); button.disabled = true; try {await load(); await loadAnalyses();} catch (error) {note('private-write-status', error.message);} finally {button.disabled = false;}};
$('private-purge').onclick = async () => {try {const result = await api('purge', 'POST', {}); await load(); note('private-write-status', `${result.deleted} expired records and ${result.deleted_grants} expired or revoked grants deleted.`);} catch (error) {note('private-write-status', error.message);}};
$('private-export').onclick = () => {if (data) download('private-organization-atlas.json', data);};
$('record-export').onclick = () => {if (data) download('private-atlas-matching-records.json', {kind: 'private_atlas_records', exported_at: new Date().toISOString(), tenant: data.tenant, filters: filters(), records: atlasRecords(data.records, filters())});};
for (const id of ['record-search', 'record-kind', 'record-state', 'record-selected-only']) $(id).addEventListener(id === 'record-search' ? 'input' : 'change', () => {recordPage = 0; renderRecords();});
$('record-previous').onclick = () => {recordPage--; renderRecords();}; $('record-next').onclick = () => {recordPage++; renderRecords();};
$('atlas-saved-analysis').onchange = () => selectAnalysis($('atlas-saved-analysis').value);
$('atlas-reference-search').oninput = referenceOptions;
$('atlas-saved-reference').onchange = () => {selectedNode = $('atlas-saved-reference').value; dismissToken(); recordPage = 0; renderSelection(); history.replaceState(null, '', atlasLink(analysis?.id, selectedNode));};
$('atlas-clear-reference').onclick = () => {$('atlas-saved-analysis').value = ''; selectAnalysis('');};
$('atlas-start-review').onclick = () => {if (!subject() || !canWrite()) return; clearEditor(); $('private-kind').value = 'review'; $('private-subject').value = subject(); $('record-selected-only').checked = true; recordPage = 0; renderRecords(); note('private-editor-title', 'Review selected reference'); $('private-editor-title').scrollIntoView({block: 'start'}); $('private-body').focus();};
$('grant-days').oninput = renderReviews; $('grant-review').onchange = () => {$('grant-issue').disabled = !$('grant-review').value || !subject() || issuingGrant;};
$('grant-dismiss').onclick = dismissToken;
$('private-grant-form').addEventListener('submit', async event => {
  event.preventDefault(); const scope = subject(); if (!scope || issuingGrant) return; issuingGrant = true; const button = $('grant-issue'); button.disabled = true; dismissToken();
  const chosen = {analysis_id: analysis.id, node_id: selectedNode, review_record_id: $('grant-review').value, named_grantee: $('grant-grantee').value.trim(), purpose: $('grant-purpose').value.trim(), lifetime_days: Number($('grant-days').value)};
  try {
    const grant = await api('grants', 'POST', chosen);
    if (data) {note('private-grant-token', JSON.stringify(grant, null, 2)); $('private-grant-token').hidden = false; $('grant-dismiss').hidden = false; note('private-grant-status', 'Scoped token issued for the reference named below. Copy it now; it is shown only in this response.');}
    try {await load();} catch (error) {if (data) note('private-grant-status', `Token issued, but the record list could not refresh: ${error.message}. Copy the displayed token before leaving.`);}
  } catch (error) {note('private-grant-status', error.message);} finally {issuingGrant = false; renderReviews();}
});
$('private-source').onchange = () => {sourceVersion++; sourceExpiry = null; $('private-references').placeholder = {'un-consolidated': 'QDi.001', 'uk-sanctions': 'RUS0001', 'eu-financial-sanctions': 'EU.1.1'}[$('private-source').value]; $('private-source-output').textContent = ''; $('private-source-output').hidden = true; note('private-source-status', '');};
$('private-source-form').addEventListener('submit', async event => {
  event.preventDefault(); const run = ++sourceVersion, button = event.currentTarget.querySelector('button'); button.disabled = true; sourceExpiry = null; $('private-source-output').textContent = ''; $('private-source-output').hidden = true; note('private-source-status', 'Retrieving the official snapshot…');
  try {const result = await api('sources', 'POST', {source: $('private-source').value, references: $('private-references').value.split(',').map(value => value.trim()).filter(Boolean)}); if (run !== sourceVersion) return; sourceExpiry = Date.parse(result.source.expires_at); $('private-source-output').hidden = false; note('private-source-output', JSON.stringify(result, null, 2)); note('private-source-status', `Exact reference lookup complete. Snapshot expires ${date(result.source.expires_at)}. This is not a wallet or identity match.`);}
  catch (error) {if (run === sourceVersion) note('private-source-status', `Lookup failed: ${error.message}. No current result is displayed.`);} finally {button.disabled = false;}
});
function expireVisibleRecords() {
  if (!data || document.hidden) return;
  renderRecords(); renderReviews();
  if (sourceExpiry !== null && Date.now() >= sourceExpiry) {sourceExpiry = null; $('private-source-output').textContent = ''; $('private-source-output').hidden = true; note('private-source-status', 'The displayed snapshot expired. Run the lookup again.');}
}
setInterval(expireVisibleRecords, 30000);
document.addEventListener('visibilitychange', expireVisibleRecords);
const returnQuery = new URLSearchParams({view: 'atlas'}); if (pendingSelection.analysis) returnQuery.set('analysis', pendingSelection.analysis); if (pendingSelection.node) returnQuery.set('node', pendingSelection.node); $('private-login').href = '/portal/?' + returnQuery;
try {await load(); await loadAnalyses();} catch (error) {if (data) note('atlas-saved-status', `Saved analysis list unavailable: ${error.message}`);}
