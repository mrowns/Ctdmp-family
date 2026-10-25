import { mkdir, writeFile } from 'node:fs/promises';
import { pool } from '../packages/db/index.ts';
import { config } from '../packages/shared/config.ts';
import { randomToken, digest } from '../packages/integrations/crypto.ts';
if(config.APP_ENV!=='local'||config.FIXTURE_AUTH_ENABLED!=='true')throw new Error('Local fixture sessions only');
const member=process.argv[2];
if(!member||!/^[a-z0-9-]{1,80}$/.test(member))throw new Error('Supply a fictional member ID');
try {
 const token=randomToken();
 const result=await pool.query("INSERT INTO fixture_sessions SELECT $1,id,now()+interval '1 hour',false FROM members WHERE id=$2 AND active RETURNING member_id",[digest(token),member]);
 if(!result.rowCount)throw new Error('Fictional member not found');
 await mkdir('artifacts/private',{recursive:true,mode:0o700});
 await writeFile('artifacts/private/'+member+'.access',token+'\n',{mode:0o600});
 console.log('One-hour development access code written to artifacts/private/'+member+'.access. Keep it private; never paste it into chat.');
} finally {await pool.end();}
