(()=>{
  'use strict';
  const root=document.querySelector('.blochai-assistant');if(!root)return;
  const select=selector=>root.querySelector(selector),trigger=select('.blochai-assistant__trigger'),panel=select('.blochai-assistant__panel'),form=select('form'),question=select('select'),submit=select('.blochai-assistant__submit'),status=select('.blochai-assistant__status'),output=select('.blochai-assistant__output'),meta=select('.blochai-assistant__meta');
  let ticket=null,job=null,timer=null,polls=0,busy=false,activeController=null,generation=0;
  const stop=()=>{clearTimeout(timer);timer=null;};
  const controls=()=>{submit.disabled=busy;question.disabled=busy;};
  function open(value){panel.hidden=!value;trigger.setAttribute('aria-expanded',String(value));if(value)question.focus();else trigger.focus();}
  trigger.addEventListener('click',()=>open(panel.hidden));select('.blochai-assistant__close').addEventListener('click',()=>open(false));
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){open(false);event.preventDefault();}});
  const messages={public_limit_reached:'The public request limit has been reached. Please try later.',public_task_not_found:'This request is no longer available. Choose a question to start again.',same_origin_required:'Reload this portal to request an explanation.',approved_question_required:'Choose one of this portal’s questions.'};
  async function request(path,options={}){
    const controller=new AbortController(),version=generation,timeout=setTimeout(()=>controller.abort(),15000);activeController=controller;
    try{const response=await fetch(path,{...options,signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error',headers:{'x-blochai-client':'public-v1',...(options.headers||{})}});let data;try{data=await response.json();}catch{throw new Error('The public assistant is unavailable. Please try later.');}if(!response.ok)throw new Error(messages[data.error]||'The public assistant is unavailable. Please try later.');if(version!==generation)throw new DOMException('Request canceled','AbortError');if(data.portal!==root.dataset.blochaiPortal||!/^[a-f0-9]{64}$/.test(data.task_id))throw new Error('The public assistant returned an invalid response.');return data;}finally{clearTimeout(timeout);if(activeController===controller)activeController=null;}
  }
  function show(data){
    if(data.status==='COMPLETED'){
      if(typeof data.output!=='string')throw new Error('The public assistant returned an invalid response.');
      output.textContent=data.output;output.hidden=false;meta.textContent=`Model: ${data.model}. Public explanation, not live analysis.`;meta.hidden=false;status.textContent='Explanation complete. Check the portal’s sources and coverage for current records.';busy=false;job=null;ticket=null;stop();controls();
    }else if(data.status==='FAILED'){throw new Error('The explanation could not be completed. Please try later.');}
    else if(['PENDING','ASSIGNED','READY'].includes(data.status)){
      status.textContent='Your portal question is being processed on the GPU service…';timer=setTimeout(poll,2500);
    }else throw new Error('The public assistant returned an invalid response.');
  }
  function fail(error){stop();busy=false;job=null;ticket=null;status.textContent=error.name==='AbortError'?'The request timed out. Please try later.':error.message;controls();}
  async function poll(){
    if(!job||!ticket)return;
    if(++polls>80){fail(new Error('This explanation is taking longer than expected. Please try later.'));return;}
    try{show(await request(`/api/blochai/tasks/${job}`,{headers:{'x-blochai-ticket':ticket}}));}catch(error){fail(error);}
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;stop();busy=true;polls=0;job=null;ticket=null;output.textContent='';output.hidden=true;meta.textContent='';meta.hidden=true;controls();status.textContent='Requesting an explanation for this portal…';
    try{const data=await request('/api/blochai/tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question_id:question.value})});if(!/^[a-f0-9]{64}$/.test(data.poll_token))throw new Error('The public assistant returned an invalid response.');job=data.task_id;ticket=data.poll_token;show(data);}catch(error){fail(error);}
  });
  window.addEventListener('pagehide',()=>{generation++;activeController?.abort();activeController=null;stop();job=null;ticket=null;busy=false;controls();output.textContent='';output.hidden=true;meta.textContent='';meta.hidden=true;status.textContent='Choose a portal question to start again.';});
})();
