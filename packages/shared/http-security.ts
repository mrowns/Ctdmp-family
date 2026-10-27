import { config } from './config.ts';
// Use a fixed configured origin. The localhost alias is retained only for the existing
// authenticated development browser checks; WebAuthn itself verifies config.WEBAUTHN_ORIGIN.
export function isSameOrigin(req:{headers:Record<string,unknown>}) {
 const expected=new URL(config.WEBAUTHN_ORIGIN);
 const localAliases=['http://127.0.0.1:'+config.PORT,'http://localhost:'+config.PORT];
 const origin=req.headers.origin;
 if(typeof origin==='string'&&(origin===expected.origin||(['local','test'].includes(config.APP_ENV)&&localAliases.includes(origin))))return true;
 const allowedHosts=[expected.host,...(['local','test'].includes(config.APP_ENV)?['127.0.0.1:'+config.PORT,'localhost:'+config.PORT]:[])];
 return origin==='null'&&req.headers['sec-fetch-site']==='same-origin'&&allowedHosts.includes(String(req.headers.host));
}
