const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {Client}=require('pg');const {DataSource}=require('typeorm');const Redis=require('ioredis');
const {typeormOptions}=require('../dist/src/config/typeorm-options');
const {cityBloxxCore:core}=require('../dist/src/common/city-bloxx-core');
const {GameStore}=require('../dist/src/modules/city-bloxx/common/game-store.service');
const {GamePolicyService}=require('../dist/src/modules/city-bloxx/common/game-policy.service');
const {GameWorkerService,gameError}=require('../dist/src/modules/city-bloxx/common/game-worker.service');
const {SecurityService}=require('../dist/src/modules/security/security.service');
const {RunsService}=require('../dist/src/modules/city-bloxx/runs.service');
const {BoardsService,boardKey}=require('../dist/src/modules/city-bloxx/boards.service');
const {VerificationService}=require('../dist/src/modules/city-bloxx/verification.service');
if(!/^auth_test_[a-z0-9_]+$/.test(process.env.TEST_DATABASE||'')||process.env.DB_DATABASE!==process.env.TEST_DATABASE)throw new Error('Disposable auth_test database required');
const db=new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.TEST_DATABASE});
const base=process.env.TEST_GATEWAY_BASE_URL||process.env.TEST_BASE_URL;
let passed=0;
async function api(method,path,body,u){const r=await fetch(`${base}/city-bloxx${path}`,{method,headers:{'content-type':'application/json',...(u?{authorization:`Bearer ${u.accessToken}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.equal(r.headers.get('cache-control'),'no-store');return {status:r.status,json:await r.json(),headers:r.headers};}
function status(r,n){assert.equal(r.status,n,`HTTP ${r.status} expected ${n}, ${r.json.errorCode||''}`);return r.json.data;}
async function test(name,fn){await fn();passed++;console.log(`PASS verification: ${name}`);}
function record(t,kind='fail'){
 const g=new core.QuickTowerGame(t.config);
 while(g.getPhase()!=='ended'&&g.getTick()<60000){
  const s=g.getSnapshot();if(s.phase==='swing'){
   const prev=s.floors.at(-1),target=prev?prev.x+s.swayOffset*core.floorSwayWeight(s.floors.length-1):0;
   const fail=(kind==='fail'&&s.floors.length>=2)||(kind==='tall'&&s.floors.length>=4)||(kind==='roofMiss'&&s.isRoof);
   if(fail?Math.abs(s.current.x-target)>110:Math.abs(s.current.x-target)<3)g.drop(0);
  }g.advanceTicks(1);
 }assert.equal(g.getPhase(),'ended','test input generator must end');return g.getRecord();
}
const body=(t,r)=>({runId:t.runId,ticket:t.ticket,physicsVersion:t.physicsVersion,rulesetVersion:t.rulesetVersion,inputs:r.inputs,endTick:r.endTick});
async function main(){
 await db.connect();const source=new DataSource(typeormOptions);await source.initialize();const redis=new Redis(process.env.REDIS_URL),infra={redis};
 const support=require('./game-test-support.cjs')(db,base),users=[];
 const user=async()=>{const u=await support.user();users.push(u);return u;};
 const security=new SecurityService(source),store=new GameStore(source,new GamePolicyService(security));
 const runs=new RunsService(store,infra,source),pool=new GameWorkerService(),boards=new BoardsService(source,store,infra);
 const verifier=new VerificationService(runs,pool,store,boards,security);
 const fresh=async(u,mode='quick',kind='fail')=>{const t=status(await api('POST','/runs/start',{mode,clientRequestId:randomUUID()},u),200),r=record(t,kind);return{t,r,f:body(t,r)};};
 const queue=async(u,x)=>status(await api('POST','/runs/finish',x.f,u),202);
 const claim=async x=>{const job=await runs.claim(x.t.runId);assert.ok(job,'durable job claim');return job;};
 const row=async x=>(await db.query('SELECT * FROM city_bloxx_run_submissions WHERE run_id=$1',[x.t.runId])).rows[0];
 const entry=async x=>(await db.query('SELECT * FROM city_bloxx_leaderboard_entries WHERE run_id=$1',[x.t.runId])).rows[0];
 try{
 const a=await user(),b=await user();let quick,daily;
 await test('real server Quick inputs compute exact result/metrics; duplicate settlement updates board and audit once',async()=>{
  quick=await fresh(a);const q=await queue(a,quick),job=await claim(quick);
  const computed=await pool.run({operation:'verify',request:{config:job.ticket.config,physicsVersion:job.ticket.physics_version,rulesetVersion:job.ticket.ruleset_version,inputs:job.submission.inputs,endTick:job.submission.end_tick}});
  assert.deepEqual(computed.result,quick.r.result);
  assert.deepEqual((await Promise.all([verifier.settle(job,computed),verifier.settle(job,computed)])).sort(),[false,true]);
  const saved=await row(quick);assert.equal(saved.state,'accepted');assert.deepEqual(saved.result,quick.r.result);assert.deepEqual(saved.metrics,computed.metrics);
  assert.equal(saved.first_received_at.toISOString(),q.firstReceivedAt);
  assert.ok(await entry(quick));assert.equal((await db.query("SELECT count(*) FROM audit_logs WHERE target_id=$1 AND action='city_bloxx.run.accept'",[quick.t.runId])).rows[0].count,'1');
  assert.deepEqual(status(await api('POST','/runs/finish',quick.f,a),200).result,quick.r.result);
 });
 await test('server Daily complete and roof Miss are eligible; unfinished body is accepted outcome without board',async()=>{
  daily=await fresh(a,'daily','roofMiss');assert.equal(daily.r.result.height,20);await queue(a,daily);await verifier.process(await claim(daily));
  assert.equal((await row(daily)).state,'accepted');assert.ok(await entry(daily));assert.equal((await row(daily)).metrics.roof,'miss');
  const failed=await fresh(b,'daily');await queue(b,failed);await verifier.process(await claim(failed));assert.equal((await row(failed)).state,'accepted');assert.equal(await entry(failed),undefined);
 });
 await test('concurrent distinct runs for one account keep exactly one strictly better best entry',async()=>{
  const u=await user(),low=await fresh(u),high=await fresh(u,'quick','tall');
  assert.ok(high.r.result.population>low.r.result.population,'independent generated score ordering');
  await queue(u,low);await queue(u,high);const jobs=await Promise.all([claim(low),claim(high)]);
  await Promise.all(jobs.map(job=>verifier.process(job)));
  assert.equal((await row(low)).state,'accepted');assert.equal((await row(high)).state,'accepted');
  const entries=(await db.query('SELECT * FROM city_bloxx_leaderboard_entries WHERE user_id=$1',[u.id])).rows;
  assert.equal(entries.length,1);assert.equal(entries[0].run_id,high.t.runId);
  // An additional lower result arriving later cannot replace the already committed best.
  const later=await fresh(u);assert.ok(high.r.result.population>later.r.result.population);await queue(u,later);await verifier.process(await claim(later));
  assert.equal((await db.query('SELECT run_id FROM city_bloxx_leaderboard_entries WHERE user_id=$1',[u.id])).rows[0].run_id,high.t.runId);
 });
 await test('non-ended simulation rejects terminal, purges ticket ciphertext and never adds a board',async()=>{
  const x=await fresh(b);x.f={...x.f,inputs:[],endTick:1};await queue(b,x);await verifier.process(await claim(x));
  assert.equal((await row(x)).reject_code,'GAME_RUN_INVALID');assert.equal(await entry(x),undefined);
  const t=(await db.query('SELECT * FROM city_bloxx_run_tickets WHERE run_id=$1',[x.t.runId])).rows[0];assert.equal(t.encrypted_start_response,null);assert.equal(t.lease_id,null);
 });
 await test('worker overload/crash/timeout remains queued for retry rather than consuming ticket',async()=>{
  const u=await user(),x=await fresh(u);await queue(u,x);const job=await claim(x);
  const failed=new VerificationService(runs,{run:async()=>{throw gameError(503,'GAME_WORKER_UNAVAILABLE','unavailable');}},store,boards,security);
  await failed.process(job);assert.equal((await row(x)).state,'queued');assert.equal(await entry(x),undefined);
  await db.query("UPDATE city_bloxx_run_submissions SET retry_after=now()-interval '1 second' WHERE run_id=$1",[x.t.runId]);
  await verifier.process(await claim(x));assert.equal((await row(x)).state,'accepted');
 });
 await test('suspension between simulation and commit prevents accepted settlement; recovery resumes safely',async()=>{
  const u=await user(),x=await fresh(u);await queue(u,x);const job=await claim(x);
  const worker={run:async message=>{const r=await pool.run(message);await db.query("UPDATE users SET status='suspended' WHERE id=$1",[u.id]);return r;}};
  try{await new VerificationService(runs,worker,store,boards,security).process(job);assert.equal((await row(x)).state,'queued');assert.equal(await entry(x),undefined);assert.equal(await runs.claim(x.t.runId),null);}
  finally{await db.query("UPDATE users SET status='active' WHERE id=$1",[u.id]);}
  await db.query('UPDATE city_bloxx_run_submissions SET retry_after=now() WHERE run_id=$1',[x.t.runId]);await verifier.process(await claim(x));assert.equal((await row(x)).state,'accepted');
 });
 await test('session expiry during worker execution parks job; owner re-authentication binds new session and invalidates old lease',async()=>{
  let u=await user();const x=await fresh(u);await queue(u,x);const job=await claim(x),sid=job.submission.submitter_session_id;
  const worker={run:async message=>{const r=await pool.run(message);await db.query("UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE id=$1",[sid]);return r;}};
  await new VerificationService(runs,worker,store,boards,security).process(job);assert.equal((await row(x)).state,'queued');assert.equal(await entry(x),undefined);
  u=await support.login(u);await queue(u,x);const next=await claim(x);assert.notEqual(next.submission.submitter_session_id,sid);assert.notEqual(next.ticket.lease_id,job.ticket.lease_id);
  await verifier.process(next);assert.equal((await row(x)).state,'accepted');
 });
 await test('reclaimed lease fences stale worker and permits exactly one current settlement',async()=>{
  const u=await user(),x=await fresh(u);await queue(u,x);const old=await claim(x),computed=core.resimulateRun({config:x.t.config,physicsVersion:x.t.physicsVersion,rulesetVersion:x.t.rulesetVersion,inputs:x.r.inputs,endTick:x.r.endTick});
  await db.query("UPDATE city_bloxx_run_tickets SET lease_expires_at=now()-interval '1 second' WHERE run_id=$1",[x.t.runId]);const next=await claim(x);
  assert.equal(await verifier.settle(old,computed),false);assert.equal(await verifier.settle(next,computed),true);assert.equal((await row(x)).state,'accepted');
 });
 await test('board write failure rolls back terminal state, ciphertext purge and audit; same job can retry',async()=>{
  const u=await user(),x=await fresh(u);await queue(u,x);const job=await claim(x);
  await db.query(`CREATE FUNCTION cb_test_board_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$;
    CREATE TRIGGER cb_test_board_failure BEFORE INSERT ON city_bloxx_leaderboard_entries FOR EACH ROW EXECUTE FUNCTION cb_test_board_failure()`);
  try{await verifier.process(job);assert.equal((await row(x)).state,'queued');assert.equal(await entry(x),undefined);assert.ok((await db.query('SELECT encrypted_start_response FROM city_bloxx_run_tickets WHERE run_id=$1',[x.t.runId])).rows[0].encrypted_start_response);}
  finally{await db.query('DROP TRIGGER cb_test_board_failure ON city_bloxx_leaderboard_entries; DROP FUNCTION cb_test_board_failure()');}
  await db.query('UPDATE city_bloxx_run_submissions SET retry_after=now() WHERE run_id=$1',[x.t.runId]);await verifier.process(await claim(x));assert.equal((await row(x)).state,'accepted');
 });
 await test('startup dispatcher in a fresh process recovers persisted work and HTTP exposes verified result',async()=>{
  const u=await user(),x=await fresh(u);await queue(u,x);
  const child=spawnSync(process.execPath,['-r','tsconfig-paths/register','test/verification-dispatch.cjs',x.t.runId],{env:process.env,encoding:'utf8',timeout:20000});
  assert.equal(child.status,0,'fresh process automatic dispatcher');assert.deepEqual(status(await api('GET',`/runs/${x.t.runId}`,undefined,u),200).result,x.r.result);
 });
 await test('legacy pending jobs remain parked until owner retries exact payload to bind submitter session',async()=>{
  const u=await user(),x=await fresh(u);await queue(u,x);await db.query('UPDATE city_bloxx_run_submissions SET submitter_session_id=NULL,submitter_token_version=NULL WHERE run_id=$1',[x.t.runId]);
  assert.equal(await runs.claim(x.t.runId),null);await queue(u,x);await verifier.process(await claim(x));assert.equal((await row(x)).state,'accepted');
 });
 await test('public boards and private own standing share ranks and expose no private account/session/input data',async()=>{
  const list=status(await api('GET','/leaderboards/quick'),200);assert.ok(list.entries.length>0);
  for(const e of list.entries)for(const key of ['userId','user_id','email','fullName','ticket','inputs','run_id','sessionId'])assert.equal(key in e,false);
  const own=status(await api('GET','/leaderboards/quick/me',undefined,a),200);assert.ok(own.entry);assert.equal(list.entries.find(e=>e.publicId===own.entry.publicId).rank,own.entry.rank);
  status(await api('GET','/leaderboards/quick/me'),401);
  const dailyBoard=status(await api('GET',`/leaderboards/daily?dateUTC=${daily.t.config.daily.dateUTC}`),200);
  const dailyOwn=status(await api('GET',`/leaderboards/daily/me?dateUTC=${daily.t.config.daily.dateUTC}`,undefined,a),200);
  assert.ok(dailyOwn.entry,'settled Daily must be visible in its calendar-date partition');
  assert.equal(dailyBoard.entries.find(e=>e.publicId===dailyOwn.entry.publicId)?.rank,dailyOwn.entry.rank);
  for(const query of ['limit=51','limit=0','ownerId=forged','limit=nope'])status(await api('GET',`/leaderboards/quick?${query}`),422);
  status(await api('GET','/leaderboards/daily?dateUTC=2026-02-30'),400);
  status(await api('GET','/leaderboards/quick?cursor=invalid'),400);
 });
 await test('keyset cursor preserves microsecond received order, rational ties and UUID tie break; partition mismatch rejected',async()=>{
  // Controlled board fixtures isolate tie precision from varying real gameplay results.
  const partition={physicsVersion:'fixture-physics',rulesetVersion:'fixture-rules'},tickets=[];
  for(let i=0;i<3;i++){const u=await user(),x=await fresh(u);await queue(u,x);await verifier.process(await claim(x));tickets.push(x);
   await db.query(`UPDATE city_bloxx_leaderboard_entries SET board_key=$2,population=100,height=4,perfect_body=$3::integer,body_placements=$4::integer,
     perfect_ratio=round($3::integer::numeric/$4::integer,12),misses=1,simulation_ticks=100,first_received_at=$5 WHERE run_id=$1`,
     [x.t.runId,JSON.stringify(['quick',partition.physicsVersion,partition.rulesetVersion]),i===0?2:1,i===0?3:2,`2026-01-01T00:00:00.00000${i+1}Z`]);
  }
  const qs=`physicsVersion=${partition.physicsVersion}&rulesetVersion=${partition.rulesetVersion}&limit=1`;
  const pages=[];let cursor='';for(let i=0;i<3;i++){const p=status(await api('GET',`/leaderboards/quick?${qs}${cursor?'&cursor='+cursor:''}`),200);pages.push(p.entries[0]);cursor=p.nextCursor||'';}
  assert.deepEqual(pages.map(p=>p.rank),['1','2','3']);assert.equal(new Set(pages.map(p=>p.publicId)).size,3);assert.equal(pages[0].perfectRatio,'0.666666666667');
  assert.ok(pages[1].receivedAt.endsWith('000002Z'));assert.ok(pages[2].receivedAt.endsWith('000003Z'));
  const p=status(await api('GET',`/leaderboards/quick?${qs}`),200);status(await api('GET',`/leaderboards/daily?cursor=${p.nextCursor}`),400);
  // Better later score wins; an equal score keeps the earlier timestamp/run ID.
  const id=tickets[1].t.runId;await db.query('UPDATE city_bloxx_leaderboard_entries SET first_received_at=$2 WHERE run_id=$1',[id,'2026-01-01T00:00:00.000003Z']);
  const tied=status(await api('GET',`/leaderboards/quick?${qs}&limit=3`.replace('&limit=1','')),200).entries;
  const ids=tickets.slice(1).map(x=>x.t.runId).sort();const expected=(await db.query('SELECT public_id FROM city_bloxx_profiles WHERE user_id=(SELECT user_id FROM city_bloxx_run_tickets WHERE run_id=$1)',[ids[0]])).rows[0].public_id;
  assert.equal(tied[1].publicId,expected);
 });
 await test('quarantined or suspended owners are hidden, Redis outages fail closed, board rate limit returns Retry-After',async()=>{
  await db.query("UPDATE city_bloxx_run_submissions SET moderation_state='quarantined' WHERE run_id=$1",[quick.t.runId]);
  assert.equal(status(await api('GET','/leaderboards/quick/me',undefined,a),200).entry,null);
  await assert.rejects(new BoardsService(source,store,{redis:{eval:async()=>{throw new Error('offline');}}}).list('quick',{limit:20},'isolated-ip'),e=>e.getStatus()===503);
  const key='verification-test-'+randomUUID(),direct=new BoardsService(source,store,infra);
  for(let i=0;i<60;i++)await direct.list('quick',{limit:1},key);
  await assert.rejects(direct.list('quick',{limit:1},key),e=>e.getStatus()===429);
  await redis.del(`city-bloxx:rate:board:${require('node:crypto').createHash('sha256').update(key).digest('hex')}`);
 });
 console.log(`VERIFICATION/BOARDS SUITE: ${passed} scenarios passed`);
 }finally{
  await verifier.onModuleDestroy();pool.onModuleDestroy();for(const u of users)for(const k of ['start','finish','status'])await redis.del(`city-bloxx:rate:${k}:${u.id}`);await redis.quit();await source.destroy();
 }
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>db.end());
