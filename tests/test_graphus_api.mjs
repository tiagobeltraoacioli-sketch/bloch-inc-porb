import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../graphus/functions/api/[[path]].js';

const request=(path,method='GET',headers={})=>new Request('https://bloch-graphus.pages.dev/api/'+path,{method,headers});

test('public DaaS manifest is explicit about the synthetic-only stage',async()=>{
  const response=await onRequest({request:request('daas/manifest'),env:{}});
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.live_transactions,false);
  assert.equal(body.live_scores,false);
  assert.deepEqual(body.initial_assets.map(item=>item.asset),['BTC','ETH','USDT','USDC','BLCH']);
  assert.equal(body.query_capabilities.production_chain_query,false);
  assert.equal(body.query_capabilities.address_search,'synthetic-browser-fixture');
  assert.equal(body.research.aml_model,'not-validated');
  assert.ok(body.proposed_public_fields.includes('source_version'));
  assert.ok(body.private_fields.includes('aml_score'));
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
