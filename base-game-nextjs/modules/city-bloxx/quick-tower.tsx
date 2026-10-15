"use client"

import { useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { emptySave, migrateSave, type GameSave, type SavePort } from "../../../packages/city-bloxx-core/src/index"
import { createTowerAudio } from "../../../packages/city-bloxx-renderer/src/audio"
import { mountQuickTower, sessionScreen, type SessionScreen } from "../../../packages/city-bloxx-renderer/src/session"
import "../../../packages/city-bloxx-renderer/src/session.css"
import styles from "./quick-tower.module.css"
import { useI18n } from "@/lib/i18n"
import type { TowerSession } from "../../../packages/city-bloxx-renderer/src/session"
import { browserAuth } from "@/lib/auth/session"

const SAVE_KEY = "city-bloxx.quick-save.v2"
function createLocalSave(): SavePort {
  return {
    async load() {
      const raw = window.localStorage.getItem(SAVE_KEY)
      if (raw) return migrateSave(JSON.parse(raw))
      const save = emptySave()
      const legacy = Number(window.localStorage.getItem("city-bloxx.quick-best.v1"))
      save.standardQuickBest = Number.isSafeInteger(legacy) && legacy > 0 ? legacy : 0
      return save
    },
    async save(value: GameSave) {
      try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(value)); return true }
      catch { return false }
    },
  }
}
export function QuickTower({ initialScreen, content=false }: {initialScreen?:SessionScreen;content?:boolean}) {
  const { locale, setLocale } = useI18n()
  const router=useRouter(),params=useSearchParams(),query=params.toString()
  const initial=useRef({screen:initialScreen??(params.has("screen")?sessionScreen(params.get("screen")):undefined),replay:params.get("replay")??undefined})
  const lastQuery=useRef(query)
  const root = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<TowerSession | null>(null)
  const localeRef = useRef(locale)
  useEffect(() => {
    if (!root.current) return
    const session = mountQuickTower(root.current, {
      assets: "/game", save: createLocalSave(), audio: createTowerAudio(),
      seed: () => Date.now() & 0x7fffffff, locale: localeRef.current,
      showLanguageSwitch: false,
      initialScreen:initial.current.screen,initialReplayId:initial.current.replay,presentation:content?"content":"game",
      onNavigate:(screen,replayId)=>{
        const routes:Partial<Record<SessionScreen,string>>={statistics:"/statistics",history:"/my-towers",book:"/buildings"}
        const target=replayId?`/play?screen=history&replay=${encodeURIComponent(replayId)}`:screen==="quick"?"/play":screen==="city"?"/play?screen=city":routes[screen]??`/play?screen=${screen}`
        router.push(target)
      },
      capabilities: { platform: "web", externalServices: true, standardScore: false, account:"backend-ready" },
      tracking: { installationId: () => [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2,"0")).join(""), now: () => Date.now() },
      onLocaleChange: next => setLocale(next === "vi" ? "vi" : "en"),
    })
    sessionRef.current = session
    return () => { session.dispose(); sessionRef.current=null }
  }, [setLocale,router,content])
  useEffect(() => {
    const auth=browserAuth();let previous=auth.snapshot()
    const pause=()=>sessionRef.current?.checkpointAndPause()
    window.addEventListener("city-bloxx:checkpoint-account",pause)
    const unsubscribe=auth.subscribe(()=>{const next=auth.snapshot();if(next.user?.id!==previous.user?.id||next.status==="required"&&previous.status!=="required")pause();previous=next})
    return()=>{unsubscribe();window.removeEventListener("city-bloxx:checkpoint-account",pause)}
  },[])
  useEffect(() => { localeRef.current=locale;sessionRef.current?.setLocale(locale) }, [locale])
  useEffect(()=>{if(lastQuery.current===query)return;lastQuery.current=query;const session=sessionRef.current;void session?.ready.then(()=>session.navigate(sessionScreen(params.get("screen")),params.get("replay")??undefined))},[query,params])
  return <section className={content?styles.content:styles.shell} aria-label={locale==="vi"?"City Bloxx · tiến trình trên thiết bị":"City Bloxx · progress on this device"}><div ref={root} className={content?undefined:styles.session} /></section>
}
