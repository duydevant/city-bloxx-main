"use client"
import Link from "next/link"
import { useI18n } from "@/lib/i18n"

import { Button } from "@/components/ui/button"
import { Routes } from "@/lib/routes"

export default function NotFound() {
  const { t } = useI18n()
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">{t("error.notFound")}</p>
      <Button render={<Link href={Routes.HOME} />}>{t("nav.home")}</Button>
    </div>
  )
}
