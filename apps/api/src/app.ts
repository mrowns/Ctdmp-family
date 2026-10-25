import Fastify from 'fastify';
import formbody from '@fastify/formbody';
import cookie from '@fastify/cookie';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { isSameOrigin } from '../../../packages/shared/http-security.ts';
import { registerPages, renderPage } from '../../web/src/pages.ts';
import { pool } from '../../../packages/db/index.ts';
import { config } from '../../../packages/shared/config.ts';
import { digest, randomToken } from '../../../packages/integrations/crypto.ts';
import { mintNonce, confirmJoin, DomainError, setOptIn } from '../../../packages/shared/domain.ts';
export async function app() {
 const a=Fastify({logger:false,bodyLimit:65536,trustProxy:false});
 await a.register(formbody);await a.register(cookie);
 a.addHook('onSend',async (_req,reply,payload)=>{reply.header('Cache-Control','private, no-store').header('Referrer-Policy','no-referrer').header('X-Content-Type-Options','nosniff').header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://www.youtube.com; frame-ancestors 'none'");return payload;});
 a.setErrorHandler((err,req,reply)=>{const known=err instanceof DomainError;
  if(req.headers.accept?.includes('text/html')) {
   const status=known?err.status:400;
   const message=status===503?'We are checking the livestream link. Please try again shortly.':status===401?'Sign in to open your private account.':status===403?'This action is not permitted.':status===404?'This link or page is unavailable.':'The request could not be completed. Please return and try again.';
   return reply.code(status).type('text/html').send(renderPage('Please try again',`<section class=card data-error-code="${known?err.code:"REQUEST_FAILED"}"><h1>${message}</h1><p>No successful link opening has been recorded by this failed action.</p><a href=/live>Return to live information</a> · <a href=/demo/sign-in>Development sign-in</a></section>`));
  }
  reply.code(known?err.status:400).send({error:{code:known?err.code:'REQUEST_FAILED',message:known&&err.status===503?'We are checking the livestream link.':'The request could not be completed.',requestId:req.id,retryable:known&&err.status===503,fieldErrors:[]}});});
 async function principal(req:any,required=true) {
  const auth=req.headers.authorization;
  const token=typeof auth==='string' && auth.startsWith('Bearer ')?auth.slice(7):(req.cookies.fixture_session??'');
  if(token && !auth && !['GET','HEAD'].includes(req.method) && !isSameOrigin(req))throw new DomainError('INVALID_ORIGIN',403);
  if(!token || config.FIXTURE_AUTH_ENABLED!=='true') {if(required) throw new DomainError('AUTHENTICATION_REQUIRED',401);return undefined;}
  const row=(await pool.query('SELECT m.* FROM fixture_sessions s JOIN members m ON m.id=s.member_id WHERE s.digest=$1 AND NOT s.revoked AND s.expires_at>now() AND m.active',[digest(token)])).rows[0];
  if(!row && required) throw new DomainError('AUTHENTICATION_REQUIRED',401);
  return row;
 }
 const page=(body:string)=>`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CTDMP Connect — Demo</title><style>body{font:18px system-ui;background:#101c30;color:#fff4df;max-width:44rem;margin:3rem auto;padding:1rem}a{color:#f3cf81}button{font:inherit;padding:1rem 2rem;border:0;border-radius:.5rem;background:#f3cf81;color:#101c30}small{display:block;margin:2rem 0}</style><body><p>MOCK ENVIRONMENT · NO REAL MESSAGES</p><h1>CTDMP Connect</h1>${body}<small>Working product identity. Official affiliation has not been verified.</small></body></html>`;
 a.get('/health/live',async()=>({status:'ok',mode:'MOCK'}));
 a.get('/health/ready',async(_req,reply)=>{try{await pool.query('SELECT 1');return {status:'ready',scope:'database-only'};}catch{reply.code(503);return {status:'unavailable'};}});
 a.get('/api/v1/public/programs/current',async()=>({mode:'MOCK',program:(await pool.query('SELECT id,title,state,revision,current_sequence,local_date FROM programs ORDER BY local_date DESC LIMIT 1')).rows[0]??null}));
 await registerPages(a,principal);
 a.get('/j/:token',async(req,reply)=>{
  const token=z.object({token:z.string().max(100)}).parse(req.params).token;
  // HEAD follows Fastify GET handler, but may create only a transient nonce, never engagement.
  const browser=randomToken();const nonce=await mintNonce(token,browser);
  reply.setCookie('join_browser',browser,{path:'/j/',httpOnly:true,sameSite:'strict',maxAge:300});
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
 await a.register(async hook=>{
  hook.removeContentTypeParser('application/json');
  hook.addContentTypeParser('application/json',{parseAs:'buffer'},(_req,body,done)=>done(null,body));
  hook.post('/webhooks/meta',async(req,reply)=>{
   const raw=req.body as Buffer;
   const signature=req.headers['x-hub-signature-256'];
   const expected='sha256='+createHmac('sha256',config.WEBHOOK_SECRET).update(raw).digest('hex');
   if(typeof signature!=='string' || signature.length!==expected.length || !timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) throw new DomainError('INVALID_SIGNATURE',403);
   // Restricted fictional contract; real Meta payload mapping is not activated.
   const event=z.object({id:z.string().max(100),kind:z.enum(['sent','delivered','read']),messageId:z.string().max(100)}).strict().parse(JSON.parse(raw.toString()));
   await pool.query('INSERT INTO webhook_inbox(event_key,payload) VALUES($1,$2) ON CONFLICT DO NOTHING',['mock:'+event.id+':'+event.kind,event]);
   return reply.code(202).send({accepted:true,mode:'MOCK_CONTRACT'});
  });
 });
 return a;
}
