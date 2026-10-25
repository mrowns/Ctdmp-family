import 'dotenv/config';
import { spawnSync } from 'node:child_process';
const url=new URL(process.env.DATABASE_URL!);url.pathname='/ctdmp_test';
const env={...process.env,DATABASE_URL:url.toString(),APP_ENV:'test',PORT:'3200'};
const browser=process.argv.includes('--browser');
for(const args of (browser?[['packages/db/migrate.ts'],['packages/db/seed.ts'],['scripts/browser-slice.ts']]:[['packages/db/migrate.ts'],['--test','--test-concurrency=1','tests/slice.test.ts']])) {
 const result=spawnSync('tsx',args,{env,stdio:'inherit'});if(result.status!==0) process.exit(result.status??1);
}
