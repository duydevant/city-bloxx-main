import Link from "next/link"
import { Building2, Calendar, Play } from "lucide-react"
import { Copy, WebContent, webMetadata } from "@/modules/city-bloxx/web-content"
import { PersonalPreview } from "@/modules/city-bloxx/personal-preview"

export const metadata = webMetadata(
  "City Bloxx Online",
  "Play Quick Tower, build your city and try the same Daily tower each UTC day.",
  "/",
)

export default function HomePage() {
  return (
    <WebContent
      title={["City Bloxx Online", "City Bloxx Online"]}
      description={[
        "Time each drop, control the sway, and build a city one tower at a time.",
        "Canh từng cú thả, giữ tòa nhà ổn định và xây thành phố của riêng bạn.",
      ]}
    >
      <div className="web-cta">
        <Link href="/play">
          <Play size={18} aria-hidden="true" />
          <Copy en="Play Quick Tower" vi="Chơi xây tháp nhanh" />
        </Link>
        <Link href="/play?screen=city">
          <Building2 size={18} aria-hidden="true" />
          <Copy en="Build your city" vi="Xây thành phố" />
        </Link>
        <Link href="/play?screen=daily">
          <Calendar size={18} aria-hidden="true" />
          <Copy en="Play today's Daily" vi="Chơi Daily hôm nay" />
        </Link>
      </div>
      <PersonalPreview />
    </WebContent>
  )
}
