"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react"
import { useI18n } from "@/lib/i18n"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const { locale } = useI18n()
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  const isDark = mounted && resolvedTheme === "dark"
  const label =
    locale === "vi"
      ? isDark
        ? "Chuyển sang giao diện Playful Sky (Sáng)"
        : "Chuyển sang giao diện Arcade Midnight (Tối)"
      : isDark
        ? "Switch to Playful Sky (Light)"
        : "Switch to Arcade Midnight (Dark)"

  return (
    <button
      type="button"
      className="game-header-pill game-theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? (
        <Sun className="size-4 text-amber-300" aria-hidden="true" />
      ) : (
        <Moon className="size-4 text-sky-700" aria-hidden="true" />
      )}
      <span className="hidden md:inline text-xs font-semibold">
        {isDark ? "Midnight" : "Sky"}
      </span>
    </button>
  )
}
