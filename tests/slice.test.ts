import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { pool, tx } from '../packages/db/index.ts';
import { app } from '../apps/api/src/app.ts';
import { observeOne,planOne,dispatchOne,mintNonce,confirmJoin,setOptIn,processWebhookOne,reconcileReceiptOne } from '../packages/shared/domain.ts';
import { randomToken,digest,decrypt } from '../packages/integrations/crypto.ts';
import { createScenario, queueScenarioObservation } from '../packages/shared/demo-scenarios.ts';
import { reviewCandidate, finishProgram, selectProgram, setSendingPaused } from '../packages/shared/administration.ts';
import { config } from '../packages/shared/config.ts';
if(config.APP_ENV!=='test' || new URL(config.DATABASE_URL).pathname!=='/ctdmp_test') throw new Error('Tests require isolated ctdmp_test database');
const server=await app();
const cleanup:string[]=[];
async function fixture() {
 const org='test-'+randomUUID();cleanup.push(org);
 const m=org+'-member',other=org+'-other',admin=org+'-admin',foreignAdmin=org+'-foreign',mod=org+'-mod';
 const program=org+'-program',channel=org+'-channel';
 await tx(async c=>{
  await c.query('INSERT INTO organizations VALUES($1,$1)',[org]);
  await c.query('INSERT INTO branches VALUES($1,$3,$1),($2,$3,$2)',[org+'-a',org+'-b',org]);
  for(const id of [m,other,admin,foreignAdmin,mod]) {
   await c.query('INSERT INTO members VALUES($1,$2,$3,$1,true)',[id,org,id===other||id===foreignAdmin?org+'-b':org+'-a']);
   await c.query('INSERT INTO preferences(member_id,live_start) VALUES($1,$2)',[id,id===m]);
   await c.query("INSERT INTO consent_records(member_id,purpose,opted_in,wording_version) VALUES($1,'LIVE_START',$2,'test-v1')",[id,id===m]);
   await c.query("INSERT INTO fixture_sessions VALUES($1,$2,now()+interval '1 hour',false)",[digest(config.FIXTURE_SECRET+':'+id),id]);
  }
  await c.query("INSERT INTO grants VALUES($1,'engagement.read',$2),($3,'engagement.read',$4),($5,'content.moderate',$2)",[admin,org+'-a',foreignAdmin,org+'-b',mod]);
  await c.query("INSERT INTO programs(id,organization_id,title,local_date) VALUES($1,$2,'CTDMP simulated',current_date)",[program,org]);
  await c.query('INSERT INTO official_channels VALUES($1,$2,$3,true,true)',[channel,org,program]);
  await c.query("INSERT INTO budgets VALUES($1,'TEST',100,0)",[org]);
  await c.query('INSERT INTO sending_controls VALUES($1,true)',[org]);
 });
 const observe=async(video='MockVideo_A',live=true,revision?:number,error=false,source=channel)=>{
  const p=(await pool.query('SELECT revision FROM programs WHERE id=$1',[program])).rows[0];
  await pool.query('INSERT INTO mock_observations(program_id,video_id,channel_id,title,live,expected_revision,provider_error) VALUES($1,$2,$3,$4,$5,$6,$7)',[program,video,source,'CTDMP simulated',live,revision??p.revision,error]);
  while(await observeOne()) {}
 };
 const join=async()=>{
  const token=randomToken();await pool.query("INSERT INTO join_links VALUES($1,$2,$3,$4,'LIVE_LINK_OPENED',now()+interval '1 hour',false)",[digest(token),org,m,program]);return token;
 };
 return {org,m,other,admin,foreignAdmin,mod,program,channel,observe,join};
}
function auth(id:string) {return {authorization:'Bearer '+config.FIXTURE_SECRET+':'+id};}
test('T-LIVE-01/07 + T-MSG-06/14: confirmed once; one mock notification per member; opted-out suppressed',async()=>{
 const f=await fixture();await f.observe();await f.observe();while(await planOne()){}
 const out=await pool.query("SELECT * FROM domain_outbox WHERE program_id=$1 AND event_type='program.live_confirmed'",[f.program]);assert.equal(out.rowCount,1);
 const ns=(await pool.query('SELECT * FROM notifications WHERE program_id=$1',[f.program])).rows;assert.equal(ns.length,5);
 const n=ns.find(n=>n.member_id===f.m);await dispatchOne(n.id);await dispatchOne(n.id);
 assert.equal((await pool.query('SELECT state FROM notifications WHERE id=$1',[n.id])).rows[0].state,'DRY_RUN_PREPARED');
 assert.equal((await pool.query('SELECT * FROM cost_ledger WHERE notification_id=$1',[n.id])).rowCount,1);
 assert.match(decrypt(n.payload_cipher),/DRY_RUN/);
 assert.ok(ns.filter(n=>n.member_id!==f.m).every(n=>n.state==='SUPPRESSED'));
});
test('T-JOIN-01/02/03/04/05/11 + T-LIVE-08/10: read-only previews, protected concurrent actions, same token reaches B',async()=>{
 const f=await fixture();await f.observe();const token=await f.join();
 for(const method of ['HEAD','GET'] as const) assert.equal((await server.inject({method,url:'/j/'+token})).statusCode,200);
 assert.equal((await pool.query('SELECT * FROM checkin_events WHERE program_id=$1',[f.program])).rowCount,0);
 const bad=await server.inject({method:'POST',url:'/j/'+token+'/confirm',payload:{nonce:'bad'}});assert.equal(bad.statusCode,403);
 const cross=await server.inject({method:'POST',url:'/j/'+token+'/confirm',headers:{origin:'null','sec-fetch-site':'cross-site',host:'127.0.0.1:'+config.PORT},payload:{nonce:'bad'}});assert.equal(cross.statusCode,403);
 const browser=randomToken();const nonces=await Promise.all(Array.from({length:8},()=>mintNonce(token,browser)));
 const results=await Promise.all(nonces.map(n=>confirmJoin(token,n,browser)));assert.ok(results.every(r=>r.location.endsWith('MockVideo_A')));
 assert.equal((await pool.query('SELECT * FROM checkin_events WHERE program_id=$1',[f.program])).rowCount,1);
 await f.observe('MockVideo_A',false);await f.observe('MockVideo_B');
 const nonce=await mintNonce(token,browser);const b=await confirmJoin(token,nonce,browser,f.m);assert.ok(b.location.endsWith('MockVideo_B'));
 await f.observe('MockVideo_A',true,1);
 const p=(await pool.query('SELECT * FROM programs WHERE id=$1',[f.program])).rows[0];assert.equal(p.current_sequence,2);
 const actions=(await pool.query('SELECT * FROM checkin_events WHERE program_id=$1',[f.program])).rows;assert.equal(actions.length,1);assert.equal(actions[0].assurance,'AUTHENTICATED_MEMBER');assert.equal(actions[0].stream_sequence,1);assert.equal(actions[0].last_stream_sequence,2);
 await assert.rejects(confirmJoin(token,nonce,browser,f.m),/INVALID_ACTION/);
});
test('T-JOIN-02: protected HTTP POST gives 303 only after nonce verification',async()=>{
 const f=await fixture();await f.observe();const token=await f.join();
 const landing=await server.inject({url:'/j/'+token});const nonce=landing.body.match(/name="nonce" value="([^"]+)"/)![1];
 const cookie=String(landing.headers['set-cookie']).split(';')[0];
 const res=await server.inject({method:'POST',url:'/j/'+token+'/confirm',headers:{origin:'http://127.0.0.1:'+config.PORT,cookie},payload:{nonce}});
 assert.equal(res.statusCode,303);assert.ok(res.headers.location?.endsWith('MockVideo_A'));
});
test('T-JOIN-06/08/12: invalid, mismatched account, uncertain destination cause no check-in',async()=>{
 const f=await fixture();const token=await f.join();const browser=randomToken();const nonce=await mintNonce(token,browser);
 await assert.rejects(confirmJoin(token,nonce,browser),/STREAM_REVIEW_REQUIRED/);
 await f.observe();await assert.rejects(confirmJoin(token,nonce,browser,f.other),/USE_GENERIC/);
 await pool.query('UPDATE join_links SET revoked=true WHERE digest=$1',[digest(token)]);
 await assert.rejects(confirmJoin(token,nonce,browser),/LINK_UNAVAILABLE/);
 assert.equal((await server.inject({url:'/j/not-a-valid-token'})).statusCode,404);
 assert.equal((await pool.query('SELECT * FROM checkin_events WHERE program_id=$1',[f.program])).rowCount,0);
});
test('T-AUTH-01/02/03/04: own history, scoped branch rows, moderator denial, grant revocation',async()=>{
 const f=await fixture();await f.observe();const token=await f.join();const browser=randomToken();await confirmJoin(token,await mintNonce(token,browser),browser,f.m);
 const own=await server.inject({url:'/api/v1/me/checkins',headers:auth(f.m)});assert.equal(own.json().items.length,1);
 const other=await server.inject({url:'/api/v1/me/checkins',headers:auth(f.other)});assert.equal(other.json().items.length,0);
 const path='/api/v1/admin/programs/'+f.program+'/checkins';
 assert.equal((await server.inject({url:path,headers:auth(f.admin)})).json().items.length,1);
 assert.equal((await server.inject({url:path,headers:auth(f.foreignAdmin)})).json().items.length,0);
 assert.equal((await server.inject({url:path,headers:auth(f.mod)})).statusCode,403);
 await pool.query('DELETE FROM grants WHERE member_id=$1',[f.admin]);assert.equal((await server.inject({url:path,headers:auth(f.admin)})).statusCode,403);
 assert.equal((await server.inject({url:'/api/v1/me/checkins'})).statusCode,401);
});
test('T-MSG-02: opt-out after planning blocks dispatch and reserves nothing',async()=>{
 const f=await fixture();await f.observe();while(await planOne()){}
 const n=(await pool.query('SELECT * FROM notifications WHERE program_id=$1 AND member_id=$2',[f.program,f.m])).rows[0];
 await setOptIn(f.m,false);await dispatchOne(n.id);
 assert.equal((await pool.query('SELECT reason FROM notifications WHERE id=$1',[n.id])).rows[0].reason,'OPT_OUT_OR_INACTIVE');
 assert.equal((await pool.query('SELECT * FROM cost_ledger WHERE notification_id=$1',[n.id])).rowCount,0);
});
test('T-MSG-09: concurrent dispatch cannot exceed remaining budget',async()=>{
 const f=await fixture();await f.observe();await setOptIn(f.other,true);while(await planOne()){}
 await pool.query('UPDATE budgets SET cap_units=1 WHERE organization_id=$1',[f.org]);
 const ns=(await pool.query("SELECT id FROM notifications WHERE program_id=$1 AND state='PLANNED'",[f.program])).rows;
 await Promise.all(ns.map(n=>dispatchOne(n.id)));
 const b=(await pool.query('SELECT * FROM budgets WHERE organization_id=$1',[f.org])).rows[0];assert.equal(b.reserved_units,'1');
 const rows=(await pool.query('SELECT state,reason FROM notifications WHERE program_id=$1',[f.program])).rows;
 assert.equal(rows.filter(n=>n.state==='DRY_RUN_PREPARED').length,1);assert.equal(rows.filter(n=>n.reason==='BUDGET_CAP').length,1);
});
test('T-LIVE-02/04/06: wrong source and provider outage never confirm live; health is durable and freshness-aware',async()=>{
 const f=await fixture();
 await pool.query("INSERT INTO grants(member_id,permission,branch_id) VALUES($1,'program.read',NULL)",[f.admin]);
 const empty=await server.inject({url:'/api/v1/admin/providers/health',headers:auth(f.admin)});
 assert.equal(empty.statusCode,200);assert.equal(empty.json().unknownWhenEmpty,true);assert.equal(empty.json().items.length,0);
 assert.equal((await server.inject({url:'/api/v1/admin/providers/health',headers:auth(f.m)})).statusCode,403);
 await f.observe('MockVideo_A',true,undefined,false,'unapproved');await f.observe('MockVideo_A',false);await f.observe('MockVideo_A',true,undefined,true);
 const p=(await pool.query('SELECT * FROM programs WHERE id=$1',[f.program])).rows[0];assert.equal(p.state,'SCHEDULED');assert.equal(p.current_sequence,null);
 let health=(await pool.query("SELECT * FROM provider_health WHERE organization_id=$1 AND provider_key='youtube'",[f.org])).rows[0];
 assert.equal(health.status,'DEGRADED');assert.equal(health.consecutive_failures,1);assert.ok(health.last_success_at);assert.ok(health.last_failure_at);
 let response=await server.inject({url:'/api/v1/admin/providers/health',headers:auth(f.admin)});
 assert.equal(response.json().items[0].freshness,'FRESH');assert.equal(response.json().items[0].status,'DEGRADED');
 await f.observe('MockVideo_A',true);
 health=(await pool.query("SELECT * FROM provider_health WHERE organization_id=$1 AND provider_key='youtube'",[f.org])).rows[0];
 assert.equal(health.status,'HEALTHY');assert.equal(health.consecutive_failures,0);assert.ok(health.last_failure_at);
 await pool.query("INSERT INTO mock_observations(program_id,video_id,channel_id,title,live,provider_error,observed_at,expected_revision) SELECT id,'MockVideo_C',$2,'CTDMP stale outage',true,true,now()-interval '5 minutes',revision FROM programs WHERE id=$1",[f.program,f.channel]);
 await observeOne();
 health=(await pool.query("SELECT * FROM provider_health WHERE organization_id=$1 AND provider_key='youtube'",[f.org])).rows[0];
 assert.equal(health.status,'HEALTHY');assert.equal(health.consecutive_failures,0);
 await pool.query("UPDATE provider_health SET last_attempt_at=now()-interval '3 minutes' WHERE organization_id=$1 AND provider_key='youtube'",[f.org]);
 response=await server.inject({url:'/api/v1/admin/providers/health',headers:auth(f.admin)});
 assert.equal(response.json().items[0].freshness,'STALE');assert.equal(response.json().items[0].status,'HEALTHY');
});
test('T-LIVE-05: competing streams require review without notification',async()=>{
 const f=await fixture();
 for(const video of ['MockVideo_A','MockVideo_B']) await pool.query("INSERT INTO mock_observations(program_id,video_id,channel_id,title,live,expected_revision) VALUES($1,$2,$3,'CTDMP',true,0)",[f.program,video,f.channel]);
 while(await observeOne()){}
 assert.equal((await pool.query('SELECT state FROM programs WHERE id=$1',[f.program])).rows[0].state,'AWAITING_ADMIN');
 assert.equal((await pool.query('SELECT * FROM domain_outbox WHERE program_id=$1',[f.program])).rowCount,0);
});
test('T-MSG-04/05: signed mock receipts are durable, idempotent, monotonic and reconciled',async()=>{
 const f=await fixture();
 await pool.query("INSERT INTO grants(member_id,permission,branch_id) VALUES($1,'messaging.read',NULL)",[f.admin]);
 const sendEvent=async(event:any)=>{
  const payload=JSON.stringify(event);
  const signature='sha256='+createHmac('sha256',config.WEBHOOK_SECRET).update(payload).digest('hex');
  return server.inject({method:'POST',url:'/webhooks/meta',headers:{'content-type':'application/json','x-hub-signature-256':signature},payload});
 };
 const messageId='mock-msg-'+randomUUID();
 const now=String(Math.floor(Date.now()/1000));
 const delivered={organizationId:f.org,id:'delivery-'+randomUUID(),kind:'delivered',messageId,timestamp:now};
 assert.equal((await server.inject({url:'/api/v1/admin/messages/receipts',headers:auth(f.admin)})).json().mode,'MOCK_CONTRACT');
 assert.equal((await server.inject({url:'/api/v1/admin/messages/receipts',headers:auth(f.m)})).statusCode,403);
 assert.equal((await sendEvent(delivered)).statusCode,202);assert.equal((await sendEvent(delivered)).statusCode,202);
 const eventKey='mock:'+f.org+':'+delivered.id+':delivered';
 assert.equal((await pool.query('SELECT * FROM webhook_inbox WHERE event_key=$1',[eventKey])).rowCount,1);
 assert.equal(await processWebhookOne(),true);assert.equal(await processWebhookOne(),false);
 assert.equal(await reconcileReceiptOne(),false);
 let receipt=(await pool.query('SELECT * FROM provider_receipts WHERE event_key=$1',[eventKey])).rows[0];
 assert.equal(receipt.reconciliation_status,'UNMATCHED');assert.equal(receipt.status,'DELIVERED');
 const notification=(await pool.query("INSERT INTO notifications(organization_id,program_id,member_id,purpose,channel,message_version,state,expires_at,cost_units,provider_message_id) VALUES($1,$2,$3,'LIVE_START','MOCK_WHATSAPP',1,'DRY_RUN_PREPARED',now()+interval '10 minutes',1,$4) RETURNING id",[f.org,f.program,f.m,messageId])).rows[0];
 assert.equal(await reconcileReceiptOne(),true);
 let projection=(await pool.query('SELECT provider_status FROM notifications WHERE id=$1',[notification.id])).rows[0];
 assert.equal(projection.provider_status,'DELIVERED');
 const sent={organizationId:f.org,id:'sent-'+randomUUID(),kind:'sent',messageId,timestamp:String(Number(now)-30)};
 assert.equal((await sendEvent(sent)).statusCode,202);assert.equal(await processWebhookOne(),true);
 projection=(await pool.query('SELECT provider_status FROM notifications WHERE id=$1',[notification.id])).rows[0];
 assert.equal(projection.provider_status,'DELIVERED');
 const read={organizationId:f.org,id:'read-'+randomUUID(),kind:'read',messageId,timestamp:String(Number(now)+1)};
 assert.equal((await sendEvent(read)).statusCode,202);assert.equal(await processWebhookOne(),true);
 const failed={organizationId:f.org,id:'failed-'+randomUUID(),kind:'failed',messageId,timestamp:String(Number(now)+2),errorCode:'TEMPORARY'};
 assert.equal((await sendEvent(failed)).statusCode,202);assert.equal(await processWebhookOne(),true);
 projection=(await pool.query('SELECT provider_status FROM notifications WHERE id=$1',[notification.id])).rows[0];
 assert.equal(projection.provider_status,'READ_OBSERVED');
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM provider_receipts WHERE organization_id=$1 AND reconciliation_status='MATCHED'",[f.org])).rows[0].n,4);
 assert.equal((await pool.query("SELECT safe_error_code FROM provider_receipts WHERE provider_message_id=$1 AND status='FAILED_FINAL'",[messageId])).rows[0].safe_error_code,'TEMPORARY');
 assert.equal((await sendEvent(read)).statusCode,202);assert.equal(await processWebhookOne(),false);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM provider_receipts WHERE organization_id=$1',[f.org])).rows[0].n,4);
 assert.equal((await server.inject({url:'/api/v1/admin/messages/receipts',headers:auth(f.admin)})).json().items.length,4);
 await pool.query("INSERT INTO grants(member_id,permission,branch_id) VALUES($1,'program.read',NULL)",[f.admin]);
 const adminSession=digest(config.FIXTURE_SECRET+':'+f.admin);
 await pool.query('INSERT INTO administrative_verifications(session_digest,verified_at) VALUES($1,now()) ON CONFLICT(session_digest) DO UPDATE SET verified_at=now()',[adminSession]);
 const adminPage=await server.inject({url:'/admin',headers:auth(f.admin)});
 assert.equal(adminPage.statusCode,200);assert.match(adminPage.body,/Provider receipt reconciliation/);assert.match(adminPage.body,/read observed/i);
 const scoped=await administrator(f,'messaging.read',f.foreignAdmin);
 await pool.query('UPDATE grants SET branch_id=$2 WHERE member_id=$1 AND permission=$3',[scoped.id,f.org+'-b','messaging.read']);
 assert.equal((await server.inject({url:'/api/v1/admin/messages/receipts',headers:auth(scoped.id)})).statusCode,403);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE actor=$1 AND action='messaging.receipts.read'",[f.admin])).rows[0].n,2);
 const badPayload=JSON.stringify({...delivered,id:'tampered'});
 const badRequest={method:'POST' as const,url:'/webhooks/meta',headers:{'content-type':'application/json','x-hub-signature-256':'sha256=invalid'},payload:badPayload};
 assert.equal((await server.inject(badRequest)).statusCode,403);
});
test('T-JOIN security: source revocation immediately blocks resolver',async()=>{
 const f=await fixture();await f.observe();const token=await f.join();const browser=randomToken();const nonce=await mintNonce(token,browser);
 await pool.query('UPDATE official_channels SET approved=false WHERE id=$1',[f.channel]);
 await assert.rejects(confirmJoin(token,nonce,browser),/SOURCE_REVIEW_REQUIRED/);
});
test('WEB: private HTML histories and scoped control room use current grants',async()=>{
 const f=await fixture();await f.observe();const token=await f.join();const browser=randomToken();await confirmJoin(token,await mintNonce(token,browser),browser,f.m);
 await pool.query("INSERT INTO grants VALUES($1,'program.read',null),($2,'program.read',null)",[f.admin,f.foreignAdmin]);
 const own=await server.inject({url:'/account/history',headers:auth(f.m)});assert.equal(own.statusCode,200);assert.match(own.body,/Matching signed-in fictional account/);
 const other=await server.inject({url:'/account/history',headers:auth(f.other)});assert.match(other.body,/No link openings yet/);
 const denied=await server.inject({url:'/account/history',headers:{accept:'text/html'}});assert.equal(denied.statusCode,401);assert.match(denied.body,/Sign in/);
 const admin=await server.inject({url:'/admin',headers:auth(f.admin)});assert.equal(admin.statusCode,200);assert.ok(admin.body.includes(f.m));
 const foreign=await server.inject({url:'/admin',headers:auth(f.foreignAdmin)});assert.equal(foreign.statusCode,200);assert.ok(!foreign.body.includes(f.m));
 assert.equal((await server.inject({url:'/admin',headers:auth(f.mod)})).statusCode,403);
 await pool.query("DELETE FROM grants WHERE member_id=$1 AND permission='program.read'",[f.admin]);
 assert.equal((await server.inject({url:'/admin',headers:auth(f.admin)})).statusCode,403);
});
test('WEB: cookie preference forms reject CSRF, persist withdrawal and revoke logout session',async()=>{
 const f=await fixture();const session=config.FIXTURE_SECRET+':'+f.m;
 const landing=await server.inject({url:'/account/preferences',headers:{cookie:'fixture_session='+session}});
 assert.equal(landing.statusCode,200);
 const csrf=landing.body.match(/name="csrf" value="([^"]+)"/)![1];
 const cookies='fixture_session='+session+'; '+String(landing.headers['set-cookie']).split(';')[0];
 const url='/account/preferences';
 assert.equal((await server.inject({method:'POST',url,headers:{cookie:cookies,origin:'https://attacker.invalid'},payload:{csrf}})).statusCode,403);
 assert.equal((await server.inject({method:'POST',url,headers:{cookie:cookies,origin:'http://127.0.0.1:'+config.PORT},payload:{csrf}})).statusCode,303);
 assert.equal((await pool.query('SELECT live_start FROM preferences WHERE member_id=$1',[f.m])).rows[0].live_start,false);
 const account=await server.inject({url:'/account',headers:{cookie:cookies}});
 const logout=account.body.match(/name="csrf" value="([^"]+)"/)![1];
 assert.equal((await server.inject({method:'POST',url:'/account/sign-out',headers:{cookie:cookies,origin:'http://127.0.0.1:'+config.PORT},payload:{csrf:logout}})).statusCode,303);
 assert.equal((await server.inject({url:'/account',headers:{cookie:cookies}})).statusCode,401);
});
test('WEB: sign-in requires protected form and valid expiring fixture session',async()=>{
 const f=await fixture();
 const landing=await server.inject({url:'/demo/sign-in'});
 const csrf=landing.body.match(/name="csrf" value="([^"]+)"/)![1];
 const cookie=String(landing.headers['set-cookie']).split(';')[0];
 const request={method:'POST' as const,url:'/demo/sign-in',headers:{cookie,origin:'http://127.0.0.1:'+config.PORT},payload:{csrf,access:config.FIXTURE_SECRET+':'+f.m}};
 assert.equal((await server.inject(request)).statusCode,303);
 assert.equal((await server.inject({...request,headers:{...request.headers,origin:'null','sec-fetch-site':'cross-site',host:'127.0.0.1:'+config.PORT}})).statusCode,403);
 assert.equal((await server.inject({...request,headers:{...request.headers,origin:'null','sec-fetch-site':'same-origin',host:'127.0.0.1:'+config.PORT}})).statusCode,303);
 await pool.query('UPDATE fixture_sessions SET expires_at=now() WHERE member_id=$1',[f.m]);
 assert.equal((await server.inject(request)).statusCode,401);
});
async function administrator(f:Awaited<ReturnType<typeof fixture>>,permission='program.manage',member=f.admin) {
 await pool.query('INSERT INTO grants(member_id,permission,branch_id) VALUES($1,$2,null) ON CONFLICT(member_id,permission) DO UPDATE SET branch_id=null',[member,permission]);
 const session=digest(config.FIXTURE_SECRET+':'+member);
 await pool.query('INSERT INTO administrative_verifications VALUES($1,now()) ON CONFLICT(session_digest) DO UPDATE SET verified_at=now()',[session]);
 return {id:member,organization_id:f.org,session_digest:session};
}
async function candidate(f:Awaited<ReturnType<typeof fixture>>,video='MockVideo_A',source=f.channel,live=true) {
 return (await pool.query("INSERT INTO mock_observations(program_id,video_id,channel_id,title,live,expected_revision) SELECT id,$2,$3,'CTDMP simulated candidate',$4,revision FROM programs WHERE id=$1 RETURNING id",[f.program,video,source,live])).rows[0].id as string;
}
const revision=async(program:string)=>(await pool.query('SELECT revision FROM programs WHERE id=$1',[program])).rows[0].revision as number;
test('ADMIN: one-off schedule is timezone-checked, revisioned, and available through a protected browser form',async()=>{
 const f=await fixture();const actor=await administrator(f);const path='/api/v1/admin/programs/'+f.program+'/schedule';
 const next=await server.inject({url:'/api/v1/public/programs/next'});
 assert.equal(next.statusCode,200);assert.equal(next.json().mode,'MOCK');assert.ok(Object.hasOwn(next.json(),'program'));
 const future=new Date(Date.now()+2*86400000);const scheduledStartAt=new Date(future.getTime()+3600000).toISOString().slice(0,19)+'+01:00';
 const body={revision:0,reason:'Owner configured fictional schedule',scheduledStartAt,timeZone:'Africa/Lagos'};
 let response=await server.inject({method:'PUT',url:path,headers:auth(actor.id),payload:{...body,scheduledStartAt:scheduledStartAt.replace('+01:00','+00:00')}});
 assert.equal(response.statusCode,422);assert.equal(response.json().error.code,'TIMEZONE_OFFSET_MISMATCH');
 response=await server.inject({method:'PUT',url:path,headers:auth(actor.id),payload:{...body,timeZone:'Unknown/Zone'}});
 assert.equal(response.statusCode,422);assert.equal(response.json().error.code,'INVALID_TIME_ZONE');
 response=await server.inject({method:'PUT',url:path,headers:auth(actor.id),payload:{...body,scheduledStartAt:'2027-03-28T02:30:00+01:00',timeZone:'Europe/Berlin'}});
 assert.equal(response.statusCode,422);assert.equal(response.json().error.code,'TIMEZONE_OFFSET_MISMATCH');
 await pool.query("INSERT INTO grants(member_id,permission,branch_id) VALUES($1,'program.read',NULL)",[actor.id]);
 const session=config.FIXTURE_SECRET+':'+actor.id;
 const landing=await server.inject({url:'/admin',headers:{cookie:'fixture_session='+session}});
 assert.equal(landing.statusCode,200);assert.match(landing.body,/One-off mock schedule/);
 const form=landing.body.match(new RegExp('<form method=post action="/admin/programs/'+f.program+'/schedule">([\\s\\S]*?)</form>'))?.[1];
 assert.ok(form);const csrf=form.match(/name="csrf" value="([^"]+)"/)?.[1];assert.ok(csrf);
 const browserCookie=String(landing.headers['set-cookie']).split(';')[0];
 const cookie='fixture_session='+session+'; '+browserCookie;
 response=await server.inject({method:'POST',url:'/admin/programs/'+f.program+'/schedule',headers:{cookie,origin:'http://127.0.0.1:'+config.PORT,host:'127.0.0.1:'+config.PORT},payload:{csrf,revision:'0',reason:body.reason,scheduledStartAt,timeZone:body.timeZone}});
 assert.equal(response.statusCode,303);
 let program=(await pool.query('SELECT * FROM programs WHERE id=$1',[f.program])).rows[0];
 assert.equal(new Date(program.local_date).toISOString().slice(0,10),scheduledStartAt.slice(0,10));assert.equal(program.schedule_timezone,'Africa/Lagos');assert.equal(new Date(program.scheduled_start_at).toISOString(),new Date(scheduledStartAt).toISOString());
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM program_schedule_history WHERE program_id=$1',[f.program])).rows[0].n,1);
 assert.equal((await pool.query("SELECT action FROM audit_logs WHERE actor=$1 AND action='program.schedule_updated' AND resource_id=$2",[actor.id,f.program])).rowCount,1);
 response=await server.inject({method:'PUT',url:path,headers:auth(actor.id),payload:body});
 assert.equal(response.statusCode,409);assert.equal(response.json().error.code,'REVISION_CONFLICT');
 const futureAgain=new Date(Date.now()+3*86400000);const later=new Date(futureAgain.getTime()+3600000).toISOString().slice(0,19)+'+01:00';
 response=await server.inject({method:'PUT',url:path,headers:auth(actor.id),payload:{...body,revision:1,scheduledStartAt:later,reason:'Reschedule the fictional occurrence'}});
 assert.equal(response.statusCode,200);assert.equal(response.json().localDate,later.slice(0,10));
 program=(await pool.query('SELECT * FROM programs WHERE id=$1',[f.program])).rows[0];assert.equal(program.revision,2);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM program_schedule_history WHERE program_id=$1',[f.program])).rows[0].n,2);
});
test('ADMIN: mock channel governance is audited and revoking the active source pauses its resolver',async()=>{
 const f=await fixture();const actor=await administrator(f);await f.observe();
 const token=await f.join();const browser=randomToken();const nonce=await mintNonce(token,browser);
 const path='/api/v1/admin/programs/'+f.program+'/channels/'+f.channel+'/approval';
 const oldRevision=await revision(f.program);
 let response=await server.inject({method:'POST',url:path,headers:auth(actor.id),payload:{revision:oldRevision,approved:false,reason:'Owner review revoked this mock source'}});
 assert.equal(response.statusCode,200);assert.equal(response.json().state,'AWAITING_ADMIN');assert.equal(response.json().approved,false);
 assert.equal((await pool.query('SELECT approved FROM official_channels WHERE id=$1',[f.channel])).rows[0].approved,false);
 const history=(await pool.query('SELECT * FROM channel_approval_history WHERE program_id=$1',[f.program])).rows[0];
 assert.equal(history.actor,actor.id);assert.equal(history.previous_approved,true);assert.equal(history.approved,false);assert.equal(history.evidence.activeDestinationInvalidated,true);
 assert.equal((await pool.query("SELECT action FROM audit_logs WHERE actor=$1 AND resource_id=$2 ORDER BY id DESC LIMIT 1",[actor.id,f.channel])).rows[0].action,'channel.mock_revoked');
 await assert.rejects(confirmJoin(token,nonce,browser),/STREAM_REVIEW_REQUIRED/);
 assert.equal((await pool.query('SELECT * FROM checkin_events WHERE program_id=$1',[f.program])).rowCount,0);
 response=await server.inject({method:'POST',url:path,headers:auth(actor.id),payload:{revision:oldRevision,approved:true,reason:'Stale form must not reapprove source'}});
 assert.equal(response.statusCode,409);
 response=await server.inject({method:'POST',url:path,headers:auth(actor.id),payload:{revision:await revision(f.program),approved:true,reason:'Owner review approved mock source'}});
 assert.equal(response.statusCode,200);assert.equal(response.json().state,'AWAITING_ADMIN');
 const realId=f.org+'-fixture-real-disabled';
 await pool.query('INSERT INTO official_channels(id,organization_id,program_id,approved,mock) VALUES($1,$2,$3,false,false)',[realId,f.org,f.program]);
 response=await server.inject({method:'POST',url:'/api/v1/admin/programs/'+f.program+'/channels/'+realId+'/approval',headers:auth(actor.id),payload:{revision:await revision(f.program),approved:true,reason:'Real sources need activation approval'}});
 assert.equal(response.statusCode,409);assert.equal(response.json().error.code,'REAL_SOURCE_CONFIGURATION_DISABLED');
 const scoped=await administrator(f,'program.manage',f.foreignAdmin);
 await pool.query('UPDATE grants SET branch_id=$2 WHERE member_id=$1 AND permission=$3',[scoped.id,f.org+'-b','program.manage']);
 response=await server.inject({method:'POST',url:path,headers:auth(scoped.id),payload:{revision:await revision(f.program),approved:false,reason:'Branch grant must not change global source'}});
 assert.equal(response.statusCode,403);
});
test('ADMIN: competing candidate approval is revision-checked and stores evidence; completion is final',async()=>{
 const f=await fixture();const actor=await administrator(f);const first=await candidate(f);await candidate(f,'MockVideo_B');while(await observeOne()){}
 assert.equal((await pool.query('SELECT state FROM programs WHERE id=$1',[f.program])).rows[0].state,'AWAITING_ADMIN');
 const input={revision:await revision(f.program),reason:'Reviewed official mock source'};
 const url='/api/v1/admin/programs/'+f.program+'/candidates/'+first+'/approve';
 const result=await server.inject({method:'POST',url,headers:auth(actor.id),payload:input});assert.equal(result.statusCode,200);
 assert.equal((await server.inject({method:'POST',url,headers:auth(actor.id),payload:input})).statusCode,409);
 assert.equal((await pool.query('SELECT decision FROM candidate_decisions WHERE program_id=$1',[f.program])).rows[0].decision,'APPROVED');
 assert.equal((await pool.query('SELECT actor FROM program_transitions WHERE program_id=$1 AND revision=$2',[f.program,input.revision+1])).rows[0].actor,actor.id);
 await finishProgram(actor,f.program,{revision:await revision(f.program),reason:'Mock session has now finished'});
 await f.observe('MockVideo_A');assert.equal((await pool.query('SELECT state FROM programs WHERE id=$1',[f.program])).rows[0].state,'COMPLETED');
 assert.equal((await pool.query("SELECT count(*)::int n FROM domain_outbox WHERE program_id=$1 AND event_type='program.live_confirmed'",[f.program])).rows[0].n,1);
});
test('ADMIN: source authority, evidence freshness, branch scope and recent authentication cannot be bypassed',async()=>{
 const f=await fixture();const actor=await administrator(f);const observation=await candidate(f,'MockVideo_A','unapproved');
 const review=()=>reviewCandidate(actor,f.program,{revision:0,reason:'Check mandatory source evidence',observationId:observation,decision:'APPROVED'});
 await assert.rejects(review(),/CANDIDATE_NOT_VERIFIED/);
 const valid=await candidate(f,'MockVideo_B');await pool.query("UPDATE mock_observations SET observed_at=now()-interval '3 minutes' WHERE id=$1",[valid]);
 await assert.rejects(reviewCandidate(actor,f.program,{revision:0,reason:'Reject stale evidence for approval',observationId:valid,decision:'APPROVED'}),/STALE_EVIDENCE/);
 await pool.query('UPDATE grants SET branch_id=$2 WHERE member_id=$1 AND permission=$3',[actor.id,f.org+'-a','program.manage']);
 await assert.rejects(review(),/PERMISSION_DENIED/);
 await pool.query("UPDATE grants SET branch_id=null WHERE member_id=$1 AND permission='program.manage'",[actor.id]);
 await pool.query("UPDATE administrative_verifications SET verified_at=now()-interval '16 minutes' WHERE session_digest=$1",[actor.session_digest]);
 await assert.rejects(review(),/RECENT_AUTHENTICATION_REQUIRED/);
 assert.equal(await revision(f.program),0);
});
test('ADMIN: rejected video remains blocked for the watcher until explicit fresh approval',async()=>{
 const f=await fixture();const actor=await administrator(f);const first=await candidate(f);
 await reviewCandidate(actor,f.program,{revision:0,reason:'Wrong candidate pending review',observationId:first,decision:'REJECTED'});
 await f.observe();assert.equal((await pool.query('SELECT state FROM programs WHERE id=$1',[f.program])).rows[0].state,'SCHEDULED');
 const latest=(await pool.query('SELECT id FROM mock_observations WHERE program_id=$1 ORDER BY id DESC LIMIT 1',[f.program])).rows[0].id;
 await reviewCandidate(actor,f.program,{revision:await revision(f.program),reason:'New evidence now supports this source',observationId:latest,decision:'APPROVED'});
 assert.equal((await pool.query('SELECT current_sequence FROM programs WHERE id=$1',[f.program])).rows[0].current_sequence,1);
});
test('ADMIN: manual replacement preserves personal capability and initial notification identity',async()=>{
 const f=await fixture();const actor=await administrator(f);await f.observe();const token=await f.join();const browser=randomToken();await confirmJoin(token,await mintNonce(token,browser),browser,f.m);
 const replacement=await candidate(f,'MockVideo_B');while(await observeOne()){}
 await reviewCandidate(actor,f.program,{revision:await revision(f.program),reason:'Verified mock replacement source B',observationId:replacement,decision:'APPROVED'});
 assert.ok((await confirmJoin(token,await mintNonce(token,browser),browser,f.m)).location.endsWith('MockVideo_B'));
 assert.equal((await pool.query('SELECT count(*)::int n FROM checkin_events WHERE program_id=$1',[f.program])).rows[0].n,1);
 assert.equal((await pool.query("SELECT count(*)::int n FROM domain_outbox WHERE program_id=$1 AND event_type='program.live_confirmed'",[f.program])).rows[0].n,1);
});
test('ADMIN: concurrent decisions serialize; stale revisions never overwrite the winner',async()=>{
 const f=await fixture();const actor=await administrator(f);const first=await candidate(f),second=await candidate(f,'MockVideo_B');
 const results=await Promise.allSettled([first,second].map(id=>reviewCandidate(actor,f.program,{revision:0,reason:'Concurrent operator decision test',observationId:id,decision:'APPROVED'})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const rejected=results.find(r=>r.status==='rejected') as PromiseRejectedResult;assert.match(rejected.reason.message,/REVISION_CONFLICT/);
 assert.equal((await pool.query('SELECT count(*)::int n FROM stream_versions WHERE program_id=$1',[f.program])).rows[0].n,1);
});
test('ADMIN: watcher and manual decision share lock order and create one initial event',async()=>{
 const f=await fixture();const actor=await administrator(f);const observation=await candidate(f);
 const results=await Promise.allSettled([observeOne(),reviewCandidate(actor,f.program,{revision:0,reason:'Operator and watcher concurrency test',observationId:observation,decision:'APPROVED'})]);
 for(const result of results)if(result.status==='rejected')assert.match(result.reason.message,/REVISION_CONFLICT/);
 assert.equal((await pool.query('SELECT current_sequence FROM programs WHERE id=$1',[f.program])).rows[0].current_sequence,1);
 assert.equal((await pool.query("SELECT count(*)::int n FROM domain_outbox WHERE program_id=$1 AND event_type='program.live_confirmed'",[f.program])).rows[0].n,1);
});
test('ADMIN: sending pause is separately granted, auditable and revision-checked',async()=>{
 const f=await fixture();const actor=await administrator(f);await f.observe();while(await planOne()){}
 await assert.rejects(setSendingPaused(actor,{revision:0,paused:true,reason:'Pause pending manual review'}),/PERMISSION_DENIED/);
 await administrator(f,'messaging.manage');await setSendingPaused(actor,{revision:0,paused:true,reason:'Pause pending manual review'});
 await assert.rejects(setSendingPaused(actor,{revision:0,paused:false,reason:'Stale switch should be rejected'}),/REVISION_CONFLICT/);
 const n=(await pool.query('SELECT id FROM notifications WHERE program_id=$1 AND member_id=$2',[f.program,f.m])).rows[0];await dispatchOne(n.id);
 assert.equal((await pool.query('SELECT reason FROM notifications WHERE id=$1',[n.id])).rows[0].reason,'PAUSED');
 const audit=(await pool.query("SELECT details FROM audit_logs WHERE actor=$1 AND action='sending.paused'",[actor.id])).rows[0];assert.equal(audit.details.reason,'Pause pending manual review');
});
test('ADMIN: explicit Home selection is scoped, records a reason and rejects stale selection forms',async()=>{
 const f=await fixture();const actor=await administrator(f);const input={revision:0,selectionRevision:0,reason:'Publish this mock session on Home'};
 await selectProgram(actor,f.program,input);
 await assert.rejects(selectProgram(actor,f.program,input),/REVISION_CONFLICT/);
 const other=await fixture();await assert.rejects(selectProgram(actor,other.program,{...input,selectionRevision:1}),/NOT_FOUND/);
 const audit=(await pool.query("SELECT details FROM audit_logs WHERE actor=$1 AND action='program.selected'",[actor.id])).rows[0];assert.equal(audit.details.reason,input.reason);
});
test('LIVE: recovering the same source preserves stream revision and sends no new initial event',async()=>{
 const f=await fixture();await f.observe();await f.observe('MockVideo_A',false);await f.observe();
 assert.equal((await pool.query('SELECT current_sequence FROM programs WHERE id=$1',[f.program])).rows[0].current_sequence,1);
 assert.equal((await pool.query('SELECT count(*)::int n FROM stream_versions WHERE program_id=$1',[f.program])).rows[0].n,1);
});
test('DEMO: fixture controls require explicit grants, reject ordinary sessions and replay creation safely',async()=>{
 const f=await fixture();const actor=await administrator(f);const input={selectionRevision:0,reason:'Create a controlled fictional session',requestKey:randomToken()};
 await assert.rejects(createScenario(actor,input),/PERMISSION_DENIED/);
 await administrator(f,'demo.manage');await assert.rejects(queueScenarioObservation(actor,f.program,{revision:0,scenario:'START_A'}),/NOT_FOUND/);
 const first=await createScenario(actor,input),again=await createScenario(actor,input);assert.equal(first.programId,again.programId);assert.equal(again.replayed,true);
 await assert.rejects(createScenario(actor,{...input,reason:'Different input using the same request key'}),/IDEMPOTENCY_CONFLICT/);
 await queueScenarioObservation(actor,first.programId,{revision:0,scenario:'START_A'});while(await observeOne()){}
 const p=(await pool.query('SELECT state,current_sequence FROM programs WHERE id=$1',[first.programId])).rows[0];assert.equal(p.state,'LIVE_CONFIRMED');assert.equal(p.current_sequence,1);
});
test('WEB: prepared-alert links are visible only to their fictional recipient',async()=>{
 const f=await fixture();await f.observe();while(await planOne()){}const n=(await pool.query('SELECT id FROM notifications WHERE program_id=$1 AND member_id=$2',[f.program,f.m])).rows[0];await dispatchOne(n.id);
 const own=await server.inject({url:'/account/alerts',headers:auth(f.m)});assert.equal(own.statusCode,200);assert.match(own.body,/href="\/j\/[A-Za-z0-9_-]{43}"/);assert.match(own.body,/No WhatsApp message was sent/);
 const other=await server.inject({url:'/account/alerts',headers:auth(f.other)});assert.equal(other.statusCode,200);assert.ok(!other.body.includes('href="/j/'));
 assert.equal((await server.inject({url:'/account/alerts'})).statusCode,401);
});
after(async()=>{
 // Fixtures remain isolated and explicitly fictional; retained for inspection, never real member data.
 await server.close();await pool.end();
});
