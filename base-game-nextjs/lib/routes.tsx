export enum Routes {
  HOME = "/",
  PLAY = "/play",
  BUILD_CITY_GUIDE = "/guide/build-city",
  PROFILE = "/profile",
  SIGN_IN = "/sign-in",
  SIGN_UP = "/sign-up",
}

export const PROTECTED_ROUTES: readonly Routes[] = [Routes.PROFILE] as const

/** TODO: thêm endpoint thật khi nối BE. Giữ pattern enum để lib/api/api-client.ts tham chiếu. */
export enum ApiRoutes {
  AUTH_LOGIN = "/auth/login",
  AUTH_REGISTER = "/auth/register",
  AUTH_REFRESH = "/auth/refresh",
  AUTH_PROFILE = "/auth/profile",
}
