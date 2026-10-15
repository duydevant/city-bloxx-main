export interface AuthUser {
  id: string
  email: string
  username: string | null
  fullName: string | null
  avatarUrl: string | null
  status: string
  emailVerifiedAt: string | null
  createdAt: string
  roles: string[]
  permissions: string[]
}
export interface AuthTokens {
  accessToken: string
  tokenType: "Bearer"
  expiresIn: number
  user: AuthUser
}
