import { config } from './config.ts';
// no-referrer makes Chromium serialize HTML form Origin as null. In that case
// require browser-provided same-origin Fetch Metadata and the expected Host.
// Callers must additionally verify their browser-bound CSRF token or join nonce.
export function isSameOrigin(req:{headers:Record<string,unknown>}) {
 const origins=[`http://127.0.0.1:${config.PORT}`,`http://localhost:${config.PORT}`];
 const origin=req.headers.origin;
 if(typeof origin==='string'&&origins.includes(origin))return true;
 return origin==='null'&&req.headers['sec-fetch-site']==='same-origin'&&[`127.0.0.1:${config.PORT}`,`localhost:${config.PORT}`].includes(String(req.headers.host));
}
