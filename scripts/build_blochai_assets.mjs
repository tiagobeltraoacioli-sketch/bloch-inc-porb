import {mkdir,copyFile} from 'node:fs/promises';

const source=new URL('../site/blochai/',import.meta.url),target=new URL('../.data/blochai-assets/blochai/',import.meta.url);
await mkdir(target,{recursive:true});
for(const name of ['index.html','blochai.css','blochai.js'])await copyFile(new URL(name,source),new URL(name,target));
const shared=new URL('../site/blochai-shared/',import.meta.url),pdfTarget=new URL('pdf/',target);
await mkdir(pdfTarget,{recursive:true});
for(const name of ['blochai-pdf.js','blochai-pdf-lib.js','blochai-fontkit.js','BlochAI-DejaVuSans.ttf','pdf-lib-LICENSE.txt','fontkit-LICENSE.txt','DejaVu-LICENSE.txt'])await copyFile(new URL(name,shared),new URL(name,pdfTarget));
console.log('BlochAI assets staged under .data/blochai-assets/blochai/.');
