import type { ClassId } from "./progression";

export type DistrictId = "downtown" | "harbor";
export const DISTRICT_IDS: readonly DistrictId[] = Object.freeze(["downtown", "harbor"] as const);
export function isDistrictId(value: unknown): value is DistrictId {
  return value === "downtown" || value === "harbor";
}

export type LandmarkId = "dock_clock_tower";
export const LANDMARK_IDS: readonly LandmarkId[] = Object.freeze(["dock_clock_tower"] as const);
export function isLandmarkId(value: unknown): value is LandmarkId {
  return value === "dock_clock_tower";
}

export type CityEvolutionStageId = "village" | "town" | "city" | "metro" | "metropolis" | "megacity";
export const CITY_EVOLUTION_STAGE_IDS: readonly CityEvolutionStageId[] = Object.freeze([
  "village",
  "town",
  "city",
  "metro",
  "metropolis",
  "megacity",
] as const);
export function isEvolutionStageId(value: unknown): value is CityEvolutionStageId {
  return typeof value === "string" && (CITY_EVOLUTION_STAGE_IDS as readonly string[]).includes(value);
}

export interface DistrictGoalSpec {
  completedTowers: number;
  requiredClasses: readonly ClassId[];
  population: number;
  topRatedTowers: number;
}

export interface LandmarkDefinition {
  id: LandmarkId;
  version: "landmarks-1";
  districtId: DistrictId;
  asset: string;
  anchor: { x: number; y: number; width: number; height: number };
  title: { en: string; vi: string };
  description: { en: string; vi: string };
}

export interface DistrictDefinition {
  id: DistrictId;
  version: "districts-1";
  gridWidth: 5;
  gridHeight: 5;
  lotCount: 25;
  backgroundAsset: string;
  thumbnailAsset: string;
  unlockRequiresDistrictId: DistrictId | null;
  goal: DistrictGoalSpec;
  landmark: LandmarkDefinition | null;
  title: { en: string; vi: string };
  subtitle: { en: string; vi: string };
}

export interface CityEvolutionStageDefinition {
  id: CityEvolutionStageId;
  rank: number;
  minPopulation: number;
  maxPopulationExclusive: number | null;
  accent: string;
  title: { en: string; vi: string };
}

export const DOCK_CLOCK_TOWER_LANDMARK: Readonly<LandmarkDefinition> = Object.freeze({
  id: "dock_clock_tower",
  version: "landmarks-1",
  districtId: "harbor",
  asset: "city/harbor/landmark_dock_clock_tower_mini.png",
  anchor: { x: 128, y: 320, width: 256, height: 384 },
  title: { en: "Dock Clock Tower", vi: "Tháp Đồng hồ Cảng" },
  description: {
    en: "Free Harbor completion landmark placed in the dedicated plaza slot outside the 25-lot grid.",
    vi: "Công trình biểu tượng miễn phí khi hoàn thành Cảng, đặt tại ô quảng trường riêng ngoài lưới 25 lô.",
  },
});

export const DISTRICT_CATALOG: readonly DistrictDefinition[] = Object.freeze([
  {
    id: "downtown",
    version: "districts-1",
    gridWidth: 5,
    gridHeight: 5,
    lotCount: 25,
    backgroundAsset: "bg/default/bg_downtown_default_map.png",
    thumbnailAsset: "bg/default/bg_downtown_default_map.png",
    unlockRequiresDistrictId: null,
    goal: {
      completedTowers: 12,
      requiredClasses: ["residential", "industrial", "office", "highrise"],
      population: 8000,
      topRatedTowers: 3,
    },
    landmark: null,
    title: { en: "Downtown", vi: "Trung tâm" },
    subtitle: {
      en: "Starter 5×5 civic core",
      vi: "Khu lõi đô thị 5×5 khởi đầu",
    },
  },
  {
    id: "harbor",
    version: "districts-1",
    gridWidth: 5,
    gridHeight: 5,
    lotCount: 25,
    backgroundAsset: "bg/harbor/bg_harbor_default_map.png",
    thumbnailAsset: "bg/harbor/bg_harbor_default_thumb.png",
    unlockRequiresDistrictId: "downtown",
    goal: {
      completedTowers: 16,
      requiredClasses: [],
      population: 12000,
      topRatedTowers: 5,
    },
    landmark: DOCK_CLOCK_TOWER_LANDMARK,
    title: { en: "Harbor", vi: "Bến cảng" },
    subtitle: {
      en: "Coastal 5×5 dockside district",
      vi: "Quận bến cảng 5×5 ven biển",
    },
  },
]);

export const CITY_EVOLUTION_STAGES: readonly CityEvolutionStageDefinition[] = Object.freeze([
  {
    id: "village",
    rank: 0,
    minPopulation: 0,
    maxPopulationExclusive: 500,
    accent: "#7a9e7e",
    title: { en: "Village", vi: "Làng nhỏ" },
  },
  {
    id: "town",
    rank: 1,
    minPopulation: 500,
    maxPopulationExclusive: 2000,
    accent: "#4f8f9f",
    title: { en: "Town", vi: "Thị trấn" },
  },
  {
    id: "city",
    rank: 2,
    minPopulation: 2000,
    maxPopulationExclusive: 8000,
    accent: "#3f7bd8",
    title: { en: "City", vi: "Thành phố" },
  },
  {
    id: "metro",
    rank: 3,
    minPopulation: 8000,
    maxPopulationExclusive: 20000,
    accent: "#6e5bd9",
    title: { en: "Metro", vi: "Đô thị lớn" },
  },
  {
    id: "metropolis",
    rank: 4,
    minPopulation: 20000,
    maxPopulationExclusive: 50000,
    accent: "#c56b2d",
    title: { en: "Metropolis", vi: "Đại đô thị" },
  },
  {
    id: "megacity",
    rank: 5,
    minPopulation: 50000,
    maxPopulationExclusive: null,
    accent: "#d49b27",
    title: { en: "Megacity", vi: "Siêu đô thị" },
  },
]);
