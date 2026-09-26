const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export class Enrichment {
  constructor({api,perform,role,select}) {
    Object.assign(this,{api,perform,role,select});this.version=0;this.report=null;
    this.host=document.getElementById('official-enrichment');
  }
  reset(){this.version++;this.report=null;this.analysis=null;this.host.replaceChildren();}
  async open(analysis){
    this.reset();const version=this.version;this.analysis=analysis;this.render();
    try{const report=await this.api(`/v1/analyses/${analysis.id}/enrichment`);if(version!==this.version)return;this.report=report;this.render();}
    catch(error){if(version===this.version&&error.status!==404)this.note.textContent=error.message;}
  }
  render(){
    const report=this.report;this.host.replaceChildren(el('p','AML/FT / OFFICIAL-SOURCE EVIDENCE','eyebrow'),el('h2','Enrich this sample with OFAC identifiers'));
    this.host.append(el('p','Compare the public references in this saved sample with the official SDN identifier snapshot. Results remain private to your organization.'));
    const actions=el('div',undefined,'graph-actions'),refresh=el('button',report?'Refresh official-source evidence':'Check official identifiers');refresh.type='button';refresh.disabled=this.role()==='viewer';
    refresh.onclick=()=>this.perform(refresh,async()=>{const version=++this.version,id=this.analysis.id;this.note.textContent='Reading the official source…';try{const r=await this.api(`/v1/analyses/${id}/enrichment`,'POST',{});if(version!==this.version)return;this.report=r;this.render();}catch(error){if(version===this.version)this.note.textContent='Refresh failed. Any previous report keeps its original source version and expiry.';throw error;}});actions.append(refresh);this.host.append(actions);
    this.note=el('p',report?`${Date.now()>=Date.parse(report.source.expires_at)?'Snapshot expired — refresh before a current review.':'Snapshot retrieved '+new Date(report.source.retrieved_at).toLocaleString()+'.'} Valid until ${new Date(report.source.expires_at).toLocaleString()}.`:'No official-source result has been saved for this analysis.','source-note');this.host.append(this.note);
    if(!report)return;
    const summary=report.summary;this.host.append(el('p',`${summary.matched} potential exact matches · ${summary.compared} references compared · ${summary.not_covered} references outside identifier coverage.`));
    const download=el('button','Export official evidence JSON ↓','secondary');download.type='button';download.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download=`porb-official-evidence-${report.analysis_id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};actions.append(download);
    this.host.append(el('p','Only explicitly listed identifiers are compared. No match is not clearance; BLCH script hashes are outside this address coverage.','subtle'));
    const matched=report.rows.filter(r=>r.matches.length);
    for(const row of matched.slice(0,20)){
      const item=el('div',undefined,'list-row'),button=el('button',row.reference,'secondary');button.type='button';button.onclick=()=>this.select(row.node_id);
      item.append(button,el('p',row.matches.map(m=>`OFAC entry ${m.entry_id} · listed symbol ${m.listed_symbol}`).join('; ')));this.host.append(item);
    }
    if(matched.length>20)this.host.append(el('p','Showing the first 20 matches. Export includes every result.'));
    const details=el('details');details.append(el('summary','Source versions, coverage and report digest'),el('pre',JSON.stringify({source:report.source,policy:report.policy,dataset_digest:report.dataset_digest,report_digest:report.report_digest},null,2)));this.host.append(el('p',report.interpretation,'subtle'),details);
  }
}
