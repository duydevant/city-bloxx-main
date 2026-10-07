import { sdk, inPlayablesEnv } from "./ytgame.js";
import { logError, logWarning } from "./health.js";

/**
 * engagement.sendScore — day diem len leaderboard cua YouTube.
 *
 * Quy tac cua YouTube:
 *  - `value` phai la SO NGUYEN, >= 0, <= Number.MAX_SAFE_INTEGER.
 *  - Gui diem cao hon hoac bang gia tri da gui se bi tu choi, nen o day
 *    chi gui khi diem tang (monotonic).
 *  - Khong nen spam: debounced 800 ms, va flush khi game over / pause.
 */

let lastSent = -1;
let pending: number | null = null;
let timer: number | undefined;
const DEBOUNCE_MS = 800;

function normalize(value: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const v = Math.floor(value);
  if (v < 0) return null;
  if (v > Number.MAX_SAFE_INTEGER) return null;
  return v;
}

export async function sendScore(value: number): Promise<void> {
  if (!inPlayablesEnv()) return;
  const v = normalize(value);
  if (v === null) {
    logWarning(`sendScore ignored: invalid value ${String(value)}`);
    return;
  }
  if (v <= lastSent) return;
  pending = v;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    void flushPending();
  }, DEBOUNCE_MS);
}

async function flushPending(): Promise<void> {
  window.clearTimeout(timer);
  timer = undefined;
  const v = pending;
  pending = null;
  if (v === null || v <= lastSent) return;
  try {
    await sdk()!.engagement.sendScore({ value: v });
    lastSent = v;
  } catch (e) {
    logError("sendScore failed", e);
  }
}

/** Gui ngay lap tuc, bo debounce. Dung khi game over / pause / an trang. */
export async function flushScore(value?: number): Promise<void> {
  if (!inPlayablesEnv()) return;
  if (value !== undefined) {
    const v = normalize(value);
    if (v !== null && v > lastSent) pending = v;
  }
  await flushPending();
}

export function getLastSentScore(): number {
  return lastSent < 0 ? 0 : lastSent;
}
