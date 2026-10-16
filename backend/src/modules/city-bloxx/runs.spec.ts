import { DataSource } from 'typeorm';
import { GameStore } from './common/game-store.service';
import { RunsService } from './runs.service';
import { InfrastructureService } from '../security/infrastructure.service';

describe('authoritative Daily clock', () => {
  afterEach(() => jest.useRealTimers());
  it('changes exactly at UTC midnight, independent of browser date or timezone', async () => {
    jest.useFakeTimers();
    const service = new RunsService(
      {} as GameStore,
      {
        redis: { eval: jest.fn().mockResolvedValue(1) },
      } as unknown as InfrastructureService,
      {} as DataSource,
    );
    jest.setSystemTime(new Date('2026-10-16T23:59:59.999Z'));
    const before = await service.today('127.0.0.1');
    jest.setSystemTime(new Date('2026-10-17T00:00:00.000Z'));
    const after = await service.today('127.0.0.1');
    expect(before.dateUTC).toBe('2026-10-16');
    expect(after.dateUTC).toBe('2026-10-17');
    expect(before.definition.id).not.toBe(after.definition.id);
    expect(before.definition.seed).not.toBe(after.definition.seed);
  });
  it('fails closed when the public Daily limiter is unavailable', async () => {
    const service = new RunsService(
      {} as GameStore,
      {
        redis: { eval: jest.fn().mockRejectedValue(new Error('down')) },
      } as unknown as InfrastructureService,
      {} as DataSource,
    );
    await expect(service.today('127.0.0.1')).rejects.toThrow(
      'Game rate limiter unavailable',
    );
  });
});
