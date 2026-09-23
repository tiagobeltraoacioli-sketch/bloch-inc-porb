const status=document.getElementById('account-status');
const annotationStatus=document.getElementById('annotation-status');
const form=document.getElementById('annotation-form');
const submit=form.querySelector('button[type="submit"]');
const list=document.getElementById('annotation-list');
const walletInput=document.getElementById('wallet-ref');
const requestedWallet=new URLSearchParams(location.search).get('wallet');
if(requestedWallet&&requestedWallet.length<=200)walletInput.value=requestedWallet;
let signedIn=false;

async function api(path,options={}){
  const response=await fetch('/api/'+path,{credentials:'same-origin',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.method&&options.method!=='GET'?{'X-Graphus-Action':'1'}:{}),...(options.headers||{})}});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'request_failed');
  return data;
}
function setAccount(user){
  signedIn=Boolean(user);
  document.getElementById('account-profile').hidden=!user;
  document.getElementById('account-email').textContent=user?.email||'';
  submit.disabled=!user;
  status.textContent=user?'Your Graphus account is active. Notes stay private to this account.':'Sign in to create or access your account.';
  annotationStatus.textContent=user?'Your notes are private.':'Sign in to save notes.';
}
function renderNotes(items){
  list.replaceChildren();
  if(!items.length){const empty=document.createElement('p');empty.textContent='No private annotations yet.';list.append(empty);return;}
  items.forEach(note=>{
    const card=document.createElement('article');
    const time=document.createElement('span');time.textContent=note.updated_at;
    const title=document.createElement('h3');title.textContent=note.wallet_ref;
    const body=document.createElement('p');body.textContent=note.body;
    const remove=document.createElement('button');remove.type='button';remove.textContent='Delete note';
    remove.addEventListener('click',async()=>{
      if(!confirm('Delete this private note?'))return;
      try{await api('annotations/'+encodeURIComponent(note.id),{method:'DELETE'});await loadNotes();}
      catch(error){annotationStatus.textContent='Could not delete note: '+error.message;}
    });
    card.append(time,title,body,remove);list.append(card);
  });
}
async function loadNotes(){
  if(!signedIn){renderNotes([]);return;}
  try{const result=await api('annotations');renderNotes(result.items||[]);}
  catch(error){annotationStatus.textContent='Could not load notes: '+error.message;}
}
async function googleLogin(response){
  try{const result=await api('auth/google',{method:'POST',body:JSON.stringify({credential:response.credential})});setAccount(result.user);await loadNotes();}
  catch(error){status.textContent='Sign-in failed: '+error.message;}
}
async function initGoogle(clientId){
  const nonceResult=await api('auth/nonce');
  await new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
    script.onload=resolve;script.onerror=()=>reject(new Error('google_library_unavailable'));document.head.append(script);
  });
  google.accounts.id.initialize({client_id:clientId,nonce:nonceResult.nonce,callback:googleLogin,auto_select:false});
  google.accounts.id.renderButton(document.getElementById('google-button'),{theme:'outline',size:'large',shape:'rectangular',text:'continue_with'});
}
form.addEventListener('submit',async event=>{
  event.preventDefault();if(!signedIn)return;
  submit.disabled=true;
  try{
    await api('annotations',{method:'POST',body:JSON.stringify({wallet_ref:walletInput.value.trim(),body:document.getElementById('annotation-body').value})});
    document.getElementById('annotation-body').value='';annotationStatus.textContent='Private note saved.';await loadNotes();
  }catch(error){annotationStatus.textContent='Could not save note: '+error.message;}
  finally{submit.disabled=false;}
});
document.getElementById('sign-out').addEventListener('click',async()=>{
  try{await api('auth/logout',{method:'POST'});google.accounts.id.disableAutoSelect();setAccount(null);renderNotes([]);}
  catch(error){status.textContent='Could not sign out: '+error.message;}
});
(async()=>{
  try{
    const config=await api('config');
    if(!config.google_enabled){status.textContent='Account registration is pending the initial sign-in method. The public explorer remains available.';annotationStatus.textContent='Private notes will activate with account sign-in.';return;}
    const session=await api('session');setAccount(session.user);await loadNotes();await initGoogle(config.google_client_id);
  }catch(error){status.textContent='Account service is unavailable: '+error.message;}
})();
