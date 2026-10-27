import { Queue, Worker } from 'bullmq';
import { config } from '../../../packages/shared/config.ts';
import { observeOne, planOne, dispatchOne, processWebhookOne, reconcileReceiptOne, cleanupEphemeralData } from '../../../packages/shared/domain.ts';
import { pool } from '../../../packages/db/index.ts';
const u=new URL(config.REDIS_URL);
const connection={host:u.hostname,port:Number(u.port||6379),maxRetriesPerRequest:null};
const prefix='ctdmp-'+config.APP_ENV+'-'+new URL(config.DATABASE_URL).pathname.slice(1);
const queue=new Queue('ctdmp-mock-dispatch',{connection,prefix});
const worker=new Worker('ctdmp-mock-dispatch',async job=>dispatchOne(String(job.data.id)),{connection,prefix,concurrency:4});
worker.on('failed',(_job,error)=>console.error('Dispatch job failed:',error.name));
let stopped=false;let lastRetentionSweep=0;
const pause=()=>new Promise(r=>setTimeout(r,1000));
console.log('CTDMP worker started: MOCK providers, DRY_RUN only');
const stop=()=>{stopped=true;};process.on('SIGTERM',stop);process.on('SIGINT',stop);
while(!stopped) {
 try {
  for(let i=0;i<25 && await observeOne();i++) {}
  for(let i=0;i<25 && await processWebhookOne();i++) {}
  for(let i=0;i<25 && await reconcileReceiptOne();i++) {}
  if(Date.now()-lastRetentionSweep>=60000) {
   const cleanup=await cleanupEphemeralData(500);lastRetentionSweep=Date.now();
   if(cleanup.payloadsCleared||cleanup.noncesDeleted||cleanup.linksDeleted||cleanup.challengesDeleted||cleanup.sessionsDeleted)console.log('Ephemeral retention cleanup:',JSON.stringify(cleanup));
  }
  for(let i=0;i<25 && await planOne();i++) {}
  const pending=await pool.query("SELECT id FROM notifications WHERE state='PLANNED' ORDER BY id LIMIT 100");
  for(const n of pending.rows) await queue.add('prepare',{id:n.id},{jobId:'notification-'+n.id,removeOnComplete:true,attempts:3,backoff:{type:'exponential',delay:1000}});
  await pool.query("INSERT INTO worker_heartbeats VALUES('main',now()) ON CONFLICT(id) DO UPDATE SET seen_at=now()");
 } catch(e) {console.error('Worker cycle failed:',e instanceof Error?e.name:'unknown');}
 await pause();
}
await worker.close();await queue.close();await pool.end();
