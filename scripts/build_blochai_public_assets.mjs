import {mkdir,copyFile} from 'node:fs/promises';

const source=new URL('../site/blochai-public/',import.meta.url),target=new URL('../.data/blochai-public-assets/',import.meta.url);
await mkdir(target,{recursive:true});
for(const name of ['index.html','blochai-public.css','favicon.svg','bloch-symbol.svg','bloch-inc-logo-dark.png','blochai-assistant.js','blochai-assistant.css'])await copyFile(new URL(name,source),new URL(name,target));
console.log('Public BlochAI assets staged under .data/blochai-public-assets/.');

const shared=new URL('../site/blochai-shared/',import.meta.url),pdfTarget=new URL('blochai-pdf/',target);
await mkdir(pdfTarget,{recursive:true});
for(const name of ['blochai-pdf.js','blochai-pdf-lib.js','blochai-fontkit.js','BlochAI-DejaVuSans.ttf','pdf-lib-LICENSE.txt','fontkit-LICENSE.txt','DejaVu-LICENSE.txt'])await copyFile(new URL(name,shared),new URL(name,pdfTarget));
