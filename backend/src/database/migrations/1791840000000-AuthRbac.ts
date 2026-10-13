import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthRbac1791840000000 implements MigrationInterface {
  name = 'AuthRbac1791840000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY, email varchar(255) NOT NULL, username varchar(50),
        password_hash text NOT NULL, full_name varchar(150), avatar_url text,
        status varchar(20) NOT NULL CHECK(status IN ('pending','active','suspended')),
        email_verified_at timestamptz, last_login_at timestamptz,
        token_version integer NOT NULL DEFAULT 0 CHECK(token_version >= 0),
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
      );
      CREATE UNIQUE INDEX uq_users_email_ci ON users(lower(email));
      CREATE UNIQUE INDEX uq_users_username_ci ON users(lower(username)) WHERE username IS NOT NULL;
      CREATE TABLE roles (
        id uuid PRIMARY KEY, code varchar(100) NOT NULL UNIQUE, name varchar(150) NOT NULL,
        description text, is_system boolean NOT NULL DEFAULT false,
        is_default boolean NOT NULL DEFAULT false, is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK(NOT is_default OR is_active)
      );
      CREATE UNIQUE INDEX uq_roles_single_default ON roles(is_default) WHERE is_default;
      CREATE TABLE permissions (
        id uuid PRIMARY KEY, code varchar(150) NOT NULL UNIQUE, resource varchar(100) NOT NULL,
        action varchar(50) NOT NULL, name varchar(150) NOT NULL, description text,
        is_system boolean NOT NULL DEFAULT false, is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(resource, action), CHECK(code = resource || ':' || action)
      );
      CREATE TABLE user_roles (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
        assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
        assigned_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,role_id)
      );
      CREATE INDEX idx_user_roles_role ON user_roles(role_id);
      CREATE TABLE role_permissions (
        role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
        permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE RESTRICT,
        assigned_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(role_id,permission_id)
      );
      CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);
      CREATE TABLE auth_sessions (
        id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_name varchar(150), user_agent text, ip_address inet,
        created_at timestamptz NOT NULL DEFAULT now(), last_used_at timestamptz,
        expires_at timestamptz NOT NULL, revoked_at timestamptz, revoked_reason varchar(100)
      );
      CREATE INDEX idx_sessions_user ON auth_sessions(user_id);
      CREATE TABLE refresh_tokens (
        id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
        family_id uuid NOT NULL, token_hash char(64) NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL, used_at timestamptz, revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_refresh_session ON refresh_tokens(session_id);
      CREATE INDEX idx_refresh_family ON refresh_tokens(family_id);
      CREATE TABLE password_reset_tokens (
        id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash char(64) NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
        consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_reset_user ON password_reset_tokens(user_id);
      CREATE TABLE email_verification_tokens (
        id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash char(64) NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
        consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_verify_user ON email_verification_tokens(user_id);
      CREATE TABLE audit_logs (
        id uuid PRIMARY KEY, actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
        action varchar(150) NOT NULL, target_type varchar(100), target_id uuid,
        metadata jsonb NOT NULL DEFAULT '{}', ip_address inet,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_audit_actor_date ON audit_logs(actor_id,created_at DESC);
      CREATE INDEX idx_audit_date ON audit_logs(created_at DESC);
      CREATE TABLE mail_outbox (
        id uuid PRIMARY KEY, payload text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL, next_attempt_at timestamptz NOT NULL DEFAULT now(),
        attempts integer NOT NULL DEFAULT 0, sent_at timestamptz
      );
      CREATE INDEX idx_mail_pending ON mail_outbox(next_attempt_at) WHERE sent_at IS NULL;
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    // Only for disposable databases. Production rollback preserves security history.
    await q.query(`DROP TABLE mail_outbox, audit_logs, email_verification_tokens,
      password_reset_tokens, refresh_tokens, auth_sessions, role_permissions,
      user_roles, permissions, roles, users`);
  }
}
