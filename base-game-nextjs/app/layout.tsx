import type { Metadata, Viewport } from "next"
import { Baloo_2, Nunito } from "next/font/google"

import { JsonLd } from "@/components/seo/json-ld"
import { Toaster } from "@/components/ui/sonner"
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo/schema"
import { siteConfig } from "@/lib/site"
import { AppProviders } from "@/providers/app-providers"
import "./globals.css"
import "./web.css"

const baloo = Baloo_2({
  subsets: ["latin", "vietnamese"],
  weight: ["600", "700", "800"],
  variable: "--font-baloo",
  display: "swap",
})

const nunito = Nunito({
  subsets: ["latin", "vietnamese"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-nunito",
  display: "swap",
})

export const viewport:Viewport={width:"device-width",initialScale:1,viewportFit:"cover"}
export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${baloo.variable} ${nunito.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="relative flex min-h-full flex-col bg-background">
        <AppProviders>
          <JsonLd data={[websiteJsonLd(), organizationJsonLd()]} />
          {children}
          <Toaster />
        </AppProviders>
      </body>
    </html>
  )
}
