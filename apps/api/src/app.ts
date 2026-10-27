import Fastify from 'fastify';
import formbody from '@fastify/formbody';
import cookie from '@fastify/cookie';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { currentProgram } from '../../../packages/shared/programs.ts';
import { reviewCandidate, finishProgram, selectProgram, setSendingPaused, setMockChannelApproval, setProgramSchedule } from '../../../packages/shared/administration.ts';
import { isSameOrigin } from '../../../packages/shared/http-security.ts';
import { registerPages, renderPage } from '../../web/src/pages.ts';
import { pool, tx } from '../../../packages/db/index.ts';
import { config } from '../../../packages/shared/config.ts';
import { digest, randomToken } from '../../../packages/integrations/crypto.ts';
import { currentSessionCookie, verifyCsrf } from '../../../packages/shared/csrf.ts';
import { authenticationOptions, registrationOptions, verifyAuthentication, verifyRegistration, listCredentials, revokeCredential } from '../../../packages/shared/webauthn.ts';
import type { AuthenticatedMember } from '../../../packages/shared/webauthn.ts';
import { metaVerificationChallenge, parseMetaWhatsAppStatuses, verifyMetaSignature } from '../../../packages/integrations/meta-whatsapp-webhook.ts';
import { mintNonce, confirmJoin, DomainError, setOptIn } from '../../../packages/shared/domain.ts';
export async function app() {
 const a=Fastify({logger:false,bodyLimit:65536,trustProxy:false});
 await a.register(formbody);await a.register(cookie);
 a.addHook('onSend',async (_req,reply,payload)=>{reply.header('Cache-Control','private, no-store').header('Referrer-Policy','no-referrer').header('X-Content-Type-Options','nosniff').header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");return payload;});
 a.setErrorHandler((err,req,reply)=>{const known=err instanceof DomainError;const errorStatus=known?err.status:err instanceof z.ZodError?422:500;
  if(req.headers.accept?.includes('text/html')) {
   const status=errorStatus;
   const message=known&&err.code==='REVISION_CONFLICT'?'This record changed. Reload the control room before trying again.':known&&err.code==='RECENT_AUTHENTICATION_REQUIRED'?'Sign in again before changing program or sending settings.':status===503?'We are checking the livestream link. Please try again shortly.':status===401?'Sign in to open your private account.':status===403?'This action is not permitted.':status===404?'This link or page is unavailable.':'The request could not be completed. Please return and try again.';
   return reply.code(status).type('text/html').send(renderPage('Please try again',`<section class=card data-error-code="${known?err.code:"REQUEST_FAILED"}"><h1>${message}</h1><p>Please return to the current page and reload before trying again.</p><a href=/live>Return to live information</a> · <a href=/demo/sign-in>Development sign-in</a></section>`));
  }
  reply.code(errorStatus).send({error:{code:known?err.code:'REQUEST_FAILED',message:known&&err.status===503?'We are checking the livestream link.':'The request could not be completed.',requestId:req.id,retryable:known&&err.status===503,fieldErrors:[]}});});
 function principal(req:any):Promise<AuthenticatedMember>;
 function principal(req:any,required:true):Promise<AuthenticatedMember>;
 function principal(req:any,required:false):Promise<AuthenticatedMember|undefined>;
 async function principal(req:any,required=true):Promise<AuthenticatedMember|undefined> {
  const auth=req.headers.authorization;
  const token=typeof auth==='string'&&auth.startsWith('Bearer ')?auth.slice(7):currentSessionCookie(req.cookies);
  const fromCookie=!(typeof auth==='string'&&auth.startsWith('Bearer '))&&Boolean(token);
  if(fromCookie&&!['GET','HEAD'].includes(req.method)&&!isSameOrigin(req))throw new DomainError('INVALID_ORIGIN',403);
  if(!token) {if(required)throw new DomainError('AUTHENTICATION_REQUIRED',401);return undefined;}
  const tokenDigest=digest(token);
  const passkey=(await pool.query(`SELECT m.*,s.digest AS session_digest,'member'::text AS session_kind,s.credential_id
   FROM member_sessions s JOIN members m ON m.id=s.member_id WHERE s.digest=$1 AND NOT s.revoked AND s.expires_at>now() AND m.active`,[tokenDigest])).rows[0];
  if(passkey)return passkey;
  if(config.FIXTURE_AUTH_ENABLED==='true') {
   const fixture=(await pool.query(`SELECT m.*,s.digest AS session_digest,'fixture'::text AS session_kind,NULL::text AS credential_id
    FROM fixture_sessions s JOIN members m ON m.id=s.member_id WHERE s.digest=$1 AND NOT s.revoked AND s.expires_at>now() AND m.active`,[tokenDigest])).rows[0];
   if(fixture)return fixture;
  }
  if(required)throw new DomainError('AUTHENTICATION_REQUIRED',401);
  return undefined;
 }
 const webauthnBrowserRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../../../node_modules/@simplewebauthn/browser/esm');
 const webClientPath=resolve(dirname(fileURLToPath(import.meta.url)),'../../web/public/passkeys.js');
 a.get('/assets/passkeys.js',async(_req,reply)=>reply.type('application/javascript; charset=utf-8').send(await readFile(webClientPath)));
 a.get('/assets/webauthn/*',async(req,reply)=>{
  const relative=String((req.params as any)['*']??'');
  if(!/^[A-Za-z0-9_./-]+\.js$/.test(relative)||relative.split('/').includes('..'))throw new DomainError('NOT_FOUND',404);
  const file=resolve(webauthnBrowserRoot,relative);
  if(!file.startsWith(webauthnBrowserRoot+sep))throw new DomainError('NOT_FOUND',404);
  try{return reply.type('application/javascript; charset=utf-8').send(await readFile(file));}catch{throw new DomainError('NOT_FOUND',404);}
 });
 const passkeyAction=(req:any,body:{csrf:string},scope:string)=>{
  if(!isSameOrigin(req))throw new DomainError('INVALID_ORIGIN',403);
  if(!verifyCsrf(body.csrf,req.cookies.web_browser??'',currentSessionCookie(req.cookies),scope))throw new DomainError('INVALID_ACTION',403);
 };
 const credentialResponseBase={
  id:z.string().min(1).max(2048),rawId:z.string().min(1).max(2048),type:z.literal('public-key'),
  authenticatorAttachment:z.enum(['platform','cross-platform']).optional(),clientExtensionResults:z.record(z.string(),z.unknown()).default({}),
 };
 const registrationResponse=z.object({...credentialResponseBase,response:z.object({clientDataJSON:z.string().min(1).max(12000),attestationObject:z.string().min(1).max(50000),transports:z.array(z.string().max(24)).max(8).optional()}).passthrough()}).passthrough().refine(v=>v.id===v.rawId);
 const authenticationResponse=z.object({...credentialResponseBase,response:z.object({clientDataJSON:z.string().min(1).max(12000),authenticatorData:z.string().min(1).max(12000),signature:z.string().min(1).max(12000),userHandle:z.string().max(512).optional()}).passthrough()}).passthrough().refine(v=>v.id===v.rawId);
 a.post('/api/v1/auth/passkeys/registration/options',async req=>{
  const body=z.object({csrf:z.string().length(64),label:z.string().trim().min(1).max(80)}).strict().parse(req.body);passkeyAction(req,body,'passkey-register');
  return registrationOptions((await principal(req))!,req.cookies.web_browser??'',body.label);
 });
 a.post('/api/v1/auth/passkeys/registration/verify',async req=>{
  const body=z.object({csrf:z.string().length(64),challengeId:z.string().regex(/^[A-Za-z0-9_-]{43}$/),label:z.string().trim().min(1).max(80),response:registrationResponse}).strict().parse(req.body);passkeyAction(req,body,'passkey-register');
  return verifyRegistration((await principal(req))!,req.cookies.web_browser??'',body.challengeId,body.response as any,body.label);
 });
 a.post('/api/v1/auth/passkeys/login/options',async req=>{
  const body=z.object({csrf:z.string().length(64)}).strict().parse(req.body);passkeyAction(req,body,'passkey-login');
  return authenticationOptions(req.cookies.web_browser??'');
 });
 a.post('/api/v1/auth/passkeys/login/verify',async(req,reply)=>{
  const body=z.object({csrf:z.string().length(64),challengeId:z.string().regex(/^[A-Za-z0-9_-]{43}$/),response:authenticationResponse}).strict().parse(req.body);passkeyAction(req,body,'passkey-login');
  const session=await verifyAuthentication(req.cookies.web_browser??'',body.challengeId,body.response as any);
  if(req.cookies.member_session)await pool.query('UPDATE member_sessions SET revoked=true WHERE digest=$1',[digest(req.cookies.member_session)]);
  const secure=new URL(config.WEBAUTHN_ORIGIN).protocol==='https:';
  reply.clearCookie('fixture_session',{path:'/'}).clearCookie('member_session',{path:'/'}).setCookie('member_session',session.token,{path:'/',httpOnly:true,secure,sameSite:'strict',maxAge:session.expiresInSeconds});
  return {signedIn:true,redirect:'/account'};
 });
 a.get('/api/v1/me/passkeys',async req=>({items:await listCredentials((await principal(req))!.id)}));
 a.post('/api/v1/me/passkeys/:id/revoke',async(req,reply)=>{
  const id=z.object({id:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).parse(req.params).id;
  const body=z.object({csrf:z.string().length(64)}).strict().parse(req.body);passkeyAction(req,body,'passkey-revoke:'+id);
  const actor=(await principal(req))!;const result=await revokeCredential(actor,id);
  if(result.revokedCurrentSession)reply.clearCookie('member_session',{path:'/'});
  return result;
 });
 const page=(body:string)=>`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CTDMP Connect — Demo</title><style>body{font:18px system-ui;background:#101c30;color:#fff4df;max-width:44rem;margin:3rem auto;padding:1rem}a{color:#f3cf81}button{font:inherit;padding:1rem 2rem;border:0;border-radius:.5rem;background:#f3cf81;color:#101c30}small{display:block;margin:2rem 0}</style><body><p>MOCK ENVIRONMENT · NO REAL MESSAGES</p><h1>CTDMP Connect</h1>${body}<small>Working product identity. Official affiliation has not been verified.</small></body></html>`;
 a.get('/health/live',async()=>({status:'ok',mode:'MOCK'}));
 a.get('/health/ready',async(_req,reply)=>{try{await pool.query('SELECT 1');return {status:'ready',scope:'database-only'};}catch{reply.code(503);return {status:'unavailable'};}});
 a.get('/api/v1/public/programs/current',async()=>{const p=await currentProgram();return {mode:'MOCK',program:p?{id:p.id,title:p.title,state:p.state,revision:p.revision,current_sequence:p.current_sequence,local_date:p.local_date,scheduled_start_at:p.scheduled_start_at,schedule_timezone:p.schedule_timezone}:null};});
 a.get('/api/v1/public/programs/next',async()=>{const row=(await pool.query("SELECT id,title,state,local_date,scheduled_start_at,schedule_timezone FROM programs WHERE organization_id=$1 AND state='SCHEDULED' AND scheduled_start_at>now() ORDER BY scheduled_start_at,id LIMIT 1",[config.ORGANIZATION_ID])).rows[0];return {mode:'MOCK',program:row??null};});
 await registerPages(a,principal);
 a.get('/j/:token',async(req,reply)=>{
  const token=z.object({token:z.string().max(100)}).parse(req.params).token;
  // HEAD follows Fastify GET handler, but may create only a transient nonce, never engagement.
  const browser=randomToken();const nonce=await mintNonce(token,browser);
  reply.setCookie('join_browser',browser,{path:'/j/',httpOnly:true,secure:new URL(config.WEBAUTHN_ORIGIN).protocol==='https:',sameSite:'strict',maxAge:300});
  return reply.type('text/html').send(page(`<h2>Open the livestream</h2><p>This link is associated with its recipient. Opening it does not prove who watched or how long.</p><form method="post" action="/j/${encodeURIComponent(token)}/confirm"><input type="hidden" name="nonce" value="${nonce}"><button type="submit">Watch Live</button></form><p>If the stream is being checked, your action will not be recorded.</p>`));
 });
 a.post('/j/:token/confirm',async(req,reply)=>{
  if(!isSameOrigin(req)) throw new DomainError('INVALID_ORIGIN',403);
  const token=z.object({token:z.string().max(100)}).parse(req.params).token;
  const nonce=z.object({nonce:z.string().max(100)}).parse(req.body).nonce;
  const actor=await principal(req,false);
  const result=await confirmJoin(token,nonce,req.cookies.join_browser??'',actor?.id);
  return reply.code(303).header('Location',result.location).send();
 });
 a.put('/api/v1/admin/programs/:id/schedule',async req=>{
  const actor=await principal(req);
  const id=programId(req.params);
  const input=adminInput.extend({scheduledStartAt:z.string().min(20).max(40),timeZone:z.string().min(1).max(64)}).strict().parse(req.body);
  return setProgramSchedule(actor,id,input);
 });
 a.get('/api/v1/admin/messages/receipts',async req=>{
  const actor=await principal(req);
  if(!(await pool.query("SELECT 1 FROM grants WHERE member_id=$1 AND permission='messaging.read' AND branch_id IS NULL",[actor.id])).rowCount)throw new DomainError('PERMISSION_DENIED',403);
  const items=(await pool.query('SELECT event_key,provider_key,provider_message_id,status,provider_event_at,received_at,notification_id,reconciliation_status,safe_error_code FROM provider_receipts WHERE organization_id=$1 ORDER BY received_at DESC,event_key DESC LIMIT 100',[actor.organization_id])).rows;
  const counts=(await pool.query('SELECT reconciliation_status,status,count(*)::int AS total FROM provider_receipts WHERE organization_id=$1 GROUP BY reconciliation_status,status ORDER BY reconciliation_status,status',[actor.organization_id])).rows;
  await pool.query("INSERT INTO audit_logs(actor,action,resource_id) VALUES($1,'messaging.receipts.read',$2)",[actor.id,actor.organization_id]);
  return {mode:'MOCK_CONTRACT',items,counts};
 });
 a.get('/api/v1/admin/providers/health',async req=>{
  const actor=await principal(req);
  if(!(await pool.query("SELECT 1 FROM grants WHERE member_id=$1 AND permission='program.read' AND branch_id IS NULL",[actor.id])).rowCount)throw new DomainError('PERMISSION_DENIED',403);
  const row=(await pool.query("SELECT * FROM provider_health WHERE organization_id=$1 ORDER BY provider_key,operation",[actor.organization_id])).rows;
  const items=row.map((h:any)=>{
   const ageSeconds=Math.floor((Date.now()-new Date(h.last_attempt_at).getTime())/1000);
   return {provider:h.provider_key,operation:h.operation,status:h.status,freshness:ageSeconds>=0&&ageSeconds<=120?'FRESH':'STALE',lastAttemptAt:h.last_attempt_at,lastSuccessAt:h.last_success_at,lastFailureAt:h.last_failure_at,lastErrorCode:h.last_error_code,consecutiveFailures:h.consecutive_failures,revision:h.revision};
  });
  return {mode:'MOCK',unknownWhenEmpty:true,evidenceFreshnessSeconds:120,items};
 });
 a.get('/api/v1/me/checkins',async req=>{
  const m=await principal(req);
  return {mode:'MOCK',items:(await pool.query('SELECT program_id,action,first_opened_at,last_opened_at,assurance,stream_sequence,last_stream_sequence FROM checkin_events WHERE member_id=$1 AND organization_id=$2 ORDER BY first_opened_at DESC LIMIT 50',[m.id,m.organization_id])).rows};
 });
 a.put('/api/v1/me/preferences',async req=>{const m=await principal(req);const body=z.object({liveStart:z.boolean()}).strict().parse(req.body);await setOptIn(m.id,body.liveStart);return {updated:true};});
 a.get('/api/v1/admin/programs/:id/checkins',async req=>{
  const m=await principal(req);const id=z.object({id:z.string()}).parse(req.params).id;
  const grant=(await pool.query("SELECT * FROM grants WHERE member_id=$1 AND permission='engagement.read'",[m.id])).rows[0];
  if(!grant) throw new DomainError('PERMISSION_DENIED',403);
  const p=(await pool.query('SELECT organization_id FROM programs WHERE id=$1',[id])).rows[0];
  if(!p || p.organization_id!==m.organization_id) throw new DomainError('NOT_FOUND',404);
  const items=(await pool.query('SELECT c.member_id,c.program_id,c.action,c.assurance,c.first_opened_at FROM checkin_events c JOIN members m ON m.id=c.member_id WHERE c.program_id=$1 AND c.organization_id=$2 AND m.branch_id=$3 ORDER BY c.first_opened_at DESC LIMIT 50',[id,m.organization_id,grant.branch_id])).rows;
  await pool.query("INSERT INTO audit_logs(actor,action,resource_id) VALUES($1,'engagement.read',$2)",[m.id,id]);
  return {items,policy:'Fictional fixed branch membership only; transfers not implemented'};
 });
 const adminInput=z.object({revision:z.number().int().min(0),reason:z.string().trim().min(8).max(500)});
 const programId=(params:unknown)=>z.object({id:z.string().min(1).max(100)}).parse(params).id;
 a.post('/api/v1/admin/programs/:id/channels/:channelId/approval',async req=>{
  const actor=await principal(req);
  const params=z.object({id:z.string().min(1).max(100),channelId:z.string().min(1).max(200)}).parse(req.params);
  const input=adminInput.extend({approved:z.boolean()}).strict().parse(req.body);
  return setMockChannelApproval(actor,params.id,{...input,channelId:params.channelId});
 });
 for(const decision of ['APPROVED','REJECTED'] as const) {
  a.post('/api/v1/admin/programs/:id/candidates/:observationId/'+(decision==='APPROVED'?'approve':'reject'),async req=>{
   const actor=await principal(req);const params=z.object({id:z.string().min(1).max(100),observationId:z.string().regex(/^[0-9]{1,18}$/)}).parse(req.params);
   const input=adminInput.strict().parse(req.body);
   return reviewCandidate(actor,params.id,{...input,observationId:params.observationId,decision});
  });
 }
 a.post('/api/v1/admin/programs/:id/finish',async req=>finishProgram(await principal(req),programId(req.params),adminInput.strict().parse(req.body)));
 a.post('/api/v1/admin/programs/:id/select',async req=>selectProgram(await principal(req),programId(req.params),adminInput.extend({selectionRevision:z.number().int().min(0)}).strict().parse(req.body)));
 a.put('/api/v1/admin/sending-controls',async req=>setSendingPaused(await principal(req),adminInput.extend({paused:z.boolean()}).strict().parse(req.body)));
 a.get('/api/v1/admin/programs/:id/transitions',async req=>{
  const actor=await principal(req);const id=programId(req.params);
  if(!(await pool.query("SELECT 1 FROM grants WHERE member_id=$1 AND permission='program.read' AND branch_id IS NULL",[actor.id])).rowCount)throw new DomainError('PERMISSION_DENIED',403);
  if(!(await pool.query('SELECT 1 FROM programs WHERE id=$1 AND organization_id=$2',[id,actor.organization_id])).rowCount)throw new DomainError('NOT_FOUND',404);
  return {mode:'MOCK',items:(await pool.query('SELECT previous_state,next_state,revision,actor,reason,evidence,created_at FROM program_transitions WHERE program_id=$1 ORDER BY revision DESC LIMIT 100',[id])).rows};
 });
 await a.register(async hook=>{
  hook.removeContentTypeParser('application/json');
  hook.addContentTypeParser('application/json',{parseAs:'buffer'},(_req,body,done)=>done(null,body));
  hook.get('/webhooks/meta/whatsapp',async(req,reply)=>{
   if(config.META_WEBHOOK_ENABLED!=='true'||!config.META_WEBHOOK_VERIFY_TOKEN)return reply.code(404).send();
   const challenge=metaVerificationChallenge(req.query,config.META_WEBHOOK_VERIFY_TOKEN);
   if(!challenge)return reply.code(403).send();
   return reply.type('text/plain; charset=utf-8').send(challenge);
  });
  hook.post('/webhooks/meta/whatsapp',async(req,reply)=>{
   const appSecret=config.META_APP_SECRET;
   if(config.META_WEBHOOK_ENABLED!=='true'||!appSecret)throw new DomainError('META_WEBHOOK_DISABLED',503);
   const raw=req.body as Buffer;
   const signature=req.headers['x-hub-signature-256'];
   if(typeof signature!=='string'||!verifyMetaSignature(raw,signature,appSecret))throw new DomainError('INVALID_SIGNATURE',403);
   let events;
   try { events=parseMetaWhatsAppStatuses(raw); }
   catch { throw new DomainError('UNSUPPORTED_META_EVENT',422); }
   await tx(async c=>{
    const phoneIds=[...new Set(events.map(event=>event.phoneNumberId))];
    const mappings=(await c.query('SELECT phone_number_id,waba_id,organization_id FROM meta_whatsapp_phone_mappings WHERE phone_number_id=ANY($1::text[]) AND enabled FOR SHARE',[phoneIds])).rows;
    const byPhone=new Map(mappings.map((mapping:any)=>[mapping.phone_number_id,mapping]));
    for(const event of events) {
     const mapping=byPhone.get(event.phoneNumberId);
     if(!mapping||mapping.waba_id!==event.wabaId)throw new DomainError('META_PHONE_MAPPING_REQUIRED',503);
    }
    for(const event of events) {
     const mapping=byPhone.get(event.phoneNumberId)!;
     const eventKey='meta-whatsapp:'+event.phoneNumberId+':'+event.messageId+':'+event.kind+':'+event.timestamp;
     const payload={organizationId:mapping.organization_id,providerKey:'meta-whatsapp',id:digest(eventKey),kind:event.kind,messageId:event.messageId,timestamp:event.timestamp,...(event.errorCode?{errorCode:event.errorCode}:{})};
     await c.query('INSERT INTO webhook_inbox(event_key,payload) VALUES($1,$2) ON CONFLICT DO NOTHING',[eventKey,payload]);
    }
   });
   return reply.code(202).send({accepted:true,mode:'META_WEBHOOK_CONTRACT',events:events.length});
  });
  hook.post('/webhooks/meta',async(req,reply)=>{
   const raw=req.body as Buffer;
   const signature=req.headers['x-hub-signature-256'];
   const expected='sha256='+createHmac('sha256',config.WEBHOOK_SECRET).update(raw).digest('hex');
   if(typeof signature!=='string' || signature.length!==expected.length || !timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) throw new DomainError('INVALID_SIGNATURE',403);
   // Restricted fictional contract; real Meta payload mapping is not activated.
   const event=z.object({organizationId:z.string().min(1).max(100),id:z.string().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/),kind:z.enum(['sent','failed','delivered','read']),messageId:z.string().min(1).max(200).regex(/^[A-Za-z0-9_.:-]+$/),timestamp:z.string().regex(/^[0-9]{1,10}$/).optional(),errorCode:z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional()}).strict().parse(JSON.parse(raw.toString()));
   await pool.query('INSERT INTO webhook_inbox(event_key,payload) VALUES($1,$2) ON CONFLICT DO NOTHING',['mock:'+event.organizationId+':'+event.id+':'+event.kind,event]);
   return reply.code(202).send({accepted:true,mode:'MOCK_CONTRACT'});
  });
 });
 return a;
}
