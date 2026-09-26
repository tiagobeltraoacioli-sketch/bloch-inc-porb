import {GraphExplorer} from './explorer.js';
import {invitationToken,accessFailure} from './access-help.js';
import {Intelligence} from './intelligence.js';
import {Enrichment} from './enrichment.js';
import {atlasLink,atlasSelection} from './atlas-context.js';
const $=id=>document.getElementById(id),state={session:null,analysis:null,science:null,runs:[],view:'overview'};
const requestedView=new URLSearchParams(location.search).get('view');
let pendingReference=new URLSearchParams(location.search);
let pendingAtlas=atlasSelection(new URLSearchParams(location.search)),returnToAtlas=requestedView==='atlas';
if(['overview','analyses','science','access','modules','references','cases','watchlists'].includes(requestedView))state.view=requestedView;
const explorer=new GraphExplorer($('network-explorer'),row=>{state.selected=row?.id||null;if(row)walletDetail(row);else $('wallet-detail').hidden=true;renderRows();redraw();});
let scorePoints=[];
let contextVersion=0;
const intelligence=new Intelligence({api,perform,message,openRun,showView,runs:()=>state.runs,role:()=>state.session?.organization.role});
const enrichment=new Enrichment({api,perform,role:()=>state.session?.organization.role,select:id=>explorer.selectNode(id)});
let invitation=new URLSearchParams(location.hash.slice(1)).get('invite'),authMode=invitation?'accept-invite':'login',revokePath=null;
if(location.hash)history.replaceState(null,'',location.pathname);
const number=(n,d=2)=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:d}):'—';
const date=n=>n?new Date(n).toLocaleString():'—';
const short=s=>s?.length>23?`${s.slice(0,12)}…${s.slice(-8)}`:s;
function element(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function message(text,gate=false){$(gate?'gate-status':'status').textContent=text;}
async function api(path,method='GET',body){
  const version=contextVersion;
  const response=await fetch(`/api/porb${path}`,{method,credentials:'same-origin',cache:'no-store',headers:method==='GET'?{}:{'content-type':'application/json','x-porb-action':'1'},body:body===undefined?undefined:JSON.stringify(body)});
  const content=await response.json();if(version!==contextVersion)throw new Error('Workspace changed. Repeat the action in the active organization.');if(!response.ok){const failure=accessFailure(path,content.error,response.status,Boolean(state.session));if(failure.showLogin){state.session=null;showGate();}const error=new Error(failure.message);error.status=response.status;throw error;}return content;
}
async function perform(button,work,gate=false){button.disabled=true;message('Loading…',gate);try{await work();message('',gate);}catch(e){message(e.message,gate||!$('gate').hidden);}finally{button.disabled=false;}}
function showGate(){ contextVersion++;intelligence.reset();enrichment.reset();$('gate').hidden=false;$('workspace').hidden=true;state.session=null;state.analysis=null;state.science=null;state.runs=[];state.selected=null;explorer.clear();$('analysis-result').hidden=true;$('analysis-empty').hidden=false;$('wallet-rows').replaceChildren();$('wallet-detail').replaceChildren();$('secret-dialog').close();$('secret-value').textContent='';renderAuth();}
addEventListener('hashchange',()=>{const token=new URLSearchParams(location.hash.slice(1)).get('invite');if(token){invitation=token;authMode='accept-invite';history.replaceState(null,'',location.pathname);showGate();}});
function renderAuth(){
  $('gate-title').textContent=authMode==='accept-invite'?'Accept your invitation':authMode==='recover'?'Recover access':'Sign in';
  $('gate-note').textContent=authMode==='accept-invite'?'Use the exact invited email. On first access, choose your own password. If you already have a portal account, enter its existing password.':authMode==='recover'?'Enter your email, saved recovery code and a new password.':'Already accepted an invitation? Sign in with your own portal password. For first access, open the private invitation link supplied by your administrator.';
  $('recovery-field').hidden=authMode!=='recover';$('auth-form').elements.recovery.required=authMode==='recover';$('auth-form').elements.password.autocomplete=authMode==='login'?'current-password':'new-password';
  $('auth-submit').textContent=authMode==='accept-invite'?'Accept & enter ↗':authMode==='recover'?'Set new password':'Enter workspace ↗';$('recover-toggle').textContent=authMode==='recover'?'Return to sign in':'Use a recovery code';
  $('invite-link-panel').hidden=authMode==='accept-invite';$('invite-cancel').hidden=!invitation;
}
function secret(title,note,value){$('secret-title').textContent=title;$('secret-note').textContent=note;$('secret-value').textContent=value;$('secret-dialog').showModal();}
$('secret-close').onclick=()=>{$('secret-dialog').close();$('secret-value').textContent='';};
$('secret-dialog').addEventListener('close',()=>{$('secret-value').textContent='';});
$('secret-copy').onclick=()=>perform($('secret-copy'),async()=>{await navigator.clipboard.writeText($('secret-value').textContent);});
$('recover-toggle').onclick=()=>{authMode=authMode==='recover'?(invitation?'accept-invite':'login'):'recover';renderAuth();};
$('invite-link-form').onsubmit=e=>{e.preventDefault();const form=e.currentTarget;try{const token=invitationToken(form.elements.link.value,location.origin);form.reset();invitation=token;authMode='accept-invite';$('auth-form').reset();showGate();message('Invitation link opened locally. Enter the invited email and your password to accept it.',true);}catch(error){form.reset();message(error.message,true);}};
$('invite-cancel').onclick=()=>{invitation=null;authMode='login';$('auth-form').reset();renderAuth();message('Use your own password for an account that has already accepted an invitation.',true);};
$('auth-form').onsubmit=e=>{e.preventDefault();const form=e.currentTarget,body=Object.fromEntries(new FormData(form));if(authMode==='accept-invite')body.invitation=invitation;perform($('auth-submit'),async()=>{const response=await api(`/auth/${authMode}`,'POST',body);form.reset();invitation=null;authMode='login';await session();if(response.recovery_code)secret('Save your recovery code','Displayed once. This code can reset your password and revokes existing sessions and API keys.',response.recovery_code);},true);};
async function session(){
  if(invitation){showGate();return;}
  const result=await api('/auth/session');if(!result.authenticated){showGate();return;}
  state.session=result;$('gate').hidden=true;$('workspace').hidden=false;
  if(returnToAtlas){returnToAtlas=false;location.replace(atlasLink(pendingAtlas.analysis,pendingAtlas.node));return;}
  $('organization').replaceChildren(...result.organizations.map(org=>{const option=element('option',org.name);option.value=org.id;return option;}));$('organization').value=result.organization.id;
  const isAdmin=['owner','admin'].includes(result.organization.role);$('admin-controls').hidden=!isAdmin;$('org-controls').hidden=result.organization.role!=='owner';$('collect-form').querySelector('button').disabled=result.organization.role==='viewer';
  $('access-description').textContent=`${result.user.email} · ${result.organization.role} · ${result.organization.name}`;
  showView(state.view);
  if(state.view==='references'&&pendingReference){const asset=pendingReference.get('asset'),reference=pendingReference.get('reference');if(['BTC','ETH','USDT','USDC','BLCH'].includes(asset)&&reference&&/^[a-zA-Z0-9]{14,100}$/.test(reference)){$('reference-form').elements.asset.value=asset;$('reference-form').elements.reference.value=reference;intelligence.launchers(asset,reference);}pendingReference=null;}
  await Promise.allSettled([loadOverview(),loadRuns()]);if(['cases','watchlists'].includes(state.view))await intelligence.view(state.view);
  if(state.view==='analyses'&&pendingAtlas.analysis){const selected=pendingAtlas;pendingAtlas={analysis:null,node:null};try{await openRun(selected.analysis,selected.node);}catch(error){message(error.message);}}
}
$('logout').onclick=()=>perform($('logout'),async()=>{await api('/auth/logout','POST',{});showGate();});
$('organization').onchange=()=>perform($('organization'),async()=>{await api('/auth/organization','POST',{id:$('organization').value});contextVersion++;intelligence.reset();enrichment.reset();state.analysis=null;state.science=null;state.selected=null;explorer.clear();$('analysis-result').hidden=true;$('analysis-empty').hidden=false;$('science-result').hidden=true;$('science-empty').hidden=false;showView('overview');await session();});
function showView(view){state.view=view;document.querySelectorAll('.view').forEach(e=>e.hidden=e.id!==`view-${view}`);document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));if(view==='access')loadAccess().catch(e=>message(e.message));intelligence.view(view).catch(e=>message(e.message));requestAnimationFrame(redraw);}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>showView(b.dataset.go));
async function loadOverview(){
  const result=await api('/v1/overview');$('network-cards').replaceChildren(...result.networks.map(n=>{const card=element('article',undefined,'network-card');card.append(element('p',n.network==='bitcoin'?'BTC / BITCOIN':n.network==='ethereum'?'ETH / ETHEREUM':'BLCH / BLOCH','eyebrow'),element('h3',n.status==='unavailable'?'Source unavailable':'Source connected'));
    const b=n.body;if(b){let head=b.head?.height??b.head?.number??b.health?.height??b.height??b.chain?.height??b.summary?.height;try{if(typeof head==='string'&&head.startsWith('0x'))head=Number(BigInt(head));}catch{head=null;}card.append(element('div',head!==undefined&&head!==null?`#${number(Number(head),0)}`:'Live observations','head'),element('p',b.source||'Bloch Space'),element('p',`Observed ${date(b.retrieved_at)}`));}else card.append(element('p','Retry the source refresh. Missing observations are not replaced.'));return card;}));
}
$('refresh-overview').onclick=()=>perform($('refresh-overview'),loadOverview);
async function loadRuns(){
  const {analyses}=await api('/v1/analyses');state.runs=analyses;$('saved-analysis').replaceChildren(element('option','Select a saved run'));$('saved-analysis').firstChild.value='';
  for(const run of analyses){const option=element('option',`${run.asset} · ${date(run.created_at)} · ${run.wallets} references`);option.value=run.id;$('saved-analysis').append(option);}
  $('recent-analyses').replaceChildren();if(!analyses.length)$('recent-analyses').append(element('p','No saved analyses yet. Collect a network sample in Data & scores.'));
  for(const run of analyses.slice(0,5)){const row=element('div',undefined,'list-row'),info=element('div',`${run.asset} · ${run.wallets} references · ${run.records} records`);info.append(element('small',`${date(run.created_at)} · Red ${number(run.red_median)} / Blue ${number(run.blue_median)}`));const button=element('button','Open ↗','secondary');button.onclick=()=>perform(button,()=>openRun(run.id));row.append(info,button);$('recent-analyses').append(row);}
}
async function openRun(id,node){state.analysis=await api(`/v1/analyses/${id}`);showView('analyses');renderAnalysis();if(node)explorer.selectNode(node);}
$('saved-analysis').onchange=()=>{if($('saved-analysis').value)perform($('saved-analysis'),()=>openRun($('saved-analysis').value));};
$('collect-form').onsubmit=e=>{e.preventDefault();const form=e.currentTarget,values=new FormData(form);perform(form.querySelector('button'),async()=>{state.analysis=await api('/v1/analyses','POST',{asset:values.get('asset'),pages:Number(values.get('pages'))});renderAnalysis();await loadRuns();$('saved-analysis').value=state.analysis.id;});};
function metrics(target,items){$(target).replaceChildren(...items.map(([label,value])=>{const e=element('div',undefined,'metric');e.append(element('span',label),element('strong',value));return e;}));}
function renderAnalysis(){
  const r=state.analysis;enrichment.open(r);$('analysis-empty').hidden=true;$('analysis-result').hidden=false;
  $('analysis-atlas').href=atlasLink(r.id);
  metrics('analysis-metrics',[['Observed references',number(r.wallets,0)],['Connection records',number(r.records,0)],['Red median',number(r.red_median)],['Blue median',number(r.blue_median)]]);
  $('analysis-provenance').textContent=`${r.asset} · ${r.graph.returned_pages}/${r.graph.requested_pages} pages · ${r.graph.source} · ${date(r.created_at)} · ${r.graph.coverage}${r.graph.stopped?' Collection stopped at capacity.':''} ${r.scores.ml.available?'':r.scores.ml.reason}`;
  $('model-details').textContent=JSON.stringify({id:r.id,dataset_sha256:r.digest,model:r.scores.model,ml:r.scores.ml,clusters:r.scores.clusters,neighborhood:r.scores.neighborhood,evidence_profile:r.scores.evidence_profile,source_snapshots:r.graph.snapshots,feature_statistics_note:r.scores.factor_note},null,2);
  const profile=r.scores.evidence_profile;
  $('evidence-profile').textContent=profile?JSON.stringify(profile,null,2):'This saved run predates evidence profiles. Its original results remain available.';
  $('neighborhood-note').textContent=r.scores.neighborhood?.available?r.scores.neighborhood.model.interpretation:(r.scores.neighborhood?.reason||'This saved run predates neighborhood analysis. Collect a new sample to use it.');
  $('wallet-filter').value='';$('wallet-detail').hidden=true;explorer.load(r);renderRows();redraw();
}
function renderRows(){if(!state.analysis)return;const filter=$('wallet-filter').value.trim().toLowerCase(),rows=state.analysis.scores.rows.filter(r=>r.address.toLowerCase().includes(filter));$('wallet-rows').replaceChildren(...rows.slice(0,200).map(r=>{const tr=element('tr'),ref=element('td'),button=element('button',short(r.address));button.title=r.address;button.onclick=()=>{explorer.selectNode(r.id);$('network-explorer').scrollIntoView({block:'start'});};button.setAttribute('aria-pressed',String(state.selected===r.id));ref.append(button);tr.append(ref);for(const [i,v] of [number(r.red),number(r.blue),r.cluster===null?'—':String(r.cluster+1),`${r.incoming_events} / ${r.outgoing_events}`,number(r.neighbors,0),number(r.ensemble_spread),number(r.neighborhood?.percentile)].entries())tr.append(element('td',v,i===0?'red':i===1?'blue':''));return tr;}));$('wallet-count').textContent=`Showing ${Math.min(rows.length,200)} of ${rows.length} matching references. Full dataset available in export.`;}
$('wallet-filter').oninput=renderRows;
function walletDetail(row){const box=$('wallet-detail');box.hidden=false;box.replaceChildren(element('h3',row.address),element('p',`${row.kind} · ${row.active_blocks} observed blocks · Group ${row.cluster===null?'unavailable':row.cluster+1}`),element('p',`Incoming: ${row.incoming_base_units} base units · Outgoing: ${row.outgoing_base_units} base units`),element('p',`Blue components: ${row.blue_components.map((v,i)=>`${['block anchors','transaction references','exact amounts','timestamps'][i]} ${number(v*100)}%`).join(' · ')}`),element('h3','Largest standardized feature differences'));
  const atlas=element('a','Review in Data Atlas ↗');atlas.href=atlasLink(state.analysis.id,row.id);box.append(atlas);
  if(row.neighborhood){box.append(element('h3','Feature neighborhood'),element('p',`Mean distance ${number(row.neighborhood.mean_distance,4)} · cohort percentile ${number(row.neighborhood.percentile)}. Nearest references share observed features; they need not be transaction counterparties.`));for(const neighbor of row.neighborhood.nearest){const button=element('button',`${short(neighbor.id.split(':').at(-1))} · distance ${number(neighbor.distance,4)}`,'secondary');button.onclick=()=>explorer.selectNode(neighbor.id);box.append(button);}}
  for(const f of row.factors)box.append(element('p',`${f.feature}: ${number(f.value,4)} · cohort mean ${number(f.cohort_mean,4)} · z ${number(f.z,3)}`));box.append(element('p',state.analysis.scores.factor_note,'subtle'));if(state.session?.organization.role!=='viewer'){const button=element('button','Attach to investigation','secondary');button.onclick=()=>perform(button,()=>intelligence.attach(state.analysis.id,row.id));box.append(button);}}
$('export-analysis').onclick=()=>perform($('export-analysis'),async()=>{const r=await api(`/v1/analyses/${state.analysis.id}/export`),url=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:'application/json'})),a=element('a');a.href=url;a.download=`porb-${r.asset}-${r.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('science-form').onsubmit=e=>{e.preventDefault();const form=e.currentTarget;perform(form.querySelector('button'),async()=>{state.science=await api(`/v1/science?network=${encodeURIComponent(form.elements.network.value)}`);renderScience();});};
function renderScience(){const s=state.science.analysis,v=s.validation;$('science-result').hidden=false;$('science-empty').hidden=true;metrics('science-metrics',[['Observations',number(s.statistics.n,0)],[s.feature[1]+' mean',number(s.statistics.mean)],['Standard deviation',number(s.statistics.std)],['Model vs baseline skill',v.available&&v.skill!==null?number(v.skill*100)+'%':'—']]);$('science-source').textContent=`${s.provenance.source} · ${date(s.provenance.retrieved_at)} · ${s.provenance.note}`;$('series-title').textContent=`${s.feature[1]} / ${s.feature[2]}`;$('validation-note').textContent=v.available?`Blue: actual · Red: AR(1) · MAE ${number(v.mae)} · persistence MAE ${number(v.baseline_mae)} · ${v.evaluation_rows} historical evaluation points. ${v.note}`:v.reason;$('science-details').textContent=JSON.stringify(state.science,null,2);redraw();}
function chart(id){const canvas=$(id),w=canvas.clientWidth;if(!w)return null;const h=260,dpr=devicePixelRatio||1;canvas.width=w*dpr;canvas.height=h*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.font='10px -apple-system,sans-serif';ctx.fillStyle='#94a5b5';return {ctx,w,h};}
function axes(c,xLabel,yLabel){const {ctx,w,h}=c;ctx.strokeStyle='#2a3541';ctx.beginPath();ctx.moveTo(38,16);ctx.lineTo(38,h-30);ctx.lineTo(w-12,h-30);ctx.stroke();ctx.fillStyle='#94a5b5';ctx.fillText(yLabel,6,11);ctx.fillText(xLabel,Math.max(40,w-100),h-7);}
function histogramChart(id,bins,color='#ff6e79'){const c=chart(id);if(!c)return;axes(c,'Value','Count');if(!bins.length){c.ctx.fillText('Insufficient observations',50,130);return;}const max=Math.max(...bins.map(b=>b.count),1),width=(c.w-58)/bins.length;for(const [i,b] of bins.entries()){c.ctx.fillStyle=color;c.ctx.fillRect(42+i*width,c.h-30-b.count/max*190,Math.max(1,width-4),b.count/max*190);c.ctx.fillStyle='#94a5b5';c.ctx.fillText(String(b.count),44+i*width,c.h-37-b.count/max*190);}c.ctx.fillText(number(bins[0].low,1),40,c.h-15);c.ctx.fillText(number(bins.at(-1).high,1),c.w-40,c.h-15);}
function lines(id,series){const c=chart(id);if(!c)return;axes(c,'Observation','Value');const all=series.flatMap(s=>s.values).filter(v=>typeof v==='number'&&Number.isFinite(v));if(!all.length){c.ctx.fillText('Insufficient observations',50,130);return;}const min=Math.min(...all),max=Math.max(...all),range=max-min||1;c.ctx.fillText(number(max,2),2,30);c.ctx.fillText(number(min,2),2,c.h-32);for(const s of series){c.ctx.strokeStyle=s.color;c.ctx.lineWidth=1.8;c.ctx.beginPath();let gap=true;s.values.forEach((v,i)=>{if(typeof v!=='number'||!Number.isFinite(v)){gap=true;return;}const x=40+i/Math.max(1,s.values.length-1)*(c.w-54),y=c.h-32-(v-min)/range*(c.h-55);if(gap)c.ctx.moveTo(x,y);else c.ctx.lineTo(x,y);gap=false;});c.ctx.stroke();}}
function redraw(){
  if(state.view==='analyses'&&state.analysis){const s=state.analysis.scores,c=chart('score-chart');if(c){scorePoints=[];axes(c,'Red / 0–100','Blue / 0–100');for(const row of s.rows){if(row.red===null)continue;c.ctx.fillStyle=['#55a6ff99','#ff6e7999','#cbf48c99'][row.cluster??0];c.ctx.beginPath();const x=40+row.red/100*(c.w-55),y=c.h-32-row.blue/100*(c.h-55);scorePoints.push({x,y,row});c.ctx.arc(x,y,3,0,Math.PI*2);c.ctx.fill();}const active=scorePoints.find(p=>p.row.id===state.selected);if(active){c.ctx.beginPath();c.ctx.arc(active.x,active.y,7,0,Math.PI*2);c.ctx.strokeStyle='#cbf48c';c.ctx.lineWidth=2;c.ctx.stroke();}if(!s.ml.available)c.ctx.fillText('Insufficient observations for Red',50,130);}
    histogramChart('distribution-chart',s.distributions.red);const nc=chart('neighborhood-chart');if(nc){axes(nc,'kNN percentile','Red / 0–100');for(const row of s.rows){if(!row.neighborhood||row.red===null)continue;nc.ctx.fillStyle='#cbf48c99';nc.ctx.beginPath();nc.ctx.arc(40+row.neighborhood.percentile/100*(nc.w-55),nc.h-32-row.red/100*(nc.h-55),3,0,Math.PI*2);nc.ctx.fill();}}const m=chart('correlation-chart');if(m){const size=Math.min((m.w-40)/8,26);s.correlation.matrix.forEach((row,y)=>row.forEach((v,x)=>{m.ctx.fillStyle=v===null?'#23303b':v>=0?`rgba(85,166,255,${.1+.9*Math.abs(v)})`:`rgba(255,110,121,${.1+.9*Math.abs(v)})`;m.ctx.fillRect(27+x*size,25+y*size,size-2,size-2);if(v!==null&&size>24){m.ctx.fillStyle='#fff';m.ctx.font='8px sans-serif';m.ctx.fillText(v.toFixed(1),29+x*size,40+y*size);}}));m.ctx.fillStyle='#94a5b5';for(let i=0;i<8;i++){m.ctx.fillText(String(i+1),29+i*size,16);m.ctx.fillText(String(i+1),10,41+i*size);}}

  }
  if(state.view==='science'&&state.science){const s=state.science.analysis;lines('series-chart',[{values:s.rows.map(r=>r[s.feature[0]]),color:'#55a6ff'},{values:s.rolling.map(r=>r.average),color:'#cbf48c'}]);const v=s.validation;lines('validation-chart',[{values:(v.points||[]).map(p=>p.actual),color:'#55a6ff'},{values:(v.points||[]).map(p=>p.prediction),color:'#ff6e79'}]);histogramChart('science-distribution',s.histogram,'#55a6ff');lines('lag-chart',[{values:s.autocorrelation.map(v=>v.value),color:'#cbf48c'}]);}
}
function scoreHit(event){const rect=$('score-chart').getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;return scorePoints.map(p=>({...p,d:Math.hypot(p.x-x,p.y-y)})).filter(p=>p.d<=10).sort((a,b)=>a.d-b.d)[0];}
$('score-chart').onclick=event=>{const hit=scoreHit(event);if(hit){explorer.selectNode(hit.row.id);$('network-explorer').scrollIntoView({block:'start'});}};
$('score-chart').onpointermove=event=>{const hit=scoreHit(event);$('score-chart').title=hit?`${hit.row.address} · Red ${number(hit.row.red)} / Blue ${number(hit.row.blue)}`:'';};
let resizeTimer;addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(redraw,100);});
async function loadAccess(){
  if(!['owner','admin'].includes(state.session?.organization.role))return;
  const [keys,invites,members,audit]=await Promise.all([api('/keys'),api('/invitations'),api('/members'),api('/audit')]);
  function list(id,items,describe,path,canRevoke){$(id).replaceChildren();if(!items.length)$(id).append(element('p','No records.'));for(const item of items){const row=element('div',undefined,'list-row'),info=element('div',describe(item));if(item.expires_at)info.append(element('small',`Expires ${date(item.expires_at)}${item.revoked_at?' · Revoked':item.used_at?' · Accepted':item.expires_at<=Date.now()?' · Expired':path==='invitations'?' · Pending acceptance · manual link delivery':''}`));row.append(info);if(canRevoke(item)){const b=element('button','Revoke','secondary');b.onclick=()=>{revokePath=`/${path}/${item.id}`;$('reauth-note').textContent=describe(item);$('reauth-dialog').showModal();};row.append(b);}$(id).append(row);}}
  list('key-list',keys.keys,k=>`${k.label} · ${k.prefix}… · ${k.scopes.join(', ')}`,'keys',k=>!k.revoked_at);
  list('invitation-list',invites.invitations,i=>`${i.email} · ${i.role}`,'invitations',i=>!i.revoked_at&&!i.used_at);
  list('member-list',members.members,m=>`${m.email} · ${m.role}`,'members',m=>state.session.organization.role==='owner'&&m.role!=='owner');
  $('audit-list').replaceChildren(...audit.events.map(e=>element('p',`${date(e.created_at)} · ${e.action} · ${e.resource_id||''}`,'subtle')));
}
for(const [id,path,transform,after] of [
  ['password-form','/auth/password',f=>Object.fromEntries(new FormData(f)),r=>secret('New recovery code','Password updated. Other sessions and API keys have been revoked. Save this replacement code.',r.recovery_code)],
  ['invite-form','/invitations',f=>Object.fromEntries(new FormData(f)),r=>secret('Private invitation — no email sent',`Copy this link and share it directly with ${r.email}. The recipient chooses their own password on first acceptance; existing users enter their current portal password. Expires ${date(r.expires_at)}.`,r.invitation_url)],
  ['key-form','/keys',f=>({label:f.elements.label.value,days:Number(f.elements.days.value),password:f.elements.password.value,scopes:new FormData(f).getAll('scope')}),r=>secret('Your API key',`Displayed once. Expires ${date(r.expires_at)}.`,r.key)],
  ['org-form','/organizations',f=>Object.fromEntries(new FormData(f)),async()=>{await session();}]
])$(id).onsubmit=e=>{e.preventDefault();const form=e.currentTarget;perform(form.querySelector('button'),async()=>{const body=transform(form);if(form.elements.password)form.elements.password.value='';const r=await api(path,'POST',body);form.reset();await after(r);await loadAccess();});};
$('reauth-cancel').onclick=()=>{$('reauth-dialog').close();$('reauth-form').reset();};
$('reauth-form').onsubmit=e=>{e.preventDefault();const form=e.currentTarget;perform(form.querySelector('button'),async()=>{await api(revokePath,'DELETE',{password:form.elements.password.value});form.reset();$('reauth-dialog').close();revokePath=null;await loadAccess();});};
renderAuth();session().catch(e=>{showGate();message(e.message,true);});

const keyPresets={read:['data:read','analyses:read','scores:read'],collect:['data:read','analyses:read','scores:read','analyses:write'],cases:['data:read','analyses:read','scores:read','cases:read','cases:write','watchlists:read','watchlists:write']};
const keyPresetNotes={read:'Read source data, saved analyses and ML results. No collection or enrichment refresh.',collect:'Read, collect source observations and refresh official identifier evidence. Organization collection budgets apply.',cases:'Read and manage investigations and watchlists. Source collection and official refresh are excluded.',custom:'Select only the permissions required by your integration.'};
$('key-preset').onchange=()=>{const value=$('key-preset').value;if(keyPresets[value])$('key-form').querySelectorAll('[name=scope]').forEach(input=>input.checked=keyPresets[value].includes(input.value));$('key-preset-help').textContent=keyPresetNotes[value];};
$('key-form').querySelectorAll('[name=scope]').forEach(input=>input.addEventListener('change',()=>{$('key-preset').value='custom';$('key-preset-help').textContent=keyPresetNotes.custom;}));
$('key-form').addEventListener('reset',()=>{$('key-preset-help').textContent=keyPresetNotes.read;});
