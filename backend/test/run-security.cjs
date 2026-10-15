const { Client } = require('pg');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');

async function main() {
  if (spawnSync(process.execPath, ['test/core-artifacts.cjs'], { stdio: 'inherit' }).status !== 0) throw new Error('Compiled core/worker suite failed');
  const database = `auth_test_${Date.now()}_${randomBytes(4).toString('hex')}`;
  if (!/^auth_test_[a-z0-9_]+$/.test(database)) throw new Error('Unsafe test database name');
  const admin = new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE});
  await admin.connect();await admin.query(`CREATE DATABASE "${database}"`);
  const env = {...process.env,ADMIN_EMAIL:'',ADMIN_PASSWORD:'',ADMIN_FULL_NAME:'',DB_DATABASE:database,APP_PORT:'3001',REDIS_URL:'redis://redis:6379/1',LOGIN_RATE_LIMIT:'1000',REGISTER_RATE_LIMIT:'1000',REFRESH_RATE_LIMIT:'1000',FORGOT_PASSWORD_RATE_LIMIT:'1000',VERIFY_EMAIL_RATE_LIMIT:'1000',RESET_PASSWORD_RATE_LIMIT:'1000',RESEND_VERIFICATION_RATE_LIMIT:'1000',TEST_DATABASE:database,TEST_BASE_URL:'http://localhost:3001/api/v1',TEST_MAIL_URL:'http://mailpit:8025'};
  let api;
  try {
    const args=['-r','tsconfig-paths/register','dist/src/cli.js'];
    for (const command of ['migrate','seed','seed']) {
      const result=spawnSync(process.execPath,[...args,command],{env,encoding:'utf8'});
      if(result.status!==0)throw new Error(`Test setup ${command} failed`);
    }
    // Validate down/up only in the disposable DB, before application data exists.
    const revert=spawnSync(process.execPath,['-r','tsconfig-paths/register','node_modules/typeorm/cli.js','migration:revert','-d','dist/src/config/data-source.js'],{env,encoding:'utf8'});
    if(revert.status!==0)throw new Error('Disposable migration revert failed');
    for(const command of ['migrate','seed','seed'])if(spawnSync(process.execPath,[...args,command],{env,encoding:'utf8'}).status!==0)throw new Error('Migration recovery failed');
    if(spawnSync(process.execPath,['-r','tsconfig-paths/register','test/admin-seed.integration.cjs'],{env,stdio:'inherit'}).status!==0)throw new Error('Admin seed suite failed');
    api=spawn(process.execPath,['-r','tsconfig-paths/register','dist/src/main.js'],{env,stdio:['ignore','pipe','pipe']});
    let log='';api.stdout.on('data',chunk=>{log=(log+String(chunk)).slice(-12000);});api.stderr.on('data',chunk=>{log=(log+String(chunk)).slice(-12000);});
    let ready=false;
    for(let i=0;i<100;i++){
      try{const response=await fetch(`${env.TEST_BASE_URL}/health`);if(response.ok){ready=true;break;}}catch{}
      if(api.exitCode!==null)break;await new Promise(r=>setTimeout(r,200));
    }
    if(!ready){console.error(log);throw new Error('Test API startup failed');}
    if (process.env.TEST_GATEWAY_BASE_URL) {
      if(spawnSync(process.execPath,['test/gateway.integration.cjs'],{env,stdio:'inherit'}).status!==0)throw new Error('Gateway suite failed');
    }
    for(const args of [['node_modules/jest/bin/jest.js','--runInBand'],['node_modules/jest/bin/jest.js','--config','test/jest-e2e.json','--runInBand']]) {
      if(spawnSync(process.execPath,args,{env,stdio:'inherit'}).status!==0)throw new Error('Jest suite failed');
    }
    const result=spawn(process.execPath,['test/security.integration.cjs'],{env,stdio:'inherit'});
    const status=await new Promise(resolve=>result.on('exit',resolve));
    if(status!==0)throw new Error('Security integration suite failed');
    console.log('PASS disposable PostgreSQL migration down/up, seed twice, compiled API boot');
  }finally{
    if(api&&api.exitCode===null){api.kill('SIGTERM');await new Promise(resolve=>api.once('exit',resolve));}
    await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);await admin.end();
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
