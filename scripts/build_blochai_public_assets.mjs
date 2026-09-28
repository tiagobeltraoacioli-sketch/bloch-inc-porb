import {mkdir,copyFile} from 'node:fs/promises';

const source=new URL('../site/blochai-public/',import.meta.url),target=new URL('../.data/blochai-public-assets/',import.meta.url);
await mkdir(target,{recursive:true});
for(const name of ['index.html','blochai-public.css','favicon.svg','blochai-assistant.js','blochai-assistant.css'])await copyFile(new URL(name,source),new URL(name,target));
console.log('Public BlochAI assets staged under .data/blochai-public-assets/.');
