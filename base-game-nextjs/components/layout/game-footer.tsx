"use client"

import Link from "next/link"
import { Building2, Gamepad2, Swords, Trophy } from "lucide-react"
import { useI18n } from "@/lib/i18n"

export function GameFooter() {
  const { t, locale } = useI18n()
  const vi = locale === "vi"

  return (
    <footer className="border-t border-border bg-card/75 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <Gamepad2 className="size-4 text-primary" aria-hidden="true" />
          <p>{t("footer.tagline")}</p>
        </div>
        <nav
          aria-label={vi ? "Liên kết nhanh" : "Quick links"}
          className="flex flex-wrap items-center gap-4 text-xs font-semibold"
        >
          <Link href="/play" className="inline-flex items-center gap-1 hover:text-primary">
            <Building2 className="size-3.5" aria-hidden="true" />
            <span>{vi ? "Xây tháp nhanh" : "Quick Tower"}</span>
          </Link>
          <Link href="/pvp" className="inline-flex items-center gap-1 hover:text-primary">
            <Swords className="size-3.5" aria-hidden="true" />
            <span>Solo PvP 1v1</span>
          </Link>
          <Link href="/leaderboards" className="inline-flex items-center gap-1 hover:text-primary">
            <Trophy className="size-3.5" aria-hidden="true" />
            <span>{vi ? "Bảng xếp hạng" : "Leaderboards"}</span>
          </Link>
        </nav>
      </div>
    </footer>
  )
}
