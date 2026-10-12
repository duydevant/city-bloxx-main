import type { MissionDefinition } from "../../city-bloxx-content/progression";
import type { BuildingId } from "./buildings";

export interface MissionSlot {
  definition: MissionDefinition; progress: number; status: "active" | "ready" | "claimed" | "expired";
  completedAt: number | null; claimedAt: number | null;
}
export interface MissionDay { dateUTC: string; version: "missions-1"; unlocked: BuildingId[]; slots: MissionSlot[]; rerolled: boolean }
export interface RunMissionCursor {
  sequence: number; dateUTC: string; landed: number; perfect: number; height: number; dailyComplete: number; roofHit: number;
}
export interface AchievementCounts {
  perfect: number; streak: number; height: number; classes: Record<BuildingId, number>; city: number; roof: number; daily: number;
}
export interface ProgressionState {
  version: 1; catalogVersion: "progression-1"; xp: number; masteryXP: Record<BuildingId, number>; achievements: string[];
  unlocks: { id: string; version: string; at: number; xp: number }[]; counts: AchievementCounts;
  missionDays: MissionDay[]; latestMissionDate: string | null; cursors: RunMissionCursor[];
  latestDailyBonusDate: string | null; acceptedCityReceipt: number;
}
