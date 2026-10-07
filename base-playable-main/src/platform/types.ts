import type { SdkErrorType } from "./ytgame.js";
import type { AppConfig } from "./config.js";

export type AdResult =
  | { ok: true }
  | { ok: false; reason: string; errorType?: SdkErrorType };

export type RewardedResult =
  | { ok: true; rewarded: true }
  | { ok: false; rewarded: false; reason: string; errorType?: SdkErrorType };

export interface ViewportSize {
  width: number;
  height: number;
  dpr: number;
  orientation: "portrait" | "landscape";
}

/**
 * Moi thu game duoc phep dung. Game KHONG import truc tiep tu
 * `src/platform/*` ma chi nhan object nay qua `create(host)`.
 */
export interface PlayableHost {
  // ---- DOM ----
  /** Phan tu goc cua game (#app). */
  root: HTMLElement;
  /** Vung an toan da tinh safe-area, day la noi game ve. */
  stage: HTMLElement;

  // ---- Vong doi (Test Suite MUST) ----
  /** Goi ngay khi frame dau tien da ve xong. */
  firstFrameReady(): void;
  /** Goi khi game da choi duoc. PHAI goi sau firstFrameReady va sau khi an man loading. */
  gameReady(): void;
  isReady(): boolean;

  // ---- Luu tru ----
  /** Doc save; tra ve fallback neu chua co hoac du lieu hong. */
  load<T>(fallback: T): Promise<T>;
  /** Ghi save. Tu dong validate well-formed + gioi han 3 MiB. */
  save<T>(data: T): Promise<boolean>;
  /**
   * Ghi save co debounce — dung trong vong lap game (moi lan di chuyen / ghi diem).
   * Base tu dong flush khi YouTube bao pause hoac khi trang bi an.
   */
  saveLater<T>(data: T, delayMs?: number): void;
  /** Xoa save (ca cloud save lan localStorage). */
  clearSave(): Promise<void>;

  // ---- Diem so / leaderboard ----
  /** Gui diem, co debounce. Chi gui so nguyen >= 0 va lon hon lan gui truoc. */
  sendScore(value: number): Promise<void>;
  /** Gui ngay lap tuc (game over / pause). */
  flushScore(value: number): Promise<void>;
  getLastSentScore(): number;

  // ---- Quang cao ----
  showInterstitial(): Promise<AdResult>;
  showRewarded(rewardId: string): Promise<RewardedResult>;
  canShowInterstitial(): boolean;
  /**
   * Hien interstitial neu duoc phep (cooldown 60s), roi LUON LUON chay `then`.
   * Dung cho nut "Play again": quang cao khong bao gio chan duoc game.
   */
  interstitialThen(then: () => void): Promise<void>;

  // ---- Am thanh ----
  isAudioEnabled(): boolean;
  onAudioEnabled(cb: (enabled: boolean) => void): () => void;
  /**
   * Phat mot am thanh don gian sinh boi WebAudio (khong can file asset).
   * Tu dong tat khi YouTube bao nguoi dung tat tieng.
   */
  beep(name: BeepName): void;

  // ---- Da ngon ngu ----
  /** Locale hien tai (BCP-47 do SDK tra ve, vd "en-US", "vi-VN"). */
  locale: string;
  /** Lay chuoi da dich, ho tro bien `{name}`. */
  t(key: string, vars?: Record<string, string | number>): string;

  // ---- He thong ----
  /** Youtube tam dung game -> luu lai va dung vong lap. */
  onPause(cb: () => void): () => void;
  onResume(cb: () => void): () => void;
  isPaused(): boolean;
  onResize(cb: (size: ViewportSize) => void): () => void;
  getViewport(): ViewportSize;

  // ---- UI co san ----
  /** An man hinh loading (main.ts tu an, game co the goi som hon). */
  hideLoading(): void;
  loading(): LoadingApi;
  overlay(): OverlayApi;
  toast(msg: string, ms?: number): void;

  // ---- Chan doan ----
  logError(context: string, error?: unknown): void;
  logWarning(context: string): void;

  // ---- Moi truong ----
  /** true khi dang chay that trong YouTube Playables. */
  inPlayables: boolean;
  config: AppConfig;
}

export type BeepName =
  | "tap"
  | "merge"
  | "win"
  | "lose"
  | "reward"
  | "error";

export interface LoadingApi {
  show(): void;
  hide(): void;
  /** 0..1 — hien thi tien do neu ban muoc. */
  progress(value: number): void;
  isVisible(): boolean;
}

export interface OverlayButton {
  label: string;
  /** "primary" | "secondary" | "ad" */
  variant?: "primary" | "secondary" | "ad";
  onClick: () => void;
  /** true -> nut bi disable khi bam de tranh double-tap luc cho quang cao. */
  disableOnClick?: boolean;
}

export interface OverlayApi {
  show(opts: {
    title?: string;
    body?: string;
    buttons: OverlayButton[];
  }): void;
  hide(): void;
  isVisible(): boolean;
}

/**
 * Hop dong ma mot game phai thoa man.
 * `src/game/index.ts` export `export const game: PlayableGame = {...}`
 * va main.ts se tu dong nap no — do la diem duy nhat game va base noi nhau.
 */
export interface PlayableGame {
  /**
   * Dung game. Co the la async (nap asset truoc).
   * main.ts se cho ham nay xong roi moi an loading + goi firstFrameReady/gameReady.
   */
  create(host: PlayableHost): void | Promise<void>;
  /**
   * false -> game tu goi host.gameReady() (vd khi co animation intro).
   * Mac dinh true: main.ts tu goi ngay sau khi create() xong.
   */
  autoReady?: boolean;
}
