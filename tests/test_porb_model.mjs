import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreGraph,isolationForest} from '../portal/model.js';
import {mergePage,collect} from '../portal/data.js';
import {sourceGraph} from './porb_helpers.mjs';

test('model preserves exact amounts, deterministic scores and structural outlier separation',()=>{
  const graph=sourceGraph(),result=scoreGraph(graph),again=scoreGraph({...graph,nodes:graph.nodes.slice().reverse(),edges:graph.edges.slice().reverse()});
  assert.deepEqual(result.rows,again.rows);assert.equal(result.cohort_size,40);assert.equal(result.ml.available,true);
  const hub=result.rows.find(r=>r.incoming_events===39),leaf=result.rows.find(r=>r.outgoing_events===1);
  assert.equal(hub.incoming_base_units,'780000000000000000000');assert.ok(hub.red>leaf.red);assert.ok(hub.red>60);
  for(const row of result.rows){assert.ok(row.red>=0&&row.red<=100);assert.equal(row.blue,100);assert.ok(Number.isFinite(row.ensemble_spread));}
  assert.equal(result.model.training.includes('Unsupervised'),true);
});
test('small or constant cohorts produce no Red; missing timestamps reduce Blue, never invent measurements',()=>{
  const graph=sourceGraph();graph.edges=graph.edges.slice(0,5).map(e=>({...e,block_time:undefined}));const r=scoreGraph(graph);
  assert.equal(r.ml.available,false);assert.ok(r.rows.every(r=>r.red===null&&r.blue===80));
  assert.equal(isolationForest(Array.from({length:30},()=>Object.fromEntries(['log_in_events','log_out_events','log_neighbors','log_in_amount','log_out_amount','direction_balance','neighbor_concentration','log_active_blocks'].map(k=>[k,1])))).available,false);
});
test('merge deduplicates events, preserves provenance and rejects anchor/event/asset conflicts',()=>{
  const page=sourceGraph(),first=mergePage(null,page,'ETH'),second=mergePage(first,page,'ETH');assert.equal(second.edges.length,39);
  const changed=structuredClone(page);changed.edges[0].amount_base_units='4';assert.throws(()=>mergePage(first,changed,'ETH'),/source_event_changed/);
  const reorg=structuredClone(page);reorg.anchor.hash='0x'+'a'.repeat(64);assert.throws(()=>mergePage(first,reorg,'ETH'),/source_block_changed/);
  assert.throws(()=>mergePage(null,page,'BTC'),/invalid_source_graph/);
  const broken=structuredClone(page);broken.edges[0].from='missing';assert.throws(()=>mergePage(null,broken,'ETH'),/invalid_source_event/);
});
test('collection uses only fixed Graphus endpoints and source cursors; failures remain failures',async()=>{
  const urls=[];const graph=await collect('ETH',2,async url=>{urls.push(url);const u=new URL(url);return Response.json(sourceGraph('ETH',Number(u.searchParams.get('cursor')||100)));});
  assert.equal(graph.edges.length,78);assert.equal(graph.returned_pages,2);assert.ok(urls.every(u=>u.startsWith('https://bloch-graphus.xyz/api/chain/network?')));assert.match(urls[1],/cursor=99/);
  await assert.rejects(collect('DOGE',2),/invalid_collection_parameters/);
  await assert.rejects(collect('BTC',1,async()=>new Response('fail',{status:503})),/public_source_http_503/);
});

test('transient public reads retry once, redirects are rejected and records remain source-derived',async()=>{
  let calls=0;const result=await collect('ETH',1,async(url,options)=>{assert.equal(options.redirect,'manual');calls++;return calls===1?new Response('temporary',{status:502}):Response.json(sourceGraph());});assert.equal(calls,2);assert.equal(result.edges.length,39);
  let redirects=0;await assert.rejects(collect('ETH',1,async()=>{redirects++;return new Response('',{status:302,headers:{location:'https://untrusted.example/'}});}),/public_source_http_302/);assert.equal(redirects,1);
});

test('eight-page collection increases observations under unchanged record bounds',async()=>{
  const graph=await collect('ETH',8,async url=>{const u=new URL(url);return Response.json(sourceGraph('ETH',Number(u.searchParams.get('cursor')||100)));});
  assert.equal(graph.returned_pages,8);assert.equal(graph.edges.length,312);assert.equal(graph.nodes.length,40);
  await assert.rejects(collect('ETH',9),/invalid_collection_parameters/);
});
