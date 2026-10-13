import * as argon2 from 'argon2';
import { isEmail } from 'class-validator';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { SecurityService } from '../modules/security/security.service';
import { CATALOG, RoleRow, rows, UserRow } from '../modules/security/types';

export class SeedConfigurationError extends Error {}
type AdminSeedResult = 'created' | 'preserved' | 'skipped';
interface AdminSeedConfig {
  email: string;
  password: string;
  fullName: string;
}

function adminConfig(): AdminSeedConfig | null {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email && !password) return null;
  if (!email || !password)
    throw new SeedConfigurationError(
      'Configure ADMIN_EMAIL and ADMIN_PASSWORD together.',
    );
  const minimum = Number(process.env.PASSWORD_MIN_LENGTH || 12);
  const fullName = process.env.ADMIN_FULL_NAME?.trim() || 'Administrator';
  if (
    !isEmail(email) ||
    email.length > 255 ||
    !Number.isInteger(minimum) ||
    minimum < 12 ||
    minimum > 128 ||
    password.length < minimum ||
    password.length > 128 ||
    !password.trim() ||
    fullName.length > 150
  ) {
    throw new SeedConfigurationError(
      'Invalid admin seed configuration: valid email, password policy (12–128 characters) and name up to 150 characters required.',
    );
  }
  return { email, password, fullName };
}

async function seedAdmin(
  tx: EntityManager,
  config: AdminSeedConfig | null,
  db: DataSource,
): Promise<AdminSeedResult> {
  if (!config) return 'skipped';
  const roles = await rows<RoleRow>(
    tx,
    "SELECT * FROM roles WHERE code IN ('user','admin') AND is_system AND is_active",
  );
  if (roles.length !== 2)
    throw new SeedConfigurationError(
      'Active system user/admin roles are required for admin seeding.',
    );
  const [existing] = await rows<UserRow>(
    tx,
    'SELECT * FROM users WHERE lower(email)=$1 FOR UPDATE',
    [config.email],
  );
  if (existing) {
    // Never undo suspension, password rotation or an intentional role revocation on startup.
    const [trusted] = await rows<{ exists: boolean }>(
      tx,
      `SELECT EXISTS(
      SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 AND r.code='admin' AND r.is_system
      UNION ALL SELECT 1 FROM audit_logs WHERE target_id=$1 AND target_type='users' AND action='operator.admin_seeded'
    ) AS exists`,
      [existing.id],
    );
    if (!trusted.exists)
      throw new SeedConfigurationError(
        'ADMIN_EMAIL belongs to an existing non-admin account; seed refuses to change its credentials or privileges.',
      );
    return 'preserved';
  }
  const passwordHash = await argon2.hash(config.password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  const id = randomUUID();
  await tx.query(
    `INSERT INTO users(id,email,password_hash,full_name,status,email_verified_at)
    VALUES($1,$2,$3,$4,'active',now())`,
    [id, config.email, passwordHash, config.fullName],
  );
  for (const role of roles)
    await tx.query('INSERT INTO user_roles(user_id,role_id) VALUES($1,$2)', [
      id,
      role.id,
    ]);
  await new SecurityService(db).audit(tx, null, 'operator.admin_seeded', 'users', id, {
    source: 'environment',
    roles: ['user', 'admin'],
  });
  return 'created';
}

export async function seedAuthRbac(db: DataSource) {
  const config = adminConfig();
  return db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(1791840000)');
    const initialRoles = new Set<string>();
    for (const code of ['user', 'admin', 'super_admin']) {
      const inserted = await rows<RoleRow>(
        tx,
        `INSERT INTO roles(id,code,name,is_system,is_default) VALUES($1,$2,$2,true,$3) ON CONFLICT(code) DO NOTHING RETURNING *`,
        [randomUUID(), code, code === 'user'],
      );
      if (inserted.length) initialRoles.add(code);
    }
    for (const code of CATALOG) {
      const [resource, action] = code.split(':');
      await tx.query(
        'INSERT INTO permissions(id,code,resource,action,name,is_system) VALUES($1,$2,$3,$4,$2,true) ON CONFLICT(code) DO NOTHING',
        [randomUUID(), code, resource, action],
      );
    }
    for (const code of initialRoles) {
      if (code === 'super_admin') continue;
      await tx.query(
        `INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
        WHERE r.code=$1 AND p.code=ANY($2::text[]) AND ($1='admin' OR p.code IN ('profile:read','profile:update')) ON CONFLICT DO NOTHING`,
        [code, [...CATALOG]],
      );
    }
    return { admin: await seedAdmin(tx, config, db) };
  });
}
