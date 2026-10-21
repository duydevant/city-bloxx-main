import { WebContent, webMetadata } from "@/modules/city-bloxx/web-content"
import { PvpDashboard } from "@/modules/city-bloxx/pvp-dashboard"

export const metadata = webMetadata(
  "Solo PvP 1v1 · Realtime Firebase Stats",
  "Live 1v1 Coin Wager matches, waiting rooms, and Google Firebase Realtime Database statistics.",
  "/pvp",
)

export default function Page() {
  return (
    <WebContent
      title={["Solo PvP 1v1 · Realtime Stats", "Solo PvP 1v1 · Thống kê Trực tiếp"]}
      description={[
        "Live Google Firebase Realtime Database statistics, open 1v1 Coin Wager rooms, and Winner-Takes-All match history.",
        "Thống kê trực tiếp từ Google Firebase Realtime Database, danh sách phòng cược Xu 1v1 đang chờ và lịch sử thắng cược.",
      ]}
    >
      <PvpDashboard />
    </WebContent>
  )
}
