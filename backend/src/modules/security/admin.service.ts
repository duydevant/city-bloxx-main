import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AuthService } from './auth.service';
import {
  ActiveDto,
  AdminCreateUserDto,
  CreatePermissionDto,
  CreateRoleDto,
  ListDto,
  ProfileDto,
  RoleUpdateDto,
} from './dto';
import { boolEnv, opaque } from './infrastructure.service';
import { SecurityService } from './security.service';
import { Actor, PermissionRow, RoleRow, rows, SessionRow, UserRow } from './types';

type Resource = 'users' | 'roles' | 'permissions' | 'auth_sessions' | 'audit_logs';
@Injectable()
export class AdminService {
  constructor(
    private readonly db: DataSource,
    private readonly sec: SecurityService,
    private readonly auth: AuthService,
  ) {}
  private code(table: Resource) {
    return table === 'auth_sessions' ? 'sessions' : table;
  }
  private async mutation<T>(
    actor: Actor,
    permission: string,
    fn: (tx: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.transaction(async (tx) => {
        await this.sec.lockAdmin(tx);
        await this.sec.authorize(actor, [permission], 'all', tx);
        return fn(tx);
      });
    } catch (e) {
      if (e instanceof ForbiddenException) await this.sec.denied(actor, permission);
      if (['23505', '23503'].includes((e as { code?: string }).code || ''))
        throw new ConflictException('Resource conflict or active assignments');
      throw e;
    }
  }
  private async user(tx: EntityManager, id: string, lock = false) {
    const [u] = await rows<UserRow>(
      tx,
      `SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL ${lock ? 'FOR UPDATE' : ''}`,
      [id],
    );
    if (!u) throw new NotFoundException();
    return u;
  }
  async list(actor: Actor, table: Resource, q: ListDto) {
    await this.sec.authorize(actor, [`${this.code(table)}:read`]);
    const params: unknown[] = [];
    const where: string[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (table === 'users') {
      where.push('t.deleted_at IS NULL');
      if (q.search)
        add(
          `(t.email ILIKE ? OR t.full_name ILIKE $${params.length + 1})`,
          `%${q.search}%`,
        );
      if (q.status) add('t.status=?', q.status);
      if (q.role)
        add(
          'EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=t.id AND r.code=?)',
          q.role,
        );
    }
    if (table === 'roles' || table === 'permissions') {
      if (q.search)
        add(`(t.name ILIKE ? OR t.code ILIKE $${params.length + 1})`, `%${q.search}%`);
      if (q.resource && table === 'permissions') add('t.resource=?', q.resource);
      if (q.status) {
        if (!['active', 'suspended'].includes(q.status))
          throw new BadRequestException('Invalid status filter');
        add('t.is_active=?', q.status === 'active');
      }
    }
    if (table === 'auth_sessions') {
      if (q.userId) add('t.user_id=?', q.userId);
      if (q.status === 'active')
        where.push('t.revoked_at IS NULL AND t.expires_at>now()');
      else if (q.status === 'revoked') where.push('t.revoked_at IS NOT NULL');
      else if (q.status === 'expired') where.push('t.expires_at<=now()');
      else if (q.status) throw new BadRequestException('Invalid session status');
    }
    if (table === 'audit_logs') {
      if (q.actorId) add('t.actor_id=?', q.actorId);
      if (q.targetId) add('t.target_id=?', q.targetId);
      if (q.action) add('t.action=?', q.action);
    }
    if (q.from) add('t.created_at>=?', q.from);
    if (q.to) add('t.created_at<=?', q.to);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [{ count }] = await rows<{ count: string }>(
      this.db.manager,
      `SELECT count(*) FROM ${table} t ${clause}`,
      params,
    );
    const columns =
      table === 'users'
        ? 't.id,t.email,t.username,t.full_name,t.avatar_url,t.status,t.email_verified_at,t.last_login_at,t.created_at,t.updated_at'
        : 't.*';
    const allowed =
      table === 'users'
        ? ['created_at', 'email']
        : table === 'roles' || table === 'permissions'
          ? ['created_at', 'name']
          : ['created_at'];
    if (!allowed.includes(q.sortBy)) throw new BadRequestException('Unsupported sort');
    params.push(q.pageSize, (q.page - 1) * q.pageSize);
    const data = await rows<Record<string, unknown>>(
      this.db.manager,
      `SELECT ${columns} FROM ${table} t ${clause} ORDER BY t.${q.sortBy} ${q.order},t.id ${q.order} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return {
      data,
      pagination: {
        page: q.page,
        pageSize: q.pageSize,
        total: Number(count),
        totalPages: Math.ceil(Number(count) / q.pageSize),
      },
    };
  }
  async detail(actor: Actor, table: Resource, id: string) {
    await this.sec.authorize(actor, [`${this.code(table)}:read`]);
    if (table === 'users') {
      await this.user(this.db.manager, id);
      return this.sec.summary(id);
    }
    const [result] = await rows<Record<string, unknown>>(
      this.db.manager,
      `SELECT * FROM ${table} WHERE id=$1`,
      [id],
    );
    if (!result) throw new NotFoundException();
    return result;
  }
  async createUser(actor: Actor, dto: AdminCreateUserDto) {
    const hash = await this.auth.hash(opaque());
    return this.mutation(actor, 'users:create', async (tx) => {
      const [role] = await rows<RoleRow>(
        tx,
        `SELECT * FROM roles WHERE code='user' AND is_default AND is_active`,
      );
      if (!role) throw new ConflictException('Default role unavailable');
      const [u] = await rows<UserRow>(
        tx,
        `INSERT INTO users(id,email,password_hash,full_name,status) VALUES($1,$2,$3,$4,'pending') RETURNING *`,
        [randomUUID(), dto.email.trim().toLowerCase(), hash, dto.fullName || null],
      );
      await tx.query(
        'INSERT INTO user_roles(user_id,role_id,assigned_by) VALUES($1,$2,$3)',
        [u.id, role.id, actor.userId],
      );
      await this.auth.issueLink(tx, u, 'reset');
      if (boolEnv('REQUIRE_EMAIL_VERIFICATION'))
        await this.auth.issueLink(tx, u, 'verify');
      await this.sec.audit(tx, actor, 'admin.user_created', 'users', u.id, {
        invitation: true,
      });
      return this.sec.summary(u.id, tx);
    });
  }
  async updateUser(actor: Actor, id: string, dto: ProfileDto) {
    return this.mutation(actor, 'users:update', async (tx) => {
      await this.user(tx, id, true);
      await this.sec.checkTarget(actor, id, tx);
      await tx.query(
        'UPDATE users SET full_name=coalesce($2,full_name),avatar_url=coalesce($3,avatar_url),username=coalesce($4,username),updated_at=now() WHERE id=$1',
        [id, dto.fullName ?? null, dto.avatarUrl ?? null, dto.username ?? null],
      );
      await this.sec.audit(tx, actor, 'admin.user_updated', 'users', id, {
        fields: Object.keys(dto),
      });
      return this.sec.summary(id, tx);
    });
  }
  async statusUser(actor: Actor, id: string, status?: string) {
    return this.mutation(
      actor,
      status ? 'users:update_status' : 'users:delete',
      async (tx) => {
        const u = await this.user(tx, id, true);
        await this.sec.checkTarget(actor, id, tx);
        if (status !== 'active') await this.sec.protectLastSuper(tx, id);
        if (
          status === 'active' &&
          boolEnv('REQUIRE_EMAIL_VERIFICATION') &&
          !u.email_verified_at
        )
          throw new ConflictException('Email verification required');
        if (status)
          await tx.query('UPDATE users SET status=$2,updated_at=now() WHERE id=$1', [
            id,
            status,
          ]);
        else
          await tx.query(
            'UPDATE users SET deleted_at=now(),updated_at=now() WHERE id=$1',
            [id],
          );
        await this.sec.revoke(tx, id, status ? 'status_changed' : 'deleted');
        await this.sec.audit(
          tx,
          actor,
          status ? 'admin.user_status_changed' : 'admin.user_deleted',
          'users',
          id,
          { before: u.status, after: status || 'deleted' },
        );
        return { message: 'User updated' };
      },
    );
  }
  async userRelation(
    actor: Actor,
    id: string,
    relation: 'roles' | 'permissions' | 'sessions',
  ) {
    await this.sec.authorize(actor, [
      relation === 'sessions' ? 'sessions:read' : 'users:read',
    ]);
    await this.user(this.db.manager, id);
    if (relation === 'roles') return this.sec.roles(id);
    if (relation === 'permissions') return this.sec.permissions(id);
    return rows<SessionRow>(
      this.db.manager,
      'SELECT * FROM auth_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',
      [id],
    );
  }
  async assignRoles(
    actor: Actor,
    id: string,
    ids: string[],
    mode: 'replace' | 'add' | 'remove',
  ) {
    return this.mutation(actor, 'users:assign_roles', async (tx) => {
      await this.user(tx, id, true);
      await this.sec.checkTarget(actor, id, tx, true);
      const current = await this.sec.roles(id, tx);
      const selected = await rows<RoleRow>(
        tx,
        'SELECT * FROM roles WHERE id=ANY($1::uuid[])',
        [ids],
      );
      if (selected.length !== ids.length) throw new BadRequestException('Unknown role');
      const nextIds =
        mode === 'replace'
          ? ids
          : mode === 'add'
            ? [...new Set([...current.map((r) => r.id), ...ids])]
            : current.filter((r) => !ids.includes(r.id)).map((r) => r.id);
      const next = await rows<RoleRow>(
        tx,
        'SELECT * FROM roles WHERE id=ANY($1::uuid[])',
        [nextIds],
      );
      if (
        current.some((r) => r.code === 'super_admin') ||
        selected.some((r) => r.code === 'super_admin')
      )
        throw new ForbiddenException(
          'Protected super admin assignment; use operator CLI',
        );
      await this.sec.validateGrant(actor, next, tx);
      await tx.query('DELETE FROM user_roles WHERE user_id=$1', [id]);
      for (const roleId of nextIds)
        await tx.query(
          'INSERT INTO user_roles(user_id,role_id,assigned_by) VALUES($1,$2,$3)',
          [id, roleId, actor.userId],
        );
      await this.sec.audit(tx, actor, 'admin.user_roles_changed', 'users', id, {
        before: current.map((r) => r.id),
        after: nextIds,
      });
      return this.sec.roles(id, tx);
    });
  }
  async create(
    actor: Actor,
    table: 'roles' | 'permissions',
    dto: CreateRoleDto | CreatePermissionDto,
  ) {
    return this.mutation(
      actor,
      table === 'roles' ? 'roles:create' : 'permissions:manage',
      async (tx) => {
        const id = randomUUID();
        if (table === 'roles') {
          const r = dto as CreateRoleDto;
          if (['user', 'admin', 'super_admin'].includes(r.code))
            throw new ForbiddenException('Reserved role');
          await tx.query(
            'INSERT INTO roles(id,code,name,description) VALUES($1,$2,$3,$4)',
            [id, r.code, r.name, r.description || null],
          );
        } else {
          const p = dto as CreatePermissionDto;
          if (
            ['system', 'super_admin', 'permissions'].includes(p.resource) ||
            p.action === '*'
          )
            throw new ForbiddenException('Reserved permission');
          await tx.query(
            'INSERT INTO permissions(id,code,resource,action,name,description) VALUES($1,$2,$3,$4,$5,$6)',
            [
              id,
              `${p.resource}:${p.action}`,
              p.resource,
              p.action,
              p.name,
              p.description || null,
            ],
          );
        }
        await this.sec.audit(tx, actor, `admin.${table}_created`, table, id);
        const [result] = await rows<RoleRow | PermissionRow>(
          tx,
          `SELECT * FROM ${table} WHERE id=$1`,
          [id],
        );
        return result;
      },
    );
  }
  private async protectedObject(
    actor: Actor,
    table: 'roles' | 'permissions',
    id: string,
    tx: EntityManager,
  ) {
    const [r] = await rows<RoleRow | PermissionRow>(
      tx,
      `SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,
      [id],
    );
    if (!r) throw new NotFoundException();
    if (r.is_system)
      throw new ForbiddenException('System resource is immutable through API');
    if (!(await this.sec.isSuper(actor.userId, tx))) {
      if (table === 'roles') {
        if ((await this.sec.roles(actor.userId, tx)).some((role) => role.id === id))
          throw new ForbiddenException('Cannot mutate a role assigned to yourself');
        const recipients = await rows<{ user_id: string }>(
          tx,
          'SELECT user_id FROM user_roles WHERE role_id=$1',
          [id],
        );
        for (const u of recipients) await this.sec.checkTarget(actor, u.user_id, tx);
        await this.sec.validateGrant(actor, [r as RoleRow], tx);
      } else {
        const assigned = await rows<{ role_id: string }>(
          tx,
          'SELECT role_id FROM role_permissions WHERE permission_id=$1',
          [id],
        );
        for (const role of assigned)
          await this.protectedObject(actor, 'roles', role.role_id, tx);
      }
    }
    return r;
  }
  async update(
    actor: Actor,
    table: 'roles' | 'permissions',
    id: string,
    dto: RoleUpdateDto | ActiveDto | undefined,
  ) {
    return this.mutation(
      actor,
      table === 'roles' ? (dto ? 'roles:update' : 'roles:delete') : 'permissions:manage',
      async (tx) => {
        const previous = await this.protectedObject(actor, table, id, tx);
        if (!dto) await tx.query(`DELETE FROM ${table} WHERE id=$1`, [id]);
        else if ('isActive' in dto)
          await tx.query(
            `UPDATE ${table} SET is_active=$2,updated_at=now() WHERE id=$1`,
            [id, dto.isActive],
          );
        else
          await tx.query(
            `UPDATE ${table} SET name=coalesce($2,name),description=coalesce($3,description),updated_at=now() WHERE id=$1`,
            [id, dto.name ?? null, dto.description ?? null],
          );
        await this.sec.audit(
          tx,
          actor,
          `admin.${table}_${dto ? 'updated' : 'deleted'}`,
          table,
          id,
          { before: previous, changes: dto || { deleted: true } },
        );
        if (!dto) return { message: 'Deleted' };
        const [result] = await rows<RoleRow | PermissionRow>(
          tx,
          `SELECT * FROM ${table} WHERE id=$1`,
          [id],
        );
        return result;
      },
    );
  }
  async roleRelation(actor: Actor, id: string, kind: 'permissions' | 'users') {
    await this.sec.authorize(actor, ['roles:read']);
    await this.detail(actor, 'roles', id);
    if (kind === 'permissions')
      return rows<PermissionRow>(
        this.db.manager,
        'SELECT p.* FROM permissions p JOIN role_permissions rp ON rp.permission_id=p.id WHERE rp.role_id=$1 ORDER BY p.resource,p.action',
        [id],
      );
    return rows<Pick<UserRow, 'id' | 'email' | 'status'>>(
      this.db.manager,
      'SELECT u.id,u.email,u.status FROM users u JOIN user_roles ur ON ur.user_id=u.id WHERE ur.role_id=$1 AND u.deleted_at IS NULL ORDER BY u.id LIMIT 100',
      [id],
    );
  }
  async assignPermissions(
    actor: Actor,
    id: string,
    ids: string[],
    mode: 'replace' | 'add' | 'remove',
  ) {
    return this.mutation(actor, 'roles:assign_permissions', async (tx) => {
      await this.protectedObject(actor, 'roles', id, tx);
      const current = await rows<PermissionRow>(
        tx,
        'SELECT p.* FROM permissions p JOIN role_permissions rp ON rp.permission_id=p.id WHERE rp.role_id=$1',
        [id],
      );
      const selected = await rows<PermissionRow>(
        tx,
        'SELECT * FROM permissions WHERE id=ANY($1::uuid[])',
        [ids],
      );
      if (selected.length !== ids.length)
        throw new BadRequestException('Unknown permission');
      const nextIds =
        mode === 'replace'
          ? ids
          : mode === 'add'
            ? [...new Set([...current.map((p) => p.id), ...ids])]
            : current.filter((p) => !ids.includes(p.id)).map((p) => p.id);
      const next = await rows<PermissionRow>(
        tx,
        'SELECT * FROM permissions WHERE id=ANY($1::uuid[])',
        [nextIds],
      );
      if (next.some((p) => !p.is_active))
        throw new BadRequestException('Inactive permission');
      if (!(await this.sec.isSuper(actor.userId, tx))) {
        const allowed = await this.sec.permissions(actor.userId, tx);
        if (next.some((p) => !allowed.includes(p.code)))
          throw new ForbiddenException('Grant exceeds authority');
      }
      await tx.query('DELETE FROM role_permissions WHERE role_id=$1', [id]);
      for (const permissionId of nextIds)
        await tx.query(
          'INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2)',
          [id, permissionId],
        );
      await this.sec.audit(tx, actor, 'admin.role_permissions_changed', 'roles', id, {
        before: current.map((p) => p.id),
        after: nextIds,
      });
      return rows<PermissionRow>(
        tx,
        'SELECT p.* FROM permissions p JOIN role_permissions rp ON rp.permission_id=p.id WHERE rp.role_id=$1 ORDER BY p.code',
        [id],
      );
    });
  }
  async resources(actor: Actor) {
    await this.sec.authorize(actor, ['permissions:read']);
    return rows<{ resource: string; permissions: PermissionRow[] }>(
      this.db.manager,
      `SELECT resource,jsonb_agg(jsonb_build_object('id',id,'code',code,'action',action,'name',name,'isSystem',is_system,'isActive',is_active) ORDER BY action) AS permissions FROM permissions GROUP BY resource ORDER BY resource`,
    );
  }
  async revoke(actor: Actor, userId?: string, sessionId?: string) {
    return this.mutation(actor, 'sessions:revoke', async (tx) => {
      if (sessionId) {
        const [s] = await rows<SessionRow>(
          tx,
          'SELECT * FROM auth_sessions WHERE id=$1',
          [sessionId],
        );
        if (!s) throw new NotFoundException();
        userId = s.user_id;
      }
      await this.user(tx, userId, true);
      await this.sec.checkTarget(actor, userId, tx);
      await this.sec.revoke(tx, userId, 'admin_revoked', sessionId);
      await this.sec.audit(
        tx,
        actor,
        'admin.sessions_revoked',
        sessionId ? 'auth_sessions' : 'users',
        sessionId || userId,
      );
      return { message: 'Sessions revoked' };
    });
  }
}
