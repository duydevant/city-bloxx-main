/**
 * Toan bo dinh nghia type cua YouTube Playables SDK.
 *
 * Script SDK (https://www.youtube.com/game_api/v1) phai la script dau tien
 * trong <head> cua index.html. Khi game chay ngoai YouTube (dev/preview),
 * SDK khong ton tai -> ensureMock() se dung mot mock khong co tac dung phu,
 * giup game van chay duoc ma khong pha vo luat "khong duoc override window.ytgame".
 */

export type SdkErrorType =
  | "API_UNAVAILABLE"
  | "INVALID_PARAMS"
  | "SIZE_LIMIT_EXCEEDED"
  | "UNKNOWN";

export interface SdkError extends Error {
  errorType?: SdkErrorType;
}

export interface YtGameSdk {
  /** true khi game dang chay ben trong YouTube Playables. */
  IN_PLAYABLES_ENV?: () => boolean;
  game: {
    firstFrameReady: () => void;
    gameReady: () => void;
    loadData: () => Promise<string | undefined>;
    saveData: (data: string) => Promise<void>;
    onInterstateChange?: (cb: (state: unknown) => void) => void;
  };
  system: {
    isAudioEnabled: () => boolean;
    onAudioEnabledChange: (cb: (isEnabled: boolean) => void) => void;
    onPause: (cb: () => void) => void;
    onResume: (cb: () => void) => void;
    getLanguage: () => Promise<string>;
  };
  engagement: {
    sendScore: (score: { value: number; formattedValue?: string }) => Promise<void>;
  };
  ads: {
    requestInterstitialAd: () => Promise<void>;
    requestRewardedAd: (rewardId: string) => Promise<boolean>;
  };
  health: {
    logWarning: (context: string) => Promise<void>;
    logError: (context: string, error?: Error) => Promise<void>;
  };
}

declare global {
  interface Window {
    ytgame?: YtGameSdk;
  }
}

const MOCK_SAVE_KEY = "__playable_mock_save";

/** SDK that, chi co khi index.html load duoc https://www.youtube.com/game_api/v1 */
export function sdk(): YtGameSdk | undefined {
  return typeof window === "undefined" ? undefined : window.ytgame;
}

/**
 * Game co dang chay trong Playables khong.
 * Dung ham nay thay vi tu kiem tra navigator/userAgent — YouTube khong ho tro cach khac.
 */
export function inPlayablesEnv(): boolean {
  const y = sdk();
  if (!y) return false;
  if (typeof y.IN_PLAYABLES_ENV === "function") {
    try {
      return y.IN_PLAYABLES_ENV() === true;
    } catch {
      /* fall through */
    }
  }
  return typeof y.game?.firstFrameReady === "function";
}

/**
 * Cai mock khi SDK vang mat (dev/preview/localhost).
 * KHONG BAO GIO override window.ytgame khi no da ton tai.
 */
export function ensureMock(): void {
  if (typeof window === "undefined") return;
  if (window.ytgame) return;

  const store: Record<string, string> = {};
  let audioEnabled = true;
  const audioListeners: Array<(v: boolean) => void> = [];
  const pauseListeners: Array<() => void> = [];
  const resumeListeners: Array<() => void> = [];

  const unavailable = (api: string): SdkError => {
    const e = new Error(`${api} is not available outside YouTube Playables`) as SdkError;
    e.errorType = "API_UNAVAILABLE";
    return e;
  };

  window.ytgame = {
    IN_PLAYABLES_ENV: () => false,
    game: {
      firstFrameReady: () => console.debug("[mock] firstFrameReady"),
      gameReady: () => console.debug("[mock] gameReady"),
      loadData: async () =>
        window.localStorage?.getItem(MOCK_SAVE_KEY) ?? store[MOCK_SAVE_KEY],
      saveData: async (data) => {
        store[MOCK_SAVE_KEY] = data;
        try {
          window.localStorage?.setItem(MOCK_SAVE_KEY, data);
        } catch {
          /* private mode */
        }
      },
    },
    system: {
      isAudioEnabled: () => audioEnabled,
      onAudioEnabledChange: (cb) => {
        audioListeners.push(cb);
      },
      onPause: (cb) => {
        pauseListeners.push(cb);
      },
      onResume: (cb) => {
        resumeListeners.push(cb);
      },
      getLanguage: async () =>
        (typeof navigator !== "undefined" && navigator.language) || "en-US",
    },
    engagement: {
      sendScore: async (s) => {
        console.debug("[mock] sendScore", s);
      },
    },
    ads: {
      requestInterstitialAd: async () => {
        throw unavailable("ads.requestInterstitialAd");
      },
      requestRewardedAd: async () => {
        throw unavailable("ads.requestRewardedAd");
      },
    },
    health: {
      logWarning: async (c) => console.debug("[mock] logWarning", c),
      logError: async (c, e) => console.debug("[mock] logError", c, e),
    },
  };

  // Tien ich chi dung cho dev: bam phim de gia lap pause/resume/tat tieng.
  // Khong anh huong gi den build production.
  if (typeof window !== "undefined") {
    const w = window as unknown as { __playableMock?: Record<string, () => void> };
    w.__playableMock = {
      pause: () => pauseListeners.forEach((f) => f()),
      resume: () => resumeListeners.forEach((f) => f()),
      mute: () => {
        audioEnabled = false;
        audioListeners.forEach((f) => f(false));
      },
      unmute: () => {
        audioEnabled = true;
        audioListeners.forEach((f) => f(true));
      },
    };
  }
}
