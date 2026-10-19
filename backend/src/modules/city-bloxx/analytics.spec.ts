import { DataSource, EntityManager } from 'typeorm';
import { AnalyticsService } from './analytics.service';
import { GameStore } from './common/game-store.service';
import { GameRepository } from './common/game.repository';
import { InfrastructureService } from '../security/infrastructure.service';
import { Actor } from '../security/types';

describe('City Bloxx AnalyticsService', () => {
  const actor: Actor = {
    userId: 'user-1',
    sessionId: 'sess-1',
    version: 1,
    ip: '127.0.0.1',
  };
  const prevOrigins = process.env.AUTH_ALLOWED_ORIGINS;

  beforeEach(() => {
    process.env.AUTH_ALLOWED_ORIGINS = 'http://localhost:56789';
  });

  afterAll(() => {
    process.env.AUTH_ALLOWED_ORIGINS = prevOrigins;
  });

  it('rejects forbidden PII/token/input keys and forces unverifiedTelemetry=true', async () => {
    const query = jest
      .fn<Promise<unknown>, [string, unknown[]?]>()
      .mockResolvedValue([{ event_id: 'e-1' }]);
    const tx = { query } as unknown as EntityManager;
    const store = {
      transaction: jest.fn(
        (
          _actor: Actor,
          _perms: readonly string[],
          work: (repo: GameRepository, em: EntityManager) => Promise<unknown>,
        ) => work({} as GameRepository, tx),
      ),
    } as unknown as GameStore;
    const infra = {
      redis: { eval: jest.fn().mockResolvedValue(1) },
    } as unknown as InfrastructureService;
    const service = new AnalyticsService({} as DataSource, store, infra);

    await expect(
      service.recordAuthenticated(actor, {
        events: [
          {
            eventId: '00000000-0000-4000-8000-000000000001',
            type: 'run_finish',
            version: 'quick-tower-0.13.0',
            properties: { email: 'leak@example.com' },
          },
        ],
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { errorCode: 'GAME_ANALYTICS_INVALID' },
    });

    const res = await service.recordAuthenticated(actor, {
      events: [
        {
          eventId: '00000000-0000-4000-8000-000000000002',
          type: 'run_finish',
          version: 'quick-tower-0.13.0',
          mode: 'quick',
          properties: { height: 12, unverifiedTelemetry: false },
        },
      ],
    });
    expect(res).toEqual({
      accepted: 1,
      duplicates: 0,
      unverifiedTelemetry: true,
    });
    const args = query.mock.calls[0]?.[1] ?? [];
    const insertedJson = JSON.parse(args[7] as string) as {
      height: number;
      unverifiedTelemetry: boolean;
    };
    expect(insertedJson).toEqual({ height: 12, unverifiedTelemetry: true });
  });

  it('enforces trusted Origin/Referer on guest analytics and fails closed on Redis outage', async () => {
    const evalMock = jest.fn().mockResolvedValue(1);
    const guestTx = {
      query: jest.fn().mockResolvedValue([{ event_id: 'e-1' }]),
    } as unknown as EntityManager;
    const service = new AnalyticsService(
      {
        transaction: jest.fn((work: (em: EntityManager) => Promise<unknown>) =>
          work(guestTx),
        ),
      } as unknown as DataSource,
      {} as GameStore,
      { redis: { eval: evalMock } } as unknown as InfrastructureService,
    );

    await expect(
      service.recordGuest(
        {
          anonymousSessionId: 'guest_session_123456',
          events: [
            {
              eventId: '00000000-0000-4000-8000-000000000003',
              type: 'session_start',
              version: 'quick-tower-0.13.0',
            },
          ],
        },
        '127.0.0.1',
        'https://evil.example',
      ),
    ).rejects.toMatchObject({
      status: 403,
      response: { errorCode: 'GAME_ORIGIN_FORBIDDEN' },
    });

    evalMock.mockRejectedValueOnce(new Error('redis down'));
    await expect(
      service.recordGuest(
        {
          anonymousSessionId: 'guest_session_123456',
          events: [
            {
              eventId: '00000000-0000-4000-8000-000000000003',
              type: 'session_start',
              version: 'quick-tower-0.13.0',
            },
          ],
        },
        '127.0.0.1',
        'http://localhost:56789',
      ),
    ).rejects.toMatchObject({
      status: 503,
      response: { errorCode: 'GAME_RATE_UNAVAILABLE' },
    });
  });
});
