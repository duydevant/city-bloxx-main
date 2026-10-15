const assert = require('node:assert/strict');
const { Worker } = require('node:worker_threads');
const { resolve } = require('node:path');
const { cityBloxxCore: core } = require('../dist/src/common/city-bloxx-core');
const resources = resolve(__dirname, '../dist/src/resources/city-bloxx');

async function run(record) {
  const worker = new Worker(resolve(resources, 'worker.cjs'));
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Worker deadline exceeded')), 5000);
      const finish = (fn, value) => { clearTimeout(timer); fn(value); };
      worker.once('message', value => finish(resolve, value));
      worker.once('error', error => finish(reject, error));
      worker.once('exit', code => finish(reject, new Error(`Unexpected worker exit ${code}`)));
      worker.postMessage({ id: 'golden', record });
    });
  } finally { await worker.terminate(); }
}
async function main() {
  for (const name of ['quick-mixed-v13.json', 'daily-v1.json']) {
    const fixture = require(resolve(resources, 'fixtures', name));
    const records = fixture.complete ? [fixture.complete, fixture.roofMiss, fixture.failed] : [fixture];
    for (const record of records) {
      assert.deepEqual(core.verifyRecord(record), record);
      assert.deepEqual(await run(record), { id: 'golden', ok: true, result: record.result });
      const tampered = structuredClone(record);
      tampered.result.population += 1;
      assert.deepEqual(await run(tampered), { id: 'golden', ok: false, errorCode: 'INVALID_REPLAY' });
    }
    for (const definition of fixture.definitions || []) {
      assert.deepEqual(core.resolveDaily(definition.dateUTC), definition);
    }
    console.log(`PASS compiled core + isolated worker ${name}, fabricated result rejected`);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
