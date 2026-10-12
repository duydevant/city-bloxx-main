import { MISSION_CATALOG, MISSION_FALLBACKS, PROGRESSION_RULES, type Difficulty, type MissionDefinition } from "../../city-bloxx-content/progression";
import { BUILDING_IDS, type BuildingId } from "./buildings";
import { isUTCDate, shiftUTCDate, utcDate } from "./daily";
import type { MissionDay, MissionSlot, ProgressionState, RunMissionCursor } from "./progression-types";
import type { RunSummary } from "./tracking";

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];
export function checkedAdd(a: number, b: number): number {
  const value = a + b;
  if (![a, b, value].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error("Reward/counter bounds exceeded; previous save preserved");
  return value;
}
const tag = (v: unknown) => typeof v === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(v);
export function validateMissionCatalog(catalog: readonly MissionDefinition[]): void {
  if (!Array.isArray(catalog) || catalog.length > 256 || new Set(catalog.map(d => d?.id)).size !== catalog.length) throw new Error("Invalid mission catalog");
  for (const d of catalog) {
    if (!d || !tag(d.id) || d.version !== "missions-1" || !DIFFICULTIES.includes(d.difficulty) || !["landed", "perfect", "quick-height", "daily-complete", "city-accepted", "roof-hit"].includes(d.kind) ||
      !Number.isSafeInteger(d.target) || d.target < 1 || d.target > 1000000 || !Number.isSafeInteger(d.xp) || d.xp < 0 || d.xp > 10000 || typeof d.nonAssist !== "boolean" ||
      !(d.cityClass === null || BUILDING_IDS.includes(d.cityClass)) || d.cityClass !== null && d.kind !== "city-accepted" || !d.title || ![d.title.en, d.title.vi].every(v => typeof v === "string" && v.length > 0 && v.length <= 160)) throw new Error("Invalid mission definition");
  }
}
function hash(key: string): number { let value = 2166136261; for (let i = 0; i < key.length; i++) value = Math.imul(value ^ key.charCodeAt(i), 16777619) >>> 0; return value; }
function slot(definition: MissionDefinition): MissionSlot { return { definition: JSON.parse(JSON.stringify(definition)), progress: 0, status: "active", completedAt: null, claimedAt: null }; }
function choose(date: string, installation: string, difficulty: Difficulty, unlocked: readonly BuildingId[], excluded: readonly string[], reroll: boolean, catalog: readonly MissionDefinition[]) {
  const pool = catalog.filter(d => d.difficulty === difficulty && !excluded.includes(d.id) && (d.cityClass === null || unlocked.includes(d.cityClass))).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return pool.length ? pool[hash(`missions-1|${date}|${installation}|${difficulty}|${reroll ? 1 : 0}`) % pool.length] : MISSION_FALLBACKS.find(d => d.difficulty === difficulty)!;
}
export function resolveMissions(date: string, installation: string, unlocked: readonly BuildingId[], catalog = MISSION_CATALOG): MissionDay {
  if (!isUTCDate(date) || !tag(installation) || !unlocked.includes("residential") || unlocked.some(id => !BUILDING_IDS.includes(id))) throw new Error("Invalid mission boundary");
  validateMissionCatalog(catalog);
  const slots: MissionSlot[] = [];
  for (const difficulty of DIFFICULTIES) slots.push(slot(choose(date, installation, difficulty, unlocked, slots.map(s => s.definition.id), false, catalog)));
  return { dateUTC: date, version: "missions-1", unlocked: [...unlocked], slots, rerolled: false };
}
export function missionExpired(date: string, currentDate: string): boolean { return currentDate >= shiftUTCDate(date, PROGRESSION_RULES.claimDays); }
export function refreshMissions(state: ProgressionState, date: string, installation: string, unlocked: readonly BuildingId[]): ProgressionState {
  if (!isUTCDate(date)) throw new Error("Invalid mission date");
  const latest = !state.latestMissionDate || date > state.latestMissionDate ? date : state.latestMissionDate;
  const days = state.missionDays.filter(d => !missionExpired(d.dateUTC, latest));
  if (!missionExpired(date, latest) && !days.some(d => d.dateUTC === date)) days.push(resolveMissions(date, installation, unlocked));
  days.sort((a, b) => a.dateUTC > b.dateUTC ? -1 : a.dateUTC < b.dateUTC ? 1 : 0);
  if (latest === state.latestMissionDate && days.length === state.missionDays.length && days.every((d, i) => d === state.missionDays[i])) return state;
  return { ...state, latestMissionDate: latest, missionDays: days.slice(0, 7) };
}
function addProgress(s: MissionSlot, delta: number, maximum: boolean, at: number): MissionSlot {
  if (s.status !== "active") return s;
  const progress = Math.min(s.definition.target, maximum ? Math.max(s.progress, delta) : checkedAdd(s.progress, delta));
  return { ...s, progress, status: progress >= s.definition.target ? "ready" : "active", completedAt: progress >= s.definition.target ? at : null };
}
export function updateRunMissions(state: ProgressionState, summary: RunSummary, installation: string, unlocked: readonly BuildingId[], at: number): ProgressionState {
  if (!summary.metrics) return state;
  const dateUTC = utcDate(summary.startedAt), m = summary.metrics;
  let next = refreshMissions(state, utcDate(at), installation, unlocked);
  next = refreshMissions(next, dateUTC, installation, unlocked);
  const before = next.cursors.find(c => c.sequence === summary.identity.sequence) ?? { sequence: summary.identity.sequence, dateUTC, landed: 0, perfect: 0, height: 0, dailyComplete: 0, roofHit: 0 };
  if (before.dateUTC !== dateUTC) throw new Error("Mission run date changed");
  const cursor: RunMissionCursor = { sequence: before.sequence, dateUTC, landed: m.body.perfect + m.body.great + m.body.good + m.body.risky, perfect: m.body.perfect, height: summary.result.height,
    dailyComplete: Number(summary.mode === "daily" && summary.complete), roofHit: Number(!!m.roof && m.roof !== "miss") };
  if (["landed", "perfect", "height", "dailyComplete", "roofHit"].some(k => cursor[k as "landed"] < before[k as "landed"])) throw new Error("Mission progress cannot rewind");
  const days = next.missionDays.map(day => day.dateUTC !== dateUTC ? day : { ...day, slots: day.slots.map(s => {
    const d = s.definition;
    if (d.nonAssist && summary.assist) return s;
    if (d.kind === "landed") return addProgress(s, cursor.landed - before.landed, false, at);
    if (d.kind === "perfect") return addProgress(s, cursor.perfect - before.perfect, false, at);
    if (d.kind === "quick-height" && summary.mode === "quick") return addProgress(s, cursor.height, true, at);
    if (d.kind === "daily-complete") return addProgress(s, cursor.dailyComplete - before.dailyComplete, false, at);
    if (d.kind === "roof-hit") return addProgress(s, cursor.roofHit - before.roofHit, false, at);
    return s;
  }) });
  const cursors = [...next.cursors.filter(c => c.sequence !== cursor.sequence), cursor];
  if (cursors.length > 8) throw new Error("Too many active mission runs");
  return { ...next, missionDays: days, cursors };
}
export function acceptedMission(state: ProgressionState, date: string, classId: BuildingId, at: number): ProgressionState {
  return { ...state, missionDays: state.missionDays.map(day => day.dateUTC !== date ? day : { ...day, slots: day.slots.map(s => s.definition.kind === "city-accepted" && (s.definition.cityClass === null || s.definition.cityClass === classId) ? addProgress(s, 1, false, at) : s) }) };
}
export function rerollMission(state: ProgressionState, date: string, id: string, installation: string, at: number, catalog = MISSION_CATALOG): ProgressionState {
  validateMissionCatalog(catalog);
  const day = state.missionDays.find(d => d.dateUTC === date), s = day?.slots.find(s => s.definition.id === id);
  if (!day || !s || date !== utcDate(at) || state.latestMissionDate !== date || day.rerolled || s.progress !== 0 || s.status !== "active") return state;
  const replacement = choose(date, installation, s.definition.difficulty, day.unlocked, day.slots.map(s => s.definition.id), true, catalog);
  if (replacement.id === id) return state;
  return { ...state, missionDays: state.missionDays.map(d => d !== day ? d : { ...day, rerolled: true, slots: day.slots.map(old => old !== s ? old : slot(replacement)) }) };
}
