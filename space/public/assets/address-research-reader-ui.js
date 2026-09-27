import {openSavedResearch} from './address-research-reader.js';
import {SAVED_CAPTURE_FILE_BYTES} from './address-research-import.js';
import {savedCaptureError} from './address-research-import-ui.js';
import {renderResearchResult} from './address-research-bundle-ui.js';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n;};

export function mountResearchReader(host,{mounted=false,signal}={}){
  const root=el('details',null,'ar-research-reader');root.dataset.researchReader='';
  root.append(el('summary','Open saved address research'),el('p','Reopen a complete research JSON or ETH + USDT + USDC bundle from this device. Inspect its evidence, export exact amounts or compare it with an earlier file, without a live lookup.','ar-note'));
  const label=el('label','Research JSON · up to 32 MiB'),input=el('input'),clear=el('button','Close saved research','ar-button'),status=el('p',null,'ar-reader-status'),output=el('div');
  input.type='file';input.accept='.json,application/json';input.dataset.researchReaderFile='';label.append(input);clear.type='button';clear.dataset.researchReaderClear='';clear.hidden=true;
  status.dataset.researchReaderStatus='';status.setAttribute('role','status');output.dataset.researchReaderOutput='';root.append(label,clear,status,output);host.replaceChildren(root);
  let epoch=0,captureController;
  const reset=()=>{epoch++;captureController?.abort();captureController=null;input.value='';output.replaceChildren();status.textContent='';clear.hidden=true;root.removeAttribute('aria-busy');};
  clear.onclick=reset;signal?.addEventListener('abort',reset,{once:true});
  input.onchange=async()=>{
    const file=input.files?.[0];if(!file||signal?.aborted||!root.isConnected)return;
    const run=++epoch;clear.hidden=false;status.textContent='Checking every capture in this file…';root.setAttribute('aria-busy','true');
    const active=()=>run===epoch&&root.isConnected&&!signal?.aborted;let nextController;
    try{
      if(file.size>SAVED_CAPTURE_FILE_BYTES)throw new Error('saved_capture_file_limit');
      const contents=await file.text();if(!active())return;
      const capture=await openSavedResearch(contents);if(!active())return;
      nextController=new AbortController();const stage=el('div'),banner=el('header',null,'ar-reader-origin'),view=el('div');
      banner.append(el('p','SAVED FILE / LOCAL VIEW','ar-kicker'),el('h2','Saved address research'),el('p',file.name,'ar-reference'),el('p',`${capture.scope.network} · ${capture.scope.reference}`,'ar-reference'),el('p','These observations and ML results come from the selected file. Checksums check internal consistency, not source authenticity or current chain state. Opening and inspecting the file makes no source request and saves no browser data. Module links open separate live research.','ar-note'));
      stage.append(banner,view);renderResearchResult(view,capture,{mounted,signal:nextController.signal});
      if(!active()){nextController.abort();return;}
      captureController?.abort();captureController=nextController;output.replaceChildren(stage);
      status.textContent=`Opened locally: ${file.name}. ${capture.retrieved_at?'Captured '+capture.retrieved_at:'Bundle assembled '+capture.assembled_at}.`;
    }catch(error){
      nextController?.abort();if(!active())return;
      const reason=error.message==='research_scope_mismatch'?'The file contains inconsistent network, asset or address references.':savedCaptureError(error);
      status.textContent='Saved research rejected. '+reason+(output.childNodes.length?' The previously opened file and its filters are unchanged.':' No saved research is open.');
    }finally{if(active()){input.value='';root.removeAttribute('aria-busy');}}
  };
  return {clear:reset};
}
