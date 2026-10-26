import { config } from '../shared/config.ts';
import { pool, tx } from './index.ts';
import { digest } from '../integrations/crypto.ts';
if(config.APP_ENV!=='local' && config.APP_ENV!=='test') throw new Error('Fixture seed forbidden');
try { await tx(async c=>{
 await c.query("INSERT INTO organizations VALUES ('demo-org','Fictional CTDMP demo') ON CONFLICT DO NOTHING");
 await c.query("INSERT INTO branches VALUES ('branch-a','demo-org','Fictional branch A'),('branch-b','demo-org','Fictional branch B') ON CONFLICT DO NOTHING");
 for(const [id,branch] of [['alice','branch-a'],['bob','branch-b'],['admin-a','branch-a'],['admin-b','branch-b'],['moderator','branch-a']]) {
  await c.query('INSERT INTO members VALUES($1,$2,$3,$1,true) ON CONFLICT DO NOTHING',[id,'demo-org',branch]);
  await c.query('INSERT INTO preferences(member_id,live_start) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,id==='alice']);
  await c.query("INSERT INTO fixture_sessions VALUES($1,$2,now()+interval '7 days',false) ON CONFLICT(digest) DO UPDATE SET expires_at=excluded.expires_at",[digest(config.FIXTURE_SECRET+':'+id),id]);
 }
 await c.query("INSERT INTO grants VALUES ('admin-a','engagement.read','branch-a'),('admin-b','engagement.read','branch-b'),('moderator','content.moderate','branch-a') ON CONFLICT DO NOTHING");
 await c.query("INSERT INTO grants VALUES ('admin-a','program.read',null),('admin-b','program.read',null),('admin-a','messaging.read',null) ON CONFLICT DO NOTHING");
 await c.query("INSERT INTO programs(id,organization_id,title,local_date) VALUES ('demo-session','demo-org','CTDMP — SIMULATED SESSION',CURRENT_DATE) ON CONFLICT DO NOTHING");
 await c.query("INSERT INTO program_selections VALUES ('demo-org','demo-session',0) ON CONFLICT DO NOTHING");
 await c.query("INSERT INTO grants VALUES ('admin-a','program.manage',null),('admin-a','messaging.manage',null),('admin-a','demo.manage',null) ON CONFLICT DO NOTHING");
 await c.query("INSERT INTO official_channels VALUES ('mock-approved','demo-org','demo-session',true,true) ON CONFLICT DO NOTHING");
 await c.query("INSERT INTO sending_controls VALUES ('demo-org',true) ON CONFLICT DO NOTHING");
 await c.query("INSERT INTO budgets VALUES ('demo-org','TEST',100,0) ON CONFLICT DO NOTHING");
 await c.query("INSERT INTO consent_records(member_id,purpose,opted_in,wording_version) SELECT 'alice','LIVE_START',true,'fixture-v1' WHERE NOT EXISTS(SELECT 1 FROM consent_records WHERE member_id='alice')");
 }); console.log('Fictional fixtures ready; fixture session tokens not printed.'); } finally { await pool.end(); }
