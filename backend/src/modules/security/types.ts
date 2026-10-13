import { Request } from 'express';
import { EntityManager } from 'typeorm';

export interface UserRow {
  id: string;
  email: string;
  username: string | null;
  password_hash: string;
  full_name: string | null;
  avatar_url: string | null;
  status: string;
  email_verified_at: Date | null;
  last_login_at: Date | null;
  token_version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
export interface RoleRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_default: boolean;
  is_active: boolean;
}
export interface PermissionRow {
  id: string;
  code: string;
  resource: string;
  action: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
}
export interface SessionRow {
  id: string;
  user_id: string;
  expires_at: Date;
  revoked_at: Date | null;
  device_name: string | null;
  user_agent: string;
  ip_address: string;
  created_at: Date;
  last_used_at: Date | null;
}
export interface TokenRow {
  id: string;
  user_id: string;
  session_id: string;
  family_id: string;
  expires_at: Date;
  used_at: Date | null;
  revoked_at: Date | null;
  consumed_at: Date | null;
}
export interface Actor {
  userId: string;
  sessionId: string;
  version: number;
  ip?: string;
}
export interface AuthRequest extends Request {
  actor?: Actor;
}
export async function rows<T>(
  db: EntityManager,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return db.query(sql, params);
}
export const CATALOG = [
  'profile:read',
  'profile:update',
  'users:create',
  'users:read',
  'users:update',
  'users:delete',
  'users:update_status',
  'users:assign_roles',
  'roles:create',
  'roles:read',
  'roles:update',
  'roles:delete',
  'roles:assign_permissions',
  'permissions:read',
  'permissions:manage',
  'sessions:read',
  'sessions:revoke',
  'audit_logs:read',
] as const;
