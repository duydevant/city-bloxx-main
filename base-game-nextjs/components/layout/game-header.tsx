"use client"

import Link from "next/link"
import { Gamepad2, Play } from "lucide-react"

import { LanguageSwitcher } from "@/components/layout/language-switcher"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { UserNavMenu } from "@/components/layout/user-nav-menu"
import { Routes } from "@/lib/routes"
import { siteConfig } from "@/lib/site"
import { useI18n } from "@/lib/i18n"
import { CloudTrigger } from "@/modules/account/cloud-panel"
import { RankedTrigger } from "@/modules/account/ranked-panel"

export function GameHeader() {
  const { locale } = useI18n()
  return (
    <header className="game-header-bar sticky top-0 z-40">
      <a className="web-skip" href="#main-content">
        {locale === "vi" ? "Đến nội dung" : "Skip to content"}
      </a>
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center gap-2.5 px-4">
        <Link href={Routes.HOME} className="game-brand-link shrink-0">
          <span className="game-brand-badge" aria-hidden="true">
            <Gamepad2 className="size-5" />
          </span>
          <span>{siteConfig.name}</span>
        </Link>

        <Link
          href="/play"
          className="game-header-play-btn hidden sm:inline-flex"
        >
          <Play className="size-3.5 fill-current" aria-hidden="true" />
          <span>{locale === "vi" ? "Chơi ngay" : "Play Now"}</span>
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <CloudTrigger />
          <RankedTrigger />
          <ThemeToggle />
          <LanguageSwitcher />
          <UserNavMenu />
        </div>
      </div>
    </header>
  )
}
