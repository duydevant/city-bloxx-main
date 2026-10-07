"use client"

import Link from "next/link"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import { Routes } from "@/lib/routes"
import { siteConfig } from "@/lib/site"

export default function HomePage() {
  const { t } = useI18n()

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-20 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{siteConfig.name}</h1>
      <p className="max-w-xl text-muted-foreground">{t("home.description")}</p>
      <Button size="lg" nativeButton={false} render={<Link href={Routes.PLAY} />}>
        {t("home.play")}
      </Button>
      <Link href="/guide/build-city" className="underline">{t("guide.title")}</Link>
    </div>
  )
}
