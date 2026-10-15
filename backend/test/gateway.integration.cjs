const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createDecipheriv } = require('node:crypto');
const { Client } = require('pg');
const base = process.env.TEST_GATEWAY_BASE_URL;
if (!base || !/^auth_test_[a-z0-9_]+$/.test(process.env.TEST_DATABASE || '') || process.env.DB_DATABASE !== process.env.TEST_DATABASE) {
  throw new Error('Gateway acceptance requires an isolated auth_test database');
}
const db = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.TEST_DATABASE });
const origin = process.env.TEST_GATEWAY_ORIGIN || new URL(base).origin;
async function call(path, options = {}) {
  return fetch(`${base}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
}
async function main() {
  await db.connect();
  try {
    assert.equal((await call('/health/live')).status, 200);
    assert.equal((await call('/health/ready')).status, 200);
    const email = `gateway-${randomUUID()}@example.test`;
    const password = `A!${randomBytes(24).toString('base64url')}`;
    const register = await call('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
    assert.equal(register.status, 201);
    // Verify through the existing endpoint, using the encrypted test outbox; no user-table shortcut.
    const jobs = await db.query('SELECT payload FROM mail_outbox WHERE sent_at IS NULL ORDER BY created_at DESC');
    let token;
    for (const job of jobs.rows) {
      const [iv, tag, ciphertext] = job.payload.split('.');
      const decipher = createDecipheriv('aes-256-gcm', Buffer.from(process.env.MAIL_OUTBOX_KEY, 'hex'), Buffer.from(iv, 'hex'));
      decipher.setAuthTag(Buffer.from(tag, 'hex'));
      const message = JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, 'hex')), decipher.final()]).toString());
      if (message.email === email && message.purpose === 'verify') token = new URL(message.link).searchParams.get('token');
    }
    // Dispatcher may already have delivered the verification message to the test mailbox.
    if (!token) {
      for (let attempt = 0; attempt < 30 && !token; attempt++) {
        const messages = await (await fetch(`${process.env.TEST_MAIL_URL}/api/v1/messages?limit=100`)).json();
        const candidate = (messages.messages || []).find(message => message.To?.some(to => to.Address === email));
        if (candidate) {
          const message = await (await fetch(`${process.env.TEST_MAIL_URL}/api/v1/message/${candidate.ID}`)).json();
          token = /token=([A-Za-z0-9_-]{43})/.exec(message.Text)?.[1];
        }
        if (!token) await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    assert.ok(token, 'Verification email was not delivered');
    assert.equal((await call('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) })).status, 201);
    const requestId = randomUUID();
    const login = await call('/auth/login', { method: 'POST', headers: { 'X-Request-Id': requestId }, body: JSON.stringify({ email, password }) });
    assert.equal(login.status, 201);
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /Path=\/api\/v1\/auth/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.equal(login.headers.get('cache-control'), 'no-store');
    assert.equal(login.headers.get('x-request-id'), requestId);
    const loginBody = await login.json();
    assert.ok(!('refreshToken' in loginBody.data));
    const access = loginBody.data.accessToken;
    assert.equal((await call('/auth/me', { headers: { Authorization: `Bearer ${access}` } })).status, 200);
    const refreshHeaders = { Cookie: cookie.split(';')[0], Origin: origin };
    assert.equal((await call('/auth/refresh', { method: 'POST', headers: { ...refreshHeaders, Origin: 'http://evil.test' } })).status, 403);
    assert.equal((await call('/auth/refresh', { method: 'POST', headers: { Cookie: refreshHeaders.Cookie } })).status, 403);
    const refresh = await call('/auth/refresh', { method: 'POST', headers: refreshHeaders });
    assert.equal(refresh.status, 201);
    assert.match(refresh.headers.get('set-cookie'), /Path=\/api\/v1\/auth/);
    const logout = await call('/auth/logout', { method: 'POST', headers: { Cookie: refresh.headers.get('set-cookie').split(';')[0], Origin: origin } });
    assert.equal(logout.status, 201);
    assert.match(logout.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
    for (const [path, bytes, status] of [
      ['/auth/login', 16 * 1024 + 1, 413],
      ['/city-bloxx/runs/finish', 256 * 1024 + 1, 413],
      ['/city-bloxx/save', 272 * 1024, 404], // W1.0: parser accepts envelope; route arrives in W1.3.
      ['/city-bloxx/save', 272 * 1024 + 1, 413],
    ]) {
      assert.equal((await call(path, { method: 'POST', body: JSON.stringify({ data: 'a'.repeat(bytes - 11) }) })).status, status);
    }
    assert.equal((await call('/auth/login', { method: 'POST', headers: { 'Content-Encoding': 'gzip' }, body: '{}' })).status, 415);
    console.log('PASS real Nginx gateway: verified login, bearer, cookie path/rotation/logout, Origin rejection, no-store, request ID, parser/proxy limits');
  } finally { await db.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
