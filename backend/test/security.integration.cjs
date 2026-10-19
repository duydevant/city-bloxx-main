const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createDecipheriv } = require('node:crypto');
const { Client } = require('pg');
const jwt = require('jsonwebtoken');
const argon2 = require('argon2');
const { digest } = require('../dist/src/modules/security/infrastructure.service');

const base=process.env.TEST_BASE_URL;
if(!/^auth_test_[a-z0-9_]+$/.test(process.env.TEST_DATABASE||'')||process.env.DB_DATABASE!==process.env.TEST_DATABASE)throw new Error('This suite only runs against a disposable auth_test database');
const db=new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.TEST_DATABASE});
const password=`Strong${randomBytes(16).toString('hex')}!`;
const origin='http://localhost:3000';let passed=0;
async function api(method,path,body,auth,extra={}){
  const response=await fetch(`${base}${path}`,{method,headers:{'content-type':'application/json',...(auth?{authorization:`Bearer ${auth}`} : {}),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const json=await response.json().catch(()=>({}));return {status:response.status,data:json.data,json,cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
}
function status(r,expected){assert.equal(r.status,expected,`Expected HTTP ${expected}, got ${r.status}`);}
async function test(name,fn){await fn();passed++;console.log(`PASS ${name}`);}
async function createUser(prefix='user'){
  const email=`${prefix}-${randomUUID()}@example.test`;
  const r=await api('POST','/auth/register',{email,password});status(r,201);
  await db.query(`UPDATE users SET status='active',email_verified_at=now() WHERE id=$1`,[r.data.id]);
  return {id:r.data.id,email};
}
async function login(u){const r=await api('POST','/auth/login',{email:u.email,password});status(r,201);return {...r.data,cookie:r.cookie};}
async function tokenFor(userId,kind){
  const result=await db.query(`SELECT payload FROM mail_outbox WHERE sent_at IS NULL ORDER BY created_at DESC`);
  for(const job of result.rows){
    const [iv,tag,ciphertext]=job.payload.split('.');
    const dec=createDecipheriv('aes-256-gcm',Buffer.from(process.env.MAIL_OUTBOX_KEY,'hex'),Buffer.from(iv,'hex'));dec.setAuthTag(Buffer.from(tag,'hex'));
    const value=JSON.parse(Buffer.concat([dec.update(Buffer.from(ciphertext,'hex')),dec.final()]).toString());
    const u=await db.query('SELECT email FROM users WHERE id=$1',[userId]);
    if(value.email===u.rows[0].email&&value.purpose===kind)return new URL(value.link).searchParams.get('token');
  }
  // If dispatcher already sent, retrieve from local Mailpit capture rather than DB raw tokens.
  const u=await db.query('SELECT email FROM users WHERE id=$1',[userId]);
  for(let i=0;i<30;i++){
    const messages=await (await fetch(`${process.env.TEST_MAIL_URL}/api/v1/messages?limit=100`)).json();
    const candidates=(messages.messages||[]).filter(m=>m.To?.some(t=>t.Address===u.rows[0].email)&&m.Subject===(kind==='verify'?'Verify your email':'Set your password'));
    if(candidates[0]){const m=await(await fetch(`${process.env.TEST_MAIL_URL}/api/v1/message/${candidates[0].ID}`)).json();const token=/token=([A-Za-z0-9_-]{43})/.exec(m.Text)?.[1];if(token)return token;}
    await new Promise(r=>setTimeout(r,200));
  }throw new Error('Mail token capture missing');
}

async function main(){
  await db.connect();
  const operator=await createUser('operator');
  await db.query(`INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code='super_admin'`,[operator.id]);
  let root=await login(operator);
  const user=await createUser();let session=await login(user);
  const roles=(await api('GET','/admin/roles',undefined,root.accessToken)).data.data;
  const permissions=(await api('GET','/admin/permissions',undefined,root.accessToken)).data.data;
  const roleCode=code=>roles.find(r=>r.code===code).id;
  const permCode=code=>permissions.find(p=>p.code===code).id;
  let custom,secondRole,customPermission;
  await test('all 51 specification routes documented in Swagger',async()=>{
    const swagger=await(await fetch(base.replace('/api/v1','/swagger-json'))).json();
    const routes=Object.entries(swagger.paths).filter(([p])=>!p.includes('/city-bloxx')&&(p.includes('/auth/')||p.includes('/users/me')||p.includes('/admin/'))).reduce((n,[,v])=>n+Object.keys(v).filter(k=>['get','post','put','patch','delete'].includes(k)).length,0);
    assert.equal(routes,51);
  });
  await test('strict registration rejects privilege fields; case-insensitive uniqueness',async()=>{
    status(await api('POST','/auth/register',{email:`x-${randomUUID()}@example.test`,password,roles:['super_admin']}),422);
    status(await api('POST','/auth/register',{email:user.email.toUpperCase(),password}),409);
    const stored=await db.query('SELECT password_hash FROM users WHERE id=$1',[user.id]);assert.match(stored.rows[0].password_hash,/^\$argon2id\$/);
  });
  await test('pending account, generic credentials and token signature validation',async()=>{
    const email=`pending-${randomUUID()}@example.test`;status(await api('POST','/auth/register',{email,password}),201);
    status(await api('POST','/auth/login',{email,password}),401);
    status(await api('POST','/auth/login',{email:'absent@example.test',password}),401);
    status(await api('GET','/auth/me',undefined,session.accessToken+'x'),401);
    status(await api('GET','/auth/me'),401);status(await api('GET','/admin/users',undefined,session.accessToken),403);
    const claims=jwt.decode(session.accessToken);
    for(const override of [{iss:'wrong'},{aud:'wrong'},{type:'refresh'},{exp:1},{sid:randomUUID()}]){
      status(await api('GET','/auth/me',undefined,jwt.sign({...claims,...override},process.env.JWT_SECRET,{algorithm:'HS256'})),401);
    }
    status(await api('GET','/auth/me',undefined,jwt.sign(claims,process.env.JWT_SECRET,{algorithm:'HS384'})),401);
  });
  await test('safe current-user/profile responses and strict editable fields',async()=>{
    status(await api('GET','/users/me',undefined,session.accessToken),200);
    status(await api('GET','/users/me/permissions',undefined,session.accessToken),200);
    status(await api('PATCH','/users/me',{fullName:'Updated',username:`user_${randomBytes(4).toString('hex')}`},session.accessToken),200);
    status(await api('PATCH','/users/me',{status:'active',userId:operator.id},session.accessToken),422);
    assert.ok(!JSON.stringify((await api('GET','/auth/me',undefined,session.accessToken)).data).includes('password'));
  });
  await test('secure cookie path/flags and CSRF rejects missing/untrusted origins including bearer trick',async()=>{
    const r=await api('POST','/auth/login',{email:user.email,password});assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/SameSite=Lax/);assert.match(r.headers.get('set-cookie'),/Path=\/api\/v1\/auth/);
    status(await api('POST','/auth/refresh',undefined,undefined,{cookie:r.cookie}),403);
    status(await api('POST','/auth/refresh',undefined,session.accessToken,{cookie:r.cookie,origin:'http://evil.test'}),403);
  });
  await test('refresh digest storage, rotation and replay commits revocation',async()=>{
    const active=await login(user);const raw=active.cookie.split('=')[1];
    const hashes=await db.query('SELECT token_hash FROM refresh_tokens WHERE token_hash=$1',[digest(raw)]);assert.equal(hashes.rowCount,1);assert.notEqual(hashes.rows[0].token_hash,raw);
    const rotated=await api('POST','/auth/refresh',undefined,undefined,{cookie:active.cookie,origin});status(rotated,201);assert.notEqual(rotated.cookie,active.cookie);
    status(await api('POST','/auth/refresh',undefined,undefined,{cookie:active.cookie,origin}),401);
    status(await api('GET','/auth/me',undefined,rotated.data.accessToken),401);
  });
  await test('two simultaneous refresh requests cannot both rotate',async()=>{
    const active=await login(user);
    const result=await Promise.all([api('POST','/auth/refresh',undefined,undefined,{cookie:active.cookie,origin}),api('POST','/auth/refresh',undefined,undefined,{cookie:active.cookie,origin})]);
    assert.deepEqual(result.map(r=>r.status).sort(),[201,401]);status(await api('GET','/auth/me',undefined,result.find(r=>r.status===201).data.accessToken),401);
  });
  await test('logout current preserves other session; logout all revokes all',async()=>{
    const a=await login(user),b=await login(user);
    status(await api('POST','/auth/logout',undefined,a.accessToken),201);status(await api('GET','/auth/me',undefined,a.accessToken),401);status(await api('GET','/auth/me',undefined,b.accessToken),200);
    status(await api('POST','/auth/logout-all',undefined,b.accessToken),201);status(await api('GET','/auth/me',undefined,b.accessToken),401);session=await login(user);
  });
  await test('own session listing/revoke and ownership',async()=>{
    const s=(await api('GET','/auth/sessions',undefined,session.accessToken)).data;assert.ok(s.length);
    const operatorSid=jwt.decode(root.accessToken).sid;status(await api('DELETE',`/auth/sessions/${operatorSid}`,undefined,session.accessToken),404);
    const extra=await login(user);status(await api('DELETE',`/auth/sessions/${jwt.decode(extra.accessToken).sid}`,undefined,session.accessToken),200);status(await api('GET','/auth/me',undefined,extra.accessToken),401);
  });
  await test('custom roles/permissions CRUD and matrix replacement',async()=>{
    custom=(await api('POST','/admin/roles',{code:'editor',name:'Editor'},root.accessToken)).data;
    secondRole=(await api('POST','/admin/roles',{code:'reviewer',name:'Reviewer'},root.accessToken)).data;
    customPermission=(await api('POST','/admin/permissions',{resource:'reports',action:'read',name:'Read reports'},root.accessToken)).data;
    status(await api('GET',`/admin/roles/${custom.id}`,undefined,root.accessToken),200);
    status(await api('PATCH',`/admin/roles/${custom.id}`,{name:'Editor updated'},root.accessToken),200);
    status(await api('GET',`/admin/permissions/${customPermission.id}`,undefined,root.accessToken),200);
    status(await api('PATCH',`/admin/permissions/${customPermission.id}`,{description:'Custom'},root.accessToken),200);
    status(await api('PUT',`/admin/roles/${custom.id}/permissions`,{permissionIds:[customPermission.id]},root.accessToken),200);
    status(await api('POST',`/admin/roles/${secondRole.id}/permissions/${customPermission.id}`,undefined,root.accessToken),201);
    status(await api('GET',`/admin/roles/${custom.id}/permissions`,undefined,root.accessToken),200);
    status(await api('GET','/admin/permissions/resources',undefined,root.accessToken),200);
    status(await api('PATCH',`/admin/permissions/${customPermission.id}`,{code:'permissions:*'},root.accessToken),422);
  });
  await test('N:N active union survives removal of one duplicated grant',async()=>{
    status(await api('POST',`/admin/users/${user.id}/roles/${custom.id}`,undefined,root.accessToken),201);
    status(await api('POST',`/admin/users/${user.id}/roles/${secondRole.id}`,undefined,root.accessToken),201);
    let p=(await api('GET','/users/me/permissions',undefined,session.accessToken)).data;assert.equal(p.filter(p=>p==='reports:read').length,1);
    status(await api('DELETE',`/admin/users/${user.id}/roles/${custom.id}`,undefined,root.accessToken),200);
    assert.ok((await api('GET','/users/me/permissions',undefined,session.accessToken)).data.includes('reports:read'));
    status(await api('PATCH',`/admin/roles/${secondRole.id}/status`,{isActive:false},root.accessToken),200);
    assert.ok(!(await api('GET','/users/me/permissions',undefined,session.accessToken)).data.includes('reports:read'));
    status(await api('PATCH',`/admin/roles/${secondRole.id}/status`,{isActive:true},root.accessToken),200);
    status(await api('PATCH',`/admin/permissions/${customPermission.id}/status`,{isActive:false},root.accessToken),200);
    assert.ok(!(await api('GET','/users/me/permissions',undefined,session.accessToken)).data.includes('reports:read'));
    status(await api('PATCH',`/admin/permissions/${customPermission.id}/status`,{isActive:true},root.accessToken),200);
  });
  await test('atomic invalid role/permission replacement and protected system objects',async()=>{
    const before=(await api('GET',`/admin/users/${user.id}/roles`,undefined,root.accessToken)).data;
    status(await api('PUT',`/admin/users/${user.id}/roles`,{roleIds:[randomUUID()]},root.accessToken),400);
    assert.deepEqual((await api('GET',`/admin/users/${user.id}/roles`,undefined,root.accessToken)).data,before);
    status(await api('PUT',`/admin/roles/${custom.id}/permissions`,{permissionIds:[randomUUID()]},root.accessToken),400);
    status(await api('DELETE',`/admin/roles/${roleCode('user')}`,undefined,root.accessToken),403);
    status(await api('PATCH',`/admin/permissions/${permCode('users:read')}/status`,{isActive:false},root.accessToken),403);
  });
  await test('limited admin cannot self/peer escalate or rewrite role it holds',async()=>{
    const limited=await createUser('limited');const lr=(await api('POST','/admin/roles',{code:'limited',name:'Limited'},root.accessToken)).data;
    status(await api('PUT',`/admin/roles/${lr.id}/permissions`,{permissionIds:[permCode('users:read'),permCode('users:assign_roles'),permCode('roles:assign_permissions'),permCode('roles:update')]},root.accessToken),200);
    status(await api('POST',`/admin/users/${limited.id}/roles/${lr.id}`,undefined,root.accessToken),201);const l=await login(limited);
    status(await api('POST',`/admin/users/${limited.id}/roles/${roleCode('admin')}`,undefined,l.accessToken),403);
    status(await api('POST',`/admin/users/${user.id}/roles/${roleCode('super_admin')}`,undefined,l.accessToken),403);
    status(await api('POST',`/admin/users/${user.id}/roles/${roleCode('admin')}`,undefined,l.accessToken),403);
    status(await api('PUT',`/admin/roles/${lr.id}/permissions`,{permissionIds:[permCode('users:delete')]},l.accessToken),403);
    status(await api('PUT',`/admin/roles/${custom.id}/permissions`,{permissionIds:[permCode('users:delete')]},l.accessToken),403);
  });
  await test('user management, invitation, pagination and session administration',async()=>{
    const created=await api('POST','/admin/users',{email:`invited-${randomUUID()}@example.test`,fullName:'Invited'},root.accessToken);status(created,201);
    status(await api('GET',`/admin/users/${created.data.id}`,undefined,root.accessToken),200);
    status(await api('PATCH',`/admin/users/${created.data.id}`,{fullName:'Renamed'},root.accessToken),200);
    status(await api('GET',`/admin/users?search=${encodeURIComponent(user.email)}&pageSize=1`,undefined,root.accessToken),200);
    status(await api('GET','/admin/users?pageSize=101',undefined,root.accessToken),422);
    status(await api('GET','/admin/users?page=1.5',undefined,root.accessToken),422);
    status(await api('GET',`/admin/users/${user.id}/permissions`,undefined,root.accessToken),200);
    status(await api('GET',`/admin/roles/${secondRole.id}/users`,undefined,root.accessToken),200);
    status(await api('GET',`/admin/users/${user.id}/sessions`,undefined,root.accessToken),200);
    const extra=await login(user);status(await api('DELETE',`/admin/sessions/${jwt.decode(extra.accessToken).sid}`,undefined,root.accessToken),200);
    status(await api('DELETE',`/admin/users/${user.id}/sessions`,undefined,root.accessToken),200);status(await api('GET','/auth/me',undefined,session.accessToken),401);session=await login(user);
    status(await api('GET','/admin/sessions?status=active',undefined,root.accessToken),200);
    status(await api('DELETE',`/admin/users/${created.data.id}`,undefined,root.accessToken),200);
  });
  await test('suspended users immediately denied with unexpired JWT',async()=>{
    status(await api('PATCH',`/admin/users/${user.id}/status`,{status:'suspended'},root.accessToken),200);
    status(await api('GET','/auth/me',undefined,session.accessToken),401);
    status(await api('PATCH',`/admin/users/${user.id}/status`,{status:'active'},root.accessToken),200);session=await login(user);
  });
  await test('forgot generic response, one-time reset, password change revokes sessions',async()=>{
    const known=await api('POST','/auth/forgot-password',{email:user.email});const unknown=await api('POST','/auth/forgot-password',{email:'absent@example.test'});assert.deepEqual(known.data,unknown.data);
    const reset=await tokenFor(user.id,'reset');const newPassword=`New${password}`;
    const result=await Promise.all([api('POST','/auth/reset-password',{token:reset,password:newPassword}),api('POST','/auth/reset-password',{token:reset,password:newPassword})]);assert.deepEqual(result.map(r=>r.status).sort(),[201,400]);
    status(await api('GET','/auth/me',undefined,session.accessToken),401);status(await api('POST','/auth/login',{email:user.email,password}),401);
    const logged=await api('POST','/auth/login',{email:user.email,password:newPassword});status(logged,201);
    status(await api('POST','/users/me/change-password',{currentPassword:newPassword,newPassword:password},logged.data.accessToken),201);
    status(await api('GET','/auth/me',undefined,logged.data.accessToken),401);session=await login(user);
  });
  await test('email verification one-time, resend and expiry',async()=>{
    const email=`verify-${randomUUID()}@example.test`;const reg=await api('POST','/auth/register',{email,password});status(reg,201);
    status(await api('POST','/auth/resend-verification',{email}),201);const token=await tokenFor(reg.data.id,'verify');
    status(await api('POST','/auth/verify-email',{token}),201);status(await api('POST','/auth/verify-email',{token}),400);
    status(await api('POST','/auth/login',{email,password}),201);
    await api('POST','/auth/forgot-password',{email});const reset=await tokenFor(reg.data.id,'reset');await db.query('UPDATE password_reset_tokens SET expires_at=now()-interval \'1 second\' WHERE token_hash=$1',[digest(reset)]);
    status(await api('POST','/auth/reset-password',{token:reset,password}),400);
  });
  await test('absolute session expiry and max sessions serialized across concurrent logins',async()=>{
    const cap=await createUser('cap');const logins=await Promise.all(Array.from({length:12},()=>api('POST','/auth/login',{email:cap.email,password})));assert.equal(logins.filter(r=>r.status===201).length,10);assert.equal(logins.filter(r=>r.status===409).length,2);
    const a=logins.find(r=>r.status===201);await db.query('UPDATE auth_sessions SET expires_at=now()-interval \'1 second\' WHERE id=$1',[jwt.decode(a.data.accessToken).sid]);status(await api('POST','/auth/refresh',undefined,undefined,{cookie:a.cookie,origin}),401);
  });
  await test('permission removal mid-session and custom role/permission deletion constraints',async()=>{
    status(await api('PUT',`/admin/users/${user.id}/roles`,{roleIds:[roleCode('user'),custom.id]},root.accessToken),200);
    status(await api('GET','/admin/users',undefined,session.accessToken),403);
    status(await api('DELETE',`/admin/roles/${custom.id}`,undefined,root.accessToken),409);
    status(await api('DELETE',`/admin/roles/${custom.id}/permissions/${customPermission.id}`,undefined,root.accessToken),200);
    status(await api('DELETE',`/admin/roles/${secondRole.id}/permissions/${customPermission.id}`,undefined,root.accessToken),200);
    status(await api('DELETE',`/admin/permissions/${customPermission.id}`,undefined,root.accessToken),200);
    status(await api('DELETE',`/admin/users/${user.id}/roles/${custom.id}`,undefined,root.accessToken),200);
    status(await api('DELETE',`/admin/roles/${custom.id}`,undefined,root.accessToken),200);
  });
  await test('last-super-admin protection serializes concurrent status mutations',async()=>{
    const second=await createUser('super');await db.query(`INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code='super_admin'`,[second.id]);
    const other=await login(second);
    const results=await Promise.all([api('PATCH',`/admin/users/${second.id}/status`,{status:'suspended'},other.accessToken),api('PATCH',`/admin/users/${operator.id}/status`,{status:'suspended'},root.accessToken)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,403]);
    const active=await db.query(`SELECT id,email FROM users WHERE id=ANY($1::uuid[]) AND status='active'`,[[operator.id,second.id]]);assert.equal(active.rowCount,1);root=await login(active.rows[0]);
    status(await api('DELETE',`/admin/users/${active.rows[0].id}`,undefined,root.accessToken),403);
  });
  await test('audit actor/action/target and no raw credentials/tokens; denied attempts retained',async()=>{
    const audit=await api('GET','/admin/audit-logs',undefined,root.accessToken);status(audit,200);assert.ok(audit.data.data.length);
    status(await api('GET',`/admin/audit-logs/${audit.data.data[0].id}`,undefined,root.accessToken),200);
    const events=await db.query('SELECT action,metadata FROM audit_logs');assert.ok(events.rows.some(r=>r.action==='authorization.denied'));assert.ok(events.rows.some(r=>r.action==='auth.refresh_replay'));
    const serialized=JSON.stringify(events.rows);assert.ok(!serialized.includes(password));assert.ok(!serialized.includes(session.accessToken));assert.ok(!serialized.includes('password_hash'));
  });
  await test('distributed Redis login rate-limit atomic counter',async()=>{
    const {InfrastructureService}=require('../dist/src/modules/security/infrastructure.service');process.env.LOGIN_RATE_LIMIT='5';const nodes=[new InfrastructureService({}),new InfrastructureService({})];await Promise.all(nodes.map(n=>n.redis.connect()));
    try{const ip=randomUUID();const results=await Promise.allSettled(Array.from({length:8},(_,i)=>nodes[i%2].rateLimit('login',ip)));assert.equal(results.filter(r=>r.status==='fulfilled').length,5);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.getStatus()===429).length,3);}finally{await Promise.all(nodes.map(n=>n.redis.quit()));}
  });
  await test('SMTP delivery captured in Mailpit and sent ciphertext cleared',async()=>{
    let delivered=false;
    for(let i=0;i<100;i++){
      const messages=await(await fetch(`${process.env.TEST_MAIL_URL}/api/v1/messages?limit=100`)).json();
      if((messages.messages||[]).some(m=>m.To?.some(t=>t.Address===operator.email))){delivered=true;break;}
      await new Promise(r=>setTimeout(r,200));
    }
    assert.ok(delivered,'SMTP email must actually reach Mailpit');
    const jobs=await db.query('SELECT payload FROM mail_outbox WHERE sent_at IS NOT NULL');assert.ok(jobs.rowCount>0);assert.ok(jobs.rows.every(r=>r.payload===''));
  });
  console.log(`SECURITY SUITE: ${passed} scenarios passed`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.end());
