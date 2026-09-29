import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handlePublicAssistant} from '../deploy/blochai-public/assistant.js';
import {handlePublicBlochAI} from '../deploy/blochai-public/worker.js';

const migrations = ['0001_public_assistant.sql', '0002_public_chain_snapshot.sql'].map(name =>
  readFileSync(new URL(`../deploy/blochai-public/migrations/${name}`, import.meta.url), 'utf8'));
const host = 'bloch-graphus.xyz', id = 'a'.repeat(64), baseTime = 1750000000000;
const script = 'c'.repeat(64), txid = 'd'.repeat(64);
function observation({network = 'bloch', subject = null, now = () => new Date(baseTime)} = {}) {
  return {network, subject, sources: [{id: 'test_public_source', title: 'Synthetic public fixture',
    url: 'https://bloch-graphus.xyz/api/chain/network?asset=BLCH', retrieved_at: now().toISOString(), observed_at: null,
    status: 'available', coverage: 'Synthetic bounded test observation, not a live record.'}],
    facts: [{label: 'Observed head height', value: '100', unit: 'blocks', source_id: 'test_public_source'},
      {label: 'Displayed graph references', value: '2', unit: 'references', source_id: 'test_public_source'},
      {label: 'Displayed graph records', value: '1', unit: 'records', source_id: 'test_public_source'}],
    transactions: [{hash: txid, asset: 'BLCH', status: 'source-reported'}],
    graph: {nodes: [{id: `bloch:script_hash:${script}`, label: script, kind: 'script_hash'},
      {id: `bloch:transaction:${txid}`, label: txid, kind: 'transaction'}],
      edges: [{source: `bloch:script_hash:${script}`, target: `bloch:transaction:${txid}`, label: '10 sat'}]},
    status: 'available', coverage: 'Public fixture only. References do not establish ownership.', observed_at: null};
}
function setup() {
  const sql = new DatabaseSync(':memory:');
  for (const migration of migrations) sql.exec(migration);
  const requests = [], contextRequests = []; let next = 1;
  const db = {prepare(query) {let values = []; return {
    bind(...args) {values = args; return this;},
    async first() {return sql.prepare(query).get(...values) || null;},
    async run() {return sql.prepare(query).run(...values);},
  };}, async batch(items) {return Promise.all(items.map(item => item.run()));}};
  const env = {ENABLE_PUBLIC_ASSISTANT: 'true', BLOCHAI_PUBLIC_DB: db,
    PUBLIC_BLOCHAI_API_TOKEN: 'public-only-token-'.repeat(3), PUBLIC_BLOCHAI_IP_HASH_KEY: 'private-hash-key-'.repeat(3),
    PUBLIC_BLOCHAI_API_URL: 'https://blochai-origin.posternlabs.com'};
  const fetcher = async (url, init) => {
    requests.push({url: String(url), init});
    assert.equal(new URL(url).origin, 'https://blochai-origin.posternlabs.com');
    return Response.json({task_id: init.method === 'POST' ? (next++).toString(16).padStart(64, '0') : new URL(url).pathname.split('/').pop(),
      status: init.method === 'POST' ? 'PENDING' : 'COMPLETED', model: 'synthetic-test-model',
      output: init.method === 'POST' ? 'hidden before completion' : '<script>window.bad=true</script> public explanation',
      tenant_id: 'must-not-escape', node_address: 'must-not-escape'});
  };
  const contextLoader = async query => {contextRequests.push(query); return observation(query);};
  const call = async ({path = '/api/blochai/tasks', method = 'POST', body = {question_id: 'connections'}, hostname = host,
    headers = {}, now = baseTime, customFetch = fetcher, customContext = contextLoader, configuration = env} = {}) =>
    handlePublicAssistant({request: new Request(`https://${hostname}${path}`, {method,
      headers: {origin: `https://${hostname}`, 'sec-fetch-site': 'same-origin', 'x-blochai-client': 'public-v1',
        'cf-connecting-ip': '192.0.2.1', 'content-type': 'application/json', ...headers},
      ...(method === 'POST' ? {body: typeof body === 'string' ? body : JSON.stringify(body)} : {})}),
    env: configuration, fetcher: customFetch, contextLoader: customContext, now});
  const budgetRows = () => sql.prepare('SELECT * FROM blochai_public_budget').all();
  return {sql, env, call, requests, contextRequests, budgetRows};
}

test('approved public research creates scoped tickets and persists a source-backed guide', async () => {
  const s = setup(); try {
    const response = await s.call({headers: {cookie: 'private_session=ignore', authorization: 'Bearer browser-token'}});
    const data = await response.json();
    assert.equal(response.status, 202); assert.match(data.poll_token, /^[a-f0-9]{64}$/);
    assert.equal(data.portal, 'graphus'); assert.equal(data.output, null); assert.equal(data.tenant_id, undefined);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(data.guide.question_id, 'connections'); assert.equal(data.guide.mode, 'explain');
    assert.equal(data.guide.network, 'bloch'); assert.equal(data.guide.subject, null);
    assert.equal(data.guide.graph.nodes.length, 2); assert.equal(data.guide.transactions.length, 1);
    assert.ok(data.guide.knowledge.length); assert.ok(data.guide.sources.some(source => source.status === 'reference'));
    const sent = s.requests[0], payload = JSON.parse(sent.init.body);
    assert.equal(sent.url, 'https://blochai-origin.posternlabs.com/public/v1/tasks'); assert.equal(sent.init.redirect, 'manual');
    assert.deepEqual(Object.keys(payload).sort(), ['mode', 'network', 'observations', 'portal', 'question_id']);
    assert.equal(payload.portal, 'graphus'); assert.equal(payload.question_id, 'connections');
    assert.equal(payload.mode, 'explain'); assert.equal(payload.network, 'bloch');
    assert.deepEqual(payload.observations.graph, {nodes: [], edges: []}); assert.deepEqual(payload.observations.transactions, []);
    assert.deepEqual(payload.observations.facts, data.guide.facts);
    assert.ok(payload.observations.sources.length < data.guide.sources.length);
    assert.equal(sent.init.body.includes(script), false); assert.equal(sent.init.body.includes(txid), false);
    assert.deepEqual(Object.keys(sent.init.headers).sort(), ['accept', 'authorization', 'content-type', 'user-agent']);
    assert.equal(sent.init.headers.authorization, `Bearer ${s.env.PUBLIC_BLOCHAI_API_TOKEN}`);
    assert.doesNotMatch(sent.init.body, /private_session|browser-token|must-not-escape/);
    assert.equal(s.contextRequests.length, 1); assert.equal(s.contextRequests[0].portal, 'graphus');
    const stored = s.sql.prepare('SELECT * FROM blochai_public_jobs').get();
    assert.notEqual(stored.ticket_digest, data.poll_token); assert.equal(stored.portal, 'graphus');
    assert.equal(stored.expires_at, 1750003600); assert.deepEqual(JSON.parse(stored.guide_json), data.guide);
    assert.doesNotMatch(stored.guide_json, /hidden before completion|private_session|browser-token/);
    assert.doesNotMatch(JSON.stringify(s.budgetRows()), /192\.0\.2\.1|private_session/);
    const polled = await s.call({path: `/api/blochai/tasks/${data.task_id}`, method: 'GET', headers: {'x-blochai-ticket': data.poll_token},
      customContext: async () => {throw new Error('Polling must reuse the persisted observation');}});
    const result = await polled.json();
    assert.equal(polled.status, 200); assert.equal(result.answer_kind,'source_summary');
    assert.match(result.output,/Displayed graph references: 2 references/);assert.match(result.output,/Displayed graph records: 1 records/);
    assert.match(result.output,/Source: Synthetic public fixture \[test_public_source\] \(available\)/);
    assert.doesNotMatch(result.output,/Observed head height: 100 blocks|window.bad|public explanation/);
    assert.equal(result.tenant_id, undefined); assert.equal(result.node_address, undefined); assert.equal(result.poll_token, undefined);
    assert.deepEqual(result.guide, data.guide);
    assert.equal(s.requests[1].url, `https://blochai-origin.posternlabs.com/public/v1/tasks/${data.task_id}?portal=graphus`);
  } finally {s.sql.close();}
});

test('new modes, network selection, addresses and transaction topics are validated and normalized', async () => {
  const s = setup(); try {
    const value = '0x' + 'B'.repeat(40);
    for (const mode of ['summary', 'explain', 'checklist', 'example']) {
      const response = await s.call({body: {question_id: 'wallet_summary', mode, network: 'ethereum', subject: {kind: 'address', value}}});
      const data = await response.json(); assert.equal(response.status, 202);
      assert.equal(data.guide.mode, mode); assert.equal(data.guide.subject.value, value.toLowerCase());
      const payload = JSON.parse(s.requests.at(-1).init.body);
      assert.equal(payload.mode, mode); assert.equal(payload.network, 'ethereum');
      assert.deepEqual(payload.observations.subject, {kind: 'address', value: value.toLowerCase()});
    }
    const transaction = await s.call({body: {question_id: 'transactions', network: 'bloch', subject: {kind: 'transaction', value: txid.toUpperCase()}}});
    assert.equal(transaction.status, 202);
    assert.equal((await transaction.json()).guide.subject.value, txid);
  } finally {s.sql.close();}
});

test('free text, foreign topics, malformed subjects and unexpected controls fail before sources, upstream or budgets', async () => {
  const s = setup(); try {
    for (const body of [
      {question_id: 'connections', prompt: 'private text'}, {question_id: 'connections', question: 'raw question'},
      {question_id: 'connections', text: 'raw topic'}, {question_id: 'connections', portal: 'space'}, {question_id: 'eutxo'},
      {question_id: '__proto__'}, {question_id: 'constructor'}, {question_id: 'connections', tenant_id: 'private'},
      {question_id: 'connections', model: 'other'}, {question_id: 'connections', mode: 'arbitrary'},
      {question_id: 'connections', network: 'https://127.0.0.1/'},
      {question_id: 'token_approvals', network: 'bitcoin'},
      {question_id: 'connections', subject: {kind: 'address', value: 'https://rednblue.space/portal/'}},
      {question_id: 'connections', subject: {kind: 'transaction', value: '../private'}},
      {question_id: 'connections', subject: {kind: 'address', value: script, url: 'https://attacker.test'}},
      {question_id: 'connections', observations: observation()}, [], null, '{', 'x'.repeat(1100),
    ]) assert.ok([400, 413].includes((await s.call({body})).status));
    const crossChain = await s.call({hostname: 'blochl1.com', body: {question_id: 'transactions', network: 'ethereum'}});
    assert.equal(crossChain.status, 400);
    for (const path of ['/api/blochai/tasks?portal=space', '/api/blochai/tasks/', '/api/blochai/status',
      `/api/blochai/tasks/${id}?portal=graphus`, `/api/blochai/tasks/${id}/extra`]) assert.equal((await s.call({path, method: 'GET'})).status, 404);
    assert.equal((await s.call({method: 'OPTIONS'})).status, 405);
    assert.equal(s.requests.length, 0); assert.equal(s.contextRequests.length, 0); assert.deepEqual(s.budgetRows(), []);
  } finally {s.sql.close();}
});

test('request body byte limit is 1024 and does not consume a source budget', async () => {
  const s = setup(); try {
    const body = JSON.stringify({question_id: 'connections'}) + ' '.repeat(1024);
    const response = await s.call({body}); assert.equal(response.status, 413);
    assert.equal(s.requests.length, 0); assert.equal(s.contextRequests.length, 0); assert.deepEqual(s.budgetRows(), []);
    const within = await s.call({body: JSON.stringify({question_id: 'connections'}) + ' '.repeat(600)});
    assert.equal(within.status, 202);
  } finally {s.sql.close();}
});

test('cross-origin and missing client headers cannot submit or read tasks', async () => {
  const s = setup(); try {
    for (const headers of [{origin: 'https://attacker.test'}, {origin: 'null'}, {origin: ''}, {'sec-fetch-site': 'cross-site'}, {'x-blochai-client': ''}])
      assert.equal((await s.call({headers})).status, 403);
    for (const hostname of ['blochai.xyz', 'rednblue.space', 'bloch-grapus.xyz', 'attacker.test']) assert.equal((await s.call({hostname})).status, 404);
    assert.equal((await s.call({headers: {'cf-connecting-ip': ''}})).status, 503);
    assert.equal(s.requests.length, 0); assert.equal(s.contextRequests.length, 0); assert.deepEqual(s.budgetRows(), []);
  } finally {s.sql.close();}
});

test('poll capability protects the persisted guide by portal, task and one-hour expiry', async () => {
  const s = setup(); try {
    const data = await (await s.call()).json(), path = `/api/blochai/tasks/${data.task_id}`;
    for (const item of [{headers: {}}, {headers: {'x-blochai-ticket': '0'.repeat(64)}},
      {hostname: 'bloch.space', headers: {'x-blochai-ticket': data.poll_token}},
      {path: `/api/blochai/tasks/${id}`, headers: {'x-blochai-ticket': data.poll_token}},
      {now: 1750003600000, headers: {'x-blochai-ticket': data.poll_token}}]) {
      const response = await s.call({path, method: 'GET', ...item}); assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {error: 'public_task_not_found'});
    }
    assert.equal(s.requests.length, 1); assert.equal(s.contextRequests.length, 1);
    const second = await (await s.call()).json();
    assert.equal((await s.call({path, method: 'GET', headers: {'x-blochai-ticket': second.poll_token}})).status, 404);
  } finally {s.sql.close();}
});

test('per-address quotas are shared across portals and enforce ten per minute and sixty per day', async () => {
  const s = setup(); try {
    for (let index = 0; index < 60; index++) assert.equal((await s.call({now: baseTime + Math.floor(index / 10) * 60000})).status, 202);
    assert.equal((await s.call({now: baseTime + 360000})).status, 429);
    assert.equal(s.requests.length, 60); assert.equal(s.contextRequests.length, 60);
  } finally {s.sql.close();}
  const minute = setup(); try {
    for (let index = 0; index < 10; index++) assert.equal((await minute.call()).status, 202);
    assert.equal((await minute.call({hostname: 'bloch.space', body: {question_id: 'observations'}})).status, 429);
    assert.equal(minute.requests.length, 10); assert.equal(minute.contextRequests.length, 10);
  } finally {minute.sql.close();}
});

test('default global quota is 600 and configurable global and poll limits use database counters', async () => {
  const defaultLimit = setup(); try {
    const seconds = Math.floor(baseTime / 1000), day = Math.floor(seconds / 86400);
    defaultLimit.sql.prepare('INSERT INTO blochai_public_budget (bucket,count,expires_at) VALUES (?,?,?)')
      .run(`submit:global:${day}`, 600, (day + 1) * 86400);
    assert.equal((await defaultLimit.call()).status, 429);
    assert.equal(defaultLimit.requests.length, 0); assert.equal(defaultLimit.contextRequests.length, 0);
  } finally {defaultLimit.sql.close();}
  const s = setup(); try {
    s.env.PUBLIC_BLOCHAI_DAILY_LIMIT = '1'; const data = await (await s.call()).json();
    assert.equal((await s.call({headers: {'cf-connecting-ip': '192.0.2.2'}})).status, 429);
    for (let index = 0; index < 90; index++) assert.equal((await s.call({path: `/api/blochai/tasks/${data.task_id}`, method: 'GET', headers: {'x-blochai-ticket': data.poll_token}})).status, 200);
    assert.equal((await s.call({path: `/api/blochai/tasks/${data.task_id}`, method: 'GET', headers: {'x-blochai-ticket': data.poll_token}})).status, 429);
    assert.equal(s.contextRequests.length, 1);
  } finally {s.sql.close();}
});

test('unavailable observations remain unavailable in persisted guides and compact model context', async () => {
  const s = setup(); try {
    const response = await s.call({customContext: async query => ({...observation(query), status: 'unavailable', facts: [], transactions: [],
      graph: {nodes: [], edges: []}, sources: observation(query).sources.map(source => ({...source, status: 'unavailable'}))})});
    assert.equal(response.status, 202); const data = await response.json();
    assert.equal(data.guide.status, 'unavailable'); assert.deepEqual(data.guide.facts, []);
    assert.equal(JSON.parse(s.requests[0].init.body).observations.status, 'unavailable');
    assert.deepEqual(JSON.parse(s.sql.prepare('SELECT guide_json FROM blochai_public_jobs').get().guide_json), data.guide);
  } finally {s.sql.close();}
});

test('upstream redirects, failures, invalid IDs and unknown metadata fail closed', async () => {
  const s = setup(); try {
    for (const customFetch of [async () => new Response('', {status: 302, headers: {location: 'https://attacker.test'}}),
      async () => Response.json({error: 'secret details'}, {status: 500}),
      async () => Response.json({task_id: 'private-task', status: 'COMPLETED', output: 'secret'}),
      async () => Response.json({task_id: id, status: 'COMPLETED', model: 'm', output: null})]) {
      const response = await s.call({customFetch}); assert.equal(response.status, 503);
      assert.equal(await response.text(), '{"error":"public_backend_unavailable"}');
    }
    assert.equal(s.sql.prepare('SELECT COUNT(*) AS count FROM blochai_public_jobs').get().count, 0);
    s.env.PUBLIC_BLOCHAI_API_URL = 'https://attacker.test'; assert.equal((await s.call()).status, 503);
  } finally {s.sql.close();}
});

test('assistant and PDF assets are same-origin on approved portals, never on the hub or private host', async () => {
  let calls = 0;
  const env = {ASSETS: {async fetch(request) {calls++; assert.equal(request.headers.has('cookie'), false);
    assert.equal(request.headers.has('authorization'), false);
    return new Response('asset', {headers: {'set-cookie': 'no', 'access-control-allow-origin': '*'}});}}};
  const paths = ['/blochai-assistant.js', '/blochai-assistant.css', '/blochai-pdf/blochai-pdf.js'];
  for (const hostname of [host, 'bloch.space', 'blochl1.com']) for (const path of paths) {
    const response = await handlePublicBlochAI({request: new Request(`https://${hostname}${path}`, {headers: {cookie: 'private=ignored', authorization: 'Bearer ignored'}}), env});
    assert.equal(response.status, 200); assert.equal(response.headers.has('set-cookie'), false);
    assert.equal(response.headers.has('access-control-allow-origin'), false);
  }
  for (const hostname of ['blochai.xyz', 'rednblue.space']) for (const path of [...paths, '/api/blochai/tasks'])
    assert.equal((await handlePublicBlochAI({request: new Request(`https://${hostname}${path}`), env})).status, 404);
  assert.equal(calls, 9);
});
