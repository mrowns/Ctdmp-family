import { Queue, Worker } from 'bullmq';
import { config } from '../../../packages/shared/config.ts';
import { observeOne, planOne, dispatchOne } from '../../../packages/shared/domain.ts';
import { pool } from '../../../packages/db/index.ts';
const u=new URL(config.REDIS_URL);
const connection={host:u.hostname,port:Number(u.port||6379),maxRetriesPerRequest:null};
const queue=new Queue('ctdmp-mock-dispatch',{connection});
const worker=new Worker('ctdmp-mock-dispatch',async job=>dispatchOne(String(job.data.id)),{connection,concurrency:4});
worker.on('failed',(_job,error)=>console.error('Dispatch job failed:',error.name));
let stopped=false;
const pause=()=>new Promise(r=>setTimeout(r,1000));
console.log('CTDMP worker started: MOCK providers, DRY_RUN only');
const stop=()=>{stopped=true;};process.on('SIGTERM',stop);process.on('SIGINT',stop);
while(!stopped) {
 try {
  for(let i=0;i<25 && await observeOne();i++) {}
  for(let i=0;i<25 && await planOne();i++) {}
  const pending=await pool.query("SELECT id FROM notifications WHERE state='PLANNED' ORDER BY id LIMIT 100");
  for(const n of pending.rows) await queue.add('prepare',{id:n.id},{jobId:'notification-'+n.id,removeOnComplete:true,attempts:3,backoff:{type:'exponential',delay:1000}});
  await pool.query("INSERT INTO worker_heartbeats VALUES('main',now()) ON CONFLICT(id) DO UPDATE SET seen_at=now()");
 } catch(e) {console.error('Worker cycle failed:',e instanceof Error?e.name:'unknown');}
 await pause();
}
await worker.close();await queue.close();await pool.end();
