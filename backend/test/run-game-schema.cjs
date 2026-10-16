const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { DataSource } = require('typeorm');
const argon2 = require('argon2');
const { typeormOptions } = require('../dist/src/config/typeorm-options');
const { AuthRbac1791840000000 } = require('../dist/src/database/migrations/1791840000000-AuthRbac');
const { seedAuthRbac, SeedConfigurationError } = require('../dist/src/database/seed');
const { CATALOG } = require('../dist/src/modules/security/types');
const { SecurityService } = require('../dist/src/modules/security/security.service');
const { GAME_PERMISSIONS, GAME_SELF_PERMISSIONS } = require('../dist/src/modules/city-bloxx/common/permissions');
const { GameStore } = require('../dist/src/modules/city-bloxx/common/game-store.service');
const { GamePolicyService } = require('../dist/src/modules/city-bloxx/common/game-policy.service');
const { GameRepository } = require('../dist/src/modules/city-bloxx/common/game.repository');

const tables = ['profiles','saves','save_mutations','save_backups','run_tickets','run_submissions','leaderboard_entries','analytics_events'];
const H = 'a'.repeat(64);
let passed = 0;
async function test(name, work) { await work(); passed++; console.log(`PASS game schema: ${name}`); }
const connection = { host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE };
async function isolated(work, authOnly = false) {
  const database = `city_bloxx_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(database, /^city_bloxx_test_[a-f0-9]{32}$/);
  const admin = new Client(connection);
  let db;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    db = new DataSource({ ...typeormOptions, database, ...(authOnly ? { migrations: [AuthRbac1791840000000] } : {}) });
    await db.initialize();
    await work(db, database);
  } finally {
    if (db?.isInitialized) await db.destroy();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  }
}
async function grants(db, role) {
  return (await db.query('SELECT p.code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE r.code=$1 ORDER BY p.code', [role])).map(p => p.code);
}
async function snapshotAuth(db) {
  const result = {};
  for (const table of ['users','roles','user_roles','auth_sessions','refresh_tokens','password_reset_tokens','email_verification_tokens','audit_logs','mail_outbox']) {
    result[table] = await db.query(`SELECT * FROM ${table} t ORDER BY to_jsonb(t)::text`);
  }
  result.permissions = await db.query("SELECT * FROM permissions WHERE code NOT LIKE 'city_bloxx_%' ORDER BY id");
  result.grants = await db.query("SELECT rp.* FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE p.code NOT LIKE 'city_bloxx_%' ORDER BY rp.role_id,rp.permission_id");
  return JSON.stringify(result);
}
async function legacyFixture(db) {
  const ids = {};
  for (const role of ['user','admin','super_admin','custom_editor']) {
    ids[role] = randomUUID();
    await db.query('INSERT INTO roles(id,code,name,is_system,is_default) VALUES($1,$2,$2,$3,$4)', [ids[role],role,role!=='custom_editor',role==='user']);
  }
  for (const code of CATALOG.filter(code => !code.startsWith('city_bloxx_'))) {
    const [resource, action] = code.split(':');
    await db.query('INSERT INTO permissions(id,code,resource,action,name,is_system) VALUES($1,$2,$3,$4,$2,true)', [randomUUID(),code,resource,action]);
  }
  await db.query("INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code='admin' OR (r.code='user' AND p.code='profile:read')");
  const password = randomBytes(24).toString('base64url');
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  const users = [];
  for (const status of ['active','pending','suspended']) {
    const userId = randomUUID(); users.push(userId);
    await db.query('INSERT INTO users(id,email,password_hash,status,token_version,full_name,email_verified_at) VALUES($1,$2,$3,$4,3,$5,now())', [userId,`upgrade-${randomUUID()}@example.test`,hash,status,'Existing player']);
    await db.query('INSERT INTO user_roles(user_id,role_id) VALUES($1,$2)', [userId,ids.user]);
  }
  const sessionId = randomUUID();
  await db.query("INSERT INTO auth_sessions(id,user_id,expires_at,device_name) VALUES($1,$2,now()+interval '1 day','Existing device')", [sessionId,users[0]]);
  await db.query("INSERT INTO refresh_tokens(id,session_id,family_id,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '1 day')", [randomUUID(),sessionId,randomUUID(),H]);
  for (const table of ['password_reset_tokens','email_verification_tokens']) {
    await db.query(`INSERT INTO ${table}(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')`, [randomUUID(),users[0],H]);
  }
  await db.query("INSERT INTO audit_logs(id,actor_id,action,metadata) VALUES($1,$2,'fixture.existing',$3)", [randomUUID(),users[0],{ preserved: true }]);
  await db.query("INSERT INTO mail_outbox(id,payload,expires_at) VALUES($1,'existing encrypted fixture',now()+interval '1 day')", [randomUUID()]);
  return { userId: users[0], sessionId, password, hash, ids };
}
async function reconnectFull(db, database) {
  await db.destroy();
  const full = new DataSource({ ...typeormOptions, database });
  await full.initialize();
  return full;
}
async function rejected(db, sql, values, code = '23514') {
  await assert.rejects(db.query(sql, values), error => error.driverError?.code === code);
}
async function main() {
  Object.assign(process.env, { ADMIN_EMAIL: '', ADMIN_PASSWORD: '', ADMIN_FULL_NAME: '' });
  await isolated(async db => {
    await test('fresh full migration chain and exact default grants', async () => {
      assert.equal((await db.runMigrations({ transaction: 'all' })).length, db.migrations.length);
      await seedAuthRbac(db);
      assert.deepEqual(await grants(db,'user'), ['profile:read','profile:update',...GAME_SELF_PERMISSIONS].sort());
      assert.deepEqual(await grants(db,'admin'), [...CATALOG].sort());
      assert.deepEqual(await grants(db,'super_admin'), []);
      assert.equal((await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'city_bloxx_%'")).length, 8);
    });
    await test('seed rerun keeps revoked grants and inactive permission flags', async () => {
      await db.query("DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE code='user') AND permission_id IN (SELECT id FROM permissions WHERE code='city_bloxx_save:write')");
      await db.query("UPDATE permissions SET is_active=false WHERE code='city_bloxx_runs:start'");
      await seedAuthRbac(db); await seedAuthRbac(db);
      assert.ok(!(await grants(db,'user')).includes('city_bloxx_save:write'));
      assert.equal((await db.query("SELECT is_active FROM permissions WHERE code='city_bloxx_runs:start'"))[0].is_active,false);
    });
    await test('seed fails rather than trusting a custom permission collision', async () => {
      await db.query("UPDATE permissions SET is_system=false WHERE code='city_bloxx_moderation:update'");
      await assert.rejects(seedAuthRbac(db), SeedConfigurationError);
      assert.equal((await db.query("SELECT is_system FROM permissions WHERE code='city_bloxx_moderation:update'"))[0].is_system,false);
      await db.query("UPDATE permissions SET is_system=true WHERE code='city_bloxx_moderation:update'");
    });
    await test('full down/up covers every migration rather than only the final grant migration', async () => {
      for (let n=0;n<db.migrations.length;n++) await db.undoLastMigration({ transaction:'all' });
      assert.equal((await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'migrations'")).length,0);
      assert.equal((await db.runMigrations({ transaction:'all' })).length,db.migrations.length);
      await seedAuthRbac(db); await seedAuthRbac(db);
      assert.equal((await db.runMigrations({ transaction:'all' })).length,0);
    });
  });
  await isolated(async db => {
    await test('W1.5 upgrade preserves pending submissions and auth data without inventing submitter identity',async()=>{
      const index=db.migrations.findIndex(m=>m.name==='CityBloxxVerification1792108800000');assert.ok(index>=0);
      const [latest]=db.migrations.splice(index,1);
      await db.runMigrations({transaction:'all'});await seedAuthRbac(db);
      const owner=randomUUID(),run=randomUUID();
      await db.query("INSERT INTO users(id,email,password_hash,status,email_verified_at) VALUES($1,$2,$3,'active',now())",[owner,`legacy-${owner}@example.test`,H]);
      await db.query("INSERT INTO city_bloxx_run_tickets(run_id,user_id,client_request_id,request_hash,token_hash,mode,config,physics_version,ruleset_version,expires_at) VALUES($1,$2,$3,$4,$4,'quick','{}','p','r',now()+interval '1 day')",[run,owner,randomUUID(),H]);
      await db.query("INSERT INTO city_bloxx_run_submissions(run_id,user_id,submission_hash,inputs,end_tick) VALUES($1,$2,$3,'[]',1)",[run,owner,H]);
      const before=await snapshotAuth(db),saved=(await db.query('SELECT * FROM city_bloxx_run_submissions WHERE run_id=$1',[run]))[0];
      db.migrations.push(latest);assert.equal((await db.runMigrations({transaction:'all'})).length,1);
      assert.equal(await snapshotAuth(db),before);
      const upgraded=(await db.query('SELECT * FROM city_bloxx_run_submissions WHERE run_id=$1',[run]))[0];
      for(const key of Object.keys(saved))assert.deepEqual(upgraded[key],saved[key]);
      assert.equal(upgraded.submitter_session_id,null);assert.equal(upgraded.submitter_token_version,null);
      await db.undoLastMigration({transaction:'all'});assert.equal(await snapshotAuth(db),before);
    });
  });
  await isolated(async (initial, database) => {
    await initial.runMigrations({ transaction:'all' });
    const fixture = await legacyFixture(initial);
    const before = await snapshotAuth(initial);
    const db = await reconnectFull(initial,database);
    try {
      await test('auth-only upgrade preserves password hashes, accounts, sessions, role grants, tokens, outbox and audit', async () => {
        assert.equal((await db.runMigrations({ transaction:'all' })).length,db.migrations.length-1);
        assert.equal(await snapshotAuth(db),before);
        const [user] = await db.query('SELECT * FROM users WHERE id=$1',[fixture.userId]);
        assert.equal(user.password_hash,fixture.hash);
        assert.ok(await argon2.verify(user.password_hash,fixture.password));
        assert.deepEqual((await grants(db,'user')).filter(p=>p.startsWith('city_bloxx_')), [...GAME_SELF_PERMISSIONS].sort());
        assert.deepEqual((await grants(db,'admin')).filter(p=>p.startsWith('city_bloxx_')), [...GAME_PERMISSIONS].sort());
        assert.deepEqual(await grants(db,'custom_editor'),[]);
      });
      await exerciseSchema(db,fixture);
      await test('game-only down preserves complete auth history and can be reapplied', async () => {
        for(let n=1;n<db.migrations.length;n++) await db.undoLastMigration({transaction:'all'});
        assert.equal(await snapshotAuth(db),before);
        assert.equal((await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'city_bloxx_%'")).length,0);
        assert.equal((await db.runMigrations({transaction:'all'})).length,db.migrations.length-1);
      });
    } finally { await db.destroy(); }
  },true);
  await isolated(async (initial,database) => {
    await initial.runMigrations({transaction:'all'});
    await legacyFixture(initial);
    const collision='city_bloxx_moderation:update';
    const id=randomUUID();
    await initial.query('INSERT INTO permissions(id,code,resource,action,name) VALUES($1,$2,$3,$4,$2)',[id,collision,'city_bloxx_moderation','update']);
    const db=await reconnectFull(initial,database);
    try {
      await test('permission collision aborts all new migrations atomically without promotion', async () => {
        await assert.rejects(db.runMigrations({transaction:'all'}),/non-system permission/);
        assert.equal((await db.query('SELECT * FROM migrations')).length,1);
        assert.equal((await db.query("SELECT tablename FROM pg_tables WHERE tablename LIKE 'city_bloxx_%'")).length,0);
        assert.equal((await db.query('SELECT is_system FROM permissions WHERE id=$1',[id]))[0].is_system,false);
      });
      await test('system role collision fails and recovery retains a preexisting inactive system game permission', async () => {
        await db.query('DELETE FROM permissions WHERE id=$1',[id]);
        await db.query("UPDATE roles SET is_system=false WHERE code='user'");
        await assert.rejects(db.runMigrations({transaction:'all'}),/system user\/admin roles/);
        assert.equal((await db.query('SELECT * FROM migrations')).length,1);
        await db.query("UPDATE roles SET is_system=true WHERE code='user'");
        await db.query("INSERT INTO permissions(id,code,resource,action,name,is_system,is_active) VALUES($1,'city_bloxx_runs:read','city_bloxx_runs','read','Existing',true,false)",[id]);
        await db.runMigrations({transaction:'all'});
        const [permission]=await db.query('SELECT * FROM permissions WHERE id=$1',[id]);
        assert.equal(permission.is_active,false);
        assert.equal(permission.name,'Existing');
        await db.query("DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE code='user') AND permission_id=$1",[id]);
        await db.runMigrations({transaction:'all'}); await seedAuthRbac(db);
        assert.ok(!(await grants(db,'user')).includes('city_bloxx_runs:read'));
      });
    } finally { await db.destroy(); }
  },true);
  console.log(`GAME SCHEMA SUITE: ${passed} scenarios passed`);
}

async function exerciseSchema(db, fixture) {
  const owner=fixture.userId, other=randomUUID(), run=randomUUID();
  await db.query("INSERT INTO users(id,email,password_hash,status,email_verified_at) VALUES($1,$2,'fixture-only','active',now())",[other,`other-${randomUUID()}@example.test`]);
  // Snapshot comparisons later intentionally exclude this temporary fixture principal.
  try {
    await test('profile/save/receipt/backup constraints preserve owner and BIGINT precision', async () => {
      const publicId=randomUUID();
      await db.query('INSERT INTO city_bloxx_profiles(user_id,public_id,alias) VALUES($1,$2,$3)',[owner,publicId,'Player']);
      await rejected(db,'INSERT INTO city_bloxx_profiles(user_id,public_id,alias) VALUES($1,$2,$3)',[other,publicId,'Other'],'23505');
      await rejected(db,"UPDATE city_bloxx_profiles SET preferences=$1 WHERE user_id=$2",[{email:'private'},owner]);
      await rejected(db,"UPDATE city_bloxx_profiles SET alias='<b>' WHERE user_id=$1",[owner]);
      await db.query('INSERT INTO city_bloxx_saves(user_id,schema,revision,payload,payload_hash) VALUES($1,4,$2,$3,$4)',[owner,'9007199254740993',{},H]);
      assert.equal((await db.query('SELECT revision FROM city_bloxx_saves WHERE user_id=$1',[owner]))[0].revision,'9007199254740993');
      await rejected(db,'UPDATE city_bloxx_saves SET revision=0 WHERE user_id=$1',[owner]);
      const mutation=randomUUID();
      const receipt=[owner,mutation,H,'9007199254740993',{}];
      await db.query('INSERT INTO city_bloxx_save_mutations(user_id,mutation_id,request_hash,committed_revision,receipt) VALUES($1,$2,$3,$4,$5)',receipt);
      await rejected(db,'INSERT INTO city_bloxx_save_mutations(user_id,mutation_id,request_hash,committed_revision,receipt) VALUES($1,$2,$3,$4,$5)',receipt,'23505');
      await db.query('INSERT INTO city_bloxx_save_backups(id,user_id,source,schema,revision,raw_payload,payload_hash) VALUES($1,$2,$3,999,0,$4,$5)',[randomUUID(),owner,'local','raw future save',H]);
      await rejected(db,'INSERT INTO city_bloxx_saves(user_id,schema,revision,payload,payload_hash) VALUES($1,4,1,$2,$3)',[randomUUID(),{},H],'23503');
    });
    const request=randomUUID();
    const insertTicket='INSERT INTO city_bloxx_run_tickets(run_id,user_id,client_request_id,request_hash,token_hash,mode,config,physics_version,ruleset_version,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval \'1 day\')';
    const ticket=[run,owner,request,H,H,'quick',{},'physics-0.13.0','quick-tower-0.13.0'];
    await test('ticket/request/token uniqueness, canonical mode/date, lease and ciphertext invariants',async()=>{
      await db.query(insertTicket,ticket);
      await rejected(db,insertTicket,[randomUUID(),owner,request,H,'b'.repeat(64),'quick',{},'p','r'],'23505');
      await rejected(db,insertTicket,[randomUUID(),other,randomUUID(),H,H,'quick',{},'p','r'],'23505');
      await rejected(db,"UPDATE city_bloxx_run_tickets SET mode='daily' WHERE run_id=$1",[run]);
      await rejected(db,"UPDATE city_bloxx_run_tickets SET state='processing' WHERE run_id=$1",[run]);
      await rejected(db,"UPDATE city_bloxx_run_tickets SET encrypted_start_response='encrypted' WHERE run_id=$1",[run]);
    });
    await test('submission owner FK, retry uniqueness, bounds and immutable received timestamp',async()=>{
      const sql='INSERT INTO city_bloxx_run_submissions(run_id,user_id,submission_hash,inputs,end_tick) VALUES($1,$2,$3,$4,10)';
      await rejected(db,sql,[run,other,H,'[]'],'23503');
      await db.query(sql,[run,owner,H,'[]']);
      await rejected(db,sql,[run,owner,H,'[]'],'23505');
      await rejected(db,'UPDATE city_bloxx_run_submissions SET end_tick=432001 WHERE run_id=$1',[run]);
      await rejected(db,'UPDATE city_bloxx_run_submissions SET inputs=$1 WHERE run_id=$2',[JSON.stringify(Array(4097).fill({tick:0})),run]);
      await rejected(db,"UPDATE city_bloxx_run_submissions SET first_received_at=now()+interval '1 second' WHERE run_id=$1",[run]);
      await rejected(db,"UPDATE city_bloxx_run_submissions SET state='accepted' WHERE run_id=$1",[run]);
      await db.query("UPDATE city_bloxx_run_submissions SET state='accepted',result='{}',metrics='{}',verified_at=now() WHERE run_id=$1",[run]);
    });
    await test('board owner FK, one best per account/partition, exact ratio and sort index',async()=>{
      const sql='INSERT INTO city_bloxx_leaderboard_entries(user_id,board_key,run_id,population,height,perfect_body,body_placements,perfect_ratio,misses,simulation_ticks,first_received_at) VALUES($1,$2,$3,100,2,1,3,$4,0,10,now())';
      await rejected(db,sql,[other,'quick-v1',run,'0.333333333333'],'23503');
      await rejected(db,sql,[owner,'quick-v1',run,'0.330000000000']);
      await db.query(sql,[owner,'quick-v1',run,'0.333333333333']);
      await rejected(db,sql,[owner,'quick-v1',run,'0.333333333333'],'23505');
      await db.query(sql,[owner,'quick-v2',run,'0.333333333333']);
      assert.equal((await db.query('SELECT perfect_ratio FROM city_bloxx_leaderboard_entries LIMIT 1'))[0].perfect_ratio,'0.333333333333');
      const indexes=await db.query("SELECT indexdef FROM pg_indexes WHERE indexname='idx_cb_board_order'");
      assert.match(indexes[0].indexdef,/population DESC, height DESC, perfect_ratio DESC, misses, simulation_ticks, first_received_at, run_id/);
    });
    await test('analytics dedupe, private/guest separation, PII rejection and server-only verification event',async()=>{
      const event=randomUUID();
      const sql="INSERT INTO city_bloxx_analytics_events(event_id,user_id,type,version,properties) VALUES($1,$2,$3,'1',$4)";
      await db.query(sql,[event,owner,'mode_start',{}]);
      await rejected(db,sql,[event,owner,'mode_start',{}],'23505');
      await rejected(db,sql,[randomUUID(),null,'mode_start',{}]);
      await rejected(db,sql,[randomUUID(),owner,'mode_start',{email:'private'}]);
      await rejected(db,sql,[randomUUID(),owner,'verification_reject',{}]);
      await db.query("INSERT INTO city_bloxx_analytics_events(event_id,anonymous_session_hash,type,version) VALUES($1,$2,'mode_start','1')",[randomUUID(),H]);
    });
    await test('transaction repository cannot read another owner and game policy keeps super-admin ownership/email checks',async()=>{
      const security=new SecurityService(db),policy=new GamePolicyService(security),store=new GameStore(db,policy);
      const actor={userId:owner,sessionId:fixture.sessionId,version:3};
      assert.throws(()=>new GameRepository(db.manager,owner),/active transaction/);
      await store.transaction(actor,['city_bloxx_profile:read'],async repo=>assert.equal((await repo.profile()).alias,'Player'));
      await assert.rejects(store.transaction(actor,['city_bloxx_profile:update'],async (_repo,tx)=>{
        await tx.query("UPDATE city_bloxx_profiles SET alias='Rollback' WHERE user_id=$1",[owner]);
        throw new Error('fixture rollback');
      }),/fixture rollback/);
      assert.equal((await db.query('SELECT alias FROM city_bloxx_profiles WHERE user_id=$1',[owner]))[0].alias,'Player');
      await db.transaction(async tx=>{
        const repo=new GameRepository(tx,other);
        assert.equal(await repo.profile(),undefined); assert.equal(await repo.save(),undefined);
        assert.equal(await repo.ticket(run,true),undefined); assert.equal(await repo.submission(run),undefined);
      });
      await db.query('INSERT INTO user_roles(user_id,role_id) VALUES($1,$2)',[owner,fixture.ids.super_admin]);
      try {
        assert.throws(()=>policy.own(actor,other),/Own account required/);
        await db.query('UPDATE users SET email_verified_at=NULL WHERE id=$1',[owner]);
        await assert.rejects(store.transaction(actor,['city_bloxx_runs:start'],async()=>{},true),/Verify email/);
      } finally {
        await db.query('DELETE FROM user_roles WHERE user_id=$1 AND role_id=$2',[owner,fixture.ids.super_admin]);
        // Restore the exact prior value for the migration/auth-history comparison.
        await db.query('UPDATE users SET email_verified_at=created_at WHERE id=$1',[owner]);
      }
    });
  } finally {
    for(const suffix of [...tables].reverse()) await db.query(`DELETE FROM city_bloxx_${suffix}`);
    await db.query('DELETE FROM users WHERE id=$1',[other]);
  }
}
main().catch(error=>{ console.error(error.message); process.exitCode=1; });
