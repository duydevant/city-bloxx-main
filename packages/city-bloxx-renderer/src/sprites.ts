import type { BuildingId } from "../../city-bloxx-core/src/buildings";
export type BuildingPart = "base" | "mid" | "roof";
export interface SourceRect { x: number; y: number; width: number; height: number }
// Measured approved Brick anchors, kept separate from physics/default geometry.
export const BRICK_ANCHORS = { crane: { x:64,y:96,width:896,height:320,pulley:{x:876,y:316},scale:995*.4/896 }, hook: { eye:{x:64,y:16},tip:{x:64,y:112},scale:Math.hypot(1.5,55)/96,rotation:Math.atan2(1.5,55) } } as const;

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
export function buildingSourceRect(building: BuildingId, part: BuildingPart, set: "default" | "brick" | "winter" | "season" = "default"): SourceRect {
  if (set === "brick" || set === "winter" || set === "season") return { x:160,y:48,width:192,height:160 };
  return part === "roof" ? { x:128,y:32,width:256,height:160 } : BUILDING_BODY_RECTS[building][part];
}
