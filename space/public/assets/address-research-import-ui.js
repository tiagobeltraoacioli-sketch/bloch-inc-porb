import {compareSavedCapture,SAVED_CAPTURE_FILE_BYTES} from './address-research-import.js';
import {renderCaptureComparison} from './address-research-comparison-ui.js';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n;};
const messages={
  saved_capture_file_limit:'Choose a JSON export no larger than 32 MiB.',
  saved_capture_invalid_json:'The selected file is not valid JSON.',
  unsupported_saved_capture:'Choose a complete address research report or an ETH + USDT + USDC bundle.',
  saved_capture_asset_unavailable:'This bundle has no available report for the selected asset.',
  saved_capture_invalid_time:'Both captures need a valid UTC retrieval time.',
  saved_capture_newer_than_current:'This file is newer than the displayed capture. Update the address research before comparing it.',
  saved_capture_unchanged:'This is the same capture as the displayed report. Choose a different earlier capture.',
  research_scope_mismatch:'Choose a capture for the same network, asset and address.',
};
export function savedCaptureError(error){
  return error.name==='NotReadableError'?'The browser could not read this file. Check that it is accessible on this device and choose it again.':messages[error.message]||(/integrity/.test(error.message)?'The file failed its integrity check.':'The file is inconsistent, unsupported or exceeds the evidence limits.');
}
export function mountSavedCapture(host,current,{signal}={}){
  const root=el('details',null,'ar-panel ar-saved-capture');root.dataset.savedCapture=current.scope.asset;
  root.append(el('summary','Compare with a saved capture'),el('p','Choose an earlier complete research JSON or three-asset bundle for this address. Only the matching asset is compared. The file stays in this page: no upload, source query or browser storage. Checksums do not authenticate a local file.','ar-note'));
  const label=el('label','Saved capture JSON'),input=el('input'),clear=el('button','Clear saved capture','ar-button'),status=el('p',null,'ar-note'),output=el('div');let epoch=0;
  input.type='file';input.accept='.json,application/json';input.dataset.savedCaptureFile='';label.append(input);clear.type='button';clear.dataset.savedCaptureClear='';clear.hidden=true;
  status.dataset.savedCaptureStatus='';status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(label,clear,status,output);host.append(root);
  const clearState=()=>{epoch++;input.value='';output.replaceChildren();status.textContent='';clear.hidden=true;root.removeAttribute('aria-busy');};
  clear.onclick=clearState;signal?.addEventListener('abort',clearState,{once:true});
  input.onchange=async()=>{
    const file=input.files?.[0];if(!file||signal?.aborted||!root.isConnected)return;
    const run=++epoch;output.replaceChildren();clear.hidden=false;status.textContent='Checking the saved capture…';root.setAttribute('aria-busy','true');
    const active=()=>run===epoch&&root.isConnected&&!signal?.aborted;
    try{
      if(file.size>SAVED_CAPTURE_FILE_BYTES)throw new Error('saved_capture_file_limit');
      const text=await file.text();if(!active())return;
      const comparison=await compareSavedCapture(text,current);if(!active())return;
      renderCaptureComparison(output,comparison);
      status.textContent=`Local file compared: ${file.name}. Previous capture: ${comparison.before.retrieved_at}. The displayed report and its filters are unchanged.`;
    }catch(error){
      if(!active())return;
      status.textContent='Saved capture rejected. '+savedCaptureError(error)+' No imported comparison is displayed.';
    }finally{if(active()){input.value='';root.removeAttribute('aria-busy');}}
  };
  return root;
}
