import test from 'node:test';
import assert from 'node:assert/strict';
import {auditCsv} from '../site/portal/atlas-audit.js';
const report=()=>({audit_sha256:'a'.repeat(64),tenant:{id:'organization'},snapshot:{id:'snapshot',created_at:1000},window:{start:'1970-01-01T00:00:00.000Z',end:'1970-01-01T00:00:02.000Z'},query:{action:null,actor:null,resource:null},events:[]});

test('audit CSV retains snapshot identity, applied filters, UTC times and every exported event without mutating its JSON',()=>{
  const input=report();input.query.action='atlas.record.read';input.events=Array.from({length:55},(_,i)=>({id:'event-'+i,created_at:1000+i,actor_id:'actor',action:'atlas.record.read',resource_id:i===0?null:'resource-'+i}));const original=structuredClone(input),csv=auditCsv(input);
  assert.equal(csv.split('\r\n').length,56);assert.match(csv,/"filter_action","filter_actor","filter_resource"/);assert.ok(csv.includes('"1970-01-01T00:00:01.000Z"'));assert.ok(csv.includes('"event-54"'));assert.ok(csv.includes('"'+input.audit_sha256+'","organization","snapshot"'));assert.deepEqual(input,original);
});
test('audit CSV quotes separators and newlines, neutralizes formula prefixes and keeps an empty export explicit',()=>{
  const input=report();assert.equal(auditCsv(input).split('\r\n').length,1);input.query.resource='=SUM(1,2)';input.events=[{id:'event',created_at:1000,actor_id:' \t@external',action:'atlas.record.read',resource_id:'=value,"quoted"\nline'}];
  const csv=auditCsv(input);assert.ok(csv.includes('"\'=SUM(1,2)"'));assert.ok(csv.includes('"\' \t@external"'));assert.ok(csv.includes('"\'=value,""quoted""\nline"'));assert.equal(input.events[0].resource_id,'=value,"quoted"\nline');
});
