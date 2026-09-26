import test from 'node:test';
import assert from 'node:assert/strict';
import {timelineGraph,timelineGraphCsv,connectionKey} from '../graphus/assets/atlas_timeline_graph.js';
import {exploreAtlasTimeline} from '../graphus/assets/atlas_timeline.js';
import {timelineSource} from './atlas_timeline_fixture.js';
import {sample} from './system_map_fixture.mjs';
import {mergePage} from '../portal/data.js';
import {digest} from '../portal/security.js';
const build=async(asset='ETH')=>exploreAtlasTimeline(mergePage(null,timelineSource(asset),asset));

test('timeline graphs group exact directed typed connections without changing the original report or query',async()=>{
  const report=await build(),before=JSON.stringify(report),g=timelineGraph(report);
  assert.equal(g.summary.matching_events,30);assert.equal(g.connections.length,4);assert.equal(g.nodes.length,4);assert.equal(g.summary.complete_history,false);
  for(const group of g.connections){const events=report.events.filter(event=>connectionKey(event)===group.key);assert.deepEqual(group.event_ids,events.map(event=>event.event_id));assert.equal(group.events,events.length);assert.equal(group.observed_total_base_units,events.reduce((sum,event)=>sum+BigInt(event.amount_base_units),0n).toString());assert.equal(group.first_observed,events[0].block_time);assert.equal(group.last_observed,events.at(-1).block_time);}
  assert.equal(g.connections.reduce((n,row)=>n+row.events,0),30);assert.equal(JSON.stringify(report),before);const {report_sha256,...body}=report;assert.equal(await digest(JSON.stringify(body)),report_sha256);assert.deepEqual(timelineGraph(report),g);
});
test('graph windows and event search combine before exact reference, direction and event-type filters',async()=>{
  const report=await build(),reference=report.events[0].from,first=timelineGraph(report,{first:0,last:0},{reference,direction:'outgoing',kind:'native_value'});
  assert.equal(first.summary.selected_timeline_events,27);assert.equal(first.events.length,9);assert.ok(first.events.every(event=>event.from===reference&&event.to!==reference));assert.equal(first.connections.length,1);
  assert.equal(timelineGraph(report,{query:'time-2'},{reference}).events.length,4);assert.equal(timelineGraph(report,{query:'time-29'},{reference,direction:'self'}).events.length,1);
  const empty=timelineGraph(report,{first:2,last:2},{reference});assert.equal(empty.events.length,0);assert.deepEqual(empty.nodes,[]);assert.deepEqual(empty.connections,[]);assert.equal(empty.filters.reference,reference);
  assert.equal(timelineGraph(report,{}, {reference,direction:'incoming'}).events.length,0);assert.throws(()=>timelineGraph(report,{}, {reference:reference.toUpperCase()}),/reference_unobserved/);
});
test('self events count once, repeated events retain their identities, and graph degree is a distinct-neighbor count',async()=>{
  const report=await build(),reference=report.events[0].from,g=timelineGraph(report,{}, {reference}),node=g.nodes.find(node=>node.id===reference);
  assert.equal(node.events,11);assert.equal(node.self,1);assert.equal(node.incoming,0);assert.equal(node.outgoing,10);assert.equal(node.adjacent_references,1);assert.equal(g.connections.length,2);
  const self=timelineGraph(report,{}, {reference,direction:'self'});assert.equal(self.nodes.length,1);assert.equal(self.nodes[0].events,1);assert.equal(self.nodes[0].adjacent_references,0);assert.equal(self.connections[0].events,1);
  const recipient=timelineGraph(report).nodes.find(node=>node.incoming===29);assert.equal(recipient.adjacent_references,3);assert.equal(recipient.events,29);
});
test('BTC and BLCH preserve typed transaction endpoints, separate input/output totals and exact outpoint evidence',async()=>{
  for(const asset of ['BTC','BLCH']){const graph=mergePage(null,sample(asset),asset),transaction=graph.nodes.find(node=>node.kind==='transaction');for(const event of graph.edges)event.block_time='2026-09-24T12:00:00Z';
    graph.edges.push({...graph.edges[0],event_id:'input-fixture',from:graph.nodes[1].id,to:transaction.id,kind:asset==='BTC'?'observed_input_prevout':'observed_spent_outpoint_reference',position:0,outpoint:{txid:'c'.repeat(64),vout:1}});
    const report=await exploreAtlasTimeline(graph),g=timelineGraph(report,{}, {reference:transaction.id});assert.equal(g.connections.length,2);assert.equal(g.nodes.length,2);assert.ok(g.nodes.some(node=>node.kind==='transaction'));assert.ok(g.nodes.some(node=>node.kind===(asset==='BTC'?'address':'script_hash')));assert.equal(Object.hasOwn(g,'observed_total_base_units'),false);
    const incoming=timelineGraph(report,{}, {reference:transaction.id,direction:'incoming'});assert.equal(incoming.events.length,1);assert.deepEqual(incoming.events[0].outpoint,{txid:'c'.repeat(64),vout:1});const output=timelineGraph(report,{}, {kind:graph.edges[0].kind});assert.equal(output.events.length,25);assert.ok(output.events.every(event=>event.from===transaction.id));
  }
});
test('both token assets keep exact quantities and empty or untimed reports produce no invented nodes',async()=>{
  for(const asset of ['USDT','USDC']){const report=await build(asset),g=timelineGraph(report);assert.equal(g.events.length,30);assert.ok(g.connections.every(group=>group.kind==='erc20_transfer'));assert.equal(g.connections.reduce((sum,group)=>sum+BigInt(group.observed_total_base_units),0n),(29n*900719925474099312345n));}
  const report=await exploreAtlasTimeline(mergePage(null,sample('BLCH'),'BLCH')),g=timelineGraph(report);assert.equal(report.state,'unavailable');assert.deepEqual(g.references,[]);assert.deepEqual(g.events,[]);assert.equal(timelineGraphCsv(report).split('\r\n').length,1);
});
test('graph exports include all matching event pages, complete criteria and source hashes; connection selection stays exact',async()=>{
  const report=await build(),g=timelineGraph(report),all=timelineGraphCsv(report),connection=g.connections.find(group=>group.events===10),subset=timelineGraphCsv(report,{}, {},connection.key);
  assert.equal(all.split('\r\n').length,31);assert.equal(subset.split('\r\n').length,11);assert.ok(subset.includes(report.report_sha256));assert.ok(subset.includes(report.provenance.dataset_sha256));assert.ok(subset.includes('"'+connection.key.replaceAll('"','""')+'"'));assert.ok(subset.includes(connection.event_ids.at(-1)));assert.equal(timelineGraphCsv(report,{first:2,last:2}).split('\r\n').length,1);
  const csv=timelineGraphCsv(report,{query:'time-29'},{reference:report.events.at(-1).from,direction:'self',kind:'native_value'});assert.equal(csv.split('\r\n').length,2);assert.ok(csv.includes('"time-29","'+report.events.at(-1).from+'","self","native_value"'));
  assert.throws(()=>timelineGraphCsv(report,{first:2,last:2},{},connection.key),/connection_unobserved/);
});
test('graph CSV quotes literal source text, neutralizes formulas, and does not round large values',async()=>{
  const source=timelineSource();source.edges[0].event_id=' =SUM(1,2)';source.edges[1].event_id='quoted "event"\nline';const report=await exploreAtlasTimeline(mergePage(null,source,'ETH')),csv=timelineGraphCsv(report);
  assert.ok(csv.includes('"\' =SUM(1,2)"'));assert.ok(csv.includes('"quoted ""event""\nline"'));assert.ok(csv.includes('"900719925474099312345"'));assert.equal(report.events[0].amount_base_units,'0');
});
test('graph bounds admit all 4000 events without visual truncation affecting the export and reject invalid filters',async()=>{
  const report=await build(),large={...report,events:Array.from({length:4000},(_,i)=>({...report.events[0],event_id:'event-'+i,amount_base_units:String(i)}))},g=timelineGraph(large);
  assert.equal(g.events.length,4000);assert.equal(g.connections[0].events,4000);assert.equal(g.connections[0].observed_total_base_units,'7998000');assert.equal(timelineGraphCsv(large).split('\r\n').length,4001);
  assert.throws(()=>timelineGraph({...large,events:[...large.events,large.events[0]]}),/capacity/);
  for(const filters of [{direction:'incoming'},{direction:'sideways'},{kind:'invented'},{reference:'missing'},{extra:true}])assert.throws(()=>timelineGraph(report,{},filters));
  assert.throws(()=>timelineGraph(report,{first:-1,last:0}),/selection/);assert.throws(()=>timelineGraph(report,{},null),/filters/);
});
