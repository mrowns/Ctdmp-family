import { mockStreamDestination } from '../integrations/destinations.ts';
import { recordTransition } from './programs.ts';
import { pool, tx } from '../db/index.ts';
import { randomToken, digest, encrypt } from '../integrations/crypto.ts';
export class DomainError extends Error { constructor(public code:string, public status=409) { super(code); } }
export async function observeOne():Promise<boolean> {
 return tx(async c=>{
  const candidate=(await c.query('SELECT id,program_id FROM mock_observations WHERE NOT processed ORDER BY id LIMIT 1')).rows[0];
  if(!candidate) return false;
  // Program first: the same lock order as administrator decisions prevents deadlocks.
  const p=(await c.query('SELECT * FROM programs WHERE id=$1 FOR UPDATE',[candidate.program_id])).rows[0];
  const o=(await c.query('SELECT * FROM mock_observations WHERE id=$1 AND NOT processed FOR UPDATE',[candidate.id])).rows[0];
  if(!o)return true;
  let outcome='IGNORED';
  const finish=async()=>{await c.query('UPDATE mock_observations SET processed=true,outcome=$2 WHERE id=$1',[o.id,outcome]);return true;};
  if(p.state==='COMPLETED') {outcome='SESSION_COMPLETED';return finish();}
  if(o.provider_error) { outcome='PROVIDER_DEGRADED'; return finish(); }
  if(o.expected_revision!==p.revision) { outcome='STALE_REVISION'; return finish(); }
  if(Date.now()-new Date(o.observed_at).getTime()>120000 || new Date(o.observed_at).getTime()>Date.now()+5000) { outcome='STALE_EVIDENCE'; return finish(); }
  const approved=(await c.query('SELECT 1 FROM official_channels WHERE id=$1 AND program_id=$2 AND organization_id=$3 AND approved AND mock FOR SHARE',[o.channel_id,p.id,p.organization_id])).rowCount;
  if(!approved || !/ctdmp/i.test(o.title) || !/^[A-Za-z0-9_-]{11}$/.test(o.video_id)) { outcome='REJECTED_SOURCE_OR_MATCH'; return finish(); }
  const decision=(await c.query('SELECT decision FROM candidate_decisions WHERE program_id=$1 AND video_id=$2 ORDER BY id DESC LIMIT 1',[p.id,o.video_id])).rows[0];
  if(decision?.decision==='REJECTED') {outcome='REJECTED_BY_ADMIN';return finish();}
  const current=p.current_sequence ? (await c.query('SELECT * FROM stream_versions WHERE program_id=$1 AND sequence=$2',[p.id,p.current_sequence])).rows[0] : null;
  if(!o.live || !o.available) {
   if(current?.video_id===o.video_id && p.state==='LIVE_CONFIRMED') {
    await c.query("UPDATE programs SET state='SUSPECTED_INTERRUPTION',revision=revision+1 WHERE id=$1",[p.id]);
    await c.query("INSERT INTO domain_outbox(event_key,program_id,event_type,revision) VALUES($1,$2,'program.interruption_suspected',$3) ON CONFLICT DO NOTHING",[p.id+':interruption:'+(p.revision+1),p.id,p.revision+1]);
    await recordTransition(c,p,'SUSPECTED_INTERRUPTION','Observed mock interruption',null,o.id,{videoId:o.video_id,available:o.available,live:o.live});
    outcome='INTERRUPTION_SUSPECTED';
   } else outcome='NOT_LIVE';
   return finish();
  }
  if(current?.video_id===o.video_id && p.state==='LIVE_CONFIRMED') { outcome='ALREADY_CURRENT';return finish(); }
  if(current?.video_id===o.video_id && ['SUSPECTED_INTERRUPTION','RECOVERY_SEARCH'].includes(p.state)) {
   await c.query("UPDATE programs SET state='LIVE_CONFIRMED',revision=revision+1 WHERE id=$1",[p.id]);
   await recordTransition(c,p,'LIVE_CONFIRMED','Existing mock source recovered',null,o.id,{videoId:o.video_id});
   await c.query("INSERT INTO domain_outbox(event_key,program_id,event_type,revision) VALUES($1,$2,'program.recovered',$3) ON CONFLICT DO NOTHING",[p.id+':recovered:'+(p.revision+1),p.id,p.revision+1]);
   outcome='RECOVERED';return finish();
  }
  const competing=(await c.query(`SELECT 1 FROM mock_observations WHERE program_id=$1 AND NOT processed AND live AND available AND NOT provider_error AND expected_revision=$2 AND video_id<>$3 AND observed_at>now()-interval '2 minutes' LIMIT 1`,[p.id,p.revision,o.video_id])).rowCount;
  if(competing || (current && p.state==='LIVE_CONFIRMED') || p.state==='AWAITING_ADMIN' || p.state==='COMPLETED') {
   await c.query("UPDATE programs SET state='AWAITING_ADMIN',revision=revision+1 WHERE id=$1",[p.id]);await recordTransition(c,p,'AWAITING_ADMIN','Competing mock source evidence',null,o.id,{videoId:o.video_id});outcome='REVIEW_REQUIRED';return finish();
  }
  const sequence=(p.current_sequence??0)+1;
  await c.query('INSERT INTO stream_versions VALUES($1,$2,$3,$4,$5,$6)',[p.id,sequence,o.video_id,o.channel_id,o.observed_at,current?'Verified mock continuation':'Verified mock initial source']);
  await c.query("UPDATE programs SET state='LIVE_CONFIRMED',revision=revision+1,current_sequence=$2 WHERE id=$1",[p.id,sequence]);
  await recordTransition(c,p,'LIVE_CONFIRMED',current?'Verified mock continuation':'Verified mock initial source',null,o.id,{videoId:o.video_id,channelId:o.channel_id});
  const type=current?'program.stream_replaced':'program.live_confirmed';
  const key=current?p.id+':replacement:'+sequence:p.id+':initial';
  await c.query('INSERT INTO domain_outbox(event_key,program_id,event_type,revision) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[key,p.id,type,p.revision+1]);
  outcome=current?'REPLACED':'CONFIRMED';return finish();
 });
}
export async function planOne():Promise<boolean> {
 return tx(async c=>{
  const e=(await c.query('SELECT * FROM domain_outbox WHERE NOT processed ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1')).rows[0];
  if(!e) return false;
  if(e.event_type==='program.live_confirmed') {
   const p=(await c.query('SELECT * FROM programs WHERE id=$1',[e.program_id])).rows[0];
   const members=(await c.query('SELECT m.id,p.live_start FROM members m JOIN preferences p ON p.member_id=m.id WHERE m.organization_id=$1 AND m.active ORDER BY m.id',[p.organization_id])).rows;
   for(const m of members) {
    const row=(await c.query("INSERT INTO notifications(organization_id,program_id,member_id,expires_at) VALUES($1,$2,$3,now()+interval '15 minutes') ON CONFLICT DO NOTHING RETURNING id",[p.organization_id,p.id,m.id])).rows[0];
    if(!row) continue;
    if(!m.live_start) { await c.query("UPDATE notifications SET state='SUPPRESSED',reason='NO_OPT_IN' WHERE id=$1",[row.id]);continue; }
    const token=randomToken();
    await c.query("INSERT INTO join_links VALUES($1,$2,$3,$4,'LIVE_LINK_OPENED',now()+interval '6 hours',false)",[digest(token),p.organization_id,m.id,p.id]);
    await c.query('UPDATE notifications SET payload_cipher=$2 WHERE id=$1',[row.id,encrypt(JSON.stringify({path:'/j/'+token,mode:'DRY_RUN'}))]);
   }
  }
  await c.query('UPDATE domain_outbox SET processed=true WHERE id=$1',[e.id]);return true;
 });
}
export async function dispatchOne(id:string):Promise<void> {
 await tx(async c=>{
  const n=(await c.query('SELECT * FROM notifications WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!n || n.state!=='PLANNED') return;
  const pref=(await c.query('SELECT p.*,m.active FROM preferences p JOIN members m ON m.id=p.member_id WHERE p.member_id=$1 FOR UPDATE OF p,m',[n.member_id])).rows[0];
  const suppress=async(reason:string)=>{await c.query("UPDATE notifications SET state='SUPPRESSED',reason=$2,payload_cipher=null WHERE id=$1",[id,reason]);};
  if(!pref?.active || !pref.live_start) return suppress('OPT_OUT_OR_INACTIVE');
  const consent=(await c.query("SELECT opted_in FROM consent_records WHERE member_id=$1 AND purpose='LIVE_START' ORDER BY id DESC LIMIT 1",[n.member_id])).rows[0];
  if(!consent?.opted_in) return suppress('NO_VALID_CONSENT');
  const live=(await c.query('SELECT state FROM programs WHERE id=$1',[n.program_id])).rows[0];
  if(live.state!=='LIVE_CONFIRMED' || new Date(n.expires_at).getTime()<Date.now()) return suppress('EXPIRED_OR_NOT_LIVE');
  const control=(await c.query('SELECT dry_run_enabled FROM sending_controls WHERE organization_id=$1 FOR SHARE',[n.organization_id])).rows[0];
  if(!control?.dry_run_enabled) return suppress('PAUSED');
  const template=(await c.query("SELECT 1 FROM templates WHERE id=$1 AND approved AND provider_mode='mock' AND purpose=$2 AND version=$3",[n.template_id,n.purpose,n.message_version])).rowCount;
  if(!template) return suppress('TEMPLATE_BLOCKED');
  const budget=(await c.query('UPDATE budgets SET reserved_units=reserved_units+$2 WHERE organization_id=$1 AND cap_units-reserved_units >= $2 RETURNING organization_id',[n.organization_id,n.cost_units])).rowCount;
  if(!budget) return suppress('BUDGET_CAP');
  await c.query('INSERT INTO cost_ledger(notification_id,units) VALUES($1,$2)',[id,n.cost_units]);
  await c.query("UPDATE notifications SET state='DRY_RUN_PREPARED',reason='MOCK_PROVIDER_NO_EXTERNAL_SEND' WHERE id=$1",[id]);
 });
}
export async function setOptIn(member:string,value:boolean) {
 await tx(async c=>{
  await c.query('SELECT member_id FROM preferences WHERE member_id=$1 FOR UPDATE',[member]);
  await c.query('UPDATE preferences SET live_start=$2,revision=revision+1 WHERE member_id=$1',[member,value]);
  await c.query("INSERT INTO consent_records(member_id,purpose,opted_in,wording_version) VALUES($1,'LIVE_START',$2,'fixture-v1')",[member,value]);
 });
}
export async function mintNonce(token:string,browser:string) {
 const nonce=randomToken();
 const row=await pool.query("INSERT INTO join_nonces SELECT $1,digest,$3,now()+interval '5 minutes',false FROM join_links j JOIN members m ON m.id=j.member_id WHERE j.digest=$2 AND NOT revoked AND j.expires_at>now() AND m.active RETURNING digest",[digest(nonce),digest(token),digest(browser)]);
 if(!row.rowCount) throw new DomainError('LINK_UNAVAILABLE',404);
 return nonce;
}
export async function confirmJoin(token:string,nonce:string,browser:string,actor?:string) {
 return tx(async c=>{
  const j=(await c.query('SELECT j.*,m.active FROM join_links j JOIN members m ON m.id=j.member_id WHERE digest=$1 FOR UPDATE OF j,m',[digest(token)])).rows[0];
  if(!j || j.revoked || !j.active || new Date(j.expires_at).getTime()<Date.now()) throw new DomainError('LINK_UNAVAILABLE',404);
  const n=(await c.query('SELECT * FROM join_nonces WHERE digest=$1 AND token_digest=$2 AND browser_digest=$3 FOR UPDATE',[digest(nonce),digest(token),digest(browser)])).rows[0];
  if(!n || n.consumed || new Date(n.expires_at).getTime()<Date.now()) throw new DomainError('INVALID_ACTION',403);
  if(actor && actor!==j.member_id) throw new DomainError('USE_GENERIC_JOIN_FOR_DIFFERENT_ACCOUNT',409);
  const p=(await c.query('SELECT p.*,s.video_id FROM programs p LEFT JOIN stream_versions s ON s.program_id=p.id AND s.sequence=p.current_sequence WHERE p.id=$1 FOR SHARE OF p',[j.program_id])).rows[0];
  if(p.state!=='LIVE_CONFIRMED' || !p.video_id) throw new DomainError('STREAM_REVIEW_REQUIRED',503);
  if(j.purpose!=='LIVE_LINK_OPENED') throw new DomainError('REPLAY_NOT_IMPLEMENTED',422);
  const source=(await c.query('SELECT 1 FROM stream_versions s JOIN official_channels o ON o.id=s.channel_id WHERE s.program_id=$1 AND s.sequence=$2 AND o.approved AND o.program_id=s.program_id AND o.organization_id=$3',[p.id,p.current_sequence,j.organization_id])).rowCount;
  if(!source) throw new DomainError('SOURCE_REVIEW_REQUIRED',503);
  const assurance=actor?'AUTHENTICATED_MEMBER':'TOKEN_ASSOCIATED';
  await c.query('UPDATE join_nonces SET consumed=true WHERE digest=$1',[digest(nonce)]);
  await c.query(`INSERT INTO checkin_events(organization_id,member_id,program_id,action,assurance,stream_sequence,last_stream_sequence) VALUES($1,$2,$3,$4,$5,$6,$6)
   ON CONFLICT(organization_id,member_id,program_id,action) DO UPDATE SET last_opened_at=now(),last_stream_sequence=excluded.last_stream_sequence,assurance=CASE WHEN excluded.assurance='AUTHENTICATED_MEMBER' THEN excluded.assurance ELSE checkin_events.assurance END`,[j.organization_id,j.member_id,j.program_id,j.purpose,assurance,p.current_sequence]);
  return {location:mockStreamDestination(p.video_id),assurance};
 });
}
