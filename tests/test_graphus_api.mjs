import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../graphus/functions/api/[[path]].js';

const request=(path,method='GET',headers={})=>new Request('https://bloch-graphus.pages.dev/api/'+path,{method,headers});

test('public DaaS manifest distinguishes bounded real samples from complete chain history',async()=>{
  const response=await onRequest({request:request('daas/manifest'),env:{}});
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.live_transactions,true);
  assert.equal(body.transaction_coverage,'bounded-on-demand-public-chain-samples');
  assert.equal(body.query_capabilities.recent_network_graph.endpoint,'/api/chain/network');
  assert.deepEqual(body.query_capabilities.recent_network_graph.assets,['BTC','ETH','USDT','USDC','BLCH']);
  assert.equal(body.query_capabilities.recent_network_graph.pagination,'next_cursor');
  assert.equal(body.query_capabilities.observed_balance_sample.limit,16);
  assert.equal(body.query_capabilities.observed_balance_sample.holder_identity,false);
  assert.equal(body.live_scores,false);
  assert.equal(body.status,'mixed-synthetic-and-source-reported-preview');
  assert.deepEqual(body.initial_assets.map(item=>item.asset),['BTC','ETH','USDT','USDC','BLCH']);
  assert.equal(body.query_capabilities.production_chain_query,false);
  assert.equal(body.query_capabilities.address_search,'synthetic-browser-fixture-and-bounded-source-reported-query');
  assert.equal(body.query_capabilities.bounded_public_chain_address_lookup.independently_verified,false);
  assert.equal(body.query_capabilities.bounded_public_chain_address_lookup.bloch,'source-reported-archival-script-hash-balance');
  assert.equal(body.query_capabilities.bloch_indexed_script_ranking.unit,'script_hash');
  assert.deepEqual(body.query_capabilities.bounded_public_erc20_activity.assets,['USDT','USDC']);
  assert.equal(body.research.aml_model,'not-validated');
  assert.ok(body.proposed_public_fields.includes('source_version'));
  assert.ok(body.private_fields.includes('aml_score'));
});
test('network graph route rejects unknown assets and extra parameters before any source request',async()=>{
  for(const query of ['asset=SOL','asset=BTC&url=https://example.test','asset=BTC&asset=ETH','asset=ETH&cursor=../secret']){
    const response=await onRequest({request:request('chain/network?'+query),env:{}});
    assert.equal(response.status,400);
  }
});
test('balance sample route rejects unsupported queries without requesting a source',async()=>{
  for(const query of ['asset=ETH&addresses=invalid','asset=ETH&url=https://example.test','asset=BLCH&addresses=abc'])assert.equal((await onRequest({request:request('chain/balances?'+query),env:{}})).status,400);
});

test('Google login stays disabled until an explicit release flag and bindings exist',async()=>{
  const env={GRAPHUS_DB:{},GOOGLE_CLIENT_ID:'test-client'};
  const config=await (await onRequest({request:request('config'),env})).json();
  assert.equal(config.google_enabled,false);
  assert.equal(config.google_client_id,null);
  const nonce=await onRequest({request:request('auth/nonce'),env});
  assert.equal(nonce.status,503);
});

test('private annotations fail closed without an account service',async()=>{
  const response=await onRequest({request:request('annotations'),env:{}});
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,'account_service_not_configured');
});

test('state changing requests require same-origin action header',async()=>{
  const response=await onRequest({request:request('auth/logout','POST'),env:{GRAPHUS_DB:{}}});
  assert.equal(response.status,403);
});
