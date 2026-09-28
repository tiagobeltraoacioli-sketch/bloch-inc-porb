import {mkdir,copyFile} from 'node:fs/promises';

const source=new URL('../site/blochai/',import.meta.url),target=new URL('../.data/blochai-assets/blochai/',import.meta.url);
await mkdir(target,{recursive:true});
for(const name of ['index.html','blochai.css','blochai.js'])await copyFile(new URL(name,source),new URL(name,target));
console.log('BlochAI assets staged under .data/blochai-assets/blochai/.');
