import { randomUUID } from 'node:crypto';
import { tx } from '../db/index.ts';
import { digest } from '../integrations/crypto.ts';
import { config } from './config.ts';
import { DomainError } from './domain.ts';
import { requireAdministration, type AdminActor } from './administration.ts';
export async function createScenario(actor:AdminActor,input:{selectionRevision:number;reason:string;requestKey:string}) {
 if(!['local','test'].includes(config.APP_ENV)||config.PROVIDER_MODE!=='mock')throw new DomainError('NOT_FOUND',404);
 return tx(async c=>{
  await requireAdministration(c,actor,'demo.manage');await requireAdministration(c,actor,'program.manage');
  await c.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[actor.organization_id]);
  const fingerprint=digest(JSON.stringify([input.selectionRevision,input.reason]));
  const existing=(await c.query('SELECT * FROM mock_scenario_requests WHERE request_key=$1',[input.requestKey])).rows[0];
  if(existing) {
   if(existing.actor!==actor.id||existing.organization_id!==actor.organization_id||existing.request_digest!==fingerprint)throw new DomainError('IDEMPOTENCY_CONFLICT',409);
   return {programId:existing.program_id,replayed:true};
  }
  const selection=(await c.query('SELECT * FROM program_selections WHERE organization_id=$1 FOR UPDATE',[actor.organization_id])).rows[0];
  if((selection?.revision??0)!==input.selectionRevision)throw new DomainError('REVISION_CONFLICT',409);
  const program='scenario-'+randomUUID(),channel='mock-'+program;
  await c.query("INSERT INTO programs(id,organization_id,title,local_date) VALUES($1,$2,'CTDMP — SIMULATED interactive scenario',(now() AT TIME ZONE 'Africa/Lagos')::date)",[program,actor.organization_id]);
  await c.query('INSERT INTO official_channels VALUES($1,$2,$3,true,true)',[channel,actor.organization_id,program]);
  await c.query('INSERT INTO program_selections(organization_id,program_id,revision) VALUES($1,$2,1) ON CONFLICT(organization_id) DO UPDATE SET program_id=excluded.program_id,revision=program_selections.revision+1',[actor.organization_id,program]);
  await c.query('INSERT INTO mock_scenario_requests VALUES($1,$2,$3,$4,$5,now())',[input.requestKey,actor.id,actor.organization_id,program,fingerprint]);
  await c.query("INSERT INTO audit_logs(actor,action,resource_id,details) VALUES($1,'demo.created',$2,$3)",[actor.id,program,{mode:'MOCK',reason:input.reason,selectionRevision:(selection?.revision??0)+1}]);
  return {programId:program,replayed:false};
 });
}
export async function queueScenarioObservation(actor:AdminActor,id:string,input:{revision:number;scenario:'START_A'|'INTERRUPT_A'|'RECOVER_B'|'PROVIDER_OUTAGE'|'COMPETING'}) {
 if(!['local','test'].includes(config.APP_ENV)||config.PROVIDER_MODE!=='mock')throw new DomainError('NOT_FOUND',404);
 return tx(async c=>{
  await requireAdministration(c,actor,'demo.manage');await requireAdministration(c,actor,'program.manage');
  const p=(await c.query(`SELECT p.* FROM programs p JOIN mock_scenario_requests s ON s.program_id=p.id
   WHERE p.id=$1 AND p.organization_id=$2 FOR UPDATE OF p`,[id,actor.organization_id])).rows[0];
  if(!p)throw new DomainError('NOT_FOUND',404);
  if(p.revision!==input.revision)throw new DomainError('REVISION_CONFLICT',409);
  if(p.state==='COMPLETED')throw new DomainError('SESSION_COMPLETED',409);
  const channel=(await c.query('SELECT id FROM official_channels WHERE id=$1 AND program_id=$2 AND organization_id=$3 AND mock AND approved FOR SHARE',['mock-'+p.id,p.id,p.organization_id])).rows[0];
  if(!channel)throw new DomainError('SOURCE_REVIEW_REQUIRED',409);
  const current=p.current_sequence?(await c.query('SELECT video_id FROM stream_versions WHERE program_id=$1 AND sequence=$2',[p.id,p.current_sequence])).rows[0]?.video_id:null;
  if(['START_A','COMPETING'].includes(input.scenario)&&p.state!=='SCHEDULED')throw new DomainError('INVALID_TRANSITION',409);
  if(input.scenario==='INTERRUPT_A'&&(p.state!=='LIVE_CONFIRMED'||current!=='MockVideo_A'))throw new DomainError('INVALID_TRANSITION',409);
  if(input.scenario==='RECOVER_B'&&!['SUSPECTED_INTERRUPTION','RECOVERY_SEARCH'].includes(p.state))throw new DomainError('INVALID_TRANSITION',409);
  const videos=input.scenario==='COMPETING'?['MockVideo_A','MockVideo_B']:[input.scenario==='RECOVER_B'?'MockVideo_B':current??'MockVideo_A'];
  for(const video of videos)await c.query(`INSERT INTO mock_observations(program_id,video_id,channel_id,title,live,provider_error,expected_revision)
   VALUES($1,$2,$3,'CTDMP simulated scenario',$4,$5,$6)`,[p.id,video,channel.id,input.scenario!=='INTERRUPT_A',input.scenario==='PROVIDER_OUTAGE',p.revision]);
  await c.query("INSERT INTO audit_logs(actor,action,resource_id,details) VALUES($1,'demo.observation_queued',$2,$3)",[actor.id,p.id,{scenario:input.scenario,expectedRevision:p.revision,mode:'MOCK'}]);
  return {queued:true,mode:'MOCK'};
 });
}
