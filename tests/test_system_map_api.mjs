import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../graphus/functions/api/[[path]].js';
import {MODULES,CONNECTIONS} from '../graphus/assets/system_modules.js';
const request=(path,method='GET')=>onRequest({request:new Request('https://bloch-graphus.xyz'+path,{method,headers:{origin:'https://blochl1.com'}}),env:{}});

test('public System Map API exports the live registry and fixed capability routes',async()=>{
  const response=await request('/api/system/map'),body=await response.json();
  assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'*');assert.equal(response.headers.get('access-control-allow-credentials'),null);
  assert.equal(body.schema_version,1);assert.equal(body.modules.length,MODULES.length);assert.deepEqual(body.connections,CONNECTIONS);
  assert.equal(body.capture.endpoint,'https://bloch-graphus.xyz/api/chain/network');assert.equal(body.capture.aml_scores,false);
  for(const module of body.modules)for(const asset of module.assets)for(const link of module.links_by_asset[asset])assert.ok(['https://bloch-graphus.xyz','https://rednblue.space','https://aml-blochinc.xyz','https://bloch.space'].includes(new URL(link.href).origin));
});
test('cross-origin access is confined to public catalog and network reads',async()=>{
  for(const path of ['/api/system/map','/api/chain/network?asset=BTC']){
    const options=await request(path,'OPTIONS');assert.equal(options.status,204);assert.equal(options.headers.get('access-control-allow-methods'),'GET, OPTIONS');
    const post=await request(path,'POST');assert.equal(post.status,405);assert.equal(post.headers.get('access-control-allow-origin'),'*');
  }
  const query=await request('/api/system/map?url=https://untrusted.invalid');assert.equal(query.status,400);
  for(const query of ['asset=BTC&asset=ETH','asset=BAD','asset=BTC&url=https://untrusted.invalid']){
    const response=await request('/api/chain/network?'+query);assert.equal(response.status,400);assert.equal(response.headers.get('access-control-allow-origin'),'*');
  }
  const privateResponse=await request('/api/session');assert.equal(privateResponse.headers.get('access-control-allow-origin'),null);
});
