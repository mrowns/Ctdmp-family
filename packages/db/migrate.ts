import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pool, tx } from './index.ts';
try {
 await tx(async c => {
  await c.query("SELECT pg_advisory_xact_lock(728315)");
  await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, digest text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const name of (await readdir(new URL('./migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()) {
   const body=await readFile(new URL('./migrations/'+name,import.meta.url),'utf8');
   const digest=createHash('sha256').update(body).digest('hex');
   const prior=await c.query('SELECT digest FROM schema_migrations WHERE name=$1',[name]);
   if(prior.rows.length) { if(prior.rows[0].digest!==digest) throw new Error('Applied migration modified: '+name); continue; }
   await c.query(body); await c.query('INSERT INTO schema_migrations(name,digest) VALUES($1,$2)',[name,digest]); console.log('Applied '+name);
  }
 });
} finally { await pool.end(); }
