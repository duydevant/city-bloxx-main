const assert = require('node:assert/strict');
const { Worker } = require('node:worker_threads');
const { resolve } = require('node:path');
const { cityBloxxCore: core } = require('../dist/src/common/city-bloxx-core');
const resources = resolve(__dirname, '../dist/src/resources/city-bloxx');

async function runMessage(message) {
  const worker = new Worker(resolve(resources, 'worker.cjs'));
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Worker deadline exceeded')), 5000);
      const finish = (fn, value) => { clearTimeout(timer); fn(value); };
      worker.once('message', value => finish(resolve, value));
      worker.once('error', error => finish(reject, error));
      worker.once('exit', code => finish(reject, new Error(`Unexpected worker exit ${code}`)));
      worker.postMessage({ id: 'golden', ...message });
    });
  } finally { await worker.terminate(); }
}
const run = record => runMessage({record});
async function main() {
  for (const name of ['quick-mixed-v13.json', 'daily-v1.json']) {
    const fixture = require(resolve(resources, 'fixtures', name));
    const records = fixture.complete ? [fixture.complete, fixture.roofMiss, fixture.failed] : [fixture];
    for (const record of records) {
      const request={config:record.config,physicsVersion:record.physicsVersion,rulesetVersion:record.rulesetVersion,inputs:record.inputs,endTick:record.endTick};
      const computed=core.resimulateRun(request);
      assert.deepEqual(computed.result,record.result);
      const replay=new core.QuickTowerReplay(record);replay.advanceTicks(record.endTick);
      assert.deepEqual(computed.metrics,replay.getMetrics());
      assert.equal(computed.eligible,record.config.mode==='quick'||record.result.height===20);
      assert.deepEqual((await runMessage({operation:'verify',request})).result,computed);
      for(const bad of [{...request,endTick:request.endTick+1},{...request,endTick:1},
        {...request,result:record.result},{...request,config:{...request.config,assist:true}},
        {...request,config:{...request.config,legacyOverlap:true}},
        {...request,inputs:[{tick:0,sequence:0,fraction:1001}]},
        {...request,inputs:[{tick:0,sequence:0,fraction:0},...request.inputs.map((i,n)=>({...i,sequence:n+1}))]}])
        assert.equal((await runMessage({operation:'verify',request:bad})).errorCode,'GAME_RUN_INVALID');
      assert.equal((await runMessage({operation:'verify',request:{...request,physicsVersion:'future'}})).errorCode,'GAME_RUN_VERSION_UNAVAILABLE');
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
  for (const schema of [1,2,3,4,5]) {
    const payload = schema === 5 ? core.emptySave() : {...core.emptySave(),schema};
    const request = {expectedRevision:'0',mutationId:'00000000-0000-4000-8000-000000000001',schema,payload};
    const result = await runMessage({operation:'save',request});
    assert.equal(result.ok,true); assert.equal(result.result.payload.schema,5);
    assert.deepEqual(result.result.payload,core.migrateSave(payload));
    const reordered = {...request,payload:Object.fromEntries(Object.entries(payload).reverse())};
    assert.equal((await runMessage({operation:'save',request:reordered})).result.requestHash,result.result.requestHash);
  }
  const incompatible = await runMessage({operation:'save',request:{schema:999,payload:{schema:999,raw:'intact'}}});
  assert.equal(incompatible.errorCode,'GAME_SAVE_INCOMPATIBLE');
  let nested={}; for(let i=0;i<70;i++)nested={next:nested};
  assert.equal((await runMessage({operation:'save',request:{schema:5,payload:{...core.emptySave(),nested}}})).errorCode,'GAME_SAVE_INVALID');
  console.log('PASS compiled save worker schemas 1-5, canonical hash, future schema and nesting guard');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
