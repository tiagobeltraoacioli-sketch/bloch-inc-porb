import {mountAtlasComparison} from './atlas-comparison-view.js';
const $=id=>document.getElementById(id);
const date=value=>new Date(value).toLocaleString();

export function comparisonWorkspace(request,onReport=()=>{}){
  let analysis=null,node='',version=0,busy=false,key='';
  const viewer=mountAtlasComparison($('compare-view'),{legacyIds:true,onReference:id=>{$('compare-reference').value=id;invalidate();compare();}});
  const ready=()=>Boolean(analysis&&$('compare-baseline').value);
  function invalidate(message='Choose a baseline and compare the retained samples.'){
    version++;onReport(null);busy=false;viewer.reset();$('compare-status').textContent=message;$('compare-run').disabled=!ready();
  }
  function sync(runs,current,selectedNode){
    const next=`${current?.id||''}:${selectedNode||''}`,oldBaseline=$('compare-baseline').value;analysis=current;node=selectedNode||'';
    const candidates=runs.filter(run=>run.asset===current?.asset&&run.id!==current?.id);
    $('compare-baseline').replaceChildren(new Option(candidates.length?'Select a baseline':'No other saved sample of this asset',''));
    for(const run of candidates)$('compare-baseline').append(new Option(`${run.asset} · ${date(run.created_at)} · ${run.records} records · ${run.id.slice(0,8)}`,run.id));
    if(candidates.some(run=>run.id===oldBaseline))$('compare-baseline').value=oldBaseline;
    $('compare-baseline').disabled=!candidates.length;$('compare-reference').disabled=!current;$('compare-use-reference').disabled=!node;
    $('compare-current').textContent=current?`Current: ${current.asset} · saved ${date(current.created_at)} · ${current.id}`:'Select the current saved analysis above.';
    if(next!==key||oldBaseline!==$('compare-baseline').value){key=next;$('compare-reference').value='';invalidate();}
    $('compare-run').disabled=!ready()||busy;
  }
  async function compare(){
    if(!ready()||busy)return;invalidate('Comparing retained evidence and verifying dataset hashes…');const run=version;busy=true;$('compare-run').disabled=true;
    const query=new URLSearchParams({baseline:$('compare-baseline').value,current:analysis.id}),reference=$('compare-reference').value.trim();if(reference)query.set('reference',reference);
    try{const result=await request('/v1/atlas/compare?'+query);if(run!==version)return;viewer.showReport(result);onReport(result);$('compare-status').textContent=`Compared ${result.baseline.selected_records} baseline and ${result.current.selected_records} current records. No new collection was started.`;}
    catch(error){if(run===version)$('compare-status').textContent=`Comparison unavailable: ${error.message}. No previous result is displayed.`;}
    finally{if(run===version){busy=false;$('compare-run').disabled=!ready();}}
  }
  $('compare-run').onclick=compare;$('compare-baseline').onchange=()=>invalidate();$('compare-reference').oninput=()=>invalidate();
  $('compare-use-reference').onclick=()=>{$('compare-reference').value=node;invalidate();};$('compare-clear-reference').onclick=()=>{$('compare-reference').value='';invalidate();};
  return {sync,reset(){key='';analysis=null;node='';$('compare-baseline').replaceChildren();$('compare-reference').value='';invalidate('');}};
}
