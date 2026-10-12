import type { ClassId } from "./progression";
export type CosmeticCategory = "building" | "roof" | "crane" | "badge";
export interface CosmeticItem {
  id: string; version: "cosmetics-1"; category: CosmeticCategory; classId: ClassId | null;
  set: "default" | "brick"; assets: string[]; available: boolean;
  rule: "free" | "completed" | "perfect" | "daily" | "collection"; target: number;
  title: { en: string; vi: string };
}
export const BRICK_AVAILABLE = true; // Complete pack imported; hashes and canonical geometry checked by asset QA.
const classes: ClassId[] = ["residential", "industrial", "office", "highrise"];
const names = { residential: ["Residential", "Nhà ở"], industrial: ["Industrial", "Công nghiệp"], office: ["Office", "Văn phòng"], highrise: ["High-rise", "Cao tầng"] };
export const COSMETIC_CATALOG: readonly CosmeticItem[] = Object.freeze([
  ...classes.flatMap(classId => (["default", "brick"] as const).flatMap(set => (["building", "roof"] as const).map(category => ({
    id: `${set}-${category}-${classId}`, version: "cosmetics-1" as const, category, classId, set,
    assets: [...(category === "building" ? ["base", "mid"] : ["roof"]).map(part => `stack/${set}/bldg_${classId}_${set}_${part}.png`), ...(category === "building" ? [`city/${set}/city_${classId}_${set}_mini.png`] : [])],
    available: set === "default" || BRICK_AVAILABLE, rule: set === "default" ? "free" as const : category === "building" ? "completed" as const : "perfect" as const,
    target: set === "default" ? 0 : category === "building" ? 20 : 50,
    title: { en: `${set === "brick" ? "Classic Brick" : "Default"} ${names[classId][0]} ${category}`, vi: `${set === "brick" ? "Gạch cổ điển" : "Mặc định"} ${category === "building" ? "nhà" : "mái"} ${names[classId][1]}` },
  })))),
  ...(["default", "brick"] as const).map(set => ({ id: `${set}-crane`, version: "cosmetics-1" as const, category: "crane" as const, classId: null, set,
    assets: ["rig", "hook"].map(part => `${set === "default" ? "stack" : "rig"}/${set}/crane_${part}_${set}_sprite.png`), available: set === "default" || BRICK_AVAILABLE,
    rule: set === "default" ? "free" as const : "daily" as const, target: set === "default" ? 0 : 7, title: { en: `${set === "brick" ? "Classic Brick" : "Default"} crane`, vi: `${set === "brick" ? "Gạch cổ điển" : "Mặc định"} cần cẩu` } })),
  { id: "brick-badge", version: "cosmetics-1", category: "badge", classId: null, set: "brick", assets: ["ui/brick/collection-badge.svg"], available: BRICK_AVAILABLE,
    rule: "collection", target: 9, title: { en: "Classic Brick collection", vi: "Bộ sưu tập Gạch cổ điển" } },
]);
