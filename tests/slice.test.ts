import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { pool, tx } from '../packages/db/index.ts';
import { app } from '../apps/api/src/app.ts';
import { observeOne,planOne,dispatchOne,mintNonce,confirmJoin,setOptIn } from '../packages/shared/domain.ts';
import { randomToken,digest,decrypt } from '../packages/integrations/crypto.ts';
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
after(async()=>{
 // Fixtures remain isolated and explicitly fictional; retained for inspection, never real member data.
 await server.close();await pool.end();
});
