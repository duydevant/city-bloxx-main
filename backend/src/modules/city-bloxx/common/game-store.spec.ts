import { DataSource, EntityManager } from 'typeorm';
import { GamePolicyService } from './game-policy.service';
import { GameStore } from './game-store.service';
import { gameError } from './game-worker.service';

describe('transaction retry boundaries', () => {
  const actor = { userId: 'owner', sessionId: 'session', version: 0 };
  const tx = {
    query: jest.fn().mockResolvedValue([]),
    queryRunner: { isTransactionActive: true },
  } as unknown as EntityManager;
  const policy = {
    require: jest.fn().mockResolvedValue(undefined),
  } as unknown as GamePolicyService;
  it('retries only serialization/deadlock aborts, with a fresh transaction', async () => {
    const transaction = jest
      .fn()
      .mockRejectedValueOnce({ code: '40001' })
      .mockRejectedValueOnce({ code: '40P01' })
      .mockImplementation((work: (t: EntityManager) => Promise<unknown>) => work(tx));
    const store = new GameStore({ transaction } as unknown as DataSource, policy);
    await expect(store.transaction(actor, [], () => Promise.resolve(true))).resolves.toBe(
      true,
    );
    expect(transaction).toHaveBeenCalledTimes(3);
  });
  it('never retries business denial', async () => {
    const transaction = jest.fn().mockRejectedValue(gameError(403, 'DENIED', 'denied'));
    await expect(
      new GameStore({ transaction } as unknown as DataSource, policy).transaction(
        actor,
        [],
        () => Promise.resolve(true),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(transaction).toHaveBeenCalledTimes(1);
  });
  it('bounds retries at three attempts', async () => {
    const transaction = jest.fn().mockRejectedValue({ code: '40001' });
    await expect(
      new GameStore({ transaction } as unknown as DataSource, policy).transaction(
        actor,
        [],
        () => Promise.resolve(true),
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(transaction).toHaveBeenCalledTimes(3);
  });
});
