import {mkdir,copyFile,readdir} from 'node:fs/promises';

const source=new URL('../site/blochai-public/',import.meta.url),target=new URL('../.data/blochai-public-assets/',import.meta.url);
await mkdir(target,{recursive:true});
for(const name of ['index.html','blochai-public.css','favicon.svg','bloch-symbol.svg','bloch-inc-logo-dark.png','blochai-assistant.js','blochai-assistant.css','qentl-invite.js'])await copyFile(new URL(name,source),new URL(name,target));
await mkdir(new URL('cli/',target),{recursive:true});
for(const name of (await readdir(new URL('cli/',source))).filter(name=>/^(?:qentl-[\w.]+-py3-none-any\.whl|SHA256SUMS\.txt|install\.sh)$/.test(name)))await copyFile(new URL('cli/'+name,source),new URL('cli/'+name,target));
console.log('Public BlochAI assets staged under .data/blochai-public-assets/.');

const shared=new URL('../site/blochai-shared/',import.meta.url),pdfTarget=new URL('blochai-pdf/',target);
await mkdir(pdfTarget,{recursive:true});
for(const name of ['blochai-pdf.js','blochai-pdf-lib.js','blochai-fontkit.js','BlochAI-DejaVuSans.ttf','pdf-lib-LICENSE.txt','fontkit-LICENSE.txt','DejaVu-LICENSE.txt'])await copyFile(new URL(name,shared),new URL(name,pdfTarget));
