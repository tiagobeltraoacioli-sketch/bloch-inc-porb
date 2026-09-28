import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {assistantMarkup,ASSISTANT_ASSET_VERSION} from '../deploy/blochai-public/catalog.js';

const {Miniflare,convertV4MiniflareOptions}=await import(process.env.MINIFLARE_MODULE||'miniflare');
const catalog=(await readFile(new URL('../deploy/blochai-public/knowledge.js',import.meta.url),'utf8'))+'\n'+(await readFile(new URL('../deploy/blochai-public/catalog.js',import.meta.url),'utf8')).replace(/^import .+?;\n/,'');
const source=catalog+'\n'+(await readFile(new URL('../deploy/blochai-public-links/worker.js',import.meta.url),'utf8')).replace(/^import .+?;\n/,'');
const fixtures={navigation:'<!doctype html><html><body><nav><a href="/">Home</a></nav><nav>Second</nav></body></html>',spa:'<!doctype html><html><head><title>Explorer</title></head><body><div id="root"></div></body></html>',unclosed:'<!doctype html><html><body><div id="root"></div>'};
if(process.env.BLOCHAI_HTML_FIXTURE)fixtures.production=await readFile(process.env.BLOCHAI_HTML_FIXTURE,'utf8');
const script=source.replace(/export default \{fetch\(request,env\)\{return handlePublicBlochAILink\(\{request,env\}\);\}\};/,`const fixtures=${JSON.stringify(fixtures)};export default {fetch(request){const fixture=fixtures[new URL(request.url).searchParams.get('fixture')];return handlePublicBlochAILink({request,env:{ENABLE_PUBLIC_LINK:'true',ENABLE_PUBLIC_ASSISTANT:'true'},fetcher:async()=>new Response(fixture,{headers:{'content-type':'text/html'}})});}};`);
const options={modules:true,script,compatibilityDate:'2026-09-28'};
const runtime=new Miniflare(convertV4MiniflareOptions?convertV4MiniflareOptions(options):options);
const link='class="blochai-public-link"',style=`<link rel="stylesheet" href="/blochai-assistant.css?v=${ASSISTANT_ASSET_VERSION}">`;
try{
  for(const [name,fixture]of Object.entries(fixtures)){
    const response=await runtime.dispatchFetch(`https://blochl1.com/?fixture=${name}`),body=await response.text();assert.equal(response.status,200);assert.equal(response.headers.get('x-blochai-integration'),'scoped-assistant-v1');assert.equal(body.split('class="blochai-public-link"').length-1,1,`${name}: exactly one public link`);assert.equal(body.replace(assistantMarkup('blochl1.com'),'').replace(style,''),fixture,`${name}: original HTML preserved`);
  }
  const response=await runtime.dispatchFetch('https://bloch.space/app/?fixture=spa');assert.equal((await response.text()).includes(link),true);console.log(`HTMLRewriter runtime passed ${Object.keys(fixtures).length} HTML fixtures plus the exact Bloch Space app path. Original bytes preserved after removing only the scoped widget and its stylesheet.`);
}finally{await runtime.dispose();}
