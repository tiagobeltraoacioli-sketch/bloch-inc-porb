// Retry timing belongs to the live session, never to a saved report or bundle.
export function watchResearchCooldown(root,client,signal,update){
  if(!client)return ()=>{};
  let unsubscribe;
  const dispose=()=>{unsubscribe?.();signal?.removeEventListener('abort',dispose);};
  unsubscribe=client.subscribe(state=>{if(root.isConnected&&!signal?.aborted)update(state);else dispose();});
  signal?.addEventListener('abort',dispose,{once:true});return dispose;
}
export function mountResearchCooldown(form,client){
  const root=document.createElement('div'),message=document.createElement('p'),count=document.createElement('span'),button=form.querySelector('button[type=submit],button');
  root.className='ar-request-wait';root.dataset.researchWait='';root.hidden=true;message.setAttribute('role','status');count.setAttribute('aria-hidden','true');root.append(message,count);form.after(root);
  let shownUntil=0;
  const sync=state=>{
    state??=client.snapshot();root.hidden=!state.remaining;button.disabled=!!state.remaining;
    if(state.remaining){if(shownUntil!==state.until){shownUntil=state.until;message.textContent=`The service asked for a pause. Try again after ${new Date(state.until).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'})}. Existing captures and downloads remain available. Address research resumes only when you search or update.`;}count.textContent=`${state.remaining} s remaining`;}
    else if(shownUntil){shownUntil=0;message.textContent='The wait has ended. Search or update when you are ready.';count.textContent='';}
  };
  watchResearchCooldown(root,client,null,sync);return {sync:()=>sync()};
}
