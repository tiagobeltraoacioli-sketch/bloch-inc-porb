import {handleExplore} from '../../chain/explorer.js';
import {graphusSnapshot} from '../../chain/graphus.js';
import {handleAccount} from '../../chain/accounts.js';
import {handleGraph} from '../../chain/graph.js';

const windowMs = 60_000;
const visitors = new Map();
let globalWindow = 0;
let globalCount = 0;
let bitcoinIntelligenceCache = null;

function available(request) {
  const now = Date.now();
  if (now - globalWindow >= windowMs) { globalWindow = now; globalCount = 0; visitors.clear(); }
  const key = request.headers.get('CF-Connecting-IP') || 'unknown';
  const count = visitors.get(key) || 0;
  if (globalCount >= 300 || count >= 30) return false;
  globalCount++;
  if (visitors.size < 2000 || visitors.has(key)) visitors.set(key, count + 1);
  return true;
}

export async function onRequest(context) {
  const {request,env}=context;
  const path=new URL(request.url).pathname;
  if(path.startsWith('/api/account/')||path.startsWith('/api/porb/'))return handleAccount({...context,waitUntil:context.waitUntil?.bind(context)});
  if (request.method !== 'GET') return new Response(JSON.stringify({error:'read_only'}), {
    status:405, headers:{'content-type':'application/json; charset=utf-8',allow:'GET'},
  });
  if (!available(request)) return new Response(JSON.stringify({error:'read_budget_exceeded'}), {
    status:429, headers:{'content-type':'application/json; charset=utf-8','retry-after':'60'},
  });
  const url = new URL(request.url);
  let result;
  if(url.pathname==='/api/graph')result=await handleGraph(url,{env});
  else if(url.pathname==='/api/graphus'&&url.searchParams.size===1)result=await graphusSnapshot(url.searchParams.get('network'));
  else if (url.pathname === '/api/intelligence' && url.searchParams.size === 1 && url.searchParams.get('network') === 'bitcoin') {
    const now = Date.now();
    if (!bitcoinIntelligenceCache || bitcoinIntelligenceCache.until <= now) {
      const entry = {until:now + 30_000, promise:handleExplore(url, {env})};
      bitcoinIntelligenceCache = entry;
      entry.promise.then(value => { if (value.status !== 200 && bitcoinIntelligenceCache === entry) bitcoinIntelligenceCache = null; },
        () => { if (bitcoinIntelligenceCache === entry) bitcoinIntelligenceCache = null; });
    }
    result = await bitcoinIntelligenceCache.promise;
  } else result = await handleExplore(url, {env});
  return new Response(JSON.stringify(result.body), {
    status:result.status,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'},
  });
}
