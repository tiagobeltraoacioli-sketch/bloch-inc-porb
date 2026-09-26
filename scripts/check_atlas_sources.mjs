import {officialReferences,OFFICIAL_SOURCES} from '../portal/atlas-sources.js';
import {evidencePacket} from '../graphus/assets/system_evidence.js';
import {analyzeAtlas} from '../graphus/assets/atlas_engine.js';
import {mkdir,writeFile} from 'node:fs/promises';
const results=[];
const jobs=[...Object.keys(OFFICIAL_SOURCES).map(source=>async()=>{const {metadata}=await officialReferences(source);return {source,kind:'official-reference-snapshot',...metadata};}),
  ...['BTC','ETH','USDT','USDC','BLCH'].map(asset=>async()=>{const response=await fetch(`https://bloch-graphus.xyz/api/chain/network?asset=${asset}`,{signal:AbortSignal.timeout(65000),redirect:'error'});if(!response.ok)throw new Error(`Source HTTP ${response.status}`);
    const raw=await response.json(),packet=await evidencePacket(raw,asset),report=await analyzeAtlas(packet);
    return {source:asset,kind:'public-chain-atlas',records:report.records.length,fields:Object.keys(report.fields).length,states:Object.fromEntries([...new Set(Object.values(report.fields).map(f=>f.state))].map(state=>[state,Object.values(report.fields).filter(f=>f.state===state).length])),dataset_sha256:packet.dataset_sha256};})];
const labels=[...Object.keys(OFFICIAL_SOURCES),'BTC','ETH','USDT','USDC','BLCH'];
await Promise.all(jobs.map(async(job,i)=>{try{const result={status:'passed',...await job()};results.push(result);console.log(JSON.stringify({source:labels[i],status:result.status,records:result.records,references:result.reference_count,bytes:result.bytes}));}catch(error){results.push({source:labels[i],status:'failed',error:error.message});console.error(labels[i],error.message);}}));
await mkdir(new URL('../.data/',import.meta.url),{recursive:true});await writeFile(new URL('../.data/atlas-source-check.json',import.meta.url),JSON.stringify({checked_at:new Date().toISOString(),results},null,2));
if(results.some(r=>r.status==='failed'))process.exitCode=1;
