import { config } from "./config.js";
import { inPlayablesEnv } from "./ytgame.js";
import {
  notifyFirstFrameReady,
  notifyGameReady,
  isGameReady,
  setLoadingVisibleCheck,
} from "./lifecycle.js";
import { loadSave, persistSave, clearSave, scheduleSave } from "./save.js";
import { sendScore, flushScore, getLastSentScore } from "./engagement.js";
import { showInterstitial, showRewarded, canShowInterstitial, interstitialThen } from "./ads.js";
import { isAudioEnabled, onAudioEnabled } from "./audio.js";
import { playBeep } from "./sfx.js";
import { t as translate, currentLocale } from "./i18n.js";
import {
  onPause,
  onResume,
  isPaused,
  onResize,
  getViewport,
} from "./system.js";
import { logError, logWarning } from "./health.js";
import { createLoading } from "../ui/loading.js";
import { createOverlay } from "../ui/overlay.js";
import { createToast } from "../ui/toast.js";
import type { PlayableHost } from "./types.js";

/**
 * Day la noi TAT CA yeu cau cua YouTube Playables duoc lap rap.
 * Game chi nhan object nay va dung — khong can biet SDK nam o dau.
 */

export function createHost(opts: { mount?: HTMLElement } = {}): PlayableHost {
  const root = opts.mount ?? document.getElementById("app") ?? document.body;
  root.classList.add("pv-root");

  const stage = document.createElement("div");
  stage.className = "pv-stage";
  stage.setAttribute("role", "application");
  stage.tabIndex = 0;
  root.appendChild(stage);

  const loadingApi = createLoading();
  setLoadingVisibleCheck(() => loadingApi.isVisible());
  const overlayApi = createOverlay(root);
  const toast = createToast(root);

  const host: PlayableHost = {
    root,
    stage,

    firstFrameReady: () => notifyFirstFrameReady(),
    gameReady: () => {
      notifyGameReady();
    },
    isReady: () => isGameReady(),

    load: <T>(fallback: T) => loadSave<T>(fallback),
    save: <T>(data: T) => persistSave<T>(data),
    saveLater: <T>(data: T, delayMs?: number) => scheduleSave<T>(data, delayMs),
    clearSave: () => clearSave(),

    sendScore: (v) => sendScore(v),
    flushScore: (v) => flushScore(v),
    getLastSentScore: () => getLastSentScore(),

    showInterstitial: () => showInterstitial(),
    showRewarded: (rewardId) => showRewarded(rewardId),
    canShowInterstitial: () => canShowInterstitial(),
    interstitialThen: (then) => interstitialThen(then),

    isAudioEnabled: () => isAudioEnabled(),
    onAudioEnabled: (cb) => onAudioEnabled(cb),
    beep: (name) => playBeep(name),

    get locale() {
      return currentLocale();
    },
    t: (key, vars) => translate(key, vars),

    onPause: (cb) => onPause(cb),
    onResume: (cb) => onResume(cb),
    isPaused: () => isPaused(),
    onResize: (cb) => onResize(cb, stage),
    getViewport: () => getViewport(stage),

    hideLoading: () => loadingApi.hide(),
    loading: () => loadingApi,
    overlay: () => overlayApi,
    toast: (msg, ms) => toast(msg, ms),

    logError: (ctx, err) => logError(ctx, err),
    logWarning: (ctx) => logWarning(ctx),

    inPlayables: inPlayablesEnv(),
    config,
  };

  return host;
}
