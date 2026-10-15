import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { GamePermission } from './permissions';
import { SecurityService } from '../../security/security.service';
import { Actor } from '../../security/types';

@Injectable()
export class GamePolicyService {
  constructor(private readonly security: SecurityService) {}

  async require(
    actor: Actor,
    permissions: readonly GamePermission[],
    tx: EntityManager,
    verified = false,
  ) {
    if (!tx.queryRunner?.isTransactionActive)
      throw new Error('Game policy requires an active transaction');
    if (!actor) throw new UnauthorizedException('Invalid session');
    // Lock identity before reading it so suspension/revocation cannot race a game transaction commit.
    await tx.query('SELECT id FROM users WHERE id=$1 FOR SHARE', [actor.userId]);
    await tx.query('SELECT id FROM auth_sessions WHERE id=$1 AND user_id=$2 FOR SHARE', [
      actor.sessionId,
      actor.userId,
    ]);
    await this.security.authorize(actor, [...permissions], 'all', tx);
    const user = await this.security.identity(actor, tx);
    if (verified && !user.email_verified_at) {
      throw new ForbiddenException({
        errorCode: 'GAME_EMAIL_VERIFICATION_REQUIRED',
        message: 'Verify email before ranked play',
      });
    }
    return user;
  }

  own(actor: Actor, ownerId: string): void {
    if (!actor) throw new UnauthorizedException('Invalid session');
    // No role, including super_admin, can bypass an own-account route.
    if (actor.userId !== ownerId) {
      throw new ForbiddenException({
        errorCode: 'GAME_OWNER_REQUIRED',
        message: 'Own account required',
      });
    }
  }
}
