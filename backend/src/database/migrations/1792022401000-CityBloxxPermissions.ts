import { randomUUID } from 'node:crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

// Frozen migration snapshot: future catalog additions must use a new migration.
const SELF = [
  'city_bloxx_profile:read',
  'city_bloxx_profile:update',
  'city_bloxx_save:read',
  'city_bloxx_save:write',
  'city_bloxx_runs:start',
  'city_bloxx_runs:finish',
  'city_bloxx_runs:read',
];
const ALL = [...SELF, 'city_bloxx_moderation:read', 'city_bloxx_moderation:update'];

export class CityBloxxPermissions1792022401000 implements MigrationInterface {
  name = 'CityBloxxPermissions1792022401000';
  async up(q: QueryRunner): Promise<void> {
    // Same lock as auth seed/privilege mutations: never race a role edit or seed.
    await q.query('SELECT pg_advisory_xact_lock(1791840000)');
    for (const code of ALL) {
      const [resource, action] = code.split(':');
      await q.query(
        `INSERT INTO permissions(id,code,resource,action,name,is_system)
        VALUES($1,$2,$3,$4,$2,true) ON CONFLICT(code) DO NOTHING`,
        [randomUUID(), code, resource, action],
      );
      const [permission] = (await q.query('SELECT * FROM permissions WHERE code=$1', [
        code,
      ])) as { resource: string; action: string; is_system: boolean }[];
      if (
        !permission?.is_system ||
        permission.resource !== resource ||
        permission.action !== action
      ) {
        throw new Error(
          'City Bloxx permission code conflicts with a non-system permission',
        );
      }
    }
    const collisions = (await q.query(
      "SELECT id FROM roles WHERE code IN ('user','admin') AND NOT is_system",
    )) as unknown[];
    if (collisions.length)
      throw new Error('City Bloxx grants require system user/admin roles');
    await q.query(
      `INSERT INTO role_permissions(role_id,permission_id)
      SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
      WHERE r.is_system AND r.code IN ('user','admin') AND p.code=ANY($1::text[])
      AND (r.code='admin' OR p.code=ANY($2::text[])) ON CONFLICT DO NOTHING`,
      [ALL, SELF],
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('SELECT pg_advisory_xact_lock(1791840000)');
    await q.query(
      'DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code=ANY($1::text[]) AND is_system)',
      [ALL],
    );
    await q.query('DELETE FROM permissions WHERE code=ANY($1::text[]) AND is_system', [
      ALL,
    ]);
  }
}
