(function(root){
  'use strict';
  const ASSETS=['BTC','ETH','USDT','USDC','BLCH'];
  const VIEWS=['app.html','constellation.html','oculum.html'];
  const STORAGE_KEY='graphus.saved.views.v1';
  const MAX_SAVED=24;

  function validIdentifier(asset,value){
    if(!ASSETS.includes(asset)||typeof value!=='string')return false;
    if(asset==='BLCH')return /^[0-9a-fA-F]{64}$/.test(value);
    if(['ETH','USDT','USDC'].includes(asset))return /^0x[0-9a-fA-F]{40}$/.test(value);
    return /^(?:bc1[ac-hj-np-z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/i.test(value);
  }
  function viewUrl(view,asset,identifier){
    if(!['constellation.html','oculum.html'].includes(view)||!validIdentifier(asset,identifier))return null;
    const params=new URLSearchParams({asset:asset.toLowerCase(),address:identifier});
    return `${view}?${params}`;
  }
  function canonicalView(raw,base){
    if(typeof raw!=='string'||raw.length>600)return null;
    let url;
    try{url=new URL(raw,base);}catch{return null;}
    if(url.origin!==new URL(base).origin)return null;
    const segment=url.pathname.split('/').pop();
    const view=['constellation','oculum','app'].includes(segment)?`${segment}.html`:segment;
    if(!VIEWS.includes(view))return null;
    const asset=url.searchParams.get('asset')?.toUpperCase();
    const identifier=url.searchParams.get('address');
    const wallet=url.searchParams.get('wallet');
    if(view==='app.html')return 'app.html';
    if(asset&&identifier)return viewUrl(view,asset,identifier);
    if(view==='constellation.html'&&wallet&&/^[A-Za-z0-9:._-]{3,100}$/.test(wallet))
      return `constellation.html?wallet=${encodeURIComponent(wallet)}`;
    if(!identifier&&!wallet&&url.searchParams.get('mode')!=='demo'&&(!asset||ASSETS.includes(asset)))
      return `${view}?asset=${(asset||'BLCH').toLowerCase()}`;
    return null;
  }
  function labelFor(url){
    const parsed=new URL(url,'https://graphus.invalid/');
    const view=parsed.pathname.includes('oculum')?'Oculum':parsed.pathname.includes('constellation')?'Constellation':'App';
    const asset=parsed.searchParams.get('asset')?.toUpperCase();
    const identifier=parsed.searchParams.get('address')||parsed.searchParams.get('wallet');
    return identifier?`${view} / ${asset||'synthetic'} / ${identifier}`:asset?`${view} / ${asset} / real network sample`:view;
  }
  function readSaved(storage,base){
    try{
      const input=JSON.parse(storage.getItem(STORAGE_KEY)||'[]');
      if(!Array.isArray(input))return [];
      const seen=new Set();
      return input.flatMap(item=>{
        const url=canonicalView(item?.url,base);
        if(!url||seen.has(url))return [];
        seen.add(url);
        return [{url,saved_at:typeof item.saved_at==='string'?item.saved_at:''}];
      }).slice(0,MAX_SAVED);
    }catch{return [];}
  }
  function writeSaved(storage,items){storage.setItem(STORAGE_KEY,JSON.stringify(items.slice(0,MAX_SAVED)));}
  const api={validIdentifier,viewUrl,canonicalView,readSaved,labelFor};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(!root.document)return;

  const doc=root.document;
  const page=doc.body.dataset.graphusView||root.location.pathname.split('/').pop().replace('.html','')||'app';
  if(!['app','constellation','oculum'].includes(page))return;
  const header=doc.querySelector('.masthead');
  if(!header)return;
  const bar=doc.createElement('section');
  bar.className='workbench-bar';
  bar.setAttribute('aria-label','Graphus research controls');
  bar.innerHTML=`<div class="workbench-mark">GRAPHUS / WORKSPACE</div>
    <form class="workbench-search" id="workbench-search">
      <label for="workbench-asset">Asset</label><select id="workbench-asset"><option>BTC</option><option>ETH</option><option>USDT</option><option>USDC</option><option>BLCH</option></select>
      <label for="workbench-identifier">Public address or Bloch script hash</label><input id="workbench-identifier" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Public address or script hash" maxlength="128">
      <button type="submit" data-target="constellation.html">Graph</button><button type="submit" data-target="oculum.html">Balance map</button>
    </form>
    <div class="workbench-actions"><button type="button" id="workbench-pin">Pin view</button><button type="button" id="workbench-open-saved">Saved <span id="workbench-saved-count">0</span></button></div>
    <p class="workbench-bar-status" id="workbench-message" role="status" aria-live="polite">Public identifiers only · Results disclose source and coverage in each view.</p>`;
  header.insertAdjacentElement('afterend',bar);
  const dialog=doc.createElement('dialog');
  dialog.className='workbench-dialog';
  dialog.setAttribute('aria-labelledby','workbench-dialog-title');
  dialog.innerHTML=`<div class="workbench-dialog-head"><div><span>GRAPHUS / LOCAL RESEARCH</span><h2 id="workbench-dialog-title">Saved views</h2></div><button type="button" id="workbench-close">Close</button></div><div class="workbench-dialog-body"><p>These links are saved on this browser only. No note, score or account data is stored by this feature.</p><div class="workbench-saved-list" id="workbench-saved-list"></div><div class="workbench-dialog-tools"><button type="button" id="workbench-export">Export links as JSON</button><button type="button" id="workbench-clear">Clear saved views</button></div></div>`;
  doc.body.append(dialog);
  const assetInput=doc.getElementById('workbench-asset');
  const identifierInput=doc.getElementById('workbench-identifier');
  const message=doc.getElementById('workbench-message');
  const count=doc.getElementById('workbench-saved-count');
  const list=doc.getElementById('workbench-saved-list');
  const pin=doc.getElementById('workbench-pin');
  const storage=root.localStorage;
  const base=root.location.href;
  let saved=readSaved(storage,base);

  function announce(value,kind='neutral'){message.textContent=value;message.dataset.kind=kind;}
  function refresh(){
    count.textContent=String(saved.length);
    list.replaceChildren();
    if(!saved.length){const empty=doc.createElement('p');empty.className='workbench-saved-empty';empty.textContent='No saved views yet. Search an identifier, open a view, then pin it.';list.append(empty);return;}
    saved.forEach(item=>{
      const row=doc.createElement('div');row.className='workbench-saved-item';
      const link=doc.createElement('a');link.href=item.url;link.textContent=labelFor(item.url);
      const when=doc.createElement('small');when.textContent=item.saved_at?`Saved ${new Date(item.saved_at).toLocaleString()}`:'Saved view';link.append(when);
      const remove=doc.createElement('button');remove.type='button';remove.textContent='Remove';remove.setAttribute('aria-label',`Remove ${labelFor(item.url)}`);
      remove.addEventListener('click',()=>{saved=saved.filter(entry=>entry.url!==item.url);persist('Saved view removed.');});
      row.append(link,remove);list.append(row);
    });
  }
  function persist(success){try{writeSaved(storage,saved);refresh();announce(success);}catch{announce('Browser storage is unavailable; this view was not saved.','error');}}
  function currentView(){
    if(page==='app')return null;
    return canonicalView(root.location.href,base);
  }
  function updateCurrent(){
    const current=currentView();
    pin.disabled=!current;
    pin.title=current?'Save this asset and identifier in this browser':'Open a specific identifier before saving';
    if(current){const parsed=new URL(current,base);const asset=parsed.searchParams.get('asset');const address=parsed.searchParams.get('address');
      if(asset&&address){assetInput.value=asset.toUpperCase();identifierInput.value=address;}}
  }
  doc.getElementById('workbench-search').addEventListener('submit',event=>{
    event.preventDefault();
    const destination=viewUrl(event.submitter?.dataset.target||'constellation.html',assetInput.value,identifierInput.value.trim());
    if(!destination){announce('Enter a valid mainnet address or 64-character Bloch script hash for the selected asset.','error');identifierInput.focus();return;}
    root.location.assign(destination);
  });
  pin.addEventListener('click',()=>{
    const url=currentView();if(!url){announce('Open a specific identifier before pinning a view.','error');return;}
    saved=[{url,saved_at:new Date().toISOString()},...saved.filter(item=>item.url!==url)].slice(0,MAX_SAVED);
    persist('View saved in this browser.');
  });
  doc.getElementById('workbench-open-saved').addEventListener('click',()=>{refresh();dialog.showModal();});
  doc.getElementById('workbench-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  doc.getElementById('workbench-clear').addEventListener('click',()=>{saved=[];persist('Saved views cleared from this browser.');});
  doc.getElementById('workbench-export').addEventListener('click',()=>{
    const payload={product:'Graphus saved views',version:1,exported_at:new Date().toISOString(),views:saved};
    const link=doc.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    link.download='graphus-saved-views.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
    announce(`${saved.length} saved links exported.`);
  });
  doc.addEventListener('keydown',event=>{
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();identifierInput.focus();identifierInput.select();}
    if(event.key==='/'&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!/^(INPUT|TEXTAREA|SELECT)$/.test(doc.activeElement?.tagName||'')){
      event.preventDefault();identifierInput.focus();
    }
  });
  root.addEventListener('popstate',updateCurrent);
  const originalReplaceState=root.history.replaceState.bind(root.history);
  root.history.replaceState=function(...args){const result=originalReplaceState(...args);updateCurrent();return result;};
  refresh();updateCurrent();

  if(page==='app'){
    const live=doc.getElementById('workbench-live-status');
    if(live)fetch('/api/chain/holders?asset=BLCH',{headers:{Accept:'application/json'}})
      .then(async response=>{if(!response.ok)throw new Error('source unavailable');return response.json();})
      .then(data=>{
        const returned=data?.coverage?.returned, height=data?.anchor?.height;
        live.textContent=Number.isInteger(returned)&&Number.isInteger(height)
          ?`Bloch indexed scripts: ${returned} returned at source height ${height}. Source reported; independent verification pending.`
          :'Bloch source responded without a usable coverage summary.';
      }).catch(()=>{live.textContent='Bloch indexed source is temporarily unavailable. Public address lookups remain accessible in the explorers.';});
  }
})(typeof window!=='undefined'?window:globalThis);
