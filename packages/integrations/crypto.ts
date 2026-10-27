import { randomBytes, createHash, createHmac, createCipheriv, createDecipheriv } from 'node:crypto';
import { config } from '../shared/config.ts';
export const randomToken=()=>randomBytes(32).toString('base64url');
export const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
export const keyedDigest=(purpose:string,value:string)=>createHmac('sha256',Buffer.from(config.DELIVERY_KEY,'hex')).update('ctdmp-v1:'+purpose+'\0').update(value).digest('hex');
export function encrypt(value:string) { const iv=randomBytes(12); const c=createCipheriv('aes-256-gcm',Buffer.from(config.DELIVERY_KEY,'hex'),iv); const body=Buffer.concat([c.update(value,'utf8'),c.final()]); return [iv,c.getAuthTag(),body].map(b=>b.toString('base64url')).join('.'); }
export function decrypt(value:string) { const [iv,tag,body]=value.split('.').map(v=>Buffer.from(v,'base64url')); const c=createDecipheriv('aes-256-gcm',Buffer.from(config.DELIVERY_KEY,'hex'),iv); c.setAuthTag(tag); return Buffer.concat([c.update(body),c.final()]).toString('utf8'); }
