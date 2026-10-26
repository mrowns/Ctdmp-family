import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { pool, tx } from '../packages/db/index.ts';
import { app } from '../apps/api/src/app.ts';
import { observeOne,planOne,dispatchOne,mintNonce,confirmJoin,setOptIn } from '../packages/shared/domain.ts';
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
test('T-LIVE-02/04/06: wrong source, upcoming video, provider outage never confirm live',async()=>{
 const f=await fixture();await f.observe('MockVideo_A',true,undefined,false,'unapproved');await f.observe('MockVideo_A',false);await f.observe('MockVideo_A',true,undefined,true);
 const p=(await pool.query('SELECT * FROM programs WHERE id=$1',[f.program])).rows[0];assert.equal(p.state,'SCHEDULED');assert.equal(p.current_sequence,null);
});
test('T-LIVE-05: competing streams require review without notification',async()=>{
 const f=await fixture();
 for(const video of ['MockVideo_A','MockVideo_B']) await pool.query("INSERT INTO mock_observations(program_id,video_id,channel_id,title,live,expected_revision) VALUES($1,$2,$3,'CTDMP',true,0)",[f.program,video,f.channel]);
 while(await observeOne()){}
 assert.equal((await pool.query('SELECT state FROM programs WHERE id=$1',[f.program])).rows[0].state,'AWAITING_ADMIN');
 assert.equal((await pool.query('SELECT * FROM domain_outbox WHERE program_id=$1',[f.program])).rowCount,0);
});
test('T-MSG-04/05: signed mock webhook durably accepted; duplicate inbox key has one effect',async()=>{
 const event={id:randomUUID(),kind:'delivered',messageId:'mock-id'};const payload=JSON.stringify(event);
 const signature='sha256='+createHmac('sha256',config.WEBHOOK_SECRET).update(payload).digest('hex');
 const request={method:'POST' as const,url:'/webhooks/meta',headers:{'content-type':'application/json','x-hub-signature-256':signature},payload};
 assert.equal((await server.inject(request)).statusCode,202);assert.equal((await server.inject(request)).statusCode,202);
 assert.equal((await pool.query('SELECT * FROM webhook_inbox WHERE event_key=$1',['mock:'+event.id+':delivered'])).rowCount,1);
 assert.equal((await server.inject({...request,payload:payload+' '})).statusCode,403);
 await pool.query('DELETE FROM webhook_inbox WHERE event_key=$1',['mock:'+event.id+':delivered']);
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
