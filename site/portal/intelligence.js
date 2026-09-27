import {atlasLink} from './atlas-context.js';
import {MODULES,moduleUrl} from './module-catalog.js';
import {researchSelection,collectResearch} from '/space/assets/address-research-bundle.js';
import {renderResearchResult} from '/space/assets/address-research-bundle-ui.js';
const $=id=>document.getElementById(id);
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
const date=v=>new Date(v).toLocaleString(),short=v=>v.length>30?v.slice(0,14)+'…'+v.slice(-10):v;
function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export class Intelligence {
  constructor({api,perform,message,openRun,showView,runs,role}){
    Object.assign(this,{api,perform,message,openRun,showView,runs,role});this.reset();
    const tabs=$('module-tabs');tabs.replaceChildren();for(const item of MODULES){const button=el('button',item.name);button.dataset.module=item.id;button.title=item.description;button.setAttribute('aria-pressed','false');button.onclick=()=>this.module(item.id);tabs.append(button);}
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
  reset(){this.currentCase=null;this.referencePages=new Map();this.caseCursor=null;this.watchCursor=null;this.observationCursor=null;this.pendingEvidence=null;this.referenceQuery=null;this.researchController?.abort();
    this.referenceEpoch=(this.referenceEpoch||0)+1;
    for(const id of ['reference-results','reference-research','reference-launchers','case-list','evidence-list','watch-list','observation-list'])$(id).replaceChildren();
    $('case-detail').hidden=true;$('module-frame').removeAttribute('src');this.currentModule=null;
    for(const id of ['reference-more','case-more','watch-more','observation-more'])$(id).hidden=true;
    for(const id of ['reference-form','watch-form','case-form','watch-evaluate','evidence-form'])$(id).reset();
    $('watch-evaluation').textContent='';$('reference-coverage').textContent='Search covers indexed samples. Opening older analyses adds them to the index.';
  }
  async view(name){
    const readOnly=this.role()==='viewer';
    for(const id of ['case-form','watch-form','watch-evaluate'])$(id).querySelector('button').disabled=readOnly;
    if(name==='modules'&&!this.currentModule)this.module(new URLSearchParams(location.search).get('module')||'map');
    if(name==='cases'){await this.cases();if(this.pendingEvidence&&!this.currentCase)$('case-list').prepend(el('p','Create or open an investigation to attach the selected reference.'));}
    if(name==='watchlists'){this.analysisOptions($('watch-evaluate').elements.analysis);await Promise.all([this.watches(),this.observations()]);}
  }
  module(name,asset,address){
    const item=MODULES.find(item=>item.id===name)||MODULES[0],url=moduleUrl(item.id,location.origin,asset,address);name=item.id;
    $('module-frame').src=url.pathname+url.search;$('module-frame').title=`${item.group} ${item.name}`;$('module-full').href=url.pathname+url.search;$('module-description').textContent=item.description;this.currentModule=name;
    const locationUrl=new URL(location.href);locationUrl.searchParams.set('view','modules');locationUrl.searchParams.set('module',name);history.replaceState(null,'',locationUrl.pathname+locationUrl.search);
    for(const button of document.querySelectorAll('[data-module]'))button.setAttribute('aria-pressed',String(button.dataset.module===name));
  }
  action(label,fn){const b=el('button',label,'secondary');b.onclick=()=>this.perform(b,fn);return b;}
  launchers(asset,reference){const box=$('reference-launchers');box.replaceChildren();for(const [name,label] of [['constellation','Open Constellation'],['oculum','Open Oculum'],['analytics','Open Analytics'],['graph','Open Graph Lab'],['explorer','Inspect source record']])box.append(this.action(label,async()=>{this.module(name,asset,reference);this.showView('modules');}));}
  async search(more){
    const form=$('reference-form');let scope;
    if(!more){
      this.referenceEpoch++;this.researchController?.abort();this.referenceQuery=null;this.referencePages=new Map();
      for(const id of ['reference-results','reference-research','reference-launchers'])$(id).replaceChildren();$('reference-more').hidden=true;$('reference-coverage').textContent='';
      scope=researchSelection(form.elements.asset.value,form.elements.reference.value);
      this.referenceQuery=scope;this.researchController=new AbortController();
      for(const asset of scope.assets){
        const box=el('section'),rows=el('div'),status=el('p','Searching retained organization observations…','source-note');box.dataset.referenceAsset=asset;box.append(el('h3',asset),status,rows);$('reference-results').append(box);this.referencePages.set(asset,{cursor:null,rows,status,coverage:null});
      }
      $('reference-coverage').textContent='Searching each selected asset independently in this organization.';
      $('reference-research').replaceChildren(el('p','Collecting public source records, graph analyses and machine learning…'));$('reference-more').hidden=true;this.launchers(scope.assets[0],scope.reference);
    }
    const epoch=this.referenceEpoch,queryScope=this.referenceQuery;
    const publicResult=more?Promise.resolve():collectResearch(scope,asset=>this.api('/v1/space/research?'+new URLSearchParams({network:scope.network,asset,query:scope.reference})),{signal:this.researchController.signal}).then(report=>{if(epoch===this.referenceEpoch)renderResearchResult($('reference-research'),report,{mounted:true});}).catch(error=>{if(epoch===this.referenceEpoch)$('reference-research').replaceChildren(el('p','Public research unavailable: '+error.message));});
    const retained=[...this.referencePages].filter(([,page])=>!more||page.cursor).map(async([asset,page])=>{
      const query=new URLSearchParams({asset,reference:queryScope.reference,limit:'10'});if(more)query.set('cursor',page.cursor);
      try{
        const result=await this.api('/v1/references?'+query);if(epoch!==this.referenceEpoch)return;
        if(result.asset!==asset||result.reference!==queryScope.reference)throw new Error('Retained reference scope mismatch.');
        page.cursor=result.next_cursor;page.coverage=`${result.index.indexed}/${result.index.retained} retained ${asset} analyses indexed. ${result.coverage}`;page.status.textContent='';
        if(!result.items.length&&!more)page.status.textContent='No match in retained organization samples. Public research is shown separately above.';
        for(const item of result.items){const row=el('div',undefined,'list-row'),info=el('div',`${item.asset} · ${date(item.created_at)}`);info.append(el('small',`Red ${item.score.red??'unavailable'} · Blue ${item.score.blue} · ${item.score.incoming_events} in / ${item.score.outgoing_events} out`),el('small',`Dataset SHA-256: ${item.digest}`));const actions=el('div',undefined,'graph-actions');actions.append(this.action('Inspect graph',()=>this.openRun(item.id,item.node_id)),this.action('Attach to investigation',async()=>this.attach(item.id,item.node_id)));row.append(info,actions);page.rows.append(row);}
      }catch(error){if(epoch===this.referenceEpoch)page.status.textContent='Retained observations unavailable: '+error.message;}
    });
    await Promise.all([publicResult,...retained]);
    if(epoch===this.referenceEpoch){$('reference-more').hidden=![...this.referencePages.values()].some(page=>page.cursor);$('reference-coverage').textContent=[...this.referencePages.values()].map(page=>page.coverage).filter(Boolean).join(' ');}
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
