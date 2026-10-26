import type { PoolClient } from 'pg';
import { tx } from '../db/index.ts';
import { DomainError } from './domain.ts';
import { recordTransition } from './programs.ts';
export type AdminActor={id:string;organization_id:string;session_digest:string};
export type ProgramCommand={revision:number;reason:string};
export async function requireAdministration(c:PoolClient,actor:AdminActor,permission:string) {
 const member=(await c.query('SELECT id FROM members WHERE id=$1 AND organization_id=$2 AND active FOR SHARE',[actor.id,actor.organization_id])).rowCount;
 if(!member)throw new DomainError('AUTHENTICATION_REQUIRED',401);
 const session=(await c.query(`SELECT s.digest,v.verified_at FROM fixture_sessions s JOIN administrative_verifications v ON v.session_digest=s.digest
 WHERE s.digest=$1 AND s.member_id=$2 AND NOT s.revoked AND s.expires_at>now() AND v.verified_at>now()-interval '15 minutes' FOR SHARE OF s,v`,[actor.session_digest,actor.id])).rowCount;
 if(!session)throw new DomainError('RECENT_AUTHENTICATION_REQUIRED',403);
 const grant=(await c.query('SELECT 1 FROM grants WHERE member_id=$1 AND permission=$2 AND branch_id IS NULL FOR SHARE',[actor.id,permission])).rowCount;
 if(!grant)throw new DomainError('PERMISSION_DENIED',403);
}
async function program(c:PoolClient,actor:AdminActor,id:string,revision:number) {
 const p=(await c.query('SELECT * FROM programs WHERE id=$1 AND organization_id=$2 FOR UPDATE',[id,actor.organization_id])).rows[0];
 if(!p)throw new DomainError('NOT_FOUND',404);
 if(p.revision!==revision)throw new DomainError('REVISION_CONFLICT',409);
 return p;
}
function validateReason(reason:string) {
 if(reason.trim().length<8||reason.length>500||/[\r\n]/.test(reason))throw new DomainError('REASON_REQUIRED',422);
}
async function audit(c:PoolClient,actor:AdminActor,action:string,resource:string,details:Record<string,unknown>={}) {
 await c.query('INSERT INTO audit_logs(actor,action,resource_id,details) VALUES($1,$2,$3,$4)',[actor.id,action,resource,details]);
}
export async function reviewCandidate(actor:AdminActor,id:string,input:ProgramCommand&{observationId:string;decision:'APPROVED'|'REJECTED'}) {
 validateReason(input.reason);
 return tx(async c=>{
  await requireAdministration(c,actor,'program.manage');
  const p=await program(c,actor,id,input.revision);
  if(p.state==='COMPLETED')throw new DomainError('SESSION_COMPLETED',409);
  const o=(await c.query('SELECT * FROM mock_observations WHERE id=$1 AND program_id=$2 FOR UPDATE',[input.observationId,p.id])).rows[0];
  if(!o)throw new DomainError('NOT_FOUND',404);
  const latest=(await c.query('SELECT id FROM mock_observations WHERE program_id=$1 AND video_id=$2 ORDER BY observed_at DESC,id DESC LIMIT 1',[p.id,o.video_id])).rows[0];
  if(String(latest.id)!==String(o.id))throw new DomainError('STALE_EVIDENCE',409);
  const evidence={providerMode:'mock',videoId:o.video_id,channelId:o.channel_id,title:o.title,live:o.live,available:o.available,observedAt:o.observed_at,outcome:o.outcome};
  if(input.decision==='REJECTED') {
   if(p.current_sequence&&(await c.query('SELECT 1 FROM stream_versions WHERE program_id=$1 AND sequence=$2 AND video_id=$3',[p.id,p.current_sequence,o.video_id])).rowCount)throw new DomainError('ACTIVE_SOURCE_REQUIRES_FINISH_OR_REPLACEMENT',409);
   await c.query("UPDATE mock_observations SET processed=true,outcome='REJECTED_BY_ADMIN' WHERE program_id=$1 AND video_id=$2 AND NOT processed",[p.id,o.video_id]);
   await c.query('UPDATE programs SET revision=revision+1 WHERE id=$1',[p.id]);
   await recordTransition(c,p,p.state,input.reason,actor.id,o.id,evidence);
  } else {
   const approved=(await c.query('SELECT 1 FROM official_channels WHERE id=$1 AND program_id=$2 AND organization_id=$3 AND approved AND mock FOR SHARE',[o.channel_id,p.id,p.organization_id])).rowCount;
   if(!approved||!o.live||!o.available||o.provider_error||!/ctdmp/i.test(o.title)||! /^[A-Za-z0-9_-]{11}$/.test(o.video_id))throw new DomainError('CANDIDATE_NOT_VERIFIED',422);
   if(Date.now()-new Date(o.observed_at).getTime()>120000||new Date(o.observed_at).getTime()>Date.now()+5000)throw new DomainError('STALE_EVIDENCE',409);
   const old=p.current_sequence?(await c.query('SELECT * FROM stream_versions WHERE program_id=$1 AND sequence=$2',[p.id,p.current_sequence])).rows[0]:null;
   if(old?.video_id===o.video_id&&p.state==='LIVE_CONFIRMED')throw new DomainError('ALREADY_CURRENT',409);
   const same=old?.video_id===o.video_id;
   const sequence=same?p.current_sequence:(p.current_sequence??0)+1;
   if(!same)await c.query('INSERT INTO stream_versions VALUES($1,$2,$3,$4,$5,$6)',[p.id,sequence,o.video_id,o.channel_id,o.observed_at,input.reason]);
   await c.query("UPDATE programs SET state='LIVE_CONFIRMED',revision=revision+1,current_sequence=$2 WHERE id=$1",[p.id,sequence]);
   await recordTransition(c,p,'LIVE_CONFIRMED',input.reason,actor.id,o.id,evidence);
   const type=same?'program.recovered':old?'program.stream_replaced':'program.live_confirmed';
   const key=same?p.id+':recovered:'+(p.revision+1):old?p.id+':replacement:'+sequence:p.id+':initial';
   await c.query('INSERT INTO domain_outbox(event_key,program_id,event_type,revision) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[key,p.id,type,p.revision+1]);
   // Manual resolution consumes competing observations already present. Future evidence stays independent.
   await c.query("UPDATE mock_observations SET processed=true,outcome=CASE WHEN id=$2 THEN 'APPROVED_BY_ADMIN' ELSE 'SUPERSEDED_BY_ADMIN' END WHERE program_id=$1 AND NOT processed",[p.id,o.id]);
   await c.query("UPDATE mock_observations SET outcome='APPROVED_BY_ADMIN' WHERE id=$1",[o.id]);
  }
  await c.query('INSERT INTO candidate_decisions(program_id,observation_id,video_id,decision,actor,reason,program_revision,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[p.id,o.id,o.video_id,input.decision,actor.id,input.reason,p.revision+1,evidence]);
  await audit(c,actor,'candidate.'+input.decision.toLowerCase(),p.id,{reason:input.reason,revision:p.revision+1,observationId:String(o.id)});
  return {programId:p.id,revision:p.revision+1,decision:input.decision};
 });
}
export async function finishProgram(actor:AdminActor,id:string,input:ProgramCommand) {
 validateReason(input.reason);
 return tx(async c=>{
  await requireAdministration(c,actor,'program.manage');
  const p=await program(c,actor,id,input.revision);
  if(!p.current_sequence||p.state==='COMPLETED')throw new DomainError('INVALID_TRANSITION',409);
  await c.query("UPDATE programs SET state='COMPLETED',revision=revision+1 WHERE id=$1",[p.id]);
  await recordTransition(c,p,'COMPLETED',input.reason,actor.id);
  await c.query("INSERT INTO domain_outbox(event_key,program_id,event_type,revision) VALUES($1,$2,'program.completed',$3)",[p.id+':completed:'+(p.revision+1),p.id,p.revision+1]);
  await audit(c,actor,'program.completed',p.id,{reason:input.reason,revision:p.revision+1});
  return {programId:p.id,state:'COMPLETED',revision:p.revision+1};
 });
}
export async function selectProgram(actor:AdminActor,id:string,input:ProgramCommand&{selectionRevision:number}) {
 validateReason(input.reason);
 return tx(async c=>{
  await requireAdministration(c,actor,'program.manage');
  await c.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[actor.organization_id]);
  const p=await program(c,actor,id,input.revision);
  const selection=(await c.query('SELECT * FROM program_selections WHERE organization_id=$1 FOR UPDATE',[actor.organization_id])).rows[0];
  if((selection?.revision??0)!==input.selectionRevision)throw new DomainError('REVISION_CONFLICT',409);
  await c.query('INSERT INTO program_selections(organization_id,program_id,revision) VALUES($1,$2,1) ON CONFLICT(organization_id) DO UPDATE SET program_id=excluded.program_id,revision=program_selections.revision+1',[actor.organization_id,p.id]);
  await audit(c,actor,'program.selected',p.id,{reason:input.reason,previousProgramId:selection?.program_id??null,selectionRevision:(selection?.revision??0)+1});
  return {programId:p.id,selectionRevision:(selection?.revision??0)+1};
 });
}
export async function setSendingPaused(actor:AdminActor,input:{revision:number;paused:boolean;reason:string}) {
 validateReason(input.reason);
 return tx(async c=>{
  await requireAdministration(c,actor,'messaging.manage');
  const changed=(await c.query('UPDATE sending_controls SET dry_run_enabled=$2,revision=revision+1 WHERE organization_id=$1 AND revision=$3 RETURNING revision',[actor.organization_id,!input.paused,input.revision])).rows[0];
  if(!changed)throw new DomainError('REVISION_CONFLICT',409);
  await audit(c,actor,input.paused?'sending.paused':'sending.resumed',actor.organization_id,{reason:input.reason,revision:changed.revision});
  return {paused:input.paused,revision:changed.revision};
 });
}
