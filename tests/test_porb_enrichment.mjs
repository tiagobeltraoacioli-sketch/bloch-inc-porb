import test from 'node:test';
import assert from 'node:assert/strict';
import {csvRows,parseIdentifiers,officialSnapshot,enrichIdentifiers,SNAPSHOT_TTL} from '../portal/ofac.js';
import {digest} from '../portal/security.js';
import {sourceGraph,setup,credentials} from './porb_helpers.mjs';
import {ofacFixture,officialFetcher} from './ofac_fixture.mjs';

test('official CSV parsing handles quoted multiline fields and discards names; malformed files fail closed',()=>{
  assert.deepEqual([...csvRows('"1","a,b\nwith ""quotes"""\r\n2,plain')],[['1','a,b\nwith "quotes"'],['2','plain']]);
  for(const value of ['1,"unfinished','1,"closed"unexpected','1,un"quoted'])assert.throws(()=>[...csvRows(value)],/invalid_csv/);
  const parsed=parseIdentifiers(ofacFixture());assert.equal(parsed.records.length,101);assert.equal(parsed.row_counts.sdn,1000);assert.ok(!JSON.stringify(parsed).includes('SYNTHETIC PERSON'));
  const files=ofacFixture();assert.deepEqual(parseIdentifiers({sdn:files.sdn+'\r\n\x1a',comments:files.comments+'\x1a'}),parsed);
  assert.throws(()=>parseIdentifiers({...ofacFixture(),comments:'1001,"orphan"'}),/inconsistent_files/);
  assert.throws(()=>parseIdentifiers({...ofacFixture(),sdn:'<html>unavailable</html>'}),/invalid_csv/);
});

test('snapshots retain file hashes, share fresh reads and expire without a stale success fallback',async()=>{
  let calls=0,fail=false;const fetcher=officialFetcher(undefined,(_url,options)=>{calls++;assert.equal(options.redirect,'manual');assert.equal(options.credentials,'omit');if(fail)throw new Error('upstream unavailable');});
  const now=Date.now(),a=await officialSnapshot(fetcher,now),b=await officialSnapshot(fetcher,now+1000);
  assert.equal(a,b);assert.equal(calls,2);assert.match(a.files.sdn.sha256,/^[a-f0-9]{64}$/);assert.match(a.digest,/^[a-f0-9]{64}$/);
  fail=true;await assert.rejects(officialSnapshot(fetcher,now+SNAPSHOT_TTL),/official_source_unavailable/);
  assert.throws(()=>enrichIdentifiers({asset:'ETH',graph:sourceGraph()},a,now+SNAPSHOT_TTL),/official_source_expired/);
  await assert.rejects(officialSnapshot(async()=>new Response('',{headers:{'content-length':'16000001'}})),/capacity/);
  await assert.rejects(officialSnapshot(async()=>new Response('',{status:302,headers:{location:'https://example.invalid'}})),/redirect_rejected/);
});

test('only the issuer publication bucket is followed and mismatched publication versions are rejected',async()=>{
  const files=ofacFixture(),base='https://wc2h-sls-prod-public-published.s3.us-gov-west-1.amazonaws.com';let mismatch=false;
  const source=async(url,options)=>{
    assert.equal(options.headers.authorization,undefined);const name=new URL(url).pathname.split('/').at(-1);
    if(new URL(url).hostname==='sanctionslistservice.ofac.treas.gov')return new Response(null,{status:302,headers:{location:`${base}/Published/${mismatch&&name==='SDN_COMMENTS.CSV'?'different':'same'}/${name}?test-publication-signature=not-a-secret`}});
    return new Response(name==='SDN.CSV'?files.sdn:files.comments);
  };
  const snapshot=await officialSnapshot(source);assert.equal(snapshot.files.sdn.publication_path,'/Published/same');assert.ok(!JSON.stringify(snapshot.files).includes('test-publication-signature'));
  mismatch=true;await assert.rejects(officialSnapshot((...args)=>source(...args)),/publication_changed/);
});

test('exact evidence preserves network boundaries, token context, Bitcoin case and explicit noncoverage',async()=>{
  const snapshot=await officialSnapshot(officialFetcher()),now=Date.now();
  const analyze=(asset,addresses,kind='address')=>enrichIdentifiers({id:'synthetic',digest:'d'.repeat(64),asset,graph:{nodes:addresses.map((address,i)=>({id:String(i),kind,address}))}},snapshot,now);
  assert.equal(analyze('ETH',['0X'+(40).toString(16).padStart(40,'0')]).summary.matched,1);
  assert.equal(analyze('USDT',['0x'+(40).toString(16).padStart(40,'0')]).rows[0].matches[0].listed_symbol,'ETH');
  const address='1BoatSLRHtKNngkdXEeobR76b53LETtpyT';
  const btc=analyze('BTC',[address,address.toLowerCase()]);assert.equal(btc.rows[0].matches[0].listed_symbol,'XBT');assert.equal(btc.rows[1].status,'no_exact_identifier_match_in_snapshot');
  const blch=analyze('BLCH',['a'.repeat(64)],'script_hash');assert.equal(blch.summary.compared,0);assert.equal(blch.rows[0].status,'not_covered');
  const none=structuredClone(snapshot);none.records=none.records.filter(r=>r.symbol!=='ETH');
  assert.equal(enrichIdentifiers({asset:'USDC',graph:sourceGraph('USDC')},none,now).summary.not_covered,40);
  assert.ok(!JSON.stringify(analyze('ETH',['0x'+(40).toString(16).padStart(40,'0')])).includes('SYNTHETIC PERSON'));
});

test('private enrichment is tenant-scoped, auditable, stored separately, digest-checkable and retained on refresh failure',async t=>{
  const s=await setup();t.after(()=>s.sqlite.close());const cookie=await s.login();
  const run=await(await s.call('/v1/analyses','POST',{asset:'ETH',pages:1},cookie)).json(),path=`/v1/analyses/${run.id}/enrichment`;
  assert.equal((await s.call(path)).status,401);assert.equal((await s.call(path,'GET',undefined,cookie)).status,404);
  let sourceCalls=0;const fetcher=officialFetcher(undefined,(_url,options)=>{sourceCalls++;assert.equal(options.headers.authorization,undefined);assert.equal(options.headers.cookie,undefined);});
  const response=await s.call(path,'POST',{},cookie,{fetcher});assert.equal(response.status,201,await response.clone().text());const result=await response.json();
  assert.equal(sourceCalls,2);assert.equal(result.summary.matched,40);assert.match(response.headers.get('cache-control'),/no-store/);
  const {report_digest,source_expired,...report}=result;assert.equal(report_digest,await digest(JSON.stringify(report)));assert.equal(source_expired,false);
  const read=await s.call(path,'GET',undefined,cookie);assert.deepEqual(await read.json(),result);
  assert.deepEqual((await(await s.call(`/v1/analyses/${run.id}`,'GET',undefined,cookie)).json()).scores,run.scores,'Enrichment never mutates model outputs');
  const failed=await s.call(path,'POST',{},cookie,{fetcher:async()=>new Response('unavailable',{status:503})});assert.equal(failed.status,502);assert.deepEqual(await(await s.call(path,'GET',undefined,cookie)).json(),result);
  const key=await(await s.call('/keys','POST',{label:'No source permission',days:1,scopes:['analyses:read','scores:read','analyses:write'],password:credentials.password},cookie)).json();
  assert.equal((await s.call(path,'GET',undefined,key.key)).status,403);assert.equal((await s.call(path,'POST',{},key.key,{fetcher})).status,403);
  const other=crypto.randomUUID();s.sqlite.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(other,'Other test tenant','research',Date.now());s.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?)').run(other,s.owner,'owner');
  const changed=await s.call('/auth/organization','POST',{id:other},cookie),otherCookie=changed.headers.get('set-cookie').split(';')[0];
  assert.equal((await s.call(path,'GET',undefined,otherCookie)).status,404);assert.equal((await s.call(path,'POST',{},otherCookie,{fetcher})).status,404);assert.equal(sourceCalls,2);
  s.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=?').run('viewer',other);assert.equal((await s.call(path,'POST',{},otherCookie,{fetcher})).status,403);
  s.sqlite.prepare('DELETE FROM analyses WHERE id=?').run(run.id);assert.equal(s.sqlite.prepare('SELECT count(*) AS n FROM analysis_enrichments').get().n,0);
});
