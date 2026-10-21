import * as argon2 from 'argon2';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import {
  EmailDto,
  LoginDto,
  PasswordDto,
  ProfileDto,
  RegisterDto,
  ResetDto,
} from './dto';
import { boolEnv, digest, InfrastructureService, opaque } from './infrastructure.service';
import { SecurityService } from './security.service';
import { Actor, RoleRow, rows, SessionRow, TokenRow, UserRow } from './types';

@Injectable()
export class AuthService {
  private readonly dummyHash = argon2.hash(opaque(), { type: argon2.argon2id });
  constructor(
    readonly db: DataSource,
    readonly security: SecurityService,
    private readonly infra: InfrastructureService,
    private readonly jwt: JwtService,
  ) {}
  async hash(password: string) {
    if (
      password.length < Number(process.env.PASSWORD_MIN_LENGTH || 12) ||
      password.length > 128
    )
      throw new BadRequestException(
        'Password must be between configured minimum and 128 characters',
      );
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
  }
  private async verify(hash: string, password: string) {
    return argon2.verify(hash, password).catch(() => false);
  }
  async issueLink(tx: EntityManager, user: UserRow, kind: 'reset' | 'verify') {
    const table =
      kind === 'reset' ? 'password_reset_tokens' : 'email_verification_tokens';
    const token = opaque();
    const expires = new Date(
      Date.now() + (kind === 'reset' ? 20 * 60 : 24 * 60 * 60) * 1000,
    );
    await tx.query(
      `UPDATE ${table} SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL`,
      [user.id],
    );
    await tx.query(
      `INSERT INTO ${table}(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)`,
      [randomUUID(), user.id, digest(token), expires],
    );
    await this.infra.queueMail(tx, user.email, kind, token, expires);
  }
  async register(dto: RegisterDto, ip: string) {
    if (!boolEnv('REGISTRATION_ENABLED'))
      throw new ForbiddenException('Registration disabled');
    const passwordHash = await this.hash(dto.password);
    try {
      return await this.db.transaction(async (tx) => {
        const [role] = await rows<RoleRow>(
          tx,
          `SELECT * FROM roles WHERE code='user' AND is_default AND is_active FOR SHARE`,
        );
        if (!role) throw new ConflictException('Default user role unavailable');
        const requireVerify = boolEnv('REQUIRE_EMAIL_VERIFICATION');
        const [user] = await rows<UserRow>(
          tx,
          `INSERT INTO users(id,email,password_hash,full_name,status,email_verified_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
          [
            randomUUID(),
            dto.email.trim().toLowerCase(),
            passwordHash,
            dto.fullName || null,
            requireVerify ? 'pending' : 'active',
            requireVerify ? null : new Date(),
          ],
        );
        await tx.query('INSERT INTO user_roles(user_id,role_id) VALUES($1,$2)', [
          user.id,
          role.id,
        ]);
        if (requireVerify)
          await this.issueLink(tx, user, 'verify');
        await this.security.audit(
          tx,
          { userId: user.id, sessionId: '', version: 0, ip },
          'auth.register',
          'users',
          user.id,
        );
        return this.security.summary(user.id, tx);
      });
    } catch (e) {
      if ((e as { code?: string }).code === '23505')
        throw new ConflictException('Account already exists');
      throw e;
    }
  }
  private async tokens(
    tx: EntityManager,
    user: UserRow,
    session: SessionRow,
    familyId: string,
  ) {
    const refreshToken = opaque();
    await tx.query(
      'INSERT INTO refresh_tokens(id,session_id,family_id,token_hash,expires_at) VALUES($1,$2,$3,$4,$5)',
      [randomUUID(), session.id, familyId, digest(refreshToken), session.expires_at],
    );
    const expiresIn = Number(process.env.JWT_ACCESS_TTL_SECONDS || 900);
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, sid: session.id, type: 'access', ver: user.token_version },
      {
        algorithm: 'HS256',
        secret: process.env.JWT_SECRET,
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
        expiresIn,
      },
    );
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      user: await this.security.summary(user.id, tx),
      refreshToken,
      sessionExpiresAt: session.expires_at,
    };
  }
  async login(dto: LoginDto, ip: string, userAgent: string) {
    const requireVerify = boolEnv('REQUIRE_EMAIL_VERIFICATION');
    const [found] = await rows<UserRow>(
      this.db.manager,
      'SELECT * FROM users WHERE lower(email)=$1',
      [dto.email.trim().toLowerCase()],
    );
    const valid = await this.verify(
      found?.password_hash || (await this.dummyHash),
      dto.password,
    );
    if (
      !found ||
      !valid ||
      found.deleted_at ||
      (requireVerify ? found.status !== 'active' : !['active', 'pending'].includes(found.status)) ||
      (requireVerify && !found.email_verified_at)
    ) {
      await this.security.audit(
        this.db.manager,
        null,
        'auth.login_failed',
        undefined,
        undefined,
        { identifierHash: digest(dto.email.trim().toLowerCase()) },
      );
      throw new UnauthorizedException('Invalid credentials or account unavailable');
    }
    return this.db.transaction(async (tx) => {
      if (!requireVerify && (found.status === 'pending' || !found.email_verified_at)) {
        await tx.query(
          `UPDATE users SET status='active', email_verified_at=COALESCE(email_verified_at, now()), updated_at=now() WHERE id=$1 AND status IN ('active','pending')`,
          [found.id],
        );
      }
      const [u] = await rows<UserRow>(tx, 'SELECT * FROM users WHERE id=$1 FOR UPDATE', [
        found.id,
      ]);
      if (
        u.status !== 'active' ||
        u.deleted_at ||
        u.password_hash !== found.password_hash
      )
        throw new UnauthorizedException('Invalid credentials');
      const [{ count }] = await rows<{ count: string }>(
        tx,
        'SELECT count(*) FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now()',
        [u.id],
      );
      if (Number(count) >= Number(process.env.MAX_ACTIVE_SESSIONS || 10))
        throw new ConflictException('Active session limit reached');
      const expires = new Date(
        Date.now() + Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30) * 86400000,
      );
      const [session] = await rows<SessionRow>(
        tx,
        'INSERT INTO auth_sessions(id,user_id,device_name,user_agent,ip_address,expires_at,last_used_at) VALUES($1,$2,$3,$4,$5,$6,now()) RETURNING *',
        [
          randomUUID(),
          u.id,
          dto.deviceName || null,
          userAgent.slice(0, 1000),
          ip,
          expires,
        ],
      );
      await tx.query(
        'UPDATE users SET last_login_at=now(),updated_at=now() WHERE id=$1',
        [u.id],
      );
      await this.security.audit(
        tx,
        { userId: u.id, sessionId: session.id, version: u.token_version, ip },
        'auth.login',
        'auth_sessions',
        session.id,
      );
      return this.tokens(tx, u, session, randomUUID());
    });
  }
  async refresh(raw: string, ip: string) {
    if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw))
      throw new UnauthorizedException('Invalid refresh token');
    const [lookup] = await rows<TokenRow & { user_id: string }>(
      this.db.manager,
      'SELECT t.*,s.user_id FROM refresh_tokens t JOIN auth_sessions s ON s.id=t.session_id WHERE token_hash=$1',
      [digest(raw)],
    );
    if (!lookup) throw new UnauthorizedException('Invalid refresh token');
    const result = await this.db.transaction(async (tx) => {
      const [u] = await rows<UserRow>(tx, 'SELECT * FROM users WHERE id=$1 FOR UPDATE', [
        lookup.user_id,
      ]);
      const [s] = await rows<SessionRow>(
        tx,
        'SELECT * FROM auth_sessions WHERE id=$1 FOR UPDATE',
        [lookup.session_id],
      );
      const [t] = await rows<TokenRow>(
        tx,
        'SELECT * FROM refresh_tokens WHERE id=$1 FOR UPDATE',
        [lookup.id],
      );
      if (!s || !t) return null;
      if (t.used_at) {
        await this.security.revoke(tx, u.id, 'refresh_replay', s.id);
        await this.security.audit(
          tx,
          { userId: u.id, sessionId: s.id, version: u.token_version, ip },
          'auth.refresh_replay',
          'auth_sessions',
          s.id,
        );
        return null;
      }
      if (
        t.revoked_at ||
        s.revoked_at ||
        new Date(t.expires_at).getTime() <= Date.now() ||
        new Date(s.expires_at).getTime() <= Date.now() ||
        u.status !== 'active' ||
        u.deleted_at
      )
        return null;
      await tx.query('UPDATE refresh_tokens SET used_at=now() WHERE id=$1', [t.id]);
      await tx.query('UPDATE auth_sessions SET last_used_at=now() WHERE id=$1', [s.id]);
      await this.security.audit(
        tx,
        { userId: u.id, sessionId: s.id, version: u.token_version, ip },
        'auth.refresh_rotated',
        'auth_sessions',
        s.id,
      );
      return this.tokens(tx, u, s, t.family_id);
    });
    if (!result)
      throw new UnauthorizedException('Refresh token rejected; login required');
    return result;
  }
  async logout(actor: Actor, all = false) {
    await this.db.transaction(async (tx) => {
      await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [actor.userId]);
      await this.security.identity(actor, tx);
      await this.security.revoke(
        tx,
        actor.userId,
        all ? 'logout_all' : 'logout',
        all ? undefined : actor.sessionId,
      );
      await this.security.audit(
        tx,
        actor,
        all ? 'auth.logout_all' : 'auth.logout',
        'users',
        actor.userId,
      );
    });
    return { message: 'Logged out' };
  }
  async cookieLogout(raw: string, ip: string) {
    const [t] = await rows<TokenRow>(
      this.db.manager,
      `SELECT t.*,s.user_id FROM refresh_tokens t JOIN auth_sessions s ON s.id=t.session_id WHERE token_hash=$1`,
      [digest(raw || '')],
    );
    if (t)
      await this.db.transaction(async (tx) => {
        await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [t.user_id]);
        await this.security.revoke(tx, t.user_id, 'logout', t.session_id);
        await this.security.audit(
          tx,
          { userId: t.user_id, sessionId: t.session_id, version: 0, ip },
          'auth.logout',
          'auth_sessions',
          t.session_id,
        );
      });
    return { message: 'Logged out' };
  }
  async recovery(dto: EmailDto, verify = false) {
    await this.db.transaction(async (tx) => {
      const [u] = await rows<UserRow>(
        tx,
        'SELECT * FROM users WHERE lower(email)=$1 AND deleted_at IS NULL FOR UPDATE',
        [dto.email.trim().toLowerCase()],
      );
      if (
        u &&
        u.status !== 'suspended' &&
        (!verify || (u.status === 'pending' && !u.email_verified_at))
      ) {
        await this.issueLink(tx, u, verify ? 'verify' : 'reset');
        await this.security.audit(
          tx,
          null,
          verify ? 'auth.verification_requested' : 'auth.reset_requested',
          'users',
          u.id,
        );
      }
    });
    return { message: 'If the account is eligible, an email will be sent' };
  }
  async consume(dto: ResetDto | { token: string }, kind: 'reset' | 'verify') {
    const table =
      kind === 'reset' ? 'password_reset_tokens' : 'email_verification_tokens';
    const [lookup] = await rows<TokenRow>(
      this.db.manager,
      `SELECT * FROM ${table} WHERE token_hash=$1`,
      [digest(dto.token)],
    );
    if (!lookup) throw new BadRequestException('Invalid or expired token');
    const hash = kind === 'reset' ? await this.hash((dto as ResetDto).password) : null;
    await this.db.transaction(async (tx) => {
      const [u] = await rows<UserRow>(tx, 'SELECT * FROM users WHERE id=$1 FOR UPDATE', [
        lookup.user_id,
      ]);
      const [t] = await rows<TokenRow>(
        tx,
        `SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,
        [lookup.id],
      );
      if (
        !t ||
        t.consumed_at ||
        new Date(t.expires_at).getTime() <= Date.now() ||
        u.deleted_at ||
        u.status === 'suspended'
      )
        throw new BadRequestException('Invalid or expired token');
      await tx.query(
        `UPDATE ${table} SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL`,
        [u.id],
      );
      if (kind === 'reset') {
        // Invitations still require separate verification when email policy is enabled.
        await tx.query(
          `UPDATE users SET password_hash=$2,updated_at=now(),status=CASE WHEN status='pending' AND ($3 OR email_verified_at IS NOT NULL) THEN 'active' ELSE status END WHERE id=$1`,
          [u.id, hash, !boolEnv('REQUIRE_EMAIL_VERIFICATION')],
        );
        await this.security.revoke(tx, u.id, 'password_reset');
      } else {
        await tx.query(
          `UPDATE users SET email_verified_at=now(),status=CASE WHEN status='pending' THEN 'active' ELSE status END,updated_at=now() WHERE id=$1`,
          [u.id],
        );
      }
      await this.security.audit(
        tx,
        null,
        kind === 'reset' ? 'auth.password_reset' : 'auth.email_verified',
        'users',
        u.id,
      );
    });
    return {
      message: kind === 'reset' ? 'Password reset; login required' : 'Email verified',
    };
  }
  async change(actor: Actor, dto: PasswordDto) {
    const hash = await this.hash(dto.newPassword);
    await this.db.transaction(async (tx) => {
      const [u] = await rows<UserRow>(tx, 'SELECT * FROM users WHERE id=$1 FOR UPDATE', [
        actor.userId,
      ]);
      await this.security.identity(actor, tx);
      if (!(await this.verify(u.password_hash, dto.currentPassword)))
        throw new UnauthorizedException('Incorrect current password');
      await tx.query('UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1', [
        u.id,
        hash,
      ]);
      await tx.query(
        'UPDATE password_reset_tokens SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL',
        [u.id],
      );
      await this.security.revoke(tx, u.id, 'password_change');
      await this.security.audit(tx, actor, 'auth.password_changed', 'users', u.id);
    });
    return { message: 'Password changed; login required' };
  }
  async profile(actor: Actor, dto: ProfileDto) {
    await this.security.authorize(actor, ['profile:update']);
    try {
      return await this.db.transaction(async (tx) => {
        await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [actor.userId]);
        await this.security.authorize(actor, ['profile:update'], 'all', tx);
        await tx.query(
          `UPDATE users SET full_name=coalesce($2,full_name),avatar_url=coalesce($3,avatar_url),username=coalesce($4,username),updated_at=now() WHERE id=$1`,
          [
            actor.userId,
            dto.fullName ?? null,
            dto.avatarUrl ?? null,
            dto.username ?? null,
          ],
        );
        await this.security.audit(tx, actor, 'profile.updated', 'users', actor.userId, {
          fields: Object.keys(dto),
        });
        return this.security.summary(actor.userId, tx);
      });
    } catch (e) {
      if ((e as { code?: string }).code === '23505')
        throw new ConflictException('Username already exists');
      throw e;
    }
  }
  async sessions(actor: Actor) {
    await this.security.identity(actor);
    return rows<Omit<SessionRow, 'user_id'>>(
      this.db.manager,
      `SELECT id,device_name,user_agent,ip_address,created_at,last_used_at,expires_at,revoked_at FROM auth_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,
      [actor.userId],
    );
  }
  async revokeOwn(actor: Actor, id: string) {
    await this.db.transaction(async (tx) => {
      await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [actor.userId]);
      await this.security.identity(actor, tx);
      const [s] = await rows<SessionRow>(
        tx,
        'SELECT * FROM auth_sessions WHERE id=$1 AND user_id=$2',
        [id, actor.userId],
      );
      if (!s) throw new NotFoundException();
      await this.security.revoke(tx, actor.userId, 'user_revoked', id);
      await this.security.audit(tx, actor, 'auth.session_revoked', 'auth_sessions', id);
    });
    return { message: 'Session revoked' };
  }
}
