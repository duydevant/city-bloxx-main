import { sdk, inPlayablesEnv } from "./ytgame.js";
import { logError } from "./health.js";
import { flushSave } from "./save.js";
import { flushScore, retryPendingScore } from "./engagement.js";
import { suspend as suspendAudio, resume as resumeAudio } from "./sfx.js";
import type { ViewportSize } from "./types.js";

/**
 * Pause / Resume / Resize.
 *
 * YouTube goi `system.onPause()` khi nguoi dung roi khoi game (chuyen tab,
 * mo app khac, man hinh khoa). Game PHAI dung vong lap va luu tien do.
 * Khong co dam bao `onResume()` se duoc goi — nguoi dung co the vao lai
 * bang mot phien hoan toan moi, vi the tien do phai nam trong cloud save.
 */

type PauseCb = () => void;
const pauseCbs = new Set<PauseCb>();
const resumeCbs = new Set<PauseCb>();
let paused = false;
let wired = false;

export function isPaused(): boolean {
  wire();
  return paused;
}

function enterPause(reason: string): void {
  if (paused) return;
  paused = true;
  // Luu tien do + day diem truoc khi mat quyen dieu khien.
  void flushSave().catch((e) => logError("flushSave on pause failed", e));
  void flushScore().catch((e) => logError("flushScore on pause failed", e));
  suspendAudio();
  pauseCbs.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      logError(`pause listener threw (${reason})`, e);
    }
  });
}

function leavePause(): void {
  if (!paused) return;
  paused = false;
  resumeAudio();
  void retryPendingScore().catch((e) => logError("retryPendingScore on resume failed", e));
  resumeCbs.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      logError("resume listener threw", e);
    }
  });
}

export function onPause(cb: PauseCb): () => void {
  wire();
  pauseCbs.add(cb);
  return () => pauseCbs.delete(cb);
}

export function onResume(cb: PauseCb): () => void {
  wire();
  resumeCbs.add(cb);
  return () => resumeCbs.delete(cb);
}

/** Test/dev: kich pause-resume thu cong. */
export function simulatePause(): void {
  enterPause("simulated");
}
export function simulateResume(): void {
  leavePause();
}

function wire(): void {
  if (wired) return;
  wired = true;

  if (inPlayablesEnv()) {
    try {
      sdk()!.system.onPause(() => enterPause("sdk"));
      sdk()!.system.onResume(() => leavePause());
    } catch (e) {
      logError("system.onPause/onResume wiring failed", e);
    }
  }

  if (typeof document === "undefined") return;
  // Backup cho truong hop ngoai Playables (va ca khi SDK khong kip bao):
  // tab bi an = game phai dung.
  document.addEventListener("visibilitychange", () => {
    if (inPlayablesEnv()) return; // Actual host owns pause/resume; visibility cannot override SDK pause.
    if (document.visibilityState === "hidden") enterPause("visibilitychange");
    else leavePause();
  });
  window.addEventListener("pagehide", () => {
    void flushSave().catch(() => {});
    void flushScore().catch(() => {});
  });
}

// ---- Viewport ----

export function getViewport(el?: HTMLElement): ViewportSize {
  const w = el ? el.clientWidth : window.innerWidth;
  const h = el ? el.clientHeight : window.innerHeight;
  return {
    width: w,
    height: h,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    orientation: h >= w ? "portrait" : "landscape",
  };
}

export function onResize(cb: (size: ViewportSize) => void, el?: HTMLElement): () => void {
  let raf = 0;
  const fire = (): void => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => cb(getViewport(el)));
  };

  let ro: ResizeObserver | null = null;
  if (el && typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(fire);
    ro.observe(el);
  }
  window.addEventListener("resize", fire);
  window.addEventListener("orientationchange", fire);

  return () => {
    cancelAnimationFrame(raf);
    ro?.disconnect();
    window.removeEventListener("resize", fire);
    window.removeEventListener("orientationchange", fire);
  };
}
