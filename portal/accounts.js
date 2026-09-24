import {random,digest,equal,passwordHash,emailOf,validEmail,validPassword,requireValue,bodyOf,cookie,sessionToken,statement,budget,audit,admin,reauthenticate,SCOPES,json} from './security.js';

const roles=['admin','analyst','viewer'];
const sectors=['research','exchange','bank','government','market','other'];
export async function authRoute(path,request,env,principal){
  const db=env.PORB_DB,now=Date.now();
  if(path==='/auth/session'&&request.method==='GET'){
    if(!principal)return json({authenticated:false});
    requireValue(principal.type==='session','browser_session_required',403);
    const organizations=await statement(db,'SELECT t.id,t.name,t.sector,m.role FROM tenants t JOIN memberships m ON m.tenant_id=t.id WHERE m.user_id=? ORDER BY t.name',principal.id).all();
    return json({authenticated:true,user:{email:principal.email},organization:{id:principal.tenant_id,name:principal.tenant_name,role:principal.role},organizations:organizations.results});
  }
  if(path==='/auth/logout'&&request.method==='POST'){
    const token=sessionToken(request);if(token)await statement(db,'DELETE FROM sessions WHERE token_hash=?',await digest(token)).run();
    return json({authenticated:false},200,{'set-cookie':cookie('',request,0)});
  }
  if(['/auth/login','/auth/accept-invite','/auth/recover'].includes(path)&&request.method==='POST'){
    await budget(env,`auth-ip:${request.headers.get('cf-connecting-ip')||'local'}`,30);
    const body=await bodyOf(request),email=emailOf(body.email);
    requireValue(validEmail(email)&&validPassword(body.password),'email_and_14_to_128_character_password_required');
    await budget(env,`auth-email:${email}`,12);
    let user=await statement(db,'SELECT * FROM users WHERE email=?',email).first();
    let recovery=null,tenant=null,sessionInserted=false;
    const token=random(),tokenHash=await digest(token),expires=now+43200000;
    if(path==='/auth/accept-invite'){
      requireValue(typeof body.invitation==='string'&&/^[0-9a-f]{64}$/.test(body.invitation),'invalid_invitation',401);
      const invitation=await statement(db,'SELECT * FROM invitations WHERE token_hash=? AND email=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?',await digest(body.invitation),email,now).first();
      requireValue(invitation,'invalid_invitation',401);tenant=invitation.tenant_id;
      if(user)requireValue(equal(await passwordHash(body.password,user.salt,env.PORB_AUTH_PEPPER),user.password_hash),'invalid_credentials',401);
      const fresh=!user,nonce=random();
      if(fresh){const salt=random();recovery=random();user={id:crypto.randomUUID(),email,salt,password_hash:await passwordHash(body.password,salt,env.PORB_AUTH_PEPPER),recovery_hash:await digest(recovery)};}
      const batch=[fresh?statement(db,'UPDATE invitations SET used_at=?,claim_nonce=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?',now,nonce,invitation.id,now):statement(db,'UPDATE invitations SET used_at=?,claim_nonce=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM users WHERE id=? AND password_hash=?)',now,nonce,invitation.id,now,user.id,user.password_hash)];
      if(fresh)batch.push(statement(db,'INSERT INTO users(id,email,password_hash,salt,recovery_hash,created_at) SELECT ?,?,?,?,?,? FROM invitations WHERE id=? AND claim_nonce=?',user.id,email,user.password_hash,user.salt,user.recovery_hash,now,invitation.id,nonce));
      batch.push(statement(db,'INSERT INTO memberships(tenant_id,user_id,role) SELECT tenant_id,?,role FROM invitations WHERE id=? AND claim_nonce=? ON CONFLICT(tenant_id,user_id) DO NOTHING',user.id,invitation.id,nonce));
      batch.push(statement(db,'INSERT INTO sessions(token_hash,user_id,tenant_id,expires_at,created_at) SELECT ?,?,tenant_id,?,? FROM invitations WHERE id=? AND claim_nonce=?',tokenHash,user.id,expires,now,invitation.id,nonce));
      const results=await db.batch(batch);requireValue(results.at(-1).meta.changes===1,'invitation_already_used',409);sessionInserted=true;
      await audit(db,{id:user.id,tenant_id:tenant},'invitation.accept',invitation.id).run();
    }else if(path==='/auth/recover'){
      const recoveryHash=await digest(typeof body.recovery==='string'?body.recovery:'');
      requireValue(user&&equal(recoveryHash,user.recovery_hash),'invalid_credentials',401);
      const member=await statement(db,'SELECT tenant_id FROM memberships WHERE user_id=? ORDER BY tenant_id LIMIT 1',user.id).first();requireValue(member,'invalid_credentials',401);tenant=member.tenant_id;
      const salt=random();recovery=random();const nextRecovery=await digest(recovery),hash=await passwordHash(body.password,salt,env.PORB_AUTH_PEPPER);
      const results=await db.batch([
        statement(db,'UPDATE users SET password_hash=?,salt=?,recovery_hash=? WHERE id=? AND recovery_hash=?',hash,salt,nextRecovery,user.id,recoveryHash),
        statement(db,'DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND recovery_hash=?)',user.id,user.id,nextRecovery),
        statement(db,'UPDATE api_keys SET revoked_at=? WHERE created_by=? AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM users WHERE id=? AND recovery_hash=?)',now,user.id,user.id,nextRecovery),
        statement(db,'INSERT INTO sessions(token_hash,user_id,tenant_id,expires_at,created_at) SELECT ?,id,?,?,? FROM users WHERE id=? AND recovery_hash=?',tokenHash,tenant,expires,now,user.id,nextRecovery)
      ]);requireValue(results.at(-1).meta.changes===1,'invalid_credentials',401);sessionInserted=true;
      await audit(db,{id:user.id,tenant_id:tenant},'account.recover',user.id).run();
    }else{
      const candidate=await passwordHash(body.password,user?.salt||'0'.repeat(64),env.PORB_AUTH_PEPPER);
      requireValue(user&&equal(candidate,user.password_hash),'invalid_credentials',401);
      const member=await statement(db,'SELECT tenant_id FROM memberships WHERE user_id=? ORDER BY tenant_id LIMIT 1',user.id).first();requireValue(member,'invalid_credentials',401);tenant=member.tenant_id;
    }
    if(!sessionInserted){
      const inserted=await statement(db,'INSERT INTO sessions(token_hash,user_id,tenant_id,expires_at,created_at) SELECT ?,id,?,?,? FROM users WHERE id=? AND password_hash=?',tokenHash,tenant,expires,now,user.id,user.password_hash).run();requireValue(inserted.meta.changes===1,'invalid_credentials',401);
      await audit(db,{id:user.id,tenant_id:tenant},'account.login',user.id).run();
    }
    const previous=sessionToken(request);if(previous)await statement(db,'DELETE FROM sessions WHERE token_hash=?',await digest(previous)).run();
    return json({authenticated:true,recovery_code:recovery},200,{'set-cookie':cookie(token,request)});
  }
  if(path==='/auth/organization'&&request.method==='POST'){
    requireValue(principal?.type==='session','authentication_required',401);
    const body=await bodyOf(request),member=typeof body.id==='string'?await statement(db,'SELECT tenant_id FROM memberships WHERE user_id=? AND tenant_id=?',principal.id,body.id).first():null;
    requireValue(member,'organization_unavailable',404);
    const token=random();await db.batch([statement(db,'DELETE FROM sessions WHERE token_hash=?',await digest(sessionToken(request))),statement(db,'INSERT INTO sessions(token_hash,user_id,tenant_id,expires_at,created_at) VALUES(?,?,?,?,?)',await digest(token),principal.id,member.tenant_id,now+43200000,now)]);
    return json({switched:true},200,{'set-cookie':cookie(token,request)});
  }
  if(path==='/auth/password'&&request.method==='POST'){
    requireValue(principal?.type==='session','authentication_required',401);
    const body=await bodyOf(request);requireValue(validPassword(body.new_password),'new_password_14_to_128_characters_required');
    const current=await reauthenticate(env,principal,body.password);
    const salt=random(),recovery=random(),nextHash=await passwordHash(body.new_password,salt,env.PORB_AUTH_PEPPER),nextRecovery=await digest(recovery),token=random();
    const results=await db.batch([
      statement(db,'UPDATE users SET password_hash=?,salt=?,recovery_hash=? WHERE id=? AND password_hash=?',nextHash,salt,nextRecovery,principal.id,current.password_hash),
      statement(db,'DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND recovery_hash=?)',principal.id,principal.id,nextRecovery),
      statement(db,'UPDATE api_keys SET revoked_at=? WHERE created_by=? AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM users WHERE id=? AND recovery_hash=?)',now,principal.id,principal.id,nextRecovery),
      statement(db,'INSERT INTO sessions(token_hash,user_id,tenant_id,expires_at,created_at) SELECT ?,id,?,?,? FROM users WHERE id=? AND recovery_hash=?',await digest(token),principal.tenant_id,now+43200000,now,principal.id,nextRecovery)
    ]);requireValue(results.at(-1).meta.changes===1,'credentials_changed_retry',409);
    await audit(db,principal,'account.password_change',principal.id).run();return json({changed:true,recovery_code:recovery},200,{'set-cookie':cookie(token,request)});
  }
  return null;
}

export async function adminRoute(path,request,env,principal){
  if(!['/invitations','/keys','/members','/organizations','/audit'].some(prefix=>path===prefix||path.startsWith(prefix+'/')))return null;
  admin(principal);const db=env.PORB_DB,now=Date.now();
  if(path==='/audit'&&request.method==='GET')return json({events:(await statement(db,'SELECT actor_id,action,resource_id,created_at FROM audit WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100',principal.tenant_id).all()).results});
  if(path==='/members'&&request.method==='GET')return json({members:(await statement(db,'SELECT u.id,u.email,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=? ORDER BY u.email',principal.tenant_id).all()).results});
  if(path==='/invitations'&&request.method==='GET')return json({invitations:(await statement(db,'SELECT id,email,role,created_at,expires_at,used_at,revoked_at FROM invitations WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100',principal.tenant_id).all()).results});
  if(path==='/keys'&&request.method==='GET')return json({keys:(await statement(db,'SELECT id,label,prefix,scopes_json,created_at,expires_at,revoked_at,last_used_at FROM api_keys WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100',principal.tenant_id).all()).results.map(k=>({...k,scopes:JSON.parse(k.scopes_json),scopes_json:undefined}))});
  if(path==='/invitations'&&request.method==='POST'){
    const body=await bodyOf(request),email=emailOf(body.email);requireValue(validEmail(email)&&roles.includes(body.role),'invalid_invitation');
    if(body.role==='admin')admin(principal,true);await reauthenticate(env,principal,body.password);
    await budget(env,`invites:${principal.tenant_id}`,50,86400);
    const exists=await statement(db,'SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.tenant_id=? AND u.email=?',principal.tenant_id,email).first();requireValue(!exists,'already_a_member',409);
    const id=crypto.randomUUID(),token=random(),expires=now+48*3600000;
    await db.batch([statement(db,'UPDATE invitations SET revoked_at=? WHERE tenant_id=? AND email=? AND used_at IS NULL AND revoked_at IS NULL',now,principal.tenant_id,email),statement(db,'INSERT INTO invitations(id,tenant_id,email,role,token_hash,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)',id,principal.tenant_id,email,body.role,await digest(token),principal.id,now,expires),audit(db,principal,'invitation.create',id)]);
    return json({id,email,expires_at:expires,invitation_url:`${new URL(request.url).origin}/portal/#invite=${token}`,delivery:'Copy this private link and share it with the invited email holder.'},201);
  }
  if(path==='/keys'&&request.method==='POST'){
    const body=await bodyOf(request);
    requireValue(typeof body.label==='string'&&body.label.trim().length>=2&&body.label.length<=80&&Array.isArray(body.scopes)&&body.scopes.length>0&&body.scopes.length<=4&&body.scopes.every(s=>SCOPES.includes(s))&&Number.isInteger(body.days)&&body.days>=1&&body.days<=90,'invalid_key_parameters');
    await reauthenticate(env,principal,body.password);await budget(env,`keys:${principal.tenant_id}`,20,86400);
    const id=crypto.randomUUID(),token=`porb_${random()}`,expires=now+body.days*86400000,scopes=[...new Set(body.scopes)];
    await db.batch([statement(db,'INSERT INTO api_keys(id,tenant_id,created_by,label,prefix,key_hash,scopes_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)',id,principal.tenant_id,principal.id,body.label.trim(),token.slice(0,13),await digest(token),JSON.stringify(scopes),now,expires),audit(db,principal,'key.create',id)]);
    return json({id,key:token,scopes,expires_at:expires,display:'Displayed once. Store the key securely.'},201);
  }
  const removal=path.match(/^\/(keys|invitations|members)\/([0-9a-f-]{36})$/);
  if(removal&&request.method==='DELETE'){
    const body=await bodyOf(request);await reauthenticate(env,principal,body.password);
    const [,type,id]=removal;let operation;
    if(type==='members'){
      admin(principal,true);requireValue(id!==principal.id,'cannot_remove_self');
      const member=await statement(db,'SELECT role FROM memberships WHERE tenant_id=? AND user_id=?',principal.tenant_id,id).first();requireValue(member&&member.role!=='owner','member_unavailable',404);
      await db.batch([statement(db,'DELETE FROM memberships WHERE tenant_id=? AND user_id=?',principal.tenant_id,id),statement(db,'DELETE FROM sessions WHERE tenant_id=? AND user_id=?',principal.tenant_id,id),statement(db,'UPDATE api_keys SET revoked_at=? WHERE tenant_id=? AND created_by=? AND revoked_at IS NULL',now,principal.tenant_id,id),audit(db,principal,'member.remove',id)]);
    }else{
      operation=type==='keys'?statement(db,'UPDATE api_keys SET revoked_at=? WHERE id=? AND tenant_id=? AND revoked_at IS NULL',now,id,principal.tenant_id):statement(db,'UPDATE invitations SET revoked_at=? WHERE id=? AND tenant_id=? AND used_at IS NULL AND revoked_at IS NULL',now,id,principal.tenant_id);
      const result=await operation.run();requireValue(result.meta.changes===1,'resource_unavailable',404);await audit(db,principal,`${type}.revoke`,id).run();
    }
    return json({revoked:true});
  }
  if(path==='/organizations'&&request.method==='POST'){
    admin(principal,true);const body=await bodyOf(request);requireValue(typeof body.name==='string'&&body.name.trim().length>=2&&body.name.length<=100&&sectors.includes(body.sector),'invalid_organization');await reauthenticate(env,principal,body.password);await budget(env,`organizations:${principal.id}`,10,86400);
    const id=crypto.randomUUID();await db.batch([statement(db,'INSERT INTO tenants(id,name,sector,created_at) VALUES(?,?,?,?)',id,body.name.trim(),body.sector,now),statement(db,'INSERT INTO memberships(tenant_id,user_id,role) VALUES(?,?,?)',id,principal.id,'owner'),audit(db,{...principal,tenant_id:id},'organization.create',id)]);
    return json({id,name:body.name.trim()},201);
  }
  return null;
}
