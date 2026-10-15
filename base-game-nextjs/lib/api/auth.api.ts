import { requestJson } from "./api-client"
import type { AuthUser } from "./types"
export const registerApi = (email: string, password: string, fullName: string) =>
  requestJson<AuthUser>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, ...(fullName ? { fullName } : {}) }),
  })
export const emailApi = (kind: "forgot-password" | "resend-verification", email: string) =>
  requestJson(`/auth/${kind}`, { method: "POST", body: JSON.stringify({ email }) })
export const verifyApi = (token: string) =>
  requestJson("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) })
export const resetApi = (token: string, password: string) =>
  requestJson("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) })
