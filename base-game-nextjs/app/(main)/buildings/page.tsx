import { Building2, Layers, Compass } from "lucide-react"
import { Copy, WebContent, webMetadata } from "@/modules/city-bloxx/web-content"
import { BUILDING_IDS, BUILDINGS } from "../../../../packages/city-bloxx-core/src/index"

export const metadata = webMetadata(
  "Architecture Book",
  "Learn building classes, adjacency rules and earn Classic Brick cosmetics by playing.",
  "/buildings",
)

const names = {
  residential: ["Residential", "Nhà ở"],
  industrial: ["Industrial", "Công nghiệp"],
  office: ["Office", "Văn phòng"],
  highrise: ["High-rise", "Cao tầng"],
} as const

export default function Page() {
  return (
    <WebContent
      title={["Architecture Book", "Sổ kiến trúc"]}
      description={[
        "Four classes, a Classic Brick collection and independent building, roof and crane equipment. Cosmetics never change score or physics.",
        "Bốn loại nhà, bộ Gạch cổ điển và trang bị nhà, mái, cần cẩu độc lập. Trang bị không thay đổi điểm hay vật lý.",
      ]}
      screen="book"
    >
      <div className="web-catalog">
        {BUILDING_IDS.map((id) => (
          <section className="web-card" key={id}>
            <div className="web-card-header">
              <span className="web-card-icon" aria-hidden="true">
                <Building2 size={18} />
              </span>
              <h2>
                <Copy en={names[id][0]} vi={names[id][1]} />
              </h2>
            </div>
            <p className="inline-flex items-center gap-1.5" style={{ fontWeight: 700, color: "var(--game-text)" }}>
              <Layers size={15} aria-hidden="true" style={{ color: "var(--game-primary)" }} />
              <span>
                {BUILDINGS[id].floors} <Copy en="body floors + one roof" vi="tầng thân + một mái" />
              </span>
            </p>
            <p className="inline-flex items-center gap-1.5 flex-wrap">
              <Compass size={15} aria-hidden="true" style={{ color: "var(--game-gold-deep)" }} />
              <span>
                <Copy en="Needs edge-adjacent: " vi="Cần kề cạnh: " />
                {BUILDINGS[id].requires.length ? (
                  BUILDINGS[id].requires.map((r, i) => (
                    <strong key={r}>
                      {i > 0 ? " + " : ""}
                      <Copy en={names[r][0]} vi={names[r][1]} />
                    </strong>
                  ))
                ) : (
                  <strong>
                    <Copy en="None" vi="Không có" />
                  </strong>
                )}
              </span>
            </p>
          </section>
        ))}
      </div>
    </WebContent>
  )
}

