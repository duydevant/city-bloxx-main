import { isAudioEnabled } from "./audio.js";
import type { BeepName } from "./types.js";

/**
 * SFX sinh boi WebAudio — khong can file am thanh nao trong bundle
 * (giu initial bundle nho hon 30 MiB de dang qua MUST-check).
 *
 * Moi tieng deu bi chan khi YouTube bao nguoi dung da tat tieng.
 *
 * Muon dung file am thanh that? Dat trong `public/sfx/`, nap qua
 * `new Audio("./sfx/x.mp3")` (duong dan tuong doi!) va van goi `unlock()`
 * trong su kien nguoi dung dau tien.
 */

type BeepDef = {
  freq: number;
  end?: number;
  dur: number;
  type: OscillatorType;
  gain: number;
  delay?: number;
};

const BEEPS: Record<BeepName, BeepDef[]> = {
  tap: [{ freq: 520, end: 660, dur: 0.07, type: "triangle", gain: 0.14 }],
  merge: [
    { freq: 620, end: 880, dur: 0.09, type: "sine", gain: 0.16 },
    { freq: 880, end: 1180, dur: 0.09, type: "sine", gain: 0.1, delay: 0.07 },
  ],
  win: [
    { freq: 660, dur: 0.12, type: "square", gain: 0.1 },
    { freq: 880, dur: 0.12, type: "square", gain: 0.1, delay: 0.12 },
    { freq: 1320, dur: 0.2, type: "square", gain: 0.1, delay: 0.24 },
  ],
  lose: [
    { freq: 400, end: 200, dur: 0.22, type: "sawtooth", gain: 0.12 },
    { freq: 200, end: 90, dur: 0.3, type: "sawtooth", gain: 0.1, delay: 0.18 },
  ],
  reward: [
    { freq: 780, dur: 0.1, type: "sine", gain: 0.14 },
    { freq: 1040, dur: 0.16, type: "sine", gain: 0.14, delay: 0.1 },
  ],
  error: [{ freq: 180, end: 120, dur: 0.16, type: "square", gain: 0.1 }],
};

type Ctor = new () => AudioContext;
let ctx: AudioContext | null = null;
let unlocked = false;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  const W = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  const AC = W.AudioContext ?? W.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

/**
 * Mo AudioContext. Browser chan am thanh cho toi khi co tuong tac that,
 * nen goi ham nay trong listener click/pointerdown/touchstart dau tien.
 * main.ts tu dong gan; game khong can quan tam.
 */
export function unlock(): void {
  if (unlocked) return;
  const c = getCtx();
  if (!c) return;
  unlocked = true;
  if (c.state === "suspended") void c.resume().catch(() => {});
}

function autoUnlock(): void {
  if (unlocked || typeof window === "undefined") return;
  const evts = ["pointerdown", "touchstart", "keydown"] as const;
  const handler = (): void => {
    unlock();
    evts.forEach((e) => window.removeEventListener(e, handler, true));
  };
  evts.forEach((e) => window.addEventListener(e, handler, { capture: true, passive: true }));
}

autoUnlock();

export function playBeep(name: BeepName): void {
  if (!isAudioEnabled()) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume().catch(() => {});

  const defs = BEEPS[name];
  if (!defs) return;
  const t0 = c.currentTime + 0.001;

  for (const d of defs) {
    const start = t0 + (d.delay ?? 0);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = d.type;
    osc.frequency.setValueAtTime(d.freq, start);
    if (d.end && d.end !== d.freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, d.end), start + d.dur);
    }
    // envelope ngan de khong bi "click"
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(d.gain, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + d.dur);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + d.dur + 0.02);
  }
}

/** Tat ngay moi am thanh (dung khi bi pause). */
export function suspend(): void {
  if (ctx && ctx.state === "running") void ctx.suspend().catch(() => {});
}
export function resume(): void {
  if (ctx && ctx.state === "suspended" && isAudioEnabled()) void ctx.resume().catch(() => {});
}
