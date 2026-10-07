import type { BuildingId } from "../../city-bloxx-core/src/buildings";
export type BuildingPart = "base" | "mid" | "roof";
export interface SourceRect { x: number; y: number; width: number; height: number }

// Measured solid facade bounds of the currently approved v001 PNGs, not canvas padding.
// Each rect maps to the same 144x120 world body. Update these on compact-v3 import.
export const BUILDING_BODY_RECTS: Readonly<Record<BuildingId, Readonly<Record<"base" | "mid", SourceRect>>>> = {
  residential: {
    base: { x:130,y:64,width:252,height:128 }, mid: { x:131,y:64,width:250,height:128 },
  },
  industrial: {
    base: { x:135,y:69,width:243,height:119 }, mid: { x:136,y:69,width:240,height:119 },
  },
  office: {
    base: { x:129,y:64,width:255,height:128 }, mid: { x:131,y:81,width:251,height:94 },
  },
  highrise: {
    base: { x:127,y:61,width:258,height:132 }, mid: { x:126,y:75,width:260,height:108 },
  },
};
export function buildingSourceRect(building: BuildingId, part: BuildingPart): SourceRect {
  return part === "roof" ? { x:128,y:32,width:256,height:160 } : BUILDING_BODY_RECTS[building][part];
}
