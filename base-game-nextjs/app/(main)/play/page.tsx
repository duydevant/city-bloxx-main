import type { Metadata } from "next"
import { Suspense } from "react"

import { QuickTower } from "@/modules/city-bloxx/quick-tower"

export const metadata: Metadata = {
  title: "Quick Tower",
  description: "Time each drop, keep the tower stable, and build a larger population.",
  alternates: { canonical: "/play" },
}

export default function PlayPage() {
  return <Suspense><QuickTower /></Suspense>
}
