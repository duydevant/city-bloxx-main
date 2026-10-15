import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { GamePolicyService } from './game-policy.service';
import { gameError } from './game-worker.service';
import { GameRepository } from './game.repository';
import { GamePermission } from './permissions';
import { Actor } from '../../security/types';

@Injectable()
export class GameStore {
  constructor(
    private readonly db: DataSource,
    private readonly policy: GamePolicyService,
  ) {}
  async transaction<T>(
    actor: Actor,
    permissions: readonly GamePermission[],
    work: (repository: GameRepository, tx: EntityManager) => Promise<T>,
    verified = false,
  ): Promise<T> {
    try {
      return await this.db.transaction(async (tx) => {
        await tx.query(`SET LOCAL lock_timeout = '2s'`);
        await tx.query(`SET LOCAL statement_timeout = '5s'`);
        await this.policy.require(actor, permissions, tx, verified);
        return work(new GameRepository(tx, actor.userId), tx);
      });
    } catch (error) {
      const code = (error as { code?: string }).code ?? '';
      if (
        /^(08|57P0)/.test(code) ||
        ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '53300', '55P03', '57014'].includes(
          code,
        )
      )
        throw gameError(
          503,
          'GAME_STORE_UNAVAILABLE',
          'Game database unavailable; retry later',
        );
      throw error;
    }
  }
}
