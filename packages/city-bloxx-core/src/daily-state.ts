import { checkpointTower, restoreTower, type TowerCheckpoint } from "./checkpoint";
import { isUTCDate, shiftUTCDate, validateDaily, type DailyDefinition } from "./daily";
import { type QuickTowerGame, type RunResult } from "./run";
import { type RunContext, type RunSummary } from "./tracking";

export interface DailyBest { result: RunResult; perfectRate: number; endedAt: number }
export interface DailyDay { dateUTC: string; attempts: number; bestComplete: DailyBest | null; bestFailedHeight: number }
export interface DailyPending extends RunContext { checkpoint: TowerCheckpoint; previousBest: number }
export interface DailyState {
  version: 1; creditedDates: string[]; streak: number; longestStreak: number;
  latestCreditedDate: string | null; lifetimeCreditedDays: number; days: DailyDay[]; pending: DailyPending | null;
}
export function emptyDaily(): DailyState {
  return { version: 1, creditedDates: [], streak: 0, longestStreak: 0, latestCreditedDate: null, lifetimeCreditedDays: 0, days: [], pending: null };
}
const integer = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const sameDate = (a: string, b: string) => a.localeCompare(b);
export function validateDailyState(value: DailyState): DailyState {
  const fail = (): never => { throw new Error("Unsupported Daily save; original preserved"); };
  if (!value || value.version !== 1 || !integer(value.streak) || !integer(value.longestStreak) || value.longestStreak < value.streak ||
    !Array.isArray(value.creditedDates) || value.creditedDates.length > 7 || !value.creditedDates.every(isUTCDate) || new Set(value.creditedDates).size !== value.creditedDates.length) fail();
  // C4.0 shipped only the four scaffold fields. Extend it without resetting existing credits.
  const legacy = value.days === undefined && value.pending === undefined && value.lifetimeCreditedDays === undefined && value.latestCreditedDate === undefined;
  const dates = [...value.creditedDates].sort(sameDate);
  const s: DailyState = legacy ? { ...emptyDaily(), ...value, latestCreditedDate: dates[dates.length - 1] ?? null, lifetimeCreditedDays: value.creditedDates.length } : value;
  if (!(s.latestCreditedDate === null || isUTCDate(s.latestCreditedDate)) || !integer(s.lifetimeCreditedDays) || s.lifetimeCreditedDays < s.creditedDates.length ||
    s.creditedDates.some(d => s.latestCreditedDate === null || d > s.latestCreditedDate) || !Array.isArray(s.days) || s.days.length > 7 || new Set(s.days.map(d => d?.dateUTC)).size !== s.days.length) fail();
  for (const day of s.days) {
    if (!day || !isUTCDate(day.dateUTC) || !integer(day.attempts) || !integer(day.bestFailedHeight) || day.bestFailedHeight > 20) fail();
    const b = day.bestComplete;
    if (b !== null && (!b || !integer(b.endedAt) || !Number.isFinite(b.perfectRate) || b.perfectRate < 0 || b.perfectRate > 100 || !b.result || b.result.height !== 20 || b.result.ranked !== false || ![b.result.population, b.result.durationTicks, b.result.perfectCount, b.result.bestStreak, b.result.misses].every(integer) || b.result.misses > 3 || !Number.isFinite(b.result.accuracy) || b.result.accuracy < 0 || b.result.accuracy > 100 || !["S", "A", "B", "C", "D"].includes(b.result.rating) || b.result.ratingVersion !== "city-rating-1")) fail();
  }
  if (s.pending !== null) {
    if (!s.pending || !integer(s.pending.startedAt) || !integer(s.pending.previousBest) || !s.pending.identity || s.pending.checkpoint?.config?.mode !== "daily") fail();
    restoreTower(s.pending.checkpoint); // Never reinterpret an unsupported pinned recipe.
  }
  return JSON.parse(JSON.stringify(s));
}
function updateDay(state: DailyState, dateUTC: string, edit: (day: DailyDay) => DailyDay): DailyState {
  const old = state.days.find(d => d.dateUTC === dateUTC) ?? { dateUTC, attempts: 0, bestComplete: null, bestFailedHeight: 0 };
  const days = [edit(old), ...state.days.filter(d => d.dateUTC !== dateUTC)].sort((a, b) => sameDate(b.dateUTC, a.dateUTC)).slice(0, 7);
  return { ...state, days };
}
export function beginDaily(state: DailyState, game: QuickTowerGame, context: RunContext): DailyState {
  if (state.pending || game.config.mode !== "daily" || game.getTick() !== 0) throw new Error("Finish or discard the pending Daily first");
  const d = validateDaily(game.config.daily), previousBest = state.days.find(day => day.dateUTC === d.dateUTC)?.bestComplete?.result.population ?? 0;
  return { ...updateDay(state, d.dateUTC, day => ({ ...day, attempts: day.attempts + 1 })), pending: { ...context, previousBest, checkpoint: checkpointTower(game) } };
}
export function creditDaily(state: DailyState, dateUTC: string): DailyState {
  if (!isUTCDate(dateUTC)) throw new Error("Invalid Daily credit date");
  // A monotonic watermark also protects dates already pruned from the seven-day strip.
  if (state.latestCreditedDate && dateUTC <= state.latestCreditedDate) return state;
  const streak = state.latestCreditedDate && shiftUTCDate(state.latestCreditedDate, 1) === dateUTC ? state.streak + 1 : 1;
  return { ...state, creditedDates: [...state.creditedDates, dateUTC].sort(sameDate).slice(-7), latestCreditedDate: dateUTC,
    lifetimeCreditedDays: state.lifetimeCreditedDays + 1, streak, longestStreak: Math.max(state.longestStreak, streak) };
}
export function checkpointDaily(state: DailyState, game: QuickTowerGame): DailyState {
  const pending = state.pending;
  if (!pending || game.config.mode !== "daily" || game.config.daily!.id !== pending.checkpoint.config.daily?.id) throw new Error("Daily checkpoint mismatch");
  const next = { ...state, pending: { ...pending, checkpoint: checkpointTower(game) } };
  return game.getMetrics().errorCount > 0 ? creditDaily(next, game.config.daily!.dateUTC) : next;
}
export function currentDailyStreak(state: DailyState, dateUTC: string): number {
  if (!isUTCDate(dateUTC)) throw new Error("Invalid streak date");
  return state.latestCreditedDate === dateUTC || state.latestCreditedDate === shiftUTCDate(dateUTC, -1) ? state.streak : 0;
}
export function dailyPerfectRate(summary: Pick<RunSummary, "metrics">): number {
  return summary.metrics?.errorCount ? summary.metrics.body.perfect / summary.metrics.errorCount * 100 : 0;
}
function better(a: DailyBest, b: DailyBest | null): boolean {
  if (!b) return true;
  const keys = [a.result.population - b.result.population, a.result.height - b.result.height, a.perfectRate - b.perfectRate,
    b.result.misses - a.result.misses, b.result.durationTicks - a.result.durationTicks, b.endedAt - a.endedAt];
  return (keys.find(n => n !== 0) ?? 0) > 0;
}
export function settleDaily(state: DailyState, summary: RunSummary): DailyState {
  const d: DailyDefinition = validateDaily(summary.daily);
  let next = summary.metrics && summary.metrics.errorCount > 0 ? creditDaily(state, d.dateUTC) : state;
  const candidate = { result: summary.result, perfectRate: dailyPerfectRate(summary), endedAt: summary.endedAt };
  next = updateDay(next, d.dateUTC, day => ({ ...day,
    bestComplete: summary.complete && better(candidate, day.bestComplete) ? candidate : day.bestComplete,
    bestFailedHeight: summary.complete ? day.bestFailedHeight : Math.max(day.bestFailedHeight, Math.min(20, summary.result.height)) }));
  return { ...next, pending: summary.outcome === "abandoned" && next.pending?.identity.id === summary.identity.id ? null : next.pending };
}
