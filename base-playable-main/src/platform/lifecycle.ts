import { sdk, inPlayablesEnv } from "./ytgame.js";
import { logError, logWarning } from "./health.js";

/**
 * Thu tu bat buoc (Test Suite MUST):
 *   firstFrameReady()  ->  gameReady()
 * Va gameReady() khong duoc goi khi man hinh loading con dang hien.
 *
 * Hai ham nay deu la "mot lan duy nhat" — goi lai se bi bo qua,
 * vi vay game khong the vo tinh pha vo MUST-check.
 */

let firstFrameCalled = false;
let readyCalled = false;

/** Ham kiem tra loading screen, do host gan vao. */
let loadingVisibleCheck: (() => boolean) | null = null;
export function setLoadingVisibleCheck(fn: () => boolean): void {
  loadingVisibleCheck = fn;
}

export function notifyFirstFrameReady(): void {
  if (firstFrameCalled) return;
  firstFrameCalled = true;
  try {
    sdk()?.game.firstFrameReady();
  } catch (e) {
    logError("firstFrameReady failed", e);
  }
}

export function notifyGameReady(): boolean {
  if (readyCalled) {
    logWarning("gameReady called more than once — ignored");
    return false;
  }
  if (!firstFrameCalled) {
    logWarning("gameReady called before firstFrameReady — auto-firing firstFrameReady");
    notifyFirstFrameReady();
  }
  if (loadingVisibleCheck && loadingVisibleCheck()) {
    logWarning("gameReady called while the loading screen is still visible");
  }
  readyCalled = true;
  try {
    sdk()?.game.gameReady();
    return true;
  } catch (e) {
    logError("gameReady failed", e);
    return false;
  }
}

export function isFirstFrameReady(): boolean {
  return firstFrameCalled;
}
export function isGameReady(): boolean {
  return readyCalled;
}
export { inPlayablesEnv };
