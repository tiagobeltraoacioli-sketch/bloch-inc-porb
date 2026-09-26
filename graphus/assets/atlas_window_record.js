import {TimelineError,TIMELINE_LIMITS,timelineParameters} from './atlas_timeline.js';
import {TIMELINE_COMPARISON_VERSION} from './atlas_timeline_compare.js';

export const WINDOW_RECORD_VERSION='graphus-atlas-window-comparison-record-1.0.0';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,HASH=/^[a-f0-9]{64}$/;
const check=(ok,code)=>{if(!ok)throw new TimelineError(code);};
const keys=(value,allowed)=>check(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>allowed.includes(key)),'unexpected_window_report_parameters');
const digest=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(value=>value.toString(16).padStart(2,'0')).join('');
function range(input){
  keys(input,['first','last','query']);const {first,last,query=''}=input;
  check(Number.isInteger(first)&&Number.isInteger(last)&&first>=0&&last>=first&&last<TIMELINE_LIMITS.buckets&&typeof query==='string'&&query.length<=200,'invalid_window_report_selection');
  return {first,last,query:query.trim().toLowerCase()};
}
export function windowReportParameters(input){
  keys(input,['analysis','timeline_report','timeline','baseline','comparison']);
  const analysis=Object.hasOwn(input,'analysis'),saved=Object.hasOwn(input,'timeline_report');check(analysis!==saved,'invalid_window_report_source');
  check(UUID.test((analysis?input.analysis:input.timeline_report)||''),'invalid_window_report_source');
  check(analysis?Object.hasOwn(input,'timeline')&&!Object.hasOwn(input,'timeline_report'):!Object.hasOwn(input,'timeline'),'invalid_window_report_source');
  const source=analysis?{analysis:input.analysis,timeline:timelineParameters(input.timeline)}:{timeline_report:input.timeline_report},baseline=range(input.baseline),comparison=range(input.comparison);
  check(baseline.last<comparison.first,'timeline_comparison_requires_later_window');check(baseline.query===comparison.query,'timeline_comparison_search_mismatch');return {...source,baseline,comparison};
}
const viewRange=window=>({first:window.selection.first_bucket,last:window.selection.last_bucket,query:window.selection.event_search});
export function windowParametersFromComparison(comparison,source){
  keys(source,['analysis','timeline_report']);return windowReportParameters({...source,...(Object.hasOwn(source,'analysis')?{timeline:comparison.parent_query}:{}),baseline:viewRange(comparison.baseline),comparison:viewRange(comparison.comparison)});
}
export async function retainWindowComparison(comparison,input){
  const parameters=windowReportParameters(input);check(comparison&&comparison.version===TIMELINE_COMPARISON_VERSION,'invalid_window_comparison_version');
  const {comparison_sha256,...body}=comparison,serialized=JSON.stringify(body);check(HASH.test(comparison_sha256||'')&&await digest(serialized)===comparison_sha256,'window_comparison_integrity_failed');
  const verified={...JSON.parse(serialized),comparison_sha256};
  check(HASH.test(verified.provenance.timeline_report_sha256||'')&&HASH.test(verified.provenance.dataset_sha256||''),'window_comparison_integrity_failed');
  check(JSON.stringify(parameters)===JSON.stringify(windowParametersFromComparison(verified,parameters.analysis?{analysis:parameters.analysis}:{timeline_report:parameters.timeline_report})),'window_report_parameters_mismatch');
  if(parameters.analysis)check(parameters.analysis===verified.provenance.analysis_id,'window_report_source_mismatch');
  const report={version:WINDOW_RECORD_VERSION,asset:verified.asset,parameters,comparison:verified};return {...report,report_sha256:await digest(JSON.stringify(report))};
}
