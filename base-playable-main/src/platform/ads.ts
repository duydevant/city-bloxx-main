import { sdk, inPlayablesEnv, type SdkError } from "./ytgame.js";
import { logError, logWarning } from "./health.js";
import type { AdResult, RewardedResult } from "./types.js";

/**
 * Quang cao.
 *
 *  - Interstitial: giai phong man hinh (vd truoc khi restart). YouTube khuyen
 *    khong hien qua thuong nen o day co cooldown. Quang cao co the KHONG co
 *    san (loi API_UNAVAILABLE) -> game phai tiep tuc binh thuong, khong duoc
 *    chan nguoi choi.
 *  - Rewarded: `requestRewardedAd(rewardId)` chi resolve `true` khi nguoi xem
 *    xem HET quang cao. Chi tra thuong khi ket qua la true.
 *    rewardId phai duoc dang ky tren Developer Portal cho game cua ban.
 */

const INTERSTITIAL_COOLDOWN_MS = 60_000;
let lastInterstitialAt = 0;

export function canShowInterstitial(): boolean {
  if (!inPlayablesEnv()) return false;
  return Date.now() - lastInterstitialAt >= INTERSTITIAL_COOLDOWN_MS;
}

export function markInterstitialShown(): void {
  lastInterstitialAt = Date.now();
}

export async function showInterstitial(): Promise<AdResult> {
  if (!inPlayablesEnv()) {
    return { ok: false, reason: "not_in_playables" };
  }
  try {
    await sdk()!.ads.requestInterstitialAd();
    markInterstitialShown();
    return { ok: true };
  } catch (e) {
    const err = e as SdkError;
    const reason = err?.errorType ?? err?.message ?? "UNKNOWN";
    // Ad khong co san la chuyen binh thuong — chi canh bao, khong phai loi.
    logWarning(`interstitial unavailable: ${reason}`);
    return { ok: false, reason, errorType: err?.errorType };
  }
}

/**
 * Hien interstitial neu cooldown da het, roi luon luon chay `then`.
 * Day la cach an toan nhat: quang cao khong bao gio chan duoc game.
 */
export async function interstitialThen(then: () => void): Promise<void> {
  if (canShowInterstitial()) {
    const r = await showInterstitial();
    if (!r.ok && r.reason !== "not_in_playables") {
      logWarning(`interstitial skipped: ${r.reason}`);
    }
  }
  then();
}

export async function showRewarded(rewardId: string): Promise<RewardedResult> {
  if (!inPlayablesEnv()) {
    return { ok: false, rewarded: false, reason: "not_in_playables" };
  }
  if (!rewardId || typeof rewardId !== "string") {
    logError("showRewarded called without a rewardId");
    return { ok: false, rewarded: false, reason: "INVALID_PARAMS" };
  }
  try {
    const granted = await sdk()!.ads.requestRewardedAd(rewardId);
    if (granted === true) return { ok: true, rewarded: true };
    return { ok: false, rewarded: false, reason: "dismissed" };
  } catch (e) {
    const err = e as SdkError;
    const reason = err?.errorType ?? err?.message ?? "UNKNOWN";
    logWarning(`rewarded unavailable: ${reason}`);
    return { ok: false, rewarded: false, reason, errorType: err?.errorType };
  }
}
