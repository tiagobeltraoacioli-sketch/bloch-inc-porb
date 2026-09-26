// Production smoke check. Credentials and temporary bearer tokens are never logged.
// Only this run's temporary records and grants are created and removed.
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const {webkit} = await import(process.env.PLAYWRIGHT_MODULE || process.argv.slice(2).find(arg => !arg.startsWith('--')) || 'playwright');
const publicOrigin = 'https://bloch-graphus.xyz';
const privateOrigin = 'https://rednblue.space';
const root = new URL('../', import.meta.url);
const portalOnly = process.argv.includes('--portal-only');
const publicOnly = portalOnly || process.argv.includes('--public-only');
const owner = publicOnly ? null : JSON.parse(await readFile(process.env.PORB_CREDENTIALS_FILE || new URL('.data/porb-portal/bootstrap.json', root), 'utf8'));
const summary = {checked_at: new Date().toISOString(), scope: portalOnly ? 'portal-artifacts-and-authentication-boundaries' : publicOnly ? 'public-and-authentication-boundaries' : 'public-and-authenticated-private', public_origin: publicOrigin, private_origin: privateOrigin, checks: [], sources: [], assets: []};
const errors = [], cleanup = new Map();
let grant = null, key = null, authenticated = false;
const browser = await webkit.launch();
const anonymous = await browser.newContext({viewport: {width: 1440, height: 1000}});
const member = await browser.newContext({viewport: {width: 1440, height: 1000}});
const note = check => {summary.checks.push(check); console.log(check);};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function api(context, path, {method = 'GET', body, token, status = 200} = {}) {
  const headers = {Accept: 'application/json'};
  if (method !== 'GET') Object.assign(headers, {'Content-Type': 'application/json', Origin: privateOrigin, 'X-Porb-Action': '1'});
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await context.request.fetch(privateOrigin + '/api/porb' + path, {method, headers, data: body, timeout: 120000, maxRedirects: 0});
  assert.equal(response.status(), status, `${method} ${path.split('?')[0]} HTTP ${response.status()}, expected ${status}`);
  assert.match(response.headers()['cache-control'] || '', /no-store/, 'Private responses must not be cached');
  return response.json();
}

async function publicChecks() {
  await api(anonymous, '/v1/atlas/private', {status: 401});
  await api(anonymous, '/v1/atlas/reports', {status: 401});
  await api(anonymous, '/v1/atlas/reviews', {status: 401});
  await api(anonymous, '/v1/atlas/records/00000000-0000-4000-8000-000000000001/history', {status: 401});
  await api(anonymous, '/v1/atlas/records/00000000-0000-4000-8000-000000000001/assignment', {method:'POST',body:{},status:401});
  await api(anonymous, '/v1/atlas/cases/00000000-0000-4000-8000-000000000001', {status: 401});
  await api(anonymous, '/v1/atlas/cases/00000000-0000-4000-8000-000000000001/export', {status: 401});
  await api(anonymous, '/v1/atlas/sources', {status: 401});
  await api(anonymous, '/v1/atlas/paths?analysis=00000000-0000-4000-8000-000000000001&from=ETH:address:source&to=ETH:address:target', {status: 401});
  await api(anonymous, '/v1/atlas/motifs?analysis=00000000-0000-4000-8000-000000000001&reference=ETH:address:source', {status:401});
  await api(anonymous, '/v1/atlas/compare?baseline=00000000-0000-4000-8000-000000000001&current=00000000-0000-4000-8000-000000000002', {status: 401});
  await api(anonymous, '/v1/graphus/atlas/schema', {status: 401});
  note('Anonymous access to private Atlas APIs is denied.');
  if (!portalOnly) {
  const schemaResponse = await anonymous.request.get(publicOrigin + '/api/atlas/schema');
  assert.equal(schemaResponse.status(), 200);
  const schema = await schemaResponse.json();
  assert.equal(schema.fields.length, 84);
  assert.equal(schema.version, 'graphus-atlas-1.0.0');
  assert.equal((await anonymous.request.get(publicOrigin + '/api/atlas/analyze?asset=ETH&minimum=-1')).status(), 400);
  assert.equal((await anonymous.request.post(publicOrigin + '/api/atlas/analyze?asset=ETH')).status(), 405);
  note('Public schema and invalid-query/read-only boundaries passed.');
  const results = await Promise.allSettled(['BTC', 'ETH', 'USDT', 'USDC', 'BLCH'].map(async asset => {
    let response, attempts = 0;
    do {
      attempts++;
      response = await anonymous.request.get(publicOrigin + '/api/atlas/analyze?asset=' + asset, {timeout: 120000});
      if (![502, 503, 504].includes(response.status()) || attempts === 2) break;
      console.log(asset + ': retrying one transient source response.');
      await new Promise(resolve => setTimeout(resolve, 2000));
    } while (attempts < 2);
    assert.equal(response.status(), 200, asset + ' analysis HTTP status');
    const report = await response.json();
    assert.equal(report.asset, asset);
    assert.equal(Object.keys(report.fields).length, 84);
    assert.ok(report.records.length > 0, asset + ' returned records');
    assert.equal(report.fields.aml_score.value, null);
    assert.ok(report.fields.parse_version.value.source_adapters.includes('graphus-network-1.1.0'), asset + ' adapter version');
    if (['USDT', 'USDC'].includes(asset)) assert.ok(report.records.every(r => typeof r.block_time === 'string'), asset + ' block timestamps retained');
    if (asset === 'BTC') assert.ok(report.fields.confirmations.value.minimum_at_capture >= 3, 'BTC captured confirmation depth');
    const item = {asset, attempts, records: report.records.length, timed_records: report.observation.records_with_timestamp, fields: 84, dataset_sha256: report.provenance.dataset_sha256};
    summary.assets.push(item);
    console.log(JSON.stringify({asset, records: item.records, timed_records: item.timed_records, status: 'passed'}));
  }));
  const failed = results.find(r => r.status === 'rejected');
  if (failed) throw failed.reason;
  note('All five production asset analyses passed.');
  }
  for (const [origin, remote, local] of [
    [publicOrigin, '/catalog.html', 'graphus/catalog.html'],
    [publicOrigin, '/assets/atlas_engine.js', 'graphus/assets/atlas_engine.js'],
    ...['atlas_paths.js','atlas_paths_ui.js','atlas_paths.css','catalog.js'].map(name => [publicOrigin, '/assets/' + name, 'graphus/assets/' + name]),
    ...['atlas_paths.js','atlas_paths_ui.js','atlas_paths.css'].map(name => [privateOrigin, '/graphus/assets/' + name, 'site/graphus/assets/' + name]),
    ...['atlas_motifs.js','atlas_motifs_ui.js','atlas_motifs.css'].flatMap(name => [[publicOrigin,'/assets/'+name,'graphus/assets/'+name],[privateOrigin,'/graphus/assets/'+name,'site/graphus/assets/'+name]]),
    [privateOrigin, '/atlas.html', 'site/atlas.html'],
    [privateOrigin, '/developers/openapi.json', 'site/developers/openapi.json'],
    [privateOrigin, '/portal/atlas.js', 'site/portal/atlas.js'],
    [privateOrigin, '/portal/atlas-context.js', 'site/portal/atlas-context.js'],
    [privateOrigin, '/portal/atlas-comparison.js', 'site/portal/atlas-comparison.js'],
    [privateOrigin, '/portal/atlas-reports.js', 'site/portal/atlas-reports.js'],
    [privateOrigin, '/portal/atlas-cases.js', 'site/portal/atlas-cases.js'],
    [privateOrigin, '/portal/atlas-reviews.js', 'site/portal/atlas-reviews.js'],
    [privateOrigin, '/portal/intelligence.js', 'site/portal/intelligence.js'],
    [privateOrigin, '/portal/atlas.css', 'site/portal/atlas.css'],
    [privateOrigin, '/portal/', 'site/portal/index.html'],
    [privateOrigin, '/portal/portal.js', 'site/portal/portal.js'],
    [privateOrigin, '/portal/portal.css', 'site/portal/portal.css'],
    [privateOrigin, '/graphus/assets/catalog.js', 'site/graphus/assets/catalog.js'],
  ]) {
    if (portalOnly && origin !== privateOrigin) continue;
    const response = await anonymous.request.get(origin + remote);
    assert.equal(response.status(), 200, remote);
    assert.equal(hash(await response.body()), hash(await readFile(new URL(local, root))), remote + ' deployed bytes');
  }
  note('Custom domains serve the deployed Atlas assets byte-for-byte.');
}

async function privateChecks() {
  await api(anonymous, '/v1/atlas/private', {status: 401});
  await api(anonymous, '/v1/atlas/reports', {status: 401});
  await api(anonymous, '/v1/atlas/cases/00000000-0000-4000-8000-000000000001', {status: 401});
  await api(anonymous, '/v1/atlas/cases/00000000-0000-4000-8000-000000000001/export', {status: 401});
  await api(anonymous, '/v1/atlas/sources', {status: 401});
  await api(anonymous, '/v1/atlas/paths?analysis=00000000-0000-4000-8000-000000000001&from=ETH:address:source&to=ETH:address:target', {status: 401});
  await api(anonymous, '/v1/atlas/compare?baseline=00000000-0000-4000-8000-000000000001&current=00000000-0000-4000-8000-000000000002', {status: 401});
  await api(anonymous, '/v1/graphus/atlas/schema', {status: 401});
  await api(member, '/auth/login', {method: 'POST', body: {email: owner.email, password: owner.password}});
  authenticated = true;
  const session = await api(member, '/auth/session');
  assert.ok(session.authenticated && session.organization.role === 'owner', 'Owner session');
  const workspace = await api(member, '/v1/atlas/private');
  assert.ok(Array.isArray(workspace.records) && Array.isArray(workspace.access_audit), 'Private workspace and audit');
  assert.equal(workspace.aml_score.available, false);
  const schema = await api(member, '/v1/graphus/atlas/schema');
  assert.equal(schema.fields.length, 84);
  note('Authentication, private workspace, audit and authenticated schema proxy passed.');

  const body = {kind: 'annotation', subject: 'Temporary Atlas deployment verification', body: 'Temporary technical smoke check. No investigation or attribution.', purpose: 'Authorized deployment verification', lawful_basis: 'Account owner authorized technical verification', source_licence: 'Operator-authored verification note', status: 'open', retention_days: 2};
  let record = await api(member, '/v1/atlas/records', {method: 'POST', body, status: 201});
  cleanup.set(record.id, record.revision);
  record = await api(member, '/v1/atlas/records/' + record.id, {method: 'POST', body: {...body, body: 'Temporary verification revision. No investigation or attribution.', revision: record.revision}});
  cleanup.set(record.id, record.revision);
  assert.equal(record.revision, 2);
  await api(member, '/v1/atlas/records/' + record.id, {method: 'POST', body: {...body, revision: 1}, status: 409});
  const reread = await api(member, '/v1/atlas/private');
  assert.ok(reread.records.some(r => r.id === record.id && r.revision === 2), 'Persisted Atlas revision');
  await api(member, '/v1/atlas/records/' + record.id, {method: 'DELETE', body: {revision: record.revision}});
  cleanup.delete(record.id);
  note('Production record create/read/update/delete and revision conflict passed.');

  const analyses = await api(member, '/v1/analyses');
  const retained = analyses.analyses.find(r => r.asset === 'ETH') || analyses.analyses[0];
  assert.ok(retained, 'A retained analysis is required; this check never creates a new collection.');
  const analysis = await api(member, '/v1/analyses/' + retained.id);
  const node = analysis.scores.rows[0];
  assert.ok(node, 'Retained score row');
  const review = await api(member, '/v1/atlas/records', {method: 'POST', status: 201, body: {...body, kind: 'review', subject: `${analysis.id}:${node.id}`, status: 'reviewed', body: 'Temporary technical test of the review-state gate. This is not a substantive human investigation or decision.'}});
  cleanup.set(review.id, review.revision);
  grant = await api(member, '/v1/atlas/grants', {method: 'POST', status: 201, body: {analysis_id: analysis.id, node_id: node.id, review_record_id: review.id, named_grantee: 'Account-owner deployment verification', purpose: 'Temporary technical verification; no external disclosure', lifetime_days: 1}});
  const delegated = await api(anonymous, '/v1/atlas/delegated/' + grant.id, {token: grant.token});
  assert.ok(delegated.score.id === node.id && delegated.analysis_id === analysis.id, 'Delegated resource identity');
  assert.equal(delegated.aml_score, false);
  assert.ok(!Object.hasOwn(delegated, 'scores') && !Object.hasOwn(delegated, 'graph'), 'Delegation exposes one score only');
  await api(anonymous, '/v1/atlas/private', {token: grant.token, status: 401});
  await api(member, '/v1/atlas/grants/' + grant.id + '/revoke', {method: 'POST', body: {}});
  await api(anonymous, '/v1/atlas/delegated/' + grant.id, {token: grant.token, status: 401});
  grant = null;
  await api(member, '/v1/atlas/records/' + review.id, {method: 'DELETE', body: {revision: review.revision}});
  cleanup.delete(review.id);
  note('Resource-scoped grant, ordinary-route denial and immediate revocation passed; temporary review removed.');

  key = await api(member, '/keys', {method: 'POST', status: 201, body: {label: 'Atlas deployment verification (revoked)', days: 1, scopes: ['data:read'], password: owner.password}});
  await api(anonymous, '/v1/atlas/private', {token: key.key, status: 403});
  const scopedSchema = await api(anonymous, '/v1/graphus/atlas/schema', {token: key.key});
  assert.equal(scopedSchema.fields.length, 84);
  await api(member, '/keys/' + key.id, {method: 'DELETE', body: {password: owner.password}});
  await api(anonymous, '/v1/graphus/atlas/schema', {token: key.key, status: 401});
  key = null;
  note('Partner data:read scope and key revocation passed.');

  for (const [source, reference] of [['un-consolidated', 'QDi.001'], ['uk-sanctions', 'RUS0001'], ['eu-financial-sanctions', 'EU.1.1']]) {
    const result = await api(member, '/v1/atlas/sources', {method: 'POST', body: {source, references: [reference]}});
    assert.match(result.source.sha256, /^[0-9a-f]{64}$/);
    assert.ok(result.source.reference_count >= 100, 'Complete official reference snapshot threshold');
    assert.equal(result.results.length, 1);
    const item = {source, reference_count: result.source.reference_count, bytes: result.source.bytes, sha256: result.source.sha256};
    summary.sources.push(item);
    console.log(JSON.stringify({...item, status: 'passed'}));
  }
  note('UN, UK and EU official snapshots parsed successfully inside the deployed Worker.');
}

async function browserChecks() {
  if (!portalOnly) {
  const page = await anonymous.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(publicOrigin + '/catalog.html?asset=ETH');
  await page.waitForFunction(() => !document.querySelector('#atlas-export').disabled, {}, {timeout: 120000});
  assert.equal(await page.locator('#field-rows tr').count(), 84);
  await page.fill('#field-search', 'amount_raw');
  await page.click('.atlas-field-button');
  await page.locator('#atlas-detail[open]').waitFor();
  await page.keyboard.press('Escape');
  await page.fill('#field-search', '');
  const pending = page.waitForEvent('download');
  await page.click('#atlas-evidence');
  const download = await pending;
  const packet = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.ok(packet.dataset.edges.length > 0);
  const event = packet.dataset.edges.find(e => e.kind === 'native_value' && e.from !== e.to && e.block_time);
  assert.ok(event, 'A timed direct ETH event is available for the path check');
  await page.fill('[data-path=from]', event.from); await page.fill('[data-path=to]', event.to);
  await page.click('[data-path=run]'); await page.locator('[data-path=result]:visible').waitFor();
  const pathDownload = page.waitForEvent('download'); await page.click('[data-path=export]');
  const paths = JSON.parse(await readFile(await (await pathDownload).path(), 'utf8'));
  assert.equal(paths.provenance.dataset_sha256, packet.dataset_sha256);
  assert.ok(paths.paths.some(path => path.hops === 1), 'Direct captured event is represented');
  const {report_sha256, ...pathBody} = paths;
  assert.equal(hash(Buffer.from(JSON.stringify(pathBody))), report_sha256);
  note('Production temporal paths reuse the captured dataset, retain direct event evidence and export a matching report hash.');
  await page.fill('[data-motif=reference]',event.from);await page.selectOption('[data-motif=type]','fan_out');
  await page.click('[data-motif=run]');await page.locator('[data-motif=result]:visible').waitFor();
  const motifDownload=page.waitForEvent('download');await page.click('[data-motif=export]');
  const motifs=JSON.parse(await readFile(await(await motifDownload).path(),'utf8'));
  assert.equal(motifs.provenance.dataset_sha256,packet.dataset_sha256);assert.equal(motifs.asset,'ETH');assert.equal(motifs.state,'available');assert.ok(motifs.coverage.eligible_records>0);
  const {report_sha256:motifHash,...motifBody}=motifs;assert.equal(hash(Buffer.from(JSON.stringify(motifBody))),motifHash);
  note(`Production motif explorer reused the ETH capture and exported a matching checksum (${motifs.motifs.length} fan-out windows in this bounded query).`);
  await page.screenshot({path: new URL('.data/atlas-live-desktop.png', root).pathname});
  await page.setViewportSize({width: 390, height: 844});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Public mobile layout');
  await page.screenshot({path: new URL('.data/atlas-live-mobile.png', root).pathname});
  }
  const privatePage = await (publicOnly ? anonymous : member).newPage();
  privatePage.on('pageerror', error => errors.push(error.message));
  await privatePage.goto(privateOrigin + '/atlas.html');
  await privatePage.locator(publicOnly ? '#private-login:visible' : '#private-workspace:visible').waitFor({timeout: 60000});
  await privatePage.setViewportSize({width: 390, height: 844});
  assert.ok(await privatePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Private mobile layout');
  if (publicOnly) {
    await privatePage.click('#private-login');
    await privatePage.locator('#gate:visible').waitFor();
    assert.equal(new URL(privatePage.url()).searchParams.get('view'), 'atlas');
    assert.equal(await privatePage.locator('#atlas-nav svg').count(), 1);
    assert.equal(await privatePage.locator('#atlas-overview svg').count(), 1);
    assert.equal(await privatePage.locator('#atlas-nav').getAttribute('href'), '/atlas.html');
    assert.ok(await privatePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Portal login mobile layout');
  }
  if (!publicOnly) {
    await privatePage.goto(privateOrigin + '/graphus/catalog.html?asset=ETH');
    await privatePage.waitForFunction(() => !document.querySelector('#atlas-export').disabled, {}, {timeout: 120000});
    assert.equal(await privatePage.locator('#field-rows tr').count(), 84);
  }
  assert.deepEqual(errors, [], 'Browser JavaScript errors');
  note(portalOnly ? 'Portal release: Atlas icon markup, sign-in destination, login gate and mobile layout passed; authenticated workflows require a session.' : publicOnly ? 'Live browser: public Atlas, inspector, evidence export, mobile and private login gate passed.' : 'Live browser: public/private Atlas, inspector, evidence export, mobile and authenticated mounted module passed.');
}

await mkdir(new URL('.data/porb-portal/', root), {recursive: true, mode: 0o700});
try {
  await publicChecks();
  if (!publicOnly) await privateChecks();
  await browserChecks();
  summary.status = 'passed';
} catch (error) {
  summary.status = 'failed';
  // Playwright's multiline call logs can contain request headers. Retain only
  // the first diagnostic line, and redact credentials if included by an error.
  let message = String(error.message).split('\n')[0];
  for (const secret of [owner?.password, owner?.email, grant?.token, key?.key]) if (secret) message = message.replaceAll(secret, '[redacted]');
  summary.error = message;
  console.error(message);
  process.exitCode = 1;
} finally {
  const cleanupErrors = [];
  const safely = async (label, operation) => {try {await operation();} catch {cleanupErrors.push(label);}};
  if (grant) await safely('temporary grant revocation', () => api(member, '/v1/atlas/grants/' + grant.id + '/revoke', {method: 'POST', body: {}}));
  if (key) await safely('temporary API key revocation', () => api(member, '/keys/' + key.id, {method: 'DELETE', body: {password: owner.password}}));
  for (const [id, revision] of cleanup) await safely('temporary record deletion', () => api(member, '/v1/atlas/records/' + id, {method: 'DELETE', body: {revision}}));
  if (authenticated) await safely('session logout', () => api(member, '/auth/logout', {method: 'POST', body: {}}));
  summary.cleanup_errors = cleanupErrors;
  if (cleanupErrors.length) {summary.status = 'failed'; process.exitCode = 1; console.error('Cleanup needs attention:', cleanupErrors.join(', '));}
  await writeFile(new URL(portalOnly ? '.data/porb-portal/atlas-portal-release.json' : '.data/porb-portal/atlas-live-verification.json', root), JSON.stringify(summary, null, 2), {mode: 0o600});
  await browser.close();
}
