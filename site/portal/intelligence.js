import {atlasLink} from './atlas-context.js';
const $=id=>document.getElementById(id);
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
const date=v=>new Date(v).toLocaleString(),short=v=>v.length>30?v.slice(0,14)+'…'+v.slice(-10):v;
function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export class Intelligence {
  constructor({api,perform,message,openRun,showView,runs,role}){
    Object.assign(this,{api,perform,message,openRun,showView,runs,role});this.reset();
    for(const button of document.querySelectorAll('[data-module]'))button.onclick=()=>this.module(button.dataset.module);
    $('reference-form').onsubmit=e=>{e.preventDefault();this.perform(e.submitter,()=>this.search(false));};
    $('reference-more').onclick=()=>this.perform($('reference-more'),()=>this.search(true));
    $('index-retained').onclick=()=>this.perform($('index-retained'),async()=>{for(const run of this.runs())await this.api(`/v1/analyses/${run.id}`);$('reference-coverage').textContent=`Indexed ${this.runs().length} retained analyses. Run the reference search again.`;});
    $('case-form').onsubmit=e=>{e.preventDefault();this.perform(e.submitter,async()=>{const item=await this.api('/v1/cases','POST',{title:e.target.elements.title.value});e.target.reset();await this.cases();await this.openCase(item.id);});};
    $('case-more').onclick=()=>this.perform($('case-more'),()=>this.cases(true));
    $('evidence-form').elements.analysis.onchange=()=>this.perform($('evidence-form').elements.analysis,()=>this.evidenceOptions());
    $('evidence-form').onsubmit=e=>{e.preventDefault();this.perform(e.submitter,async()=>{const form=e.target;await this.api(`/v1/cases/${this.currentCase.id}/evidence`,'POST',{analysis_id:form.elements.analysis.value,node_id:form.elements.node.value});await this.openCase(this.currentCase.id);await this.cases();});};
    $('case-status').onclick=()=>this.perform($('case-status'),async()=>{await this.api(`/v1/cases/${this.currentCase.id}/status`,'POST',{status:this.currentCase.status==='open'?'closed':'open'});await this.openCase(this.currentCase.id);await this.cases();});
    $('case-export').onclick=()=>this.perform($('case-export'),async()=>download(await this.api(`/v1/cases/${this.currentCase.id}/export`),`porb-case-${this.currentCase.id}.json`));
    $('watch-form').onsubmit=e=>{e.preventDefault();this.perform(e.submitter,async()=>{await this.api('/v1/watchlists','POST',Object.fromEntries(new FormData(e.target)));e.target.reset();await this.watches();});};
    $('watch-more').onclick=()=>this.perform($('watch-more'),()=>this.watches(true));
    $('observation-more').onclick=()=>this.perform($('observation-more'),()=>this.observations(true));
    $('watch-evaluate').onsubmit=e=>{e.preventDefault();this.perform(e.submitter,async()=>{const result=await this.api('/v1/watchlists/evaluate','POST',{analysis_id:e.target.elements.analysis.value});$('watch-evaluation').textContent=`${result.observations_created} new observation(s) recorded. Re-evaluation of the same sample does not duplicate matches.`;await this.observations();});};
  }
  reset(){this.currentCase=null;this.referenceCursor=null;this.caseCursor=null;this.watchCursor=null;this.observationCursor=null;this.pendingEvidence=null;this.referenceQuery=null;
    for(const id of ['reference-results','reference-launchers','case-list','evidence-list','watch-list','observation-list'])$(id).replaceChildren();
    $('case-detail').hidden=true;$('module-frame').removeAttribute('src');this.currentModule=null;
    for(const id of ['reference-more','case-more','watch-more','observation-more'])$(id).hidden=true;
    for(const id of ['reference-form','watch-form','case-form','watch-evaluate','evidence-form'])$(id).reset();
    $('watch-evaluation').textContent='';$('reference-coverage').textContent='Search covers indexed samples. Opening older analyses adds them to the index.';
  }
  async view(name){
    const readOnly=this.role()==='viewer';
    for(const id of ['case-form','watch-form','watch-evaluate'])$(id).querySelector('button').disabled=readOnly;
    if(name==='modules'&&!this.currentModule)this.module('map');
    if(name==='cases'){await this.cases();if(this.pendingEvidence&&!this.currentCase)$('case-list').prepend(el('p','Create or open an investigation to attach the selected reference.'));}
    if(name==='watchlists'){this.analysisOptions($('watch-evaluate').elements.analysis);await Promise.all([this.watches(),this.observations()]);}
  }
  module(name,asset,address){
    const titles={map:'System Map',constellation:'Constellation',oculum:'Oculum',analytics:'Analytics',app:'Research app',catalog:'Data catalog'};if(!Object.hasOwn(titles,name))return;
    const url=new URL(`/graphus/${name}.html`,location.origin);if(asset)url.searchParams.set('asset',asset.toLowerCase());if(address)url.searchParams.set('address',address);
    $('module-frame').src=url.pathname+url.search;$('module-frame').title=`Graphus ${titles[name]}`;$('module-full').href=url.pathname+url.search;this.currentModule=name;
    for(const button of document.querySelectorAll('[data-module]'))button.setAttribute('aria-pressed',String(button.dataset.module===name));
  }
  action(label,fn){const b=el('button',label,'secondary');b.onclick=()=>this.perform(b,fn);return b;}
  launchers(asset,reference){const box=$('reference-launchers');box.replaceChildren();for(const [name,label] of [['constellation','Open Constellation'],['oculum','Open Oculum'],['analytics','Open Analytics']])box.append(this.action(label,async()=>{this.module(name,asset,reference);this.showView('modules');}));}
  async search(more){
    const form=$('reference-form');if(!more){this.referenceQuery={asset:form.elements.asset.value,reference:form.elements.reference.value.trim()};this.referenceCursor=null;}
    const query=new URLSearchParams({...this.referenceQuery,limit:'10'});if(more&&this.referenceCursor)query.set('cursor',this.referenceCursor);
    const result=await this.api('/v1/references?'+query);this.referenceCursor=result.next_cursor;const box=$('reference-results');if(!more)box.replaceChildren();
    $('reference-coverage').textContent=`${result.index.indexed}/${result.index.retained} retained ${result.asset} analyses indexed. ${result.coverage}`;
    this.launchers(result.asset,result.reference);
    if(!result.items.length&&!more)box.append(el('p','No match in indexed samples. Open the live source modules above to query this public reference.'));
    for(const item of result.items){const row=el('div',undefined,'list-row'),info=el('div',`${item.asset} · ${date(item.created_at)}`);info.append(el('small',`Red ${item.score.red??'unavailable'} · Blue ${item.score.blue} · ${item.score.incoming_events} in / ${item.score.outgoing_events} out`),el('small',`Dataset SHA-256: ${item.digest}`));const actions=el('div',undefined,'graph-actions');actions.append(this.action('Inspect graph',()=>this.openRun(item.id,item.node_id)),this.action('Attach to investigation',async()=>this.attach(item.id,item.node_id)));row.append(info,actions);box.append(row);}
    $('reference-more').hidden=!result.next_cursor;
  }
  analysisOptions(select){const old=select.value;select.replaceChildren(el('option','Select a saved analysis'));select.firstChild.value='';for(const run of this.runs()){const option=el('option',`${run.asset} · ${date(run.created_at)}`);option.value=run.id;select.append(option);}select.value=old;}
  async cases(more=false){const result=await this.api('/v1/cases?limit=20'+(more&&this.caseCursor?'&cursor='+encodeURIComponent(this.caseCursor):''));this.caseCursor=result.next_cursor;const box=$('case-list');if(!more)box.replaceChildren();if(!result.items.length&&!more)box.append(el('p','No investigations yet. Create one to retain evidence.'));for(const item of result.items){const row=el('div',undefined,'list-row'),text=el('div',item.title);text.append(el('small',`${item.status} · ${item.evidence_count} snapshots`));row.append(text,this.action('Open',()=>this.openCase(item.id)));box.append(row);}$('case-more').hidden=!this.caseCursor;}
  async attach(analysis,node){this.pendingEvidence={analysis,node};this.showView('cases');if(this.currentCase)await this.openCase(this.currentCase.id);}
  async evidenceOptions(){const form=$('evidence-form'),id=form.elements.analysis.value;form.elements.node.replaceChildren();if(!id)return;const run=await this.api(`/v1/analyses/${id}`);for(const row of run.scores.rows){const option=el('option',row.address);option.value=row.id;form.elements.node.append(option);}if(this.pendingEvidence?.analysis===id)form.elements.node.value=this.pendingEvidence.node;}
  async openCase(id){
    const c=await this.api(`/v1/cases/${id}`);this.currentCase=c;$('case-atlas').href=atlasLink(null,null,id)+'#case-workspace';$('case-detail').hidden=false;$('case-title').textContent=c.title;$('case-state').textContent=`${c.status} · ${c.evidence.length}/50 snapshots`;$('case-status').textContent=c.status==='open'?'Close investigation':'Reopen investigation';$('case-status').disabled=this.role()==='viewer';
    const form=$('evidence-form');form.hidden=c.status!=='open'||this.role()==='viewer';this.analysisOptions(form.elements.analysis);if(this.pendingEvidence)form.elements.analysis.value=this.pendingEvidence.analysis;await this.evidenceOptions();
    $('evidence-list').replaceChildren();for(const evidence of c.evidence){const s=evidence.snapshot,item=el('details',undefined,'evidence-item'),summary=el('summary',`${s.asset} · ${short(s.score.address)} · ${s.records_returned}/${s.records_total} records`);item.append(summary,el('p',`Snapshot SHA-256: ${evidence.digest}`),el('p',`${s.source} · ${date(s.analysis_created_at)} · Red ${s.score.red??'unavailable'} / Blue ${s.score.blue}`));item.append(this.action('Inspect retained source graph',()=>this.openRun(s.analysis_id,s.score.id)),el('pre',JSON.stringify(s,null,2)));$('evidence-list').append(item);}if(!c.evidence.length)$('evidence-list').append(el('p','No evidence attached yet.'));
  }
  async watches(more=false){const result=await this.api('/v1/watchlists?limit=20'+(more&&this.watchCursor?'&cursor='+encodeURIComponent(this.watchCursor):''));this.watchCursor=result.next_cursor;const box=$('watch-list');if(!more)box.replaceChildren();if(!result.items.length&&!more)box.append(el('p','No watched references.'));for(const item of result.items){const row=el('div',undefined,'list-row'),text=el('div',`${item.asset} · ${item.reference}`);row.append(text);if(this.role()!=='viewer')row.append(this.action('Remove',async()=>{await this.api(`/v1/watchlists/${item.id}`,'DELETE',{});await Promise.all([this.watches(),this.observations()]);}));box.append(row);}$('watch-more').hidden=!this.watchCursor;}
  async observations(more=false){const result=await this.api('/v1/observations?limit=20'+(more&&this.observationCursor?'&cursor='+encodeURIComponent(this.observationCursor):''));this.observationCursor=result.next_cursor;const box=$('observation-list');if(!more)box.replaceChildren();if(!result.items.length&&!more)box.append(el('p','No matching observations. Collect or evaluate a sample to check watched references.'));for(const item of result.items){const o=item.observation,row=el('div',undefined,'list-row'),info=el('div',`${o.asset} · ${o.reference}`),actions=el('div',undefined,'graph-actions');info.append(el('small',`${date(item.created_at)} · ${item.reviewed_at?'Reviewed':'New'} · Red ${o.red??'unavailable'} / Blue ${o.blue}`),el('small',`${o.incoming_events} in / ${o.outgoing_events} out · ${o.source}`));actions.append(this.action('Inspect sample',()=>this.openRun(o.analysis_id)));if(!item.reviewed_at&&this.role()!=='viewer')actions.append(this.action('Mark reviewed',async()=>{await this.api(`/v1/observations/${item.id}/review`,'POST',{});await this.observations();}));row.append(info,actions);box.append(row);}$('observation-more').hidden=!this.observationCursor;}
}
