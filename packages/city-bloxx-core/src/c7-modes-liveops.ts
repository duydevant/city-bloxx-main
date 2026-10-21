import {
  BUNDLED_LIVEOPS_MANIFEST,
  PERFECT_RUSH_RECIPE,
  SKYLINE_SPRINT_RECIPE,
  WEEKLY_CONTRACT_CATALOG,
  type EventGoalDefinition,
  type FreeSeasonManifest,
  type LiveOpsKillSwitch,
  type LiveOpsManifest,
  type SeasonTierDefinition,
  type WeeklyContractDefinition,
  type WinterEventManifest,
} from "../../city-bloxx-content/c7-liveops";
import { DIFFICULTIES, checkedAdd } from "./missions";
import { SETTLEMENT_REWARDS, STARTING_COINS } from "../../city-bloxx-content/settlement";
import { BUILDING_IDS, type BuildingId } from "./buildings";
import { UTC_DAY_MS, isUTCDate, shiftUTCDate, utcDate } from "./daily";
import { PHYSICS_VERSION } from "./rules";
import { grantSpecificCosmetics } from "./cosmetics";
import type { GameSave } from "./save-state";
import type { RunSummary } from "./tracking";

export {
  BUNDLED_LIVEOPS_MANIFEST,
  PERFECT_RUSH_RECIPE,
  SKYLINE_SPRINT_RECIPE,
  WEEKLY_CONTRACT_CATALOG,
  type EventGoalDefinition,
  type FreeSeasonManifest,
  type LiveOpsKillSwitch,
  type LiveOpsManifest,
  type SeasonTierDefinition,
  type WeeklyContractDefinition,
  type WinterEventManifest,
};

const integer = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const tag = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(v);

export function utcWeekStart(dateOrTimestamp: string | number): string {
  const dateStr = typeof dateOrTimestamp === "number" ? utcDate(dateOrTimestamp) : dateOrTimestamp;
  if (!isUTCDate(dateStr)) throw new Error("Invalid UTC date for week calculation");
  const ms = Date.parse(`${dateStr}T00:00:00.000Z`);
  const dayOfWeek = new Date(ms).getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return shiftUTCDate(dateStr, offsetToMonday);
}

export function isUTCWeekMonday(value: unknown): value is string {
  if (!isUTCDate(value)) return false;
  return new Date(Date.parse(`${value}T00:00:00.000Z`)).getUTCDay() === 1;
}

export function weeklyCountdown(timestamp: number): number {
  const today = utcDate(timestamp);
  const monday = utcWeekStart(today);
  const nextMonday = shiftUTCDate(monday, 7);
  const nextMondayMs = Date.parse(`${nextMonday}T00:00:00.000Z`);
  return Math.max(1, Math.ceil((nextMondayMs - timestamp) / 1000));
}

export interface WeeklyContractSlot {
  definition: WeeklyContractDefinition;
  progress: number;
  status: "active" | "ready" | "claimed";
  completedAt: number | null;
  claimedAt: number | null;
}

export interface WeeklyContractWeek {
  weekStartUTC: string;
  version: "weekly-contracts-1";
  unlocked: BuildingId[];
  slots: WeeklyContractSlot[];
}

export interface WeeklyRunCursor {
  sequence: number;
  weekStartUTC: string;
  landed: number;
  perfect: number;
  finiteComplete: number;
}

export interface WeeklyContractsState {
  version: 1;
  latestWeekStartUTC: string | null;
  weeks: WeeklyContractWeek[];
  cursors: WeeklyRunCursor[];
  claimedReceipts: string[];
}

export function emptyWeeklyContracts(): WeeklyContractsState {
  return {
    version: 1,
    latestWeekStartUTC: null,
    weeks: [],
    cursors: [],
    claimedReceipts: [],
  };
}

export function validateWeeklyContractCatalog(
  catalog: readonly WeeklyContractDefinition[] = WEEKLY_CONTRACT_CATALOG,
): void {
  if (!Array.isArray(catalog) || catalog.length < 3 || catalog.length > 128 || new Set(catalog.map(d => d?.id)).size !== catalog.length) {
    throw new Error("Invalid weekly contract catalog");
  }
  for (const d of catalog) {
    if (
      !d ||
      !tag(d.id) ||
      d.version !== "weekly-contracts-1" ||
      !DIFFICULTIES.includes(d.slot) ||
      !["landed", "perfect", "finite-complete", "city-accepted"].includes(d.kind) ||
      !integer(d.target) ||
      d.target < 1 ||
      d.target > 1000000 ||
      !integer(d.xp) ||
      d.xp < 1 ||
      d.xp > 50000 ||
      typeof d.nonAssist !== "boolean" ||
      !(d.cityClass === null || BUILDING_IDS.includes(d.cityClass)) ||
      (d.cityClass !== null && d.kind !== "city-accepted") ||
      !d.title ||
      ![d.title.en, d.title.vi].every(v => typeof v === "string" && v.length > 0 && v.length <= 160)
    ) {
      throw new Error("Invalid weekly contract definition");
    }
  }
}

function hashKey(key: string): number {
  let value = 2166136261;
  for (let i = 0; i < key.length; i++) value = Math.imul(value ^ key.charCodeAt(i), 16777619) >>> 0;
  return value;
}

export function resolveWeeklyContracts(
  weekStartUTC: string,
  unlocked: readonly BuildingId[],
  catalog: readonly WeeklyContractDefinition[] = WEEKLY_CONTRACT_CATALOG,
): WeeklyContractWeek {
  if (!isUTCWeekMonday(weekStartUTC) || !unlocked.includes("residential") || unlocked.some(id => !BUILDING_IDS.includes(id))) {
    throw new Error("Invalid weekly contract boundary");
  }
  validateWeeklyContractCatalog(catalog);
  const slots: WeeklyContractSlot[] = [];
  const chosenIds: string[] = [];
  for (const difficulty of DIFFICULTIES) {
    const pool = catalog
      .filter(d => d.slot === difficulty && !chosenIds.includes(d.id) && (d.cityClass === null || unlocked.includes(d.cityClass)))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const fallback = WEEKLY_CONTRACT_CATALOG.find(d => d.slot === difficulty)!;
    const picked = pool.length ? pool[hashKey(`weekly-contracts-1|${weekStartUTC}|${difficulty}`) % pool.length] : fallback;
    chosenIds.push(picked.id);
    slots.push({
      definition: JSON.parse(JSON.stringify(picked)),
      progress: 0,
      status: "active",
      completedAt: null,
      claimedAt: null,
    });
  }
  return {
    weekStartUTC,
    version: "weekly-contracts-1",
    unlocked: [...unlocked],
    slots,
  };
}

// Completed contracts have a 7-day grace period after the 7-day week ends (14 days from weekStartUTC).
export function weeklyContractExpired(weekStartUTC: string, currentDateUTC: string): boolean {
  return currentDateUTC >= shiftUTCDate(weekStartUTC, 14);
}

export function refreshWeeklyContracts(
  state: WeeklyContractsState,
  currentDateUTC: string,
  unlocked: readonly BuildingId[],
  catalog: readonly WeeklyContractDefinition[] = WEEKLY_CONTRACT_CATALOG,
): WeeklyContractsState {
  if (!isUTCDate(currentDateUTC)) throw new Error("Invalid weekly date");
  const currentWeek = utcWeekStart(currentDateUTC);
  const latestWeek = !state.latestWeekStartUTC || currentWeek > state.latestWeekStartUTC ? currentWeek : state.latestWeekStartUTC;
  const latestDate = currentDateUTC > latestWeek ? currentDateUTC : latestWeek;
  let weeks = state.weeks.filter(w => !weeklyContractExpired(w.weekStartUTC, latestDate));
  if (!weeklyContractExpired(currentWeek, latestDate) && !weeks.some(w => w.weekStartUTC === currentWeek)) {
    weeks = [...weeks, resolveWeeklyContracts(currentWeek, unlocked, catalog)];
  }
  weeks.sort((a, b) => (a.weekStartUTC > b.weekStartUTC ? -1 : a.weekStartUTC < b.weekStartUTC ? 1 : 0));
  // Bounded save state: keep active week + at most 1 previous week (<= 2 weeks total).
  const retainedWeeks: WeeklyContractWeek[] = [];
  for (const w of weeks) {
    if (retainedWeeks.length === 0) {
      retainedWeeks.push(w);
    } else if (retainedWeeks.length === 1 && w.slots.some(s => s.status !== "claimed")) {
      retainedWeeks.push(w);
    }
  }
  return {
    ...state,
    latestWeekStartUTC: latestWeek,
    weeks: retainedWeeks.slice(0, 2),
  };
}

function addWeeklySlotProgress(slot: WeeklyContractSlot, delta: number, at: number, alreadyClaimed: boolean): WeeklyContractSlot {
  if (slot.status !== "active" || alreadyClaimed || delta <= 0) return slot;
  const progress = Math.min(slot.definition.target, checkedAdd(slot.progress, delta));
  const ready = progress >= slot.definition.target;
  return {
    ...slot,
    progress,
    status: ready ? "ready" : "active",
    completedAt: ready ? at : null,
  };
}

export function isFiniteTowerComplete(summary: RunSummary): boolean {
  return summary.outcome === "ended" && summary.complete && ["daily", "city", "skyline-sprint"].includes(summary.mode);
}

export function updateRunWeeklyContracts(
  state: WeeklyContractsState,
  summary: RunSummary,
  unlocked: readonly BuildingId[],
  at: number,
  catalog: readonly WeeklyContractDefinition[] = WEEKLY_CONTRACT_CATALOG,
): WeeklyContractsState {
  if (!summary.metrics || summary.mode === "one-drop") return state;
  const runWeekUTC = utcWeekStart(summary.startedAt);
  const nowDateUTC = utcDate(at);
  let next = refreshWeeklyContracts(state, nowDateUTC, unlocked, catalog);
  if (!weeklyContractExpired(runWeekUTC, nowDateUTC) && !next.weeks.some(w => w.weekStartUTC === runWeekUTC) && next.weeks.length < 2) {
    next = {
      ...next,
      weeks: [...next.weeks, resolveWeeklyContracts(runWeekUTC, unlocked, catalog)]
        .sort((a, b) => (a.weekStartUTC > b.weekStartUTC ? -1 : a.weekStartUTC < b.weekStartUTC ? 1 : 0))
        .slice(0, 2),
    };
  }
  const before = next.cursors.find(c => c.sequence === summary.identity.sequence) ?? {
    sequence: summary.identity.sequence,
    weekStartUTC: runWeekUTC,
    landed: 0,
    perfect: 0,
    finiteComplete: 0,
  };
  if (before.weekStartUTC !== runWeekUTC) throw new Error("Weekly contract run week changed");
  const m = summary.metrics;
  const cursor: WeeklyRunCursor = {
    sequence: before.sequence,
    weekStartUTC: runWeekUTC,
    landed: m.body.perfect + m.body.great + m.body.good + m.body.risky,
    perfect: m.body.perfect,
    finiteComplete: Number(isFiniteTowerComplete(summary)),
  };
  if (cursor.landed < before.landed || cursor.perfect < before.perfect || cursor.finiteComplete < before.finiteComplete) {
    throw new Error("Weekly contract progress cannot rewind");
  }
  const weeks = next.weeks.map(week =>
    week.weekStartUTC !== runWeekUTC
      ? week
      : {
          ...week,
          slots: week.slots.map(s => {
            const d = s.definition;
            const receipt = `${week.weekStartUTC}:${d.id}`;
            const alreadyClaimed = next.claimedReceipts.includes(receipt);
            if (d.nonAssist && summary.assist) return s;
            if (d.kind === "landed") return addWeeklySlotProgress(s, cursor.landed - before.landed, at, alreadyClaimed);
            if (d.kind === "perfect") return addWeeklySlotProgress(s, cursor.perfect - before.perfect, at, alreadyClaimed);
            if (d.kind === "finite-complete") return addWeeklySlotProgress(s, cursor.finiteComplete - before.finiteComplete, at, alreadyClaimed);
            return s;
          }),
        },
  );
  const cursors = [...next.cursors.filter(c => c.sequence !== cursor.sequence), cursor];
  if (cursors.length > 8) throw new Error("Too many active weekly contract runs");
  return { ...next, weeks, cursors };
}

export function acceptedWeeklyContract(
  state: WeeklyContractsState,
  weekStartUTC: string,
  building: BuildingId,
  at: number,
): WeeklyContractsState {
  return {
    ...state,
    weeks: state.weeks.map(week =>
      week.weekStartUTC !== weekStartUTC
        ? week
        : {
            ...week,
            slots: week.slots.map(s => {
              const receipt = `${week.weekStartUTC}:${s.definition.id}`;
              const alreadyClaimed = state.claimedReceipts.includes(receipt);
              return s.definition.kind === "city-accepted" && (!s.definition.cityClass || s.definition.cityClass === building)
                ? addWeeklySlotProgress(s, 1, at, alreadyClaimed)
                : s;
            }),
          },
    ),
  };
}


// ============================================================================
// C7.2 Perfect Rush & C7.3 Skyline Sprint
// ============================================================================

export interface PerfectRushDefinition {
  id: string;
  presetId: "perfect-rush-v1";
  rulesetVersion: "perfect-rush-1";
  classId: "residential";
  roofEnabled: false;
  lives: 3;
  deadlineTick: 3600;
  maxGraceTicks: 180;
  maxEndTick: 3780;
  objective: "perfect-count";
  physicsVersion: string;
}

export interface SkylineSprintDefinition {
  id: string;
  presetId: "skyline-sprint-v1";
  rulesetVersion: "skyline-sprint-1";
  classId: "residential";
  targetBodyFloors: 20;
  roofEnabled: false;
  lives: 3;
  missPenaltyTicks: 300;
  objective: "time";
  physicsVersion: string;
}

export function resolvePerfectRush(): PerfectRushDefinition {
  return Object.freeze({
    id: "perfect-rush-v1",
    ...PERFECT_RUSH_RECIPE,
    physicsVersion: PHYSICS_VERSION,
  });
}

export function validatePerfectRush(value: unknown): PerfectRushDefinition {
  if (!value || typeof value !== "object") throw new Error("Unsupported Perfect Rush definition");
  const d = value as PerfectRushDefinition;
  const expected = resolvePerfectRush();
  if (Object.keys(expected).some(k => d[k as keyof PerfectRushDefinition] !== expected[k as keyof PerfectRushDefinition])) {
    throw new Error("Unsupported Perfect Rush definition");
  }
  return expected;
}

export function resolveSkylineSprint(): SkylineSprintDefinition {
  return Object.freeze({
    id: "skyline-sprint-v1",
    ...SKYLINE_SPRINT_RECIPE,
    physicsVersion: PHYSICS_VERSION,
  });
}

export function validateSkylineSprint(value: unknown): SkylineSprintDefinition {
  if (!value || typeof value !== "object") throw new Error("Unsupported Skyline Sprint definition");
  const d = value as SkylineSprintDefinition;
  const expected = resolveSkylineSprint();
  if (Object.keys(expected).some(k => d[k as keyof SkylineSprintDefinition] !== expected[k as keyof SkylineSprintDefinition])) {
    throw new Error("Unsupported Skyline Sprint definition");
  }
  return expected;
}

export interface PerfectRushBest {
  identityId: string;
  seed: number;
  perfectCount: number;
  population: number;
  height: number;
  accuracy: number;
  durationTicks: number;
  deadlineTick: 3600;
  endedAt: number;
}

export interface PerfectRushState {
  version: 1;
  attempts: number;
  best: PerfectRushBest | null;
}

export function emptyPerfectRush(): PerfectRushState {
  return { version: 1, attempts: 0, best: null };
}

export function comparePerfectRushBest(candidate: PerfectRushBest, existing: PerfectRushBest | null): boolean {
  if (!existing) return true;
  if (candidate.perfectCount !== existing.perfectCount) return candidate.perfectCount > existing.perfectCount;
  if (candidate.population !== existing.population) return candidate.population > existing.population;
  return candidate.durationTicks < existing.durationTicks;
}

export function settlePerfectRush(state: PerfectRushState, summary: RunSummary): PerfectRushState {
  if (summary.mode !== "perfect-rush") return state;
  if (summary.outcome !== "ended") {
    return { ...state, attempts: checkedAdd(state.attempts, 1) };
  }
  const candidate: PerfectRushBest = {
    identityId: summary.identity.id,
    seed: summary.seed,
    perfectCount: summary.result.perfectCount,
    population: summary.result.population,
    height: summary.result.height,
    accuracy: summary.result.accuracy,
    durationTicks: summary.result.durationTicks,
    deadlineTick: PERFECT_RUSH_RECIPE.deadlineTick,
    endedAt: summary.endedAt,
  };
  const best = comparePerfectRushBest(candidate, state.best)
    ? candidate
    : state.best
      ? { ...state.best }
      : null;
  return {
    version: 1,
    attempts: checkedAdd(state.attempts, 1),
    best,
  };
}

export function validatePerfectRushState(value: unknown): PerfectRushState {
  if (value === undefined) return emptyPerfectRush();
  if (!value || typeof value !== "object") throw new Error("Invalid Perfect Rush state");
  const s = value as PerfectRushState;
  if (s.version !== 1 || !integer(s.attempts)) throw new Error("Invalid Perfect Rush state");
  if (s.best !== null) {
    const b = s.best;
    if (
      !b ||
      typeof b.identityId !== "string" ||
      b.identityId.length < 3 ||
      b.identityId.length > 96 ||
      !Number.isInteger(b.seed) ||
      ![b.perfectCount, b.population, b.height, b.durationTicks, b.endedAt].every(integer) ||
      b.durationTicks < 1 ||
      b.durationTicks > PERFECT_RUSH_RECIPE.maxEndTick ||
      b.deadlineTick !== PERFECT_RUSH_RECIPE.deadlineTick ||
      !finite(b.accuracy) ||
      b.accuracy < 0 ||
      b.accuracy > 100
    ) {
      throw new Error("Invalid Perfect Rush best record");
    }
  }
  return { version: 1, attempts: s.attempts, best: s.best ? { ...s.best } : null };
}

export interface SkylineSprintBest {
  identityId: string;
  seed: number;
  sprintScoreTicks: number;
  durationTicks: number;
  misses: number;
  accuracy: number;
  population: number;
  endedAt: number;
}

export interface SkylineSprintState {
  version: 1;
  attempts: number;
  completedRuns: number;
  bestFailedHeight: number;
  bestComplete: SkylineSprintBest | null;
}

export function emptySkylineSprint(): SkylineSprintState {
  return { version: 1, attempts: 0, completedRuns: 0, bestFailedHeight: 0, bestComplete: null };
}

export function computeSprintScoreTicks(durationTicks: number, misses: number): number {
  return checkedAdd(durationTicks, checkedAdd(0, misses) * SKYLINE_SPRINT_RECIPE.missPenaltyTicks);
}

export function compareSkylineSprintBest(candidate: SkylineSprintBest, existing: SkylineSprintBest | null): boolean {
  if (!existing) return true;
  if (candidate.sprintScoreTicks !== existing.sprintScoreTicks) return candidate.sprintScoreTicks < existing.sprintScoreTicks;
  if (candidate.accuracy !== existing.accuracy) return candidate.accuracy > existing.accuracy;
  return candidate.durationTicks < existing.durationTicks;
}

export function settleSkylineSprint(state: SkylineSprintState, summary: RunSummary): SkylineSprintState {
  if (summary.mode !== "skyline-sprint") return state;
  const attempts = checkedAdd(state.attempts, 1);
  if (summary.outcome !== "ended" || !summary.complete || summary.result.height < SKYLINE_SPRINT_RECIPE.targetBodyFloors) {
    return {
      ...state,
      attempts,
      bestFailedHeight: Math.max(state.bestFailedHeight, Math.min(SKYLINE_SPRINT_RECIPE.targetBodyFloors - 1, summary.result.height)),
    };
  }
  const sprintScoreTicks = summary.result.sprintScoreTicks ?? computeSprintScoreTicks(summary.result.durationTicks, summary.result.misses);
  const candidate: SkylineSprintBest = {
    identityId: summary.identity.id,
    seed: summary.seed,
    sprintScoreTicks,
    durationTicks: summary.result.durationTicks,
    misses: summary.result.misses,
    accuracy: summary.result.accuracy,
    population: summary.result.population,
    endedAt: summary.endedAt,
  };
  const bestComplete = compareSkylineSprintBest(candidate, state.bestComplete)
    ? candidate
    : state.bestComplete
      ? { ...state.bestComplete }
      : null;
  return {
    version: 1,
    attempts,
    completedRuns: checkedAdd(state.completedRuns, 1),
    bestFailedHeight: state.bestFailedHeight,
    bestComplete,
  };
}

export function validateSkylineSprintState(value: unknown): SkylineSprintState {
  if (value === undefined) return emptySkylineSprint();
  if (!value || typeof value !== "object") throw new Error("Invalid Skyline Sprint state");
  const s = value as SkylineSprintState;
  if (
    s.version !== 1 ||
    ![s.attempts, s.completedRuns, s.bestFailedHeight].every(integer) ||
    s.completedRuns > s.attempts ||
    s.bestFailedHeight >= SKYLINE_SPRINT_RECIPE.targetBodyFloors
  ) {
    throw new Error("Invalid Skyline Sprint state");
  }
  if (s.bestComplete !== null) {
    const b = s.bestComplete;
    if (
      !b ||
      typeof b.identityId !== "string" ||
      b.identityId.length < 3 ||
      b.identityId.length > 96 ||
      !Number.isInteger(b.seed) ||
      ![b.sprintScoreTicks, b.durationTicks, b.misses, b.population, b.endedAt].every(integer) ||
      b.durationTicks < 1 ||
      b.misses > SKYLINE_SPRINT_RECIPE.lives ||
      b.sprintScoreTicks !== computeSprintScoreTicks(b.durationTicks, b.misses) ||
      !finite(b.accuracy) ||
      b.accuracy < 0 ||
      b.accuracy > 100
    ) {
      throw new Error("Invalid Skyline Sprint best record");
    }
  }
  return {
    version: 1,
    attempts: s.attempts,
    completedRuns: s.completedRuns,
    bestFailedHeight: s.bestFailedHeight,
    bestComplete: s.bestComplete ? { ...s.bestComplete } : null,
  };
}

// ============================================================================
// C7.4 & C7.5 Winter Event, Free Season & LiveOps Config Validation
// ============================================================================

export type LiveOpsWindowState = "upcoming" | "active" | "run-grace" | "claim-grace" | "ended" | "disabled";

function isISOUTC(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

const ALLOWED_MANIFEST_KEYS = new Set(["version", "revision", "publishedAtUTC", "ttlSeconds", "killSwitch", "winterEvent", "freeSeason"]);
const FORBIDDEN_PHYSICS_KEYS = new Set([
  "physics",
  "physicsVersion",
  "collision",
  "swing",
  "swingPeriodTicks",
  "sway",
  "swayPeriodTicks",
  "bands",
  "perfectThreshold",
  "greatThreshold",
  "goodThreshold",
  "minimumOverlapRatio",
  "gravity",
  "gravityPerTick",
]);

function hasForbiddenKeys(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  for (const [k, v] of Object.entries(obj)) {
    if (FORBIDDEN_PHYSICS_KEYS.has(k)) return true;
    if (v && typeof v === "object" && hasForbiddenKeys(v)) return true;
  }
  return false;
}

export function validateLiveOpsManifest(value: unknown): LiveOpsManifest {
  if (!value || typeof value !== "object" || hasForbiddenKeys(value)) {
    throw new Error("Invalid or non-allowlisted LiveOps manifest");
  }
  const m = value as LiveOpsManifest;
  if (Object.keys(m).some(k => !ALLOWED_MANIFEST_KEYS.has(k))) {
    throw new Error("Unknown root keys in LiveOps manifest");
  }
  if (
    m.version !== "liveops-1" ||
    !tag(m.revision) ||
    !isISOUTC(m.publishedAtUTC) ||
    !integer(m.ttlSeconds) ||
    m.ttlSeconds < 60 ||
    m.ttlSeconds > 86400 ||
    !m.killSwitch ||
    typeof m.killSwitch.weeklyDisabled !== "boolean" ||
    typeof m.killSwitch.rushDisabled !== "boolean" ||
    typeof m.killSwitch.sprintDisabled !== "boolean" ||
    typeof m.killSwitch.eventsDisabled !== "boolean" ||
    typeof m.killSwitch.seasonDisabled !== "boolean"
  ) {
    throw new Error("Invalid LiveOps manifest header or killSwitch");
  }

  const ev = m.winterEvent;
  if (
    !ev ||
    !tag(ev.id) ||
    ev.version !== "event-1" ||
    !isISOUTC(ev.startsAtUTC) ||
    !isISOUTC(ev.endsAtUTC) ||
    Date.parse(ev.endsAtUTC) <= Date.parse(ev.startsAtUTC) ||
    !integer(ev.runGraceHours) ||
    ev.runGraceHours < 1 ||
    ev.runGraceHours > 72 ||
    !integer(ev.claimGraceDays) ||
    ev.claimGraceDays < 1 ||
    ev.claimGraceDays > 30 ||
    !ev.title ||
    ![ev.title.en, ev.title.vi].every(s => typeof s === "string" && s.length > 0 && s.length <= 160) ||
    !Array.isArray(ev.goals) ||
    ev.goals.length !== 3
  ) {
    throw new Error("Invalid Winter Event manifest");
  }
  for (const g of ev.goals) {
    if (
      !g ||
      !tag(g.id) ||
      !["landed", "perfect", "daily-complete"].includes(g.kind) ||
      !integer(g.target) ||
      g.target < 1 ||
      g.target > 1000000 ||
      typeof g.nonAssist !== "boolean" ||
      !integer(g.xp) ||
      g.xp > 50000 ||
      !tag(g.rewardCosmeticId) ||
      !g.title ||
      ![g.title.en, g.title.vi].every(s => typeof s === "string" && s.length > 0 && s.length <= 160)
    ) {
      throw new Error("Invalid Winter Event goal");
    }
  }

  const se = m.freeSeason;
  if (
    !se ||
    !tag(se.id) ||
    se.version !== "season-1" ||
    !isISOUTC(se.startsAtUTC) ||
    !isISOUTC(se.endsAtUTC) ||
    Date.parse(se.endsAtUTC) <= Date.parse(se.startsAtUTC) ||
    !integer(se.runGraceHours) ||
    se.runGraceHours < 1 ||
    se.runGraceHours > 72 ||
    !integer(se.claimGraceDays) ||
    se.claimGraceDays < 1 ||
    se.claimGraceDays > 30 ||
    se.tierCount !== 20 ||
    se.spPerTier !== 100 ||
    !se.spSources ||
    se.spSources.firstDailyCompletePerDay !== 20 ||
    se.spSources.dailyMissionClaim !== 10 ||
    se.spSources.weeklyContractClaim !== 50 ||
    !se.title ||
    ![se.title.en, se.title.vi].every(s => typeof s === "string" && s.length > 0 && s.length <= 160) ||
    !Array.isArray(se.tiers) ||
    se.tiers.length !== 20
  ) {
    throw new Error("Invalid Free Season manifest");
  }
  se.tiers.forEach((t, idx) => {
    const expectedTier = idx + 1;
    const expectedXP = expectedTier % 2 === 0 ? 100 : 50;
    if (
      !t ||
      t.tier !== expectedTier ||
      t.spRequired !== expectedTier * 100 ||
      t.xp !== expectedXP ||
      !(t.cosmeticId === null || tag(t.cosmeticId)) ||
      !t.title ||
      ![t.title.en, t.title.vi].every(s => typeof s === "string" && s.length > 0 && s.length <= 160)
    ) {
      throw new Error("Invalid Free Season tier definition");
    }
  });

  return JSON.parse(JSON.stringify(m));
}

export function resolveWindowState(
  schedule: { startsAtUTC: string; endsAtUTC: string; runGraceHours: number; claimGraceDays: number },
  disabled: boolean,
  nowMs: number,
  runStartedAtMs?: number,
): LiveOpsWindowState {
  if (disabled) return "disabled";
  const startMs = Date.parse(schedule.startsAtUTC);
  const endMs = Date.parse(schedule.endsAtUTC);
  const runGraceEndMs = endMs + schedule.runGraceHours * 3600_000;
  const claimGraceEndMs = endMs + schedule.claimGraceDays * UTC_DAY_MS;
  if (nowMs < startMs) return "upcoming";
  if (nowMs < endMs) {
    if (runStartedAtMs !== undefined && runStartedAtMs < startMs) return "upcoming";
    return "active";
  }
  if (runStartedAtMs !== undefined && runStartedAtMs >= startMs && runStartedAtMs < endMs && nowMs <= runGraceEndMs) {
    return "run-grace";
  }
  if (nowMs <= claimGraceEndMs) return "claim-grace";
  return "ended";
}

export interface WinterEventProgressState {
  eventId: string;
  landed: number;
  perfect: number;
  dailyComplete: number;
  claimedGoals: string[];
  settledRunIds: string[];
}

export interface FreeSeasonProgressState {
  seasonId: string;
  sp: number;
  claimedTiers: number[];
  spReceipts: string[];
}

export interface LiveOpsSaveState {
  version: 1;
  activeRevision: string;
  weekly: WeeklyContractsState;
  perfectRush: PerfectRushState;
  skylineSprint: SkylineSprintState;
  winterEvent: WinterEventProgressState;
  freeSeason: FreeSeasonProgressState;
}

export function emptyLiveOpsSave(manifest: LiveOpsManifest = BUNDLED_LIVEOPS_MANIFEST): LiveOpsSaveState {
  return {
    version: 1,
    activeRevision: manifest.revision,
    weekly: emptyWeeklyContracts(),
    perfectRush: emptyPerfectRush(),
    skylineSprint: emptySkylineSprint(),
    winterEvent: {
      eventId: manifest.winterEvent.id,
      landed: 0,
      perfect: 0,
      dailyComplete: 0,
      claimedGoals: [],
      settledRunIds: [],
    },
    freeSeason: {
      seasonId: manifest.freeSeason.id,
      sp: 0,
      claimedTiers: [],
      spReceipts: [],
    },
  };
}

export function validateLiveOpsSaveState(value: unknown, manifest: LiveOpsManifest = BUNDLED_LIVEOPS_MANIFEST): LiveOpsSaveState {
  if (value === undefined) return emptyLiveOpsSave(manifest);
  if (!value || typeof value !== "object") throw new Error("Invalid LiveOps save state");
  const s = value as LiveOpsSaveState;
  if (s.version !== 1 || !tag(s.activeRevision)) throw new Error("Invalid LiveOps save version");

  // Validate weekly
  const w = s.weekly;
  if (
    !w ||
    w.version !== 1 ||
    !(w.latestWeekStartUTC === null || isUTCWeekMonday(w.latestWeekStartUTC)) ||
    !Array.isArray(w.weeks) ||
    w.weeks.length > 2 ||
    new Set(w.weeks.map(wk => wk?.weekStartUTC)).size !== w.weeks.length ||
    !Array.isArray(w.cursors) ||
    w.cursors.length > 8 ||
    !Array.isArray(w.claimedReceipts) ||
    w.claimedReceipts.length > 64 ||
    !w.claimedReceipts.every(r => typeof r === "string" && /^\d{4}-\d{2}-\d{2}:[a-zA-Z0-9_.-]{1,80}$/.test(r))
  ) {
    throw new Error("Invalid weekly contracts save state");
  }
  for (const wk of w.weeks) {
    if (
      !wk ||
      !isUTCWeekMonday(wk.weekStartUTC) ||
      wk.version !== "weekly-contracts-1" ||
      !Array.isArray(wk.unlocked) ||
      !wk.unlocked.includes("residential") ||
      wk.unlocked.some(id => !BUILDING_IDS.includes(id)) ||
      !Array.isArray(wk.slots) ||
      wk.slots.length !== 3
    ) {
      throw new Error("Invalid weekly contract week entry");
    }
    validateWeeklyContractCatalog(wk.slots.map(sl => sl.definition));
    wk.slots.forEach((sl, idx) => {
      if (
        sl.definition.slot !== DIFFICULTIES[idx] ||
        !integer(sl.progress) ||
        sl.progress > sl.definition.target ||
        !["active", "ready", "claimed"].includes(sl.status) ||
        (sl.status === "active") !== (sl.progress < sl.definition.target) ||
        (sl.status === "active" ? sl.completedAt !== null : !integer(sl.completedAt)) ||
        (sl.status === "claimed" ? !integer(sl.claimedAt) || sl.claimedAt! < sl.completedAt! : sl.claimedAt !== null)
      ) {
        throw new Error("Invalid weekly contract slot receipt");
      }
    });
  }

  const perfectRush = validatePerfectRushState(s.perfectRush);
  const skylineSprint = validateSkylineSprintState(s.skylineSprint);

  const ev = s.winterEvent;
  if (
    !ev ||
    !tag(ev.eventId) ||
    ![ev.landed, ev.perfect, ev.dailyComplete].every(integer) ||
    !Array.isArray(ev.claimedGoals) ||
    ev.claimedGoals.length > 16 ||
    new Set(ev.claimedGoals).size !== ev.claimedGoals.length ||
    !ev.claimedGoals.every(tag) ||
    !Array.isArray(ev.settledRunIds) ||
    ev.settledRunIds.length > 64 ||
    !ev.settledRunIds.every(id => typeof id === "string" && id.length <= 96)
  ) {
    throw new Error("Invalid Winter Event save state");
  }

  const se = s.freeSeason;
  if (
    !se ||
    !tag(se.seasonId) ||
    !integer(se.sp) ||
    se.sp > 20000 ||
    !Array.isArray(se.claimedTiers) ||
    se.claimedTiers.length > 20 ||
    new Set(se.claimedTiers).size !== se.claimedTiers.length ||
    !se.claimedTiers.every(t => integer(t) && t >= 1 && t <= 20) ||
    !Array.isArray(se.spReceipts) ||
    se.spReceipts.length > 128 ||
    new Set(se.spReceipts).size !== se.spReceipts.length ||
    !se.spReceipts.every(r => typeof r === "string" && r.length > 0 && r.length <= 120)
  ) {
    throw new Error("Invalid Free Season save state");
  }

  return {
    version: 1,
    activeRevision: s.activeRevision,
    weekly: JSON.parse(JSON.stringify(w)),
    perfectRush,
    skylineSprint,
    winterEvent: {
      eventId: ev.eventId,
      landed: ev.landed,
      perfect: ev.perfect,
      dailyComplete: ev.dailyComplete,
      claimedGoals: [...ev.claimedGoals],
      settledRunIds: [...ev.settledRunIds],
    },
    freeSeason: {
      seasonId: se.seasonId,
      sp: se.sp,
      claimedTiers: [...se.claimedTiers],
      spReceipts: [...se.spReceipts],
    },
  };
}

export function addSeasonSPWithReceipt(
  season: FreeSeasonProgressState,
  receipt: string,
  spAmount: number,
  atMs: number,
  manifest: LiveOpsManifest = BUNDLED_LIVEOPS_MANIFEST,
  runStartedAtMs?: number,
): FreeSeasonProgressState {
  if (season.spReceipts.includes(receipt)) return season;
  const windowState = resolveWindowState(manifest.freeSeason, manifest.killSwitch.seasonDisabled, atMs, runStartedAtMs);
  if (windowState !== "active" && windowState !== "run-grace") return season;
  const maxSP = manifest.freeSeason.tierCount * manifest.freeSeason.spPerTier;
  const nextSP = Math.min(maxSP, checkedAdd(season.sp, spAmount));
  const nextReceipts = [...season.spReceipts, receipt].slice(-128);
  return {
    ...season,
    seasonId: manifest.freeSeason.id,
    sp: nextSP,
    spReceipts: nextReceipts,
  };
}

export function settleLiveOpsOnRun(
  save: GameSave,
  summary: RunSummary,
  previousDailyCreditedDays: number,
  nextDailyCreditedDays: number,
  manifest: LiveOpsManifest = BUNDLED_LIVEOPS_MANIFEST,
): LiveOpsSaveState {
  const current = save.liveOps ?? emptyLiveOpsSave(manifest);
  const weekly = manifest.killSwitch.weeklyDisabled
    ? { ...current.weekly, cursors: current.weekly.cursors.filter(c => c.sequence !== summary.identity.sequence) }
    : {
        ...updateRunWeeklyContracts(current.weekly, summary, save.city.unlocked, summary.endedAt),
        cursors: current.weekly.cursors.filter(c => c.sequence !== summary.identity.sequence),
      };

  const perfectRush = settlePerfectRush(current.perfectRush, summary);
  const skylineSprint = settleSkylineSprint(current.skylineSprint, summary);

  let winterEvent = current.winterEvent;
  if (
    summary.outcome === "ended" &&
    summary.metrics &&
    summary.mode !== "one-drop" &&
    !winterEvent.settledRunIds.includes(summary.identity.id)
  ) {
    const evState = resolveWindowState(
      manifest.winterEvent,
      manifest.killSwitch.eventsDisabled,
      summary.endedAt,
      summary.startedAt,
    );
    if (evState === "active" || evState === "run-grace") {
      const m = summary.metrics;
      const landedDelta = m.body.perfect + m.body.great + m.body.good + m.body.risky;
      const perfectDelta = summary.assist ? 0 : m.body.perfect;
      const dailyDelta = summary.mode === "daily" && summary.complete ? 1 : 0;
      winterEvent = {
        ...winterEvent,
        eventId: manifest.winterEvent.id,
        landed: Math.min(500, checkedAdd(winterEvent.landed, landedDelta)),
        perfect: Math.min(100, checkedAdd(winterEvent.perfect, perfectDelta)),
        dailyComplete: Math.min(7, checkedAdd(winterEvent.dailyComplete, dailyDelta)),
        settledRunIds: [...winterEvent.settledRunIds, summary.identity.id].slice(-64),
      };
    }
  }

  let freeSeason = current.freeSeason;
  const dailyDate = summary.daily?.dateUTC;
  if (
    summary.mode === "daily" &&
    summary.outcome === "ended" &&
    summary.complete &&
    dailyDate &&
    (nextDailyCreditedDays > previousDailyCreditedDays || !save.progression.latestDailyBonusDate || dailyDate > save.progression.latestDailyBonusDate)
  ) {
    freeSeason = addSeasonSPWithReceipt(
      freeSeason,
      `daily:${dailyDate}`,
      manifest.freeSeason.spSources.firstDailyCompletePerDay,
      summary.endedAt,
      manifest,
      summary.startedAt,
    );
  }

  return {
    version: 1,
    activeRevision: manifest.revision,
    weekly,
    perfectRush,
    skylineSprint,
    winterEvent,
    freeSeason,
  };
}

export function ensureWeeklyContracts(
  save: GameSave,
  at: number,
  manifest: LiveOpsManifest = BUNDLED_LIVEOPS_MANIFEST,
): GameSave {
  const liveOps = save.liveOps ?? emptyLiveOpsSave(manifest);
  if (manifest.killSwitch.weeklyDisabled) return save;
  const weekly = refreshWeeklyContracts(liveOps.weekly, utcDate(at), save.city.unlocked);
  if (JSON.stringify(weekly) === JSON.stringify(liveOps.weekly)) return save;
  return { ...save, liveOps: { ...liveOps, weekly } };
}

export function claimWeeklyContract(
  save: GameSave,
  weekStartUTC: string,
  contractId: string,
  at: number,
  manifest: LiveOpsManifest = BUNDLED_LIVEOPS_MANIFEST,
): GameSave {
  const refreshed = ensureWeeklyContracts(save, at, manifest);
  const liveOps = refreshed.liveOps;
  const nowDate = utcDate(at);
  const week = liveOps.weekly.weeks.find(w => w.weekStartUTC === weekStartUTC);
  const slot = week?.slots.find(s => s.definition.id === contractId);
  const receipt = `${weekStartUTC}:${contractId}`;
  if (
    !week ||
    !slot ||
    slot.status !== "ready" ||
    slot.completedAt === null ||
    at < slot.completedAt ||
    weeklyContractExpired(weekStartUTC, nowDate) ||
    liveOps.weekly.claimedReceipts.includes(receipt)
  ) {
    return refreshed;
  }
  const updatedWeeks = liveOps.weekly.weeks.map(w =>
    w.weekStartUTC !== weekStartUTC
      ? w
      : {
          ...w,
          slots: w.slots.map(s => (s.definition.id !== contractId ? s : { ...s, status: "claimed" as const, claimedAt: at })),
        },
  );
  const claimedReceipts = [...liveOps.weekly.claimedReceipts, receipt].slice(-64);
  const coinReceipt = `weekly:${receipt}`;
  const freeSeason = addSeasonSPWithReceipt(
    liveOps.freeSeason,
    coinReceipt,
    manifest.freeSeason.spSources.weeklyContractClaim,
    at,
    manifest,
  );
  const currentCoins = refreshed.coins ?? STARTING_COINS;
  const alreadyCreditedCoins = (refreshed.coinReceipts ?? []).includes(coinReceipt);
  const nextCoins = alreadyCreditedCoins ? currentCoins : checkedAdd(currentCoins, SETTLEMENT_REWARDS.coinWeeklyContractClaim);
  const coinReceipts = alreadyCreditedCoins ? [...(refreshed.coinReceipts ?? [])] : [...(refreshed.coinReceipts ?? []), coinReceipt].slice(-64);
  return {
    ...refreshed,
    coins: nextCoins,
    coinReceipts,
    progression: {
      ...refreshed.progression,
      xp: checkedAdd(refreshed.progression.xp, slot.definition.xp),
    },
    liveOps: {
      ...liveOps,
      weekly: {
        ...liveOps.weekly,
        weeks: updatedWeeks,
        claimedReceipts,
      },
      freeSeason,
    },
  };
}

export function eventGoalProgress(state: WinterEventProgressState, goal: EventGoalDefinition): number {
  if (goal.kind === "landed") return Math.min(goal.target, state.landed);
  if (goal.kind === "perfect") return Math.min(goal.target, state.perfect);
  return Math.min(goal.target, state.dailyComplete);
}

export function claimWinterEventGoal(
  save: GameSave,
  goalId: string,
  at: number,
  manifest: LiveOpsManifest = BUNDLED_LIVEOPS_MANIFEST,
): GameSave {
  const liveOps = save.liveOps ?? emptyLiveOpsSave(manifest);
  const windowState = resolveWindowState(manifest.winterEvent, manifest.killSwitch.eventsDisabled, at);
  if (windowState !== "active" && windowState !== "run-grace" && windowState !== "claim-grace") {
    return save;
  }
  const goal = manifest.winterEvent.goals.find(g => g.id === goalId);
  if (!goal || liveOps.winterEvent.claimedGoals.includes(goalId)) return save;
  if (eventGoalProgress(liveOps.winterEvent, goal) < goal.target) return save;

  let next: GameSave = {
    ...save,
    progression: {
      ...save.progression,
      xp: checkedAdd(save.progression.xp, goal.xp),
    },
    liveOps: {
      ...liveOps,
      winterEvent: {
        ...liveOps.winterEvent,
        claimedGoals: [...liveOps.winterEvent.claimedGoals, goalId],
      },
    },
  };
  next = grantSpecificCosmetics(next, [goal.rewardCosmeticId], at);
  return next;
}

export function claimSeasonTier(
  save: GameSave,
  tierNumber: number,
  at: number,
  manifest: LiveOpsManifest = BUNDLED_LIVEOPS_MANIFEST,
): GameSave {
  const liveOps = save.liveOps ?? emptyLiveOpsSave(manifest);
  const windowState = resolveWindowState(manifest.freeSeason, manifest.killSwitch.seasonDisabled, at);
  if (windowState !== "active" && windowState !== "run-grace" && windowState !== "claim-grace") {
    return save;
  }
  const tierDef = manifest.freeSeason.tiers.find(t => t.tier === tierNumber);
  if (!tierDef || liveOps.freeSeason.claimedTiers.includes(tierNumber)) return save;
  if (liveOps.freeSeason.sp < tierDef.spRequired) return save;

  let next: GameSave = {
    ...save,
    progression: {
      ...save.progression,
      xp: checkedAdd(save.progression.xp, tierDef.xp),
    },
    liveOps: {
      ...liveOps,
      freeSeason: {
        ...liveOps.freeSeason,
        claimedTiers: [...liveOps.freeSeason.claimedTiers, tierNumber].sort((a, b) => a - b),
      },
    },
  };
  if (tierDef.cosmeticId) {
    next = grantSpecificCosmetics(next, [tierDef.cosmeticId], at);
  }
  return next;
}
