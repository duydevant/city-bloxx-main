import { DataSource, EntityManager } from 'typeorm';
import { MaintenanceService } from './maintenance.service';
import { InfrastructureService } from '../security/infrastructure.service';
import { SecurityService } from '../security/security.service';

describe('City Bloxx MaintenanceService', () => {
  it('skips sweep when Redis distributed lock is already held by another worker', async () => {
    const transaction = jest.fn();
    const service = new MaintenanceService(
      { transaction } as unknown as DataSource,
      {} as SecurityService,
      {
        redis: {
          set: jest.fn().mockResolvedValue(null),
          eval: jest.fn(),
        },
      } as unknown as InfrastructureService,
    );

    const result = await service.sweep();
    expect(result.skipped).toBe(true);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('runs bounded retention sweep under Redis + PG advisory lock and releases Redis lock', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(undefined) // lock_timeout
      .mockResolvedValueOnce(undefined) // statement_timeout
      .mockResolvedValueOnce([{ acquired: true }]) // pg_try_advisory_xact_lock
      .mockResolvedValueOnce([{ run_id: 'expired-run-1' }]) // expired tickets
      .mockResolvedValueOnce(undefined) // update ticket expired
      .mockResolvedValueOnce(undefined) // update submission rejected
      .mockResolvedValueOnce(undefined) // purge residual encrypted_start_response
      .mockResolvedValueOnce([{ count: 2 }]) // purged inputs
      .mockResolvedValueOnce([{ count: 1 }]) // deleted backups
      .mockResolvedValueOnce([{ count: 3 }]) // deleted mutations
      .mockResolvedValueOnce([{ count: 4 }]); // deleted analytics events
    const tx = { query } as unknown as EntityManager;
    const audit = jest.fn().mockResolvedValue(undefined);
    const redisSet = jest.fn().mockResolvedValue('OK');
    const redisEval = jest.fn().mockResolvedValue(1);
    const service = new MaintenanceService(
      {
        transaction: jest.fn((work: (em: EntityManager) => Promise<unknown>) => work(tx)),
      } as unknown as DataSource,
      { audit } as unknown as SecurityService,
      {
        redis: { set: redisSet, eval: redisEval },
      } as unknown as InfrastructureService,
    );

    const summary = await service.sweep();
    expect(summary).toEqual({
      skipped: false,
      expiredTickets: 1,
      purgedInputs: 2,
      deletedBackups: 1,
      deletedMutations: 3,
      deletedEvents: 4,
    });
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      null,
      'city_bloxx.maintenance.sweep',
      'city_bloxx_maintenance',
      undefined,
      summary,
    );
    expect(redisEval).toHaveBeenCalledTimes(1);
  });
});
