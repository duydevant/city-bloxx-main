import { describe, expect, it, vi } from "vitest"
import { emptySave } from "../../../packages/city-bloxx-core/src/index"
import type { AuthTokens } from "../api/types"
import type { AuthSnapshot } from "../auth/session"
import {
  createPortalAudio,
  createPortalBridge,
  createPortalLifecycle,
  createPortalScorePort,
  parsePortalQueryConfig,
  PORTAL_NAMESPACE,
  PORTAL_VERSION,
} from "./bridge"
import { createCityBloxxPortalClient } from "./client"

class MockMessageBus {
  readonly parentListeners = new Set<(event: MessageEvent) => void>()
  readonly childListeners = new Set<(event: MessageEvent) => void>()

  constructor(
    public readonly parentOrigin = "https://portal.example",
    public readonly childOrigin = "https://citybloxx.example",
  ) {}

  readonly childWindow = {
    postMessage: (data: unknown) => {
      const event = {
        data,
        origin: this.parentOrigin,
        source: this.parentWindow,
      } as unknown as MessageEvent
      this.childListeners.forEach((cb) => cb(event))
    },
    addEventListener: (_type: "message", cb: (event: MessageEvent) => void) => {
      this.childListeners.add(cb)
    },
    removeEventListener: (_type: "message", cb: (event: MessageEvent) => void) => {
      this.childListeners.delete(cb)
    },
  }

  readonly parentWindow = {
    postMessage: (data: unknown) => {
      const event = {
        data,
        origin: this.childOrigin,
        source: this.childWindow,
      } as unknown as MessageEvent
      this.parentListeners.forEach((cb) => cb(event))
    },
    addEventListener: (_type: "message", cb: (event: MessageEvent) => void) => {
      this.parentListeners.add(cb)
    },
    removeEventListener: (_type: "message", cb: (event: MessageEvent) => void) => {
      this.parentListeners.delete(cb)
    },
  }
}

describe("PortalHost bridge and CityBloxxPortalClient SDK", () => {
  it("parses /embed query parameters accurately", () => {
    const cfg1 = parsePortalQueryConfig(
      new URLSearchParams("lang=vi&mode=daily&muted=1&hideLangSwitch=1&hideSoundControl=true&parentOrigin=https://hub.example"),
    )
    expect(cfg1).toEqual({
      locale: "vi",
      screen: "daily",
      replayId: undefined,
      muted: true,
      showLanguageSwitch: false,
      showSoundControl: false,
      parentOrigin: "https://hub.example",
    })

    const cfg2 = parsePortalQueryConfig(new URLSearchParams("locale=en&screen=history&replay=r-1&sound=0"))
    expect(cfg2.locale).toBe("en")
    expect(cfg2.screen).toBe("history")
    expect(cfg2.replayId).toBe("r-1")
    expect(cfg2.muted).toBe(true)
    expect(cfg2.showLanguageSwitch).toBe(true)
    expect(cfg2.showSoundControl).toBe(true)
    expect(cfg2.parentOrigin).toBe("*")
  })

  it("controls audio mute and suspension via createPortalAudio", () => {
    const inner = {
      play: vi.fn(),
      suspend: vi.fn(),
      dispose: vi.fn(),
    }
    const changes: boolean[] = []
    const audio = createPortalAudio(false, () => inner, (m) => changes.push(m))

    audio.play("perfect")
    expect(inner.play).toHaveBeenCalledWith("perfect")

    audio.setMuted(true)
    expect(audio.isMuted()).toBe(true)
    expect(inner.suspend).toHaveBeenCalledTimes(1)
    expect(changes).toEqual([true])

    audio.play("great")
    expect(inner.play).toHaveBeenCalledTimes(1)

    audio.setMuted(false)
    audio.play("good")
    expect(inner.play).toHaveBeenCalledWith("good")
    expect(changes).toEqual([true, false])

    audio.dispose()
    audio.play("perfect")
    expect(inner.dispose).toHaveBeenCalledTimes(1)
    expect(inner.play).toHaveBeenCalledTimes(2)
  })

  it("handles host pause/resume and score monotonic PB reporting", async () => {
    const suspend = vi.fn()
    const transitions: boolean[] = []
    const lifecycle = createPortalLifecycle(false, { suspend }, (paused) => transitions.push(paused))
    const pauses = vi.fn()
    const resumes = vi.fn()
    lifecycle.onPause(pauses)
    lifecycle.onResume(resumes)

    lifecycle.setHostPaused(true)
    lifecycle.setHostPaused(true) // idempotent
    expect(lifecycle.isPaused()).toBe(true)
    expect(suspend).toHaveBeenCalledTimes(1)
    expect(pauses).toHaveBeenCalledTimes(1)

    lifecycle.setHostPaused(false)
    expect(lifecycle.isPaused()).toBe(false)
    expect(resumes).toHaveBeenCalledTimes(1)
    expect(transitions).toEqual([true, false])
    lifecycle.dispose()

    const scores: Array<{ mode: string; population: number; personalBest: number }> = []
    const scorePort = createPortalScorePort((payload) => scores.push(payload))
    const save = emptySave()
    save.standardQuickBest = 120
    scorePort.reconcileSave(save)
    expect(scorePort.getState?.().ackedScore).toBe(120)

    await scorePort.submitStandardQuick(95)
    await scorePort.submitStandardQuick(180)
    expect(scores).toEqual([
      { mode: "standard-quick", population: 95, personalBest: 120 },
      { mode: "standard-quick", population: 180, personalBest: 180 },
    ])
  })

  it("synchronizes init, pause/resume, audio, locale, navigation, auth, score, and checkpoint over postMessage", async () => {
    const bus = new MockMessageBus("https://portal.example", "https://citybloxx.example")
    const innerAudio = { play: vi.fn(), suspend: vi.fn(), dispose: vi.fn() }
    const audio = createPortalAudio(false, () => innerAudio)
    const lifecycle = createPortalLifecycle(false, audio)

    let locale: "en" | "vi" = "en"
    const screen = "quick" as const
    let currentScreen: string = screen
    let authState: AuthSnapshot = { status: "guest", user: null, issue: null }
    let checkpointed = false

    const bridge = createPortalBridge({
      allowedOrigins: ["https://portal.example"],
      targetWindow: bus.parentWindow,
      eventSource: bus.childWindow,
      audio,
      lifecycle,
      getLocale: () => locale,
      setLocale: (next) => {
        locale = next
      },
      getScreen: () => currentScreen as "quick",
      navigate: (nextScreen) => {
        currentScreen = nextScreen
      },
      getAuth: () => authState,
      adoptAuthSession: (tokens) => {
        authState = { status: "authenticated", user: tokens.user, issue: null }
      },
      adoptAuthGuest: () => {
        authState = { status: "guest", user: null, issue: null }
      },
      onCheckpoint: async () => {
        checkpointed = true
      },
    })

    const client = createCityBloxxPortalClient(
      { contentWindow: bus.childWindow as unknown as Window },
      { targetOrigin: "https://citybloxx.example", eventSource: bus.parentWindow },
    )

    const readyEvents: unknown[] = []
    const authEvents: unknown[] = []
    const screenEvents: unknown[] = []
    const scoreEvents: unknown[] = []
    client.on("ready", (e) => readyEvents.push(e))
    client.on("authState", (e) => authEvents.push(e))
    client.on("screenChange", (e) => screenEvents.push(e))
    client.on("score", (e) => scoreEvents.push(e))

    const sampleTokens: AuthTokens = {
      accessToken: "jwt-portal-1",
      tokenType: "Bearer",
      expiresIn: 900,
      user: {
        id: "u-portal-1",
        email: "player@portal.example",
        username: "portal_player",
        fullName: "Portal Player",
        avatarUrl: null,
        status: "ACTIVE",
        emailVerifiedAt: "2026-10-19T00:00:00.000Z",
        createdAt: "2026-10-19T00:00:00.000Z",
        roles: ["USER"],
        permissions: [],
      },
    }

    client.init({
      locale: "vi",
      muted: true,
      paused: false,
      screen: "daily",
      tokens: sampleTokens,
    })

    expect(locale).toBe("vi")
    expect(audio.isMuted()).toBe(true)
    expect(currentScreen).toBe("daily")
    expect(authState.status).toBe("authenticated")
    expect(readyEvents).toHaveLength(1)
    expect(readyEvents[0]).toMatchObject({
      locale: "vi",
      screen: "daily",
      authStatus: "authenticated",
      muted: true,
      paused: false,
    })

    client.pause()
    expect(lifecycle.isPaused()).toBe(true)
    client.resume()
    expect(lifecycle.isPaused()).toBe(false)

    client.setMuted(false)
    expect(audio.isMuted()).toBe(false)

    client.navigate("city")
    expect(currentScreen).toBe("city")
    expect(screenEvents.at(-1)).toEqual({ screen: "city" })

    client.setGuest()
    expect(authState.status).toBe("guest")
    expect(authEvents.at(-1)).toEqual({ status: "guest", user: null })

    bridge.notifyScore({ mode: "standard-quick", population: 240, personalBest: 240 })
    expect(scoreEvents).toEqual([{ mode: "standard-quick", population: 240, personalBest: 240 }])

    const cpOk = await client.checkpoint()
    expect(cpOk).toBe(true)
    expect(checkpointed).toBe(true)

    const pongTs = await client.ping()
    expect(pongTs).toBeGreaterThan(0)

    // Verify unauthorized origin is ignored
    bus.childListeners.forEach((cb) =>
      cb({
        origin: "https://evil.example",
        data: {
          namespace: PORTAL_NAMESPACE,
          version: PORTAL_VERSION,
          type: "setLocale",
          payload: { locale: "en" },
        },
      } as unknown as MessageEvent),
    )
    expect(locale).toBe("vi")

    client.dispose()
    bridge.dispose()
    lifecycle.dispose()
  })
})
