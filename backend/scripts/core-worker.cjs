// No Nest, database or Redis connection inside a simulation worker.
const { parentPort } = require('node:worker_threads');
const { verifyRecord } = require('./core.cjs');
if (!parentPort) throw new Error('Simulation worker requires a parent port');
parentPort.on('message', ({ id, record }) => {
  try {
    const verified = verifyRecord(record);
    parentPort.postMessage({ id, ok: true, result: verified.result });
  } catch {
    parentPort.postMessage({ id, ok: false, errorCode: 'INVALID_REPLAY' });
  }
});
