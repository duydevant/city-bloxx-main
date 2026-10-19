export enum Routes {
  HOME = "/", PLAY = "/play", EMBED = "/embed", BUILD_CITY_GUIDE = "/guide/build-city", PROFILE = "/profile",
  SIGN_IN = "/sign-in", SIGN_UP = "/sign-up",
}
// Profile also shows Guest/local progress; authentication is checked per account action.
export const PROTECTED_ROUTES: readonly Routes[] = []
export enum ApiRoutes {
  AUTH_LOGIN = "/auth/login", AUTH_REGISTER = "/auth/register", AUTH_REFRESH = "/auth/refresh", AUTH_PROFILE = "/auth/me",
}
