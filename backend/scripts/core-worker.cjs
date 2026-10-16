// No Nest, database or Redis connection inside a simulation worker.
const { parentPort } = require('node:worker_threads');
const { verifyRecord, migrateSave, resimulateRun } = require('./core.cjs');
const { createHash } = require('node:crypto');
function canonical(value, depth = 0, postgres = false) {
  if (depth > 64) throw new Error('Save nesting limit');
  if (postgres && typeof value === 'string' && (value.includes('\0') || !value.isWellFormed())) throw new Error('Save text is not PostgreSQL JSONB compatible');
  if (Array.isArray(value)) return value.map(v => canonical(v, depth + 1, postgres));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [canonical(k, depth + 1, postgres), canonical(value[k], depth + 1, postgres)]));
  return value;
}
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
if (!parentPort) throw new Error('Simulation worker requires a parent port');
parentPort.on('message', ({ id, record, operation, request }) => {
  try {
    if (operation === 'ping') return parentPort.postMessage({ id, ok: true, result: true });
    if (operation === 'verify') return parentPort.postMessage({ id, ok: true, result: resimulateRun(request) });
    if (operation === 'save') {
      const raw = request.choice ? request.local.rawPayload : JSON.stringify(request.payload);
      if (Buffer.byteLength(raw) > 262144) return parentPort.postMessage({ id, ok: false, errorCode: 'GAME_SAVE_TOO_LARGE' });
      const payload = request.choice ? JSON.parse(raw) : request.payload;
      const schema = request.choice ? request.local.schema : request.schema;
      if (!payload || Array.isArray(payload) || typeof payload !== 'object' || payload.schema !== schema) throw new Error('Schema mismatch');
      // Check nesting even for a future local snapshot that is only being backed up.
      canonical(payload, 0, request.choice !== 'cloud');
      const compatible = [1,2,3,4].includes(schema);
      if (!compatible && request.choice !== 'cloud') return parentPort.postMessage({ id, ok: false, errorCode: 'GAME_SAVE_INCOMPATIBLE' });
      const normalized = request.choice === 'cloud' ? null : migrateSave(payload);
      if (normalized && Buffer.byteLength(JSON.stringify(normalized)) > 262144) return parentPort.postMessage({ id, ok: false, errorCode: 'GAME_SAVE_TOO_LARGE' });
      const identity = request.choice ? request : { ...request, payload: normalized, schema: normalized.schema };
      return parentPort.postMessage({ id, ok: true, result: { payload: normalized, requestHash: hash(identity), payloadHash: normalized ? hash(normalized) : null, raw } });
    }
    const verified = verifyRecord(record);
    parentPort.postMessage({ id, ok: true, result: verified.result });
  } catch (error) {
    parentPort.postMessage({ id, ok: false, errorCode: operation === 'verify' ?
      (error.message === 'Unsupported ranked version' ? 'GAME_RUN_VERSION_UNAVAILABLE' : 'GAME_RUN_INVALID') :
      operation === 'save' ? 'GAME_SAVE_INVALID' : 'INVALID_REPLAY' });
  }
});
