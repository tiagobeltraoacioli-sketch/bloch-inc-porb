const CACHE='bloch-space-shell-v3';
const SHELL=['/app/','/account/','/graph/','/assets/graph-lab.js','/assets/graph-lab.css','/assets/graph-core.js','/assets/graph-worker.js','/assets/site.css','/assets/light.css','/assets/workspace.css','/assets/research.css',
  '/assets/account.css','/assets/account.js','/assets/workspace.js','/assets/research.js','/assets/science.js','/assets/pwa.js',
  '/assets/favicon.png','/assets/bloch-inc-logo-dark.png','/assets/icon-192.png','/assets/icon-512.png','/manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('bloch-space-shell-')&&name!==CACHE)await caches.delete(name);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const {request}=event,url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  // Never persist account data, source API responses, scores, or POST bodies.
  if(url.pathname.startsWith('/api/')){
    event.respondWith(fetch(request).catch(()=>new Response(JSON.stringify({error:'offline_source_unavailable'}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}})));return;
  }
  if(request.method!=='GET')return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(async()=>await caches.match(url.pathname.startsWith('/account')?'/account/':url.pathname.startsWith('/graph')?'/graph/':'/app/')));return;
  }
  if(SHELL.includes(url.pathname))event.respondWith(caches.match(url.pathname).then(cached=>cached||fetch(request)));
});
