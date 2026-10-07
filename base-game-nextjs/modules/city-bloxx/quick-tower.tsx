"use client"

import { useEffect, useRef } from "react"
import { emptySave, migrateSave, type GameSave, type SavePort } from "../../../packages/city-bloxx-core/src/index"
import { createTowerAudio } from "../../../packages/city-bloxx-renderer/src/audio"
import { mountQuickTower } from "../../../packages/city-bloxx-renderer/src/session"
import "../../../packages/city-bloxx-renderer/src/session.css"
import styles from "./quick-tower.module.css"
import { useI18n } from "@/lib/i18n"
import type { TowerSession } from "../../../packages/city-bloxx-renderer/src/session"

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
export function QuickTower() {
  const { locale, setLocale } = useI18n()
  const root = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<TowerSession | null>(null)
  const localeRef = useRef(locale)
  useEffect(() => {
    if (!root.current) return
    const session = mountQuickTower(root.current, {
      assets: "/game", save: createLocalSave(), audio: createTowerAudio(),
      seed: () => Date.now() & 0x7fffffff, locale: localeRef.current,
      showLanguageSwitch: false,
      onLocaleChange: next => setLocale(next === "vi" ? "vi" : "en"),
    })
    sessionRef.current = session
    return () => { session.dispose(); sessionRef.current=null }
  }, [setLocale])
  useEffect(() => { localeRef.current=locale;sessionRef.current?.setLocale(locale) }, [locale])
  return <section className={styles.shell} aria-label="Quick Tower"><div ref={root} className={styles.session} /></section>
}
