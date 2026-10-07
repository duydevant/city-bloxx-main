"use client"

import Link from "next/link"
import { Gamepad2 } from "lucide-react"

import { LanguageSwitcher } from "@/components/layout/language-switcher"
import { UserNavMenu } from "@/components/layout/user-nav-menu"
import { Routes } from "@/lib/routes"
import { siteConfig } from "@/lib/site"

export function GameHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center gap-3 px-4">
        <Link href={Routes.HOME} className="flex shrink-0 items-center gap-2 font-bold tracking-tight">
          <Gamepad2 className="size-5 text-primary" aria-hidden="true" />
          <span>{siteConfig.name}</span>
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <LanguageSwitcher />
          <UserNavMenu />
        </div>
      </div>
    </header>
  )
}
