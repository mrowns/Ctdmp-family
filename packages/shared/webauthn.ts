import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
 generateAuthenticationOptions,
 generateRegistrationOptions,
 verifyAuthenticationResponse,
 verifyRegistrationResponse,
 type AuthenticationResponseJSON,
 type RegistrationResponseJSON,
 type WebAuthnCredential,
} from '@simplewebauthn/server';
import { pool, tx } from '../db/index.ts';
import { config } from './config.ts';
import { DomainError } from './domain.ts';
import { digest, randomToken } from '../integrations/crypto.ts';

export type AuthenticatedMember={id:string;organization_id:string;display_name:string;branch_id:string|null;session_digest:string;session_kind:'fixture'|'member';credential_id:string|null};
const BROWSER_TOKEN=/^[A-Za-z0-9_-]{43}$/;
const validBrowser=(browser:string)=>BROWSER_TOKEN.test(browser);
function originConfig(){return {rpID:config.WEBAUTHN_RP_ID,rpName:config.WEBAUTHN_RP_NAME,origin:new URL(config.WEBAUTHN_ORIGIN).origin};}
async function requireRecentAuthentication(c:any,actor:AuthenticatedMember) {
 const valid=(await c.query(`SELECT 1 FROM authentication_verifications v
  WHERE v.session_kind=$1 AND v.session_digest=$2 AND v.member_id=$3 AND v.verified_at>now()-interval '15 minutes'
  AND ((v.session_kind='fixture' AND EXISTS(SELECT 1 FROM fixture_sessions s WHERE s.digest=v.session_digest AND s.member_id=v.member_id AND NOT s.revoked AND s.expires_at>now()))
    OR (v.session_kind='member' AND EXISTS(SELECT 1 FROM member_sessions s WHERE s.digest=v.session_digest AND s.member_id=v.member_id AND NOT s.revoked AND s.expires_at>now())))`,[actor.session_kind,actor.session_digest,actor.id])).rowCount;
 if(!valid)throw new DomainError('RECENT_AUTHENTICATION_REQUIRED',403);
}
function assertBrowser(browser:string){if(!validBrowser(browser))throw new DomainError('AUTHENTICATION_REQUIRED',401);}
async function storeChallenge(c:any,purpose:'REGISTRATION'|'LOGIN',memberId:string|null,browser:string,challenge:string) {
 const challengeId=randomToken();
 await c.query('INSERT INTO webauthn_challenges(id_digest,purpose,member_id,browser_digest,challenge,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval \'5 minutes\')',[digest(challengeId),purpose,memberId,digest(browser),challenge]);
 return challengeId;
}
export async function registrationOptions(actor:AuthenticatedMember,browser:string,label:string) {
 assertBrowser(browser);
 const cleanLabel=label.trim();
 if(cleanLabel.length<1||cleanLabel.length>80||/[\r\n\u0000-\u001f]/.test(cleanLabel))throw new DomainError('INVALID_CREDENTIAL_LABEL',422);
 return tx(async c=>{
  const member=(await c.query('SELECT id,display_name FROM members WHERE id=$1 AND organization_id=$2 AND active FOR SHARE',[actor.id,actor.organization_id])).rows[0];
  if(!member)throw new DomainError('AUTHENTICATION_REQUIRED',401);
  await requireRecentAuthentication(c,actor);
  let account=(await c.query('SELECT user_handle FROM webauthn_users WHERE member_id=$1 FOR UPDATE',[actor.id])).rows[0];
  if(!account){
   const handle=randomBytes(32);
   await c.query('INSERT INTO webauthn_users(member_id,user_handle) VALUES($1,$2) ON CONFLICT(member_id) DO NOTHING',[actor.id,handle]);
   account=(await c.query('SELECT user_handle FROM webauthn_users WHERE member_id=$1 FOR UPDATE',[actor.id])).rows[0];
  }
  const existing=(await c.query('SELECT credential_id,transports FROM webauthn_credentials WHERE member_id=$1 AND revoked_at IS NULL ORDER BY created_at',[actor.id])).rows;
  const {rpID,rpName}=originConfig();
  const options=await generateRegistrationOptions({
   rpName,rpID,userID:new Uint8Array(account.user_handle),userName:member.display_name,userDisplayName:member.display_name,
   attestationType:'none',timeout:60000,excludeCredentials:existing.map((row:any)=>({id:row.credential_id,transports:row.transports})),
   authenticatorSelection:{residentKey:'required',requireResidentKey:true,userVerification:'required'},
  });
  const challengeId=await storeChallenge(c,'REGISTRATION',actor.id,browser,options.challenge);
  return {challengeId,options};
 });
}
async function consumeChallenge(c:any,id:string,purpose:'REGISTRATION'|'LOGIN',browser:string,memberId?:string) {
 const row=(await c.query(`SELECT * FROM webauthn_challenges WHERE id_digest=$1 AND purpose=$2 AND browser_digest=$3
  AND ($4::text IS NULL OR member_id=$4) AND consumed_at IS NULL AND expires_at>now() FOR UPDATE`,[digest(id),purpose,digest(browser),memberId??null])).rows[0];
 if(!row)throw new DomainError('WEBAUTHN_CHALLENGE_INVALID',401);
 await c.query('UPDATE webauthn_challenges SET consumed_at=now() WHERE id_digest=$1',[row.id_digest]);
 return row;
}
export async function verifyRegistration(actor:AuthenticatedMember,browser:string,challengeId:string,response:RegistrationResponseJSON,label:string) {
 assertBrowser(browser);
 const cleanLabel=label.trim();
 if(cleanLabel.length<1||cleanLabel.length>80||/[\r\n\u0000-\u001f]/.test(cleanLabel))throw new DomainError('INVALID_CREDENTIAL_LABEL',422);
 const outcome=await tx(async c=>{
  const member=(await c.query('SELECT id FROM members WHERE id=$1 AND organization_id=$2 AND active FOR SHARE',[actor.id,actor.organization_id])).rowCount;
  if(!member)throw new DomainError('AUTHENTICATION_REQUIRED',401);
  await requireRecentAuthentication(c,actor);
  const challenge=await consumeChallenge(c,challengeId,'REGISTRATION',browser,actor.id);
  let verification;
  try {
   verification=await verifyRegistrationResponse({response,expectedChallenge:challenge.challenge,expectedOrigin:originConfig().origin,expectedRPID:originConfig().rpID,requireUserVerification:true});
  } catch { return false; }
  if(!verification.verified||!verification.registrationInfo.userVerified)return false;
  const credential=verification.registrationInfo.credential;
  if(credential.id!==response.id||!credential.publicKey?.byteLength)return false;
  const exists=(await c.query('SELECT 1 FROM webauthn_credentials WHERE credential_id=$1',[credential.id])).rowCount;
  if(exists)return false;
  const user=(await c.query('SELECT user_handle FROM webauthn_users WHERE member_id=$1',[actor.id])).rows[0];
  if(!user)return false;
  await c.query(`INSERT INTO webauthn_credentials(credential_id,management_id,member_id,public_key,sign_count,transports,device_type,backed_up,label)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[credential.id,randomToken(),actor.id,Buffer.from(credential.publicKey),credential.counter,credential.transports??[],verification.registrationInfo.credentialDeviceType,verification.registrationInfo.credentialBackedUp,cleanLabel]);
  await c.query("INSERT INTO audit_logs(actor,action,resource_id,details) VALUES($1,'passkey.created',$1,$2)",[actor.id,{label:cleanLabel,deviceType:verification.registrationInfo.credentialDeviceType,backedUp:verification.registrationInfo.credentialBackedUp}]);
  return true;
 });
 if(!outcome)throw new DomainError('WEBAUTHN_RESPONSE_INVALID',401);
 return {created:true};
}
export async function authenticationOptions(browser:string) {
 assertBrowser(browser);
 return tx(async c=>{
  const recent=Number((await c.query("SELECT count(*)::int AS total FROM webauthn_challenges WHERE purpose='LOGIN' AND browser_digest=$1 AND created_at>now()-interval '15 minutes'",[digest(browser)])).rows[0].total);
  if(recent>=8)throw new DomainError('AUTHENTICATION_RATE_LIMITED',429);
  const {rpID}=originConfig();
  const options=await generateAuthenticationOptions({rpID,userVerification:'required',timeout:60000});
  const challengeId=await storeChallenge(c,'LOGIN',null,browser,options.challenge);
  return {challengeId,options};
 });
}
export async function verifyAuthentication(browser:string,challengeId:string,response:AuthenticationResponseJSON) {
 assertBrowser(browser);
 const outcome=await tx(async c=>{
  const challenge=await consumeChallenge(c,challengeId,'LOGIN',browser);
  const row=(await c.query(`SELECT c.*,m.organization_id,m.display_name,m.branch_id,m.active,u.user_handle
   FROM webauthn_credentials c JOIN members m ON m.id=c.member_id JOIN webauthn_users u ON u.member_id=m.id
   WHERE c.credential_id=$1 AND c.revoked_at IS NULL FOR UPDATE OF c,m`,[response.id])).rows[0];
  if(!row||!row.active)return undefined;
  if(!response.response.userHandle)return undefined;
  const returnedHandle=Buffer.from(response.response.userHandle,'base64url');
  const storedHandle=Buffer.from(row.user_handle);
  if(returnedHandle.length!==storedHandle.length||!timingSafeEqual(returnedHandle,storedHandle))return undefined;
  const credential:WebAuthnCredential={id:row.credential_id,publicKey:new Uint8Array(row.public_key),counter:Number(row.sign_count),transports:row.transports};
  let verification;
  try {
   verification=await verifyAuthenticationResponse({response,expectedChallenge:challenge.challenge,expectedOrigin:originConfig().origin,expectedRPID:originConfig().rpID,credential,requireUserVerification:true});
  } catch { return undefined; }
  if(!verification.verified||!verification.authenticationInfo.userVerified)return undefined;
  const token=randomToken();
  const sessionDigest=digest(token);
  await c.query('UPDATE webauthn_credentials SET sign_count=$2,device_type=$3,backed_up=$4,last_used_at=now() WHERE credential_id=$1',[row.credential_id,verification.authenticationInfo.newCounter,verification.authenticationInfo.credentialDeviceType,verification.authenticationInfo.credentialBackedUp]);
  await c.query('INSERT INTO member_sessions(digest,member_id,credential_id,expires_at) VALUES($1,$2,$3,now()+interval \'12 hours\')',[sessionDigest,row.member_id,row.credential_id]);
  await c.query("INSERT INTO authentication_verifications(session_kind,session_digest,member_id) VALUES('member',$1,$2)",[sessionDigest,row.member_id]);
  await c.query("INSERT INTO audit_logs(actor,action,resource_id,details) VALUES($1,'passkey.sign_in',$1,$2)",[row.member_id,{credential: digest(row.credential_id).slice(0,24)}]);
  return {token,memberId:row.member_id,expiresInSeconds:43200};
 });
 if(!outcome)throw new DomainError('WEBAUTHN_RESPONSE_INVALID',401);
 return outcome;
}
export async function listCredentials(memberId:string) {
 const rows=(await pool.query(`SELECT management_id,label,device_type,backed_up,transports,created_at,last_used_at
  FROM webauthn_credentials WHERE member_id=$1 AND revoked_at IS NULL ORDER BY created_at`,[memberId])).rows;
 return rows.map((row:any)=>({id:row.management_id,label:row.label,deviceType:row.device_type,backedUp:row.backed_up,transports:row.transports,createdAt:row.created_at,lastUsedAt:row.last_used_at}));
}
export async function revokeCredential(actor:AuthenticatedMember,id:string) {
 return tx(async c=>{
  await requireRecentAuthentication(c,actor);
  const key=(await c.query('SELECT credential_id FROM webauthn_credentials WHERE member_id=$1 AND management_id=$2 AND revoked_at IS NULL FOR UPDATE',[actor.id,id])).rows[0];
  if(!key)throw new DomainError('NOT_FOUND',404);
  const total=Number((await c.query('SELECT count(*)::int AS total FROM webauthn_credentials WHERE member_id=$1 AND revoked_at IS NULL',[actor.id])).rows[0].total);
  if(total<=1)throw new DomainError('LAST_PASSKEY',409);
  await c.query('UPDATE webauthn_credentials SET revoked_at=now() WHERE credential_id=$1',[key.credential_id]);
  await c.query('UPDATE member_sessions SET revoked=true WHERE credential_id=$1',[key.credential_id]);
  await c.query("INSERT INTO audit_logs(actor,action,resource_id,details) VALUES($1,'passkey.revoked',$1,$2)",[actor.id,{credential:id.slice(0,24)}]);
  return {revoked:true,revokedCurrentSession:actor.session_kind==='member'&&actor.credential_id===key.credential_id};
 });
}
export async function cleanupWebAuthnChallenges(batchSize=500) {
 if(!Number.isInteger(batchSize)||batchSize<1||batchSize>1000)throw new RangeError('Challenge cleanup batch must be between 1 and 1000');
 return tx(async c=>(await c.query(`WITH candidates AS (
  SELECT id_digest FROM webauthn_challenges WHERE expires_at<=now() OR consumed_at<=now()-interval '10 minutes'
  ORDER BY expires_at,id_digest FOR UPDATE SKIP LOCKED LIMIT $1
 ) DELETE FROM webauthn_challenges w USING candidates x WHERE w.id_digest=x.id_digest RETURNING w.id_digest`,[batchSize])).rowCount??0);
}
