import type { BuildingId, PlacementQuality } from "../../city-bloxx-core/src/index";
export const POPULATION_SPRITES: Record<BuildingId, Record<PlacementQuality, number>> = {
  residential:{perfect:4,great:3,good:2,risky:1,miss:0},
  industrial:{perfect:6,great:4,good:3,risky:2,miss:0},
  office:{perfect:8,great:6,good:4,risky:3,miss:0},
  highrise:{perfect:10,great:8,good:6,risky:4,miss:0},
};
export const POPULATION_DURATION = 3.6;
export function parachutePose(index: number, count: number, elapsed: number) {
  const progress = Math.max(0,Math.min(1,(elapsed-index*.12)/2.4));
  return { progress, spread:(index-(count-1)/2)*55*(1-progress),
    lift:260*(1-progress), alpha:Math.min(1,progress*12,Math.max(0,(1-progress)*12)) };
}
