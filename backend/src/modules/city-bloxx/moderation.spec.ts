import { EntityManager } from 'typeorm';
import { BoardsService } from './boards.service';
import { GameStore } from './common/game-store.service';
import { gameError, GameWorkerService } from './common/game-worker.service';
import { GameRepository } from './common/game.repository';
import { ModerationService } from './moderation.service';
import { SecurityService } from '../security/security.service';
import { Actor } from '../security/types';

describe('City Bloxx ModerationService', () => {
  const actor: Actor = {
    userId: 'admin-1',
    sessionId: 'sess-1',
    version: 1,
    ip: '127.0.0.1',
  };

  it('rejects releasing a non-accepted run without calling worker resimulation', async () => {
    const workerRun = jest.fn();
    const tx = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            run_id: 'run-1',
            user_id: 'user-1',
            mode: 'quick',
            config: { mode: 'quick', seed: 1, assist: false },
            physics_version: 'physics-0.13.0',
            ruleset_version: 'quick-tower-0.13.0',
          },
        ])
        .mockResolvedValueOnce([
          {
            run_id: 'run-1',
            user_id: 'user-1',
            state: 'rejected',
            moderation_state: 'quarantined',
            inputs: [{ tick: 1, sequence: 0, fraction: 500 }],
            end_tick: 10,
          },
        ]),
    } as unknown as EntityManager;
    const transactionMock = jest.fn(
      (
        _actor: Actor,
        _perms: readonly string[],
        work: (repo: GameRepository, em: EntityManager) => Promise<unknown>,
      ) => work({} as GameRepository, tx),
    );
    const service = new ModerationService(
      { transaction: transactionMock } as unknown as GameStore,
      { run: workerRun } as unknown as GameWorkerService,
      {} as BoardsService,
      {} as SecurityService,
    );

    await expect(
      service.release(actor, 'run-1', { reason: 'false positive' }),
    ).rejects.toMatchObject({
      status: 409,
      response: { errorCode: 'GAME_MODERATION_NOT_RELEASABLE' },
    });
    expect(workerRun).not.toHaveBeenCalled();
  });

  it('rejects releasing an accepted run when raw inputs have expired and been purged', async () => {
    const workerRun = jest.fn();
    const tx = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            run_id: 'run-2',
            user_id: 'user-1',
            mode: 'quick',
            config: { mode: 'quick', seed: 1, assist: false },
            physics_version: 'physics-0.13.0',
            ruleset_version: 'quick-tower-0.13.0',
          },
        ])
        .mockResolvedValueOnce([
          {
            run_id: 'run-2',
            user_id: 'user-1',
            state: 'accepted',
            moderation_state: 'quarantined',
            inputs: null,
            end_tick: 10,
          },
        ]),
    } as unknown as EntityManager;
    const transactionMock = jest.fn(
      (
        _actor: Actor,
        _perms: readonly string[],
        work: (repo: GameRepository, em: EntityManager) => Promise<unknown>,
      ) => work({} as GameRepository, tx),
    );
    const service = new ModerationService(
      { transaction: transactionMock } as unknown as GameStore,
      { run: workerRun } as unknown as GameWorkerService,
      {} as BoardsService,
      {} as SecurityService,
    );

    await expect(
      service.release(actor, 'run-2', { reason: 'late review after 90d' }),
    ).rejects.toMatchObject({
      status: 409,
      response: { errorCode: 'GAME_MODERATION_INPUTS_EXPIRED' },
    });
    expect(workerRun).not.toHaveBeenCalled();
  });

  it('does not release or update leaderboard when worker resimulation fails', async () => {
    const workerRun = jest
      .fn()
      .mockRejectedValue(gameError(422, 'GAME_RUN_INVALID', 'invalid inputs'));
    const updateBest = jest.fn();
    const tx = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            run_id: 'run-3',
            user_id: 'user-1',
            mode: 'quick',
            config: { mode: 'quick', seed: 1, assist: false },
            physics_version: 'physics-0.13.0',
            ruleset_version: 'quick-tower-0.13.0',
          },
        ])
        .mockResolvedValueOnce([
          {
            run_id: 'run-3',
            user_id: 'user-1',
            state: 'accepted',
            moderation_state: 'quarantined',
            submission_hash: 'hash-3',
            inputs: [{ tick: 1, sequence: 0, fraction: 500 }],
            end_tick: 10,
          },
        ]),
    } as unknown as EntityManager;
    const transactionMock = jest.fn(
      (
        _actor: Actor,
        _perms: readonly string[],
        work: (repo: GameRepository, em: EntityManager) => Promise<unknown>,
      ) => work({} as GameRepository, tx),
    );
    const service = new ModerationService(
      { transaction: transactionMock } as unknown as GameStore,
      { run: workerRun } as unknown as GameWorkerService,
      { updateBest } as unknown as BoardsService,
      {} as SecurityService,
    );

    await expect(
      service.release(actor, 'run-3', { reason: 'attempt release' }),
    ).rejects.toMatchObject({
      status: 422,
      response: { errorCode: 'GAME_RUN_INVALID' },
    });
    expect(workerRun).toHaveBeenCalledTimes(1);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(updateBest).not.toHaveBeenCalled();
  });
});
