import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {handlePortal} from '../portal/router.js';
import {modulePage} from '../portal/module-page.js';
import {onRequest as publicResearch} from '../site/functions/api/research.js';
export async function portalBrowserServer(h,{fetcher,after=async response=>response}={}){
  const root=resolve(new URL('../site/',import.meta.url).pathname);
  const staticHeaders=Object.fromEntries((await readFile(resolve(root,'_headers'),'utf8')).split('\n\n')[0].split('\n').slice(1).filter(Boolean).map(line=>{const colon=line.indexOf(':');return [line.slice(0,colon).trim(),line.slice(colon+1).trim()];}));
  let origin;
  const server=createServer(async(req,res)=>{
    try{
      const bytes=[];for await(const chunk of req)bytes.push(chunk);const body=Buffer.concat(bytes),request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(body.length?{body}:{})}),url=new URL(request.url);let response;
      if(url.pathname==='/api/research')response=await publicResearch({request,fetcher});
      else if(url.pathname.startsWith('/api/porb/'))response=await after(await handlePortal({request,env:h.env,fetcher}),request);
      else if(['/assets/demo.json','/assets/site.js'].includes(url.pathname))response=new Response(null,{status:302,headers:{location:'/aml'+url.pathname,'cache-control':'no-store'}});
      else{
        const path=decodeURIComponent(url.pathname),file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':!extname(path)?'.html':''));if(!file.startsWith(root+'/'))throw new Error('fixture_path');
        const next=async()=>new Response(await readFile(file),{headers:{...staticHeaders,'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.csv':'text/csv'})[extname(file)]||'application/octet-stream'}});
        response=['/aml/','/space/','/graphus/'].some(prefix=>path.startsWith(prefix))?await modulePage({request,env:h.env,next},{scores:path.startsWith('/aml/')}):await next();
      }
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    }catch(error){res.writeHead(404);res.end('Fixture unavailable: '+error.message);}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
  return {origin,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
