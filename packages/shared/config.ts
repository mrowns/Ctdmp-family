import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
 ORGANIZATION_ID: z.string().min(1).default('demo-org'),
 APP_ENV: z.enum(['local','test','staging','production']),
 PROVIDER_MODE: z.literal('mock'),
 OUTBOUND_ENABLED: z.literal('false'),
 FIXTURE_AUTH_ENABLED: z.enum(['true','false']),
 DATABASE_URL: z.string().url(), REDIS_URL: z.string().url(),
 DELIVERY_KEY: z.string().regex(/^[a-f0-9]{64}$/),
 FIXTURE_SECRET: z.string().min(32), WEBHOOK_SECRET: z.string().min(32),
 META_WEBHOOK_ENABLED: z.enum(['true','false']).default('false'),
 META_APP_SECRET: z.string().min(32).max(256).optional(),
 META_WEBHOOK_VERIFY_TOKEN: z.string().min(32).max(256).optional(),
 PORT: z.coerce.number().int().min(1024).default(3100),
 WEBAUTHN_RP_ID: z.string().min(1).max(253).optional(),
 WEBAUTHN_RP_NAME: z.string().min(1).max(100).default('CTDMP Connect Development'),
 WEBAUTHN_ORIGIN: z.string().url().optional()
}).superRefine((value,ctx)=>{
 const originText=value.WEBAUTHN_ORIGIN??`http://localhost:${value.PORT}`;
 try {
  const origin=new URL(originText);
  const rpId=(value.WEBAUTHN_RP_ID??'localhost').toLowerCase();
  const host=origin.hostname.toLowerCase();
  if(origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password)ctx.addIssue({code:'custom',path:['WEBAUTHN_ORIGIN'],message:'Must be a bare origin without path, query, or credentials'});
  if(origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(host)))ctx.addIssue({code:'custom',path:['WEBAUTHN_ORIGIN'],message:'HTTP is permitted only for local development'});
  if(host!==rpId&&!host.endsWith('.'+rpId))ctx.addIssue({code:'custom',path:['WEBAUTHN_RP_ID'],message:'RP ID must be the origin host or a parent domain'});
 } catch { ctx.addIssue({code:'custom',path:['WEBAUTHN_ORIGIN'],message:'Invalid WebAuthn origin'}); }
 if(value.META_WEBHOOK_ENABLED==='true') {
  if(!value.META_APP_SECRET)ctx.addIssue({code:'custom',path:['META_APP_SECRET'],message:'Required when Meta webhook is enabled'});
  if(!value.META_WEBHOOK_VERIFY_TOKEN)ctx.addIssue({code:'custom',path:['META_WEBHOOK_VERIFY_TOKEN'],message:'Required when Meta webhook is enabled'});
 }
});
const parsed=schema.parse(process.env);
export const config={...parsed,WEBAUTHN_RP_ID:(parsed.WEBAUTHN_RP_ID??'localhost').toLowerCase(),WEBAUTHN_ORIGIN:new URL(parsed.WEBAUTHN_ORIGIN??`http://localhost:${parsed.PORT}`).origin};
if (!['local','test'].includes(config.APP_ENV)) throw new Error('Public environments are blocked until authentication and activation gates are implemented');
