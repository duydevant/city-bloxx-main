import { ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { GamePolicyService } from './game-policy.service';
import { GameRepository } from './game.repository';
import { decimalRevision } from './rows';
import { SecurityService } from '../../security/security.service';

describe('game identity boundaries', () => {
  const actor = { userId: 'owner-a', sessionId: 'session', version: 0 };
  const authorize = jest.fn();
  const identity = jest.fn();
  const policy = new GamePolicyService({
    authorize,
    identity,
  } as unknown as SecurityService);
  const tx = {
    queryRunner: { isTransactionActive: true },
    query: jest.fn().mockResolvedValue([]),
  } as unknown as EntityManager;
  beforeEach(() => {
    authorize.mockReset().mockResolvedValue(undefined);
    identity.mockReset().mockResolvedValue({ id: actor.userId, email_verified_at: null });
  });
  it('requires owner equality even after super-admin permission bypass', async () => {
    await policy.require(actor, ['city_bloxx_runs:start'], tx);
    expect(() => policy.own(actor, 'owner-b')).toThrow(ForbiddenException);
    expect(() => policy.own(actor, actor.userId)).not.toThrow();
  });
  it('verified game policy remains mandatory even when ordinary auth permits login', async () => {
    await expect(
      policy.require(actor, ['city_bloxx_runs:start'], tx, true),
    ).rejects.toThrow(ForbiddenException);
    identity.mockResolvedValueOnce({ id: actor.userId, email_verified_at: new Date() });
    await expect(
      policy.require(actor, ['city_bloxx_runs:start'], tx, true),
    ).resolves.toMatchObject({ id: actor.userId });
  });
  it('retains permission failures and forbids global-manager repositories/policies', async () => {
    authorize.mockRejectedValueOnce(new ForbiddenException());
    await expect(policy.require(actor, ['city_bloxx_save:write'], tx)).rejects.toThrow(
      ForbiddenException,
    );
    expect(() => new GameRepository({} as EntityManager, actor.userId)).toThrow(
      'active transaction',
    );
    await expect(policy.require(actor, [], {} as EntityManager)).rejects.toThrow(
      'active transaction',
    );
  });
  it('keeps revision precision through PostgreSQL BIGINT boundaries', () => {
    for (const value of ['0', '9007199254740993', '9223372036854775807'])
      expect(decimalRevision(value)).toBe(value);
    for (const value of [
      1,
      -1,
      null,
      '',
      '01',
      '-1',
      '1.0',
      '1e3',
      '9223372036854775808',
    ])
      expect(() => decimalRevision(value)).toThrow();
  });
});
