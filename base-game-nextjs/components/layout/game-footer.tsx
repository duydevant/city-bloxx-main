"use client"

import { useI18n } from "@/lib/i18n"

export function GameFooter() {
  const { t } = useI18n()

  return (
    <footer className="border-t bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>{t("footer.tagline")}</p>
      </div>
    </footer>
  )
}
