import { sdk, inPlayablesEnv } from "./ytgame.js";
import { logError, logWarning } from "./health.js";
import { getSavedScoreMeta, updateSavedScoreMeta } from "./save.js";

/**
 * engagement.sendScore — day diem len leaderboard cua YouTube.
 *
 * Quy tac cua YouTube + Y1 Hardening:
 *  - `value` phai la SO NGUYEN, >= 0, <= Number.MAX_SAFE_INTEGER.
 *  - Chi gui PB population cua Quick Standard, idempotent + monotonic.
 *  - Persist highest pending PB va last acknowledged score metadata trong save envelope.
 *  - Chi ghi ack khi SDK promise resolve thanh cong.
 *  - Neu submit loi: giu pending, retry exponential 1/2/4/8/16s (cap 30s),
 *    huy timer khi dispose, va thu lai khi resume / reload.
 */

export type ScoreSyncStatus = "idle" | "pending" | "synced" | "error";

export interface ScoreSyncState {
  status: ScoreSyncStatus;
  pendingScore: number;
  ackedScore: number;
  ackedAt: number;
  retryAttempt: number;
  nextRetryDelayMs: number;
  lastError?: string;
}

type ScoreStateListener = (state: ScoreSyncState) => void;

export const RETRY_DELAYS_SECONDS = [1, 2, 4, 8, 16, 30] as const;
const MAX_RETRY_DELAY_MS = 30_000;
const DEBOUNCE_MS = 800;

let ackedScore = 0;
let ackedAt = 0;
let pendingScore: number | null = null;
let status: ScoreSyncStatus = "idle";
let retryAttempt = 0;
let nextRetryDelayMs = 0;
let lastError: string | undefined;
let timer: number | undefined;
let retryTimer: number | undefined;
let inFlight: Promise<void> | null = null;
let disposed = false;
const listeners = new Set<ScoreStateListener>();

export function getRetryDelayMs(attempt: number): number {
  if (!Number.isFinite(attempt) || attempt <= 0) return 0;
  const rawMs = Math.min(MAX_RETRY_DELAY_MS, Math.pow(2, Math.floor(attempt) - 1) * 1000);
  const w = typeof window !== "undefined" ? (window as unknown as { __playableScoreRetryScale?: number }) : undefined;
  const scale = typeof w?.__playableScoreRetryScale === "number" && w.__playableScoreRetryScale > 0 ? w.__playableScoreRetryScale : 1;
  return Math.max(10, Math.round(rawMs * scale));
}

function normalize(value: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const v = Math.floor(value);
  if (v < 0) return null;
  if (v > Number.MAX_SAFE_INTEGER) return null;
  return v;
}

export function getScoreState(): ScoreSyncState {
  return {
    status,
    pendingScore: Math.max(pendingScore ?? 0, ackedScore),
    ackedScore,
    ackedAt,
    retryAttempt,
    nextRetryDelayMs,
    ...(lastError ? { lastError } : {}),
  };
}

function notifyListeners(): void {
  const snapshot = getScoreState();
  listeners.forEach((cb) => {
    try {
      cb(snapshot);
    } catch (e) {
      logError("score state listener threw", e);
    }
  });
}

export function onScoreStateChange(cb: ScoreStateListener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function syncFromSavedMeta(): void {
  const meta = getSavedScoreMeta();
  if (meta.ackedScore > ackedScore) {
    ackedScore = meta.ackedScore;
  }
  if (meta.ackedAt > ackedAt) {
    ackedAt = meta.ackedAt;
  }
  if (meta.pendingScore > ackedScore && (pendingScore === null || meta.pendingScore > pendingScore)) {
    pendingScore = meta.pendingScore;
  }
}

export async function reconcileSavedScore(savedBest: number): Promise<void> {
  disposed = false;
  window.clearTimeout(timer);
  timer = undefined;
  window.clearTimeout(retryTimer);
  retryTimer = undefined;
  retryAttempt = 0;
  nextRetryDelayMs = 0;
  lastError = undefined;
  const meta = getSavedScoreMeta();
  ackedScore = meta.ackedScore;
  ackedAt = meta.ackedAt;
  const normalizedBest = normalize(savedBest) ?? 0;
  const highest = Math.max(normalizedBest, meta.pendingScore);
  if (highest > ackedScore) {
    pendingScore = highest;
    status = "pending";
    void updateSavedScoreMeta({ pendingScore: highest, ackedScore, ackedAt }, false);
    notifyListeners();
    await flushScore(highest);
    return;
  }
  pendingScore = null;
  status = ackedScore > 0 ? "synced" : "idle";
  if (ackedScore > 0) {
    void updateSavedScoreMeta({ pendingScore: ackedScore, ackedScore, ackedAt }, false);
  }
  notifyListeners();
}

export async function sendScore(value: number): Promise<void> {
  disposed = false;
  syncFromSavedMeta();
  const v = normalize(value);
  if (v === null) {
    logWarning(`sendScore ignored: invalid value ${String(value)}`);
    return;
  }
  if (v <= ackedScore && (pendingScore === null || v <= pendingScore)) {
    if (ackedScore > 0 && (pendingScore === null || pendingScore <= ackedScore)) {
      status = "synced";
      notifyListeners();
    }
    return;
  }
  pendingScore = Math.max(pendingScore ?? 0, v);
  status = "pending";
  void updateSavedScoreMeta({ pendingScore, ackedScore, ackedAt }, true);
  notifyListeners();
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = undefined;
    void flushPending();
  }, DEBOUNCE_MS);
}

async function flushPending(): Promise<void> {
  window.clearTimeout(timer);
  timer = undefined;
  window.clearTimeout(retryTimer);
  retryTimer = undefined;

  if (disposed) return;
  syncFromSavedMeta();

  if (pendingScore === null || pendingScore <= ackedScore) {
    pendingScore = null;
    retryAttempt = 0;
    nextRetryDelayMs = 0;
    lastError = undefined;
    if (ackedScore > 0) {
      status = "synced";
      notifyListeners();
    }
    return;
  }

  if (inFlight) {
    await inFlight;
    return;
  }

  inFlight = (async () => {
    while (!disposed && pendingScore !== null && pendingScore > ackedScore) {
      const target = pendingScore;
      status = "pending";
      notifyListeners();

      const y = sdk();
      if (!y?.engagement?.sendScore) {
        if (!inPlayablesEnv()) {
          return;
        }
      }

      try {
        await y!.engagement.sendScore({ value: target });
        ackedScore = Math.max(ackedScore, target);
        ackedAt = Date.now();
        retryAttempt = 0;
        nextRetryDelayMs = 0;
        lastError = undefined;
        void updateSavedScoreMeta(
          { pendingScore: Math.max(pendingScore ?? 0, ackedScore), ackedScore, ackedAt },
          true
        );
        if ((pendingScore ?? 0) <= ackedScore) {
          pendingScore = null;
          status = "synced";
          notifyListeners();
          break;
        }
      } catch (e) {
        pendingScore = Math.max(pendingScore ?? 0, target);
        retryAttempt += 1;
        nextRetryDelayMs = getRetryDelayMs(retryAttempt);
        lastError = e instanceof Error ? e.message : String(e);
        status = "pending";
        void updateSavedScoreMeta({ pendingScore, ackedScore, ackedAt }, true);
        logError("sendScore failed", e);
        notifyListeners();
        if (!disposed) {
          const delayMs = nextRetryDelayMs;
          retryTimer = window.setTimeout(() => {
            retryTimer = undefined;
            void flushPending();
          }, delayMs);
        }
        break;
      }
    }
  })().finally(() => {
    inFlight = null;
  });

  await inFlight;
}

/** Gui ngay lap tuc, bo debounce. Dung khi game over / pause / an trang. */
export async function flushScore(value?: number): Promise<void> {
  disposed = false;
  syncFromSavedMeta();
  if (value !== undefined) {
    const v = normalize(value);
    if (v === null) {
      logWarning(`flushScore ignored: invalid value ${String(value)}`);
      return;
    }
    if (v > ackedScore && (pendingScore === null || v > pendingScore)) {
      pendingScore = v;
      status = "pending";
      void updateSavedScoreMeta({ pendingScore, ackedScore, ackedAt }, false);
      notifyListeners();
    }
  }
  if (pendingScore === null || pendingScore <= ackedScore) {
    if (ackedScore > 0 && status !== "synced") {
      status = "synced";
      notifyListeners();
    }
    return;
  }
  await flushPending();
}

export async function retryPendingScore(): Promise<void> {
  if (disposed) return;
  syncFromSavedMeta();
  if (pendingScore !== null && pendingScore > ackedScore) {
    await flushPending();
  }
}

export function disposeScore(): void {
  disposed = true;
  window.clearTimeout(timer);
  timer = undefined;
  window.clearTimeout(retryTimer);
  retryTimer = undefined;
  nextRetryDelayMs = 0;
}

export function getLastSentScore(): number {
  return ackedScore;
}
