"use client"
import { useEffect, useSyncExternalStore } from "react"
import { browserCloud } from "./browser"
import { INITIAL_CLOUD } from "./coordinator"
const emptySubscribe = () => () => {}
export function useCloud() {
  const cloud = typeof window === "undefined" ? null : browserCloud()
  const state = useSyncExternalStore(
    cloud?.subscribe ?? emptySubscribe,
    cloud?.snapshot ?? (() => INITIAL_CLOUD),
    () => INITIAL_CLOUD,
  )
  useEffect(() => {
    browserCloud()
  }, [])
  return state
}
