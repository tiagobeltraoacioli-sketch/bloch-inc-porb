import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {selectVisibleSourceNodes}=require('../graphus/assets/source_graph_view.js');

test('Token canvas ranks by returned log count and always includes the selected event peer',()=>{
  const root='0x'+'a'.repeat(40);
  const peers=Array.from({length:45},(_,index)=>'0x'+index.toString(16).padStart(40,'0'));
  const nodes=[{id:'root',kind:'address',address:root},
    ...peers.map((address,index)=>({id:`peer:${index}`,kind:'address',address}))];
  const edges=peers.flatMap((_,index)=>Array.from({length:index===40?1:index===3?8:2},(_,event)=>({
    from:`peer:${index}`,to:'root',event_id:`event:${index}:${event}`,
  })));
  const data={asset:'USDC',address:root.toUpperCase().replace('0X','0x'),nodes,edges};
  const initial=selectVisibleSourceNodes(data);
  assert.equal(initial.total,45);
  assert.equal(initial.visible.length,36);
  assert.equal(initial.omitted,9);
  assert.equal(initial.visible[0].id,'peer:3');
  assert.equal(initial.visible.some(node=>node.id==='peer:40'),false);
  const selected=selectVisibleSourceNodes(data,{selectedEventId:'event:40:0'});
  assert.equal(selected.visible[0].id,'peer:40');
  const selectedPeer=selectVisibleSourceNodes(data,{selectedAddress:peers[40].toUpperCase().replace('0X','0x')});
  assert.equal(selectedPeer.visible[0].id,'peer:40');
  assert.equal(selected.selection_rule,'returned_log_count');
  assert.equal(selected.visible.some(node=>node.id==='root'),false);
});

test('UTXO canvas keeps transaction records and selected references visible',()=>{
  const nodes=[{id:'root',kind:'address',address:'root'},
    ...Array.from({length:40},(_,index)=>({id:`peer:${index}`,kind:'address',address:`peer:${index}`})),
    {id:'tx:1',kind:'transaction',txid:'1'},{id:'tx:2',kind:'transaction',txid:'2'}];
  const edges=Array.from({length:40},(_,index)=>({from:'tx:1',to:`peer:${index}`}));
  const view=selectVisibleSourceNodes({asset:'BTC',address:'root',nodes,edges},
    {selectedTransactionId:'tx:1'});
  assert.equal(view.total,42);
  assert.equal(view.visible.length,36);
  assert.equal(view.visible[0].id,'tx:1');
  assert.equal(view.visible.some(node=>node.id==='tx:2'),true);
  assert.equal(view.selection_rule,'transaction_then_reference_count');
});

test('Canvas view rejects unbounded responses',()=>{
  assert.throws(()=>selectVisibleSourceNodes({asset:'BTC',address:'root',nodes:[],edges:[]},{maxPoints:37}),/Unbounded/);
  assert.throws(()=>selectVisibleSourceNodes({asset:'BTC',address:'root',nodes:[],edges:Array(513).fill({})}),/Unbounded/);
});
