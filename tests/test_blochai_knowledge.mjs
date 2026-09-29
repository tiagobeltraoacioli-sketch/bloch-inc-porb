import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {KNOWLEDGE} from '../deploy/blochai-public/knowledge.js';

const registry = JSON.parse(readFileSync(new URL('../docs/knowledge-sources.json', import.meta.url), 'utf8'));
const topics = Object.entries(KNOWLEDGE).flatMap(([portal, entry]) => Object.entries(entry.topics).map(([id, topic]) => ({portal, id, topic})));
const sources = new Map(registry.sources.map(source => [source.id, source]));
const hosts = new Set(['developer.bitcoin.org', 'ethereum.org', 'github.com', 'bloch-graphus.xyz', 'bloch.space', 'blochl1.com']);

test('the web knowledge mirror matches the shared reviewed knowledge digest', () => {
  assert.equal(createHash('sha256').update(JSON.stringify(KNOWLEDGE)).digest('hex'), registry.knowledge_sha256);
  assert.equal(topics.length, 60);
  assert.deepEqual(Object.fromEntries(Object.entries(KNOWLEDGE).map(([portal, entry]) => [portal, Object.keys(entry.topics).length])), {graphus: 20, space: 20, explorer: 20});
});

test('every public topic has bounded notes, explicit network relevance and primary references', () => {
  for (const {portal, id, topic} of topics) {
    assert.match(id, /^[a-z0-9_]{1,32}$/);
    assert.equal(topic.reviewed_at, '2026-09-28');
    assert.ok(topic.networks.length && topic.networks.every(network => ['bitcoin', 'ethereum', 'bloch'].includes(network)));
    assert.equal(new Set(topic.networks).size, topic.networks.length);
    if (portal === 'explorer') assert.deepEqual(topic.networks, ['bloch']);
    assert.ok(topic.notes.length >= 2 && topic.notes.length <= 4);
    assert.ok(topic.notes.every(note => typeof note === 'string' && note.length <= 300));
    assert.ok(topic.notes.join('').length <= 700);
    assert.ok(topic.sources.length && topic.sources.length <= 4);
    for (const source of topic.sources) {
      assert.deepEqual(source, sources.get(source.id));
      const url = new URL(source.url);
      assert.equal(url.protocol, 'https:'); assert.ok(hosts.has(url.hostname));
      assert.equal(url.username + url.password + url.port + url.search + url.hash, '');
      assert.doesNotMatch(url.pathname, /^\/(api\/porb\/|portal|account)/);
    }
  }
});

test('chain-specific concepts cannot appear as unqualified cross-network topics', () => {
  for (const portal of ['graphus', 'space']) assert.deepEqual(KNOWLEDGE[portal].topics.accounts.networks, ['ethereum']);
  assert.deepEqual(KNOWLEDGE.graphus.topics.change_outputs.networks, ['bitcoin']);
  assert.deepEqual(KNOWLEDGE.graphus.topics.token_events.networks, ['ethereum']);
  assert.deepEqual(KNOWLEDGE.space.topics.bitcoin_fee_rate.networks, ['bitcoin']);
  for (const source of registry.sources.filter(source => source.url.includes('/bloch-sis-pow/'))) {
    assert.ok(source.url.includes(`/blob/${registry.bloch_reference_commit}/`));
  }
});
