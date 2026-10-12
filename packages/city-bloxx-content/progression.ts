export type Difficulty = "easy" | "medium" | "hard";
export type MissionKind = "landed" | "perfect" | "quick-height" | "daily-complete" | "city-accepted" | "roof-hit";
export type ClassId = "residential" | "industrial" | "office" | "highrise";
export interface MissionDefinition {
  id: string; version: "missions-1"; kind: MissionKind; target: number; difficulty: Difficulty; xp: number;
  nonAssist: boolean; cityClass: ClassId | null; title: { en: string; vi: string };
}
export type AchievementMetric = "perfect" | "streak" | "height" | "class" | "city" | "roof" | "daily";
export interface AchievementDefinition {
  id: string; version: "achievements-1"; metric: AchievementMetric; target: number; classId: ClassId | null;
  xp: number; title: { en: string; vi: string };
}
export const PROGRESSION_RULES = Object.freeze({ version: "progression-1", curve: 100, builderCap: 50, masteryCap: 20, dailyFirstComplete: 50, achievementXP: 50, claimDays: 7, missionXP: { easy: 20, medium: 40, hard: 60 } } as const);
const mission = (id: string, kind: MissionKind, target: number, difficulty: Difficulty, en: string, vi: string, nonAssist = false, cityClass: ClassId | null = null): MissionDefinition => ({
  id, version: "missions-1", kind, target, difficulty, xp: PROGRESSION_RULES.missionXP[difficulty], nonAssist, cityClass, title: { en, vi },
});
export const MISSION_CATALOG: readonly MissionDefinition[] = Object.freeze([
  mission("land-10", "landed", 10, "easy", "Land 10 scored body floors", "Đáp 10 tầng thân được chấm"),
  mission("land-25", "landed", 25, "medium", "Land 25 scored body floors", "Đáp 25 tầng thân được chấm"),
  mission("land-50", "landed", 50, "hard", "Land 50 scored body floors", "Đáp 50 tầng thân được chấm"),
  mission("perfect-3", "perfect", 3, "easy", "Place 3 Perfect body floors", "Đặt 3 tầng thân Hoàn hảo"),
  mission("perfect-10", "perfect", 10, "medium", "Place 10 Perfect body floors", "Đặt 10 tầng thân Hoàn hảo", true),
  mission("perfect-25", "perfect", 25, "hard", "Place 25 Perfect body floors", "Đặt 25 tầng thân Hoàn hảo", true),
  mission("quick-10", "quick-height", 10, "easy", "Reach 10 floors in one Quick run", "Đạt 10 tầng trong một lượt Quick"),
  mission("quick-20", "quick-height", 20, "medium", "Reach 20 floors in one Quick run", "Đạt 20 tầng trong một lượt Quick", true),
  mission("quick-30", "quick-height", 30, "hard", "Reach 30 floors in one Quick run", "Đạt 30 tầng trong một lượt Quick", true),
  mission("daily-complete", "daily-complete", 1, "medium", "Complete one Daily body", "Hoàn thành một thân tháp Daily"),
  mission("city-accept", "city-accepted", 1, "hard", "Accept one complete City tower", "Nhận một tháp City hoàn thành"),
  mission("roof-hit", "roof-hit", 1, "hard", "Land one completed tower's roof", "Đặt mái thành công cho một tháp hoàn thành"),
  mission("city-industrial", "city-accepted", 1, "hard", "Accept a complete Industrial City tower", "Nhận một tháp Công nghiệp City hoàn thành", true, "industrial"),
  mission("city-office", "city-accepted", 1, "hard", "Accept a complete Office City tower", "Nhận một tháp Văn phòng City hoàn thành", true, "office"),
  mission("city-highrise", "city-accepted", 1, "hard", "Accept a complete High-rise City tower", "Nhận một tháp Cao tầng City hoàn thành", true, "highrise"),
]);
export const MISSION_FALLBACKS: readonly MissionDefinition[] = Object.freeze([
  mission("fallback-easy", "landed", 10, "easy", "Land 10 scored body floors", "Đáp 10 tầng thân được chấm"),
  mission("fallback-medium", "landed", 25, "medium", "Land 25 scored body floors", "Đáp 25 tầng thân được chấm"),
  mission("fallback-hard", "landed", 50, "hard", "Land 50 scored body floors", "Đáp 50 tầng thân được chấm"),
]);
const achievement = (id: string, metric: AchievementMetric, target: number, en: string, vi: string, classId: ClassId | null = null): AchievementDefinition => ({
  id, version: "achievements-1", metric, target, classId, xp: PROGRESSION_RULES.achievementXP, title: { en, vi },
});
export const ACHIEVEMENT_CATALOG: readonly AchievementDefinition[] = Object.freeze([
  ...[1, 10, 100, 1000].map(n => achievement(`perfect-${n}`, "perfect", n, `${n} Perfect body floors`, `${n} tầng thân Hoàn hảo`)),
  ...[5, 10, 20].map(n => achievement(`streak-${n}`, "streak", n, `Perfect streak of ${n}`, `Chuỗi ${n} tầng Hoàn hảo`)),
  ...[25, 50, 100].map(n => achievement(`height-${n}`, "height", n, `Quick Standard: ${n} floors`, `Quick Tiêu chuẩn: ${n} tầng`)),
  achievement("class-residential", "class", 1, "Complete a Residential body", "Hoàn thành thân tháp Nhà ở", "residential"),
  achievement("class-industrial", "class", 1, "Complete an Industrial body", "Hoàn thành thân tháp Công nghiệp", "industrial"),
  achievement("class-office", "class", 1, "Complete an Office body", "Hoàn thành thân tháp Văn phòng", "office"),
  achievement("class-highrise", "class", 1, "Complete a High-rise body", "Hoàn thành thân tháp Cao tầng", "highrise"),
  ...[1, 5, 25].map(n => achievement(`city-${n}`, "city", n, `${n} complete City placements`, `${n} công trình City hoàn thành được nhận`)),
  ...[1, 10].map(n => achievement(`roof-${n}`, "roof", n, `${n} Perfect roofs`, `${n} mái Hoàn hảo`)),
  achievement("daily-7", "daily", 7, "Seven credited Daily days", "Bảy ngày Daily đã được tính"),
]);
