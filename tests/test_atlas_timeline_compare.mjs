import test from 'node:test';
import assert from 'node:assert/strict';
import {compareTimelineWindows,timelineComparisonRows,timelineComparisonEvents,timelineComparisonCsv} from '../graphus/assets/atlas_timeline_compare.js';
import {exploreAtlasTimeline} from '../graphus/assets/atlas_timeline.js';
import {timelineSource} from './atlas_timeline_fixture.js';
import {sample} from './system_map_fixture.mjs';
import {mergePage} from '../portal/data.js';
import {digest} from '../portal/security.js';
const windowA={first:0,last:0},windowB={first:1,last:1};
const bounds={interval:'hour',start:'2026-09-24T12:00:00Z',end:'2026-09-24T13:59:59.999Z'};
async function fixture(asset='ETH',transform=()=>{}){
  const source=timelineSource(asset),ids=source.nodes.map(node=>node.id);
  source.edges=source.edges.slice(0,8).map((event,index)=>({...event,from:ids[[0,0,1,1,0,2,2,2][index]],to:ids[[3,3,3,4,3,4,4,4][index]],amount_base_units:String([1,3,0,4,1,3,4,0][index]),block_time:new Date(Date.UTC(2026,8,24,12+(index>=4?1:0),0,index%4)).toISOString()}));
  transform(source);return exploreAtlasTimeline(mergePage(null,source,asset),bounds);
}
test('window comparison reproduces exact count/value concentration, presence and original lineage',async()=>{
  const timeline=await fixture(),original=JSON.stringify(timeline),report=await compareTimelineWindows(timeline,windowA,windowB),group=report.groups[0],from=group.source_references,to=group.destination_references;
  assert.equal(report.baseline.observed_events,4);assert.equal(report.comparison.observed_events,4);assert.equal(report.equal_durations,true);assert.equal(report.baseline.duration_ms,3600000);assert.deepEqual(group.change,{events:0,observed_total_base_units:'0'});
  assert.deepEqual(from.baseline.event_concentration,{numerator:'8',denominator:'16',approximation:0.5});assert.deepEqual(from.baseline.value_concentration,{numerator:'32',denominator:'64',approximation:0.5});assert.equal(from.comparison.event_concentration.approximation,0.625);assert.equal(from.comparison.value_concentration.approximation,0.78125);assert.equal(to.baseline.event_concentration.approximation,0.625);assert.equal(from.comparison.largest_value_share.approximation,0.875);
  assert.deepEqual(from.membership,{both:1,baseline_only:1,comparison_only:1});assert.equal(report.provenance.timeline_report_sha256,timeline.report_sha256);assert.equal(report.provenance.dataset_sha256,timeline.provenance.dataset_sha256);assert.equal(report.baseline.complete_history,false);assert.equal(JSON.stringify(timeline),original);
  const {comparison_sha256,...body}=report;assert.equal(await digest(JSON.stringify(body)),comparison_sha256);assert.deepEqual(await compareTimelineWindows(timeline,windowA,windowB),report);
});
test('unknown and zero-value windows remain distinct from zero concentration or chain inactivity',async()=>{
  const timeline=await fixture('ETH',source=>{for(const event of source.edges)event.amount_base_units='0';}),report=await compareTimelineWindows(timeline,windowA,windowB),group=report.groups[0];assert.equal(group.baseline.observed_total_base_units,'0');assert.equal(group.source_references.baseline.value_concentration,null);assert.equal(group.source_references.baseline.largest_value_share,null);assert.equal(group.source_references.baseline.event_concentration.approximation,0.5);
  const empty=await compareTimelineWindows(timeline,{...windowA,query:'missing'},{...windowB,query:'missing'});assert.equal(empty.groups.length,0);assert.equal(empty.baseline.observed_events,0);assert.equal(empty.baseline.buckets_without_matching_events,1);assert.equal(empty.baseline.complete_history,false);assert.equal(timelineComparisonCsv(empty).split('\r\n').length,1);
  const one=await compareTimelineWindows(timeline,{...windowA,query:'time-04'},{...windowB,query:'time-04'});assert.equal(one.groups[0].source_references.baseline.event_concentration,null);assert.equal(one.groups[0].source_references.comparison.event_concentration.approximation,1);assert.equal(one.groups[0].change.events,1);assert.equal(one.groups[0].source_references.rows[0].baseline.event_share,null);
});
test('strict disjoint chronological windows, identical search and UTC clipping prevent misleading baselines',async()=>{
  const timeline=await fixture();await assert.rejects(()=>compareTimelineWindows(timeline,windowA,windowA),/requires_later_window/);await assert.rejects(()=>compareTimelineWindows(timeline,windowB,windowA),/requires_later_window/);await assert.rejects(()=>compareTimelineWindows(timeline,{first:0,last:1},windowB),/requires_later_window/);await assert.rejects(()=>compareTimelineWindows(timeline,{...windowA,query:'time'},windowB),/search_mismatch/);
  const same=await compareTimelineWindows(timeline,{...windowA,query:' TIME '},{...windowB,query:'time'});assert.equal(same.baseline.observed_events,4);
  const source=mergePage(null,timelineSource(),'ETH'),clipped=await exploreAtlasTimeline(source,{interval:'hour',start:'2026-09-24T12:00:05Z',end:'2026-09-24T13:00:00Z'}),result=await compareTimelineWindows(clipped,windowA,windowB);assert.equal(result.equal_durations,false);assert.equal(result.comparison.duration_ms,1);assert.equal(result.baseline.selection.end_inclusive,'2026-09-24T12:59:59.999Z');assert.equal(result.comparison.observed_events,1);
});
test('large integer amounts, formula-safe CSV and independent export filters never change the comparison',async()=>{
  const huge='9'.repeat(78),timeline=await fixture('USDT',source=>{for(const event of source.edges)event.amount_base_units=huge;source.edges[0].event_id='=SUM(1,2)';}),report=await compareTimelineWindows(timeline,windowA,windowB),original=JSON.stringify(report),group=report.groups[0],row=timelineComparisonRows(report)[0];
  assert.equal(group.baseline.observed_total_base_units,String(BigInt(huge)*4n));assert.equal(group.source_references.comparison.value_concentration.approximation,0.625);assert.equal(row.presence,'comparison_only');assert.equal(row.change.observed_total_base_units,String(BigInt(huge)*3n));
  const csv=timelineComparisonCsv(report,{query:row.reference}),lines=csv.split('\r\n');assert.equal(lines.length,2);assert.ok(csv.includes(report.comparison_sha256));assert.ok(csv.includes(timeline.report_sha256));assert.ok(csv.includes(String(BigInt(huge)*3n)));assert.equal(timelineComparisonCsv(report).split('\r\n').length,4);assert.ok(timelineComparisonCsv(report).includes('"\'-'+String(BigInt(huge)*2n)+'"'));
  assert.deepEqual(timelineComparisonEvents(report,{reference:row.reference}).map(row=>row.window),['comparison','comparison','comparison']);assert.equal(JSON.stringify(report),original);
  const escaped=structuredClone(report);escaped.groups[0].source_references.rows[0].reference=' ="x,y"\nline';assert.ok(timelineComparisonCsv(escaped).includes('"\' =""x,y""\nline"'));assert.throws(()=>timelineComparisonEvents(report,{reference:'absent'}),/reference_unobserved/);
});
test('self, zero, mint and burn observations retain exact roles and recorded directions for both tokens',async()=>{
  for(const asset of ['USDT','USDC']){const timeline=await fixture(asset,source=>{const zero='0x'+'0'.repeat(40),old=source.nodes[0].id;source.nodes[0]={...source.nodes[0],id:asset+':address:'+zero,address:zero};for(const event of source.edges)for(const role of ['from','to'])if(event[role]===old)event[role]=source.nodes[0].id;source.edges[0].to=source.nodes[0].id;source.edges[1].to=source.nodes[0].id;}),report=await compareTimelineWindows(timeline,windowA,windowB);
    assert.equal(report.groups[0].kind,'erc20_transfer');assert.equal(report.groups[0].baseline.events,4);assert.equal(report.groups[0].source_references.rows.reduce((n,row)=>n+row.baseline.events,0),4);assert.equal(report.groups[0].destination_references.rows.reduce((n,row)=>n+row.baseline.events,0),4);assert.equal(report.baseline.events[0].from,report.baseline.events[0].to);assert.equal(report.baseline.events[0].direction,'observed');
  }
  const graph=mergePage(null,timelineSource(),'ETH'),report=await exploreAtlasTimeline(graph,{...bounds,reference:graph.nodes[0].id}),comparison=await compareTimelineWindows(report,windowA,windowB);assert.ok(comparison.groups.every(group=>group.direction==='outgoing'));assert.equal(comparison.parent_query.reference,graph.nodes[0].id);
});
test('BTC and BLCH input/output quantities and transaction/script references stay separate; untimed BLCH cannot be compared',async()=>{
  for(const asset of ['BTC','BLCH']){const source=sample(asset);source.edges=source.edges.slice(0,2);for(let i=0;i<2;i++){source.edges[i].block_time='2026-09-24T12:00:00Z';source.edges[i].amount_base_units='12';}source.edges.push({...source.edges[0],event_id:'input',kind:asset==='BTC'?'observed_input_prevout':'observed_spent_outpoint_reference',from:source.nodes[1].id,to:source.nodes[2].id,position:0,outpoint:{txid:'c'.repeat(64),vout:1}});
    const graph=mergePage(null,source,asset);graph.edges.find(event=>event.event_id==='input').outpoint={txid:'c'.repeat(64),vout:1};const report=await exploreAtlasTimeline(graph,bounds),comparison=await compareTimelineWindows(report,windowA,windowB);assert.equal(comparison.groups.length,2);assert.deepEqual(comparison.groups.map(group=>group.baseline.observed_total_base_units).sort(),['12','24']);assert.equal(Object.hasOwn(comparison,'observed_total_base_units'),false);assert.ok(comparison.baseline.events.some(event=>event.outpoint?.vout===1));assert.ok(comparison.groups.some(group=>group.source_references.rows.some(row=>row.reference.includes(':transaction:'))));
  }
  const untimed=await exploreAtlasTimeline(mergePage(null,sample('BLCH'),'BLCH'));await assert.rejects(()=>compareTimelineWindows(untimed,{first:0,last:-1},{first:0,last:-1}),/requires_timed_windows/);
});
test('original hash verification, bounded inputs and copied selections reject corrupt or stale calculations',async()=>{
  const report=await fixture(),corrupt=structuredClone(report);corrupt.events[0].amount_base_units='999';await assert.rejects(()=>compareTimelineWindows(corrupt,windowA,windowB),/integrity_failed/);
  for(const selection of [null,[],{extra:true},{first:-1,last:0},{first:0,last:99},{query:1},{query:'x'.repeat(201)}])await assert.rejects(()=>compareTimelineWindows(report,selection,windowB));
  await assert.rejects(()=>compareTimelineWindows({...report,events:Array(4001).fill(report.events[0])},windowA,windowB),/capacity/);
  const source=structuredClone(report),first={...windowA},pending=compareTimelineWindows(source,first,windowB);source.events[0].amount_base_units='999';first.last=1;const result=await pending;assert.equal(result.baseline.events[0].amount_base_units,'1');assert.equal(result.baseline.selection.last_bucket,0);
  for(const filters of [{role:'owner'},{group:1},{group:-1},{query:null},{query:'x'.repeat(201)}])assert.throws(()=>timelineComparisonRows(result,filters));
});
test('all 4000 bounded observations and 1200 references survive comparison and all-page exports',async()=>{
  const report=await fixture(),ids=Array.from({length:1200},(_,i)=>'ETH:address:0x'+i.toString(16).padStart(40,'0'));
  report.events=Array.from({length:4000},(_,i)=>({...report.events[0],event_id:'event-'+i,from:ids[i%1200],to:ids[(i+1)%1200],amount_base_units:String(i),bucket_index:i<2000?0:1,block_time:i<2000?'2026-09-24T12:00:00.000Z':'2026-09-24T13:00:00.000Z'}));report.coverage.records=4000;report.coverage.returned_records=4000;report.coverage.timed_candidates=4000;for(const bucket of report.buckets)bucket.observed_events=2000;delete report.report_sha256;report.report_sha256=await digest(JSON.stringify(report));
  const result=await compareTimelineWindows(report,windowA,windowB);assert.equal(result.baseline.events.length+result.comparison.events.length,4000);assert.equal(result.groups[0].source_references.rows.length,1200);assert.equal(timelineComparisonCsv(result).split('\r\n').length,1201);assert.equal(result.groups[0].comparison.observed_total_base_units,'5999000');assert.ok(new TextEncoder().encode(JSON.stringify(result)).length<result.limits.response_bytes);
});
