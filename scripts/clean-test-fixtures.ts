import { pool,tx } from '../packages/db/index.ts';
try{await tx(async c=>{
 const ids=(await c.query("SELECT id FROM organizations WHERE id LIKE 'test-%'")).rows.map(r=>r.id);
 if(!ids.length)return;
 const members=(await c.query('SELECT id FROM members WHERE organization_id=ANY($1)',[ids])).rows.map(r=>r.id);
 const programs=(await c.query('SELECT id FROM programs WHERE organization_id=ANY($1)',[ids])).rows.map(r=>r.id);
 await c.query('UPDATE programs SET current_sequence=null WHERE id=ANY($1)',[programs]);
 await c.query('DELETE FROM join_nonces WHERE token_digest IN(SELECT digest FROM join_links WHERE organization_id=ANY($1))',[ids]);
 await c.query('DELETE FROM cost_ledger WHERE notification_id IN(SELECT id FROM notifications WHERE organization_id=ANY($1))',[ids]);
 for(const table of ['checkin_events','join_links','notifications','budgets','sending_controls']) await c.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`,[ids]);
 for(const table of ['mock_observations','domain_outbox','stream_versions']) await c.query(`DELETE FROM ${table} WHERE program_id=ANY($1)`,[programs]);
 await c.query('DELETE FROM official_channels WHERE organization_id=ANY($1)',[ids]);
 for(const table of ['fixture_sessions','grants','preferences','consent_records']) await c.query(`DELETE FROM ${table} WHERE member_id=ANY($1)`,[members]);
 await c.query('DELETE FROM audit_logs WHERE actor=ANY($1)',[members]);
 for(const table of ['programs','members','branches']) await c.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`,[ids]);
 await c.query('DELETE FROM organizations WHERE id=ANY($1)',[ids]);
 console.log('Removed only generated test-* fixture organizations from demo database.');
});}finally{await pool.end();}
