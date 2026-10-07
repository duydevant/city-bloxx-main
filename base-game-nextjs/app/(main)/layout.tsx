import { GameFooter } from "@/components/layout/game-footer"
import { GameHeader } from "@/components/layout/game-header"

export default function MainLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <GameHeader />
      <main className="flex-1">{children}</main>
      <GameFooter />
    </>
  )
}
