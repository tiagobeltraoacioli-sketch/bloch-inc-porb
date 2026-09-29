(()=>{
  'use strict';
  const root=document.querySelector('.blochai-assistant');if(!root)return;
  const select=selector=>root.querySelector(selector),trigger=select('.blochai-assistant__trigger'),panel=select('.blochai-assistant__panel'),form=select('form'),question=select('[name="question_id"]'),mode=select('[name="mode"]'),network=select('[name="network"]'),subjectKind=select('[name="subject_kind"]'),subjectValue=select('[name="subject_value"]'),referenceInput=select('.blochai-assistant__reference-input'),search=select('.blochai-assistant__search'),match=select('.blochai-assistant__match'),submit=select('.blochai-assistant__submit'),status=select('.blochai-assistant__status'),historyNode=select('.blochai-assistant__history'),clear=select('.blochai-assistant__clear'),exportButton=select('.blochai-assistant__export'),count=select('.blochai-assistant__count');
  let topics;try{topics=JSON.parse(root.dataset.blochaiCatalog);}catch{return;}
  if(!Array.isArray(topics)||topics.length>32)return;
  const topicById=new Map(topics.map(topic=>[topic.id,topic])),modeNames={summary:'Quick summary',explain:'Explanation',checklist:'Checklist',example:'Worked example'},networkNames={bitcoin:'Bitcoin',ethereum:'Ethereum',bloch:'Bloch'},amountUnits={BTC:'sat',ETH:'wei',BLCH:'sat'};
  const supportsNetwork=topic=>topic&&(!Array.isArray(topic.networks)||topic.networks.includes(network.value));
  let ticket=null,job=null,timer=null,polls=0,busy=false,exporting=false,activeController=null,generation=0,current=null,history=[];
  const stop=()=>{clearTimeout(timer);timer=null;};
  function controls(){
    const full=history.length>=12;submit.disabled=busy||full||!supportsNetwork(topicById.get(question.value));for(const field of [question,mode,network,subjectKind,subjectValue,search])field.disabled=busy;
    root.querySelectorAll('[data-topic],[data-followup]').forEach(button=>{button.disabled=busy||full;});
    clear.disabled=!busy&&!history.length&&!search.value&&!subjectValue.value;exportButton.disabled=busy||exporting||!history.length;count.textContent=`${history.length} / 12 explanations`;
  }
  function open(value){panel.hidden=!value;trigger.setAttribute('aria-expanded',String(value));if(value)search.focus();else trigger.focus();}
  trigger.addEventListener('click',()=>open(panel.hidden));select('.blochai-assistant__close').addEventListener('click',()=>open(false));
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){open(false);event.preventDefault();}});
  const normalize=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  function resolveTopic(value){
    const input=normalize(value);if(!input)return null;
    const eligible=topics.filter(supportsNetwork),exact=eligible.filter(topic=>[topic.title,topic.question].some(text=>normalize(text)===input));if(exact.length===1)return exact[0];
    const scored=eligible.map(topic=>{
      const phrases=[...(topic.keywords||[]),topic.title].map(normalize).filter(phrase=>phrase.length>=3);
      const score=[...new Set(phrases)].reduce((total,phrase)=>` ${input} `.includes(` ${phrase} `)?total+Math.min(3,phrase.split(' ').length):total,0);
      return {topic,score};
    }).sort((a,b)=>b.score-a.score);
    return scored[0]?.score>0&&scored[0].score>(scored[1]?.score||0)?scored[0].topic:null;
  }
  function choose(id,{typed=false}={}){
    const candidate=topicById.get(id),topic=supportsNetwork(candidate)?candidate:null;question.value=topic?id:'';if(!typed)search.value='';
    root.querySelectorAll('[data-topic]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.topic===question.value)));
    match.textContent=topic?`Matched topic: ${topic.question}`:search.value?'No single topic matched this network. Choose a topic below; only that topic will be sent.':`Choose a ${networkNames[network.value]} topic below, or type to find one.`;
    controls();
  }
  function filterTopics(){
    const previous=question.value;
    root.querySelectorAll('[data-topic]').forEach(button=>{button.hidden=!supportsNetwork(topicById.get(button.dataset.topic));});
    for(const option of question.options){if(!option.value)continue;option.hidden=!supportsNetwork(topicById.get(option.value));option.disabled=option.hidden;}
    if(previous&&!supportsNetwork(topicById.get(previous))){choose('');return;}
    choose(search.value?resolveTopic(search.value)?.id||'':question.value,{typed:true});
  }
  network.addEventListener('change',filterTopics);
  search.addEventListener('input',()=>choose(resolveTopic(search.value)?.id||'',{typed:true}));question.addEventListener('change',()=>choose(question.value));
  root.querySelectorAll('[data-topic]').forEach(button=>button.addEventListener('click',()=>choose(button.dataset.topic)));
  subjectKind.addEventListener('change',()=>{referenceInput.hidden=subjectKind.value==='network';subjectValue.required=!referenceInput.hidden;if(subjectKind.value==='address'&&topicById.has('wallet_summary'))choose('wallet_summary');if(subjectKind.value==='transaction'&&topicById.has('transaction_analysis'))choose('transaction_analysis');controls();});subjectValue.addEventListener('input',controls);
  const messages={public_limit_reached:'The public request limit has been reached. Please try later.',public_task_not_found:'This request is no longer available. Choose a topic to start again.',same_origin_required:'Reload this portal to request an explanation.',approved_question_required:'Choose one of this portal’s topics.',invalid_request:'Choose a portal topic, response style and network.',invalid_research_mode:'Choose one of the available response styles.',invalid_chain_query:'Check the public reference and selected network.',invalid_subject:'Check the public reference and selected network.',public_subject_invalid:'Check the public reference and selected network.'};
  async function request(path,options={},version=generation){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);activeController=controller;
    try{
      const response=await fetch(path,{...options,signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error',headers:{'x-blochai-client':'public-v1',...(options.headers||{})}});
      let data;try{data=await response.json();}catch{throw new Error('The public assistant is unavailable. Please try later.');}
      if(!response.ok)throw new Error(messages[data.error]||'The public assistant is unavailable. Please try later.');if(version!==generation)throw new DOMException('Request canceled','AbortError');
      if(data.portal!==root.dataset.blochaiPortal||!/^[a-f0-9]{64}$/.test(data.task_id))throw new Error('The public assistant returned an invalid response.');return data;
    }finally{clearTimeout(timeout);if(activeController===controller)activeController=null;}
  }
  const node=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;};
  const bounded=(value,max=2000)=>typeof value==='string'?value.slice(0,max):'';
  function safeSource(source){
    if(!source||typeof source!=='object')return null;
    let url;try{url=new URL(source.url);if(url.protocol!=='https:'||url.username||url.password||url.port||url.hostname==='rednblue.space'||url.hostname.endsWith('.rednblue.space'))return null;}catch{return null;}
    return {id:bounded(source.id,100),title:bounded(source.title,200),url:url.href,retrieved_at:bounded(source.retrieved_at,80),observed_at:bounded(source.observed_at,80),coverage:bounded(source.coverage,2000),status:bounded(source.status,100)};
  }
  function guidance(data){
    const guide=data.guide;if(!guide||typeof guide!=='object'||guide.question_id!==current.question_id||guide.mode!==current.mode||guide.network!==current.network)throw new Error('The public assistant returned mismatched topic context.');
    const identity=value=>current.network==='bitcoin'&&current.subject?.kind!=='transaction'?value:String(value).toLowerCase();
    if(current.subject?guide.subject?.kind!==current.subject.kind||identity(guide.subject?.value)!==identity(current.subject.value):guide.subject!=null)throw new Error('The public assistant returned mismatched reference context.');
    const sources=Array.isArray(guide.sources)?guide.sources.slice(0,8).map(safeSource).filter(Boolean):[];
    const projectFacts=(items,limit)=>Array.isArray(items)?items.slice(0,limit).filter(fact=>fact&&typeof fact.label==='string'&&['string','number','boolean'].includes(typeof fact.value)).map(fact=>({label:bounded(fact.label,100),value:String(fact.value).slice(0,256),unit:bounded(fact.unit,60)})):[];
    const facts=projectFacts(guide.facts,48),derived_facts=projectFacts(guide.derived_facts,4);
    const insights=Array.isArray(guide.insights)?guide.insights.slice(0,8).filter(item=>item&&typeof item.id==='string'&&typeof item.title==='string'&&typeof item.text==='string'&&['available','partial','unavailable'].includes(item.status)&&Array.isArray(item.source_ids)&&item.source_ids.every(id=>sources.some(source=>source.id===id))).map(item=>({id:bounded(item.id,80),title:bounded(item.title,120),text:bounded(item.text,600),source_ids:item.source_ids.slice(0,6),status:item.status})):[];
    const knowledge=Array.isArray(guide.knowledge)?guide.knowledge.slice(0,8).filter(item=>item&&typeof item.text==='string').map(item=>({text:bounded(item.text),source_id:bounded(item.source_id,100)})):[];
    const transactions=Array.isArray(guide.transactions)?guide.transactions.slice(0,20).filter(item=>item&&typeof item==='object').map(item=>Object.fromEntries(['hash','from','to','amount','asset','timestamp','status'].map(key=>[key,String(item[key]??'').slice(0,200)]))):[];
    const graph={title:'Public observation graph',nodes:[],edges:[],coverage:bounded(guide.coverage)};
    if(guide.graph&&Array.isArray(guide.graph.nodes)&&Array.isArray(guide.graph.edges)){
      const ids=new Set();for(const item of guide.graph.nodes.slice(0,40)){if(!item||typeof item.id!=='string'||!item.id||item.id.length>200||ids.has(item.id))continue;ids.add(item.id);graph.nodes.push({id:item.id,label:bounded(item.label,200)||item.id,kind:bounded(item.kind,40)});}
      graph.edges=guide.graph.edges.slice(0,80).filter(item=>item&&ids.has(item.source)&&ids.has(item.target)).map(item=>({source:item.source,target:item.target,label:bounded(item.label,100)}));
      graph.title=bounded(guide.graph.title,200)||graph.title;graph.coverage=bounded(guide.graph.coverage)||graph.coverage;
    }
    return {sources,facts,derived_facts,insights,knowledge,transactions,graph,coverage:bounded(guide.coverage),observed_at:bounded(guide.observed_at,80),source_status:bounded(guide.status,100)};
  }
  function drawGraph(graph){
    const figure=node('figure','blochai-assistant__graph'),namespace='http://www.w3.org/2000/svg',svg=document.createElementNS(namespace,'svg');svg.setAttribute('viewBox','0 0 320 270');svg.setAttribute('role','img');svg.setAttribute('aria-label',`${graph.nodes.length} public references and ${graph.edges.length} observed connections`);
    const positions=new Map(graph.nodes.map((item,index)=>{const angle=index/Math.max(1,graph.nodes.length)*Math.PI*2-Math.PI/2;return [item.id,{x:160+105*Math.cos(angle),y:130+105*Math.sin(angle),number:index+1}];}));
    for(const edge of graph.edges){const a=positions.get(edge.source),b=positions.get(edge.target),line=document.createElementNS(namespace,'line');for(const [key,value]of Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y}))line.setAttribute(key,String(value));line.setAttribute('stroke','#a3b2a4');line.setAttribute('stroke-width','1');const title=document.createElementNS(namespace,'title');title.textContent=`${a.number} → ${b.number}${edge.label?': '+edge.label:''}`;line.append(title);svg.append(line);}
    for(const item of graph.nodes){const p=positions.get(item.id),circle=document.createElementNS(namespace,'circle');circle.setAttribute('cx',String(p.x));circle.setAttribute('cy',String(p.y));circle.setAttribute('r',graph.nodes.length>20?'7':'10');circle.setAttribute('fill',item.kind==='transaction'?'#2d5363':'#284f32');const title=document.createElementNS(namespace,'title');title.textContent=item.label;circle.append(title);svg.append(circle);const text=document.createElementNS(namespace,'text');text.setAttribute('x',String(p.x));text.setAttribute('y',String(p.y+3));text.setAttribute('text-anchor','middle');text.setAttribute('fill','#fff');text.setAttribute('font-size',graph.nodes.length>20?'7':'9');text.textContent=String(p.number);svg.append(text);}
    figure.append(svg,node('figcaption','',`${graph.nodes.length} references · ${graph.edges.length} observed connections. Layout does not imply ownership or value flow.`));
    const legend=node('details','blochai-assistant__context');legend.append(node('summary','','Graph references & connections'));const list=node('ol','');for(const item of graph.nodes)list.append(node('li','',`${item.label}${item.kind?' · '+item.kind:''}`));legend.append(list);const edges=node('ul','');for(const edge of graph.edges)edges.append(node('li','',`${positions.get(edge.source).number} → ${positions.get(edge.target).number}${edge.label?' · '+edge.label:''}`));legend.append(edges);figure.append(legend);return figure;
  }
  function saveBlob(contents,type,filename){const blob=new Blob([contents],{type}),url=URL.createObjectURL(blob),link=node('a','');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function exportData(turn,index,format){
    const filename=`blochai-${root.dataset.blochaiPortal}-${index+1}`;
    if(format==='json'){saveBlob(JSON.stringify({portal:root.dataset.blochaiPortal,classification:'PUBLIC',amount_units:amountUnits,transaction_amount_encoding:'Exact decimal integer strings in the base unit identified by asset; never whole-coin amounts.',...turn},null,2),'application/json',`${filename}.json`);return;}
    const fields=['record_type','label','value','unit','hash','from','to','amount_base_units','amount_unit','asset','timestamp','status','source_ids','source_id','source_title','source_url','observed_at','retrieved_at','coverage'];
    const rows=[...turn.facts.map(fact=>({record_type:'fact',...fact})),...turn.derived_facts.map(fact=>({record_type:'derived_fact',...fact})),...turn.insights.map(item=>({record_type:'insight',label:item.title,value:item.text,status:item.status,source_ids:item.source_ids.join(' '),coverage:item.source_ids.map(id=>turn.sources.find(source=>source.id===id)).filter(Boolean).map(source=>`${source.id}: ${source.coverage}`).join(' | ')})),...turn.transactions.map(tx=>({record_type:'transaction',...tx,amount_base_units:tx.amount,amount_unit:tx.amount?amountUnits[tx.asset]||'base units':''})),...turn.sources.map(source=>({record_type:'source',source_id:source.id,source_title:source.title,source_url:source.url,observed_at:source.observed_at,retrieved_at:source.retrieved_at,coverage:source.coverage,status:source.status}))];
    const cell=value=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
    saveBlob('\uFEFF'+[fields,...rows.map(row=>fields.map(field=>row[field]??''))].map(row=>row.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8',`${filename}.csv`);
  }
  function renderTurn(turn,index){
    const article=node('article','blochai-assistant__turn'),header=node('div','blochai-assistant__turn-heading');header.append(node('span','blochai-assistant__turn-number',String(index+1).padStart(2,'0')),node('h3','',turn.question));article.append(header);
    article.append(node('p','blochai-assistant__turn-meta',`${modeNames[turn.mode]} · ${networkNames[turn.network]} · ${new Date(turn.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`));
    if(turn.subject)article.append(node('p','blochai-assistant__subject',`${turn.subject.kind}: ${turn.subject.value}`));if(turn.answer_kind==='source_summary')article.append(node('p','blochai-assistant__answer-label','Source-based explanation'));article.append(node('div','blochai-assistant__output',turn.output));
    if(turn.facts.length){const details=node('details','blochai-assistant__context');details.open=true;details.append(node('summary','','Public source observations'));const list=node('dl','blochai-assistant__facts');for(const fact of turn.facts)list.append(node('dt','',fact.label),node('dd','',`${fact.value}${fact.unit?' '+fact.unit:''}`));details.append(list);article.append(details);}
    if(turn.insights.length){const details=node('details','blochai-assistant__context blochai-assistant__insights');details.open=true;details.append(node('summary','',`Computed readings (${turn.insights.length})`));for(const insight of turn.insights){const card=node('div','blochai-assistant__insight');card.append(node('h4','',insight.title),node('p','',insight.text));const titles=insight.source_ids.map(id=>turn.sources.find(source=>source.id===id)?.title||id);card.append(node('p','blochai-assistant__insight-source',`${insight.status==='available'?'Derived from the displayed sample':insight.status==='partial'?'Partial evidence':'Unavailable evidence'}${titles.length?' · '+titles.join('; '):''}`));details.append(card);}article.append(details);}
    if(turn.graph.nodes.length)article.append(drawGraph(turn.graph));
    if(turn.transactions.length){const details=node('details','blochai-assistant__context');details.append(node('summary','',`Transaction observations (${turn.transactions.length})`));for(const tx of turn.transactions){const row=node('dl','blochai-assistant__transaction');for(const field of ['hash','from','to','amount','asset','timestamp','status'])if(tx[field])row.append(node('dt','',field==='amount'?'Amount (base units)':field),node('dd','',field==='amount'?`${tx[field]} ${amountUnits[tx.asset]||'base units'}`:tx[field]));details.append(row);}article.append(details);}
    if(turn.knowledge.length){const details=node('details','blochai-assistant__context');details.append(node('summary','','Reference notes'));const list=node('ul','');for(const item of turn.knowledge){const point=node('li','',item.text),source=turn.sources.find(source=>source.id===item.source_id);if(source)point.append(node('span','blochai-assistant__reference',` Source: ${source.title}.`));list.append(point);}details.append(list);article.append(details);}
    if(turn.coverage)article.append(node('p','blochai-assistant__coverage',turn.coverage));
    if(turn.sources.length){const details=node('details','blochai-assistant__context');details.append(node('summary','',`Sources & coverage (${turn.sources.length})`));for(const source of turn.sources){const card=node('div','blochai-assistant__source'),link=node('a','',source.title||'Public source');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';card.append(link);if(source.status)card.append(node('span','blochai-assistant__source-status',source.status.replace(/_/g,' ')));if(source.retrieved_at)card.append(node('p','',`Retrieved: ${source.retrieved_at}`));if(source.observed_at)card.append(node('p','',`Observed: ${source.observed_at}`));if(source.coverage)card.append(node('p','',source.coverage));details.append(card);}article.append(details);}
    article.append(node('p','blochai-assistant__meta',turn.answer_kind==='source_summary'?'Assembled from reviewed notes and source observations.':`Model: ${turn.model}. Generated explanation; check the source observations and coverage.`));
    const dataActions=node('div','blochai-assistant__data-actions');for(const format of ['csv','json']){const button=node('button','',`Download ${format.toUpperCase()}`);button.type='button';button.addEventListener('click',()=>exportData(turn,index,format));dataActions.append(button);}article.append(dataActions);
    const followups=node('div','blochai-assistant__followups');followups.setAttribute('aria-label','Explore this topic further');
    for(const [style,label] of [['explain','Explain further'],['checklist','Make a checklist'],['example','Show an example'],['summary','Summarize']]){if(style===turn.mode)continue;const button=node('button','',label);button.type='button';button.dataset.followup=style;button.addEventListener('click',()=>{if(busy||history.length>=12)return;network.value=turn.network;filterTopics();choose(turn.question_id);mode.value=style;subjectKind.value=turn.subject?.kind||'network';subjectValue.value=turn.subject?.value||'';referenceInput.hidden=!turn.subject;subjectValue.required=!!turn.subject;start();});followups.append(button);}article.append(followups);return article;
  }
  function show(data,version){
    if(version!==generation)return;
    if(data.status==='COMPLETED'){
      if(typeof data.output!=='string'||!data.output.trim()||data.output.length>16384)throw new Error('The public assistant returned an invalid response.');
      const guide=guidance(data),turn={...current,...guide,question:topicById.get(current.question_id).question,output:data.output,answer_kind:data.answer_kind==='source_summary'?'source_summary':'model_output',model:bounded(data.model,200),created_at:new Date().toISOString()};history.push(turn);historyNode.append(renderTurn(turn,history.length-1));
      status.textContent=history.length===12?'Conversation complete. Download your PDF or clear to start a new conversation.':'Explanation complete. Explore a follow-up or choose another topic.';busy=false;job=null;ticket=null;current=null;stop();controls();historyNode.lastElementChild?.scrollIntoView({block:'nearest',behavior:'smooth'});
    }else if(data.status==='FAILED'){throw new Error('The explanation could not be completed. Please try later.');}
    else if(['PENDING','ASSIGNED','READY'].includes(data.status)){status.textContent='Building an explanation from this portal’s topic and public sources…';timer=setTimeout(()=>poll(version),2500);}else throw new Error('The public assistant returned an invalid response.');
  }
  function fail(error,version){if(version!==generation)return;stop();busy=false;job=null;ticket=null;current=null;status.textContent=error.name==='AbortError'?'The request timed out. Please try later.':error.message;controls();}
  async function poll(version){if(!job||!ticket||version!==generation)return;if(++polls>80){fail(new Error('This explanation is taking longer than expected. Please try later.'),version);return;}try{show(await request(`/api/blochai/tasks/${job}`,{headers:{'x-blochai-ticket':ticket}},version),version);}catch(error){fail(error,version);}}
  function validSubject(kind,value){
    if(kind==='network')return true;if(network.value==='bloch')return /^[a-fA-F0-9]{64}$/.test(value);if(network.value==='ethereum')return kind==='address'?/^0x[a-fA-F0-9]{40}$/.test(value):/^0x[a-fA-F0-9]{64}$/.test(value);
    return kind==='transaction'?/^[a-fA-F0-9]{64}$/.test(value):/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(value)||(/^bc1[ac-hj-np-z02-9]{11,87}$/i.test(value)&&(value===value.toLowerCase()||value===value.toUpperCase()));
  }
  async function start(){
    if(busy||history.length>=12||!supportsNetwork(topicById.get(question.value)))return;const value=subjectValue.value.trim();if(!validSubject(subjectKind.value,value)){status.textContent='Check the public reference format and selected network.';subjectValue.focus();return;}
    stop();busy=true;polls=0;job=null;ticket=null;search.value='';current={question_id:question.value,mode:mode.value,network:network.value,...(subjectKind.value!=='network'?{subject:{kind:subjectKind.value,value}}:{})};const version=generation;controls();status.textContent='Retrieving public context for your selected topic…';
    try{const data=await request('/api/blochai/tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(current)},version);if(!/^[a-f0-9]{64}$/.test(data.poll_token))throw new Error('The public assistant returned an invalid response.');job=data.task_id;ticket=data.poll_token;show(data,version);}catch(error){fail(error,version);}
  }
  form.addEventListener('submit',event=>{event.preventDefault();start();});
  function reset(){generation++;activeController?.abort();activeController=null;stop();job=null;ticket=null;current=null;busy=false;history=[];historyNode.replaceChildren();search.value='';subjectValue.value='';subjectKind.value='network';referenceInput.hidden=true;subjectValue.required=false;choose('');status.textContent='Conversation cleared. Choose a topic to begin.';controls();}
  clear.addEventListener('click',reset);
  exportButton.addEventListener('click',async()=>{
    if(!history.length||busy||exporting)return;const version=generation,snapshot=history.slice();exporting=true;controls();status.textContent='Preparing your PDF on this device…';
    try{const {downloadBlochAiPdf}=await import('/blochai-pdf/blochai-pdf.js');if(version!==generation)return;
      await downloadBlochAiPdf({portal:root.dataset.blochaiName,classification:'PUBLIC',generatedAt:new Date().toISOString(),exchanges:snapshot.map(turn=>({question:`${turn.question} (${modeNames[turn.mode]}; ${networkNames[turn.network]})${turn.subject?' · '+turn.subject.value:''}`,answer:turn.output,model:turn.answer_kind==='source_summary'?undefined:turn.model,createdAt:turn.created_at,sources:turn.sources,facts:[...turn.facts,...turn.derived_facts,...turn.insights.map(item=>({label:`Derived: ${item.title} (${item.status})`,value:item.text}))],coverage:turn.coverage,graph:turn.graph,transactions:turn.transactions})),provenance:'Public portal explanations use reviewed notes and bounded public observations. Computed readings describe the displayed sample and are separate from source observations. No private AML context is included. Source timestamps and coverage apply. This report does not independently verify records.'},{isCurrent:()=>version===generation&&history.length===snapshot.length});
      if(version===generation)status.textContent='PDF downloaded. It was created locally from this conversation.';
    }catch(error){if(version===generation)status.textContent='The PDF could not be created. Please try again.';}finally{exporting=false;controls();}
  });
  window.addEventListener('pagehide',reset);filterTopics();controls();
})();
