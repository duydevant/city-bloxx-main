import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { GamePolicyService } from './game-policy.service';
import { GameRepository } from './game.repository';
import { GamePermission } from './permissions';
import { Actor } from '../../security/types';

@Injectable()
export class GameStore {
  constructor(
    private readonly db: DataSource,
    private readonly policy: GamePolicyService,
  ) {}
  transaction<T>(
    actor: Actor,
    permissions: readonly GamePermission[],
    work: (repository: GameRepository, tx: EntityManager) => Promise<T>,
    verified = false,
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      await this.policy.require(actor, permissions, tx, verified);
      return work(new GameRepository(tx, actor.userId), tx);
    });
  }
}
