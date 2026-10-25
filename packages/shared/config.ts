import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
 APP_ENV: z.enum(['local','test','staging','production']),
 PROVIDER_MODE: z.literal('mock'),
 OUTBOUND_ENABLED: z.literal('false'),
 FIXTURE_AUTH_ENABLED: z.enum(['true','false']),
 DATABASE_URL: z.string().url(), REDIS_URL: z.string().url(),
 DELIVERY_KEY: z.string().regex(/^[a-f0-9]{64}$/),
 FIXTURE_SECRET: z.string().min(32), WEBHOOK_SECRET: z.string().min(32),
 PORT: z.coerce.number().int().min(1024).default(3100)
});
export const config = schema.parse(process.env);
if (!['local','test'].includes(config.APP_ENV)) throw new Error('Public environments are blocked until authentication and activation gates are implemented');
