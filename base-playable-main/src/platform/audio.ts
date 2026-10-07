import { sdk, inPlayablesEnv } from "./ytgame.js";
import { logError } from "./health.js";

/**
 * Trang thai am thanh theo YouTube.
 *
 * YouTube co the tat tieng cua toan bo app (nguoi dung bam nut mute tren player).
 * Game PHAI ton trong `system.isAudioEnabled()` va lang nghe
 * `system.onAudioEnabledChange()` — khong duoc tu kiem tra <audio>.muted.
 */

type Listener = (enabled: boolean) => void;

const listeners = new Set<Listener>();
let cached = true;
let wired = false;

function readInitial(): boolean {
  if (!inPlayablesEnv()) return true;
  try {
    return sdk()!.system.isAudioEnabled() !== false;
  } catch (e) {
    logError("isAudioEnabled failed", e);
    return true;
  }
}

function wire(): void {
  if (wired) return;
  wired = true;
  cached = readInitial();
  if (!inPlayablesEnv()) return;
  try {
    sdk()!.system.onAudioEnabledChange((enabled) => {
      cached = enabled !== false;
      listeners.forEach((fn) => {
        try {
          fn(cached);
        } catch (e) {
          logError("audio listener threw", e);
        }
      });
    });
  } catch (e) {
    logError("onAudioEnabledChange failed", e);
  }
}

export function isAudioEnabled(): boolean {
  wire();
  return cached;
}

/** Dang ky lang nghe. Tra ve ham huy dang ky. */
export function onAudioEnabled(cb: Listener): () => void {
  wire();
  listeners.add(cb);
  return () => listeners.delete(cb);
}
