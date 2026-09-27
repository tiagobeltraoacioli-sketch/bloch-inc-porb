import {BUNDLE_VERSION} from './address-research-bundle.js';
import {renderResearch} from './address-research-ui.js';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n;};
const reasons={access_unavailable:'This source requires an active authorized session.',rate_limited:'The source request budget was reached. Retry this search later.',source_timeout:'The source did not respond before its deadline.',source_unavailable:'The source could not return a usable report.',research_scope_mismatch:'The returned report did not match this address and asset.',research_integrity_mismatch:'The returned report failed its integrity check.',unsupported_research_report:'The source returned an unsupported report version.',research_response_limit:'The complete asset report exceeds the response limit.'};

export function renderResearchResult(host,result,options={}){
  if(result.version!==BUNDLE_VERSION)return renderResearch(host,result,options);
  const root=el('section',null,'address-research-bundle'),id='research-bundle-'+crypto.randomUUID();root.dataset.reference=result.scope.reference;
  const heading=el('header',null,'ar-heading');heading.append(el('p','ETHEREUM / THREE ASSET OBSERVATIONS','ar-kicker'),el('h2','One reference. Three asset views.'),el('p',result.scope.reference,'ar-reference'),el('p',result.coverage,'ar-note'));
  const available=result.results.filter(r=>r.status==='available').length;heading.append(el('p',`${available} of 3 asset reports available · assembled ${result.assembled_at}. Availability describes returned observations, not absence of chain activity.`,'ar-note'));root.append(heading);
  const tabs=el('div',null,'ar-bundle-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Ethereum asset observations');
  const views=el('div'),buttons=[],panels=[];
  for(const item of result.results){
    const tab=el('button',null,'ar-bundle-tab');tab.type='button';tab.id=id+'-tab-'+item.asset;tab.dataset.bundleAsset=item.asset;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',id+'-panel-'+item.asset);
    tab.append(el('strong',item.asset));
    if(item.status==='available'){
      const m=item.report.modules;tab.append(el('span',`Ledger: ${m.ledger.status}`),el('span',`Graph: ${m.graph.status}`),el('span',`ML: ${m.machine_learning.status}`));
    }else tab.append(el('span','Report unavailable'));
    const panel=el('div');panel.id=id+'-panel-'+item.asset;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);panel.dataset.bundlePanel=item.asset;panel.hidden=true;
    tab.onclick=()=>select(item.asset);buttons.push(tab);panels.push(panel);tabs.append(tab);views.append(panel);
  }
  function select(asset,focus=false){
    result.results.forEach((item,i)=>{
      const selected=item.asset===asset,tab=buttons[i],panel=panels[i];tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;panel.hidden=!selected;
      if(selected&&!panel.childNodes.length){
        if(item.status==='available')renderResearch(panel,item.report,options);
        else{const box=el('section',null,'ar-bundle-unavailable');box.append(el('h3',item.asset+' report unavailable'),el('p',reasons[item.error]),el('p','No zero balance, empty history or model finding is inferred. The other asset reports remain independently usable.'));panel.append(box);}
      }
      if(selected&&focus)tab.focus();
    });
  }
  tabs.addEventListener('keydown',event=>{
    const index=buttons.indexOf(event.target);if(index<0)return;let next;
    if(event.key==='ArrowRight')next=(index+1)%3;else if(event.key==='ArrowLeft')next=(index+2)%3;else if(event.key==='Home')next=0;else if(event.key==='End')next=2;else return;
    event.preventDefault();select(result.results[next].asset,true);
  });
  const download=el('button','Download all three asset reports','ar-button');download.type='button';download.dataset.bundleExport='json';download.onclick=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download=`ethereum-address-research-${result.scope.reference}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const integrity=el('details',null,'ar-bundle-integrity');integrity.append(el('summary','Combined download integrity'),el('p','Each available report retains its original SHA-256. The bundle hash binds the three results and their availability; it does not authenticate sources or align their capture times.','ar-note'),el('code',result.bundle_sha256,'ar-digest'));
  root.append(tabs,download,integrity,views);host.replaceChildren(root);select(result.results.find(r=>r.status==='available')?.asset||'ETH');return root;
}
