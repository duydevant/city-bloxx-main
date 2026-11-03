"use client"

import { useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { emptySave, type GameSave } from "../../../packages/city-bloxx-core/src/index"
import { createTowerAudio } from "../../../packages/city-bloxx-renderer/src/audio"
import {
  mountQuickTower,
  sessionScreen,
  type SessionScreen,
} from "../../../packages/city-bloxx-renderer/src/session"
import "../../../packages/city-bloxx-renderer/src/session.css"
import styles from "./quick-tower.module.css"
import { useI18n } from "@/lib/i18n"
import type { TowerSession } from "../../../packages/city-bloxx-renderer/src/session"
import { browserAuth } from "@/lib/auth/session"
import { browserCloud, registerCheckpoint, trackLocalDrain, waitLocalDrain } from "@/lib/cloud/browser"
import { useCloud } from "@/lib/cloud/use-cloud"
import {
  createPortalAudio,
  createPortalBridge,
  createPortalLifecycle,
  createPortalScorePort,
  parsePortalQueryConfig,
  type PortalBridge,
} from "@/lib/portal/bridge"
import { browserRanked } from "@/lib/ranked/browser"
import { resolveWebLiveOpsManifest } from "@/lib/liveops/service"
import { createFirebasePvpPort } from "@/lib/pvp/firebase-rtdb"

export function QuickTower({
  initialScreen,
  content = false,
  embed = false,
  fullscreen = false,
}: {
  initialScreen?: SessionScreen
  content?: boolean
  embed?: boolean
  /** Standalone full-viewport game (site "/") without the portal bridge. */
  fullscreen?: boolean
}) {
  const { locale, setLocale } = useI18n()
  const router = useRouter(),
    params = useSearchParams(),
    query = params.toString()
  const parsedPortal = parsePortalQueryConfig(new URLSearchParams(query))
  const resolvedInitialScreen =
    initialScreen ??
    parsedPortal.screen ??
    (params.has("screen") ? sessionScreen(params.get("screen")) : undefined)
  const resolvedInitialReplay = parsedPortal.replayId ?? params.get("replay") ?? undefined
  const resolvedInitialRoom = params.get("room") ?? undefined
  const portalQuery = useRef(parsedPortal)
  const initial = useRef({
    screen: resolvedInitialScreen,
    replay: resolvedInitialReplay,
    room: resolvedInitialRoom,
  })
  const currentScreenRef = useRef<SessionScreen>(resolvedInitialScreen ?? "quick")
  const lastQuery = useRef(query)
  const root = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<TowerSession | null>(null)
  const bridgeRef = useRef<PortalBridge | null>(null)
  const localeRef = useRef(parsedPortal.locale ?? locale)
  const cloud = useCloud()
  const available = cloud.ready,
    mount = cloud.mount

  useEffect(() => {
    if (embed && portalQuery.current.locale && portalQuery.current.locale !== localeRef.current) {
      localeRef.current = portalQuery.current.locale
      setLocale(portalQuery.current.locale)
    }
  }, [embed, setLocale])

  useEffect(() => {
    if (!root.current || !available) return
    let binding = browserCloud().attach()
    const portalAudio = embed
      ? createPortalAudio(portalQuery.current.muted, createTowerAudio, (muted) => {
          bridgeRef.current?.send("audioChange", { muted })
        })
      : null
    const portalLifecycle = embed
      ? createPortalLifecycle(false, portalAudio ?? undefined, (paused) => {
          bridgeRef.current?.send("lifecycleChange", {
            paused,
            muted: portalAudio?.isMuted() ?? false,
          })
        })
      : null
    const portalScore = embed
      ? createPortalScorePort((payload) => {
          bridgeRef.current?.notifyScore(payload)
        })
      : null

    const session = mountQuickTower(root.current, {
      assets: "/game",
      save: {
        ...binding.port,
        load: async () => {
          await waitLocalDrain()
          let loaded: GameSave
          try {
            loaded = await binding.port.load()
          } catch {
            binding.close()
            binding = browserCloud().attach()
            try {
              loaded = await binding.port.load()
            } catch {
              loaded = emptySave()
              await binding.port.save(loaded).catch(() => {})
            }
          }
          portalScore?.reconcileSave(loaded)
          bridgeRef.current?.notifySaveState(loaded)
          return loaded
        },
        save: async (value) => {
          let ok = await binding.port.save(value)
          if (!ok && browserCloud().snapshot().ready) {
            binding.close()
            binding = browserCloud().attach()
            ok = await binding.port.save(value)
          }
          if (ok) {
            portalScore?.reconcileSave(value)
            bridgeRef.current?.notifySaveState(value)
          }
          return ok
        },
      },
      audio: portalAudio ?? createTowerAudio(),
      lifecycle: portalLifecycle ?? undefined,
      score: portalScore ?? undefined,
      ranked: cloud.scope && cloud.scope !== "guest" ? browserRanked().port(cloud.scope) : undefined,
      pvp: createFirebasePvpPort(),
      seed: () => Date.now() & 0x7fffffff,
      locale: localeRef.current,
      // Portal đã truyền ?lang= thì giữ ngôn ngữ đó, không để ngôn ngữ lưu trong save đè lên.
      showLanguageSwitch: embed ? portalQuery.current.showLanguageSwitch && !portalQuery.current.locale : false,
      showSoundControl: embed ? portalQuery.current.showSoundControl : true,
      featureFlags: {
        daily: process.env.NEXT_PUBLIC_FEATURE_DAILY !== "0",
        meta: process.env.NEXT_PUBLIC_FEATURE_META !== "0",
        cosmetics: process.env.NEXT_PUBLIC_FEATURE_COSMETICS !== "0",
      },
      initialScreen: initial.current.screen,
      initialReplayId: initial.current.replay,
      initialPvpRoom: initial.current.room,
      presentation: content ? "content" : "game",
      onNavigate: (screen, replayId) => {
        currentScreenRef.current = screen
        if (embed) {
          bridgeRef.current?.notifyScreenChange(screen, replayId)
          return
        }
        const routes: Partial<Record<SessionScreen, string>> = {
          statistics: "/statistics",
          history: "/my-towers",
          book: "/buildings",
        }
        const target = replayId
          ? `/play?screen=history&replay=${encodeURIComponent(replayId)}`
          : screen === "quick"
            ? "/play"
            : screen === "city"
              ? "/play?screen=city"
              : (routes[screen] ?? `/play?screen=${screen}`)
        router.push(target)
      },
      capabilities: {
        platform: "web",
        externalServices: true,
        standardScore: embed,
        account: "backend-ready",
      },
      tracking: {
        installationId: () => {
          try {
            const key = "city-bloxx.installation-id.v1"
            const existing = localStorage.getItem(key)
            if (existing && /^[a-f0-9]{32}$/.test(existing)) return existing
            const next = [...crypto.getRandomValues(new Uint8Array(16))]
              .map((n) => n.toString(16).padStart(2, "0"))
              .join("")
            localStorage.setItem(key, next)
            return next
          } catch {
            return [...crypto.getRandomValues(new Uint8Array(16))]
              .map((n) => n.toString(16).padStart(2, "0"))
              .join("")
          }
        },
        now: () => Date.now(),
      },
      onLocaleChange: (next) => {
        const normalized = next === "vi" ? "vi" : "en"
        localeRef.current = normalized
        setLocale(normalized)
        bridgeRef.current?.notifyLocaleChange(normalized)
      },
    })
    sessionRef.current = session
    let disposed = false
    void resolveWebLiveOpsManifest().then(({ manifest }) => {
      if (!disposed) session.setLiveOpsManifest?.(manifest)
    })

    let unsubscribeAuth = () => {}
    if (embed && portalAudio && portalLifecycle) {
      const envOrigins = (process.env.NEXT_PUBLIC_PORTAL_ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      const allowedOrigins =
        portalQuery.current.parentOrigin !== "*"
          ? [portalQuery.current.parentOrigin, ...envOrigins]
          : envOrigins.length > 0
            ? envOrigins
            : ["*"]

      const bridge = createPortalBridge({
        allowedOrigins,
        audio: portalAudio,
        lifecycle: portalLifecycle,
        getLocale: () => localeRef.current,
        setLocale: (nextLocale) => {
          localeRef.current = nextLocale
          setLocale(nextLocale)
          sessionRef.current?.setLocale(nextLocale)
        },
        getScreen: () => currentScreenRef.current,
        navigate: (targetScreen, replayId) => {
          currentScreenRef.current = targetScreen
          void session.ready.then(() => session.navigate(targetScreen, replayId))
        },
        getAuth: () => browserAuth().snapshot(),
        adoptAuthSession: (tokens, expiresAt) => {
          browserAuth().adoptPortalSession(tokens, expiresAt)
        },
        adoptAuthGuest: () => {
          browserAuth().adoptPortalGuest()
        },
        onCheckpoint: async () => {
          await session.checkpointAndPause()
          await browserCloud().flush()
        },
      })
      bridgeRef.current = bridge
      unsubscribeAuth = browserAuth().subscribe(() => {
        bridge.notifyAuthState(browserAuth().snapshot())
      })
      void session.ready.then(() => {
        bridge.notifyReady()
      })
    }

    const unregister = registerCheckpoint(() => session.checkpointAndPause())
    return () => {
      disposed = true
      unsubscribeAuth()
      bridgeRef.current?.dispose()
      bridgeRef.current = null
      portalLifecycle?.dispose()
      unregister()
      session.dispose()
      const drain = session.whenSaved().finally(binding.close)
      trackLocalDrain(drain)
      sessionRef.current = null
    }
  }, [setLocale, router, content, embed, available, mount, cloud.scope])
  useEffect(() => {
    const pause = () => {
      void sessionRef.current?.checkpointAndPause().then(() => browserCloud().flush())
    }
    window.addEventListener("city-bloxx:checkpoint-account", pause)
    return () => {
      window.removeEventListener("city-bloxx:checkpoint-account", pause)
    }
  }, [])
  useEffect(() => {
    localeRef.current = locale
    sessionRef.current?.setLocale(locale)
  }, [locale])
  // Portal ANT Play đổi ngôn ngữ khi game đang mở: { type: "ant-play:locale", locale } từ trang cha.
  useEffect(() => {
    if (!embed) return
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return
      const data = event.data as { type?: unknown; locale?: unknown } | null
      if (data?.type !== "ant-play:locale") return
      const next = data.locale === "vi" ? "vi" : data.locale === "en" ? "en" : null
      if (!next) return
      localeRef.current = next
      setLocale(next)
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [embed, setLocale])
  useEffect(() => {
    if (lastQuery.current === query) return
    lastQuery.current = query
    const session = sessionRef.current
    void session?.ready.then(() =>
      session.navigate(sessionScreen(params.get("screen")), params.get("replay") ?? undefined),
    )
  }, [query, params])
  return (
    <section
      className={content ? styles.content : embed ? styles.embedShell : fullscreen ? styles.fullShell : styles.shell}
      data-embed={embed ? "true" : undefined}
      aria-label={locale === "vi" ? "City Bloxx · tiến trình riêng" : "City Bloxx · personal progress"}
    >
      {!available && (
        <p role="status">
          {locale === "vi"
            ? "Đang mở tiến trình. Nếu chưa sẵn sàng, dùng bảng lưu bên dưới để thử lại hoặc tải bản sao."
            : "Opening progress. Use the save panel below to retry or download a preserved copy if unavailable."}
        </p>
      )}
      <div ref={root} inert={!embed && cloud.locked} className={content ? undefined : styles.session} />
    </section>
  )
}

