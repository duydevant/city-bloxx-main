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
import { browserCloud, registerCheckpoint, trackLocalDrain, waitLocalDrain } from "@/lib/cloud/browser"
import { useCloud } from "@/lib/cloud/use-cloud"
import { browserRanked } from "@/lib/ranked/browser"
export function QuickTower({
  initialScreen,
  content = false,
}: {
  initialScreen?: SessionScreen
  content?: boolean
}) {
  const { locale, setLocale } = useI18n()
  const router = useRouter(),
    params = useSearchParams(),
    query = params.toString()
  const initial = useRef({
    screen: initialScreen ?? (params.has("screen") ? sessionScreen(params.get("screen")) : undefined),
    replay: params.get("replay") ?? undefined,
  })
  const lastQuery = useRef(query)
  const root = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<TowerSession | null>(null)
  const localeRef = useRef(locale)
  const cloud = useCloud()
  const available = cloud.ready,
    mount = cloud.mount
  useEffect(() => {
    if (!root.current || !available) return
    const binding = browserCloud().attach()
    const session = mountQuickTower(root.current, {
      assets: "/game",
      save: {
        ...binding.port,
        load: async () => {
          await waitLocalDrain()
          return binding.port.load()
        },
      },
      audio: createTowerAudio(),
      ranked:cloud.scope && cloud.scope!=="guest" ? browserRanked().port(cloud.scope) : undefined,
      seed: () => Date.now() & 0x7fffffff,
      locale: localeRef.current,
      showLanguageSwitch: false,
      initialScreen: initial.current.screen,
      initialReplayId: initial.current.replay,
      presentation: content ? "content" : "game",
      onNavigate: (screen, replayId) => {
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
        standardScore: false,
        account: "backend-ready",
      },
      tracking: {
        installationId: () =>
          [...crypto.getRandomValues(new Uint8Array(16))]
            .map((n) => n.toString(16).padStart(2, "0"))
            .join(""),
        now: () => Date.now(),
      },
      onLocaleChange: (next) => setLocale(next === "vi" ? "vi" : "en"),
    })
    sessionRef.current = session
    const unregister = registerCheckpoint(() => session.checkpointAndPause())
    return () => {
      unregister()
      session.dispose()
      const drain = session.whenSaved().finally(binding.close)
      trackLocalDrain(drain)
      sessionRef.current = null
    }
  }, [setLocale, router, content, available, mount, cloud.scope])
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
      className={content ? styles.content : styles.shell}
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
