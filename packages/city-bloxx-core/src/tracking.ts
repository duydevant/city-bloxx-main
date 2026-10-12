import { BUILDING_IDS, type BuildingId } from "./buildings";
import { emptyQualities, type QualityCounts, type RunMetrics } from "./metrics";
import type { QuickTowerGame, RunConfig, RunResult } from "./run";
import { SETTLEMENT_REWARDS } from "../../city-bloxx-content/settlement";
import { type DailyDefinition } from "./daily";

export type StatsGroup = "quick-standard" | "quick-assist" | "city" | "daily";
export interface RunIdentity { id: string; installationId: string; sequence: number }
export interface RunContext { identity: RunIdentity; startedAt: number }
export interface RunSummary extends RunContext {
  mode: RunConfig["mode"]; building: BuildingId; assist: boolean; seed: number;
  physicsVersion: string; rulesetVersion: string; endedAt: number; endTick: number;
  result: RunResult; metrics: RunMetrics | null;
  outcome: "ended" | "abandoned"; complete: boolean;
  verification: "local"; replayStatus: "available" | "pruned" | "unsupported" | "not-recorded";
  xpEarned?: number; rewardVersion?: string;
  baseXPEarned?: number; bonusXPEarned?: number; builderXPBefore?: number;
  unlockedAchievements?: string[]; progressionRewardVersion?: string;
  daily?: DailyDefinition;
}
export interface StatTotals {
  attempts: number; abandoned: number; landedBody: number; scoredBody: number;
  quality: QualityCounts; population: number; bestHeight: number; bestStreak: number;
  completed: number; roof: QualityCounts; maxCombo: number; errorCount: number; signedErrorSum: number;
}
export interface LifetimeStats {
  trackedSince: number; totals: StatTotals;
  byMode: Record<StatsGroup, StatTotals>; byClass: Record<BuildingId, StatTotals>;
}
export function emptyTotals(): StatTotals {
  return { attempts: 0, abandoned: 0, landedBody: 0, scoredBody: 0, quality: emptyQualities(), population: 0,
    bestHeight: 0, bestStreak: 0, completed: 0, roof: emptyQualities(), maxCombo: 0, errorCount: 0, signedErrorSum: 0 };
}
export function emptyStats(): LifetimeStats {
  return { trackedSince: 0, totals: emptyTotals(), byMode: { "quick-standard": emptyTotals(), "quick-assist": emptyTotals(), city: emptyTotals(), daily: emptyTotals() },
    byClass: Object.fromEntries(BUILDING_IDS.map(id => [id, emptyTotals()])) as Record<BuildingId, StatTotals> };
}
export function makeSummary(game: QuickTowerGame, context: RunContext, endedAt: number, outcome: RunSummary["outcome"] = "ended"): RunSummary {
  const state = game.getSnapshot(), result = game.getResult();
  if (outcome === "ended" && state.phase !== "ended") throw new Error("Cannot settle an unfinished tower");
  return { ...context, mode: game.config.mode, building: state.building, assist: game.config.assist, seed: game.config.seed,
    physicsVersion: state.physicsVersion, rulesetVersion: state.rulesetVersion, endedAt: Math.max(context.startedAt, endedAt), endTick: state.tick,
    result, metrics: game.getMetrics(), outcome,
    complete: outcome === "ended" && game.config.mode !== "quick" && result.height === state.targetFloors,
    ...(game.config.mode === "daily" ? { daily: game.config.daily } : {}),
    verification: "local", replayStatus: "not-recorded" };
}
export function applySummary(totals: StatTotals, summary: RunSummary): StatTotals {
  const m = summary.metrics;
  const next = { ...totals, quality: { ...totals.quality }, roof: { ...totals.roof } };
  next.attempts++; next.abandoned += Number(summary.outcome === "abandoned");
  next.population += summary.result.population; next.bestHeight = Math.max(next.bestHeight, summary.result.height);
  next.bestStreak = Math.max(next.bestStreak, summary.result.bestStreak); next.completed += Number(summary.complete);
  if (m) {
    for (const key of Object.keys(m.body) as (keyof QualityCounts)[]) { next.quality[key] += m.body[key]; next.scoredBody += m.body[key]; }
    next.landedBody += m.body.perfect + m.body.great + m.body.good + m.body.risky;
    if (m.roof) next.roof[m.roof]++;
    next.maxCombo = Math.max(next.maxCombo, m.maxCombo);
    next.errorCount += m.errorCount; next.signedErrorSum = Math.round((next.signedErrorSum + m.signedErrorSum) * 1000) / 1000;
  }
  return next;
}
export function perfectRate(totals: StatTotals): number | null {
  return totals.scoredBody ? Math.round(totals.quality.perfect / totals.scoredBody * 1000) / 10 : null;
}
export function runXP(summary: RunSummary): number {
  if (!summary.metrics) return 0; // Never invent body rewards for legacy unknown data.
  const body = summary.metrics.body;
  return (body.perfect + body.great + body.good + body.risky) * SETTLEMENT_REWARDS.landedBody +
    body.perfect * SETTLEMENT_REWARDS.perfectBody + Number(summary.complete) * SETTLEMENT_REWARDS.finiteCompletion;
}
export const RUN_REWARD_VERSION = SETTLEMENT_REWARDS.version;
