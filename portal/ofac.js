import {PortalError,requireValue,digest} from './security.js';

export const OFAC_FILES = {
  sdn:'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV',
  comments:'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN_COMMENTS.CSV',
};
export const SNAPSHOT_TTL = 6*60*60*1000;
const MAX_BYTES = 16_000_000;
const snapshots = new WeakMap();
const sha256 = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');

// Strict RFC 4180 field handling, including quoted commas, newlines and quotes.
export function* csvRows(text) {
  let row=[],field='',quoted=false,closed=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted) {
      if(c==='"') {if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}
      else field+=c;
    } else if(c===','||c==='\n'||c==='\r') {
      row.push(field);field='';closed=false;
      if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(v=>v.length))yield row;row=[];}
    } else if(c==='"'&&!field&&!closed) quoted=true;
    else {if(closed||c==='"')throw new PortalError('official_source_invalid_csv',502);field+=c;}
    if(field.length>1_000_000||row.length>50)throw new PortalError('official_source_invalid_csv',502);
  }
  requireValue(!quoted,'official_source_invalid_csv',502);
  if(field||closed||row.length){row.push(field);yield row;}
}

export function parseIdentifiers(files) {
  const records=new Map(),counts={},entryIds=new Set(),commentIds=new Set();
  for(const name of ['sdn','comments']) {
    let count=0;
    for(const row of csvRows(files[name].replace(/^\uFEFF/,'').replace(/\x1a\s*$/,''))) {
      requireValue(/^\d+$/.test(row[0]?.trim()||'')&&row.length===(name==='sdn'?12:2),'official_source_invalid_csv',502);
      const entry=row[0].trim();count++;(name==='sdn'?entryIds:commentIds).add(entry);
      // Only the remarks column is inspected. Names and other personal fields are discarded.
      const remarks=row[name==='sdn'?11:1];
      for(const match of remarks.matchAll(/Digital Currency Address\s*-\s*([A-Za-z0-9]+)\s+([A-Za-z0-9]{12,256})(?=[\s;,.()]|$)/g)) {
        const [,symbol,address]=match,record={entry_id:entry,symbol:symbol.toUpperCase(),address};
        records.set(JSON.stringify([entry,record.symbol,address]),record);
      }
    }
    counts[name]=count;
  }
  requireValue([...commentIds].every(id=>entryIds.has(id)),'official_source_inconsistent_files',502);
  return {records:[...records.values()],row_counts:counts};
}

async function readFile(url,fetcher) {
  let response,current=url;
  const filename=new URL(url).pathname.split('/').at(-1);
  const signal=AbortSignal.timeout(25000);
  for(let redirect=0;redirect<=3;redirect++){
    response=await fetcher(current,{redirect:'manual',credentials:'omit',signal,headers:{accept:'text/csv','user-agent':'BI-PoRB/1.2 official-source-reader'}});
    if(![301,302,303,307,308].includes(response.status))break;
    await response.body?.cancel();
    const next=new URL(response.headers.get('location')||'',current);
    // SLS publishes through this government-region bucket. Never follow arbitrary destinations.
    requireValue(redirect<3&&next.protocol==='https:'&&!next.username&&!next.password&&!next.port&&
      next.hostname==='wc2h-sls-prod-public-published.s3.us-gov-west-1.amazonaws.com'&&next.pathname.startsWith('/Published/')&&next.pathname.endsWith('/'+filename),'official_source_redirect_rejected',502);
    current=next.href;
  }
  requireValue(response.ok&&response.body,'official_source_unavailable',502);
  if(Number(response.headers.get('content-length'))>MAX_BYTES){await response.body.cancel();throw new PortalError('official_source_capacity',502);}
  const reader=response.body.getReader(),chunks=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;requireValue(size<=MAX_BYTES,'official_source_capacity',502);chunks.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const published=new URL(current);
  return {text:new TextDecoder('utf-8',{fatal:true}).decode(bytes),metadata:{url,bytes:size,sha256:await sha256(bytes),last_modified:response.headers.get('last-modified'),
    publication_path:published.hostname==='wc2h-sls-prod-public-published.s3.us-gov-west-1.amazonaws.com'?published.pathname.slice(0,published.pathname.lastIndexOf('/')):null}};
}

export async function officialSnapshot(fetcher=fetch,now=Date.now()) {
  const cached=snapshots.get(fetcher);
  if(cached&&now>=cached.started&&now-cached.started<SNAPSHOT_TTL)return cached.promise;
  const pending={started:now};
  pending.promise=(async()=>{
    try {
      const results=await Promise.allSettled(Object.values(OFAC_FILES).map(url=>readFile(url,fetcher)));
      const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
      const [sdn,comments]=results.map(r=>r.value),parsed=parseIdentifiers({sdn:sdn.text,comments:comments.text});
      requireValue(sdn.metadata.publication_path===comments.metadata.publication_path,'official_source_publication_changed',502);
      requireValue(parsed.row_counts.sdn>=1000&&parsed.row_counts.comments>0&&parsed.records.length>=100,'official_source_sanity_check_failed',502);
      const files={sdn:sdn.metadata,comments:comments.metadata};
      return {...parsed,source_id:'ofac-sdn-official',retrieved_at:new Date(now).toISOString(),expires_at:new Date(now+SNAPSHOT_TTL).toISOString(),
        digest:await digest(JSON.stringify(files)),files,scope:'OFAC SDN and supplementary remarks only. Files are fetched separately; checksums identify fetched bytes, not an atomic issuer publication.'};
    }catch(error){if(snapshots.get(fetcher)===pending)snapshots.delete(fetcher);throw error instanceof PortalError?error:new PortalError('official_source_unavailable',502);}
  })();
  snapshots.set(fetcher,pending);return pending.promise;
}

function matchingAddress(asset,address) {
  if(['ETH','USDT','USDC'].includes(asset)&&/^0x[a-f0-9]{40}$/i.test(address))return address.toLowerCase();
  if(asset==='BTC'&&/^(bc1[ac-hj-np-z02-9]+|BC1[AC-HJ-NP-Z02-9]+)$/.test(address))return address.toLowerCase();
  return address;
}
export function enrichIdentifiers(analysis,snapshot,now=Date.now()) {
  requireValue(Number.isFinite(Date.parse(snapshot.retrieved_at))&&now>=Date.parse(snapshot.retrieved_at)&&now-Date.parse(snapshot.retrieved_at)<SNAPSHOT_TTL,'official_source_expired',503);
  const {asset}=analysis,symbols={BTC:['XBT','BTC'],ETH:['ETH'],USDT:['USDT','ETH'],USDC:['USDC','ETH'],BLCH:[]}[asset];
  requireValue(symbols,'unsupported_asset');
  const eligible=snapshot.records.filter(r=>symbols.includes(r.symbol)&&(!['ETH','USDT','USDC'].includes(asset)||/^0x[a-f0-9]{40}$/i.test(r.address)));
  const index=new Map();for(const r of eligible){const key=matchingAddress(asset,r.address);if(!index.has(key))index.set(key,[]);index.get(key).push({entry_id:r.entry_id,listed_symbol:r.symbol});}
  const rows=analysis.graph.nodes.filter(n=>n.kind==='address'||n.kind==='script_hash').map(node=>{
    const applicable=node.kind==='address'&&eligible.length>0,matches=applicable?index.get(matchingAddress(asset,node.address))||[]:[];
    return {node_id:node.id,reference:node.address,status:!applicable?'not_covered':matches.length?'potential_exact_identifier_match':'no_exact_identifier_match_in_snapshot',matches,review_required:matches.length>0};
  });
  return {schema_version:1,kind:'official_identifier_evidence',analysis_id:analysis.id,asset,dataset_digest:analysis.digest,evaluated_at:new Date(now).toISOString(),
    source:{id:snapshot.source_id,digest:snapshot.digest,retrieved_at:snapshot.retrieved_at,expires_at:snapshot.expires_at,files:snapshot.files,row_counts:snapshot.row_counts,identifier_count:snapshot.records.length,scope:snapshot.scope},
    policy:{version:'ofac-identifiers-1.0.0',symbols,matching:'Exact identifiers; BTC/XBT alias, case-insensitive EVM hex and uniformly cased Bech32. Bitcoin Base58 is case-sensitive. ETH identifiers provide Ethereum address context for the configured Ethereum tokens; USDT/USDC symbol records still require independent network verification.',
      coverage:'Only listed digital currency identifiers. No names, ownership, indirect exposure, other jurisdictions or 50-percent ownership rule evaluation. BLCH script hashes are not comparable to listed wallet addresses. Absence is not clearance.',reference:'https://ofac.treasury.gov/faqs/562'},
    summary:{references:rows.length,matched:rows.filter(r=>r.matches.length).length,compared:rows.filter(r=>r.status!=='not_covered').length,not_covered:rows.filter(r=>r.status==='not_covered').length},rows,
    interpretation:'Potential exact identifier matches require review of network, listing status and applicable restrictions. They do not establish ownership or an AML/FT conclusion. This evidence does not change Red or Blue.'};
}
