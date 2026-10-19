import type { AuthTokens, AuthUser } from "../api/types"
import {
  PORTAL_NAMESPACE,
  PORTAL_VERSION,
  type PortalEventSource,
  type PortalInitPayload,
  type PortalMessageEnvelope,
} from "./bridge"

export interface PortalEventMap {
  ready: {
    locale: "en" | "vi"
    screen: string
    authStatus: "loading" | "guest" | "authenticated" | "required"
    user: AuthUser | null
    muted: boolean
    paused: boolean
  }
  score: {
    mode: "standard-quick"
    population: number
    personalBest: number
  }
  screenChange: {
    screen: string
    replayId?: string
  }
  localeChange: {
    locale: "en" | "vi"
  }
  authState: {
    status: "loading" | "guest" | "authenticated" | "required"
    user: AuthUser | null
  }
  saveState: {
    standardQuickBest: number
    assistQuickBest: number
    runs: number
    builderXP: number
  }
  audioChange: {
    muted: boolean
  }
  lifecycleChange: {
    paused: boolean
    muted: boolean
  }
  checkpointAck: {
    ok: boolean
  }
  pong: {
    timestamp: number
  }
}

export interface PortalClientOptions {
  targetOrigin?: string
  eventSource?: PortalEventSource
}

export interface CityBloxxPortalClient {
  init(config: PortalInitPayload): void
  pause(): void
  resume(): void
  setMuted(muted: boolean): void
  setLocale(locale: "en" | "vi"): void
  navigate(screen: string, replayId?: string): void
  setAuth(tokens: AuthTokens, expiresAt?: number): void
  setGuest(): void
  checkpoint(timeoutMs?: number): Promise<boolean>
  ping(timeoutMs?: number): Promise<number>
  on<K extends keyof PortalEventMap>(
    event: K,
    listener: (payload: PortalEventMap[K]) => void,
  ): () => void
  dispose(): void
}

export function createCityBloxxPortalClient(
  iframe: Pick<HTMLIFrameElement, "contentWindow">,
  options: PortalClientOptions = {},
): CityBloxxPortalClient {
  const targetOrigin = options.targetOrigin?.trim() || "*"
  const eventSource: PortalEventSource | undefined =
    options.eventSource ?? (typeof window !== "undefined" ? (window as unknown as PortalEventSource) : undefined)
  const listeners = new Map<keyof PortalEventMap, Set<(payload: unknown) => void>>()
  const pendingRequests = new Map<
    string,
    { resolve: (payload: unknown) => void; timer: ReturnType<typeof setTimeout> }
  >()
  let reqSeq = 0

  const post = (type: string, payload?: unknown, requestId?: string) => {
    const win = iframe.contentWindow
    if (!win) return
    const envelope: PortalMessageEnvelope = {
      namespace: PORTAL_NAMESPACE,
      version: PORTAL_VERSION,
      type,
      ...(payload !== undefined ? { payload } : {}),
      ...(requestId !== undefined ? { requestId } : {}),
    }
    win.postMessage(envelope, targetOrigin)
  }

  const handleMessage = (event: MessageEvent) => {
    if (iframe.contentWindow && event.source && event.source !== iframe.contentWindow) return
    if (targetOrigin !== "*" && event.origin !== targetOrigin) return
    const data = event.data as Partial<PortalMessageEnvelope> | null
    if (!data || typeof data !== "object") return
    if (data.namespace !== PORTAL_NAMESPACE || data.version !== PORTAL_VERSION) return

    const eventType = data.type as keyof PortalEventMap
    if (data.requestId && pendingRequests.has(data.requestId)) {
      const pending = pendingRequests.get(data.requestId)!
      clearTimeout(pending.timer)
      pendingRequests.delete(data.requestId)
      pending.resolve(data.payload)
    }

    const group = listeners.get(eventType)
    if (group) {
      group.forEach((cb) => cb(data.payload))
    }
  }

  eventSource?.addEventListener("message", handleMessage)

  return {
    init(config) {
      post("init", config)
    },
    pause() {
      post("pause")
    },
    resume() {
      post("resume")
    },
    setMuted(muted) {
      post("setAudio", { muted: Boolean(muted) })
    },
    setLocale(locale) {
      post("setLocale", { locale })
    },
    navigate(screen, replayId) {
      post("navigate", { screen, ...(replayId ? { replayId } : {}) })
    },
    setAuth(tokens, expiresAt) {
      post("setAuth", { tokens, ...(expiresAt !== undefined ? { expiresAt } : {}) })
    },
    setGuest() {
      post("setAuth", { guest: true })
    },
    checkpoint(timeoutMs = 2000) {
      const requestId = `cp-${++reqSeq}`
      return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          pendingRequests.delete(requestId)
          resolve(false)
        }, timeoutMs)
        pendingRequests.set(requestId, {
          timer,
          resolve: (payload) => {
            const body = payload as { ok?: boolean } | undefined
            resolve(Boolean(body?.ok))
          },
        })
        post("checkpoint", undefined, requestId)
      })
    },
    ping(timeoutMs = 2000) {
      const requestId = `ping-${++reqSeq}`
      return new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingRequests.delete(requestId)
          reject(new Error("Portal ping timeout"))
        }, timeoutMs)
        pendingRequests.set(requestId, {
          timer,
          resolve: (payload) => {
            const body = payload as { timestamp?: number } | undefined
            resolve(Number(body?.timestamp ?? Date.now()))
          },
        })
        post("ping", undefined, requestId)
      })
    },
    on(event, listener) {
      let group = listeners.get(event)
      if (!group) {
        group = new Set()
        listeners.set(event, group)
      }
      const wrapped = listener as (payload: unknown) => void
      group.add(wrapped)
      return () => {
        group?.delete(wrapped)
      }
    },
    dispose() {
      eventSource?.removeEventListener("message", handleMessage)
      pendingRequests.forEach((item) => clearTimeout(item.timer))
      pendingRequests.clear()
      listeners.clear()
    },
  }
}
