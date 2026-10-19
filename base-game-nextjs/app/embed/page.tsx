import type { Metadata } from "next"
import { Suspense } from "react"

import { QuickTower } from "@/modules/city-bloxx/quick-tower"

export const metadata: Metadata = {
  title: "City Bloxx (Embed)",
  description: "Embedded City Bloxx game frame for multi-game portals.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/play" },
}

export default function EmbedPage() {
  return (
    <main id="main-content" className="h-dvh w-full overflow-hidden" tabIndex={-1}>
      <Suspense>
        <QuickTower embed />
      </Suspense>
    </main>
  )
}
