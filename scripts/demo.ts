import assert from 'node:assert/strict';
import { writeFile,mkdir } from 'node:fs/promises';
import { pool } from '../packages/db/index.ts';
import { config } from '../packages/shared/config.ts';
import { decrypt } from '../packages/integrations/crypto.ts';
const base='http://127.0.0.1:'+config.PORT;
const wait=async(fn:()=>Promise<boolean>)=>{for(let i=0;i<80;i++){if(await fn())return;await new Promise(r=>setTimeout(r,250));}throw new Error('Worker did not reach expected state');};
const program='demo-session';
try {
 const p=(await pool.query('SELECT * FROM programs WHERE id=$1',[program])).rows[0];
 if(p.state!=='SCHEDULED') throw new Error('Demo is intentionally one-shot; existing session history is preserved. See docs/NEXT_STEPS.md.');
 await pool.query("INSERT INTO mock_observations(program_id,video_id,channel_id,title,live,expected_revision) VALUES($1,'MockVideo_A','mock-approved','CTDMP simulated demo',true,0)",[program]);
 await wait(async()=>Boolean((await pool.query("SELECT 1 FROM notifications WHERE program_id=$1 AND member_id='alice' AND state='DRY_RUN_PREPARED'",[program])).rowCount));
 const n=(await pool.query("SELECT * FROM notifications WHERE program_id=$1 AND member_id='alice'",[program])).rows[0];
 const path=JSON.parse(decrypt(n.payload_cipher)).path;
 const preview=await fetch(base+path);assert.equal(preview.status,200);
 assert.equal((await pool.query('SELECT * FROM checkin_events WHERE program_id=$1',[program])).rowCount,0);
 const open=async(auth=false)=>{
  const landing=await fetch(base+path);const html=await landing.text();
  const nonce=html.match(/name="nonce" value="([^"]+)"/)![1];
  const headers:Record<string,string>={'content-type':'application/x-www-form-urlencoded',origin:base,cookie:landing.headers.get('set-cookie')!.split(';')[0]};
  if(auth)headers.authorization='Bearer '+config.FIXTURE_SECRET+':alice';
  return fetch(base+path+'/confirm',{method:'POST',headers,body:new URLSearchParams({nonce}),redirect:'manual'});
 };
 const a=await open();assert.equal(a.status,303);assert.ok(a.headers.get('location')!.endsWith('MockVideo_A'));
 await pool.query("INSERT INTO mock_observations(program_id,video_id,channel_id,title,live,expected_revision) SELECT id,'MockVideo_A','mock-approved','CTDMP simulated demo',false,revision FROM programs WHERE id=$1",[program]);
 await wait(async()=>(await pool.query('SELECT state FROM programs WHERE id=$1',[program])).rows[0].state==='SUSPECTED_INTERRUPTION');
 const uncertain=await open();assert.equal(uncertain.status,503);
 await pool.query("INSERT INTO mock_observations(program_id,video_id,channel_id,title,live,expected_revision) SELECT id,'MockVideo_B','mock-approved','CTDMP simulated demo',true,revision FROM programs WHERE id=$1",[program]);
 await wait(async()=>(await pool.query('SELECT current_sequence FROM programs WHERE id=$1',[program])).rows[0].current_sequence===2);
 const b=await open(true);assert.equal(b.status,303);assert.ok(b.headers.get('location')!.endsWith('MockVideo_B'));
 const action=(await pool.query('SELECT assurance FROM checkin_events WHERE program_id=$1',[program])).rows;
 assert.equal(action.length,1);assert.equal(action[0].assurance,'AUTHENTICATED_MEMBER');
 const notifications=(await pool.query('SELECT state,count(*)::int count FROM notifications WHERE program_id=$1 GROUP BY state',[program])).rows;
 const evidence={recordedAt:new Date().toISOString(),mode:'MOCK',transport:'actual loopback HTTP + PostgreSQL + BullMQ worker',previewCreatedCheckin:false,firstDestination:'MockVideo_A',replacementDestination:'MockVideo_B',sameTokenUsed:true,uniqueActions:1,assurance:action[0].assurance,notifications,limitations:['No real providers','No browser/device evidence','No production authentication']};
 await mkdir('docs/evidence',{recursive:true});await writeFile('docs/evidence/first-worker-demo.json',JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence,null,2));
} finally {await pool.end();}
