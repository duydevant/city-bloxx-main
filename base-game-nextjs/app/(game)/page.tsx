import { Suspense } from "react"

import { QuickTower } from "@/modules/city-bloxx/quick-tower"
import { webMetadata } from "@/modules/city-bloxx/web-content"

export const metadata = webMetadata(
  "City Bloxx Online",
  "Play Quick Tower, build your city and try the same Daily tower each UTC day.",
  "/",
)

/** "/" mở thẳng màn hình game toàn khung: không header/footer, menu và chế độ nằm trong game. */
export default function HomePage() {
  return (
    <main id="main-content" className="h-dvh w-full overflow-hidden" tabIndex={-1}>
      <h1 className="sr-only">City Bloxx Online</h1>
      <Suspense>
        <QuickTower fullscreen />
      </Suspense>
    </main>
  )
}
