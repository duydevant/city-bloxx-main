export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}
