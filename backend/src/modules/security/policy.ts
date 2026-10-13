import { SetMetadata } from '@nestjs/common';

export const Public = () => SetMetadata('auth:public', true);
export const RequireAllPermissions = (...permissions: string[]) =>
  SetMetadata('auth:permissions', { permissions, mode: 'all' });
export const RequireAnyPermissions = (...permissions: string[]) =>
  SetMetadata('auth:permissions', { permissions, mode: 'any' });
export const CookieMutation = () => SetMetadata('auth:cookie', true);
