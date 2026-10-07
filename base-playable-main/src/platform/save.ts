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
 *   { "v": <saveVersion>, "d": <du lieu cua game> }
 * Keep envelope version stable; migrate the game payload schema separately.
 * Read failures throw so the game cannot overwrite old progress with defaults.
 */

interface Envelope<T> {
  v: number;
  d: T;
}

let encoder: TextEncoder | null | false = null;

function byteSize(s: string): number {
  // UTF-16 (cach YouTube tinh) va UTF-8 — lay cai lon hon cho an toan.
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
  return Math.max(utf16, utf8);
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
  return !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|[\uDC00-\uDFFF](?![\uD800-\uDBFF])/.test(s);
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

export async function loadSave<T>(fallback: T): Promise<T> {
  const raw = await readRaw();
  if (!raw) return fallback;
  try {
    const env = JSON.parse(raw) as Envelope<T>;
    if (!env || typeof env !== "object") throw new Error("Invalid save envelope");
    if (env.v !== config.saveVersion) {
      logWarning(`save version mismatch (got ${String(env.v)}, want ${config.saveVersion}) — original preserved`);
      throw new Error("Unsupported save envelope; original data preserved");
    }
    if (env.d === null || typeof env.d !== "object") throw new Error("Invalid save payload");
    return env.d;
  } catch (e) {
    logError("corrupt save data", e);
    throw e;
  }
}

export async function persistSave<T>(data: T): Promise<boolean> {
  let payload: string;
  try {
    const env: Envelope<T> = { v: config.saveVersion, d: data };
    payload = JSON.stringify(env);
  } catch (e) {
    logError("save payload is not serializable", e);
    return false;
  }

  if (!isWellFormed(payload)) {
    logWarning("save payload is not well-formed UTF-16 — refusing to send");
    return false;
  }
  const size = byteSize(payload);
  if (size > config.saveMaxBytes) {
    logError(
      `SIZE_LIMIT_EXCEEDED: save payload is ${size} bytes, limit is ${config.saveMaxBytes}`
    );
    return false;
  }
  return writeRaw(payload);
}

export async function clearSave(): Promise<void> {
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
  window.clearTimeout(debounce);
  try {
    pending = JSON.stringify({ v: config.saveVersion, d: data } as Envelope<T>);
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
  if (!p) return;
  await persistSaveRawValidated(p);
}

async function persistSaveRawValidated(payload: string): Promise<boolean> {
  if (!isWellFormed(payload)) return false;
  if (byteSize(payload) > config.saveMaxBytes) {
    logError("SIZE_LIMIT_EXCEEDED on scheduled save");
    return false;
  }
  return writeRaw(payload);
}
