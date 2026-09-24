import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {compareSourceBalances}=require('../graphus/assets/oculum_compare.js');
const a={key:'a',asset:'USDC',network:'ethereum-mainnet',contract:'0xabc',
  baseUnits:'1234567890123456789012345',decimals:6,source:'ethereum-rpc',block:{hash:'0xaaa'}};
const b={...a,key:'b',baseUnits:'1234567890123456789012344'};
assert.deepEqual(compareSourceBalances(a,b),{
  asset:'USDC',network:'ethereum-mainnet',decimals:6,differenceBaseUnits:'1',larger:'a',
  anchor:'same_block',sourceMatch:true,sameSnapshot:true,
});
assert.equal(compareSourceBalances({...a,baseUnits:'0'},b).larger,'b');
assert.equal(compareSourceBalances(a,{...b,baseUnits:a.baseUnits}).larger,'equal');
assert.equal(compareSourceBalances(a,{...b,block:{hash:'0xbbb'}}).anchor,'different_blocks');
assert.equal(compareSourceBalances(a,{...b,source:'other'}).sameSnapshot,false);
assert.equal(compareSourceBalances({...a,block:null},b).anchor,'not_shared');
assert.equal(compareSourceBalances({...a,decimals:undefined},{...b,decimals:undefined}).decimals,6);
assert.throws(()=>compareSourceBalances(a,{...b,asset:'USDT'}),/incompatible/);
assert.throws(()=>compareSourceBalances(a,{...b,contract:'0xdef'}),/different_token_contracts/);
assert.throws(()=>compareSourceBalances(a,{...b,baseUnits:'1.5'}),/incompatible/);
assert.throws(()=>compareSourceBalances(a,{...b,decimals:18}),/incompatible/);
console.log('Oculum exact balance comparison checks passed.');
