import {MODULES} from '/portal/module-catalog.js';
import {researchScope,verifyResearch} from '/space/assets/address-research-core.js';
import {renderResearch} from '/space/assets/address-research-ui.js';
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
    const asset=form.elements.asset.value,network={BTC:'bitcoin',ETH:'ethereum',BLCH:'bloch',USDT:'ethereum',USDC:'ethereum'}[asset];
    const scope=researchScope(new URL('/api/research?'+new URLSearchParams({network,asset,query:form.elements.query.value}),location.origin));
    const params=new URLSearchParams({network,asset,query:scope.reference});
    const response=await fetch('/api/research?'+params,{cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(60000)])});
    const body=await response.json();if(!response.ok)throw new Error(body.error||'source_unavailable');await verifyResearch(body);
    if(epoch!==sequence)return;
    if(body.scope.reference!==scope.reference||body.scope.asset!==asset)throw new Error('research_scope_mismatch');
    renderResearch(result,body);status.textContent='Source observations loaded. Coverage and unavailable modules are stated in the report.';
    history.replaceState(null,'',location.pathname+'?'+params);
  }catch(error){if(epoch===sequence)status.textContent='Address research unavailable: '+error.message;}
}
form.addEventListener('submit',event=>{event.preventDefault();search();});
const params=new URLSearchParams(location.search);if(['BTC','ETH','BLCH','USDT','USDC'].includes(params.get('asset'))&&params.get('query')){form.elements.asset.value=params.get('asset');form.elements.query.value=params.get('query');search();}
