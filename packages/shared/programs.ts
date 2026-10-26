import type { PoolClient } from 'pg';
import { pool } from '../db/index.ts';
import { config } from './config.ts';
export async function currentProgram(client:Pick<PoolClient,'query'>=pool,lock=false) {
 return (await client.query(`SELECT p.*,s.video_id,s.observed_at FROM programs p
 JOIN program_selections selection ON selection.program_id=p.id AND selection.organization_id=p.organization_id
 LEFT JOIN stream_versions s ON s.program_id=p.id AND s.sequence=p.current_sequence
 WHERE selection.organization_id=$1 ${lock?'FOR SHARE OF p,selection':''}`,[config.ORGANIZATION_ID])).rows[0];
}
export async function recordTransition(c:PoolClient,p:any,next:string,reason:string,actor:string|null=null,observation:string|number|null=null,evidence:Record<string,unknown>={}) {
 await c.query('INSERT INTO program_transitions(program_id,previous_state,next_state,revision,actor,observation_id,reason,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[p.id,p.state,next,p.revision+1,actor,observation,reason,evidence]);
}
