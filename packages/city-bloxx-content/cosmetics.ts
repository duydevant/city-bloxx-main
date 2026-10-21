import type { ClassId } from "./progression";
export type CosmeticCategory = "building" | "roof" | "crane" | "badge";
export type CosmeticSet = "default" | "brick" | "winter" | "season";
export type CosmeticRule = "free" | "completed" | "perfect" | "daily" | "collection" | "event" | "season";
export interface CosmeticItem {
  id: string; version: "cosmetics-1"; category: CosmeticCategory; classId: ClassId | null;
  set: CosmeticSet; assets: string[]; available: boolean;
  rule: CosmeticRule; target: number;
  coinPrice?: number;
  title: { en: string; vi: string };
}
export const BRICK_AVAILABLE = true; // Complete pack imported; hashes and canonical geometry checked by asset QA.
export const WINTER_AVAILABLE = true;
export const SEASON_AVAILABLE = true;
const classes: ClassId[] = ["residential", "industrial", "office", "highrise"];
const names = { residential: ["Residential", "Nhà ở"], industrial: ["Industrial", "Công nghiệp"], office: ["Office", "Văn phòng"], highrise: ["High-rise", "Cao tầng"] };
export const COSMETIC_CATALOG: readonly CosmeticItem[] = Object.freeze([
  ...classes.flatMap(classId => (["default", "brick"] as const).flatMap(set => (["building", "roof"] as const).map(category => ({
    id: `${set}-${category}-${classId}`, version: "cosmetics-1" as const, category, classId, set,
    assets: [...(category === "building" ? ["base", "mid"] : ["roof"]).map(part => `stack/${set}/bldg_${classId}_${set}_${part}.png`), ...(category === "building" ? [`city/${set}/city_${classId}_${set}_mini.png`] : [])],
    available: set === "default" || BRICK_AVAILABLE, rule: set === "default" ? "free" as const : category === "building" ? "completed" as const : "perfect" as const,
    target: set === "default" ? 0 : category === "building" ? 20 : 50,
    coinPrice: set === "default" ? 0 : category === "building" ? 250 : 200,
    title: { en: `${set === "brick" ? "Classic Brick" : "Default"} ${names[classId][0]} ${category}`, vi: `${set === "brick" ? "Gạch cổ điển" : "Mặc định"} ${category === "building" ? "nhà" : "mái"} ${names[classId][1]}` },
  })))),
  ...(["default", "brick"] as const).map(set => ({ id: `${set}-crane`, version: "cosmetics-1" as const, category: "crane" as const, classId: null, set,
    assets: ["rig", "hook"].map(part => `${set === "default" ? "stack" : "rig"}/${set}/crane_${part}_${set}_sprite.png`), available: set === "default" || BRICK_AVAILABLE,
    rule: set === "default" ? "free" as const : "daily" as const, target: set === "default" ? 0 : 7,
    coinPrice: set === "default" ? 0 : 400,
    title: { en: `${set === "brick" ? "Classic Brick" : "Default"} crane`, vi: `${set === "brick" ? "Gạch cổ điển" : "Mặc định"} cần cẩu` } })),
  { id: "brick-badge", version: "cosmetics-1", category: "badge", classId: null, set: "brick", assets: ["ui/brick/collection-badge.svg"], available: BRICK_AVAILABLE,
    rule: "collection", target: 9, coinPrice: 0, title: { en: "Classic Brick collection", vi: "Bộ sưu tập Gạch cổ điển" } },
  { id: "winter-crane", version: "cosmetics-1", category: "crane", classId: null, set: "winter",
    assets: ["rig/winter/crane_rig_winter_sprite.png", "rig/winter/crane_hook_winter_sprite.png"], available: WINTER_AVAILABLE,
    rule: "event", target: 1, coinPrice: 500, title: { en: "Winter Frost crane", vi: "Cần cẩu Sương giá Mùa đông" } },
  { id: "winter-roof-residential", version: "cosmetics-1", category: "roof", classId: "residential", set: "winter",
    assets: ["stack/winter/bldg_residential_winter_roof.png"], available: WINTER_AVAILABLE,
    rule: "event", target: 1, coinPrice: 350, title: { en: "Winter Frost Residential roof", vi: "Mái Sương giá Mùa đông Nhà ở" } },
  { id: "winter-badge", version: "cosmetics-1", category: "badge", classId: null, set: "winter",
    assets: ["ui/winter/event-badge.svg"], available: WINTER_AVAILABLE,
    rule: "event", target: 3, coinPrice: 0, title: { en: "Winter Event badge", vi: "Huy hiệu Sự kiện Mùa đông" } },
  { id: "season-badge", version: "cosmetics-1", category: "badge", classId: null, set: "season",
    assets: ["ui/season/season-badge.svg"], available: SEASON_AVAILABLE,
    rule: "season", target: 10, coinPrice: 0, title: { en: "Season 1 badge", vi: "Huy hiệu Mùa 1" } },
  { id: "season-crane", version: "cosmetics-1", category: "crane", classId: null, set: "season",
    assets: ["rig/season/crane_rig_season_sprite.png", "rig/season/crane_hook_season_sprite.png"], available: SEASON_AVAILABLE,
    rule: "season", target: 20, coinPrice: 600, title: { en: "Season 1 Golden crane", vi: "Cần cẩu Vàng Mùa 1" } },
]);
