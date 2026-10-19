// Local Docker acceptance. Existing app containers and volumes are never replaced.
const { execFileSync, spawn } = require('node:child_process');
const { mkdirSync, writeFileSync, readFileSync, rmSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { randomBytes } = require('node:crypto');

const root = resolve(__dirname, '..');
const cloudAcceptance = process.argv.includes('--cloud-browser');
const rankedAcceptance = process.argv.includes('--ranked-browser');
const browserAcceptance = process.argv.includes('--auth-browser') || cloudAcceptance || rankedAcceptance;
const browserPort=Number(process.env.W1_BROWSER_PORT||56891);
if(!Number.isInteger(browserPort)||browserPort<1024||browserPort>65535)throw new Error('Invalid browser acceptance port');
const id = randomBytes(6).toString('hex');
const directory = join(root, 'tmp', `w1-infrastructure-${id}`);
const names = { suite: `city-bloxx-w1-suite-${id}`, web: `city-bloxx-w1-web-${id}`, gateway: `city-bloxx-w1-gateway-${id}` };
const docker = (args) => execFileSync('docker', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function main() {
  mkdirSync(directory, { recursive: true });
  const templateName = process.env.W1_ENV_CONTAINER || (() => {
    for (const candidate of ['base-nest-bo-minh-auth-api-1', 'backend-slice-master-api']) {
      try { docker(['inspect', candidate]); return candidate; } catch {}
    }
    return 'base-nest-bo-minh-auth-api-1';
  })();
  const [template] = JSON.parse(docker(['inspect', templateName]));
  const network = Object.keys(template.NetworkSettings.Networks)[0];
  if (!network) throw new Error('Backend template container has no network');
  const envFile = join(directory, 'test.env');
  const config = readFileSync(join(root, 'backend/gateway/default.conf'), 'utf8')
    .replace('http://api:3000', `http://${names.suite}:3001`)
    .replace('http://web:3000', `http://${names.web}:3000`);
  const configFile = join(directory, 'default.conf');
  try {
    // Copy documented backend configuration only; unrelated multiline PEM env
    // entries cannot be represented by Docker --env-file and are not test inputs.
    const allowed = new Set([...readFileSync(join(root,'backend/.env.example'),'utf8').matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(match=>match[1]));
    const environment = template.Config.Env.filter(entry=>allowed.has(entry.split('=',1)[0]));
    if(environment.some(entry=>/[\r\n]/.test(entry)))throw new Error('Documented backend test environment needs single-line values');
    writeFileSync(envFile, `${environment.join('\n')}\n`, { mode: 0o600 });
    writeFileSync(configFile, config);
    docker(['run', '-d', '--name', names.web, '--network', network, '-e', 'PORT=3000', '-e', 'HOSTNAME=0.0.0.0', 'city-bloxx-web:local']);
    docker(['create', '--name', names.suite, '--network', network, '--env-file', envFile,
      '-e', `AUTH_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:56789,http://127.0.0.1:${browserPort}`,
      '-e', `FRONTEND_USER_PORTAL_URL=${browserAcceptance?`http://127.0.0.1:${browserPort}`:'http://localhost:56789'}`,
      '-e', 'TEST_GATEWAY_ORIGIN=http://localhost:56789',
      '-e', `TEST_GATEWAY_BASE_URL=http://${names.gateway}:8080/api/v1`,
      '-e', `TEST_BROWSER_AUTH=${browserAcceptance}`,
      '-e', `TEST_BROWSER_RANKED=${rankedAcceptance}`,
      'city-bloxx-w1-test:local', 'sh', '-c', 'yarn test:game-schema && node test/run-security.cjs']);
    docker(['start', names.suite]);
    docker(['run', '-d', '--name', names.gateway, '--network', network, '-p', browserAcceptance?`127.0.0.1:${browserPort}:8080`:'127.0.0.1::8080',
      '--mount', `type=bind,source=${configFile},target=/etc/nginx/conf.d/default.conf,readonly`, 'nginx:1.28-alpine']);
    const logs = spawn('docker', ['logs', '-f', names.suite], { cwd: root, stdio: 'inherit' });
    let browserReport,browserFailure;
    if(browserAcceptance){
      for(let i=0;i<150;i++){
        try{docker(['exec',names.suite,'test','-f','/tmp/w1-browser-ready']);break}catch{
          const [state]=JSON.parse(docker(['inspect',names.suite]));if(!state.State.Running)throw new Error('Test API exited before browser acceptance');
          if(i===149)throw new Error('Test API browser readiness timeout');
          await new Promise(resolve=>setTimeout(resolve,1000));
        }
      }
      const [gateway]=JSON.parse(docker(['inspect',names.gateway]));
      const port=gateway.NetworkSettings.Ports['8080/tcp'][0].HostPort;
      try{browserReport=await require(rankedAcceptance?'./ranked-browser.cjs':cloudAcceptance?'./cloud-browser.cjs':'./auth-browser.cjs').run({base:`http://127.0.0.1:${port}`,container:names.suite,directory});}catch(error){browserFailure=error;}
      finally{docker(['exec',names.suite,'node','-e',`require('node:fs').writeFileSync('/tmp/w1-browser-done',${JSON.stringify(browserReport?'passed':'failed')})`]);}
    }
    const exit = Number(await new Promise((resolve, reject) => {
      const wait = spawn('docker', ['wait', names.suite], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      wait.stdout.on('data', chunk => { output += chunk; });
      wait.once('error', reject);
      wait.once('exit', code => code === 0 ? resolve(output.trim()) : reject(new Error('docker wait failed')));
    }));
    await new Promise(resolve => logs.exitCode !== null ? resolve() : logs.once('exit', resolve));
    if (exit !== 0) throw browserFailure||new Error('Isolated W1 infrastructure suite failed');
    if(browserAcceptance&&/\?token=|Bearer [A-Za-z0-9_-]/.test(docker(['logs',names.gateway])))throw new Error('Gateway auth log redaction failed');
    const [gateway] = JSON.parse(docker(['inspect', names.gateway]));
    const port = gateway.NetworkSettings.Ports['8080/tcp'][0].HostPort;
    const web = await fetch(`http://127.0.0.1:${port}/play`);
    if (web.status !== 200 || !/City\s*Bloxx/i.test(await web.text())) throw new Error('Gateway Web routing failed');
    writeFileSync(join(directory, 'result.json'), JSON.stringify({
      checkedAt: new Date().toISOString(),
      sourceBaseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      backendTestImageId: JSON.parse(docker(['image', 'inspect', 'city-bloxx-w1-test:local']))[0].Id,
      ...(browserReport?{[rankedAcceptance?'browserRanked':cloudAcceptance?'browserCloud':'browserAuth']:browserReport}:{}),
      checks: { gameSchemaAndPermissions: 'passed', cloudApiAndIsolation: 'passed', runTicketsAndPersistentLeases: 'passed', verificationSettlementAndBoards: 'passed', moderationTelemetryAndOperations: 'passed', compiledCoreWorker: 'passed', authAdminSeed: 'passed', unit: 'passed', nestE2e: 'passed', authIntegration: 'passed', nginxAuthAndLimits: 'passed', nginxProductionWeb: 'passed' },
      isolation: { database: 'disposable auth_test_* and city_bloxx_test_* and city_bloxx_restore_*', existingVolumesPreserved: true, deployment: false },
    }, null, 2) + '\n');
    console.log('PASS gateway serves production Web /play; existing containers/volumes preserved');
  } finally {
    // Remove only the three exact names generated by this invocation.
    for (const name of Object.values(names)) {
      try { docker(['rm', '-f', name]); } catch { /* creation may have failed */ }
    }
    rmSync(envFile, { force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
