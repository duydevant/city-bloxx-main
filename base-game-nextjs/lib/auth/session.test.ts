import { describe, it, expect, vi } from "vitest"
import { AUTH_CONTROL_KEY, AuthSession, type AuthEnvironment } from "./session"
import { ApiError, requestJson } from "../api/api-client"
import type { AuthTokens } from "../api/types"

function tokens(user = "A", n = 1): AuthTokens {
  return {
    accessToken: `access-${user}-${n}`,
    tokenType: "Bearer",
    expiresIn: 900,
    user: {
      id: user,
      email: `${user}@example.test`,
      username: null,
      fullName: null,
      avatarUrl: null,
      status: "active",
      emailVerifiedAt: "2026-10-15",
      createdAt: "2026-10-15",
      roles: [],
      permissions: [],
    },
  }
}
function world() {
  const storage = new Map<string, string>(),
    peers = new Map<number, (message: unknown) => void>(),
    posted: unknown[] = []
  let queue = Promise.resolve(),
    clock = 100000,
    count = 0,
    next = 0
  const api = vi.fn(async (path: string,options?:RequestInit) => {
    void options
    if (path === "/auth/login" || path === "/auth/refresh") return tokens("A", ++count)
    return tokens().user
  })
  const sessions: AuthSession[] = []
  function tab(options: { locks?: boolean; storage?: boolean } = {}) {
    const id = ++next
    const env: AuthEnvironment = {
      request: api as unknown as typeof requestJson,
      storage: {
        getItem: (key) => {
          if (options.storage === false) throw Error("blocked")
          return storage.get(key) ?? null
        },
        setItem: (key, value) => {
          if (options.storage === false) throw Error("blocked")
          storage.set(key, value)
        },
      },
      lock:
        options.locks === false
          ? null
          : (work) => {
              const result = queue.then(work)
              queue = result.then(
                () => {},
                () => {},
              )
              return result
            },
      now: () => clock,
      post: (message) => {
        posted.push(message)
        for (const [peer, listener] of peers) if (peer !== id) queueMicrotask(() => listener(message))
      },
      listen: (listener) => {
        peers.set(id, listener)
        return () => {
          peers.delete(id)
        }
      },
      wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
      schedule: () => () => {},
    }
    const session = new AuthSession(env)
    sessions.push(session)
    return session
  }
  return {
    storage,
    api,
    tab,
    posted,
    advance: (ms: number) => {
      clock += ms
    },
    dispose: () => sessions.forEach((session) => session.dispose()),
  }
}
describe("W1.2 cookie refresh coordination", () => {
  it("uses cookie-only logout after access expiry, and refreshes before logout-all",async()=>{
    const w=world(),a=w.tab()
    try{
      await a.login("a","password");w.advance(901000);await a.logout()
      expect(w.api.mock.calls.map(([p])=>p)).toEqual(["/auth/login","/auth/logout"])
      expect(w.api.mock.calls[1][1]?.headers).toBeUndefined()
      await a.login("a","password");w.advance(901000);await a.logout(true)
      expect(w.api.mock.calls.slice(-2).map(([p])=>p)).toEqual(["/auth/refresh","/auth/logout-all"])
    }finally{w.dispose()}
  })
  it("keeps standalone/offline preview Guest after a known missing backend response", async () => {
    const w = world(),
      a = w.tab()
    try {
      w.api.mockRejectedValueOnce(new ApiError("unavailable", 404))
      await a.refresh()
      const b = w.tab()
      await b.refresh()
      expect(a.snapshot().status).toBe("guest")
      expect(b.snapshot().status).toBe("guest")
      expect(w.api).toHaveBeenCalledTimes(1)
    } finally {
      w.dispose()
    }
  })
  it("boot refresh is single-flight within a tab and shared between two tabs under the lock", async () => {
    const w = world(),
      a = w.tab(),
      b = w.tab()
    try {
      await Promise.all([a.refresh(), a.refresh(), b.refresh()])
      expect(w.api.mock.calls.filter(([p]) => p === "/auth/refresh")).toHaveLength(1)
      expect(a.snapshot().user?.id).toBe("A")
      expect(b.snapshot().user?.id).toBe("A")
      expect([...w.storage.values()].join()).not.toContain("access-")
      expect(a.snapshot()).not.toHaveProperty("accessToken")
    } finally {
      w.dispose()
    }
  })
  it("expires and rotates once while two tabs make concurrent refresh requests", async () => {
    const w = world(),
      a = w.tab(),
      b = w.tab()
    try {
      await a.login("a", "password")
      await new Promise((r) => setTimeout(r, 0))
      w.advance(901000)
      await Promise.all([a.refresh(), b.refresh()])
      expect(w.api.mock.calls.filter(([p]) => p === "/auth/refresh")).toHaveLength(1)
    } finally {
      w.dispose()
    }
  })
  it("lost refresh response blocks every tab and a reloaded tab until explicit login", async () => {
    const w = world(),
      a = w.tab(),
      b = w.tab()
    try {
      w.api.mockRejectedValueOnce(new ApiError("network"))
      await Promise.all([a.refresh(), b.refresh()])
      const reloaded = w.tab()
      await reloaded.refresh()
      expect(w.api).toHaveBeenCalledTimes(1)
      expect(JSON.parse(w.storage.get(AUTH_CONTROL_KEY)!).blocked).toBe(true)
      await reloaded.login("a", "password")
      expect(reloaded.snapshot().status).toBe("authenticated")
      expect(JSON.parse(w.storage.get(AUTH_CONTROL_KEY)!).blocked).toBe(false)
    } finally {
      w.dispose()
    }
  })
  it("does not refresh without Web Locks and allows an explicit memory-only login", async () => {
    const w = world(),
      a = w.tab({ locks: false })
    try {
      await a.refresh()
      expect(w.api).not.toHaveBeenCalled()
      await a.login("a", "password")
      expect(a.snapshot().status).toBe("authenticated")
      w.advance(901000)
      await expect(a.request("/auth/me")).rejects.toThrow()
      expect(w.api).toHaveBeenCalledTimes(1)
    } finally {
      w.dispose()
    }
  })
  it("does not consume a refresh cookie when durable crash metadata is unavailable", async () => {
    const w = world(),
      a = w.tab({ storage: false })
    try {
      await a.refresh()
      expect(w.api).not.toHaveBeenCalled()
      await a.login("a", "password")
      expect(a.snapshot().status).toBe("authenticated")
    } finally {
      w.dispose()
    }
  })
  it("logout broadcasts and remains Guest after reload, with no automatic refresh", async () => {
    const w = world(),
      a = w.tab(),
      b = w.tab()
    try {
      await a.login("a", "password")
      await a.logout()
      await new Promise((r) => setTimeout(r, 0))
      expect(b.snapshot().status).toBe("guest")
      const reload = w.tab()
      await reload.refresh()
      expect(reload.snapshot().status).toBe("guest")
      expect(w.api.mock.calls.filter(([p]) => p === "/auth/refresh")).toHaveLength(0)
    } finally {
      w.dispose()
    }
  })
  it("does not retry an ambiguous logout and does not restore its cookie on reload", async () => {
    const w = world(),
      a = w.tab()
    try {
      await a.login("a", "password")
      w.api.mockRejectedValueOnce(new ApiError("network"))
      await expect(a.logout()).rejects.toThrow("network")
      await w.tab().refresh()
      expect(w.api).toHaveBeenCalledTimes(2)
      expect(a.snapshot().status).toBe("guest")
    } finally {
      w.dispose()
    }
  })
  it("retries a 401 once with a refreshed token, without navigation", async () => {
    const w = world(),
      a = w.tab()
    try {
      await a.login("a", "password")
      w.api.mockRejectedValueOnce(new ApiError("expired", 401))
      await a.request("/auth/me")
      expect(w.api.mock.calls.map(([p]) => p)).toEqual([
        "/auth/login",
        "/auth/me",
        "/auth/refresh",
        "/auth/me",
      ])
    } finally {
      w.dispose()
    }
  })
  it("suspension/expired refresh drops authenticated state without a redirect or another retry", async () => {
    const w = world(),
      a = w.tab()
    try {
      await a.login("a", "password")
      w.api.mockRejectedValueOnce(new ApiError("expired", 401))
      w.api.mockRejectedValueOnce(new ApiError("expired", 401))
      await expect(a.request("/auth/me")).rejects.toThrow()
      expect(a.snapshot().status).toBe("required")
      expect(w.api).toHaveBeenCalledTimes(3)
    } finally {
      w.dispose()
    }
  })
  it("never replays an account A request with account B after refresh", async () => {
    const w = world(),
      a = w.tab()
    try {
      await a.login("a", "password")
      w.api.mockRejectedValueOnce(new ApiError("expired", 401))
      w.api.mockResolvedValueOnce(tokens("B", 2))
      await expect(a.request("/users/me", { method: "PATCH" })).rejects.toThrow()
      expect(w.api).toHaveBeenCalledTimes(3)
      expect(a.snapshot().user?.id).toBe("B")
    } finally {
      w.dispose()
    }
  })
  it("ignores delayed token broadcasts from before logout", async () => {
    const w = world(),
      a = w.tab(),
      b = w.tab()
    try {
      await a.login("a", "password")
      const stale = w.posted.find((m) => (m as { type: string }).type === "session")
      await a.logout()
      ;(b as unknown as { receive: (m: unknown) => void }).receive(stale)
      expect(b.snapshot().status).toBe("guest")
    } finally {
      w.dispose()
    }
  })
  it("invalid/failed login never leaves a cached authenticated identity", async () => {
    const w = world(),
      a = w.tab()
    try {
      w.api.mockRejectedValueOnce(new ApiError("expired", 401))
      await expect(a.login("a", "bad")).rejects.toThrow()
      expect(a.snapshot().user).toBeNull()
    } finally {
      w.dispose()
    }
  })
})
