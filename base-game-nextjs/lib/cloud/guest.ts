import { emptySave, migrateSave } from "../../../packages/city-bloxx-core/src/index"
export const GUEST_SAVE_KEY = "city-bloxx.quick-save.v2"
export function guestRaw(): string {
  const raw = localStorage.getItem(GUEST_SAVE_KEY)
  if (raw !== null) return raw
  const save = emptySave(),
    legacy = Number(localStorage.getItem("city-bloxx.quick-best.v1"))
  save.standardQuickBest = Number.isSafeInteger(legacy) && legacy > 0 ? legacy : 0
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
