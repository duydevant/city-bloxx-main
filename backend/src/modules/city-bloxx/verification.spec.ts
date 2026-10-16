import { BoardsService } from './boards.service';
import { GameStore } from './common/game-store.service';
import { gameError, GameWorkerService } from './common/game-worker.service';
import { RunSubmissionRow, RunTicketRow } from './common/rows';
import { RunsService } from './runs.service';
import { VerificationService } from './verification.service';
import { SecurityService } from '../security/security.service';

describe('persistent verification failure handling', () => {
  const job = {
    ticket: {
      run_id: 'run',
      lease_id: 'lease',
      config: {},
      physics_version: 'p',
      ruleset_version: 'r',
    } as RunTicketRow,
    submission: { inputs: [], end_tick: 1 } as RunSubmissionRow,
  };
  const release = jest.fn().mockResolvedValue(true),
    renew = jest.fn().mockResolvedValue(true);
  const make = (run: (...args: unknown[]) => Promise<unknown>) =>
    new VerificationService(
      { release, renew } as unknown as RunsService,
      { run, available: () => 22 } as unknown as GameWorkerService,
      {} as GameStore,
      {} as BoardsService,
      {} as SecurityService,
    );
  beforeEach(() => {
    release.mockClear();
    renew.mockClear();
  });
  afterEach(() => jest.useRealTimers());
  it('requeues worker failure with backoff and never settles an invented result', async () => {
    const v = make(() =>
      Promise.reject(gameError(503, 'GAME_WORKER_UNAVAILABLE', 'down')),
    );
    const settle = jest.spyOn(v, 'settle');
    await v.process(job);
    expect(settle).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith('run', 'lease', 5);
  });
  it('turns only deterministic input invalidity into a terminal rejection', async () => {
    const v = make(() => Promise.reject(gameError(422, 'GAME_RUN_INVALID', 'invalid')));
    const settle = jest.spyOn(v, 'settle').mockResolvedValue(true);
    await v.process(job);
    expect(settle).toHaveBeenCalledWith(job, undefined, 'GAME_RUN_INVALID');
    expect(release).not.toHaveBeenCalled();
  });
  it('does not consume unsupported versions as terminal invalid input', async () => {
    const v = make(() =>
      Promise.reject(gameError(503, 'GAME_RUN_VERSION_UNAVAILABLE', 'old worker')),
    );
    const settle = jest.spyOn(v, 'settle');
    await v.process(job);
    expect(settle).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalled();
  });
  it('renews queued/running work, and suppresses settlement after lease loss', async () => {
    jest.useFakeTimers();
    renew.mockResolvedValueOnce(false);
    let finish!: (value: unknown) => void;
    const v = make(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
      settle = jest.spyOn(v, 'settle');
    const task = v.process(job);
    await jest.advanceTimersByTimeAsync(3000);
    expect(renew).toHaveBeenCalledWith('run', 'lease');
    finish({});
    await task;
    expect(settle).not.toHaveBeenCalled();
  });
});
