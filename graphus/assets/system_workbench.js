import {fetchEvidence,mergeEvidence,selectRecords,filteredEvidence,compareEvidence,COLLECTION_LIMITS} from './system_evidence.js';
import {summarizeSample} from './system_observation.js';
import {evidenceProfile} from './evidence_profile.js';

export function createEvidenceWorkbench({onObservation=()=>{}}={}){
  const $=id=>document.getElementById(id);
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const short=value=>value.length>26?value.slice(0,12)+'…'+value.slice(-10):value;
  const link=(text,href)=>{const a=el('a',text);a.href=href;if(href.startsWith('https://')){a.target='_blank';a.rel='noopener noreferrer';}return a;};
  const button=(text,action)=>{const b=el('button',text);b.type='button';b.onclick=action;return b;};
  let packet=null,baseline=null,comparison=null,comparisonPage=0,recordPage=0,controller=null,requestId=0,capacityStopped=false,phase='idle';
  const filters={query:'capture-search',kind:'filter-kind',direction:'filter-direction',minBlock:'filter-from',maxBlock:'filter-to',minimum:'filter-minimum',maximum:'filter-maximum'};
  const options=()=>Object.fromEntries(Object.entries(filters).map(([key,id])=>[key,$(id).value]));
  function resetFilters(){for(const[key,id]of Object.entries(filters))$(id).value=['kind','direction'].includes(key)?'all':'';recordPage=0;if(packet)ledger();}
  function publish(){onObservation({asset:$('capture-asset').value,phase,busy:Boolean(controller),canLoadEarlier:!$('capture-older').disabled,message:$('capture-status').textContent,sample:summarizeSample(packet)});}
  function controls(){
    const busy=Boolean(controller);$('capture-button').disabled=busy;$('capture-pages').disabled=busy;$('capture-cancel').hidden=!busy;
    $('capture-older').disabled=busy||!packet||capacityStopped||packet.dataset.snapshots.length>=COLLECTION_LIMITS.pages||packet.pagination.next_cursor===null;
    $('baseline-pin').disabled=busy||!packet;$('baseline-clear').disabled=!baseline;$('baseline-export').disabled=!baseline;$('comparison-export').disabled=!comparison;
    $('capture-baseline-panel').hidden=!packet&&!baseline;
    publish();
  }
  function clearCapture(message='Workspace cleared. Captures and baseline were kept only in this tab.',keepBaseline=false){
    requestId++;controller?.abort();controller=null;packet=null;comparison=null;capacityStopped=false;phase='idle';recordPage=comparisonPage=0;if(!keepBaseline)baseline=null;
    $('capture-result').hidden=true;$('capture-status').textContent=message;
    for(const id of ['capture-ledger','capture-source','capture-metrics','capture-blocks','capture-types','capture-provenance','filter-totals'])$(id).replaceChildren();
    resetFilters();renderComparison();controls();
  }
  function cancel(){requestId++;controller?.abort();controller=null;phase='canceled';$('capture-status').textContent=`Collection canceled. ${packet?packet.dataset.snapshots.length+' completed source pages retained.':'No source page was committed.'}`;controls();}
  function setAsset(asset){if($('capture-asset').value!==asset){$('capture-asset').value=asset;clearCapture('Asset changed. Capture a new source page.');}$('reference-asset').value=asset;}
  $('capture-asset').onchange=()=>{clearCapture('Asset changed. Capture a new source page.');$('reference-asset').value=$('capture-asset').value;};
  $('capture-clear').onclick=()=>clearCapture();$('capture-cancel').onclick=cancel;
  async function collect(older=false){
    if(controller||older&&$('capture-older').disabled)return;
    if(!older)clearCapture('Starting a new source collection. The pinned baseline is retained.',true);
    const id=++requestId,asset=$('capture-asset').value,active=new AbortController();controller=active;phase='collecting';
    const wanted=Math.min(Number($('capture-pages').value),COLLECTION_LIMITS.pages-(packet?.dataset.snapshots.length||0));
    let completed=0;controls();
    try{
      for(let page=0;page<wanted;page++){
        const cursor=packet?packet.pagination.next_cursor:null;
        if(packet&&cursor===null)break;
        $('capture-status').textContent=`Reading real ${asset} source page ${page+1}/${wanted}… ${packet?packet.diagnostics.records+' committed records retained.':''}`;
        publish();
        const timer=setTimeout(()=>active.abort(),65000);let result;
        try{result=await fetchEvidence(asset,{signal:active.signal,cursor});}finally{clearTimeout(timer);}
        if(id!==requestId)return;if(active.signal.aborted)throw new Error('Source request timed out.');
        const merged=await mergeEvidence(packet,result);
        if(id!==requestId)return;if(active.signal.aborted)throw new Error('Source request timed out.');
        packet=merged;completed++;renderCapture();
      }
      phase='ready';$('capture-status').textContent=`Captured ${packet.diagnostics.records} unique ${asset} records across ${packet.dataset.snapshots.length} source pages. ${completed} pages added; ${packet.collection?.duplicate_records_omitted||0} overlapping records omitted. Latest retrieval: ${packet.dataset.retrieved_at}.`;
    }catch(error){
      if(id===requestId){phase='error';capacityStopped=/capacity|3 MB/.test(error.message);$('capture-status').textContent=`${active.signal.aborted?'Source request timed out.':error.message} ${packet?packet.dataset.snapshots.length+' completed source pages remain available with their original provenance.':'No source page was committed.'}`;}
    }finally{if(id===requestId){controller=null;controls();}}
  }
  $('capture-form').onsubmit=event=>{event.preventDefault();collect();};$('capture-older').onclick=()=>collect(true);
  function renderCapture(){
    const{dataset:d,diagnostics:q}=packet;$('capture-result').hidden=false;
    $('capture-metrics').replaceChildren(...[['Source pages',q.source_pages],['References',q.references],['Records',q.records],['Transactions',q.transactions],['Returned blocks',q.blocks],['Missing timestamps',q.records_without_timestamp]].map(([name,value])=>{const box=el('div');box.append(el('span',name),el('strong',value.toLocaleString()));return box;}));
    $('capture-source').replaceChildren(el('strong',d.source),el('p',`${d.asset} / ${d.network} · Highest sampled anchor ${d.anchor.height} · ${d.anchor.hash}`),el('p',d.coverage),el('p',`Finality at this anchor: ${d.anchor.finality||'not supplied'}. Each source page retains its own provenance below.`));
    const profile=evidenceProfile(d),profileBox=el('details');profileBox.id='capture-evidence-profile';profileBox.append(el('summary','Evidence profile · time, structure and exact record totals'),el('p',profile.interpretation));const profileJson=el('pre',JSON.stringify(profile,null,2));profileBox.append(profileJson);$('capture-source').append(profileBox);
    const blocks=new Map();for(const edge of d.edges)blocks.set(String(edge.block_number),(blocks.get(String(edge.block_number))||0)+1);
    bars('capture-blocks',[...blocks].sort((a,b)=>Number(a[0])-Number(b[0])).slice(-32),block=>{$('filter-from').value=$('filter-to').value=block;recordPage=0;ledger();});
    bars('capture-types',Object.entries(q.record_types),kind=>{$('filter-kind').value=kind;recordPage=0;ledger();});
    const kind=$('filter-kind').value;$('filter-kind').replaceChildren(new Option('All types','all'),...Object.keys(q.record_types).map(value=>new Option(value.replaceAll('_',' '),value)));if(Object.hasOwn(q.record_types,kind))$('filter-kind').value=kind;
    $('capture-provenance').textContent=JSON.stringify({dataset_sha256:packet.dataset_sha256,digest_encoding:packet.digest_encoding,diagnostics:q,collection:packet.collection,pagination:packet.pagination,snapshots:d.snapshots,aml_score_included:false},null,2);
    ledger();renderComparison();controls();
  }
  function bars(id,rows,select){const max=Math.max(1,...rows.map(r=>r[1]));$(id).replaceChildren(...rows.map(([title,count])=>{const row=el('div'),meter=el('meter');meter.max=max;meter.value=count;meter.setAttribute('aria-label',`${title}: ${count} returned records`);row.append(button(title.replaceAll('_',' '),()=>select(title)),meter,el('b',count.toLocaleString()));return row;}));if(!rows.length)$(id).append(el('p','No records were returned in these source pages.'));}
  function transactionUrl(asset,txid){return `${asset==='BTC'?'https://blockstream.info':asset==='BLCH'?'https://blochl1.com':'https://etherscan.io'}/tx/${txid}`;}
  function referenceLink(node){const ref=node.address||node.txid,b=button(short(ref),()=>useFiltered('graph',node.id));b.title=ref;b.setAttribute('aria-label',`Inspect ${ref} in the filtered collection graph`);return b;}
  function ledger(){
    if(!packet)return;const d=packet.dataset,refs=new Map(d.nodes.map(n=>[n.id,n]));let rows;
    try{rows=selectRecords(packet,options()).rows;$('filter-status').textContent=`${rows.length} / ${d.edges.length} collected records match. Amount filters use exact integer base units; each record type is summed separately.`;}
    catch(error){$('filter-status').textContent=error.message;$('capture-ledger').replaceChildren();$('filter-totals').replaceChildren();$('capture-page').textContent='Correct the filters to display records.';for(const id of ['capture-prev','capture-next','capture-filtered-export','capture-filtered-analytics','capture-filtered-graph'])$(id).disabled=true;return;}
    $('capture-filtered-export').disabled=$('capture-filtered-analytics').disabled=$('capture-filtered-graph').disabled=rows.length===0;
    const pages=Math.max(1,Math.ceil(rows.length/20));recordPage=Math.min(recordPage,pages-1);
    $('capture-ledger').replaceChildren(...rows.slice(recordPage*20,recordPage*20+20).map(e=>{const row=el('tr'),block=el('td',String(e.block_number)),tx=link(short(e.txid),transactionUrl(d.asset,e.txid));tx.title=e.txid;block.append(tx);const endpoints=el('td');endpoints.append(referenceLink(refs.get(e.from)),el('span',' → '),referenceLink(refs.get(e.to)));row.append(block,endpoints,el('td',e.kind.replaceAll('_',' ')),el('td',e.amount_base_units));return row;}));
    const totals=new Map();for(const e of rows)totals.set(e.kind,(totals.get(e.kind)||0n)+BigInt(e.amount_base_units));
    $('filter-totals').replaceChildren(...[...totals].map(([kind,total])=>{const box=el('div');box.append(el('span',kind.replaceAll('_',' ')),el('strong',total.toString()),el('small','sum of returned record amounts / base units'));return box;}));
    $('capture-page').textContent=`${rows.length} matching records · Page ${recordPage+1} / ${pages}`;$('capture-prev').disabled=recordPage===0;$('capture-next').disabled=recordPage>=pages-1;
  }
  for(const id of Object.values(filters))$(id).addEventListener(id==='filter-kind'||id==='filter-direction'?'change':'input',()=>{recordPage=0;ledger();});
  $('filter-reset').onclick=resetFilters;$('capture-prev').onclick=()=>{recordPage--;ledger();};$('capture-next').onclick=()=>{recordPage++;ledger();};
  function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=link('',url);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const filename=(value,prefix)=>`graphus-${prefix}-${value.dataset.asset}-${value.dataset_sha256.slice(0,12)}.json`;
  $('capture-export').onclick=()=>{if(packet)download(packet,filename(packet,'collection'));};
  function analyze(value){try{sessionStorage.setItem('graphus.analytics.network.v1',JSON.stringify(value));location.href='analytics.html?import=network';return true;}catch{$('capture-status').textContent='Browser handoff unavailable. Export the JSON packet and import it into Analytics.';publish();return false;}}
  $('capture-analytics').onclick=()=>{if(packet)analyze(packet);};
  function graph(value,reference=''){try{sessionStorage.setItem('graphus.constellation.evidence.v1',JSON.stringify(value));location.href='constellation.html?'+new URLSearchParams({import:'evidence',...(reference?{reference}:{})});return true;}catch{$('capture-status').textContent='Browser handoff unavailable. Export the JSON packet and open it in Constellation.';publish();return false;}}
  $('capture-graph').onclick=()=>{if(packet)graph(packet);};
  async function useFiltered(target='export',reference=''){if(!packet)return;const source=packet;try{const subset=await filteredEvidence(source,options());if(packet!==source)return;if(target==='analytics')analyze(subset);else if(target==='graph')graph(subset,reference);else download(subset,filename(subset,'filtered'));}catch(error){$('filter-status').textContent=error.message;}}
  $('capture-filtered-export').onclick=()=>useFiltered();$('capture-filtered-analytics').onclick=()=>useFiltered('analytics');$('capture-filtered-graph').onclick=()=>useFiltered('graph');

  function renderComparison(){
    comparison=null;$('comparison-result').hidden=true;$('comparison-ledger').replaceChildren();$('comparison-provenance').textContent='';
    if(!baseline){$('baseline-note').textContent='Pin a completed collection to compare it with earlier pages or a new capture. Baseline and current collection remain in this tab only.';controls();return;}
    $('baseline-note').textContent=`Baseline: ${baseline.dataset.asset} · ${baseline.diagnostics.records} records · ${baseline.dataset.snapshots.length} source pages · ${baseline.dataset.retrieved_at} · SHA-256 ${baseline.dataset_sha256}`;
    if(!packet){controls();return;}
    try{comparison=compareEvidence(baseline,packet);}catch(error){$('baseline-note').textContent+=' '+error.message;controls();return;}
    $('comparison-result').hidden=false;
    const labels={only_current:'Only in current',only_baseline:'Only in baseline',changed:'Changed fields',shared:'Same recorded fields'};
    $('comparison-metrics').replaceChildren(...Object.entries(comparison.counts).map(([key,count])=>{const b=button('',()=>{$('comparison-kind').value=key;comparisonPage=0;comparisonLedger();});b.append(el('strong',count.toLocaleString()),el('span',labels[key]));return b;}));
    $('comparison-note').textContent=comparison.interpretation;
    $('comparison-provenance').textContent=JSON.stringify({...comparison,event_ids:undefined},null,2);comparisonLedger();controls();
  }
  function comparisonLedger(){
    if(!comparison)return;const kind=$('comparison-kind').value,ids=comparison.event_ids[kind],old=new Map(baseline.dataset.edges.map(e=>[e.event_id,e])),now=new Map(packet.dataset.edges.map(e=>[e.event_id,e])),pages=Math.max(1,Math.ceil(ids.length/20));comparisonPage=Math.min(comparisonPage,pages-1);
    $('comparison-ledger').replaceChildren(...ids.slice(comparisonPage*20,comparisonPage*20+20).map(id=>{
      const a=old.get(id),b=now.get(id),edge=b||a,row=el('tr'),ref=el('td'),tx=link(short(edge.txid),transactionUrl(packet.dataset.asset,edge.txid));tx.title=edge.txid;ref.append(tx,el('small',id));
      if(kind==='changed'){const details=el('details');details.append(el('summary','Inspect changed fields'),el('pre',JSON.stringify({baseline:a,current:b},null,2)));ref.append(details);}
      row.append(ref,el('td',a?.amount_base_units??'Not in sample'),el('td',b?.amount_base_units??'Not in sample'),el('td',`${a?.block_number??'—'} → ${b?.block_number??'—'}`));return row;
    }));
    $('comparison-page').textContent=`${ids.length} records · Page ${comparisonPage+1} / ${pages}`;$('comparison-prev').disabled=comparisonPage===0;$('comparison-next').disabled=comparisonPage>=pages-1;
  }
  $('baseline-pin').onclick=()=>{if(packet&&!controller){baseline=packet;comparisonPage=0;renderComparison();}};
  $('baseline-clear').onclick=()=>{baseline=null;comparisonPage=0;renderComparison();};
  $('baseline-export').onclick=()=>{if(baseline)download(baseline,filename(baseline,'baseline'));};
  $('comparison-export').onclick=()=>{if(comparison)download(comparison,`graphus-comparison-${comparison.asset}-${comparison.current_sha256.slice(0,12)}.json`);};
  $('comparison-kind').onchange=()=>{comparisonPage=0;comparisonLedger();};$('comparison-prev').onclick=()=>{comparisonPage--;comparisonLedger();};$('comparison-next').onclick=()=>{comparisonPage++;comparisonLedger();};
  controls();return {setAsset,
    useCurrent(asset,action){
      if(!packet||packet.dataset.asset!==asset||controller)return false;
      if(action==='graph')return graph(packet);
      else if(action==='analytics')return analyze(packet);
      else if(action==='export')download(packet,filename(packet,'collection'));
      else if(action==='older'&&!$('capture-older').disabled)collect(true);
      else return false;
      return true;
    }
  };
}
