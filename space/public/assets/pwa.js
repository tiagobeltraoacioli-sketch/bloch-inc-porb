let promptEvent=null;
function toast(message,action=null){document.querySelector('.pwa-toast')?.remove();const box=document.createElement('div');box.className='pwa-toast';box.setAttribute('role','status');box.append(document.createTextNode(message));const button=document.createElement('button');button.textContent=action?'Update now':'Close';button.addEventListener('click',()=>{box.remove();action?.();});box.append(button);document.body.append(box);}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event;});
document.querySelector('#install-app')?.addEventListener('click',async()=>{
  if(promptEvent){await promptEvent.prompt();await promptEvent.userChoice;promptEvent=null;}
  else if(matchMedia('(display-mode: standalone)').matches)toast('Bloch Space is already running as an installed app.');
  else toast('Install from your browser menu. On iPhone/iPad: Share → Add to Home Screen. In Safari on Mac: File → Add to Dock.');
});
function connectivity(){const n=document.querySelector('#connectivity');if(n){n.hidden=navigator.onLine;n.textContent='Offline · The app shell is available. Live sources and private features require a connection; retained observations may be stale.';}}
window.addEventListener('offline',connectivity);window.addEventListener('online',connectivity);connectivity();
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js').then(registration=>{
    const offer=()=>{if(registration.waiting)toast('A new version of Bloch Space is ready.',()=>registration.waiting.postMessage('ACTIVATE_UPDATE'));};offer();
    registration.addEventListener('updatefound',()=>registration.installing?.addEventListener('statechange',()=>{if(registration.waiting&&navigator.serviceWorker.controller)offer();}));
  }).catch(()=>{document.querySelector('#install-app')?.setAttribute('title','Offline installation is unavailable in this browser.');});
  // Initial activation may occur while a live lookup is running. Keep that page;
  // only replacing a controller on an already controlled page needs a reload.
  let controlled=Boolean(navigator.serviceWorker.controller),reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!navigator.serviceWorker.controller)return;
    if(controlled&&!reloading){reloading=true;location.reload();}
    controlled=true;
  });
}
