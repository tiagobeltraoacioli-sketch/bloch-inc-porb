import test from 'node:test';
import assert from 'node:assert/strict';
import {atlasSelection,atlasSubject,atlasReviews,atlasRecords,atlasRecordSummary,atlasLink} from '../site/portal/atlas-context.js';
const id='11111111-1111-4111-8111-111111111111',node='ETH:address:0x'+'1'.repeat(40),other='ETH:address:0x'+'2'.repeat(40),now=1000000,day=86400000;
const row=(change={})=>({id:'a',kind:'review',status:'reviewed',subject:`${id}:${node}`,body:'Source check',purpose:'Research',lawful_basis:'Declared basis',source_licence:'Publisher rights',updated_at:now,expires_at:now+2*day,...change});
test('Atlas review picker requires exact retained reference, reviewed state and sufficient lifetime',()=>{
  const run={id,scores:{rows:[{id:node}]}};
  assert.equal(atlasSubject(run,other),null);assert.equal(atlasSubject(run,node),`${id}:${node}`);
  const records=[row(),row({id:'open',status:'open'}),row({id:'short',expires_at:now+day-1}),row({id:'wrong',subject:`${id}:${other}`}),row({id:'note',kind:'annotation'}),row({id:'expired',expires_at:now-1})];
  assert.deepEqual(atlasReviews(records,`${id}:${node}`,1,now).map(r=>r.id),['a']);
  assert.deepEqual(atlasReviews(records,null,1,now),[]);assert.deepEqual(atlasReviews(records,`${id}:${node}`,31,now),[]);
});
test('Atlas record filtering retains exact scope, expiry, all search terms and deterministic order',()=>{
  const records=[row(),row({id:'new',updated_at:now+1}),row({id:'other',subject:`${id}:${other}`,status:'open'}),row({id:'expired',expires_at:now-1})];
  assert.deepEqual(atlasRecords(records,{query:'SOURCE research',subject:`${id}:${node}`},now).map(r=>r.id),['new','a']);
  assert.deepEqual(atlasRecords(records,{status:'open'},now).map(r=>r.id),['other']);
  assert.deepEqual(atlasRecords(records,{query:'missing'},now),[]);
  assert.deepEqual(atlasRecordSummary(records,now),{active:3,open:1,reviews:2,expiring:3});
});
test('Private Atlas links only carry validated analysis and reference identities on the private origin',()=>{
  assert.deepEqual(atlasSelection(new URLSearchParams({analysis:id,node})),{analysis:id,node});
  assert.equal(atlasLink('https://outside.test',node),'/atlas.html');
  assert.equal(atlasSelection(new URLSearchParams({analysis:id,node:'<script>'})).node,null);
  assert.equal(new URL(atlasLink(id,node),'https://private.test').origin,'https://private.test');
  assert.equal(new URL(atlasLink(id,node),'https://private.test').searchParams.get('node'),node);
  assert.equal(atlasSelection(new URLSearchParams({case:id})).case,id);
  assert.equal(atlasSelection(new URLSearchParams({case:'https://outside.test'})).case,undefined);
  assert.equal(atlasLink(null,null,id),'/atlas.html?case='+id);
  assert.equal(new URL(atlasLink(id,node,id),'https://private.test').searchParams.get('case'),id);
});
