import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { config } from '../shared/config.ts';
export const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 8 });
export const db = drizzle(pool);
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
 const c = await pool.connect();
 try { await c.query('BEGIN'); const result=await fn(c); await c.query('COMMIT'); return result; }
 catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
