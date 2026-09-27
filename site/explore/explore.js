import {MODULES} from '/portal/module-catalog.js';
import {researchSelection,collectResearch} from '/space/assets/address-research-bundle.js';
import {renderResearchResult} from '/space/assets/address-research-bundle-ui.js';
import {mountResearchReader} from '/space/assets/address-research-reader-ui.js';
mountResearchReader(document.getElementById('saved-address-research'));
const tools=document.getElementById('tools');
for(const item of MODULES.filter(item=>item.public_url)){
  const card=document.createElement('a');card.className='tool';card.href=item.public_url;
  const group=document.createElement('span');group.className='eyebrow';group.textContent=item.group;
  const title=document.createElement('h3');title.textContent=item.name;
  const description=document.createElement('p');description.textContent=item.description;
  const action=document.createElement('span');action.className='tool-action';action.textContent='Open public tool ↗';
  card.append(group,title,description,action);tools.append(card);
}
const form=document.getElementById('public-address-form'),status=document.getElementById('public-address-status'),result=document.getElementById('public-address-result');
let sequence=0,controller;
async function search(){
  const epoch=++sequence;controller?.abort();controller=new AbortController();const signal=controller.signal;
  result.replaceChildren();status.textContent='Collecting source records, graph analyses and machine learning…';
  try{
    const asset=form.elements.asset.value,scope=researchSelection(asset,form.elements.query.value);
    const params=new URLSearchParams({network:scope.network,asset,query:scope.reference});
    const request=async selected=>{
      const response=await fetch('/api/research?'+new URLSearchParams({network:scope.network,asset:selected,query:scope.reference}),{cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(60000)])});
      const value=await response.json();if(!response.ok){const error=new Error(value.error||'source_unavailable');error.status=response.status;throw error;}return value;
    };
    const body=await collectResearch(scope,request,{signal});
    if(epoch!==sequence)return;
    renderResearchResult(result,body,{request,signal});status.textContent='Collection finished. Current source availability and coverage are shown in each asset report.';
    history.replaceState(null,'',location.pathname+'?'+params);
  }catch(error){if(epoch===sequence)status.textContent='Address research unavailable: '+error.message;}
}
form.addEventListener('submit',event=>{event.preventDefault();search();});
const params=new URLSearchParams(location.search);if(['BTC','ETH','BLCH','USDT','USDC','ETH_ALL'].includes(params.get('asset'))&&params.get('query')){form.elements.asset.value=params.get('asset');form.elements.query.value=params.get('query');search();}
