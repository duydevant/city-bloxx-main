import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { typeormOptions } from './config/typeorm-options';
import { seedAuthRbac, SeedConfigurationError } from './database/seed';
import { SecurityService } from './modules/security/security.service';
import { RoleRow, rows, UserRow } from './modules/security/types';

async function main() {
  const db = new DataSource(typeormOptions);
  await db.initialize();
  try {
    const command = process.argv[2];
    if (command === 'migrate') await db.runMigrations({ transaction: 'all' });
    else if (command === 'seed' || command === 'seed-admin') {
      if (command === 'seed-admin' && !process.env.ADMIN_EMAIL?.trim())
        throw new SeedConfigurationError(
          'Set ADMIN_EMAIL and ADMIN_PASSWORD before running seed-admin.',
        );
      const result = await seedAuthRbac(db);
      console.log(`Admin account seed: ${result.admin}`);
    } else if (command === 'bootstrap-super-admin') {
      let input = '';
      for await (const chunk of process.stdin) {
        input += String(chunk);
        if (input.length > 10000) throw new Error('Input too large');
      }
      const credentials = JSON.parse(input) as { email: string; password: string };
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials.email) ||
        credentials.password?.length < 12 ||
        credentials.password?.length > 128
      )
        throw new Error('Valid email and password (12–128 chars) required on stdin');
      const hash = await argon2.hash(credentials.password, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      });
      await db.transaction(async (tx) => {
        const sec = new SecurityService(db);
        await sec.lockAdmin(tx);
        const [role] = await rows<RoleRow>(
          tx,
          `SELECT * FROM roles WHERE code='super_admin' AND is_system AND is_active`,
        );
        if (!role) throw new Error('Run seed first');
        const existing = await rows<UserRow>(
          tx,
          'SELECT * FROM users WHERE lower(email)=$1',
          [credentials.email.trim().toLowerCase()],
        );
        if (existing.length)
          throw new Error(
            'Account exists; bootstrap does not alter credentials or assignments',
          );
        const id = randomUUID();
        await tx.query(
          `INSERT INTO users(id,email,password_hash,status,email_verified_at) VALUES($1,$2,$3,'active',now())`,
          [id, credentials.email.trim().toLowerCase(), hash],
        );
        await tx.query('INSERT INTO user_roles(user_id,role_id) VALUES($1,$2)', [
          id,
          role.id,
        ]);
        await sec.audit(tx, null, 'operator.super_admin_bootstrapped', 'users', id);
      });
    } else
      throw new Error(
        'Usage: cli migrate|seed|seed-admin|bootstrap-super-admin (bootstrap credentials JSON on stdin)',
      );
    console.log(`Completed ${command}`);
  } finally {
    await db.destroy();
  }
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof SeedConfigurationError
      ? error.message
      : 'Command failed; verify configuration, schema and input. Secrets are not logged.',
  );
  process.exitCode = 1;
});
