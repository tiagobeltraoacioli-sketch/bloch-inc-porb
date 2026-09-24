import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {validIdentifier,viewUrl,canonicalView,readSaved,labelFor}=require('../graphus/assets/workbench.js');
const base='https://bloch-graphus.xyz/app.html';
const eth='0x'+'a'.repeat(40);
const bloch='b'.repeat(64);

assert.equal(validIdentifier('ETH',eth),true);
assert.equal(validIdentifier('USDC',eth),true);
assert.equal(validIdentifier('BLCH',bloch),true);
assert.equal(validIdentifier('BLCH',eth),false);
assert.equal(validIdentifier('BTC','1BoatSLRHtKNngkdXEeobR76b53LETtpyT'),true);
assert.equal(validIdentifier('ETH','<script>'),false);
assert.equal(viewUrl('oculum.html','USDC',eth),`oculum.html?asset=usdc&address=${eth}`);
assert.equal(viewUrl('oculum.html','USDC','bad'),null);
assert.equal(canonicalView(`/constellation?asset=ETH&address=${eth}&to_block=1`,base),
             `constellation.html?asset=eth&address=${eth}`);
assert.equal(canonicalView(`/oculum?asset=BLCH&address=${bloch}`,base),
             `oculum.html?asset=blch&address=${bloch}`);
assert.equal(canonicalView('https://outside.example/oculum?asset=ETH&address='+eth,base),null);
assert.equal(canonicalView('javascript:alert(1)',base),null);
assert.equal(canonicalView('/constellation?wallet=SIM-ETH-001',base),
             'constellation.html?wallet=SIM-ETH-001');
assert.equal(labelFor(`oculum.html?asset=eth&address=${eth}`),`Oculum / ETH / ${eth}`);

const storage={getItem(){return JSON.stringify([
  {url:`oculum.html?asset=eth&address=${eth}`,saved_at:'2026-09-24T00:00:00Z'},
  {url:`oculum.html?asset=eth&address=${eth}`},
  {url:'https://outside.example/oculum.html'},
  {url:'javascript:alert(1)'},
]);}};
assert.deepEqual(readSaved(storage,base),[{url:`oculum.html?asset=eth&address=${eth}`,saved_at:'2026-09-24T00:00:00Z'}]);
console.log('Graphus workbench URL and saved-view checks passed.');
