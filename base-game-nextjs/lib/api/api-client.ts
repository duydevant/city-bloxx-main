import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios"
import { refreshTokenApi } from "@/lib/api/auth.api"
import { ApiRoutes } from "@/lib/routes"

// Endpoints whose own 401 response must never trigger the refresh/redirect
// flow below — a failed login/register/refresh call is not an "expired
// session", it's the auth attempt itself failing.
const AUTH_ENDPOINTS_EXCLUDED_FROM_REFRESH: readonly string[] = [
  ApiRoutes.AUTH_LOGIN,
  ApiRoutes.AUTH_REGISTER,
  ApiRoutes.AUTH_REFRESH,
]

function getStoredTokens(): { accessToken: string | null; refreshToken: string | null } {
  if (typeof window === "undefined") return { accessToken: null, refreshToken: null }
  try {
    const raw = localStorage.getItem("auth-storage")
    if (!raw) return { accessToken: null, refreshToken: null }
    const parsed = JSON.parse(raw)
    return {
      accessToken: parsed?.state?.accessToken ?? null,
      refreshToken: parsed?.state?.refreshToken ?? null,
    }
  } catch {
    return { accessToken: null, refreshToken: null }
  }
}

function saveTokensToStorage(accessToken: string, refreshToken: string) {
  if (typeof window === "undefined") return
  try {
    const raw = localStorage.getItem("auth-storage")
    const parsed = raw ? JSON.parse(raw) : { state: {} }
    parsed.state.accessToken = accessToken
    parsed.state.refreshToken = refreshToken
    localStorage.setItem("auth-storage", JSON.stringify(parsed))
  } catch (error) {
    console.warn("[auth] Failed to persist tokens to localStorage:", error)
  }
}

function clearStorage() {
  if (typeof window === "undefined") return
  localStorage.removeItem("auth-storage")
}

// TODO: đổi NEXT_PUBLIC_API_BASE_URL trong .env khi có BE thật.
export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
})

apiClient.interceptors.request.use((config) => {
  const { accessToken } = getStoredTokens()
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

let isRefreshing = false
let pendingQueue: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

function processPendingQueue(error: unknown, token: string | null) {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error)
    } else {
      resolve(token!)
    }
  })
  pendingQueue = []
}

interface RetryableRequest extends InternalAxiosRequestConfig {
  _retry?: boolean
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequest | undefined

    const isExcludedAuthEndpoint = Boolean(
      originalRequest?.url &&
        AUTH_ENDPOINTS_EXCLUDED_FROM_REFRESH.some((endpoint) => originalRequest.url!.includes(endpoint))
    )

    // Only attempt refresh on 401 errors that haven't been retried yet,
    // and never for the auth endpoints themselves (see comment above).
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isExcludedAuthEndpoint
    ) {
      if (isRefreshing) {
        // Queue this request until the ongoing refresh completes
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject })
        }).then((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`
          return apiClient(originalRequest)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const { refreshToken } = getStoredTokens()

        if (!refreshToken) {
          throw new Error("No refresh token available")
        }

        const tokens = await refreshTokenApi(refreshToken)

        saveTokensToStorage(tokens.accessToken, tokens.refreshToken)
        processPendingQueue(null, tokens.accessToken)

        originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`
        return apiClient(originalRequest)
      } catch (refreshError) {
        processPendingQueue(refreshError, null)
        clearStorage()
        if (typeof window !== "undefined") {
          // A hard redirect is intentional here: this interceptor runs outside React.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = "/sign-in"
        }
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)
