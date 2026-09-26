// Mounted research tools and score previews share the portal session.
const embedded=window.parent!==window;
if(embedded)document.documentElement.classList.add('portal-embedded');
const bar=document.createElement('div');bar.className='portal-module-bar';
const back=document.createElement('a');back.href='/portal/?view=modules';back.target='_top';back.textContent='← Unified intelligence';
const docs=document.createElement('a');docs.href='/developers/';docs.target='_blank';docs.rel='noopener';docs.textContent='Partner API documentation ↗';bar.append(back,docs);document.body.prepend(bar);
document.addEventListener('click',event=>{const a=event.target.closest('a');if(!a)return;const url=new URL(a.href,location.href);if(url.origin===location.origin&&url.pathname.startsWith('/portal/'))a.target='_top';});
let tenant=null,checking=false,departed=false;
function leave(){if(departed)return;departed=true;document.body.replaceChildren();(embedded?window.top:window).location.replace('/portal/?view=modules');}
async function checkSession(){
  if(checking||departed||document.hidden)return;checking=true;
  try{const response=await fetch('/api/porb/auth/session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)}),session=await response.json();if(!response.ok||!session.authenticated||tenant&&tenant!==session.organization.id){leave();return;}tenant=session.organization.id;}
  catch{leave();}finally{checking=false;}
}
const accessChannel=typeof BroadcastChannel==='function'?new BroadcastChannel('porb-access'):null;
if(accessChannel)accessChannel.onmessage=leave;
document.addEventListener('visibilitychange',checkSession);window.addEventListener('pageshow',checkSession);setInterval(checkSession,30000);checkSession();
