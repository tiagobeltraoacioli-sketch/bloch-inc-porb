import {handleExplore} from '../../chain/explorer.js';

const windowMs = 60_000;
const visitors = new Map();
let globalWindow = 0;
let globalCount = 0;

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

export async function onRequest({request, env}) {
  if (request.method !== 'GET') return new Response(JSON.stringify({error:'read_only'}), {
    status:405, headers:{'content-type':'application/json; charset=utf-8',allow:'GET'},
  });
  if (!available(request)) return new Response(JSON.stringify({error:'read_budget_exceeded'}), {
    status:429, headers:{'content-type':'application/json; charset=utf-8','retry-after':'60'},
  });
  const result = await handleExplore(new URL(request.url), {env});
  return new Response(JSON.stringify(result.body), {
    status:result.status,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'},
  });
}
