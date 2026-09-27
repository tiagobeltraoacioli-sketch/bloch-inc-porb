import test from 'node:test';
import assert from 'node:assert/strict';
import {researchSourceFetch} from '../space/chain/research-source.js';

const scope={network:'ethereum',asset:'USDT'},input='https://rpc.example.test/private-key?reference=private';
test('source diagnostics cancel failed bodies and retain only bounded operational metadata',async()=>{
  const records=[];let cancelled=false;
  const response=new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:503,headers:{'retry-after':'4'}});
  const fetcher=researchSourceFetch(async()=>response,{...scope,signal:new AbortController().signal,observe:r=>records.push(r)});
  assert.equal(await fetcher(input,{method:'POST',body:JSON.stringify({method:'eth_getLogs',params:['private-reference']})}),response);
  assert.equal(cancelled,true);assert.equal(records.length,1);
  const {elapsed_ms,...record}=records[0];assert.ok(Number.isSafeInteger(elapsed_ms)&&elapsed_ms>=0);
  assert.deepEqual(record,{...scope,operation:'eth_getLogs',failure:'http',status:503,retry_after_seconds:4});
  assert.ok(!JSON.stringify(records).includes('private'));
});
test('successful reads remain unconsumed and a failed observer cannot change an HTTP failure',async()=>{
  const records=[],ok=Response.json({result:'unchanged'}),options={...scope,signal:new AbortController().signal,observe:r=>records.push(r)};
  assert.deepEqual(await(await researchSourceFetch(async()=>ok,options)(input)).json(),{result:'unchanged'});assert.deepEqual(records,[]);
  const response=new Response('private error',{status:429});
  assert.equal((await researchSourceFetch(async()=>response,{...options,observe(){throw new Error('observer failed');}})(input)).status,429);
});
test('source diagnostics distinguish cancellation from transport without retaining exception text or unknown methods',async()=>{
  for(const aborted of [false,true]){
    const records=[],controller=new AbortController(),sourceSignal=new AbortController();if(aborted)sourceSignal.abort();
    const failure=new Error('private-url-and-reference');
    const fetcher=researchSourceFetch(async(_url,{signal})=>{assert.equal(signal.aborted,aborted);throw failure;},{...scope,signal:controller.signal,observe:r=>records.push(r)});
    await assert.rejects(fetcher(input,{signal:sourceSignal.signal,body:JSON.stringify({method:'private-method'})}),e=>e===failure);
    assert.equal(records[0].failure,aborted?'deadline_or_abort':'transport');assert.equal(records[0].operation,'http_read');assert.ok(!JSON.stringify(records).includes('private'));
  }
});
