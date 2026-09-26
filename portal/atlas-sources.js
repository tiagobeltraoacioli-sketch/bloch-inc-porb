import {createHash} from 'node:crypto';
import {PortalError,requireValue} from './security.js';

export const OFFICIAL_SOURCES={
  'un-consolidated':{url:'https://scsanctions.un.org/resources/xml/en/consolidated.xml',root:'CONSOLIDATED_LIST',minimum:100,reference_pattern:'^[A-Z]{2}[ie]\\.[0-9]{1,6}$'},
  'uk-sanctions':{url:'https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.xml',root:'Designations',minimum:100,reference_pattern:'^[A-Z]{2,8}[0-9]{1,8}$'},
  'eu-financial-sanctions':{url:'https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw',root:'export',minimum:100,reference_pattern:'^EU\\.[0-9]{1,8}\\.[0-9]{1,8}$'},
};
export const OFFICIAL_TTL=21600000;
const MAX_BYTES=64000000,cache=new WeakMap();
const valid=(ok)=>requireValue(ok,'official_reference_schema_changed',502);
const local=name=>name.split(':').at(-1);

// Streaming, non-expanding XML reader. Only official reference numbers survive parsing.
// Names, addresses and narrative claims are neither retained nor returned.
export function officialReferenceParser(sourceId){
  const spec=OFFICIAL_SOURCES[sourceId];valid(spec);
  const references=new Set(),stack=[];let buffer='',capture=null,rootSeen=false,rootClosed=false;
  const add=value=>{valid(new RegExp(spec.reference_pattern).test(value)&&!references.has(value)&&references.size<50000);references.add(value);};
  const content=text=>{if(capture){capture.value+=text;valid(capture.value.length<=100);}else if(stack.length===0)valid(!text.trim());};
  function tag(token){
    if(token.startsWith('</')){const m=token.match(/^<\/([A-Za-z_][\w:.-]*)\s*>$/);valid(m&&stack.at(-1)===m[1]);
      if(capture&&capture.depth===stack.length){add(capture.value.trim());capture=null;}stack.pop();if(!stack.length)rootClosed=true;return;}
    const m=token.match(/^<([A-Za-z_][\w:.-]*)([\s\S]*?)(\/?)>$/);valid(m&&!rootClosed);const [,name,raw,self]=m,attrs={};
    let rest=raw;
    while(rest.trim()){
      const attr=rest.match(/^\s+([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/);valid(attr&&!Object.hasOwn(attrs,attr[1]));attrs[attr[1]]=attr[2]??attr[3];rest=rest.slice(attr[0].length);
    }
    if(!rootSeen){valid(local(name)===spec.root);rootSeen=true;}
    valid(!capture&&stack.length<40);const parent=local(stack.at(-1)||'');stack.push(name);
    if(sourceId==='un-consolidated'&&local(name)==='REFERENCE_NUMBER'&&['INDIVIDUAL','ENTITY'].includes(parent)||sourceId==='uk-sanctions'&&local(name)==='UniqueID'&&parent==='Designation')capture={depth:stack.length,value:''};
    if(sourceId==='eu-financial-sanctions'&&local(name)==='sanctionEntity'){valid(parent==='export'&&attrs.euReferenceNumber);add(attrs.euReferenceNumber);}
    if(self){valid(!capture);stack.pop();if(!stack.length)rootClosed=true;}
  }
  function pump(final=false){
    while(buffer){
      if(buffer[0]!=='<'){const i=buffer.indexOf('<');if(i<0){content(buffer);buffer='';break;}content(buffer.slice(0,i));buffer=buffer.slice(i);}
      if(buffer.startsWith('<!--')){const end=buffer.indexOf('-->',4);if(end<0)break;valid(!buffer.slice(4,end).includes('--'));buffer=buffer.slice(end+3);continue;}
      if(buffer.startsWith('<![CDATA[')){const end=buffer.indexOf(']]>',9);if(end<0)break;valid(stack.length>0);content(buffer.slice(9,end));buffer=buffer.slice(end+3);continue;}
      if(buffer.startsWith('<?')){const end=buffer.indexOf('?>',2);if(end<0)break;valid(!rootSeen&&/^<\?xml\s/.test(buffer));buffer=buffer.slice(end+2);continue;}
      if(buffer.startsWith('<!')){if(buffer.length<9&&!final)break;valid(false);}
      const match=buffer.match(/^<(?:[^<>"']|"[^"<]*"|'[^'<]*')*>/);if(!match)break;tag(match[0]);buffer=buffer.slice(match[0].length);
    }
    valid(buffer.length<=1000000);
    if(final)valid(!buffer&&rootSeen&&rootClosed&&!stack.length&&!capture&&references.size>0);
  }
  return {write(text){buffer+=text;buffer=buffer.replace(/^\uFEFF/,'');pump();},finish(){pump(true);return [...references].sort();}};
}

export async function officialReferences(sourceId,fetcher=fetch,now=Date.now()){
  requireValue(Object.hasOwn(OFFICIAL_SOURCES,sourceId),'unsupported_official_source');
  if(!cache.has(fetcher))cache.set(fetcher,new Map());const store=cache.get(fetcher),prior=store.get(sourceId);
  if(prior&&now>=prior.started&&now-prior.started<OFFICIAL_TTL)return prior.promise;
  const entry={started:now};entry.promise=(async()=>{
    try{
      const spec=OFFICIAL_SOURCES[sourceId],signal=AbortSignal.timeout(45000);let response,url=spec.url;
      for(let i=0;i<4;i++){
        response=await fetcher(url,{redirect:'manual',credentials:'omit',signal,headers:{accept:'application/xml,text/xml','user-agent':'Graphus-Atlas/1.0 official-reference-reader'}});
        if(![301,302,303,307,308].includes(response.status))break;
        await response.body?.cancel();const next=new URL(response.headers.get('location')||'',url);
        requireValue(i<3&&sourceId==='un-consolidated'&&next.protocol==='https:'&&!next.username&&!next.password&&!next.port&&
          next.hostname==='unsolprodfiles.blob.core.windows.net'&&/^\/publiclegacyxmlfiles\/EN\/consolidatedLegacyBy(?:PRN|Name)\.xml$/.test(next.pathname),'official_source_redirect_rejected',502);url=next.href;
      }
      requireValue(response.ok&&response.body,'official_source_unavailable',502);
      if(Number(response.headers.get('content-length'))>MAX_BYTES){await response.body.cancel();throw new PortalError('official_source_capacity',502);}
      const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true}),hash=createHash('sha256'),parser=officialReferenceParser(sourceId);let bytes=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;requireValue(bytes<=MAX_BYTES,'official_source_capacity',502);hash.update(value);parser.write(decoder.decode(value,{stream:true}));}parser.write(decoder.decode());}
      catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
      const references=parser.finish();requireValue(references.length>=spec.minimum,'official_source_sanity_check_failed',502);
      return {references,metadata:{id:sourceId,parser:'atlas-official-1.0.0',url:spec.url,sha256:hash.digest('hex'),bytes,reference_count:references.length,
        retrieved_at:new Date(now).toISOString(),expires_at:new Date(now+OFFICIAL_TTL).toISOString(),last_modified:response.headers.get('last-modified'),
        license:'Review the official publisher terms for the intended processing purpose.',scope:'Exact official listing references only. No identity, wallet or ownership match is performed.'}};
    }catch(error){if(store.get(sourceId)===entry)store.delete(sourceId);throw error instanceof PortalError?error:new PortalError('official_source_unavailable',502);}
  })();store.set(sourceId,entry);return entry.promise;
}
