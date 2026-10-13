const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const argon2 = require('argon2');
const { DataSource } = require('typeorm');
const { typeormOptions } = require('../dist/src/config/typeorm-options');
const { seedAuthRbac, SeedConfigurationError } = require('../dist/src/database/seed');

if (!/^auth_test_[a-z0-9_]+$/.test(process.env.TEST_DATABASE || '') || process.env.DB_DATABASE !== process.env.TEST_DATABASE) throw new Error('Admin seed tests require a disposable auth_test database');
const db = new DataSource(typeormOptions);
let passed = 0;
const password = () => randomBytes(24).toString('base64url');
const email = () => `seed-${randomUUID()}@example.test`;
const set = (values = {}) => Object.assign(process.env, { ADMIN_EMAIL:'', ADMIN_PASSWORD:'', ADMIN_FULL_NAME:'', ...values });
async function test(name, fn) { await fn(); passed++; console.log(`PASS admin seed: ${name}`); }
async function main() {
  await db.initialize();
  try {
    await test('optional credentials skip account provisioning', async () => {
      set(); assert.equal((await seedAuthRbac(db)).admin,'skipped');
      const [{count}] = await db.query('SELECT count(*) FROM users'); assert.equal(Number(count),0);
    });
    await test('partial/invalid configuration is rejected before creating accounts', async () => {
      for (const values of [{ADMIN_EMAIL:email()},{ADMIN_PASSWORD:password()},{ADMIN_EMAIL:'invalid',ADMIN_PASSWORD:password()},{ADMIN_EMAIL:email(),ADMIN_PASSWORD:'short'},{ADMIN_EMAIL:email(),ADMIN_PASSWORD:password(),ADMIN_FULL_NAME:'x'.repeat(151)}]) {
        set(values); await assert.rejects(seedAuthRbac(db),SeedConfigurationError);
      }
      const [{count}] = await db.query('SELECT count(*) FROM users'); assert.equal(Number(count),0);
    });
    const account = { ADMIN_EMAIL:email(), ADMIN_PASSWORD:password(), ADMIN_FULL_NAME:'Seed Administrator' };
    let user;
    await test('active verified admin has Argon2id hash, user/admin roles and one sanitized audit', async () => {
      set({...account,ADMIN_EMAIL:account.ADMIN_EMAIL.toUpperCase()});assert.equal((await seedAuthRbac(db)).admin,'created');
      [user] = await db.query('SELECT * FROM users WHERE email=$1',[account.ADMIN_EMAIL]);
      assert.equal(user.status,'active'); assert.ok(user.email_verified_at);assert.equal(user.full_name,account.ADMIN_FULL_NAME);
      assert.match(user.password_hash,/^\$argon2id\$/);assert.ok(await argon2.verify(user.password_hash,account.ADMIN_PASSWORD));
      const roles = await db.query('SELECT r.code FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=$1 ORDER BY r.code',[user.id]);assert.deepEqual(roles.map(r=>r.code),['admin','user']);
      const audit = await db.query("SELECT metadata FROM audit_logs WHERE target_id=$1 AND action='operator.admin_seeded'",[user.id]);assert.equal(audit.length,1);assert.ok(!JSON.stringify(audit).includes(account.ADMIN_PASSWORD));
    });
    await test('repeated seed and changed env password never overwrite credentials/profile', async () => {
      set({...account,ADMIN_PASSWORD:password(),ADMIN_FULL_NAME:'Changed in environment'});
      assert.equal((await seedAuthRbac(db)).admin,'preserved');assert.equal((await seedAuthRbac(db)).admin,'preserved');
      const [after] = await db.query('SELECT * FROM users WHERE id=$1',[user.id]);assert.ok(after.password_hash===user.password_hash);assert.equal(after.full_name,user.full_name);assert.equal(after.updated_at.getTime(),user.updated_at.getTime());
      const [{count}] = await db.query("SELECT count(*) FROM audit_logs WHERE target_id=$1 AND action='operator.admin_seeded'",[user.id]);assert.equal(Number(count),1);
    });
    await test('startup does not restore revoked privileges or unsuspend a seeded account', async () => {
      await db.query("UPDATE users SET status='suspended',token_version=token_version+1 WHERE id=$1",[user.id]);
      await db.query("DELETE FROM user_roles WHERE user_id=$1 AND role_id IN (SELECT id FROM roles WHERE code='admin')",[user.id]);
      assert.equal((await seedAuthRbac(db)).admin,'preserved');
      const [after] = await db.query('SELECT * FROM users WHERE id=$1',[user.id]);assert.equal(after.status,'suspended');assert.equal(after.token_version,1);
      const [{count}] = await db.query("SELECT count(*) FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 AND r.code='admin'",[user.id]);assert.equal(Number(count),0);
    });
    await test('existing public account cannot be silently elevated by matching ADMIN_EMAIL', async () => {
      const id=randomUUID(),address=email(),hash=await argon2.hash(password());
      await db.query("INSERT INTO users(id,email,password_hash,status) VALUES($1,$2,$3,'pending')",[id,address,hash]);
      await db.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code='user'",[id]);
      set({ADMIN_EMAIL:address,ADMIN_PASSWORD:password()});await assert.rejects(seedAuthRbac(db),SeedConfigurationError);
      const [after] = await db.query('SELECT * FROM users WHERE id=$1',[id]);assert.equal(after.status,'pending');assert.ok(after.password_hash===hash);
      const roles=await db.query('SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1',[id]);assert.deepEqual(roles.map(r=>r.code),['user']);
    });
    await test('inactive system admin role rejects provisioning atomically', async () => {
      set({ADMIN_EMAIL:email(),ADMIN_PASSWORD:password()});await db.query("UPDATE roles SET is_active=false WHERE code='admin'");
      try { await assert.rejects(seedAuthRbac(db),SeedConfigurationError); }
      finally { await db.query("UPDATE roles SET is_active=true WHERE code='admin'"); }
      const users=await db.query('SELECT id FROM users WHERE email=$1',[process.env.ADMIN_EMAIL]);assert.equal(users.length,0);
    });
    await test('two independent connections seed only one account/audit', async () => {
      const other=new DataSource(typeormOptions);await other.initialize();
      set({ADMIN_EMAIL:email(),ADMIN_PASSWORD:password()});
      try {
        const result=await Promise.all([seedAuthRbac(db),seedAuthRbac(other)]);assert.deepEqual(result.map(r=>r.admin).sort(),['created','preserved']);
        const users=await db.query('SELECT id FROM users WHERE email=$1',[process.env.ADMIN_EMAIL]);assert.equal(users.length,1);
        const [{count}]=await db.query("SELECT count(*) FROM audit_logs WHERE target_id=$1 AND action='operator.admin_seeded'",[users[0].id]);assert.equal(Number(count),1);
      }finally{await other.destroy();}
    });
    await test('CLI seed-admin reads environment and is idempotent without printing secrets', async () => {
      const credentials={ADMIN_EMAIL:email(),ADMIN_PASSWORD:password()};
      for(let i=0;i<2;i++){
        const result=spawnSync(process.execPath,['scripts/cli.cjs','seed-admin'],{env:{...process.env,...credentials},encoding:'utf8'});
        assert.equal(result.status,0,'CLI seed-admin must succeed');assert.ok(!result.stdout.includes(credentials.ADMIN_PASSWORD));assert.ok(!result.stderr.includes(credentials.ADMIN_PASSWORD));
        assert.ok(result.stdout.includes(`Admin account seed: ${i===0?'created':'preserved'}`));
      }
    });
    console.log(`ADMIN SEED SUITE: ${passed} scenarios passed`);
  }finally{await db.destroy();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
