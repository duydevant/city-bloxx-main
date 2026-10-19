"use client"

import { useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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

export function QuickTower({
  initialScreen,
  content = false,
  embed = false,
}: {
  initialScreen?: SessionScreen
  content?: boolean
  embed?: boolean
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
  const portalQuery = useRef(parsedPortal)
  const initial = useRef({
    screen: resolvedInitialScreen,
    replay: resolvedInitialReplay,
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
    const binding = browserCloud().attach()
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
          const loaded = await binding.port.load()
          portalScore?.reconcileSave(loaded)
          bridgeRef.current?.notifySaveState(loaded)
          return loaded
        },
        save: async (value) => {
          const ok = await binding.port.save(value)
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
      seed: () => Date.now() & 0x7fffffff,
      locale: localeRef.current,
      showLanguageSwitch: embed ? portalQuery.current.showLanguageSwitch : false,
      showSoundControl: embed ? portalQuery.current.showSoundControl : true,
      featureFlags: {
        daily: process.env.NEXT_PUBLIC_FEATURE_DAILY !== "0",
        meta: process.env.NEXT_PUBLIC_FEATURE_META !== "0",
        cosmetics: process.env.NEXT_PUBLIC_FEATURE_COSMETICS !== "0",
      },
      initialScreen: initial.current.screen,
      initialReplayId: initial.current.replay,
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
        installationId: () =>
          [...crypto.getRandomValues(new Uint8Array(16))]
            .map((n) => n.toString(16).padStart(2, "0"))
            .join(""),
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
      className={content ? styles.content : embed ? styles.embedShell : styles.shell}
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
      <div ref={root} inert={cloud.locked} className={content ? undefined : styles.session} />
    </section>
  )
}

