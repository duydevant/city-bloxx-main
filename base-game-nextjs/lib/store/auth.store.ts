"use client"
import { useEffect, useSyncExternalStore } from "react"
import { browserAuth, type AuthSnapshot } from "../auth/session"
const SERVER: AuthSnapshot = { status: "loading", user: null, issue: null }
const noopSubscribe = () => () => {}
export function useAuthStore(): AuthSnapshot {
  const session = typeof window === "undefined" ? null : browserAuth()
  const snapshot = useSyncExternalStore(
    session?.subscribe ?? noopSubscribe,
    session?.snapshot ?? (() => SERVER),
    () => SERVER,
  )
  useEffect(() => {
    session?.initialize()
  }, [session])
  return snapshot
}
