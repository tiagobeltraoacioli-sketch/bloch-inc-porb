import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,credentials} from './porb_helpers.mjs';
import {digest} from '../portal/security.js';

const base='/v1/atlas/audit',day=86400000;
function insert(h,{id=crypto.randomUUID(),tenant=h.tenant,actor=h.owner,action='atlas.record.read',resource=null,time=Date.now()-1000}={}){
  h.sqlite.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(id,tenant,actor,action,resource,time);return {id,actor_id:actor,action,resource_id:resource,created_at:time};
}
async function fixture(h){const cookie=await h.login();return {cookie,call:(parameters={},suffix='')=>h.call(base+suffix+'?'+new URLSearchParams(parameters),'GET',undefined,cookie)};}
const parameters=report=>Object.fromEntries(Object.entries(report.query).filter(([,value])=>value!==null));

test('audit pages use a signed insertion snapshot and descending timestamp/ID order without duplicates or newly inserted events',async()=>{
  const h=await setup();try{
    const f=await fixture(h),time=Date.now()-5000,events=Array.from({length:55},()=>insert(h,{time})).sort((a,b)=>b.id.localeCompare(a.id));insert(h,{action:'analysis.read',time});
    const first=await(await f.call()).json();assert.equal(first.events.length,25);assert.ok(first.pagination.has_more);assert.deepEqual(first.events,events.slice(0,25));
    const marker=h.sqlite.prepare('SELECT * FROM audit WHERE id=?').get(first.snapshot.id);assert.equal(marker.action,'atlas.audit.snapshot');assert.equal(marker.resource_id,first.query_sha256);
    for(const t of [time-1,time,time+1])insert(h,{time:t});
    const second=await(await f.call({cursor:first.pagination.next_cursor})).json(),third=await(await f.call({cursor:second.pagination.next_cursor})).json();
    assert.deepEqual([...first.events,...second.events,...third.events],events);assert.equal(third.pagination.has_more,false);assert.equal(third.pagination.next_cursor,null);assert.equal(second.snapshot.cursor,first.snapshot.cursor);
    assert.deepEqual((await(await f.call({cursor:first.snapshot.cursor})).json()).events,first.events);
    const fresh=await(await f.call()).json();assert.notEqual(fresh.snapshot.id,first.snapshot.id);assert.ok(fresh.events.some(event=>event.action==='atlas.audit.read'));
    const raw=JSON.parse(Buffer.from(first.snapshot.cursor.split('.')[0],'base64url'));assert.ok(!Object.hasOwn(raw,'barrier'));assert.equal(raw.anchor,first.snapshot.id);
  }finally{h.sqlite.close();}
});

test('audit filters match exact action, credential and resource with inclusive UTC boundaries and only Atlas events',async()=>{
  const h=await setup();try{
    const f=await fixture(h),start=Date.now()-5*day,end=start+day,actor=crypto.randomUUID(),resource="target_%' OR 1=1 --";
    const expected=[insert(h,{actor,resource,time:start}),insert(h,{actor,resource,time:end})].reverse();
    for(const change of [{time:start-1},{time:end+1},{resource:resource+'extra'},{actor:h.owner},{action:'atlas.record.update'},{action:'other.atlas.record.read'}])insert(h,{actor,resource,time:start+1,...change});
    const response=await f.call({start:new Date(start).toISOString(),end:new Date(end).toISOString(),actor,resource,action:'atlas.record.read',limit:1});assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
    const first=await response.json(),second=await(await f.call({...parameters(first),limit:1,cursor:first.pagination.next_cursor})).json();assert.deepEqual([...first.events,...second.events],expected);assert.equal(second.pagination.has_more,false);
    assert.equal(first.window.start,new Date(start).toISOString());assert.equal(first.window.end,new Date(end).toISOString());assert.equal(await digest(JSON.stringify(first.query)),first.query_sha256);
    assert.equal((await f.call({...parameters(first),resource:resource+'x',cursor:first.snapshot.cursor})).status,400);
  }finally{h.sqlite.close();}
});

test('only current owner/admin sessions can read or export audit; API keys, viewers, analysts and other organizations cannot replay cursors',async()=>{
  const h=await setup();try{
    const f=await fixture(h);insert(h);const report=await(await f.call()).json();
    assert.equal((await h.call(base)).status,401);assert.equal((await h.call(base+'/export')).status,401);
    const key=await(await h.call('/keys','POST',{label:'Audit restriction fixture',days:1,password:credentials.password,scopes:['cases:read','analyses:read','scores:read']},f.cookie)).json();
    assert.equal((await h.call(base,'GET',undefined,key.key)).status,403);assert.equal((await h.call(base+'/export','GET',undefined,key.key)).status,403);
    for(const role of ['analyst','viewer']){h.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=?').run(role,h.tenant);for(const suffix of ['', '/export'])assert.equal((await f.call({cursor:report.snapshot.cursor},suffix)).status,403);}
    h.sqlite.prepare('UPDATE memberships SET role=? WHERE tenant_id=?').run('admin',h.tenant);assert.equal((await f.call({cursor:report.snapshot.cursor})).status,200);
    const other=crypto.randomUUID();h.sqlite.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(other,'Other audit fixture','research',Date.now());h.sqlite.prepare('INSERT INTO memberships VALUES(?,?,?)').run(other,h.owner,'owner');h.sqlite.prepare('UPDATE sessions SET tenant_id=? WHERE user_id=?').run(other,h.owner);
    assert.equal((await f.call({cursor:report.snapshot.cursor})).status,400);assert.equal((await h.call(base,'GET',undefined,f.cookie,{headers:{'x-porb-tenant':h.tenant}})).status,409);
    assert.deepEqual((await(await f.call()).json()).events,[]);
  }finally{h.sqlite.close();}
});

test('audit exports re-read the complete selected snapshot, reproduce their checksum and preserve identifiers without joining deleted evidence',async()=>{
  const h=await setup();try{
    const f=await fixture(h),resource=crypto.randomUUID(),time=Date.now()-10000,events=Array.from({length:45},(_,i)=>insert(h,{time:time-i,resource}));
    const first=await(await f.call({resource})).json();insert(h,{resource,time:events[0].created_at});
    const response=await f.call({resource,cursor:first.snapshot.cursor},'/export');assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/attachment/);
    const {audit_sha256,...report}=await response.json();assert.equal(await digest(JSON.stringify(report)),audit_sha256);assert.equal(report.complete,true);assert.equal(report.event_count,45);assert.deepEqual(report.events,events);assert.equal(report.snapshot.id,first.snapshot.id);assert.equal(report.tenant.id,h.tenant);
    assert.ok(report.events.every(row=>Object.keys(row).join(',')==='id,actor_id,action,resource_id,created_at'));assert.equal(h.sqlite.prepare("SELECT resource_id FROM audit WHERE action='atlas.audit.export'").get().resource_id,audit_sha256);
    assert.equal((await f.call({resource,cursor:first.pagination.next_cursor},'/export')).status,400);
    const none=await(await f.call({resource:'not retained'},'/export')).json();assert.equal(none.event_count,0);assert.equal(none.complete,true);
  }finally{h.sqlite.close();}
});

test('audit rejects malformed/forged cursors, changed query scope, invalid windows and unbounded page parameters',async()=>{
  const h=await setup();try{
    const f=await fixture(h);insert(h);const first=await(await f.call()).json();
    const [payload,signature]=first.snapshot.cursor.split('.'),value=JSON.parse(Buffer.from(payload,'base64url'));value.after={created_at:Date.now(),id:crypto.randomUUID()};
    for(const cursor of ['x',first.snapshot.cursor+'.x','a'.repeat(1900),Buffer.from(JSON.stringify(value)).toString('base64url')+'.'+signature])assert.equal((await f.call({cursor})).status,400);
    for(const query of [{limit:0},{limit:101},{limit:'1.2'},{limit:'01'},{limit:-1},{actor:''},{resource:'a\nb'},{action:'analysis.read'},{action:'atlas.%'},{start:'2026-02-30T00:00:00Z'},{start:'2026-09-01'},{end:'2026-09-01T00:00:00Z',start:'2026-09-02T00:00:00Z'},{start:'2024-01-01T00:00:00Z'},{extra:'ignored'}])assert.equal((await f.call(query)).status,400,JSON.stringify(query));
    assert.equal((await h.call(base+'?limit=1&limit=2','GET',undefined,f.cookie)).status,400);assert.equal((await f.call({limit:10},'/export')).status,400);
    assert.equal((await h.call(base,'POST',{},f.cookie)).status,405);
    assert.equal((await f.call({actor:h.owner,cursor:first.snapshot.cursor})).status,400);
  }finally{h.sqlite.close();}
});

test('audit snapshot expiry, missing anchors and signing-key changes fail closed without renewing a snapshot',async()=>{
  const h=await setup();try{
    const f=await fixture(h);insert(h);const first=await(await f.call()).json(),time=Date.now;
    Date.now=()=>first.snapshot.expires_at;try{assert.equal((await f.call({cursor:first.snapshot.cursor})).status,409);assert.equal((await f.call({cursor:first.snapshot.cursor},'/export')).status,409);}finally{Date.now=time;}
    h.env.PORB_AUTH_PEPPER+='rotated';assert.equal((await f.call({cursor:first.snapshot.cursor})).status,400);h.env.PORB_AUTH_PEPPER=h.env.PORB_AUTH_PEPPER.slice(0,-7);
    h.sqlite.prepare('DELETE FROM audit WHERE id=?').run(first.snapshot.id);const missing=await f.call({cursor:first.snapshot.cursor});assert.equal(missing.status,409);assert.equal((await missing.json()).error,'audit_snapshot_unavailable');
  }finally{h.sqlite.close();}
});

test('complete audit export limits fail without silently truncating events or oversized resource strings',async()=>{
  const h=await setup();try{
    const f=await fixture(h);for(let i=0;i<1001;i++)insert(h,{action:'atlas.fixture.many'});
    const tooMany=await f.call({action:'atlas.fixture.many'},'/export');assert.equal(tooMany.status,422);assert.equal((await tooMany.json()).error,'audit_export_capacity');
    insert(h,{action:'atlas.fixture.large',resource:'x'.repeat(2000000)});assert.equal((await f.call({action:'atlas.fixture.large'},'/export')).status,422);
    const tooLarge=await f.call({action:'atlas.fixture.large'});assert.equal(tooLarge.status,422);assert.equal((await tooLarge.json()).error,'audit_response_capacity');
    assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='atlas.audit.export'").get().n,0);
  }finally{h.sqlite.close();}
});

test('audit export snapshots reject expiry during reads and do not claim success when audit logging fails',async()=>{
  const h=await setup();try{
    const f=await fixture(h);insert(h);const first=await(await f.call()).json(),prepare=h.db.prepare,time=Date.now;
    h.db.prepare=sql=>{const stmt=prepare(sql),bind=stmt.bind;stmt.bind=(...args)=>{const s=bind(...args),all=s.all;s.all=async()=>{const result=await all();if(sql.startsWith('SELECT id,actor_id'))Date.now=()=>first.snapshot.expires_at;return result;};return s;};return stmt;};
    try{assert.equal((await f.call({cursor:first.snapshot.cursor},'/export')).status,409);}finally{Date.now=time;h.db.prepare=prepare;}
    h.sqlite.exec("CREATE TRIGGER fail_audit_export BEFORE INSERT ON audit WHEN NEW.action='atlas.audit.export' BEGIN SELECT RAISE(ABORT,'fixture_audit_failure'); END");
    assert.equal((await f.call({cursor:first.snapshot.cursor},'/export')).status,503);assert.equal(h.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='atlas.audit.export'").get().n,0);
  }finally{h.sqlite.close();}
});

test('audit read and export budgets are separate, organization-scoped and explicit',async()=>{
  const h=await setup();try{
    const f=await fixture(h);insert(h);let snapshot;
    for(let i=0;i<30;i++){const response=await f.call(snapshot?{cursor:snapshot}:{});assert.equal(response.status,200);snapshot=(await response.json()).snapshot.cursor;}
    const limited=await f.call({cursor:snapshot});assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);
    for(let i=0;i<6;i++)assert.equal((await f.call({cursor:snapshot},'/export')).status,200);
    assert.equal((await f.call({cursor:snapshot},'/export')).status,429);
  }finally{h.sqlite.close();}
});
