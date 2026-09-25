import test from 'node:test';
import assert from 'node:assert/strict';
import {invitationToken,accessFailure} from '../site/portal/access-help.js';

const token='a1'.repeat(32),origin='https://rednblue.space';
test('invitation parser accepts exact portal links and raw tokens without fetching',()=>{
  for(const input of [token,` ${origin}/portal/#invite=${token} `,`https://rednblue-space.pages.dev/portal#invite=${token}`])assert.equal(invitationToken(input,origin),token);
  assert.equal(invitationToken(`http://127.0.0.1:4174/portal/#invite=${token}`,'http://127.0.0.1:4174'),token);
});
test('invitation parser rejects foreign links, embedded credentials, query tokens and ambiguous fragments',()=>{
  for(const input of [null,'invalid',token.toUpperCase(),`https://attacker.example/portal/#invite=${token}`,`https://user:secret@rednblue.space/portal/#invite=${token}`,`${origin}/other/#invite=${token}`,`${origin}/portal/?invite=${token}`,`${origin}/portal/?x=1#invite=${token}`,`${origin}/portal/#invite=${token}&invite=${token}`,`${origin}/portal/#invite=${token}&other=1`,`javascript:alert(1)`])assert.throws(()=>invitationToken(input,origin));
});
test('administrator password confirmation failure does not dismiss a valid session',()=>{
  for(const path of ['/invitations','/keys','/organizations','/invitations/'+'a'.repeat(36),'/keys/'+'b'.repeat(36),'/members/'+'c'.repeat(36)])assert.equal(accessFailure(path,'invalid_credentials',401,true).showLogin,false);
  assert.match(accessFailure('/invitations','invalid_credentials',401,true).message,/your own current administrator password/);
});
test('missing authentication and unknown unauthorized resources still return to login',()=>{
  for(const [path,code,present] of [['/invitations','authentication_required',true],['/keys','authentication_required',false],['/v1/analyses','invalid_credentials',true],['/invitations','invalid_credentials',false]])assert.equal(accessFailure(path,code,401,present).showLogin,true);
});
test('public login remains generic while guiding first-time invitation acceptance',()=>{
  const result=accessFailure('/auth/login','invalid_credentials',401,false);assert.equal(result.showLogin,false);assert.match(result.message,/Email or password not recognized/);assert.match(result.message,/invitation link/);assert.doesNotMatch(result.message,/does not exist|already has/);
});
test('existing invited account and recovery messages describe the correct secret',()=>{
  assert.match(accessFailure('/auth/accept-invite','invalid_credentials',401,false).message,/existing password/);
  assert.match(accessFailure('/auth/recover','invalid_credentials',401,false).message,/recovery code/);
  assert.match(accessFailure('/auth/password','invalid_credentials',401,true).message,/current portal password/);
});
test('invalid invitation and rate limits have actionable, non-authorizing explanations',()=>{
  assert.match(accessFailure('/auth/accept-invite','invalid_invitation',401,false).message,/invited email and original link/);
  assert.match(accessFailure('/auth/accept-invite','invitation_already_used',409,false).message,/sign in/);
  assert.match(accessFailure('/auth/login','rate_limit',429,false).message,/Wait/);
});
