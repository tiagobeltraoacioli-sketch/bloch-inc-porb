// Graphus pages and the parent portal share an origin and an authenticated session.
const embedded=window.parent!==window;
if(embedded)document.documentElement.classList.add('portal-embedded');
const bar=document.createElement('div');bar.className='portal-module-bar';
const back=document.createElement('a');back.href='/portal/?view=modules';back.target='_top';back.textContent='← Unified intelligence';
const docs=document.createElement('a');docs.href='/developers/';docs.target='_blank';docs.rel='noopener';docs.textContent='Partner API documentation ↗';bar.append(back,docs);document.body.prepend(bar);
document.addEventListener('click',event=>{const a=event.target.closest('a');if(!a)return;const url=new URL(a.href,location.href);if(url.origin===location.origin&&url.pathname.startsWith('/portal/'))a.target='_top';});
