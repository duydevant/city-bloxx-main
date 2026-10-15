export const GAME_SELF_PERMISSIONS = [
  'city_bloxx_profile:read',
  'city_bloxx_profile:update',
  'city_bloxx_save:read',
  'city_bloxx_save:write',
  'city_bloxx_runs:start',
  'city_bloxx_runs:finish',
  'city_bloxx_runs:read',
] as const;
export const GAME_MODERATION_PERMISSIONS = [
  'city_bloxx_moderation:read',
  'city_bloxx_moderation:update',
] as const;
export const GAME_PERMISSIONS = [
  ...GAME_SELF_PERMISSIONS,
  ...GAME_MODERATION_PERMISSIONS,
] as const;
export type GamePermission = (typeof GAME_PERMISSIONS)[number];
