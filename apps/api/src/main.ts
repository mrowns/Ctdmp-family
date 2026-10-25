import { app } from './app.ts';
import { config } from '../../../packages/shared/config.ts';
import { pool } from '../../../packages/db/index.ts';
const server=await app();
await server.listen({host:'127.0.0.1',port:config.PORT});
console.log('CTDMP API listening on loopback only; MOCK providers; not a public pilot');
for(const signal of ['SIGTERM','SIGINT']) process.on(signal,async()=>{await server.close();await pool.end();});
