"use client"

import { ThemeProvider } from "next-themes"

import { TooltipProvider } from "@/components/ui/tooltip"
import { I18nProvider } from "@/lib/i18n"
import { QueryProvider } from "@/providers/query-provider"
import { AuthUIProvider } from "@/modules/account/auth-ui"

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
      <I18nProvider>
        <QueryProvider>
          <TooltipProvider><AuthUIProvider>{children}</AuthUIProvider></TooltipProvider>
        </QueryProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}
