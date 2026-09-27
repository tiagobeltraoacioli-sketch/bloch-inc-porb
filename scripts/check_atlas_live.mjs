// Production smoke check. Credentials and temporary bearer tokens are never logged.
// Only this run's temporary records and grants are created and removed.
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createAddressEvidence} from '../space/public/assets/address-evidence.js';
import {verifyResearch} from '../space/public/assets/address-research-core.js';

const {webkit} = await import(process.env.PLAYWRIGHT_MODULE || process.argv.slice(2).find(arg => !arg.startsWith('--')) || 'playwright');
const publicOrigin = 'https://bloch-graphus.xyz';
const privateOrigin = 'https://rednblue.space';
const root = new URL('../', import.meta.url);
const portalOnly = process.argv.includes('--portal-only');
const addressOnly = process.argv.includes('--address-only');
const publicOnly = addressOnly || portalOnly || process.argv.includes('--public-only');
const owner = publicOnly ? null : JSON.parse(await readFile(process.env.PORB_CREDENTIALS_FILE || new URL('.data/porb-portal/bootstrap.json', root), 'utf8'));
const summary = {checked_at: new Date().toISOString(), scope: addressOnly ? 'public-address-evidence' : portalOnly ? 'portal-artifacts-and-authentication-boundaries' : publicOnly ? 'public-and-authentication-boundaries' : 'public-and-authenticated-private', public_origin: publicOrigin, private_origin: privateOrigin, checks: [], sources: [], assets: []};
const errors = [], cleanup = new Map();
const addressQueries=new Map();
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
  await api(anonymous, '/v1/atlas/audit', {status: 401});
  await api(anonymous, '/v1/atlas/audit/export', {status: 401});
  await api(anonymous, '/v1/atlas/timeline?analysis=00000000-0000-4000-8000-000000000001', {status: 401});
  await api(anonymous, '/v1/atlas/reports', {status: 401});
  await api(anonymous, '/v1/atlas/reports', {method:'POST',body:{kind:'motifs'},status:401});
  await api(anonymous, '/v1/atlas/reports', {method:'POST',body:{kind:'timeline'},status:401});
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
  await api(anonymous, '/v1/atlas/reports', {method:'POST',body:{kind:'window_comparison'},status:401});
  await api(anonymous, '/v1/space/overview?network=bitcoin', {status:401});
  await api(anonymous, '/v1/space/graph?network=bloch&asset=BLCH', {status:401});
  await api(anonymous, '/v1/space/research?network=ethereum&asset=ETH&query=0x'+'1'.repeat(40), {status:401});
  for(const path of ['/aml','/aml/','/aml/index.html','/aml/assets/demo.json','/aml/assets/site.js','/assets/demo.json','/space/app/','/space/graph/']){
    let url=new URL(path,privateOrigin),gated=false;
    for(let hop=0;hop<5;hop++){
      const response=await anonymous.request.get(url.href,{maxRedirects:0});assert.ok([301,302,307,308].includes(response.status()),path+' must not expose its content anonymously');
      const next=new URL(response.headers().location,url);assert.equal(next.origin,privateOrigin);if(next.pathname==='/portal/'){gated=true;break;}url=next;
    }
    assert.ok(gated,path+' must reach the portal login');
  }
  note('Anonymous private Atlas/Space APIs and direct AML pages/fixtures are gated.');
  if(!portalOnly){
    for(const path of ['preview','score']){const response=await anonymous.request.get('https://bloch.space/api/porb/'+path);assert.equal(response.status(),410);const body=await response.json();assert.equal(body.error,'scores_require_rednblue_portal');assert.equal(body.red,undefined);assert.equal(body.trend,undefined);assert.match(response.headers()['cache-control'],/no-store/);}
    for(const path of ['/','/assets/demo.json']){const response=await anonymous.request.get('https://aml-blochinc.pages.dev'+path,{maxRedirects:0});assert.equal(response.status(),302);assert.ok(response.headers().location.startsWith(privateOrigin+'/portal/'));}
    note('Legacy AML preview redirects to rednblue.space; Space score endpoints return 410 without score data.');
  }

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
    if (response.status() !== 200) {
      const raw = await response.text();
      let error = 'non_json_response';
      try { const code = JSON.parse(raw).error; if (typeof code === 'string' && /^[a-z0-9_.-]{1,80}$/i.test(code)) error = code; }
      catch { const code = raw.match(/(?:Error code|error-code[^>]*>)\s*(\d{3,5})/i); if (code) error = 'edge_error_' + code[1]; }
      const failure = {asset, attempts, status: response.status(), error, content_type: response.headers()['content-type'] || null};
      (summary.source_failures ||= []).push(failure); console.log(JSON.stringify(failure));
      throw new Error(`${asset} analysis HTTP ${failure.status}: ${error}`);
    }
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
    const reference=report.references.find(row=>row.kind!=='transaction');assert.ok(reference?.reference,asset+' public reference');addressQueries.set(asset,new URLSearchParams({network:{BTC:'bitcoin',ETH:'ethereum',USDT:'ethereum',USDC:'ethereum',BLCH:'bloch'}[asset],asset,query:reference.reference}));
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
    ...['atlas_timeline.js','atlas_timeline_ui.js','atlas_timeline.css','atlas_timeline_graph.js','atlas_timeline_graph_ui.js','atlas_timeline_compare.js','atlas_timeline_compare_ui.js','atlas_window_record.js'].flatMap(name => [[publicOrigin,'/assets/'+name,'graphus/assets/'+name],[privateOrigin,'/graphus/assets/'+name,'site/graphus/assets/'+name]]),
    [privateOrigin, '/developers/openapi.json', 'site/developers/openapi.json'],
    ...['index.html','explore.css','explore.js'].map(name=>[privateOrigin,name==='index.html'?'/explore/':'/explore/'+name,'site/explore/'+name]),
    ...['module-catalog.js','module-shell.js'].map(name=>[privateOrigin,'/portal/'+name,'site/portal/'+name]),
    ...['app.js','workspace.js','research.js','graph-lab.js','graph-core.js','graph-worker.js','address-research-core.js','address-research-ui.js','address-research.css','address-evidence.js','address-evidence-ui.js'].map(name=>[privateOrigin,'/space/assets/'+name,'site/space/assets/'+name]),
    ...['account.js','app.js','workspace.js','research.js','graph-lab.js','address-research-core.js','address-research-ui.js','address-research.css','address-evidence.js','address-evidence-ui.js'].map(name=>['https://bloch.space','/assets/'+name,'space/public/assets/'+name]),
    ['https://bloch.space','/account/','space/public/account/index.html'],
    ['https://bloch.space','/sw.js','space/public/sw.js'],
    [privateOrigin, '/portal/atlas.js', 'site/portal/atlas.js'],
    [privateOrigin, '/portal/atlas-context.js', 'site/portal/atlas-context.js'],
    [privateOrigin, '/portal/atlas-comparison.js', 'site/portal/atlas-comparison.js'],
    [privateOrigin, '/portal/atlas-comparison-view.js', 'site/portal/atlas-comparison-view.js'],
    [privateOrigin, '/portal/atlas-reports.js', 'site/portal/atlas-reports.js'],
    [privateOrigin, '/portal/atlas-cases.js', 'site/portal/atlas-cases.js'],
    [privateOrigin, '/portal/atlas-reviews.js', 'site/portal/atlas-reviews.js'],
    [privateOrigin, '/portal/atlas-audit.js', 'site/portal/atlas-audit.js'],
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
  if(!portalOnly){
    summary.address_research=[];
    for(const [asset,query] of addressQueries){
      const response=await anonymous.request.get('https://bloch.space/api/research?'+query,{timeout:65000});assert.equal(response.status(),200,asset+' address research');
      const report=await response.json(),{report_sha256,...body}=report;assert.equal(hash(Buffer.from(JSON.stringify(body))),report_sha256);assert.equal(report.scope.reference,query.get('query'));assert.equal(report.scope.asset,asset);assert.ok(report.modules.ledger.status==='available'||report.modules.graph.status==='available');assert.equal(report.modules.forecast.status,'unavailable');
      assert.ok(!(report.modules.analytics.data?.rows||[]).some(row=>'rank' in row||'red' in row||'blue' in row||'score' in row));
      if(asset==='ETH')assert.equal(report.modules.graph.status,'unsupported');
      const result={asset,ledger:report.modules.ledger.status,graph:report.modules.graph.status,machine_learning:report.modules.machine_learning.status,cohort:report.modules.machine_learning.data?.cohort_size??null,events:report.modules.graph.data?.edges.length??null,report_sha256};summary.address_research.push(result);console.log(JSON.stringify({address_research:result}));
    }
    const proxy=await anonymous.request.get(privateOrigin+'/api/research?'+addressQueries.get('ETH'),{timeout:65000});assert.equal(proxy.status(),200);const report=await proxy.json(),{report_sha256,...body}=report;assert.equal(hash(Buffer.from(JSON.stringify(body))),report_sha256);assert.equal(report.modules.graph.status,'unsupported');assert.match(proxy.headers()['cache-control'],/no-store/);
    assert.equal((await anonymous.request.post(privateOrigin+'/api/research?'+addressQueries.get('ETH'))).status(),405);
    note('Address research returns public module data across five assets, verified report hashes and explicit native ETH/forecast boundaries. Anonymous rednblue proxy is read-only.');
  }
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

async function addressEvidenceChecks(page, asset) {
  await page.locator(`.address-research[data-asset=${asset}]`).waitFor({timeout:65000});
  let additionalResearchRequests=0;
  const count=request=>{if(new URL(request.url()).pathname.endsWith('/research'))additionalResearchRequests++;};
  page.on('request',count);
  const downloadText=async selector=>{
    const pending=page.waitForEvent('download');await page.click(selector);
    return readFile(await(await pending).path(),'utf8');
  };
  const report=await verifyResearch(JSON.parse(await downloadText('[data-research-export=json]')));
  const attempt={origin:new URL(page.url()).origin,asset,graph:report.modules.graph.status,machine_learning:report.modules.machine_learning.status};
  (summary.address_evidence_attempts ||= []).push(attempt);console.log(JSON.stringify({address_evidence_observation:attempt}));
  assert.equal(report.scope.asset,asset,'Researched asset matches the submitted query');
  if(report.modules.graph.status!=='available'){
    assert.equal(report.modules.ledger.status,'available','Partial research still has a usable ledger observation');
    assert.equal(await page.locator('.ar-evidence').count(),0,'Unavailable graph must not show stale graph controls');
    assert.ok((await page.locator('.address-research').innerText()).includes(report.modules.graph.reason),'Source availability is explained in the research result');
    assert.equal(await page.locator('[data-module=machine-learning]').getAttribute('data-status'),'unavailable');
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Partial research mobile layout');
    assert.equal(additionalResearchRequests,0);page.off('request',count);
    (summary.address_evidence ||= []).push({...attempt,status:'source-unavailable',report_sha256:report.report_sha256});
    note(`${attempt.origin}: ${asset} graph source unavailable; usable ledger, explicit availability, verified JSON, absent stale graph and mobile passed. Graph/CSV interactions were not exercised for this observation.`);
    return;
  }
  const model=createAddressEvidence(report),view=model.query();assert.ok(view.events.length>0,'Production reference has captured events');
  await page.click('[data-ae=toggle]');await page.locator('[data-ae=diagram] svg').waitFor();
  assert.equal(await page.locator('[data-ae=connections] > button').count(),Math.min(8,view.connections.length),'First production connection page size');
  assert.equal(await downloadText('[data-ae=csv]'),model.csv(),'All-page production evidence CSV');
  const connection=view.connections[0];await page.locator('[data-ae=connections] > button').first().click();
  assert.equal(await downloadText('[data-ae=csv]'),model.csv({},connection.key),'Selected production connection CSV');
  await page.locator('[data-ae=events] > details > summary').first().click();
  assert.ok(await page.locator('[data-ae=events] > details[open] .ar-evidence-source').count()>0,'Original source observation in the event inspector');
  await page.click('[data-ae=reset]');
  const sample=view.events[0];await page.selectOption('[data-ae=direction]',sample.direction);
  await page.fill('[data-ae=minimum]',sample.amount);
  assert.equal(await downloadText('[data-ae=csv]'),model.csv({direction:sample.direction,minimum:sample.amount}),'Exact filtered production CSV');
  await page.click('[data-ae=reset]');
  if(report.modules.machine_learning.status==='available'){
    await page.locator('[data-ar-group]').first().click();
    const peer=await page.locator('[data-ar-peer]').first().getAttribute('data-ar-peer');
    await page.locator('[data-ar-peer]').first().click();assert.equal(await page.locator('[data-ae=focus]').inputValue(),peer,'ML reference selection focuses its captured graph node');
  }else{
    await page.locator('[data-ae-node][role=button]').first().click();
    assert.notEqual(await page.locator('[data-ae=focus]').inputValue(),model.rootId,'Graph node selection changes focus');
  }
  assert.equal(await page.locator('.address-research').getAttribute('data-reference'),report.scope.reference,'Local focus preserves the original searched address');
  await page.click('[data-ae=reset]');await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Address evidence mobile layout');
  assert.deepEqual(JSON.parse(await downloadText('[data-research-export=json]')),report,'Inspection preserves the complete original report');
  assert.equal(additionalResearchRequests,0,'Production graph inspection does not collect another source page');page.off('request',count);
  const result={origin:new URL(page.url()).origin,asset,events:view.events.length,connections:view.connections.length,machine_learning:report.modules.machine_learning.status,report_sha256:report.report_sha256};
  (summary.address_evidence ||= []).push(result);console.log(JSON.stringify({address_evidence:result}));
  note(`${result.origin}: ${asset} evidence graph, ML/reference navigation, exact all-page/connection/filtered CSV, source inspection, unchanged JSON and mobile passed without another source request.`);
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
  await page.click('[data-time=run]');await page.locator('[data-time=result]:visible').waitFor();
  const timelineDownload=page.waitForEvent('download');await page.click('[data-time=json]');
  const timeline=JSON.parse(await readFile(await(await timelineDownload).path(),'utf8'));
  assert.equal(timeline.provenance.dataset_sha256,packet.dataset_sha256);assert.equal(timeline.asset,'ETH');assert.ok(timeline.events.length>0);
  const {report_sha256:timelineHash,...timelineBody}=timeline;assert.equal(hash(Buffer.from(JSON.stringify(timelineBody))),timelineHash);
  assert.equal(new Set(timeline.events.map(event=>event.event_id)).size,timeline.events.length);
  const timelineCsv=page.waitForEvent('download');await page.click('[data-time=csv]');const csv=await readFile(await(await timelineCsv).path(),'utf8');assert.ok(csv.includes(timelineHash));assert.equal(csv.split('\r\n').length,timeline.events.length+1);
  await page.click('[data-time=network] > summary');await page.locator('[data-graph=diagram] svg').waitFor();
  const graphCsv=page.waitForEvent('download');await page.click('[data-graph=csv]');const graphText=await readFile(await(await graphCsv).path(),'utf8');assert.ok(graphText.includes(timelineHash));assert.equal(graphText.split('\r\n').length,timeline.events.length+1);
  note('Production temporal graph renders the retained ETH connections and exports all events with original report hashes.');
  note(`Production activity timeline reused the ETH capture and exported ${timeline.events.length} exact events with matching report and dataset hashes.`);
  // Add one explicitly unknown earlier interval without collecting another source page.
  const step=timeline.window.interval_seconds*1000,utcInput=time=>new Date(time).toISOString().slice(0,19).replace(/:00$/,'');
  await page.selectOption('[data-time=interval]',timeline.window.interval);
  await page.fill('[data-time=start]',utcInput(Math.floor(Date.parse(timeline.events[0].block_time)/step)*step-step));
  await page.fill('[data-time=end]',utcInput(Math.floor(Date.parse(timeline.events.at(-1).block_time)/step)*step+step-1000));
  await page.click('[data-time=run]');await page.locator('[data-time=result]:visible').waitFor();
  const expandedDownload=page.waitForEvent('download');await page.click('[data-time=json]');const expanded=JSON.parse(await readFile(await(await expandedDownload).path(),'utf8'));
  await page.click('[data-time=comparison] > summary');await page.click('[data-time-bin="0"]');await page.click('[data-window=pin]');
  await page.locator('[data-time=last]').evaluate(node=>{node.value=node.max;node.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('[data-time=first]').evaluate(node=>{node.value='1';node.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('[data-window=result]:visible').waitFor();
  const windowDownload=page.waitForEvent('download');await page.click('[data-window=json]');const windows=JSON.parse(await readFile(await(await windowDownload).path(),'utf8')),{comparison_sha256:windowHash,...windowBody}=windows;
  assert.equal(hash(Buffer.from(JSON.stringify(windowBody))),windowHash);assert.equal(windows.provenance.timeline_report_sha256,expanded.report_sha256);assert.equal(windows.provenance.dataset_sha256,packet.dataset_sha256);assert.equal(windows.baseline.observed_events,0);assert.equal(windows.comparison.observed_events,timeline.events.length);assert.equal(windows.baseline.complete_history,false);assert.equal(windows.groups[0].source_references.baseline.event_concentration,null);
  const referencesDownload=page.waitForEvent('download');await page.click('[data-window=csv]');const referencesCsv=await readFile(await(await referencesDownload).path(),'utf8');assert.ok(referencesCsv.includes(windowHash));assert.equal(referencesCsv.split('\r\n').length,windows.groups[0].source_references.rows.length+1);
  note(`Production window comparison preserves ${windows.comparison.observed_events} ETH events, an explicitly unknown earlier window, exact reference CSV and matching parent/comparison hashes.`);
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
    assert.ok(await privatePage.isHidden('#audit-workspace'), 'Anonymous audit workspace hidden');
    assert.ok(await privatePage.isHidden('#audit-link'), 'Anonymous audit navigation hidden');
    assert.equal(await privatePage.locator('#audit-list > article').count(), 0);
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
  if(addressOnly){
    for(const asset of ['BTC','USDT']){
      const response=await anonymous.request.get(publicOrigin+'/api/atlas/analyze?asset='+asset,{timeout:120000});assert.equal(response.status(),200,asset+' public reference selection');
      const report=await response.json(),reference=report.references.filter(row=>row.kind!=='transaction').sort((a,b)=>b.records-a.records)[0];assert.ok(reference?.reference,asset+' public reference');
      addressQueries.set(asset,new URLSearchParams({network:asset==='BTC'?'bitcoin':'ethereum',asset,query:reference.reference}));
    }
  }else await publicChecks();
  if (!publicOnly) await privateChecks();
  if(!addressOnly)await browserChecks();
  const directory=await anonymous.newPage();directory.on('pageerror',error=>errors.push(error.message));
  await directory.goto(privateOrigin+'/explore/');await directory.locator('#tools > a').nth(9).waitFor();assert.equal(await directory.locator('#tools > a').count(),10);assert.equal(await directory.locator('#trend-chart,#metrics').count(),0);
  if(addressQueries.has('BTC')){
    await directory.selectOption('#public-address-form [name=asset]','BTC');await directory.fill('#public-address-form [name=query]',addressQueries.get('BTC').get('query'));await directory.click('#public-address-form button');
    await addressEvidenceChecks(directory,'BTC');
  }
  await directory.setViewportSize({width:390,height:844});assert.ok(await directory.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await directory.close();
  if(addressQueries.has('USDT')){
    const explorer=await anonymous.newPage();explorer.on('pageerror',error=>errors.push(error.message));
    const query=new URLSearchParams(addressQueries.get('USDT'));query.set('kind','address');await explorer.goto('https://bloch.space/?'+query);
    await addressEvidenceChecks(explorer,'USDT');await explorer.close();
  }
  assert.deepEqual(errors,[]);note('Public tool directory renders ten open tools without a login and fits mobile.');
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
  await writeFile(new URL(addressOnly ? '.data/porb-portal/address-evidence-release.json' : portalOnly ? '.data/porb-portal/atlas-portal-release.json' : '.data/porb-portal/atlas-live-verification.json', root), JSON.stringify(summary, null, 2), {mode: 0o600});
  await browser.close();
}
