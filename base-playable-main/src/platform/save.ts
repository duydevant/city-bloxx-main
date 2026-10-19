import { sdk, inPlayablesEnv } from "./ytgame.js";
import { config } from "./config.js";
import { logError, logWarning } from "./health.js";

/**
 * Cloud save cua YouTube Playables.
 *
 * - Trong Playables: `ytgame.game.loadData()` / `saveData(string)`.
 *   Du lieu luu theo tai khoan nguoi dung, gioi han 3 MiB (UTF-16).
 * - Ngoai Playables (dev/preview): fallback sang localStorage de ban van
 *   test duoc vong luu/nap.
 *
 * Payload luon duoc boc trong mot phong bi co phien ban:
 *   { "v": <saveVersion>, "d": <du lieu cua game>, "score"?: <score sync meta> }
 * Keep envelope version stable; migrate the game payload schema separately.
 * Read failures throw so the game cannot overwrite old progress with defaults.
 */

export interface ScoreEnvelopeMeta {
  pendingScore: number;
  ackedScore: number;
  ackedAt: number;
}

interface Envelope<T> {
  v: number;
  d: T;
  score?: ScoreEnvelopeMeta;
}

const INTERNAL_SAVE_BUDGET_BYTES = 256 * 1024;

let encoder: TextEncoder | null | false = null;
let loadState: "unloaded" | "ready" | "failed" = "unloaded";
let lastLoadedData: unknown = undefined;
let scoreMeta: ScoreEnvelopeMeta = { pendingScore: 0, ackedScore: 0, ackedAt: 0 };

export function saveEncodingBytes(s: string): { utf8: number; utf16: number; max: number } {
  const utf16 = s.length * 2;
  let utf8 = utf16;
  try {
    if (encoder === null) {
      encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : false;
    }
    if (encoder) utf8 = encoder.encode(s).length;
  } catch {
    /* moi truong khong co TextEncoder -> dung uoc tinh UTF-16 */
  }
  return { utf8, utf16, max: Math.max(utf16, utf8) };
}

function byteSize(s: string): number {
  return saveEncodingBytes(s).max;
}

function isWellFormed(s: string): boolean {
  const f = (s as unknown as { isWellFormed?: () => boolean }).isWellFormed;
  if (typeof f === "function") {
    try {
      return f.call(s) === true;
    } catch {
      return true;
    }
  }
  // Polyfill: kiem tra surrogate lon mo
  return !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|[\uDC00-\uDFFF](?<![\uD800-\uDBFF])/.test(s);
}

function hasIllFormedString(value: unknown): boolean {
  if (typeof value === "string") return !isWellFormed(value);
  if (Array.isArray(value)) return value.some(hasIllFormedString);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasIllFormedString);
  }
  return false;
}

function buildEnvelope<T>(data: T): Envelope<T> {
  const hasScore = scoreMeta.pendingScore > 0 || scoreMeta.ackedScore > 0 || scoreMeta.ackedAt > 0;
  return hasScore
    ? { v: config.saveVersion, d: data, score: { ...scoreMeta } }
    : { v: config.saveVersion, d: data };
}

async function readRaw(): Promise<string | undefined> {
  if (inPlayablesEnv()) {
    try {
      const data = await sdk()!.game.loadData();
      return typeof data === "string" && data.length > 0 ? data : undefined;
    } catch (e) {
      logError("loadData failed", e);
      throw e;
    }
  }
  try {
    const v = window.localStorage?.getItem(config.saveKey);
    return v && v.length > 0 ? v : undefined;
  } catch (e) {
    throw e;
  }
}

async function writeRaw(data: string): Promise<boolean> {
  if (inPlayablesEnv()) {
    try {
      await sdk()!.game.saveData(data);
      return true;
    } catch (e) {
      logError("saveData failed", e);
      return false;
    }
  }
  try {
    window.localStorage?.setItem(config.saveKey, data);
    return true;
  } catch (e) {
    logWarning(`localStorage unavailable: ${String(e)}`);
    return false;
  }
}

export function hasLoadedSave(): boolean {
  return loadState === "ready";
}

export function markSaveLoadFailed(): void {
  loadState = "failed";
  lastLoadedData = undefined;
  pending = null;
  window.clearTimeout(debounce);
}

export function getSavedScoreMeta(): ScoreEnvelopeMeta {
  return { ...scoreMeta };
}

export async function updateSavedScoreMeta(
  patch: Partial<ScoreEnvelopeMeta>,
  persistNow = false
): Promise<boolean> {
  const nextPending =
    typeof patch.pendingScore === "number" && Number.isFinite(patch.pendingScore) && patch.pendingScore >= 0
      ? Math.floor(patch.pendingScore)
      : scoreMeta.pendingScore;
  const nextAcked =
    typeof patch.ackedScore === "number" && Number.isFinite(patch.ackedScore) && patch.ackedScore >= 0
      ? Math.floor(patch.ackedScore)
      : scoreMeta.ackedScore;
  const nextAckedAt =
    typeof patch.ackedAt === "number" && Number.isFinite(patch.ackedAt) && patch.ackedAt >= 0
      ? Math.floor(patch.ackedAt)
      : scoreMeta.ackedAt;
  scoreMeta = {
    ackedScore: Math.max(scoreMeta.ackedScore, nextAcked),
    pendingScore: Math.max(scoreMeta.pendingScore, nextPending, nextAcked),
    ackedAt: Math.max(scoreMeta.ackedAt, nextAckedAt),
  };
  if (!persistNow || loadState !== "ready" || lastLoadedData === undefined) {
    return false;
  }
  return persistSave(lastLoadedData);
}

export async function loadSave<T>(fallback: T): Promise<T> {
  let raw: string | undefined;
  try {
    raw = await readRaw();
  } catch (e) {
    loadState = "failed";
    lastLoadedData = undefined;
    throw e;
  }
  if (!raw) {
    loadState = "ready";
    scoreMeta = { pendingScore: 0, ackedScore: 0, ackedAt: 0 };
    lastLoadedData = undefined;
    return fallback;
  }
  try {
    const env = JSON.parse(raw) as Envelope<T>;
    if (!env || typeof env !== "object") throw new Error("Invalid save envelope");
    if (env.v !== config.saveVersion) {
      logWarning(`save version mismatch (got ${String(env.v)}, want ${config.saveVersion}) — original preserved`);
      throw new Error("Unsupported save envelope; original data preserved");
    }
    if (env.d === null || typeof env.d !== "object") throw new Error("Invalid save payload");
    const pendingScore =
      typeof env.score?.pendingScore === "number" && Number.isFinite(env.score.pendingScore) && env.score.pendingScore >= 0
        ? Math.floor(env.score.pendingScore)
        : 0;
    const ackedScore =
      typeof env.score?.ackedScore === "number" && Number.isFinite(env.score.ackedScore) && env.score.ackedScore >= 0
        ? Math.floor(env.score.ackedScore)
        : 0;
    const ackedAt =
      typeof env.score?.ackedAt === "number" && Number.isFinite(env.score.ackedAt) && env.score.ackedAt >= 0
        ? Math.floor(env.score.ackedAt)
        : 0;
    scoreMeta = {
      pendingScore: Math.max(pendingScore, ackedScore),
      ackedScore,
      ackedAt,
    };
    loadState = "ready";
    lastLoadedData = undefined;
    return env.d;
  } catch (e) {
    loadState = "failed";
    lastLoadedData = undefined;
    logError("corrupt save data", e);
    throw e;
  }
}

export async function persistSave<T>(data: T): Promise<boolean> {
  if (loadState !== "ready") {
    logWarning(`persistSave blocked: loadSave has not succeeded (state=${loadState})`);
    return false;
  }
  if (hasIllFormedString(data)) {
    logWarning("save payload contains ill-formed UTF-16 string — refusing to send");
    return false;
  }
  let payload: string;
  try {
    const env = buildEnvelope(data);
    payload = JSON.stringify(env);
  } catch (e) {
    logError("save payload is not serializable", e);
    return false;
  }

  if (!isWellFormed(payload)) {
    logWarning("save payload is not well-formed UTF-16 — refusing to send");
    return false;
  }
  const baseSize = byteSize(JSON.stringify({ v: config.saveVersion, d: data }));
  const size = byteSize(payload);
  if (baseSize > INTERNAL_SAVE_BUDGET_BYTES || size > config.saveMaxBytes) {
    logError(
      `SIZE_LIMIT_EXCEEDED: save payload is ${size} bytes (base ${baseSize}), limit is ${INTERNAL_SAVE_BUDGET_BYTES}`
    );
    return false;
  }
  const ok = await writeRaw(payload);
  if (ok) {
    lastLoadedData = data;
  }
  return ok;
}

export async function clearSave(): Promise<void> {
  loadState = "ready";
  lastLoadedData = undefined;
  scoreMeta = { pendingScore: 0, ackedScore: 0, ackedAt: 0 };
  try {
    window.localStorage?.removeItem(config.saveKey);
  } catch {
    /* ignore */
  }
  if (!inPlayablesEnv()) return;
  try {
    await sdk()!.game.saveData("");
  } catch (e) {
    logError("clearSave failed", e);
  }
}

/** Ghi save ngay lap tuc neu co the — dung khi bi pause/an trang. */
let pending: string | null = null;
let debounce: number | undefined;

export function scheduleSave<T>(data: T, delayMs = 250): void {
  if (loadState !== "ready" || hasIllFormedString(data)) {
    logWarning(`scheduleSave blocked: loadSave has not succeeded or ill-formed data (state=${loadState})`);
    return;
  }
  window.clearTimeout(debounce);
  try {
    if (byteSize(JSON.stringify({ v: config.saveVersion, d: data })) > INTERNAL_SAVE_BUDGET_BYTES) {
      logError("SIZE_LIMIT_EXCEEDED on scheduled save");
      pending = null;
      return;
    }
    pending = JSON.stringify(buildEnvelope(data));
    lastLoadedData = data;
  } catch {
    pending = null;
    return;
  }
  debounce = window.setTimeout(() => {
    const p = pending;
    pending = null;
    if (!p) return;
    void persistSaveRawValidated(p);
  }, delayMs);
}

export async function flushSave(): Promise<void> {
  window.clearTimeout(debounce);
  const p = pending;
  pending = null;
  if (!p || loadState !== "ready") return;
  await persistSaveRawValidated(p);
}

async function persistSaveRawValidated(payload: string): Promise<boolean> {
  if (loadState !== "ready") return false;
  if (!isWellFormed(payload)) return false;
  if (byteSize(payload) > config.saveMaxBytes) {
    logError("SIZE_LIMIT_EXCEEDED on scheduled save");
    return false;
  }
  return writeRaw(payload);
}
