import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HealthController } from './health.controller';
import { InfrastructureService } from '../security/infrastructure.service';

describe('dependency readiness', () => {
  const query = jest.fn();
  const ping = jest.fn();
  const controller = new HealthController(
    { query } as unknown as DataSource,
    { redis: { ping } } as unknown as InfrastructureService,
  );
  beforeEach(() => {
    query.mockReset().mockResolvedValue([]);
    ping.mockReset().mockResolvedValue('PONG');
  });
  it('liveness does not depend on backing services', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
    expect(query).not.toHaveBeenCalled();
    expect(ping).not.toHaveBeenCalled();
  });
  it('requires both PostgreSQL and Redis', async () => {
    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
    query.mockRejectedValueOnce(new Error('private connection details'));
    await expect(controller.ready()).rejects.toThrow(ServiceUnavailableException);
    ping.mockRejectedValueOnce(new Error('private redis details'));
    await expect(controller.ready()).rejects.toThrow('Dependencies unavailable');
    ping.mockResolvedValueOnce('LOADING');
    await expect(controller.ready()).rejects.toThrow(ServiceUnavailableException);
  });
  it('preserves the legacy health response when the database is unavailable', async () => {
    query.mockRejectedValueOnce(new Error('offline'));
    await expect(controller.check()).resolves.toMatchObject({
      status: 'error',
      db: 'down',
    });
  });
});
