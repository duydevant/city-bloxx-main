const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = '.tmp/local-super-admin.json';
if (fs.existsSync(path)) { console.log(`Existing bootstrap credential file preserved: ${path}`); process.exit(0); }
const credentials = { email: 'operator@example.test', password: randomBytes(24).toString('base64url') };
const result = spawnSync('docker', ['compose','exec','-T','api','node','-r','tsconfig-paths/register','dist/src/cli.js','bootstrap-super-admin'], {input:JSON.stringify(credentials),encoding:'utf8'});
if (result.status !== 0) { console.error('Bootstrap failed; credential file not written.');process.exit(1); }
fs.mkdirSync('.tmp',{recursive:true});
fs.writeFileSync(path,JSON.stringify(credentials,null,2),{mode:0o600});
console.log(`Bootstrap completed. Credentials saved locally in ${path} (gitignored); not printed.`);
