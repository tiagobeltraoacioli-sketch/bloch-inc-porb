import {json} from '../../portal/security.js';

// BlochAI was retired from rednblue.space: its page and APIs answer 404 on the routes this
// Worker holds, and the portal page is served without the BlochAI agents tab.
const PORTAL_PAGES=new Set(['/portal','/portal/','/portal/index.html']);
const RETIRED=[
  /<link rel="stylesheet" href="\/portal\/blochai\.css">/g,
  /<button data-view="blochai">[\s\S]*?<\/button>/g,
  /<label class="check"><input type="checkbox" name="scope" value="(?:agents|reports):(?:read|write)">[^<]*<\/label>/g,
];

// The portal script still builds the tab's view inside #view-blochai, so that hidden section stays;
// only the ways to open it and the BlochAI API key scopes are removed.
export function withoutBlochAI(html){return RETIRED.reduce((text,pattern)=>text.replace(pattern,''),html);}

async function portal(request,url,fetcher){
  if(url.searchParams.get('view')==='blochai'){
    url.searchParams.delete('view');
    return new Response(null,{status:302,headers:{location:url.pathname+url.search,'cache-control':'no-store'}});
  }
  const response=await fetcher(request);
  if(request.method!=='GET'||!response.ok||!(response.headers.get('content-type')||'').toLowerCase().includes('text/html'))return response;
  const output=new Response(withoutBlochAI(await response.text()),response);
  for(const name of ['content-length','etag','content-md5'])output.headers.delete(name);
  return output;
}

export async function handleBlochAI({request,fetcher=fetch}){
  const url=new URL(request.url);
  if(url.hostname==='rednblue.space'&&PORTAL_PAGES.has(url.pathname))return portal(request,url,fetcher);
  // The /portal/* route also carries the portal's scripts, styles and data; they pass through untouched.
  if(url.hostname==='rednblue.space'&&url.pathname.startsWith('/portal/'))return fetcher(request);
  if(url.pathname==='/blochai'||url.pathname.startsWith('/blochai/'))
    return new Response('Not found',{status:404,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
  return json({error:'not_found'},404);
}
export default {fetch(request,env){return handleBlochAI({request,env});}};
