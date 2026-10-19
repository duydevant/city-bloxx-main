import { QUICK_TOWER_RULES as R } from "./rules";
import type { PlacementQuality } from "./run";
import type { RunSummary, StatsGroup } from "./tracking";

export const QUALITIES = ["perfect", "great", "good", "risky", "miss"] as const;
export type QualityCounts = Record<PlacementQuality, number>;
export interface RunMetrics {
  foundation: number;
  body: QualityCounts;
  roof: PlacementQuality | null;
  maxCombo: number;
  errorCount: number;
  signedErrorSum: number;
  signedErrors: number[];
  roofError: number | null;
}
export function emptyQualities(): QualityCounts { return { perfect: 0, great: 0, good: 0, risky: 0, miss: 0 }; }
export function emptyMetrics(): RunMetrics {
  return { foundation: 0, body: emptyQualities(), roof: null, maxCombo: 0, errorCount: 0, signedErrorSum: 0, signedErrors: [], roofError: null };
}
export function recordMetric(metrics: RunMetrics, quality: PlacementQuality, signedError: number, roof: boolean): void {
  if (roof) { metrics.roof = quality; metrics.roofError = signedError; return; }
  metrics.body[quality]++;
  metrics.errorCount++;
  metrics.signedErrorSum = Math.round((metrics.signedErrorSum + signedError) * 1000) / 1000;
  // Retain a bounded recent sample; totals remain exact after samples are pruned.
  if (metrics.signedErrors.length === 32) metrics.signedErrors.shift();
  metrics.signedErrors.push(signedError);
}

export type HeatmapFilter = "all" | StatsGroup | "one-drop";
export interface HeatmapBin {
  index: number;
  minPercent: number;
  maxPercent: number;
  count: number;
  missCount: number;
}
export interface PlacementHeatmap {
  filter: HeatmapFilter;
  windowLimit: number;
  totalMatchingRuns: number;
  runsWithSamples: number;
  sampleCount: number;
  meanSignedPercent: number | null;
  leftCount: number;
  centerCount: number;
  rightCount: number;
  leftOverflowMiss: number;
  rightOverflowMiss: number;
  bins: HeatmapBin[];
}

export function matchesHeatmapFilter(summary: RunSummary, filter: HeatmapFilter): boolean {
  if (filter === "all") return true;
  if (filter === "one-drop") return summary.mode === "one-drop";
  if (filter === "daily") return summary.mode === "daily";
  if (filter === "city") return summary.mode === "city";
  if (filter === "quick-assist") return summary.mode === "quick" && summary.assist;
  return summary.mode === "quick" && !summary.assist;
}

export function computePlacementHeatmap(history: readonly RunSummary[], filter: HeatmapFilter = "all"): PlacementHeatmap {
  const bins: HeatmapBin[] = Array.from({ length: 40 }, (_, index) => ({
    index,
    minPercent: -100 + index * 5,
    maxPercent: -95 + index * 5,
    count: 0,
    missCount: 0,
  }));
  const matching = history.filter(s => matchesHeatmapFilter(s, filter));
  let runsWithSamples = 0;
  let sampleCount = 0;
  let sumSigned = 0;
  let leftCount = 0;
  let centerCount = 0;
  let rightCount = 0;
  let leftOverflowMiss = 0;
  let rightOverflowMiss = 0;
  const missThreshold = Math.round((1 - R.minimumOverlapRatio) * 1000) / 1000;

  for (const summary of matching) {
    const samples = summary.metrics?.signedErrors;
    if (!samples || samples.length === 0) continue;
    runsWithSamples++;
    for (const raw of samples) {
      if (!Number.isFinite(raw)) continue;
      sampleCount++;
      sumSigned += raw;
      if (raw < 0) leftCount++;
      else if (raw > 0) rightCount++;
      else centerCount++;

      if (raw < -1) {
        leftOverflowMiss++;
        continue;
      }
      if (raw > 1) {
        rightOverflowMiss++;
        continue;
      }
      const pct = raw * 100;
      const binIndex = raw === 1 ? 39 : Math.min(39, Math.max(0, Math.floor((pct + 100) / 5)));
      bins[binIndex].count++;
      if (Math.abs(raw) >= missThreshold) {
        bins[binIndex].missCount++;
      }
    }
  }

  return {
    filter,
    windowLimit: 50,
    totalMatchingRuns: matching.length,
    runsWithSamples,
    sampleCount,
    meanSignedPercent: sampleCount > 0 ? Math.round((sumSigned / sampleCount) * 1000) / 10 : null,
    leftCount,
    centerCount,
    rightCount,
    leftOverflowMiss,
    rightOverflowMiss,
    bins,
  };
}

