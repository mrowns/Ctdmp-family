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
 PORT: z.coerce.number().int().min(1024).default(3100)
}).superRefine((value,ctx)=>{
 if(value.META_WEBHOOK_ENABLED==='true') {
  if(!value.META_APP_SECRET)ctx.addIssue({code:'custom',path:['META_APP_SECRET'],message:'Required when Meta webhook is enabled'});
  if(!value.META_WEBHOOK_VERIFY_TOKEN)ctx.addIssue({code:'custom',path:['META_WEBHOOK_VERIFY_TOKEN'],message:'Required when Meta webhook is enabled'});
 }
});
export const config = schema.parse(process.env);
if (!['local','test'].includes(config.APP_ENV)) throw new Error('Public environments are blocked until authentication and activation gates are implemented');
