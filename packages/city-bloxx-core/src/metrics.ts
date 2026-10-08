import type { PlacementQuality } from "./run";

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
