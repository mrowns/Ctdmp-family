import { randomInt, timingSafeEqual } from 'node:crypto';
import { config } from './config.ts';
import { pool, tx } from '../db/index.ts';
import { DomainError } from './domain.ts';
import { digest, encrypt, decrypt, keyedDigest, randomToken } from '../integrations/crypto.ts';
import { requireRecentAuthentication, type AuthenticatedMember } from './webauthn.ts';
import { requireAdministration } from './administration.ts';
const browserPattern=/^[A-Za-z0-9_-]{43}$/;
const mockPhonePattern=/^\+1[2-9]\d{2}55501\d{2}$/;
function assertMockMode() {
 if(!['local','test'].includes(config.APP_ENV)||config.PROVIDER_MODE!=='mock'||config.OUTBOUND_ENABLED!=='false') throw new DomainError('MOCK_LINKING_DISABLED',404);
}
export function normalizeWhatsAppPhone(value:string) {
 const phone=value.trim();
 if(!mockPhonePattern.test(phone)) throw new DomainError('MOCK_PHONE_REQUIRED',422);
 return phone;
}
function sameDigest(left:string,right:string) {
 const a=Buffer.from(left,'hex'),b=Buffer.from(right,'hex');
 return a.length===b.length&&timingSafeEqual(a,b);
}
function mask(phone:string) { return '**** '+phone.slice(-4); }
export async function startWhatsAppLinkChallenge(actor:AuthenticatedMember,browser:string,rawPhone:string) {
 assertMockMode();
 if(!browserPattern.test(browser)) throw new DomainError('AUTHENTICATION_REQUIRED',401);
 const phone=normalizeWhatsAppPhone(rawPhone);
 await requireRecentAuthentication(pool,actor);
 const challenge=randomToken(),code=String(randomInt(1000000000,10000000000));
 const challengeDigest=digest(challenge),phoneDigest=keyedDigest('whatsapp-identity',phone),codeDigest=keyedDigest('whatsapp-link-code',code);
 const expiresAt=await tx(async c=>{
  const member=(await c.query('SELECT id FROM members WHERE id=$1 AND organization_id=$2 AND active FOR UPDATE',[actor.id,actor.organization_id])).rows[0];
  if(!member) throw new DomainError('AUTHENTICATION_REQUIRED',401);
  const existing=(await c.query("SELECT 1 FROM linked_whatsapp_identities WHERE organization_id=$1 AND provider_key='mock-whatsapp' AND identity_digest=$2 AND revoked_at IS NULL",[actor.organization_id,phoneDigest])).rowCount;
  if(existing) throw new DomainError('IDENTITY_UNAVAILABLE',409);
  await c.query("UPDATE whatsapp_link_challenges SET consumed_at=COALESCE(consumed_at,now()) WHERE organization_id=$1 AND member_id=$2 AND consumed_at IS NULL",[actor.organization_id,actor.id]);
  const row=(await c.query("INSERT INTO whatsapp_link_challenges(challenge_digest,organization_id,member_id,browser_digest,phone_digest,encrypted_destination,code_digest,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '10 minutes') RETURNING expires_at",
   [challengeDigest,actor.organization_id,actor.id,digest(browser),phoneDigest,encrypt(phone),codeDigest])).rows[0];
  await c.query("INSERT INTO audit_logs(actor,action,resource_id,details) VALUES($1,'whatsapp_link.mock_started',$2,$3)",[actor.id,challengeDigest,{providerMode:'MOCK',expiresAt:row.expires_at}]);
  return row.expires_at;
 });
 return {challenge,code,expiresAt,providerMode:'MOCK' as const};
}
export async function listWhatsAppIdentities(memberId:string,organizationId:string) {
 const rows=(await pool.query("SELECT id,provider_key,encrypted_destination,verified_at FROM linked_whatsapp_identities WHERE member_id=$1 AND organization_id=$2 AND revoked_at IS NULL ORDER BY verified_at DESC",[memberId,organizationId])).rows;
 return rows.map(row=>({id:row.id,providerMode:'MOCK' as const,maskedDestination:mask(decrypt(row.encrypted_destination)),verifiedAt:row.verified_at}));
}
export async function unlinkWhatsAppIdentity(actor:AuthenticatedMember,id:string) {
 assertMockMode();await requireRecentAuthentication(pool,actor);
 return tx(async c=>{
  const row=(await c.query("SELECT id FROM linked_whatsapp_identities WHERE id=$1 AND member_id=$2 AND organization_id=$3 AND provider_key='mock-whatsapp' AND revoked_at IS NULL FOR UPDATE",[id,actor.id,actor.organization_id])).rows[0];
  if(!row) throw new DomainError('NOT_FOUND',404);
  await c.query('UPDATE linked_whatsapp_identities SET revoked_at=now() WHERE id=$1',[id]);
  await c.query("INSERT INTO audit_logs(actor,action,resource_id,details) VALUES($1,'whatsapp_link.mock_revoked',$2,$3)",[actor.id,id,{providerMode:'MOCK'}]);
  return {unlinked:true};
 });
}
export async function processMockWhatsAppInbound(actor:AuthenticatedMember,input:{challenge:string;sender:string;code:string}) {
 assertMockMode();await requireRecentAuthentication(pool,actor);
 if(!/^[A-Za-z0-9_-]{43}$/.test(input.challenge)||!/^\d{10}$/.test(input.code)) throw new DomainError('MOCK_INBOUND_REJECTED',422);
 const sender=normalizeWhatsAppPhone(input.sender),challengeDigest=digest(input.challenge);
 const codeDigest=keyedDigest('whatsapp-link-code',input.code),senderDigest=keyedDigest('whatsapp-identity',sender);
 return tx(async c=>{
  await requireAdministration(c,actor,'demo.manage');
  const row=(await c.query('SELECT * FROM whatsapp_link_challenges WHERE challenge_digest=$1 FOR UPDATE',[challengeDigest])).rows[0];
  if(!row||row.consumed_at||new Date(row.expires_at).getTime()<=Date.now()||row.attempts>=5) throw new DomainError('MOCK_INBOUND_REJECTED',409);
  const member=(await c.query('SELECT id FROM members WHERE id=$1 AND organization_id=$2 AND active FOR UPDATE',[row.member_id,row.organization_id])).rows[0];
  if(!member) {
   await c.query('UPDATE whatsapp_link_challenges SET consumed_at=now() WHERE challenge_digest=$1',[challengeDigest]);
   await c.query("INSERT INTO audit_logs(actor,action,resource_id,details) VALUES($1,'whatsapp_link.mock_member_inactive',$2,$3)",[actor.id,challengeDigest,{providerMode:'MOCK'}]);
   return {linked:false as const,reason:'MEMBER_INACTIVE'};
  }
  if(!sameDigest(row.code_digest,codeDigest)||!sameDigest(row.phone_digest,senderDigest)) {
   const attempts=row.attempts+1;
   await c.query('UPDATE whatsapp_link_challenges SET attempts=$2,consumed_at=CASE WHEN $2>=5 THEN now() ELSE consumed_at END WHERE challenge_digest=$1',[challengeDigest,attempts]);
   await c.query("INSERT INTO audit_logs(actor,action,resource_id,details) VALUES($1,'whatsapp_link.mock_attempt_rejected',$2,$3)",[actor.id,challengeDigest,{providerMode:'MOCK',attempts}]);
   return {linked:false as const,reason:attempts>=5?'ATTEMPTS_EXHAUSTED':'SENDER_OR_CODE_MISMATCH'};
  }
  const prior=(await c.query("SELECT 1 FROM linked_whatsapp_identities WHERE organization_id=$1 AND provider_key='mock-whatsapp' AND identity_digest=$2 AND revoked_at IS NULL",[row.organization_id,senderDigest])).rowCount;
  if(prior) {
   await c.query('UPDATE whatsapp_link_challenges SET consumed_at=now() WHERE challenge_digest=$1',[challengeDigest]);
   await c.query("INSERT INTO audit_logs(actor,action,resource_id,details) VALUES($1,'whatsapp_link.mock_identity_conflict',$2,$3)",[actor.id,challengeDigest,{providerMode:'MOCK'}]);
   return {linked:false as const,reason:'IDENTITY_UNAVAILABLE'};
  }
  const previous=(await c.query("SELECT id FROM linked_whatsapp_identities WHERE organization_id=$1 AND member_id=$2 AND provider_key='mock-whatsapp' AND revoked_at IS NULL FOR UPDATE",[row.organization_id,row.member_id])).rows[0];
  await c.query('SAVEPOINT whatsapp_identity_replace');
  if(previous)await c.query('UPDATE linked_whatsapp_identities SET revoked_at=now() WHERE id=$1',[previous.id]);
  const id=randomToken();
  const inserted=(await c.query("INSERT INTO linked_whatsapp_identities(id,organization_id,member_id,provider_key,identity_digest,encrypted_destination) VALUES($1,$2,$3,'mock-whatsapp',$4,$5) ON CONFLICT DO NOTHING RETURNING id",[id,row.organization_id,row.member_id,senderDigest,row.encrypted_destination])).rowCount;
  if(!inserted)await c.query('ROLLBACK TO SAVEPOINT whatsapp_identity_replace');
  await c.query('RELEASE SAVEPOINT whatsapp_identity_replace');
  await c.query('UPDATE whatsapp_link_challenges SET consumed_at=now() WHERE challenge_digest=$1',[challengeDigest]);
  await c.query("INSERT INTO audit_logs(actor,action,resource_id,details) VALUES($1,$2,$3,$4)",[actor.id,inserted?(previous?'whatsapp_link.mock_replaced':'whatsapp_link.mock_verified'):'whatsapp_link.mock_identity_conflict',challengeDigest,{providerMode:'MOCK',memberId:row.member_id,identityId:inserted?id:null,previousIdentityId:previous?.id??null}]);
  return inserted?{linked:true as const,identityId:id,maskedDestination:mask(sender),providerMode:'MOCK' as const}:{linked:false as const,reason:'IDENTITY_UNAVAILABLE'};
 });
}
