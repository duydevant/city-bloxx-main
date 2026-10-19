import type {
  AudioPort,
  GameSave,
  LifecyclePort,
  ScorePort,
  ScoreSyncState,
} from "../../../packages/city-bloxx-core/src/index"
import { createTowerAudio } from "../../../packages/city-bloxx-renderer/src/audio"
import { sessionScreen, type SessionScreen } from "../../../packages/city-bloxx-renderer/src/session"
import type { AuthTokens, AuthUser } from "../api/types"
import type { AuthSnapshot } from "../auth/session"

export const PORTAL_NAMESPACE = "city-bloxx:portal" as const
export const PORTAL_VERSION = 1 as const

export interface PortalMessageEnvelope<T extends string = string, P = unknown> {
  namespace: typeof PORTAL_NAMESPACE
  version: typeof PORTAL_VERSION
  type: T
  payload?: P
  requestId?: string
}

export interface PortalInitPayload {
  locale?: "en" | "vi"
  muted?: boolean
  paused?: boolean
  screen?: string
  replayId?: string
  tokens?: AuthTokens
  expiresAt?: number
  guest?: boolean
}

export interface PortalQueryConfig {
  locale?: "en" | "vi"
  screen?: SessionScreen
  replayId?: string
  muted: boolean
  showLanguageSwitch: boolean
  showSoundControl: boolean
  parentOrigin: string
}

export function parsePortalQueryConfig(search: URLSearchParams): PortalQueryConfig {
  const rawLang = (search.get("lang") ?? search.get("locale") ?? "").toLowerCase()
  const locale = rawLang === "vi" ? "vi" : rawLang === "en" ? "en" : undefined
  const rawScreen = search.get("screen") ?? search.get("mode")
  const screen = rawScreen ? sessionScreen(rawScreen) : undefined
  const replayId = search.get("replay") ?? undefined
  const muted = search.get("muted") === "1" || search.get("muted") === "true" || search.get("sound") === "0"
  const showLanguageSwitch = search.get("hideLangSwitch") !== "1" && search.get("hideLangSwitch") !== "true"
  const showSoundControl = search.get("hideSoundControl") !== "1" && search.get("hideSoundControl") !== "true"
  const parentOrigin = search.get("parentOrigin")?.trim() || "*"
  return {
    locale,
    screen,
    replayId,
    muted,
    showLanguageSwitch,
    showSoundControl,
    parentOrigin,
  }
}

export interface PortalAudioController extends AudioPort {
  isMuted(): boolean
  setMuted(muted: boolean): void
}

export function createPortalAudio(
  initialMuted = false,
  innerFactory: () => AudioPort = createTowerAudio,
  onChange?: (muted: boolean) => void,
): PortalAudioController {
  const inner = innerFactory()
  let muted = Boolean(initialMuted)
  let disposed = false
  if (muted) inner.suspend()

  return {
    isMuted() {
      return muted
    },
    setMuted(nextMuted: boolean) {
      const normalized = Boolean(nextMuted)
      const changed = muted !== normalized
      muted = normalized
      if (muted) inner.suspend()
      if (changed) onChange?.(muted)
    },
    play(quality: string) {
      if (disposed || muted) return
      inner.play(quality)
    },
    suspend() {
      inner.suspend()
    },
    dispose() {
      disposed = true
      inner.dispose()
    },
  }
}

export interface PortalLifecycleController extends LifecyclePort {
  setHostPaused(paused: boolean): void
  dispose(): void
}

export function createPortalLifecycle(
  initialPaused = false,
  audio?: Pick<AudioPort, "suspend">,
  onChange?: (paused: boolean) => void,
): PortalLifecycleController {
  let hostPaused = Boolean(initialPaused)
  let docHidden = typeof document !== "undefined" ? Boolean(document.hidden) : false
  const pauseListeners = new Set<() => void>()
  const resumeListeners = new Set<() => void>()

  const isEffectivePaused = () => hostPaused || docHidden

  const notifyTransition = (wasPaused: boolean, nowPaused: boolean) => {
    if (wasPaused === nowPaused) return
    if (nowPaused) {
      audio?.suspend()
      pauseListeners.forEach((cb) => cb())
    } else {
      resumeListeners.forEach((cb) => cb())
    }
    onChange?.(nowPaused)
  }

  const onVisibilityChange = () => {
    if (typeof document === "undefined") return
    const prev = isEffectivePaused()
    docHidden = Boolean(document.hidden)
    notifyTransition(prev, isEffectivePaused())
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange)
  }

  return {
    isPaused() {
      return isEffectivePaused()
    },
    setHostPaused(nextPaused: boolean) {
      const prev = isEffectivePaused()
      hostPaused = Boolean(nextPaused)
      notifyTransition(prev, isEffectivePaused())
    },
    onPause(cb: () => void) {
      pauseListeners.add(cb)
      return () => {
        pauseListeners.delete(cb)
      }
    },
    onResume(cb: () => void) {
      resumeListeners.add(cb)
      return () => {
        resumeListeners.delete(cb)
      }
    },
    dispose() {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange)
      }
      pauseListeners.clear()
      resumeListeners.clear()
    },
  }
}

export interface PortalScoreController extends ScorePort {
  reconcileSave(save: GameSave): void
}

export function createPortalScorePort(
  onScore: (payload: { mode: "standard-quick"; population: number; personalBest: number }) => void,
): PortalScoreController {
  let bestScore = 0
  let state: ScoreSyncState = { status: "idle", pendingScore: 0, ackedScore: 0 }
  const listeners = new Set<(state: ScoreSyncState) => void>()

  const emit = (next: ScoreSyncState) => {
    state = next
    listeners.forEach((cb) => cb({ ...state }))
  }

  return {
    reconcileSave(save: GameSave) {
      const savedBest = Number.isFinite(save.standardQuickBest) ? Math.max(0, Math.floor(save.standardQuickBest)) : 0
      if (savedBest > bestScore) {
        bestScore = savedBest
        emit({ status: "synced", pendingScore: 0, ackedScore: bestScore })
      }
    },
    async submitStandardQuick(population: number) {
      if (!Number.isFinite(population)) return
      const normalized = Math.max(0, Math.floor(population))
      if (normalized <= 0) return
      const isNewBest = normalized > bestScore
      if (isNewBest) bestScore = normalized
      onScore({
        mode: "standard-quick",
        population: normalized,
        personalBest: bestScore,
      })
      emit({ status: "synced", pendingScore: 0, ackedScore: bestScore })
    },
    getState() {
      return { ...state }
    },
    onStateChange(cb: (state: ScoreSyncState) => void) {
      listeners.add(cb)
      cb({ ...state })
      return () => {
        listeners.delete(cb)
      }
    },
  }
}

export interface PortalEventSource {
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void
}

export interface PortalBridgeOptions {
  allowedOrigins?: string[]
  targetWindow?: { postMessage(message: unknown, targetOrigin: string): void } | null
  eventSource?: PortalEventSource
  audio: PortalAudioController
  lifecycle: PortalLifecycleController
  getLocale: () => "en" | "vi"
  setLocale: (locale: "en" | "vi") => void
  getScreen: () => SessionScreen
  navigate: (screen: SessionScreen, replayId?: string) => void
  getAuth: () => AuthSnapshot
  adoptAuthSession: (tokens: AuthTokens, expiresAt?: number) => void
  adoptAuthGuest: () => void
  onCheckpoint: () => Promise<void>
}

export interface PortalBridge {
  send<T extends string, P = unknown>(type: T, payload?: P, requestId?: string): void
  notifyReady(): void
  notifyScreenChange(screen: SessionScreen, replayId?: string): void
  notifyLocaleChange(locale: "en" | "vi"): void
  notifyAuthState(snapshot: AuthSnapshot): void
  notifySaveState(save: GameSave): void
  notifyScore(payload: { mode: "standard-quick"; population: number; personalBest: number }): void
  dispose(): void
}

export function isAllowedPortalOrigin(origin: string, allowedOrigins: readonly string[]): boolean {
  if (allowedOrigins.length === 0 || allowedOrigins.includes("*")) return true
  return allowedOrigins.includes(origin)
}

export function createPortalBridge(options: PortalBridgeOptions): PortalBridge {
  const allowedOrigins = (options.allowedOrigins ?? ["*"])
    .map((item) => item.trim())
    .filter(Boolean)
  const targetOrigin =
    allowedOrigins.length === 1 && allowedOrigins[0] !== "*" ? allowedOrigins[0] : "*"

  const resolveTargetWindow = () => {
    if (options.targetWindow !== undefined) return options.targetWindow
    if (typeof window !== "undefined" && window.parent && window.parent !== window) {
      return window.parent
    }
    return null
  }

  const send = <T extends string, P = unknown>(type: T, payload?: P, requestId?: string) => {
    const target = resolveTargetWindow()
    if (!target) return
    const envelope: PortalMessageEnvelope<T, P> = {
      namespace: PORTAL_NAMESPACE,
      version: PORTAL_VERSION,
      type,
      ...(payload !== undefined ? { payload } : {}),
      ...(requestId !== undefined ? { requestId } : {}),
    }
    try {
      target.postMessage(envelope, targetOrigin)
    } catch {
      /* Ignore cross-origin postMessage errors if parent detached */
    }
  }

  const buildReadyPayload = () => {
    const auth = options.getAuth()
    return {
      locale: options.getLocale(),
      screen: options.getScreen(),
      authStatus: auth.status,
      user: auth.user as AuthUser | null,
      muted: options.audio.isMuted(),
      paused: options.lifecycle.isPaused(),
    }
  }

  const handleMessage = (event: MessageEvent) => {
    const data = event.data as Partial<PortalMessageEnvelope> | null
    if (!data || typeof data !== "object") return
    if (data.namespace !== PORTAL_NAMESPACE || data.version !== PORTAL_VERSION) return
    if (!isAllowedPortalOrigin(event.origin, allowedOrigins)) return

    const { type, payload, requestId } = data
    const body = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>

    switch (type) {
      case "init":
      case "config": {
        const init = body as unknown as PortalInitPayload
        if (init.locale === "en" || init.locale === "vi") {
          options.setLocale(init.locale)
        }
        if (typeof init.muted === "boolean") {
          options.audio.setMuted(init.muted)
        }
        if (typeof init.paused === "boolean") {
          options.lifecycle.setHostPaused(init.paused)
        }
        if (init.tokens && typeof init.tokens === "object") {
          try {
            options.adoptAuthSession(init.tokens, init.expiresAt)
          } catch {}
        } else if (init.guest === true) {
          options.adoptAuthGuest()
        }
        if (typeof init.screen === "string") {
          options.navigate(
            sessionScreen(init.screen),
            typeof init.replayId === "string" ? init.replayId : undefined,
          )
        }
        send("ready", buildReadyPayload(), requestId)
        break
      }
      case "pause": {
        options.lifecycle.setHostPaused(true)
        send("lifecycleChange", { paused: options.lifecycle.isPaused(), muted: options.audio.isMuted() }, requestId)
        break
      }
      case "resume": {
        options.lifecycle.setHostPaused(false)
        send("lifecycleChange", { paused: options.lifecycle.isPaused(), muted: options.audio.isMuted() }, requestId)
        break
      }
      case "mute":
      case "setAudio": {
        const nextMuted = typeof body.muted === "boolean" ? body.muted : true
        options.audio.setMuted(nextMuted)
        send("audioChange", { muted: options.audio.isMuted() }, requestId)
        break
      }
      case "unmute": {
        options.audio.setMuted(false)
        send("audioChange", { muted: options.audio.isMuted() }, requestId)
        break
      }
      case "setLocale": {
        const nextLocale = body.locale === "vi" ? "vi" : body.locale === "en" ? "en" : null
        if (nextLocale) {
          options.setLocale(nextLocale)
          send("localeChange", { locale: nextLocale }, requestId)
        }
        break
      }
      case "navigate": {
        const targetScreen = sessionScreen(typeof body.screen === "string" ? body.screen : "quick")
        const replayId = typeof body.replayId === "string" ? body.replayId : undefined
        options.navigate(targetScreen, replayId)
        send("screenChange", { screen: targetScreen, ...(replayId ? { replayId } : {}) }, requestId)
        break
      }
      case "setAuth": {
        if (body.tokens && typeof body.tokens === "object") {
          try {
            options.adoptAuthSession(
              body.tokens as AuthTokens,
              typeof body.expiresAt === "number" ? body.expiresAt : undefined,
            )
          } catch {}
        } else if (body.guest === true) {
          options.adoptAuthGuest()
        }
        const auth = options.getAuth()
        send("authState", { status: auth.status, user: auth.user }, requestId)
        break
      }
      case "checkpoint": {
        void options
          .onCheckpoint()
          .then(() => {
            send("checkpointAck", { ok: true }, requestId)
          })
          .catch(() => {
            send("checkpointAck", { ok: false }, requestId)
          })
        break
      }
      case "ping": {
        send("pong", { timestamp: Date.now() }, requestId)
        break
      }
    }
  }

  const eventSource: PortalEventSource | undefined =
    options.eventSource ?? (typeof window !== "undefined" ? (window as unknown as PortalEventSource) : undefined)
  eventSource?.addEventListener("message", handleMessage)

  return {
    send,
    notifyReady() {
      send("ready", buildReadyPayload())
    },
    notifyScreenChange(screen, replayId) {
      send("screenChange", { screen, ...(replayId ? { replayId } : {}) })
    },
    notifyLocaleChange(locale) {
      send("localeChange", { locale })
    },
    notifyAuthState(snapshot) {
      send("authState", { status: snapshot.status, user: snapshot.user })
    },
    notifySaveState(save) {
      send("saveState", {
        standardQuickBest: save.standardQuickBest,
        assistQuickBest: save.assistQuickBest,
        runs: save.runs,
        builderXP: save.progression.xp,
      })
    },
    notifyScore(payload) {
      send("score", payload)
    },
    dispose() {
      eventSource?.removeEventListener("message", handleMessage)
    },
  }
}
