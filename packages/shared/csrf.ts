import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.ts';
export function currentSessionCookie(cookies:Record<string,unknown>) {
 return typeof cookies.member_session==='string'?cookies.member_session:typeof cookies.fixture_session==='string'?cookies.fixture_session:'';
}
export function csrfToken(browser:string,session:string,scope:string) {
 return createHmac('sha256',config.FIXTURE_SECRET).update(JSON.stringify([browser,session,scope])).digest('hex');
}
export function verifyCsrf(token:string,browser:string,session:string,scope:string) {
 if(!/^[a-f0-9]{64}$/.test(token)||!browser)return false;
 const expected=csrfToken(browser,session,scope);
 return timingSafeEqual(Buffer.from(token,'hex'),Buffer.from(expected,'hex'));
}
