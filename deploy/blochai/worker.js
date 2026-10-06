import {json} from '../../portal/security.js';

// BlochAI was retired from rednblue.space: its page and APIs answer 404 on the routes
// this Worker still holds, so nothing else serves stale copies of them.
export async function handleBlochAI({request}){
  const url=new URL(request.url);
  if(url.pathname==='/blochai'||url.pathname.startsWith('/blochai/'))
    return new Response('Not found',{status:404,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
  return json({error:'not_found'},404);
}
export default {fetch(request,env){return handleBlochAI({request,env});}};
