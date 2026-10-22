import { browserAuth } from "../auth/session"
import { ApiError } from "../api/api-client"
import { CloudCoordinator } from "./coordinator"
import { guestRaw, GUEST_SAVE_KEY } from "./guest"
import { IndexedCloudStorage } from "./storage"

export const ACTIVE_OWNER_KEY = "city-bloxx.active-save-owner.v1"
let singleton: CloudCoordinator | undefined
let checkpoint: (() => Promise<boolean>) | null = null
let approvedChange: "login" | "logout" | null = null
let localDrain = Promise.resolve()
export const waitLocalDrain = () => localDrain
export function trackLocalDrain(work: Promise<void>) {
  localDrain = work.catch(() => {})
}
export function registerCheckpoint(work: () => Promise<boolean>) {
  checkpoint = work
  return () => {
    if (checkpoint === work) checkpoint = null
  }
}
export async function checkpointProgress() {
  return (
    !checkpoint ||
    (await checkpoint()) ||
    ["peer", "conflict", "review", "storage", "incompatible"].includes(singleton?.snapshot().status ?? "")
  )
}
export async function prepareIdentityChange(kind: "login" | "logout" = "login") {
  if (!(await checkpointProgress())) throw new Error("storage")
  approvedChange = kind
}
export function cancelIdentityChange() {
  approvedChange = null
}
export function browserCloud() {
  if (singleton) return singleton
  const auth = browserAuth(),
    storage = new IndexedCloudStorage()
  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel("city-bloxx-cloud")
  } catch {}
  const cloud = new CloudCoordinator({
    storage,
    guest: { read: guestRaw, write: (raw) => localStorage.setItem(GUEST_SAVE_KEY, raw) },
    request: async <T>(owner: string, path: string, options?: RequestInit) => {
      if (auth.snapshot().user?.id !== owner) throw new ApiError("account-changed")
      const result = await auth.request<T>(path, options)
      if (auth.snapshot().user?.id !== owner) throw new ApiError("account-changed")
      return result
    },
    pause: checkpointProgress,
    uuid: () => crypto.randomUUID(),
    now: () => Date.now(),
    online: () => navigator.onLine,
    schedule: (work, ms) => {
      const timer = setTimeout(work, ms)
      return () => clearTimeout(timer)
    },
    post: (owner, version) => channel?.postMessage({ owner, version }),
    lock: async (owner, work) =>
      navigator.locks ? navigator.locks.request(`city-bloxx-cloud:${owner}`, work) : work(),
  })
  singleton = cloud
  channel?.addEventListener("message", (event) => {
    const message = event.data
    if (typeof message?.owner === "string" && typeof message?.version === "string")
      void cloud.peer(message.owner, message.version).catch(() => {})
  })
  let previous = ""
  const isEmbedRoute = () =>
    typeof window !== "undefined" && window.location.pathname.startsWith("/embed")
  const identity = () => {
    const state = auth.snapshot()
    if (state.status === "loading") return
    const embed = isEmbedRoute()
    let remembered: string | null = null
    try {
      remembered = localStorage.getItem(ACTIVE_OWNER_KEY)
    } catch {}
    if (remembered && !/^[a-f0-9-]{36}$/i.test(remembered)) remembered = null
    const owner =
      state.user?.id ?? (!embed && state.issue && remembered ? remembered : "guest")
    const authenticated = state.status === "authenticated" && state.user?.id === owner
    const key = `${owner}:${authenticated}`
    if (key === previous) return
    previous = key
    // An initial Guest restore may complete while login waits for the auth lock.
    // It must not consume the user's confirmation for the authenticated identity.
    const approved =
      embed ||
      (approvedChange === "login" && authenticated) ||
      (approvedChange === "logout" && owner === "guest" && state.issue === null)
    if (approved && !embed) approvedChange = null
    void cloud.identity(owner, authenticated, approved).catch(() => {})
  }
  let autoResolving = false
  cloud.subscribe(() => {
    const snap = cloud.snapshot()
    const scope = snap.scope
    if (scope && snap.status !== "review") {
      try {
        if (scope === "guest") localStorage.removeItem(ACTIVE_OWNER_KEY)
        else localStorage.setItem(ACTIVE_OWNER_KEY, scope)
      } catch {}
    }
    if (isEmbedRoute() && snap.locked && !autoResolving) {
      if (snap.status === "review") {
        autoResolving = true
        void cloud.acceptIdentity().finally(() => {
          autoResolving = false
        })
      } else if (snap.status === "peer") {
        autoResolving = true
        void cloud.reloadLocal().finally(() => {
          autoResolving = false
        })
      } else if (snap.ready) {
        cloud.continueLocal()
      } else if (snap.status !== "loading") {
        autoResolving = true
        previous = "guest:false"
        void cloud.identity("guest", false, true).finally(() => {
          autoResolving = false
        })
      }
    }
  })
  auth.subscribe(identity)
  identity()
  window.addEventListener("online", () => {
    void cloud.retry()
  })
  window.addEventListener("offline", () => {
    void cloud.flush()
  })
  window.addEventListener("focus", () => {
    void cloud.reconcile()
  })
  window.addEventListener("pagehide", () => {
    void checkpointProgress().then(() => cloud.flush())
  })
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) void checkpointProgress().then(() => cloud.flush())
  })
  return cloud
}
