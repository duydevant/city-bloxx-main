export type AuthIssue =
  | "network"
  | "invalid"
  | "forbidden"
  | "conflict"
  | "rate"
  | "unavailable"
  | "expired"
  | "uncertain"
  | "unsupported"
  | "account-changed"
export class ApiError extends Error {
  constructor(
    readonly issue: AuthIssue,
    readonly status = 0,
    readonly retryAfter?: number,
  ) {
    super(issue)
  }
}
// Credentials only go to the same-origin gateway, never an absolute API env.
export async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!/^\/(auth|users\/me)(\/|$)/.test(path)) throw new ApiError("invalid")
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(`/api/v1${path}`, {
      ...options,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...options.headers },
    })
    if (!response.ok) {
      const issue =
        response.status === 401
          ? "expired"
          : response.status === 403
            ? "forbidden"
            : response.status === 409
              ? "conflict"
              : response.status === 429
                ? "rate"
                : response.status >= 500 || response.status === 404
                  ? "unavailable"
                  : "invalid"
      const retry = Number(response.headers.get("Retry-After"))
      throw new ApiError(issue, response.status, Number.isFinite(retry) && retry > 0 ? retry : undefined)
    }
    const body = await response.json()
    if (body?.success !== true || !("data" in body)) throw new ApiError("unavailable")
    return body.data as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError("network")
  } finally {
    clearTimeout(timer)
  }
}
