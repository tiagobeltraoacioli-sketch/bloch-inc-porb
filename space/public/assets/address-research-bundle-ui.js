import {BUNDLE_VERSION,refreshResearch,researchFailure} from './address-research-bundle.js';
import {renderResearch} from './address-research-ui.js';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n;};
const reasons={access_unavailable:'This source requires an active authorized session.',rate_limited:'The source request budget was reached. Retry this search later.',source_timeout:'The source did not respond before its deadline.',source_unavailable:'The source could not return a usable report.',research_scope_mismatch:'The returned report did not match this address and asset.',research_integrity_mismatch:'The returned report failed its integrity check.',unsupported_research_report:'The source returned an unsupported report version.',research_response_limit:'The complete asset report exceeds the response limit.'};
function save(bundle,previous=false){
  const url=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download=`ethereum-address-research-${previous?'previous-':''}${bundle.scope.reference}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function renderResearchResult(host,result,options={}){
  if(result.version!==BUNDLE_VERSION)return renderResearch(host,result,options);
  let current=result,previous=null,busy=false,selectedAsset;
  const root=el('section',null,'address-research-bundle'),id='research-bundle-'+crypto.randomUUID();root.dataset.reference=result.scope.reference;
  const heading=el('header',null,'ar-heading'),availability=el('p',null,'ar-note');
  heading.append(el('p','ETHEREUM / THREE ASSET OBSERVATIONS','ar-kicker'),el('h2','One reference. Three asset views.'),el('p',result.scope.reference,'ar-reference'),el('p',result.coverage,'ar-note'),availability);root.append(heading);
  const tabs=el('div',null,'ar-bundle-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Ethereum asset observations');
  const views=el('div'),buttons=[],panels=[],contents=[],refreshButtons=[];
  const status=el('p',null,'ar-bundle-status');status.dataset.bundleStatus='';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  for(const item of result.results){
    const tab=el('button',null,'ar-bundle-tab');tab.type='button';tab.id=id+'-tab-'+item.asset;tab.dataset.bundleAsset=item.asset;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',id+'-panel-'+item.asset);
    const panel=el('div');panel.id=id+'-panel-'+item.asset;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);panel.dataset.bundlePanel=item.asset;panel.hidden=true;
    if(options.request){
      const actions=el('div',null,'ar-bundle-refresh'),refresh=el('button',null,'ar-button');refresh.type='button';refresh.dataset.bundleRefresh=item.asset;refresh.onclick=()=>update(item.asset);
      actions.append(refresh,el('p','Collect a new report for this asset only. Other asset captures and filters stay unchanged.','ar-note'));panel.append(actions);refreshButtons.push(refresh);
    }
    const content=el('div');panel.append(content);contents.push(content);
    tab.onclick=()=>select(item.asset);buttons.push(tab);panels.push(panel);tabs.append(tab);views.append(panel);
  }
  function showContent(i){
    const item=current.results[i],content=contents[i];
    if(content.childNodes.length)return;
    if(item.status==='available')renderResearch(content,item.report,options);
    else{const box=el('section',null,'ar-bundle-unavailable');box.append(el('h3',item.asset+' report unavailable'),el('p',reasons[item.error]),el('p','No zero balance, empty history or model finding is inferred. The other asset reports remain independently usable.'));content.append(box);}
  }
  function select(asset,focus=false){
    selectedAsset=asset;
    current.results.forEach((item,i)=>{
      const selected=item.asset===asset,tab=buttons[i],panel=panels[i];tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;panel.hidden=!selected;
      if(selected)showContent(i);
      if(selected&&focus)tab.focus();
    });
  }
  function sync(){
    const available=current.results.filter(r=>r.status==='available').length;
    availability.textContent=`${available} of 3 asset reports available · assembled ${current.assembled_at}. Availability describes returned observations, not absence of chain activity.`;
    current.results.forEach((item,i)=>{
      const tab=buttons[i];tab.replaceChildren(el('strong',item.asset));
      if(item.status==='available'){
        const m=item.report.modules;tab.append(el('span',`Ledger: ${m.ledger.status}`),el('span',`Graph: ${m.graph.status}`),el('span',`ML: ${m.machine_learning.status}`));
      }else tab.append(el('span','Report unavailable'));
      const button=refreshButtons[i];if(button){button.disabled=busy;button.textContent=(item.status==='available'?'Update ':'Retry ')+item.asset;}
    });
    digest.textContent=current.bundle_sha256;previousDownload.hidden=!previous;
  }
  async function update(asset){
    if(busy||options.signal?.aborted||!root.isConnected)return;
    busy=true;sync();status.textContent=`Collecting a new ${asset} report… Current captures remain available while this request runs.`;
    const active=()=>root.isConnected&&!options.signal?.aborted;
    try{
      const updated=await refreshResearch(current,asset,options.request,{signal:options.signal});
      if(!active())return;
      previous=current;current=updated;
      const i=current.results.findIndex(item=>item.asset===asset);contents[i].replaceChildren();if(selectedAsset===asset)showContent(i);
      const report=current.results[i].report,m=report.modules;
      status.textContent=`${asset} updated · captured ${report.retrieved_at}. Ledger: ${m.ledger.status}; graph: ${m.graph.status}; ML: ${m.machine_learning.status}. Other captures are unchanged. The previous bundle is available below until the next successful update or new search.`;
    }catch(error){
      if(!active())return;
      const item=current.results.find(item=>item.asset===asset);
      status.textContent=`${asset} update unavailable. ${reasons[researchFailure(error)]} `+(item.status==='available'?`Still showing the capture from ${item.report.retrieved_at}. Its content, filters and bundle hash are unchanged.`:'No report was added. Existing asset captures and the bundle hash are unchanged.');
    }finally{busy=false;if(active())sync();}
  }
  tabs.addEventListener('keydown',event=>{
    const index=buttons.indexOf(event.target);if(index<0)return;let next;
    if(event.key==='ArrowRight')next=(index+1)%3;else if(event.key==='ArrowLeft')next=(index+2)%3;else if(event.key==='Home')next=0;else if(event.key==='End')next=2;else return;
    event.preventDefault();select(current.results[next].asset,true);
  });
  const downloads=el('div',null,'ar-bundle-downloads'),download=el('button','Download all three asset reports','ar-button');download.type='button';download.dataset.bundleExport='json';download.onclick=()=>save(current);
  const previousDownload=el('button','Download previous bundle','ar-button');previousDownload.type='button';previousDownload.dataset.bundlePrevious='json';previousDownload.hidden=true;previousDownload.onclick=()=>{if(previous)save(previous,true);};downloads.append(download,previousDownload);
  const integrity=el('details',null,'ar-bundle-integrity'),digest=el('code',null,'ar-digest');integrity.append(el('summary','Combined download integrity'),el('p','Each available report retains its original SHA-256. A successful asset update replaces that whole report and creates a new bundle hash; other report hashes stay unchanged. A failed update leaves the download unchanged. Hashes do not authenticate sources or align capture times.','ar-note'),digest);
  root.append(tabs,status,downloads,integrity,views);host.replaceChildren(root);sync();select(result.results.find(r=>r.status==='available')?.asset||'ETH');return root;
}
