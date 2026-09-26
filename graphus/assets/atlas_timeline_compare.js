import {TIMELINE_VERSION,TIMELINE_LIMITS,TimelineError,timelineView} from './atlas_timeline.js';

export const TIMELINE_COMPARISON_VERSION='graphus-atlas-timeline-comparison-1.0.0';
export const TIMELINE_COMPARISON_LIMITS=Object.freeze({references_per_page:8,events_per_page:10,response_bytes:12000000});
const encoder=new TextEncoder(),order=(a,b)=>a<b?-1:a>b?1:0;
const check=(ok,code)=>{if(!ok)throw new TimelineError(code);};
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const fraction=(numerator,denominator)=>denominator===0n?null:{numerator:String(numerator),denominator:String(denominator),approximation:Number(numerator*1000000000000n/denominator)/1e12};
const sum=events=>events.reduce((total,event)=>total+BigInt(event.amount_base_units),0n);
const key=event=>JSON.stringify([event.kind,event.direction]);
const selection=input=>{check(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).every(name=>['first','last','query'].includes(name)),'invalid_timeline_comparison_selection');check(input.query===undefined||typeof input.query==='string'&&input.query.length<=200,'invalid_timeline_comparison_search');return input;};
function cohort(report,input){
  const view=timelineView(report,selection(input)),buckets=report.buckets.slice(view.selection.first_bucket,view.selection.last_bucket+1),observed=new Set(view.events.map(event=>event.bucket_index));
  check(view.selection.start!==null,'timeline_comparison_requires_timed_windows');
  return {selection:view.selection,duration_ms:Date.parse(view.selection.end_inclusive)-Date.parse(view.selection.start)+1,observed_events:view.events.length,buckets:buckets.length,buckets_with_matching_events:observed.size,buckets_without_matching_events:buckets.length-observed.size,complete_history:false,events:view.events};
}
function referenceStats(events,role){
  const refs=new Map();for(const event of events){if(!refs.has(event[role]))refs.set(event[role],{events:0,value:0n});const row=refs.get(event[role]);row.events++;row.value+=BigInt(event.amount_base_units);}
  const counts=[...refs.values()],n=BigInt(events.length),total=sum(events);
  return {refs,summary:{references:refs.size,positive_value_references:counts.filter(row=>row.value>0n).length,
    event_concentration:fraction(counts.reduce((s,row)=>s+BigInt(row.events)**2n,0n),n*n),
    value_concentration:fraction(counts.reduce((s,row)=>s+row.value**2n,0n),total*total),
    largest_event_share:fraction(BigInt(Math.max(0,...counts.map(row=>row.events))),n),
    largest_value_share:fraction(counts.reduce((max,row)=>row.value>max?row.value:max,0n),total)}};
}
function referenceComparison(baseline,current,role){
  const before=referenceStats(baseline,role),after=referenceStats(current,role),aTotal=sum(baseline),bTotal=sum(current);
  const ids=[...new Set([...before.refs.keys(),...after.refs.keys()])].sort(order),membership={both:0,baseline_only:0,comparison_only:0};
  const rows=ids.map(reference=>{
    const a=before.refs.get(reference),b=after.refs.get(reference),presence=a&&b?'both':a?'baseline_only':'comparison_only';membership[presence]++;
    const stats=(row,events,total)=>({events:row?.events??0,observed_total_base_units:String(row?.value??0n),event_share:fraction(BigInt(row?.events??0),BigInt(events)),value_share:fraction(row?.value??0n,total)});
    return {reference,presence,baseline:stats(a,baseline.length,aTotal),comparison:stats(b,current.length,bTotal),change:{events:(b?.events??0)-(a?.events??0),observed_total_base_units:String((b?.value??0n)-(a?.value??0n))}};
  });
  return {baseline:before.summary,comparison:after.summary,membership,rows};
}

export async function compareTimelineWindows(report,baselineSelection,comparisonSelection){
  const baselineInput={...selection(baselineSelection)},comparisonInput={...selection(comparisonSelection)};
  check(report&&report.version===TIMELINE_VERSION&&Array.isArray(report.events)&&Array.isArray(report.buckets),'invalid_timeline_comparison_report');
  check(report.events.length<=TIMELINE_LIMITS.records&&report.buckets.length<=TIMELINE_LIMITS.buckets&&new Set(report.events.flatMap(event=>[event.from,event.to])).size<=TIMELINE_LIMITS.nodes,'timeline_comparison_capacity');
  const {report_sha256,...parent}=report,serialized=JSON.stringify(parent);check(encoder.encode(serialized).length+100<=TIMELINE_LIMITS.response_bytes,'timeline_comparison_capacity');
  check(typeof report_sha256==='string'&&await hash(serialized)===report_sha256,'timeline_comparison_integrity_failed');
  // Work from the bytes that were verified, including across the asynchronous digest.
  const verified=JSON.parse(serialized),baseline=cohort(verified,baselineInput),comparison=cohort(verified,comparisonInput);
  check(baseline.selection.event_search===comparison.selection.event_search,'timeline_comparison_search_mismatch');
  check(Date.parse(baseline.selection.end_inclusive)<Date.parse(comparison.selection.start),'timeline_comparison_requires_later_window');
  const grouped=new Map();for(const [side,events] of [['baseline',baseline.events],['comparison',comparison.events]])for(const event of events){const id=key(event);if(!grouped.has(id))grouped.set(id,{kind:event.kind,direction:event.direction,baseline:[],comparison:[]});grouped.get(id)[side].push(event);}
  const groups=[...grouped.values()].sort((a,b)=>order(a.kind,b.kind)||order(a.direction,b.direction)).map(group=>({kind:group.kind,direction:group.direction,
    baseline:{events:group.baseline.length,observed_total_base_units:String(sum(group.baseline))},comparison:{events:group.comparison.length,observed_total_base_units:String(sum(group.comparison))},
    change:{events:group.comparison.length-group.baseline.length,observed_total_base_units:String(sum(group.comparison)-sum(group.baseline))},
    source_references:referenceComparison(group.baseline,group.comparison,'from'),destination_references:referenceComparison(group.baseline,group.comparison,'to')}));
  const notes=[
    'Both disjoint UTC windows come from one verified timeline, with the same event search and inherited query. The baseline must precede the comparison window.',
    'Counts, differences and sums describe matching returned events. Missing records and empty windows do not establish chain inactivity, growth, losses or new/disappeared entities.',
    'Amounts remain exact integer base-unit strings. Event types and recorded directions stay separate; input references and created outputs are not added as transferred volume.',
    'Source and destination concentration each group the same events independently. Never add the two roles. Each self event counts once per role; zero-value and mint/burn observations remain eligible.',
    'Concentration is the sum of squared reference shares, with exact integer numerators and denominators. Largest share is the maximum reference share. Approximations are truncated to 12 decimal places; an empty count denominator or zero total value gives null, not zero concentration.',
    'Reference presence describes only these two filtered samples. A reference may be an address, script hash or transaction; it is not an identified owner or a cluster.',
    'Unequal durations and collection coverage can change observed totals. No rate normalization, significance test, anomaly threshold, AML label or calibrated risk score is produced.',
    'comparison_sha256 verifies JSON.stringify(this report without comparison_sha256) in returned property order. The parent timeline hash identifies the original full calculation; neither digest independently verifies source truth.'
  ];
  const result={version:TIMELINE_COMPARISON_VERSION,asset:verified.asset,network:verified.network,asset_id:verified.asset_id,unit:verified.unit,decimals:verified.decimals,
    provenance:{...verified.provenance,timeline_version:verified.version,timeline_report_sha256:report_sha256},parent_query:verified.parameters,parent_coverage:verified.coverage,
    baseline,comparison,equal_durations:baseline.duration_ms===comparison.duration_ms,groups,limits:TIMELINE_COMPARISON_LIMITS,notes};
  const bytes=JSON.stringify(result);check(encoder.encode(bytes).length+100<=TIMELINE_COMPARISON_LIMITS.response_bytes,'timeline_comparison_capacity');return {...result,comparison_sha256:await hash(bytes)};
}

export function timelineComparisonRows(report,{group=0,role='source_references',query=''}={}){
  check(Number.isInteger(group)&&group>=0&&(group<report.groups.length||group===0&&!report.groups.length),'invalid_timeline_comparison_group');
  check(['source_references','destination_references'].includes(role)&&typeof query==='string'&&query.length<=200,'invalid_timeline_comparison_filter');
  const text=query.trim().toLowerCase(),rows=(report.groups[group]?.[role].rows||[]).filter(row=>row.reference.toLowerCase().includes(text)),magnitude=row=>{const value=BigInt(row.change.observed_total_base_units);return value<0n?-value:value;};
  return rows.slice().sort((a,b)=>order(magnitude(b),magnitude(a))||Math.abs(b.change.events)-Math.abs(a.change.events)||order(a.reference,b.reference));
}
export function timelineComparisonEvents(report,{group=0,role='source_references',reference}={}){
  const rows=timelineComparisonRows(report,{group,role});check(rows.some(row=>row.reference===reference),'timeline_comparison_reference_unobserved');
  const selected=report.groups[group],endpoint=role==='source_references'?'from':'to';
  return ['baseline','comparison'].flatMap(window=>report[window].events.filter(event=>event.kind===selected.kind&&event.direction===selected.direction&&event[endpoint]===reference).map(event=>({window,event})));
}
export function timelineComparisonCsv(report,filters={}){
  const rows=timelineComparisonRows(report,filters),group=report.groups[filters.group??0],role=filters.role??'source_references',query=(filters.query??'').trim().toLowerCase();
  const csv=value=>'"'+String(value??'').replace(/^[\s]*[=+@-]/,match=>"'"+match).replaceAll('"','""')+'"';
  const headers=['comparison_sha256','timeline_report_sha256','dataset_sha256','asset','unit','baseline_start_utc','baseline_end_utc_inclusive','comparison_start_utc','comparison_end_utc_inclusive','event_search','kind','direction','reference_role','reference_search','reference','presence','baseline_events','comparison_events','event_difference','baseline_base_units','comparison_base_units','base_unit_difference','baseline_event_share_numerator','baseline_event_share_denominator','comparison_event_share_numerator','comparison_event_share_denominator','baseline_value_share_numerator','baseline_value_share_denominator','comparison_value_share_numerator','comparison_value_share_denominator'];
  return [headers,...rows.map(row=>[report.comparison_sha256,report.provenance.timeline_report_sha256,report.provenance.dataset_sha256,report.asset,report.unit,report.baseline.selection.start,report.baseline.selection.end_inclusive,report.comparison.selection.start,report.comparison.selection.end_inclusive,report.baseline.selection.event_search,group.kind,group.direction,role,query,row.reference,row.presence,row.baseline.events,row.comparison.events,row.change.events,row.baseline.observed_total_base_units,row.comparison.observed_total_base_units,row.change.observed_total_base_units,...['event_share','value_share'].flatMap(metric=>['baseline','comparison'].flatMap(side=>[row[side][metric]?.numerator,row[side][metric]?.denominator]))])].map(row=>row.map(csv).join(',')).join('\r\n');
}
