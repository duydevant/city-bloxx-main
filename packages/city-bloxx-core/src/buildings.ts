export const BUILDING_IDS = ["residential", "industrial", "office", "highrise"] as const;
export type BuildingId = typeof BUILDING_IDS[number];
export const BUILDINGS = Object.freeze({
  residential: { floors: 10, population: 10, requires: [] as BuildingId[], color: "#4B91D1" },
  industrial: { floors: 20, population: 20, requires: ["residential"] as BuildingId[], color: "#C45B4E" },
  office: { floors: 30, population: 30, requires: ["residential", "industrial"] as BuildingId[], color: "#4B9D89" },
  highrise: { floors: 40, population: 40, requires: ["residential", "industrial", "office"] as BuildingId[], color: "#D9B34C" },
});
export function isBuildingId(value: unknown): value is BuildingId {
  return typeof value === "string" && BUILDING_IDS.includes(value as BuildingId);
}
