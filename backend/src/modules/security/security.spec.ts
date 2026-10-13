import { digest, opaque } from './infrastructure.service';
import {
  CookieMutation,
  Public,
  RequireAllPermissions,
  RequireAnyPermissions,
} from './policy';
import { validationSchema } from '../../config/config.validation';

describe('security configuration and primitives', () => {
  const env = {
    DB_HOST: 'db',
    DB_PORT: 5432,
    DB_USERNAME: 'postgres',
    DB_PASSWORD: 'test',
    DB_DATABASE: 'test',
    DB_CONNECTION: 'postgres',
    DB_SCHEMA: 'public',
    JWT_SECRET: 'a'.repeat(64),
    JWT_ISSUER: 'test',
    JWT_AUDIENCE: 'test',
    MAIL_OUTBOX_KEY: 'b'.repeat(64),
    REDIS_URL: 'redis://redis:6379',
    AUTH_ALLOWED_ORIGINS: 'http://localhost:3000',
    FRONTEND_USER_PORTAL_URL: 'http://localhost:3000',
    MAIL_HOST: 'mailpit',
    MAIL_PORT: 1025,
    MAIL_SENDER: 'test@example.test',
  };
  it('rejects algorithm confusion, weak secret and non-PostgreSQL database', () => {
    for (const change of [
      { JWT_ALGORITHM: 'none' },
      { JWT_ALGORITHM: 'RS256' },
      { JWT_SECRET: 'weak' },
      { DB_CONNECTION: 'mysql' },
      { MAIL_OUTBOX_KEY: 'bad' },
    ])
      expect(validationSchema.validate({ ...env, ...change }).error).toBeDefined();
    expect(validationSchema.validate(env).error).toBeUndefined();
  });
  it('requires secure cookies for production', () => {
    expect(
      validationSchema.validate({ ...env, NODE_ENV: 'production', COOKIE_SECURE: false })
        .error,
    ).toBeDefined();
    expect(
      validationSchema.validate({ ...env, NODE_ENV: 'production', COOKIE_SECURE: true })
        .error,
    ).toBeUndefined();
  });
  it('requires paired admin seed credentials with the configured password minimum', () => {
    expect(
      validationSchema.validate({ ...env, ADMIN_EMAIL: 'admin@example.test' }).error,
    ).toBeDefined();
    expect(
      validationSchema.validate({ ...env, ADMIN_PASSWORD: 'a'.repeat(12) }).error,
    ).toBeDefined();
    expect(
      validationSchema.validate({
        ...env,
        ADMIN_EMAIL: 'admin@example.test',
        ADMIN_PASSWORD: 'short',
      }).error,
    ).toBeDefined();
    expect(
      validationSchema.validate({
        ...env,
        ADMIN_EMAIL: 'admin@example.test',
        ADMIN_PASSWORD: 'a'.repeat(12),
        PASSWORD_MIN_LENGTH: 16,
      }).error,
    ).toBeDefined();
    expect(
      validationSchema.validate({
        ...env,
        ADMIN_EMAIL: 'admin@example.test',
        ADMIN_PASSWORD: 'a'.repeat(16),
        PASSWORD_MIN_LENGTH: 16,
      }).error,
    ).toBeUndefined();
    expect(
      validationSchema.validate({ ...env, ADMIN_EMAIL: '', ADMIN_PASSWORD: '' }).error,
    ).toBeUndefined();
  });
  it('opaque tokens have 256 bits and hashes are deterministic, distinct and fixed-size', () => {
    const a = opaque(),
      b = opaque();
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(a).not.toBe(b);
    expect(digest(a)).toHaveLength(64);
    expect(digest(a)).not.toBe(a);
    expect(digest(a)).toBe(digest(a));
  });
  it('keeps explicit ALL and ANY policy metadata', () => {
    class Example {
      @RequireAllPermissions('users:read', 'roles:read') all(this: void) {}
      @RequireAnyPermissions('users:read', 'roles:read') any(this: void) {}
      @Public() @CookieMutation() publicCookie(this: void) {}
    }
    expect(Reflect.getMetadata('auth:permissions', Example.prototype.all)).toEqual({
      permissions: ['users:read', 'roles:read'],
      mode: 'all',
    });
    expect(Reflect.getMetadata('auth:permissions', Example.prototype.any)).toEqual({
      permissions: ['users:read', 'roles:read'],
      mode: 'any',
    });
    expect(Reflect.getMetadata('auth:public', Example.prototype.publicCookie)).toBe(true);
    expect(Reflect.getMetadata('auth:cookie', Example.prototype.publicCookie)).toBe(true);
  });
});
