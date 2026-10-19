import { ONE_DROP_RECIPE } from "../../city-bloxx-content/one-drop";
import { isUTCDate } from "./daily";
import { QUALITIES } from "./metrics";
import { PHYSICS_VERSION } from "./rules";
import type { PlacementQuality, RunResult } from "./run";
import type { RunSummary } from "./tracking";

export interface OneDropDefinition {
  id: string;
  dateUTC: string;
  presetId: "one-drop-v1";
  scheduleVersion: "one-drop-v1";
  seed: number;
  classId: "residential";
  prebuiltFloors: 4;
  targetBodyFloors: 1;
  roofEnabled: false;
  lives: 1;
  objective: "precision";
  physicsVersion: string;
  rulesetVersion: string;
}

export interface OneDropAttemptResult {
  quality: PlacementQuality;
  signedError: number;
  absError: number;
  population: number;
  height: number;
  durationTicks: number;
  rating: RunResult["rating"];
}

export interface OneDropBest {
  identityId: string;
  dateUTC: string;
  presetId: "one-drop-v1";
  seed: number;
  quality: PlacementQuality;
  signedError: number;
  absError: number;
  population: number;
  durationTicks: number;
  endedAt: number;
}

export interface OneDropDayRecord {
  dateUTC: string;
  attempts: number;
  best: OneDropBest | null;
}

export interface OneDropState {
  version: 1;
  days: OneDropDayRecord[];
  allTimeBest: OneDropBest | null;
}

export const ONE_DROP_DAY_RETENTION = 14;

export function resolveOneDrop(dateUTC: string): OneDropDefinition {
  if (!isUTCDate(dateUTC)) throw new Error("Invalid One Drop UTC date");
  const id = `${ONE_DROP_RECIPE.scheduleVersion}|${dateUTC}`;
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619) >>> 0;
  return Object.freeze({
    id,
    dateUTC,
    ...ONE_DROP_RECIPE,
    seed: hash | 0,
    physicsVersion: PHYSICS_VERSION,
  });
}

export function validateOneDrop(value: unknown): OneDropDefinition {
  if (!value || typeof value !== "object") throw new Error("Unsupported One Drop definition; original preserved");
  const d = value as OneDropDefinition;
  const expected = resolveOneDrop(d.dateUTC);
  if (Object.keys(expected).some(key => d[key as keyof OneDropDefinition] !== expected[key as keyof OneDropDefinition])) {
    throw new Error("Unsupported One Drop definition; original preserved");
  }
  return expected;
}

export function emptyOneDrop(): OneDropState {
  return { version: 1, days: [], allTimeBest: null };
}

const integer = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function extractOneDropResult(summary: RunSummary): OneDropAttemptResult {
  if (summary.mode !== "one-drop" || !summary.metrics) throw new Error("Not a settled One Drop summary");
  const quality = QUALITIES.find(q => summary.metrics!.body[q] > 0) ?? "miss";
  const signedError = summary.metrics.signedErrors[0] ?? (quality === "miss" ? 1 : 0);
  const absError = Math.round(Math.abs(signedError) * 1000) / 1000;
  return {
    quality,
    signedError,
    absError,
    population: summary.result.population,
    height: summary.result.height,
    durationTicks: summary.result.durationTicks,
    rating: summary.result.rating,
  };
}

export function compareOneDropBest(candidate: OneDropBest, existing: OneDropBest | null): boolean {
  if (!existing) return true;
  if (candidate.absError !== existing.absError) return candidate.absError < existing.absError;
  return candidate.durationTicks < existing.durationTicks;
}

export function settleOneDrop(state: OneDropState, summary: RunSummary): OneDropState {
  if (summary.mode !== "one-drop" || !summary.oneDrop) return state;
  const dateUTC = summary.oneDrop.dateUTC;
  const existingDay = state.days.find(d => d.dateUTC === dateUTC);
  if (summary.outcome !== "ended") {
    const nextDay: OneDropDayRecord = {
      dateUTC,
      attempts: (existingDay?.attempts ?? 0) + 1,
      best: existingDay?.best ? { ...existingDay.best } : null,
    };
    const days = [nextDay, ...state.days.filter(d => d.dateUTC !== dateUTC)]
      .sort((a, b) => (a.dateUTC < b.dateUTC ? 1 : a.dateUTC > b.dateUTC ? -1 : 0))
      .slice(0, ONE_DROP_DAY_RETENTION);
    return { ...state, days };
  }
  const attempt = extractOneDropResult(summary);
  const candidate: OneDropBest = {
    identityId: summary.identity.id,
    dateUTC,
    presetId: summary.oneDrop.presetId,
    seed: summary.seed,
    quality: attempt.quality,
    signedError: attempt.signedError,
    absError: attempt.absError,
    population: attempt.population,
    durationTicks: attempt.durationTicks,
    endedAt: summary.endedAt,
  };
  const bestForDay = compareOneDropBest(candidate, existingDay?.best ?? null)
    ? candidate
    : existingDay?.best
      ? { ...existingDay.best }
      : null;
  const nextDay: OneDropDayRecord = {
    dateUTC,
    attempts: (existingDay?.attempts ?? 0) + 1,
    best: bestForDay,
  };
  const days = [nextDay, ...state.days.filter(d => d.dateUTC !== dateUTC)]
    .sort((a, b) => (a.dateUTC < b.dateUTC ? 1 : a.dateUTC > b.dateUTC ? -1 : 0))
    .slice(0, ONE_DROP_DAY_RETENTION);
  const allTimeBest = compareOneDropBest(candidate, state.allTimeBest)
    ? candidate
    : state.allTimeBest
      ? { ...state.allTimeBest }
      : null;
  return { version: 1, days, allTimeBest };
}

function validOneDropBest(value: unknown): value is OneDropBest {
  if (!value || typeof value !== "object") return false;
  const b = value as OneDropBest;
  return (
    typeof b.identityId === "string" &&
    b.identityId.length >= 3 &&
    b.identityId.length <= 96 &&
    isUTCDate(b.dateUTC) &&
    b.presetId === "one-drop-v1" &&
    Number.isInteger(b.seed) &&
    QUALITIES.includes(b.quality) &&
    finite(b.signedError) &&
    finite(b.absError) &&
    b.absError >= 0 &&
    Math.abs(b.absError - Math.round(Math.abs(b.signedError) * 1000) / 1000) <= 0.001 &&
    integer(b.population) &&
    integer(b.durationTicks) &&
    b.durationTicks >= 1 &&
    integer(b.endedAt)
  );
}

export function validateOneDropState(value: unknown): OneDropState {
  if (value === undefined) return emptyOneDrop();
  if (!value || typeof value !== "object") throw new Error("Invalid One Drop state; original save preserved");
  const s = value as OneDropState;
  if (
    s.version !== 1 ||
    !Array.isArray(s.days) ||
    s.days.length > ONE_DROP_DAY_RETENTION ||
    (s.allTimeBest !== null && !validOneDropBest(s.allTimeBest))
  ) {
    throw new Error("Invalid One Drop state; original save preserved");
  }
  const seen = new Set<string>();
  const days: OneDropDayRecord[] = [];
  for (const day of s.days) {
    if (
      !day ||
      typeof day !== "object" ||
      !isUTCDate(day.dateUTC) ||
      seen.has(day.dateUTC) ||
      !integer(day.attempts) ||
      (day.best !== null && (!validOneDropBest(day.best) || day.best.dateUTC !== day.dateUTC))
    ) {
      throw new Error("Invalid One Drop day record; original save preserved");
    }
    seen.add(day.dateUTC);
    days.push({
      dateUTC: day.dateUTC,
      attempts: day.attempts,
      best: day.best ? { ...day.best } : null,
    });
  }
  return {
    version: 1,
    days,
    allTimeBest: s.allTimeBest ? { ...s.allTimeBest } : null,
  };
}
