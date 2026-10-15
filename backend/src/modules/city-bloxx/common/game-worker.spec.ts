import { EventEmitter } from 'node:events';
import { GameWorkerService } from './game-worker.service';

const instances: FakeWorker[] = [];
class FakeWorker extends EventEmitter {
  postMessage = jest.fn();
  terminate = jest.fn().mockResolvedValue(0);
  constructor() {
    super();
    instances.push(this);
  }
}
jest.mock('node:worker_threads', () => ({
  Worker: function () {
    return new FakeWorker();
  },
}));

describe('bounded game validation workers', () => {
  let pool: GameWorkerService;
  beforeEach(() => {
    jest.useFakeTimers();
    instances.length = 0;
    pool = new GameWorkerService();
  });
  afterEach(async () => {
    pool.onModuleDestroy();
    await Promise.resolve();
    jest.useRealTimers();
  });
  it('caps workers at two and queues at twenty, then rejects overload', async () => {
    const jobs = Array.from({ length: 22 }, () =>
      pool.run({ operation: 'ping' }).catch((e: unknown) => e),
    );
    expect(instances).toHaveLength(2);
    await expect(pool.run({})).rejects.toMatchObject({ status: 503 });
    instances[0].emit('message', { ok: true, result: 'first' });
    await expect(jobs[0]).resolves.toBe('first');
    await Promise.resolve();
    expect(instances).toHaveLength(3);
    pool.onModuleDestroy();
    await Promise.all(jobs);
  });
  it('bounds queue wait and running work by one deadline and recovers', async () => {
    const jobs = Array.from({ length: 3 }, () => pool.run({}).catch((e: unknown) => e));
    await jest.advanceTimersByTimeAsync(5000);
    for (const result of await Promise.all(jobs))
      expect(result).toMatchObject({ status: 503 });
    expect(instances[0].terminate).toHaveBeenCalledTimes(1);
    const next = pool.run({});
    instances.at(-1).emit('message', { ok: true, result: true });
    await expect(next).resolves.toBe(true);
  });
  it('rejects crashes and starts queued work after termination', async () => {
    const first = pool.run({});
    instances[0].emit('error', new Error('worker crash'));
    await expect(first).rejects.toMatchObject({ status: 503 });
    const next = pool.run({});
    instances.at(-1).emit('message', { ok: true, result: 'recovered' });
    await expect(next).resolves.toBe('recovered');
  });
  it('maps incompatible saves and impossible payloads without retrying them', async () => {
    for (const [errorCode, status] of [
      ['GAME_SAVE_INCOMPATIBLE', 409],
      ['GAME_SAVE_INVALID', 422],
      ['GAME_SAVE_TOO_LARGE', 413],
    ] as const) {
      const result = pool.run({});
      instances.at(-1).emit('message', { ok: false, errorCode });
      await expect(result).rejects.toMatchObject({ status });
    }
  });
  it('rejects shutdown and terminates active workers', async () => {
    const result = pool.run({});
    pool.onModuleDestroy();
    await expect(result).rejects.toMatchObject({ status: 503 });
    await expect(pool.run({})).rejects.toMatchObject({ status: 503 });
    expect(instances[0].terminate).toHaveBeenCalledTimes(1);
  });
});
