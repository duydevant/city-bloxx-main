import { ApiError, requestJson, type AuthIssue } from "../api/api-client"
import type { AuthTokens, AuthUser } from "../api/types"

export const AUTH_CONTROL_KEY = "city-bloxx.auth-control.v1"
export interface AuthSnapshot {
  status: "loading" | "guest" | "authenticated" | "required"
  user: AuthUser | null
  issue: AuthIssue | null
}
const INITIAL: AuthSnapshot = { status: "loading", user: null, issue: null }
interface Control {
  revision: string
  blocked: boolean
  guest?: boolean
}
export interface AuthEnvironment {
  request: typeof requestJson
  lock: null | (<T>(work: () => Promise<T>) => Promise<T>)
  storage: { getItem(key: string): string | null; setItem(key: string, value: string): void }
  now: () => number
  post: (message: unknown) => void
  listen: (listener: (message: unknown) => void) => () => void
  wait: () => Promise<void>
  schedule: (work: () => void, delay: number) => () => void
}
type SessionMessage =
  | { type: "session"; revision: string; tokens: AuthTokens; expiresAt: number }
  | { type: "clear"; revision: string; guest: boolean }
  | { type: "invalidate" }
  | { type: "ask" }

export class AuthSession {
  private state = INITIAL
  private listeners = new Set<() => void>()
  private token: string | null = null
  private expiresAt = 0
  private refreshMargin = 15000
  private revision = "0"
  private epoch = 0
  private refreshFlight: Promise<void> | null = null
  private initialized = false
  private canRefresh = true
  private stopTimer = () => {}
  private unlisten: () => void
  constructor(private readonly env: AuthEnvironment) {
    this.unlisten = env.listen((message) => this.receive(message))
  }
  snapshot = () => this.state
  serverSnapshot = () => INITIAL
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private emit(state: AuthSnapshot) {
    this.state = state
    this.listeners.forEach((listener) => listener())
  }
  private control(): Control {
    const raw = this.env.storage.getItem(AUTH_CONTROL_KEY)
    if (!raw) return { revision: "0", blocked: false }
    const parsed = JSON.parse(raw) as Control
    if (!/^\d{1,30}$/.test(parsed.revision) || typeof parsed.blocked !== "boolean")
      throw new ApiError("uncertain")
    return parsed
  }
  private write(value: Control) {
    this.env.storage.setItem(AUTH_CONTROL_KEY, JSON.stringify(value))
    this.revision = value.revision
  }
  private begin(): string {
    const revision = String(BigInt(this.control().revision) + BigInt(1))
    // Crash receipt, not a mutex. Web Locks alone serialize cookie operations.
    this.write({ revision, blocked: true })
    return revision
  }
  private valid() {
    return !!this.token && this.expiresAt > this.env.now() + this.refreshMargin
  }
  private clear(issue: AuthIssue | null, guest = false) {
    this.stopTimer()
    this.token = null
    this.expiresAt = 0
    this.epoch++
    this.emit({ status: guest ? "guest" : "required", user: null, issue })
  }
  private accept(tokens: AuthTokens, expiresAt: number, revision: string, login = false) {
    if (
      !tokens?.accessToken ||
      tokens.tokenType !== "Bearer" ||
      !tokens.user?.id ||
      !tokens.user.email ||
      !Number.isFinite(tokens.expiresIn) ||
      tokens.expiresIn <= 0 ||
      tokens.expiresIn > 86400 ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= this.env.now()
    )
      throw new ApiError("unavailable")
    if (login || this.state.user?.id !== tokens.user.id) this.epoch++
    this.token = tokens.accessToken
    this.expiresAt = expiresAt
    this.revision = revision
    this.refreshMargin = Math.min(15000, tokens.expiresIn * 500)
    this.emit({ status: "authenticated", user: tokens.user, issue: null })
    this.stopTimer()
    this.stopTimer = this.env.schedule(
      () => {
        if (this.env.lock && this.canRefresh) void this.refresh(this.token ?? undefined)
        else this.clear("unsupported")
      },
      Math.max(1, expiresAt - this.env.now() - (this.env.lock && this.canRefresh ? this.refreshMargin : 0)),
    )
  }
  private receive(value: unknown) {
    const message = value as SessionMessage
    if (!message || !["ask", "session", "clear", "invalidate"].includes(message.type)) return
    if(message.type==="invalidate"){this.clear("account-changed");return}
    try {
      if (!this.env.lock) {
        if (message.type !== "ask") this.clear("account-changed")
        return
      }
      const control = this.control()
      if (message.type === "ask") {
        if (this.valid() && !control.blocked && this.revision === control.revision && this.state.user) {
          this.env.post({
            type: "session",
            revision: this.revision,
            expiresAt: this.expiresAt,
            tokens: {
              accessToken: this.token,
              tokenType: "Bearer",
              expiresIn: (this.expiresAt - this.env.now()) / 1000,
              user: this.state.user,
            },
          })
        }
      } else if (message.revision === control.revision) {
        if (message.type === "session" && !control.blocked && message.expiresAt > this.env.now())
          this.accept(message.tokens, message.expiresAt, message.revision)
        if (message.type === "clear" && control.blocked) {
          this.revision = message.revision
          this.clear(message.guest ? null : "expired", message.guest)
        }
      }
    } catch {
      /* Unknown/stale peer state cannot enable authenticated actions. */
    }
  }
  initialize() {
    if (this.initialized) return
    this.initialized = true
    void this.refresh()
  }
  refresh(failedToken?: string): Promise<void> {
    if (this.refreshFlight) return this.refreshFlight
    if (!this.env.lock || !this.canRefresh) {
      this.clear("unsupported",this.state.status==="loading")
      return Promise.resolve()
    }
    const initiallyGuest = !this.state.user && this.state.status === "loading"
    this.refreshFlight = this.env
      .lock(async () => {
        let revision: string | undefined
        try {
          let control = this.control()
          if (control.blocked) {
            this.clear(control.guest ? null : "uncertain", !!control.guest)
            return
          }
          if (this.valid() && this.revision === control.revision && this.token !== failedToken) return
          this.env.post({ type: "ask" })
          await this.env.wait()
          control = this.control()
          if (control.blocked) {
            this.clear(control.guest ? null : "uncertain", !!control.guest)
            return
          }
          if (this.valid() && this.revision === control.revision && this.token !== failedToken) return
          revision = this.begin()
          const tokens = await this.env.request<AuthTokens>("/auth/refresh", { method: "POST" })
          const expiresAt = this.env.now() + tokens.expiresIn * 1000
          this.accept(tokens, expiresAt, revision)
          this.write({ revision, blocked: false })
          this.env.post({ type: "session", revision, tokens, expiresAt })
        } catch (error) {
          const issue = error instanceof ApiError ? error.issue : "uncertain"
          this.clear(issue, initiallyGuest)
          const knownGuest =
            initiallyGuest && error instanceof ApiError && [401, 403, 404, 429].includes(error.status)
          if (revision && knownGuest) this.write({ revision, blocked: true, guest: true })
          if (revision) this.env.post({ type: "clear", revision, guest: knownGuest })
        }
      })
      .catch(() => {
        this.clear("unsupported")
      })
      .finally(() => {
        this.refreshFlight = null
      })
    return this.refreshFlight
  }
  async login(email: string, password: string) {
    const work = async () => {
      let revision = this.revision
      try {
        revision = this.begin()
      } catch {
        this.canRefresh = false
      }
      try {
        const tokens = await this.env.request<AuthTokens>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password, deviceName: "City Bloxx Web" }),
        })
        const expiresAt = this.env.now() + tokens.expiresIn * 1000
        this.accept(tokens, expiresAt, revision, true)
        if (this.env.lock && this.canRefresh) {
          this.write({ revision, blocked: false })
          this.env.post({ type: "session", revision, tokens, expiresAt })
        } else this.env.post({ type: "invalidate" })
      } catch (error) {
        this.clear(error instanceof ApiError ? error.issue : "uncertain")
        this.env.post({ type: "clear", revision, guest: false })
        throw error
      }
    }
    await (this.env.lock ? this.env.lock(work) : work())
  }
  async logout(all = false) {
    const owner = this.state.user?.id
    if(all&&!this.valid()){
      await this.refresh()
      if(!owner||this.state.user?.id!==owner||!this.token)throw new ApiError("account-changed")
    }
    const work = async () => {
      if (this.env.lock) {
        this.env.post({ type: "ask" })
        await this.env.wait()
      }
      if (owner && this.state.user?.id !== owner) throw new ApiError("account-changed")
      if (this.env.lock && this.canRefresh && this.control().revision !== this.revision) throw new ApiError("account-changed")
      const token = this.token
      let revision = this.revision
      try {
        revision = this.begin()
      } catch {
        this.canRefresh = false
      }
      try {
        this.write({ revision, blocked: true, guest: true })
      } catch {}
      this.clear(null, true)
      this.env.post(this.canRefresh?{ type: "clear", revision, guest: true }:{type:"invalidate"})
      await this.env.request(all ? "/auth/logout-all" : "/auth/logout", {
        method: "POST",
        ...(all&&token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      })
    }
    await (this.env.lock ? this.env.lock(work) : work())
  }
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const owner = this.state.user?.id,
      epoch = this.epoch
    if (!owner) throw new ApiError("expired")
    if (!this.valid()) await this.refresh()
    if (this.state.user?.id !== owner || this.epoch !== epoch || !this.token)
      throw new ApiError("account-changed")
    const send = () =>
      this.env.request<T>(path, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${this.token}` },
      })
    const token = this.token
    try {
      const result = await send()
      if (this.epoch !== epoch) throw new ApiError("account-changed")
      return result
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error
      await this.refresh(token)
      if (this.state.user?.id !== owner || this.epoch !== epoch || !this.token) throw new ApiError("expired")
      try {
        const result = await send()
        if (this.epoch !== epoch) throw new ApiError("account-changed")
        return result
      } catch (retryError) {
        if (retryError instanceof ApiError && retryError.status === 401) this.clear("expired")
        throw retryError
      }
    }
  }
  async revalidate() {
    if (!this.state.user) return
    const user = await this.request<AuthUser>("/auth/me")
    if (user.id !== this.state.user?.id) throw new ApiError("account-changed")
    this.emit({ ...this.state, user })
  }
  async invalidate() {
    const work = async () => {
      let revision = this.revision
      try {
        revision = this.begin()
      } catch {}
      this.clear("expired")
      this.env.post({ type: "clear", revision, guest: false })
    }
    await (this.env.lock ? this.env.lock(work) : work())
  }
  dispose() {
    this.stopTimer()
    this.unlisten()
    this.listeners.clear()
  }
}

let singleton: AuthSession | undefined
export function browserAuth(): AuthSession {
  if (!singleton) {
    let channel: BroadcastChannel | null = null
    try {
      channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("city-bloxx-auth") : null
    } catch {}
    try {
      localStorage.removeItem("auth-storage")
    } catch {}
    singleton = new AuthSession({
      request: requestJson,
      lock:
        typeof navigator !== "undefined" && navigator.locks
          ? async (work) =>
              await navigator.locks.request("city-bloxx-auth-refresh", { mode: "exclusive" }, work)
          : null,
      storage: {
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
      },
      now: () => Date.now(),
      post: (message) => channel?.postMessage(message),
      listen: (listener) => {
        if (!channel) return () => {}
        const handler = (event: MessageEvent) => listener(event.data)
        channel.addEventListener("message", handler)
        return () => channel.removeEventListener("message", handler)
      },
      wait: () => new Promise((resolve) => setTimeout(resolve, 50)),
      schedule: (work, delay) => {
        const timer = setTimeout(work, delay)
        return () => clearTimeout(timer)
      },
    })
  }
  return singleton
}
