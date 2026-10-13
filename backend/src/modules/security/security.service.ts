import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { Actor, PermissionRow, RoleRow, rows, SessionRow, UserRow } from './types';

@Injectable()
export class SecurityService {
  constructor(readonly db: DataSource) {}
  async audit(
    tx: EntityManager,
    actor: Actor | null,
    action: string,
    targetType?: string,
    targetId?: string,
    metadata: Record<string, unknown> = {},
  ) {
    await tx.query(
      `INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,metadata,ip_address)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [
        randomUUID(),
        actor?.userId || null,
        action,
        targetType || null,
        targetId || null,
        JSON.stringify(metadata),
        actor?.ip || null,
      ],
    );
  }
  async denied(actor: Actor | null, action: string) {
    await this.audit(
      this.db.manager,
      actor,
      'authorization.denied',
      undefined,
      undefined,
      { operation: action },
    );
  }
  async identity(actor: Actor, tx = this.db.manager) {
    const [u] = await rows<UserRow>(tx, `SELECT * FROM users WHERE id=$1`, [
      actor.userId,
    ]);
    const [s] = await rows<SessionRow>(
      tx,
      `SELECT * FROM auth_sessions WHERE id=$1 AND user_id=$2`,
      [actor.sessionId, actor.userId],
    );
    if (
      !u ||
      u.deleted_at ||
      u.status !== 'active' ||
      u.token_version !== actor.version ||
      !s ||
      s.revoked_at ||
      new Date(s.expires_at).getTime() <= Date.now()
    )
      throw new UnauthorizedException('Invalid session');
    return u;
  }
  async roles(userId: string, tx = this.db.manager) {
    return rows<RoleRow>(
      tx,
      `SELECT r.* FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=$1 ORDER BY r.code`,
      [userId],
    );
  }
  async permissions(userId: string, tx = this.db.manager) {
    const result = await rows<{ code: string }>(
      tx,
      `SELECT DISTINCT p.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id
      JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id
      WHERE ur.user_id=$1 AND r.is_active AND p.is_active ORDER BY p.code`,
      [userId],
    );
    return result.map((p) => p.code);
  }
  async isSuper(userId: string, tx = this.db.manager) {
    return (await this.roles(userId, tx)).some(
      (r) => r.code === 'super_admin' && r.is_system && r.is_active,
    );
  }
  async authorize(
    actor: Actor,
    codes: string[],
    mode: 'all' | 'any' = 'all',
    tx = this.db.manager,
  ) {
    await this.identity(actor, tx);
    if (await this.isSuper(actor.userId, tx)) return;
    const effective = await this.permissions(actor.userId, tx);
    if (
      !(mode === 'all'
        ? codes.every((c) => effective.includes(c))
        : codes.some((c) => effective.includes(c)))
    )
      throw new ForbiddenException('Insufficient permissions');
  }
  async lockAdmin(tx: EntityManager) {
    // Serializes all privilege mutations, including CLI bootstrap. No stale checks across mutations.
    await tx.query('SELECT pg_advisory_xact_lock(1791840000)');
  }
  async checkTarget(actor: Actor, target: string, tx: EntityManager, assignment = false) {
    if (assignment && target === actor.userId)
      throw new ForbiddenException('Cannot change own role assignments');
    if (await this.isSuper(actor.userId, tx)) return;
    if (await this.isSuper(target, tx))
      throw new ForbiddenException('Protected system principal');
    const actorPermissions = await this.permissions(actor.userId, tx);
    if ((await this.permissions(target, tx)).some((c) => !actorPermissions.includes(c)))
      throw new ForbiddenException('Target exceeds your authority');
  }
  async protectLastSuper(tx: EntityManager, target: string) {
    if (!(await this.isSuper(target, tx))) return;
    const [{ count }] = await rows<{ count: string }>(
      tx,
      `SELECT count(*) FROM users u JOIN user_roles ur ON ur.user_id=u.id
      JOIN roles r ON r.id=ur.role_id WHERE r.code='super_admin' AND r.is_system AND r.is_active AND u.status='active' AND u.deleted_at IS NULL`,
    );
    const [u] = await rows<UserRow>(tx, 'SELECT * FROM users WHERE id=$1', [target]);
    if (u.status === 'active' && !u.deleted_at && Number(count) <= 1)
      throw new ForbiddenException('Cannot remove the final active super admin');
  }
  async validateGrant(actor: Actor, roles: RoleRow[], tx: EntityManager) {
    if (roles.some((r) => !r.is_active)) throw new BadRequestException('Inactive role');
    if (roles.some((r) => r.code === 'super_admin'))
      throw new ForbiddenException('Super admin grants require operator CLI');
    if (await this.isSuper(actor.userId, tx)) return;
    const allowed = await this.permissions(actor.userId, tx);
    const grants = await rows<PermissionRow>(
      tx,
      `SELECT DISTINCT p.* FROM permissions p JOIN role_permissions rp ON rp.permission_id=p.id WHERE rp.role_id=ANY($1::uuid[]) AND p.is_active`,
      [roles.map((r) => r.id)],
    );
    if (grants.some((p) => !allowed.includes(p.code)))
      throw new ForbiddenException('Grant exceeds your authority');
  }
  async revoke(tx: EntityManager, userId: string, reason: string, sessionId?: string) {
    await tx.query(
      `UPDATE auth_sessions SET revoked_at=coalesce(revoked_at,now()),revoked_reason=$2 WHERE user_id=$1 ${sessionId ? 'AND id=$3' : ''}`,
      sessionId ? [userId, reason, sessionId] : [userId, reason],
    );
    await tx.query(
      `UPDATE refresh_tokens SET revoked_at=coalesce(revoked_at,now()) WHERE session_id IN (SELECT id FROM auth_sessions WHERE user_id=$1 ${sessionId ? 'AND id=$2' : ''})`,
      sessionId ? [userId, sessionId] : [userId],
    );
    if (!sessionId)
      await tx.query(
        'UPDATE users SET token_version=token_version+1,updated_at=now() WHERE id=$1',
        [userId],
      );
  }
  async summary(userId: string, tx = this.db.manager) {
    const [u] = await rows<UserRow>(
      tx,
      'SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL',
      [userId],
    );
    if (!u) throw new UnauthorizedException();
    return {
      id: u.id,
      email: u.email,
      username: u.username,
      fullName: u.full_name,
      avatarUrl: u.avatar_url,
      status: u.status,
      emailVerifiedAt: u.email_verified_at,
      createdAt: u.created_at,
      roles: (await this.roles(userId, tx)).filter((r) => r.is_active).map((r) => r.code),
      permissions: await this.permissions(userId, tx),
    };
  }
}
