import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const secureTextEqual=(a:string,b:string)=>{
 const left=Buffer.from(a,'utf8'),right=Buffer.from(b,'utf8');
 return left.length===right.length&&timingSafeEqual(left,right);
};

export function verifyMetaSignature(raw:Buffer,header:string|undefined,appSecret:string):boolean {
 if(!header||!/^sha256=[a-f0-9]{64}$/.test(header))return false;
 const expected=createHmac('sha256',appSecret).update(raw).digest();
 const supplied=Buffer.from(header.slice(7),'hex');
 return supplied.length===expected.length&&timingSafeEqual(supplied,expected);
}

export function metaVerificationChallenge(query:unknown,verifyToken:string):string|undefined {
 const schema=z.object({'hub.mode':z.string().max(32),'hub.verify_token':z.string().max(256),'hub.challenge':z.string().min(1).max(512)}).passthrough();
 const parsed=schema.safeParse(query);
 if(!parsed.success||parsed.data['hub.mode']!=='subscribe'||!secureTextEqual(parsed.data['hub.verify_token'],verifyToken))return undefined;
 return parsed.data['hub.challenge'];
}

const timestamp=z.union([z.string().regex(/^\d{1,12}$/),z.number().int().nonnegative().max(999999999999)]).transform(String);
const errorCode=z.union([z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),z.number().int().nonnegative().max(999999999999)]).transform(String);
const statusSchema=z.object({
 id:z.string().min(1).max(200).regex(/^[A-Za-z0-9_.:-]+$/),
 status:z.enum(['sent','delivered','read','failed']),
 timestamp,
 errors:z.array(z.object({code:errorCode}).passthrough()).optional()
}).passthrough();
const valueSchema=z.object({
 messaging_product:z.literal('whatsapp'),
 metadata:z.object({phone_number_id:z.string().regex(/^\d{1,32}$/)}).passthrough(),
 statuses:z.array(statusSchema).max(1000).optional(),
 messages:z.array(z.unknown()).max(1000).optional()
}).passthrough();
const envelopeSchema=z.object({
 object:z.literal('whatsapp_business_account'),
 entry:z.array(z.object({
  id:z.string().regex(/^\d{1,32}$/),
  changes:z.array(z.object({field:z.string().max(100),value:valueSchema}).passthrough()).max(1000)
 }).passthrough()).min(1).max(100)
}).passthrough();

export type MetaWhatsAppStatusEvent={wabaId:string;phoneNumberId:string;messageId:string;kind:'sent'|'delivered'|'read'|'failed';timestamp:string;errorCode?:string};

export function parseMetaWhatsAppStatuses(raw:Buffer):MetaWhatsAppStatusEvent[] {
 const parsed=envelopeSchema.parse(JSON.parse(raw.toString('utf8')));
 const events:MetaWhatsAppStatusEvent[]=[];
 for(const entry of parsed.entry)for(const change of entry.changes) {
  if(change.field!=='messages'||(change.value.messages?.length??0)>0)throw new Error('UNSUPPORTED_META_EVENT');
  const statuses=change.value.statuses??[];
  if(!statuses.length)throw new Error('UNSUPPORTED_META_EVENT');
  for(const item of statuses) {
   const event:MetaWhatsAppStatusEvent={wabaId:entry.id,phoneNumberId:change.value.metadata.phone_number_id,messageId:item.id,kind:item.status,timestamp:item.timestamp};
   const code=item.errors?.[0]?.code;
   if(code!==undefined)event.errorCode=code;
   events.push(event);
   if(events.length>1000)throw new Error('UNSUPPORTED_META_EVENT');
  }
 }
 if(!events.length)throw new Error('UNSUPPORTED_META_EVENT');
 return events;
}
