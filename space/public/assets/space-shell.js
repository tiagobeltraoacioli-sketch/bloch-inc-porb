// Apply the saved theme before the first body paint, then share navigation state.
(()=>{
  const root=document.documentElement,script=document.currentScript,base=new URL('../',script.src),themeKey='bloch-space-theme',networkKey='bloch-space-network';
  const assets={bloch:'BLCH',bitcoin:'BTC',ethereum:'ETH'},networks=Object.keys(assets),path=location.pathname.slice(base.pathname.length),params=new URLSearchParams(location.search);
  const stored=key=>{try{return localStorage.getItem(key);}catch{return null;}},remember=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
  let network=networks.find(n=>path.startsWith(n+'/'))||({BTC:'bitcoin',BLCH:'bloch',ETH:'ethereum',USDT:'ethereum',USDC:'ethereum'}[params.get('asset')])||params.get('network')||stored(networkKey)||'bloch';
  if(!networks.includes(network))network='bloch';
  root.dataset.spaceNetwork=network;
  function theme(value){
    root.dataset.theme=['dark','light'].includes(value)?value:'dark';
    const dark=root.dataset.theme==='dark',label=`Switch to ${dark?'light':'dark'} theme`,button=document.getElementById('theme-toggle');
    if(button){button.setAttribute('aria-label',label);button.title=label;button.querySelector('.theme-toggle-label').textContent=dark?'Light':'Dark';}
    const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=dark?'#081210':'#f3f7f4';
    window.dispatchEvent(new CustomEvent('space:theme',{detail:root.dataset.theme}));
  }
  theme(stored(themeKey));
  function href(page,n=network){
    const route={workspace:'app/',explorer:'',graph:'graph/',overview:n+'/',analytics:n+'/analytics/'}[page],url=new URL(route,base);
    if(page==='workspace'||page==='explorer')url.searchParams.set('network',n);
    if(page==='graph')url.searchParams.set('asset',assets[n]);
    return url.pathname+url.search;
  }
  function navigation(){
    const page=document.body?.dataset.spacePage;
    for(const link of document.querySelectorAll('[data-space-link]')){link.href=href(link.dataset.spaceLink);if(link.dataset.spaceLink===page)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
    const select=document.getElementById('space-network');if(select)select.value=network;
    const label=document.getElementById('space-location');if(label)label.textContent={workspace:'Data workspace',explorer:'Record explorer',graph:'Graph Lab',overview:'Network overview',analytics:'Network analytics',account:'Research account',downloads:'Desktop app'}[page]||'Public research';
    root.dataset.spaceNetwork=network;remember(networkKey,network);
  }
  window.addEventListener('space:network',event=>{if(networks.includes(event.detail?.network)){network=event.detail.network;navigation();}});
  window.addEventListener('storage',event=>{if(event.key===themeKey)theme(event.newValue);});
  window.addEventListener('pageshow',()=>{
    const currentPath=location.pathname.slice(base.pathname.length),query=new URLSearchParams(location.search),page=document.body?.dataset.spacePage;
    const active=page==='workspace'?document.querySelector('#network-picker [aria-pressed=true]')?.dataset.network:page==='explorer'?document.querySelector('.network-tabs [aria-selected=true]')?.dataset.network:page==='graph'?({BTC:'bitcoin',BLCH:'bloch',ETH:'ethereum',USDT:'ethereum',USDC:'ethereum'}[document.getElementById('graph-asset')?.value]):null;
    network=networks.find(n=>currentPath.startsWith(n+'/'))||active||query.get('network')||stored(networkKey)||network;
    if(!networks.includes(network))network='bloch';theme(stored(themeKey));navigation();
  });
  document.addEventListener('DOMContentLoaded',()=>{
    theme(root.dataset.theme);navigation();
    document.getElementById('theme-toggle')?.addEventListener('click',()=>{theme(root.dataset.theme==='dark'?'light':'dark');remember(themeKey,root.dataset.theme);});
    document.getElementById('space-network')?.addEventListener('change',event=>{
      const next=event.target.value,page=document.body.dataset.spacePage;
      if(['account','downloads'].includes(page)){network=next;navigation();return;}
      const url=new URL(href(page,next),location.origin),query=new URLSearchParams(location.search);
      if(page==='workspace'&&query.has('view'))url.searchParams.set('view',query.get('view'));
      location.assign(url.pathname+url.search);
    });
  });
})();
