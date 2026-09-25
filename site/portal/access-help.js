export function invitationToken(value,origin){
  const input=typeof value==='string'?value.trim():'';
  if(/^[0-9a-f]{64}$/.test(input))return input;
  let url;try{url=new URL(input);}catch{throw new Error('Paste the complete private invitation link supplied by your administrator.');}
  const allowed=new Set([origin,'https://rednblue.space','https://rednblue-space.pages.dev']);
  const params=new URLSearchParams(url.hash.slice(1)),token=params.get('invite');
  if(!allowed.has(url.origin)||url.username||url.password||!['/portal','/portal/'].includes(url.pathname)||url.search||[...params.keys()].some(key=>key!=='invite')||params.getAll('invite').length!==1||!/^[0-9a-f]{64}$/.test(token||''))throw new Error('Use a rednblue.space portal invitation link with one valid invitation token.');
  return token;
}

export function accessFailure(path,code,status,authenticated){
  const administrative=['/invitations','/keys','/organizations'].includes(path)||/^\/(keys|invitations|members)\/[0-9a-f-]{36}$/.test(path);
  const confirmationFailure=Boolean(authenticated&&administrative&&code==='invalid_credentials');
  let message=(code||`Request failed (${status})`).replaceAll('_',' ');
  if(code==='invalid_credentials'){
    if(path==='/auth/login')message='Email or password not recognized. First visit? Open your private invitation link to create your account before signing in.';
    else if(path==='/auth/accept-invite')message='This email already has a portal account. Enter its existing password, or recover access with its saved recovery code.';
    else if(path==='/auth/recover')message='Email or recovery code not recognized. Use the saved recovery code for this portal account.';
    else if(path==='/invitations')message='Enter your own current administrator password to authorize the invitation. The invited person creates their own password when accepting the link.';
    else if(path==='/auth/password'||administrative)message='Your current portal password was not recognized. Enter your own current password to confirm this action.';
  }
  if(code==='invalid_invitation'||code==='invitation_already_used')message='This invitation cannot be accepted. Check the invited email and original link. If it was accepted already, sign in with your portal password; if it expired or was replaced, ask the administrator for a new link.';
  if(code==='rate_limit')message='Too many attempts. Wait before trying again; repeated attempts will not change the password or invitation.';
  return {message,showLogin:status===401&&!path.startsWith('/auth')&&!confirmationFailure};
}
