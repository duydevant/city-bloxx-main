import { emptySave, migrateSave } from "../../../packages/city-bloxx-core/src/index"
export const GUEST_SAVE_KEY = "city-bloxx.quick-save.v2"
export function guestRaw(): string {
  try {
    const raw = localStorage.getItem(GUEST_SAVE_KEY)
    if (raw !== null) {
      try {
        parseSave(raw)
        return raw
      } catch {
        // Recover from incompatible or corrupted localStorage snapshot while preserving best score & coins
        const save = emptySave()
        try {
          const partial = JSON.parse(raw) as Partial<Record<string, unknown>>
          if (typeof partial?.standardQuickBest === "number" && Number.isSafeInteger(partial.standardQuickBest) && partial.standardQuickBest > 0) {
            save.standardQuickBest = partial.standardQuickBest
          }
          if (typeof partial?.coins === "number" && Number.isSafeInteger(partial.coins) && partial.coins >= 0) {
            save.coins = partial.coins
          }
        } catch {}
        const recovered = JSON.stringify(save)
        try {
          localStorage.setItem(GUEST_SAVE_KEY, recovered)
        } catch {}
        return recovered
      }
    }
  } catch {}
  const save = emptySave()
  try {
    const legacy = Number(localStorage.getItem("city-bloxx.quick-best.v1"))
    save.standardQuickBest = Number.isSafeInteger(legacy) && legacy > 0 ? legacy : 0
  } catch {}
  return JSON.stringify(save)
}
export const parseSave = (raw: string) => migrateSave(JSON.parse(raw))
export function canonical(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, sort(v)]),
          )
        : v
  return JSON.stringify(sort(value))
}
export const sameSave = (a: string | null, b: string | null) =>
  a === b || (a !== null && b !== null && canonical(JSON.parse(a)) === canonical(JSON.parse(b)))
