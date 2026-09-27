import {refreshSingleResearch,researchFailure} from './address-research-bundle.js';
import {renderResearch} from './address-research-ui.js';
import {compareAddressReports} from './address-research-comparison.js';
import {renderCaptureComparison} from './address-research-comparison-ui.js';
import {watchResearchCooldown} from './address-research-cooldown-ui.js';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n;};
export const researchFailureReasons={access_unavailable:'This source requires an active authorized session.',rate_limited:'The source request budget was reached. Retry this search later.',source_timeout:'The source did not respond before its deadline.',source_unavailable:'The source could not return a usable report.',research_scope_mismatch:'The returned report did not match this address and asset.',research_integrity_mismatch:'The returned report failed its integrity check.',unsupported_research_report:'The source returned an unsupported report version.',research_response_limit:'The complete asset report exceeds the response limit.'};

export function renderSingleResearch(host,report,options={}){
  if(!options.request)return renderResearch(host,report,options);
  const root=el('section',null,'address-research-session'),asset=report.scope.asset;
  root.dataset.researchSession=asset;
  root.append(el('p',asset+' · '+report.scope.reference,'ar-reference'));
  const controls=el('div',null,'ar-single-actions'),refresh=el('button','Update '+asset,'ar-button'),previousDownload=el('button','Download previous capture','ar-button'),compare=el('button','Compare captures','ar-button');
  refresh.type=previousDownload.type=compare.type='button';refresh.dataset.researchRefresh=asset;previousDownload.dataset.researchPrevious='';compare.dataset.researchCompare='';
  controls.append(refresh,previousDownload,compare);
  const status=el('p',null,'ar-single-status'),comparison=el('div'),content=el('div');
  status.dataset.researchStatus='';status.setAttribute('role','status');status.setAttribute('aria-live','polite');comparison.dataset.researchComparison='';
  root.append(controls,el('p','Updates run only when requested. The displayed capture stays usable during collection and if the source fails. A successful update replaces the complete report.','ar-note'),status,comparison,content);
  let current=report,previous=null,busy=false,comparing=false,captureController;
  const active=()=>root.isConnected&&!options.signal?.aborted;
  function prepare(value){
    const node=el('div'),controller=new AbortController();
    try{renderResearch(node,value,{...options,signal:controller.signal});options.renderSupplement?.(node,value);return {node,controller};}
    catch(error){controller.abort();throw error;}
  }
  function sync(){const wait=options.request.client?.remaining()||0;refresh.disabled=busy||!!wait;refresh.textContent='Update '+asset+(wait?` (${wait} s)`:'');compare.disabled=busy||comparing;previousDownload.hidden=!previous;compare.hidden=!previous||previous.report_sha256===current.report_sha256;}
  const initial=prepare(current);captureController=initial.controller;content.replaceChildren(initial.node);host.replaceChildren(root);sync();
  watchResearchCooldown(root,options.request.client,options.signal,sync);
  refresh.onclick=async()=>{
    if(busy||!active()||options.request.client?.remaining())return;
    busy=true;sync();status.textContent=`Collecting a new ${asset} report… The displayed capture and downloads remain available.`;
    try{
      const next=await refreshSingleResearch(current,options.request,{signal:options.signal});if(!active())return;
      if(next.report_sha256===current.report_sha256){status.textContent=`${asset} returned the same capture from ${current.retrieved_at}. The report, filters and previous capture are unchanged.`;return;}
      // Prepare all dependent views before committing the new report. A render
      // failure must not leave the new export beside an old ledger or graph.
      const stage=prepare(next);if(!active()){stage.controller.abort();return;}
      captureController.abort();captureController=stage.controller;
      previous=current;current=next;comparison.replaceChildren();content.replaceChildren(stage.node);
      const m=current.modules;
      status.textContent=`${asset} updated · captured ${current.retrieved_at}. Ledger: ${m.ledger.status}; graph: ${m.graph.status}; ML: ${m.machine_learning.status}. Filters and saved-file comparisons now start from this capture. The previous complete report is available until the next successful update or new search.`;
    }catch(error){if(active())status.textContent=`${asset} update unavailable. ${researchFailureReasons[researchFailure(error)]} Still showing the capture from ${current.retrieved_at}. Its content, filters and downloads are unchanged.`;}
    finally{busy=false;if(active())sync();}
  };
  previousDownload.onclick=()=>{
    if(!previous||!active())return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(previous,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download=`address-research-previous-${asset}-${previous.scope.reference}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  compare.onclick=async()=>{
    if(busy||comparing||!previous||!active())return;
    comparing=true;sync();const before=previous,after=current;
    try{const result=await compareAddressReports(before,after);if(active()&&current===after&&previous===before)renderCaptureComparison(comparison,result);}
    catch{if(active()&&current===after&&previous===before)comparison.replaceChildren(el('p','These captures could not be compared. Their original downloads remain available.','ar-unavailable'));}
    finally{comparing=false;if(active())sync();}
  };
  options.signal?.addEventListener('abort',()=>{captureController.abort();previous=null;comparison.replaceChildren();previousDownload.hidden=compare.hidden=true;refresh.disabled=true;},{once:true});
  return root;
}
