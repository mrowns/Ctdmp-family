import { pool } from '../db/index.ts';

export type DispatchQueue = {
 add(name:string,data:{id:string},options:{jobId:string;removeOnComplete:boolean;attempts:number;backoff:{type:'exponential';delay:number}}):Promise<unknown>;
};

export async function enqueuePendingNotifications(queue:DispatchQueue,batchSize=100,organizationId?:string) {
 if(!Number.isInteger(batchSize)||batchSize<1||batchSize>1000)throw new RangeError('Queue recovery batch size must be between 1 and 1000');
 const pending=await pool.query("SELECT id FROM notifications WHERE state='PLANNED' AND ($2::text IS NULL OR organization_id=$2) ORDER BY id LIMIT $1",[batchSize,organizationId??null]);
 for(const row of pending.rows) await queue.add('prepare',{id:String(row.id)},{jobId:'notification-'+row.id,removeOnComplete:true,attempts:3,backoff:{type:'exponential',delay:1000}});
 return {scanned:pending.rows.length,submitted:pending.rows.length};
}
