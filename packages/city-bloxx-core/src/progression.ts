import { ACHIEVEMENT_CATALOG, MISSION_CATALOG, MISSION_FALLBACKS, PROGRESSION_RULES, type AchievementDefinition } from "../../city-bloxx-content/progression";
import { BUILDING_IDS, type BuildingId } from "./buildings";
import { isUTCDate, utcDate } from "./daily";
import { acceptedMission, checkedAdd, DIFFICULTIES, missionExpired, refreshMissions, rerollMission, updateRunMissions, validateMissionCatalog } from "./missions";
import { addSeasonSPWithReceipt, BUNDLED_LIVEOPS_MANIFEST, emptyLiveOpsSave, updateRunWeeklyContracts } from "./c7-modes-liveops";
import type { ProgressionState } from "./progression-types";
import type { GameSave } from "./save-state";
import type { RunSummary } from "./tracking";
export type { ProgressionState } from "./progression-types";

const integer = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const tag = (n: unknown): n is string => typeof n === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(n);
const date = (n: unknown) => n === null || isUTCDate(n);
const classMap = (): Record<BuildingId, number> => Object.fromEntries(BUILDING_IDS.map(id => [id, 0])) as Record<BuildingId, number>;
export function emptyProgression(): ProgressionState {
  return { version: 1, catalogVersion: "progression-1", xp: 0, masteryXP: classMap(), achievements: [], unlocks: [],
    counts: { perfect: 0, streak: 0, height: 0, classes: classMap(), city: 0, roof: 0, daily: 0 },
    missionDays: [], latestMissionDate: null, cursors: [], latestDailyBonusDate: null, acceptedCityReceipt: 0 };
}
export function levelProgress(xp: number, cap = PROGRESSION_RULES.builderCap as number) {
  if (!integer(xp) || !Number.isInteger(cap) || cap < 1 || cap > 50) throw new Error("Invalid level bounds");
  const level = Math.min(cap, Math.floor(Math.sqrt(xp / PROGRESSION_RULES.curve)) + 1);
  const minimum = PROGRESSION_RULES.curve * (level - 1) ** 2;
  const next = level === cap ? null : PROGRESSION_RULES.curve * level ** 2;
  return { level, minimum, next, progress: next === null ? 1 : (xp - minimum) / (next - minimum), remaining: next === null ? 0 : next - xp };
}
export function validateAchievementCatalog(catalog: readonly AchievementDefinition[] = ACHIEVEMENT_CATALOG): void {
  if (!Array.isArray(catalog) || catalog.length > 128 || new Set(catalog.map(d => d?.id)).size !== catalog.length) throw new Error("Invalid achievement catalog");
  for (const d of catalog) if (!d || !tag(d.id) || d.version !== "achievements-1" || !["perfect", "streak", "height", "class", "city", "roof", "daily"].includes(d.metric) ||
    !integer(d.target) || d.target < 1 || d.target > 1000000 || !integer(d.xp) || d.xp > 10000 || !(d.classId === null || BUILDING_IDS.includes(d.classId)) || (d.metric === "class") !== (d.classId !== null) ||
    !d.title || ![d.title.en, d.title.vi].every(v => typeof v === "string" && v.length > 0 && v.length <= 160)) throw new Error("Invalid achievement definition");
}
export function normalizeProgression(save: GameSave): ProgressionState {
  const p = save.progression;
  if (!p || p.version !== 1 || !integer(p.xp) || !p.masteryXP || !BUILDING_IDS.every(k => integer(p.masteryXP[k])) || !Array.isArray(p.achievements) || p.achievements.length > 128 || !p.achievements.every(tag) || new Set(p.achievements).size !== p.achievements.length) throw new Error("Invalid progression; original preserved");
  // C4.0 counters migrate without paying for historical events.
  if (p.catalogVersion === undefined && p.counts === undefined && p.missionDays === undefined) {
    const modes = [save.stats.byMode["quick-standard"], save.stats.byMode.city, save.stats.byMode.daily];
    const seed = emptyProgression();
    const completedDates = save.daily.days.filter(d => d.bestComplete).map(d => d.dateUTC).sort();
    return { ...seed, xp: p.xp, masteryXP: { ...p.masteryXP }, achievements: [...p.achievements],
      counts: { perfect: modes.reduce((n, m) => checkedAdd(n, m.quality.perfect), 0), streak: Math.max(...modes.map(m => m.bestStreak)), height: save.stats.byMode["quick-standard"].bestHeight,
        classes: Object.fromEntries(BUILDING_IDS.map(id => [id, save.stats.byClass[id].completed])) as Record<BuildingId, number>, city: save.city.stats.completed,
        roof: modes.reduce((n, m) => checkedAdd(n, m.roof.perfect), 0), daily: save.daily.lifetimeCreditedDays },
      latestDailyBonusDate: completedDates[completedDates.length - 1] ?? null,
      acceptedCityReceipt: save.city.nextRun - 1 - Number(!!save.city.pending) };
  }
  const c = p.counts;
  if (p.catalogVersion !== "progression-1" || !c || ![c.perfect, c.streak, c.height, c.city, c.roof, c.daily].every(integer) || !c.classes || !BUILDING_IDS.every(k => integer(c.classes[k])) ||
    !date(p.latestMissionDate) || !date(p.latestDailyBonusDate) || !integer(p.acceptedCityReceipt) || p.acceptedCityReceipt >= save.city.nextRun ||
    !Array.isArray(p.unlocks) || p.unlocks.length > 128 || new Set(p.unlocks.map(u => u?.id)).size !== p.unlocks.length || !p.unlocks.every(u => u && tag(u.id) && tag(u.version) && integer(u.at) && integer(u.xp) && p.achievements.includes(u.id)) ||
    !Array.isArray(p.missionDays) || p.missionDays.length > 7 || new Set(p.missionDays.map(d => d?.dateUTC)).size !== p.missionDays.length || !Array.isArray(p.cursors) || p.cursors.length > 8 || new Set(p.cursors.map(c => c?.sequence)).size !== p.cursors.length) throw new Error("Invalid progression receipts");
  for (const d of p.missionDays) {
    if (!d || !isUTCDate(d.dateUTC) || !p.latestMissionDate || d.dateUTC > p.latestMissionDate || missionExpired(d.dateUTC, p.latestMissionDate) || d.version !== "missions-1" || typeof d.rerolled !== "boolean" ||
      !Array.isArray(d.unlocked) || !d.unlocked.includes("residential") || d.unlocked.some(id => !BUILDING_IDS.includes(id)) || new Set(d.unlocked).size !== d.unlocked.length || !Array.isArray(d.slots) || d.slots.length !== 3) throw new Error("Invalid mission day");
    validateMissionCatalog(d.slots.map(s => s.definition));
    d.slots.forEach((s, i) => {
      const rule = [...MISSION_CATALOG, ...MISSION_FALLBACKS].find(rule => rule.id === s.definition.id && rule.version === s.definition.version);
      if (!rule || (["kind", "target", "difficulty", "xp", "nonAssist", "cityClass"] as const).some(key => rule[key] !== s.definition[key])) throw new Error("Unsupported mission rule; original preserved");
      if (s.definition.difficulty !== DIFFICULTIES[i] || s.definition.cityClass !== null && !d.unlocked.includes(s.definition.cityClass) || !integer(s.progress) || s.progress > s.definition.target ||
        !["active", "ready", "claimed"].includes(s.status) || (s.status === "active") !== (s.progress < s.definition.target) ||
        (s.status === "active" ? s.completedAt !== null : !integer(s.completedAt)) || (s.status === "claimed" ? !integer(s.claimedAt) || s.claimedAt! < s.completedAt! : s.claimedAt !== null)) throw new Error("Invalid mission receipt");
    });
  }
  for (const c of p.cursors) if (!c || !integer(c.sequence) || c.sequence < 1 || c.sequence >= save.tracking.nextSequence || !isUTCDate(c.dateUTC) || ![c.landed, c.perfect, c.height, c.dailyComplete, c.roofHit].every(integer) || c.perfect > c.landed || c.dailyComplete > 1 || c.roofHit > 1 ||
    ![save.tracking.activeQuick?.identity.sequence, save.tracking.pendingCity?.identity.sequence, save.daily.pending?.identity.sequence].includes(c.sequence) || save.tracking.settled.some(([lo, hi]) => c.sequence >= lo && c.sequence <= hi)) throw new Error("Invalid mission cursor");
  return JSON.parse(JSON.stringify(p));
}
export function achievementProgress(p: ProgressionState, d: AchievementDefinition): number {
  return Math.min(d.target, d.metric === "class" ? p.counts.classes[d.classId!] : p.counts[d.metric]);
}
function award(p: ProgressionState, at: number, eligible: (d: AchievementDefinition) => boolean): ProgressionState {
  validateAchievementCatalog();
  const unlocked = ACHIEVEMENT_CATALOG.filter(d => !p.achievements.includes(d.id) && eligible(d) && achievementProgress(p, d) >= d.target);
  return { ...p, xp: unlocked.reduce((n, d) => checkedAdd(n, d.xp), p.xp), achievements: [...p.achievements, ...unlocked.map(d => d.id)], unlocks: [...p.unlocks, ...unlocked.map(d => ({ id: d.id, version: d.version, at, xp: d.xp }))] };
}
export function settleProgression(save: GameSave, summary: RunSummary, baseXP: number, dailyCount: number): ProgressionState {
  if (summary.mode === "one-drop") {
    return { ...save.progression, cursors: save.progression.cursors.filter(c => c.sequence !== summary.identity.sequence) };
  }
  let p = updateRunMissions(save.progression, summary, save.tracking.installationId, save.city.unlocked, summary.endedAt);
  p = { ...p, xp: checkedAdd(p.xp, baseXP), masteryXP: { ...p.masteryXP, [summary.building]: checkedAdd(p.masteryXP[summary.building], baseXP) }, cursors: p.cursors.filter(c => c.sequence !== summary.identity.sequence) };
  if (!summary.metrics) return p;
  const dailyDate = summary.daily?.dateUTC;
  if (summary.complete && dailyDate && (!p.latestDailyBonusDate || dailyDate > p.latestDailyBonusDate)) p = { ...p, xp: checkedAdd(p.xp, PROGRESSION_RULES.dailyFirstComplete), latestDailyBonusDate: dailyDate };
  const perfect = summary.assist ? 0 : summary.metrics.body.perfect, roof = Number(summary.metrics.roof === "perfect");
  const newDaily = dailyCount > p.counts.daily;
  p = { ...p, counts: { ...p.counts, perfect: checkedAdd(p.counts.perfect, perfect), streak: summary.assist ? p.counts.streak : Math.max(p.counts.streak, summary.result.bestStreak),
    height: summary.mode === "quick" && !summary.assist ? Math.max(p.counts.height, summary.result.height) : p.counts.height,
    classes: { ...p.counts.classes, [summary.building]: checkedAdd(p.counts.classes[summary.building], Number(summary.complete)) }, roof: checkedAdd(p.counts.roof, roof), daily: Math.max(p.counts.daily, dailyCount) } };
  return award(p, summary.endedAt, d => d.metric === "perfect" ? perfect > 0 : d.metric === "streak" ? !summary.assist && summary.result.bestStreak >= d.target : d.metric === "height" ? summary.mode === "quick" && !summary.assist && summary.result.height >= d.target : d.metric === "class" ? summary.complete && summary.building === d.classId : d.metric === "roof" ? roof > 0 : d.metric === "daily" ? newDaily : false);
}
export function recordRunProgress(save: GameSave, summary: RunSummary): GameSave {
  if (summary.mode === "one-drop") return save;
  if (save.tracking.settled.some(([lo, hi]) => summary.identity.sequence >= lo && summary.identity.sequence <= hi)) return save;
  const liveOps = save.liveOps ?? emptyLiveOpsSave();
  return {
    ...save,
    progression: updateRunMissions(save.progression, summary, save.tracking.installationId, save.city.unlocked, summary.endedAt),
    liveOps: {
      ...liveOps,
      weekly: updateRunWeeklyContracts(liveOps.weekly, summary, save.city.unlocked, summary.endedAt),
    },
  };
}
export function ensureMissions(save: GameSave, at: number): GameSave {
  const progression = refreshMissions(save.progression, utcDate(at), save.tracking.installationId || "local", save.city.unlocked);
  return progression === save.progression ? save : { ...save, progression };
}
export function claimMission(save: GameSave, date: string, id: string, at: number): GameSave {
  const next = ensureMissions(save, at), p = next.progression;
  const day = p.missionDays.find(d => d.dateUTC === date), slot = day?.slots.find(s => s.definition.id === id);
  if (!slot || slot.status !== "ready" || at < slot.completedAt! || date > utcDate(at) || missionExpired(date, p.latestMissionDate!)) return next;
  const liveOps = next.liveOps ?? emptyLiveOpsSave();
  const freeSeason = addSeasonSPWithReceipt(
    liveOps.freeSeason,
    `mission:${date}:${id}`,
    BUNDLED_LIVEOPS_MANIFEST.freeSeason.spSources.dailyMissionClaim,
    at,
    BUNDLED_LIVEOPS_MANIFEST,
  );
  return {
    ...next,
    progression: { ...p, xp: checkedAdd(p.xp, slot.definition.xp), missionDays: p.missionDays.map(d => d !== day ? d : { ...d, slots: d.slots.map(s => s !== slot ? s : { ...s, status: "claimed", claimedAt: at }) }) },
    liveOps: { ...liveOps, freeSeason },
  };
}
export function rerollSaveMission(save: GameSave, date: string, id: string, at: number): GameSave {
  const next = ensureMissions(save, at);
  return { ...next, progression: rerollMission(next.progression, date, id, next.tracking.installationId, at) };
}
export function acceptedProgression(save: GameSave, summary: RunSummary, cityRunId: string, at: number): ProgressionState {
  const receipt = Number(cityRunId.slice(5));
  if (!integer(receipt) || receipt <= save.progression.acceptedCityReceipt) return save.progression;
  let p = ensureMissions(save, at).progression;
  p = { ...p, acceptedCityReceipt: receipt };
  if (!summary.complete) return p;
  p = refreshMissions(p, utcDate(summary.startedAt), save.tracking.installationId, save.city.unlocked);
  p = acceptedMission(p, utcDate(summary.startedAt), summary.building, at);
  p = { ...p, counts: { ...p.counts, city: checkedAdd(p.counts.city, 1) } };
  return award(p, at, d => d.metric === "city");
}
