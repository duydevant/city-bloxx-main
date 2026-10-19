const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { Client } = require('pg');
const { DataSource } = require('typeorm');
const { cityBloxxCore: core } = require('../dist/src/common/city-bloxx-core');
const { typeormOptions } = require('../dist/src/config/typeorm-options');
const { CloudService } = require('../dist/src/modules/city-bloxx/cloud.service');
const { GameWorkerService } = require('../dist/src/modules/city-bloxx/common/game-worker.service');
const { GameStore } = require('../dist/src/modules/city-bloxx/common/game-store.service');
const { GamePolicyService } = require('../dist/src/modules/city-bloxx/common/game-policy.service');
const { SecurityService } = require('../dist/src/modules/security/security.service');
const { digest } = require('../dist/src/modules/security/infrastructure.service');
if(!/^auth_test_[a-z0-9_]+$/.test(process.env.TEST_DATABASE||'')||process.env.DB_DATABASE!==process.env.TEST_DATABASE) throw new Error('Cloud suite requires disposable auth_test database');
const db = new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.TEST_DATABASE});
const base = process.env.TEST_GATEWAY_BASE_URL || process.env.TEST_BASE_URL;
let passed = 0;
const password = `Strong${randomBytes(16).toString('hex')}!`;
async function api(method,path,body,user) {
  const response = await fetch(`${base}${path}`, {method,headers:{'content-type':'application/json',...(user?{authorization:`Bearer ${user.accessToken}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const json = await response.json().catch(()=>({}));
  if(path.startsWith('/city-bloxx/')) assert.equal(response.headers.get('cache-control'),'no-store');
  return {status:response.status,data:json.data,json,headers:response.headers};
}
function status(r,n) { assert.equal(r.status,n,JSON.stringify(r.json)); return r; }
async function test(name,fn) { await fn(); passed++; console.log(`PASS cloud: ${name}`); }
async function user(superAdmin=false) {
  const email=`cloud-${randomUUID()}@example.test`;
  const r=status(await api('POST','/auth/register',{email,password}),201);
  await db.query("UPDATE users SET status='active',email_verified_at=now() WHERE id=$1",[r.data.id]);
  if(superAdmin) await db.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code='super_admin'",[r.data.id]);
  const login=status(await api('POST','/auth/login',{email,password}),201);
  return {id:r.data.id,...login.data};
}
const write=(revision,payload=core.emptySave())=>({expectedRevision:revision,mutationId:randomUUID(),schema:payload.schema,payload});
const read=u=>api('GET','/city-bloxx/save',undefined,u);
const put=(u,body)=>api('PUT','/city-bloxx/save',body,u);
const resolve=(revision,choice,payload)=>({expectedRevision:revision,mutationId:randomUUID(),choice,local:{schema:payload.schema,rawPayload:JSON.stringify(payload)},localBackupAcknowledged:true});
async function main() {
  await db.connect();
  const a=await user(),b=await user(true);
  await test('strict profile defaults, independent public UUID, no account identity leakage',async()=>{
    const p=status(await api('GET','/city-bloxx/profile',undefined,a),200).data;
    assert.match(p.publicId,/^[a-f0-9-]{36}$/); assert.notEqual(p.publicId,a.id); assert.equal(p.alias,'Builder');
    for(const key of ['email','fullName','roles','userId','user_id']) assert.equal(key in p,false);
    const patch={alias:'Người xây',locale:'vi',preferences:{musicEnabled:false}};
    const edited=status(await api('PATCH','/city-bloxx/profile',patch,a),200).data;
    assert.equal(edited.alias,patch.alias); assert.equal(edited.preferences.musicEnabled,false);
    for(const body of [{userId:b.id},{alias:'<bad>'},{alias:null},{preferences:{email:'secret'}},{preferences:null},{locale:'xx'}]) status(await api('PATCH','/city-bloxx/profile',body,a),422);
    assert.equal(status(await api('GET','/city-bloxx/profile',undefined,b),200).data.alias,'Builder');
  });
  await test('absent revision zero and authentication/no-store including errors',async()=>{
    assert.deepEqual(status(await read(a),200).data,{revision:'0',schema:null,hash:null,updatedAt:null,compatibility:'absent',payload:null});
    status(await read(),401);
    status(await put(a,{...write('0'),userId:b.id}),422);
    status(await put(a,write('9223372036854775808')),400);
    status(await put(a,{...write('0'),expectedRevision:0}),422);
  });
  let first,receipt;
  await test('first CAS write, normalized hash and durable exact retry receipt',async()=>{
    first=write('0'); receipt=status(await put(a,first),200).data;
    assert.equal(receipt.revision,'1'); assert.match(receipt.hash,/^[a-f0-9]{64}$/);
    assert.deepEqual(status(await put(a,first),200).data,receipt);
    status(await put(a,{...first,payload:{...first.payload,runs:7}}),409);
    assert.equal(status(await read(a),200).data.revision,'1');
  });
  await test('stale CAS conflict exposes metadata without payload and preserves committed save',async()=>{
    const conflict=status(await put(a,write('0')),409);
    assert.equal(conflict.json.errorCode,'GAME_REVISION_CONFLICT'); assert.equal(conflict.json.latest.revision,'1'); assert.equal('payload' in conflict.json.latest,false);
  });
  await test('two concurrent writers commit exactly one revision',async()=>{
    const results=await Promise.all([put(a,write('1',{...core.emptySave(),runs:2})),put(a,write('1',{...core.emptySave(),runs:3}))]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]); assert.equal(status(await read(a),200).data.revision,'2');
  });
  await test('same mutation with concurrent different payloads commits exactly one request',async()=>{
    const c=await user(),body=write('0');
    const results=await Promise.all([put(c,body),put(c,{...body,payload:{...body.payload,runs:8}})]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    assert.equal(results.find(r=>r.status===409).json.errorCode,'GAME_MUTATION_CONFLICT');
    assert.equal(status(await read(c),200).data.revision,'1');
  });
  await test('concurrent identical mutation commits once and retry survives newer writes',async()=>{
    const body=write('2'); const results=await Promise.all([put(a,body),put(a,body)]);
    assert.deepEqual(results.map(r=>r.status),[200,200]); assert.deepEqual(results[0].data,results[1].data);
    assert.equal(results[0].data.revision,'3'); assert.deepEqual(status(await put(a,first),200).data,receipt);
    assert.equal((await db.query('SELECT count(*) FROM city_bloxx_save_mutations WHERE user_id=$1',[a.id])).rows[0].count,'3');
  });
  await test('super-admin own routes cannot target foreign profile, save or receipt',async()=>{
    assert.equal(status(await read(b),200).data.revision,'0');
    status(await put(b,{...write('0'),accountId:a.id}),422);
    status(await api('GET',`/city-bloxx/save/${a.id}`,undefined,b),404);
    assert.equal(status(await put(b,first),200).data.revision,'1'); // same UUID is scoped to B
    assert.equal(status(await read(a),200).data.revision,'3');
  });
  await test('unknown and invalid local saves never become empty cloud saves',async()=>{
    const unknown=status(await put(a,{...write('3'),schema:999,payload:{schema:999,future:'preserve'}}),409);
    assert.equal(unknown.json.errorCode,'GAME_SAVE_INCOMPATIBLE');
    status(await put(a,{...write('3'),payload:{schema:4}}),422);
    status(await put(a,{...write('3'),schema:3}),422);
    status(await put(a,write('3',{...core.emptySave(),invalidText:'\0'})),422);
    status(await put(a,write('3',{...core.emptySave(),invalidText:'\ud800'})),422);
    assert.equal(status(await read(a),200).data.revision,'3');
  });
  await test('explicit local resolve backs up both candidates and increments once',async()=>{
    const before=status(await read(a),200).data;
    const local={...core.emptySave(),runs:10}; const body=resolve('3','local',local);
    const result=status(await api('POST','/city-bloxx/save/resolve',body,a),200).data;
    assert.equal(result.revision,'4'); assert.equal(result.backupIds.length,2);
    assert.deepEqual(status(await api('POST','/city-bloxx/save/resolve',body,a),200).data,result);
    const backups=(await db.query('SELECT * FROM city_bloxx_save_backups WHERE user_id=$1 ORDER BY source',[a.id])).rows;
    assert.deepEqual(JSON.parse(backups.find(b=>b.source==='cloud').raw_payload),before.payload);
    assert.equal(backups.find(b=>b.source==='local').raw_payload,body.local.rawPayload);
    assert.equal(status(await read(a),200).data.payload.runs,10);
    status(await api('POST','/city-bloxx/save/resolve',{...resolve('4','local',local),localBackupAcknowledged:false},a),422);
  });
  await test('cloud choice preserves future local raw JSON verbatim',async()=>{
    const body=resolve('4','cloud',{schema:999,future:'unknown'}); body.local.rawPayload=' { "schema": 999, "future": "unknown", "text": "\\u0000" } ';
    const result=status(await api('POST','/city-bloxx/save/resolve',body,a),200).data;
    assert.equal(result.revision,'5');
    const backup=(await db.query('SELECT raw_payload FROM city_bloxx_save_backups WHERE id=$1',[result.backupIds[0]])).rows[0];
    assert.equal(backup.raw_payload,body.local.rawPayload); assert.equal(status(await read(a),200).data.payload.runs,10);
  });
  await test('backup failure rolls back backup, save revision, receipt and audit together',async()=>{
    const body=resolve('5','local',core.emptySave());
    await db.query(`CREATE FUNCTION cloud_test_backup_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.source='cloud' THEN RAISE EXCEPTION 'fixture backup failure'; END IF; RETURN NEW; END $$`);
    await db.query('CREATE TRIGGER cloud_test_backup_failure BEFORE INSERT ON city_bloxx_save_backups FOR EACH ROW EXECUTE FUNCTION cloud_test_backup_failure()');
    const before=(await db.query('SELECT count(*) FROM city_bloxx_save_backups WHERE user_id=$1',[a.id])).rows[0].count;
    try { status(await api('POST','/city-bloxx/save/resolve',body,a),500); }
    finally { await db.query('DROP TRIGGER cloud_test_backup_failure ON city_bloxx_save_backups'); await db.query('DROP FUNCTION cloud_test_backup_failure()'); }
    assert.equal(status(await read(a),200).data.revision,'5');
    assert.equal((await db.query('SELECT count(*) FROM city_bloxx_save_backups WHERE user_id=$1',[a.id])).rows[0].count,before);
    assert.equal((await db.query('SELECT count(*) FROM city_bloxx_save_mutations WHERE mutation_id=$1',[body.mutationId])).rows[0].count,'0');
    status(await api('POST','/city-bloxx/save/resolve',body,a),200);
  });
  await test('future cloud schema remains readable and cannot be overwritten, even by super-admin',async()=>{
    const future={schema:999,future:'intact'};
    await db.query('UPDATE city_bloxx_saves SET schema=999,payload=$2,payload_hash=$3 WHERE user_id=$1',[b.id,future,digest(JSON.stringify(future))]);
    const r=status(await read(b),200).data; assert.equal(r.compatibility,'incompatible'); assert.deepEqual(r.payload,future);
    status(await put(b,write('1')),409);
    status(await api('POST','/city-bloxx/save/resolve',resolve('1','local',core.emptySave()),b),409);
    assert.equal(status(await api('POST','/city-bloxx/save/resolve',resolve('1','cloud',core.emptySave()),b),200).data.revision,'2');
    assert.deepEqual(status(await read(b),200).data.payload,future);
  });
  await test('BIGINT CAS is exact above JavaScript safe integer and rejects overflow',async()=>{
    await db.query('UPDATE city_bloxx_saves SET revision=$2,schema=5,payload=$3 WHERE user_id=$1',[b.id,'9007199254740993',core.emptySave()]);
    assert.equal(status(await put(b,write('9007199254740993')),200).data.revision,'9007199254740994');
    await db.query("UPDATE city_bloxx_saves SET revision=9223372036854775807 WHERE user_id=$1",[b.id]);
    assert.equal(status(await put(b,write('9223372036854775807')),409).json.errorCode,'GAME_REVISION_EXHAUSTED');
  });
  await test('payload and normalized JSONB budgets reject without a mutation',async()=>{
    const c=await user();
    status(await put(c,write('0',{...core.emptySave(),padding:'x'.repeat(262144)})),413);
    // Thousands of nested keys add canonical JSONB whitespace beyond the compact budget.
    const large={...core.emptySave(),padding:Object.fromEntries(Array.from({length:24000},(_,i)=>[i,0]))};
    assert.ok(Buffer.byteLength(JSON.stringify(large))<262144);
    status(await put(c,write('0',large)),413);
    assert.equal(status(await read(c),200).data.revision,'0');
  });
  await test('email verification, active status and revoked permissions apply to super-admin/self writes',async()=>{
    await db.query('UPDATE users SET email_verified_at=NULL WHERE id=$1',[b.id]); status(await put(b,write('9223372036854775807')),403);
    await db.query("UPDATE users SET status='suspended' WHERE id=$1",[b.id]); status(await read(b),401);
    await db.query("UPDATE permissions SET is_active=false WHERE code='city_bloxx_save:write'");
    try { status(await put(a,write('6')),403); } finally { await db.query("UPDATE permissions SET is_active=true WHERE code='city_bloxx_save:write'"); }
  });
  await directServiceChecks(a);
  await test('30 cloud writes per minute per account, Retry-After, other account unaffected',async()=>{
    const c=await user(),d=await user(); const body=write('0');
    for(let i=0;i<30;i++) status(await put(c,body),200);
    const limited=status(await put(c,body),429); assert.equal(limited.headers.get('retry-after'),'60');
    status(await put(d,write('0')),200);
  });
  console.log(`CLOUD API SUITE: ${passed} scenarios passed`);
}
async function directServiceChecks(a) {
  const source=new DataSource(typeormOptions); await source.initialize();
  const security=new SecurityService(source),store=new GameStore(source,new GamePolicyService(security)),workers=new GameWorkerService();
  const actor={userId:a.id,sessionId:require('jsonwebtoken').decode(a.accessToken).sid,version:require('jsonwebtoken').decode(a.accessToken).ver};
  const infra={redis:{eval:async()=>1}};
  const cloud=new CloudService(store,workers,infra,security,source);
  try {
    await test('Redis failure fails closed before any validation/write',async()=>{
      const service=new CloudService(store,workers,{redis:{eval:async()=>{throw new Error('offline');}}},security,source);
      await assert.rejects(service.write(actor,write('6')),e=>e.getStatus()===503&&e.getResponse().errorCode==='GAME_RATE_UNAVAILABLE');
    });
    await test('identity is rechecked after worker validation before committing',async()=>{
      const service=new CloudService(store,{run:async message=>{
        const result=await workers.run(message);
        await source.query("UPDATE users SET status='suspended' WHERE id=$1",[a.id]); return result;
      }},infra,security,source);
      try { await assert.rejects(service.write(actor,write('6')),e=>e.getStatus()===401); }
      finally { await source.query("UPDATE users SET status='active' WHERE id=$1",[a.id]); }
      assert.equal((await source.query('SELECT revision FROM city_bloxx_saves WHERE user_id=$1',[a.id]))[0].revision,'6');
    });
    await test('database lock contention times out as retryable 503 without committing',async()=>{
      const locker=source.createQueryRunner(); await locker.connect(); await locker.startTransaction();
      try {
        await locker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1313))',[`city-bloxx:save:${a.id}`]);
        await assert.rejects(cloud.write(actor,write('6')),e=>e.getStatus()===503&&e.getResponse().errorCode==='GAME_STORE_UNAVAILABLE');
      } finally { await locker.rollbackTransaction(); await locker.release(); }
      assert.equal((await source.query('SELECT revision FROM city_bloxx_saves WHERE user_id=$1',[a.id]))[0].revision,'6');
    });
    await test('expired receipt and backup cleanup retains unexpired and foreign auth data',async()=>{
      const receipt=(await source.query('SELECT * FROM city_bloxx_save_mutations WHERE user_id=$1 LIMIT 1',[a.id]))[0];
      await source.query("UPDATE city_bloxx_save_mutations SET created_at=now()-interval '32 days',expires_at=now()-interval '1 day' WHERE user_id=$1 AND mutation_id=$2",[a.id,receipt.mutation_id]);
      await source.query("UPDATE city_bloxx_save_backups SET created_at=now()-interval '32 days',expires_at=now()-interval '1 day' WHERE user_id=$1",[a.id]);
      const users=(await source.query('SELECT count(*) FROM users'))[0].count;
      await cloud.cleanup();
      assert.equal((await source.query('SELECT count(*) FROM city_bloxx_save_mutations WHERE user_id=$1 AND mutation_id=$2',[a.id,receipt.mutation_id]))[0].count,'0');
      assert.equal((await source.query('SELECT count(*) FROM city_bloxx_save_backups WHERE user_id=$1',[a.id]))[0].count,'0');
      assert.equal((await source.query('SELECT count(*) FROM users'))[0].count,users);
      assert.ok(Number((await source.query('SELECT count(*) FROM city_bloxx_save_mutations WHERE user_id=$1',[a.id]))[0].count)>0);
    });
  } finally { workers.onModuleDestroy(); await source.destroy(); }
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>db.end());
