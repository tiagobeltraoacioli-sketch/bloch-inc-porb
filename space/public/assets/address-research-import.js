import {RESEARCH_VERSION,researchHash} from './address-research-core.js';
import {BUNDLE_VERSION,verifyResearchBundle} from './address-research-bundle.js';
import {compareAddressReports} from './address-research-comparison.js';

// Allow pretty-printed exports, while retaining the compact report/bundle limits.
export const SAVED_CAPTURE_FILE_BYTES=32*1024*1024;
const date=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===(value.includes('.')?value:value.replace('Z','.000Z'));
export async function compareSavedCapture(text,current){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>SAVED_CAPTURE_FILE_BYTES)throw new Error('saved_capture_file_limit');
  let raw;try{raw=JSON.parse(text);}catch{throw new Error('saved_capture_invalid_json');}
  let before,container;
  if(raw?.version===BUNDLE_VERSION){
    const bundle=await verifyResearchBundle(raw);
    if(bundle.scope.network!==current.scope.network||bundle.scope.reference!==current.scope.reference)throw new Error('research_scope_mismatch');
    const item=bundle.results.find(item=>item.asset===current.scope.asset);
    if(item?.status!=='available')throw new Error('saved_capture_asset_unavailable');
    before=item.report;container={version:BUNDLE_VERSION,sha256:bundle.bundle_sha256};
  }else if(raw?.version===RESEARCH_VERSION){before=raw;container={version:RESEARCH_VERSION,sha256:raw.report_sha256};}
  else throw new Error('unsupported_saved_capture');
  const comparison=await compareAddressReports(before,current);
  if(!date(before.retrieved_at)||!date(current.retrieved_at))throw new Error('saved_capture_invalid_time');
  if(Date.parse(before.retrieved_at)>Date.parse(current.retrieved_at))throw new Error('saved_capture_newer_than_current');
  if(before.report_sha256===current.report_sha256)throw new Error('saved_capture_unchanged');
  const {comparison_sha256,...body}=comparison;
  body.before={...body.before,imported_from:container};
  body.coverage+=' The previous capture was imported from a local file. Its checksums verify supplied bytes, not source authenticity. No source request was made for this comparison.';
  if(new TextEncoder().encode(JSON.stringify(body)).length>8500000)throw new Error('research_comparison_response_limit');
  return {...body,comparison_sha256:await researchHash(body)};
}
