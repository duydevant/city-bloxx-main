/**
 * Config doc tu bien moi truong luc build (VITE_*).
 * Doi gia tri trong .env — khong sua file nay.
 */

const str = (v: unknown, fallback: string): string =>
  typeof v === "string" && v.length > 0 ? v : fallback;

const num = (v: unknown, fallback: number): number => {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
};

export interface AppConfig {
  /** Ten game, dung cho title/toast debug. */
  gameName: string;
  /** Key luu tru (localStorage khi chay ngoai YouTube). */
  saveKey: string;
  /** Phien ban cua payload save; tang len khi doi cau truc du lieu. */
  saveVersion: number;
  /** rewardId mac dinh cho quang cao thuong. */
  rewardIds: { extraTime: string };
  /** Gioi han cloud save cua YouTube: 3 MiB tinh theo UTF-16. */
  saveMaxBytes: number;
  /** Co phai dang chay trong Playables khong (chi xac dinh sau khi mock da cai). */
  isDev: boolean;
}

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export const config: AppConfig = {
  gameName: str(env.VITE_GAME_NAME, "Playable"),
  saveKey: str(env.VITE_SAVE_KEY, "playable_save_v1"),
  saveVersion: num(env.VITE_SAVE_VERSION, 1),
  rewardIds: {
    extraTime: str(env.VITE_REWARD_EXTRA_TIME, "extra_time"),
  },
  saveMaxBytes: 3 * 1024 * 1024,
  isDev: env.DEV === "true" || env.MODE === "development",
};
