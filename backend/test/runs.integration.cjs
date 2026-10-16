const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createDecipheriv } = require('node:crypto');
const { Client } = require('pg');
const { DataSource } = require('typeorm');
const { typeormOptions } = require('../dist/src/config/typeorm-options');
const { RunsService } = require('../dist/src/modules/city-bloxx/runs.service');
const { GameStore } = require('../dist/src/modules/city-bloxx/common/game-store.service');
const { GamePolicyService } = require('../dist/src/modules/city-bloxx/common/game-policy.service');
const { SecurityService } = require('../dist/src/modules/security/security.service');
const { cityBloxxCore: core } = require('../dist/src/common/city-bloxx-core');
if(!/^auth_test_[a-z0-9_]+$/.test(process.env.TEST_DATABASE||'')||process.env.DB_DATABASE!==process.env.TEST_DATABASE)throw new Error('Run suite requires guarded disposable database');
const db = new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.TEST_DATABASE});
const base=process.env.TEST_GATEWAY_BASE_URL||process.env.TEST_BASE_URL;
const password=`A!${randomBytes(24).toString('base64url')}`;
const responseHash=value=>require('node:crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex');
let passed=0;
async function api(method,path,body,u) {
  const r=await fetch(`${base}/city-bloxx${path}`,{method,headers:{'content-type':'application/json',...(u?{authorization:`Bearer ${u.accessToken}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.equal(r.headers.get('cache-control'),'no-store');
  const json=await r.json();return {status:r.status,data:json.data,json,headers:r.headers};
}
function status(r,n){assert.equal(r.status,n,`HTTP ${r.status}, expected ${n}; code ${r.json.errorCode||''}`);return r.data;}
async function test(name,fn){await fn();passed++;console.log(`PASS tickets: ${name}`);}
async function user(root=false){
  const email=`tickets-${randomUUID()}@example.test`;
  const auth=async(path,body)=>{const r=await fetch(`${base}/auth/${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.ok(r.ok);return (await r.json()).data;};
  const registered=await auth('register',{email,password});
  let token;
  for(let attempt=0;attempt<40&&!token;attempt++){
    for(const job of (await db.query('SELECT payload FROM mail_outbox WHERE sent_at IS NULL ORDER BY created_at DESC')).rows){
      const [iv,tag,raw]=job.payload.split('.');const d=createDecipheriv('aes-256-gcm',Buffer.from(process.env.MAIL_OUTBOX_KEY,'hex'),Buffer.from(iv,'hex'));d.setAuthTag(Buffer.from(tag,'hex'));
      const m=JSON.parse(Buffer.concat([d.update(Buffer.from(raw,'hex')),d.final()]).toString());
      if(m.email===email&&m.purpose==='verify')token=new URL(m.link).searchParams.get('token');
    }
    if(!token){
      const messages=await(await fetch(`${process.env.TEST_MAIL_URL}/api/v1/messages?limit=100`)).json();
      const candidate=(messages.messages||[]).find(m=>m.To?.some(t=>t.Address===email));
      if(candidate){const m=await(await fetch(`${process.env.TEST_MAIL_URL}/api/v1/message/${candidate.ID}`)).json();token=/token=([A-Za-z0-9_-]{43})/.exec(m.Text)?.[1];}
    }
    if(!token)await new Promise(r=>setTimeout(r,100));
  }
  assert.ok(token,'SMTP verification token');await auth('verify-email',{token});
  if(root)await db.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code='super_admin'",[registered.id]);
  return {id:registered.id,...await auth('login',{email,password})};
}
const start=(u,body={mode:'quick',clientRequestId:randomUUID()})=>api('POST','/runs/start',body,u);
const finishBody=t=>({runId:t.runId,ticket:t.ticket,physicsVersion:t.physicsVersion,rulesetVersion:t.rulesetVersion,endTick:500,inputs:[{tick:20,sequence:0,fraction:250},{tick:100,sequence:1,fraction:750}]});
async function main(){
 await db.connect();const a=await user(),b=await user(true);
 let quick,daily,body;
 await test('public Daily is UTC-pinned and canonical, with server clock and no identity',async()=>{
   const d=status(await api('GET','/daily/today'),200);assert.equal(d.dateUTC,d.serverTime.slice(0,10));assert.deepEqual(d.definition,core.resolveDaily(d.dateUTC));
 });
 await test('strict start DTO, bearer and explicit verified-email policy including super-admin',async()=>{
   status(await start(undefined),401);
   for(const extra of [{seed:5},{config:{}},{userId:b.id},{assist:true},{dateUTC:'2020-01-01'}])status(await start(a,{mode:'quick',clientRequestId:randomUUID(),...extra}),422);
   await db.query('UPDATE users SET email_verified_at=NULL WHERE id=$1',[b.id]);
   try{status(await start(b),403);}finally{await db.query('UPDATE users SET email_verified_at=now() WHERE id=$1',[b.id]);}
 });
 await test('server Quick config, 256-bit opaque ticket and exact 24-hour TTL; ciphertext only in DB',async()=>{
   quick=status(await start(a),200);assert.match(quick.ticket,/^[A-Za-z0-9_-]{43}$/);
   assert.deepEqual(Object.keys(quick.config).sort(),['assist','mode','seed']);assert.equal(quick.config.assist,false);
   assert.equal(Date.parse(quick.expiresAt)-Date.parse(quick.issuedAt),86400000);
   const row=(await db.query('SELECT * FROM city_bloxx_run_tickets WHERE run_id=$1',[quick.runId])).rows[0];
   assert.match(row.token_hash,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(row).includes(quick.ticket));
 });
 await test('concurrent identical start retries return exact original; changed mode conflicts',async()=>{
   body={mode:'daily',clientRequestId:randomUUID()};const responses=await Promise.all([start(a,body),start(a,{...body,clientRequestId:body.clientRequestId.toUpperCase()})]);
   daily=status(responses[0],200);assert.equal(responseHash(status(responses[1],200)),responseHash(daily),'exact original start receipt');
   assert.deepEqual(daily.config.daily,core.resolveDaily(daily.issuedAt.slice(0,10)));
   status(await start(a,{...body,mode:'quick'}),409);
   assert.equal((await db.query('SELECT count(*) FROM city_bloxx_run_tickets WHERE user_id=$1 AND client_request_id=$2',[a.id,body.clientRequestId])).rows[0].count,'1');
 });
 await test('owner-only status hides tokens/inputs/private identity even from super-admin',async()=>{
   const result=status(await api('GET',`/runs/${quick.runId}`,undefined,a),200);
   for(const key of ['ticket','token_hash','inputs','userId','user_id','encrypted_start_response'])assert.equal(key in result,false);
   status(await api('GET',`/runs/${quick.runId}`,undefined,b),404);
   status(await api('POST','/runs/finish',finishBody(quick),b),403);
 });
 await test('finish rejects token/version/result/config/sequence tampering before persistence',async()=>{
   const f=finishBody(quick);
   status(await api('POST','/runs/finish',{...f,ticket:randomBytes(32).toString('base64url')},a),403);
   status(await api('POST','/runs/finish',{...f,physicsVersion:'changed'},a),409);
   for(const patch of [{result:{population:999999}},{config:{seed:1}},{inputs:[{tick:20,sequence:0,fraction:1001}]},{endTick:432001}])status(await api('POST','/runs/finish',{...f,...patch},a),422);
   for(const inputs of [[{tick:20,sequence:1,fraction:0}],[{tick:500,sequence:0,fraction:0}],[{tick:20,sequence:0,fraction:0},{tick:20,sequence:1,fraction:0}]])status(await api('POST','/runs/finish',{...f,inputs},a),422);
   assert.equal((await db.query('SELECT count(*) FROM city_bloxx_run_submissions WHERE run_id=$1',[quick.runId])).rows[0].count,'0');
 });
 // All limiter keys here are owned by UUID accounts created by this invocation.
 const Redis=require('ioredis'),redis=new Redis(process.env.REDIS_URL);
 try{
 await redis.del(`city-bloxx:rate:finish:${a.id}`);
 await test('concurrent finish persists one normalized request, immutable first receipt and no client score',async()=>{
   const f=finishBody(quick);const rs=await Promise.all([api('POST','/runs/finish',f,a),api('POST','/runs/finish',f,a)]);
   const first=status(rs[0],202);assert.deepEqual(status(rs[1],202),first);assert.equal(first.result,null);
   assert.equal(await redis.hget(`city-bloxx:rate:finish:${a.id}`,'count'),'1');
   const reordered={...f,runId:f.runId.toUpperCase(),inputs:f.inputs.map(i=>({fraction:i.fraction,sequence:i.sequence,tick:i.tick}))};
   assert.deepEqual(status(await api('POST','/runs/finish',reordered,a),202),first);
   status(await api('POST','/runs/finish',{...f,endTick:501},a),409);
   const row=(await db.query('SELECT * FROM city_bloxx_run_submissions WHERE run_id=$1',[quick.runId])).rows[0];
   assert.equal(row.state,'queued');assert.deepEqual(row.inputs,f.inputs);assert.equal(row.result,null);
   assert.equal((await db.query('SELECT count(*) FROM city_bloxx_leaderboard_entries WHERE run_id=$1',[quick.runId])).rows[0].count,'0');
 });
 const source=new DataSource(typeormOptions);await source.initialize();
 const security=new SecurityService(source),store=new GameStore(source,new GamePolicyService(security));
 const service=()=>new RunsService(store,{redis:{eval:async()=>1}},source);
 const actor={userId:a.id,sessionId:require('jsonwebtoken').decode(a.accessToken).sid,version:require('jsonwebtoken').decode(a.accessToken).ver};
 try{
 await test('new service instance recovers exact start ciphertext and pinned Daily after date changes',async()=>{
   await db.query("UPDATE city_bloxx_run_tickets SET date_utc=date_utc-1 WHERE run_id=$1",[daily.runId]);
   // Persisted config/response, rather than recalculating from the current UTC date.
   assert.equal(responseHash(await service().start(actor,body)),responseHash(daily),'exact recovered start receipt');
 });
 await test('persistent claim is exclusive; renew/reclaim/release invalidate stale lease across restart',async()=>{
   const original=(await db.query('SELECT first_received_at FROM city_bloxx_run_submissions WHERE run_id=$1',[quick.runId])).rows[0].first_received_at;
   const claimed=await Promise.all([service().claim(),service().claim()]);assert.equal(claimed.filter(Boolean).length,1);
   const first=claimed.find(Boolean);assert.equal(first.ticket.run_id,quick.runId);
   assert.equal(await service().renew(quick.runId,first.ticket.lease_id),true);
   assert.equal(await service().renew(quick.runId,randomUUID()),false);
   await db.query("UPDATE city_bloxx_run_tickets SET lease_expires_at=now()-interval '1 second' WHERE run_id=$1",[quick.runId]);
   const child=require('node:child_process').spawnSync(process.execPath,['-r','tsconfig-paths/register','-e',`
     const {DataSource}=require('typeorm');const {typeormOptions}=require('./dist/src/config/typeorm-options');
     const {RunsService}=require('./dist/src/modules/city-bloxx/runs.service');
     (async()=>{const db=new DataSource(typeormOptions);await db.initialize();try{const job=await new RunsService({}, {}, db).claim();
       console.log(JSON.stringify(job?{runId:job.ticket.run_id,leaseId:job.ticket.lease_id}:null));}finally{await db.destroy();}})().catch(()=>{process.exitCode=1;});
   `],{env:process.env,encoding:'utf8'});
   assert.equal(child.status,0,'fresh process recovery');const next=JSON.parse(child.stdout.trim());
   assert.equal(next.runId,quick.runId);assert.notEqual(next.leaseId,first.ticket.lease_id);
   assert.equal(await service().renew(quick.runId,first.ticket.lease_id),false);
   assert.equal(await service().release(quick.runId,first.ticket.lease_id),false);
   assert.equal(await service().release(quick.runId,next.leaseId),true);
   assert.equal(await service().renew(quick.runId,next.leaseId),false);
   assert.ok(await service().claim());
   assert.equal((await db.query('SELECT first_received_at FROM city_bloxx_run_submissions WHERE run_id=$1',[quick.runId])).rows[0].first_received_at.toISOString(),original.toISOString());
 });
 await test('expired unsettled ticket returns 410, cleanup purges ciphertext and queued job; auth users preserved',async()=>{
   const users=(await db.query('SELECT count(*) FROM users')).rows[0].count;
   await db.query("UPDATE city_bloxx_run_tickets SET issued_at=now()-interval '25 hours',expires_at=now()-interval '1 hour' WHERE run_id=$1",[quick.runId]);
   const old=(await db.query('SELECT client_request_id FROM city_bloxx_run_tickets WHERE run_id=$1',[quick.runId])).rows[0];
   status(await start(a,{mode:'quick',clientRequestId:old.client_request_id}),410);
   status(await api('POST','/runs/finish',finishBody(quick),a),410);await service().cleanup();
   const t=(await db.query('SELECT * FROM city_bloxx_run_tickets WHERE run_id=$1',[quick.runId])).rows[0];assert.equal(t.state,'expired');assert.equal(t.encrypted_start_response,null);assert.equal(t.lease_id,null);
   assert.equal(await service().claim(),null);assert.equal((await db.query('SELECT count(*) FROM users')).rows[0].count,users);
 });
 await test('terminal retry returns stored receipt after TTL; changed payload still conflicts',async()=>{
   // W1.6 owns settlement; this fixture checks the already-terminal receipt contract only.
   await db.query("UPDATE city_bloxx_run_tickets SET state='rejected' WHERE run_id=$1",[quick.runId]);
   await db.query("UPDATE city_bloxx_run_submissions SET reject_code='GAME_SIMULATION_INVALID' WHERE run_id=$1",[quick.runId]);
   assert.equal(status(await api('POST','/runs/finish',finishBody(quick),a),200).rejectCode,'GAME_SIMULATION_INVALID');
   status(await api('POST','/runs/finish',{...finishBody(quick),endTick:502},a),409);
   await db.query("UPDATE city_bloxx_run_tickets SET state='accepted' WHERE run_id=$1",[quick.runId]);
   await db.query("UPDATE city_bloxx_run_submissions SET state='accepted',result=$2,metrics=$3,verified_at=now(),reject_code=NULL WHERE run_id=$1",[quick.runId,{population:0},{population:0}]);
   assert.deepEqual(status(await api('POST','/runs/finish',finishBody(quick),a),200).result,{population:0});
 });
 await test('Redis/key unavailability fails closed without creating tickets',async()=>{
   await assert.rejects(new RunsService(store,{redis:{eval:async()=>{throw new Error('down');}}},source).start(actor,{mode:'quick',clientRequestId:randomUUID()}),e=>e.getStatus()===503);
   const old=process.env.GAME_TICKET_ENCRYPTION_KEY;delete process.env.GAME_TICKET_ENCRYPTION_KEY;
   try{await assert.rejects(service().start(actor,{mode:'quick',clientRequestId:randomUUID()}),e=>e.getStatus()===503);}finally{process.env.GAME_TICKET_ENCRYPTION_KEY=old;}
 });
 }finally{await source.destroy();}
 await test('only five new finish jobs per minute; exact retry does not spend another job',async()=>{
   const runs=[];await redis.del(`city-bloxx:rate:finish:${b.id}`,`city-bloxx:rate:start:${b.id}`);
   for(let i=0;i<6;i++)runs.push(status(await start(b),200));
   for(let i=0;i<5;i++)status(await api('POST','/runs/finish',finishBody(runs[i]),b),202);
   status(await api('POST','/runs/finish',finishBody(runs[0]),b),202);
   const limited=await api('POST','/runs/finish',finishBody(runs[5]),b);status(limited,429);assert.equal(limited.headers.get('retry-after'),'60');
 });
 await test('start limit 10/minute and status 30/minute return Retry-After without affecting another account',async()=>{
   await redis.del(`city-bloxx:rate:start:${b.id}`);const req={mode:'quick',clientRequestId:randomUUID()};
   for(let i=0;i<10;i++)status(await start(b,req),200);
   const limited=await start(b,req);status(limited,429);assert.equal(limited.headers.get('retry-after'),'60');
   await redis.del(`city-bloxx:rate:status:${a.id}`);
   for(let i=0;i<30;i++)status(await api('GET',`/runs/${quick.runId}`,undefined,a),200);
   const s=await api('GET',`/runs/${quick.runId}`,undefined,a);status(s,429);assert.equal(s.headers.get('retry-after'),'60');
   status(await api('GET',`/runs/${daily.runId}`,undefined,b),404);
 });
 }finally{
   // Do not leave this suite's privileged fixture active for last-admin regression.
   await db.query("DELETE FROM user_roles WHERE user_id=$1 AND role_id IN (SELECT id FROM roles WHERE code='super_admin')",[b.id]);
   for(const u of [a,b])for(const k of ['start','finish','status'])await redis.del(`city-bloxx:rate:${k}:${u.id}`);
   await redis.quit();
 }
 console.log(`RUN TICKETS SUITE: ${passed} scenarios passed`);
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>db.end());
