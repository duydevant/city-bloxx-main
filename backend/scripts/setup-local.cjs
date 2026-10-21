const fs = require('node:fs');
const { randomBytes } = require('node:crypto');
const { parseEnv } = require('node:util');
const adminConfig = () => `ADMIN_EMAIL=admin@example.test\nADMIN_PASSWORD=${randomBytes(24).toString('base64url')}\nADMIN_FULL_NAME=Local Administrator\n`;
if (fs.existsSync('.env')) {
  const current = fs.readFileSync('.env','utf8');
  const parsed = parseEnv(current);
  if (!Object.hasOwn(parsed,'ADMIN_EMAIL') && !Object.hasOwn(parsed,'ADMIN_PASSWORD')) {
    fs.appendFileSync('.env', `${current.endsWith('\n') ? '' : '\n'}${adminConfig()}`);
    console.log('Added local admin configuration with a random password to existing .env. Other settings preserved; values not printed.');
  } else {
    console.log('.env and existing admin configuration preserved.');
  }
  process.exit(0);
}
const secret = () => randomBytes(32).toString('hex');
fs.writeFileSync('.env', `APP_NAME=City Bloxx Backend\nAPP_PORT=31006\nAPP_TRUST_PROXY=false\nTZ=UTC\nNODE_ENV=local\nDB_CONNECTION=postgres\nDB_HOST=localhost\nDB_PORT=55433\nDB_USERNAME=postgres\nDB_PASSWORD=${secret()}\nDB_DATABASE=app_db\nDB_SCHEMA=public\nREDIS_PORT=56380\nREDIS_URL=redis://localhost:56380\nMAILPIT_PORT=58026\nJWT_SECRET=${secret()}\nJWT_ALGORITHM=HS256\nJWT_ISSUER=city-bloxx-backend\nJWT_AUDIENCE=city-bloxx-web\nJWT_ACCESS_TTL_SECONDS=900\nREFRESH_TOKEN_TTL_DAYS=30\nMAX_ACTIVE_SESSIONS=10\nPASSWORD_MIN_LENGTH=12\nREGISTRATION_ENABLED=true\nREQUIRE_EMAIL_VERIFICATION=true\nAUTH_ALLOWED_ORIGINS=http://localhost:31006,http://localhost:3000,http://localhost:14929\nFRONTEND_USER_PORTAL_URL=http://localhost:3000\nFRONTEND_ADMIN_PORTAL_URL=http://localhost:3000\nCOOKIE_SECURE=false\nMAIL_OUTBOX_KEY=${secret()}\nMAIL_HOST=localhost\nMAIL_PORT=1025\nMAIL_SECURE=false\nMAIL_SENDER=noreply@example.test\n`, {mode:0o600});
console.log('Created local .env with random secrets. Values are not printed.');
fs.appendFileSync('.env', adminConfig());
