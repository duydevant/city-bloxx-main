import { isAudioEnabled, onAudioEnabled } from "./audio.js";
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
onAudioEnabled((enabled) => {
  if (!enabled) suspend();
});

const STEM_FREQUENCIES = [110, 164.81, 220, 329.63] as const;
const STEM_MAX_GAINS = [0.018, 0.014, 0.012, 0.01] as const;
const FADE_SECONDS = 0.15;

let stemsInit = false;
let activeLayers = 1;
const stemOscs: OscillatorNode[] = [];
const stemGains: GainNode[] = [];

function computeLayers(combo: number): number {
  if (combo >= 10) return 4;
  if (combo >= 6) return 3;
  if (combo >= 3) return 2;
  return 1;
}

function ensureStems(c: AudioContext): void {
  if (stemsInit) return;
  stemsInit = true;
  const now = c.currentTime;
  for (let i = 0; i < STEM_FREQUENCIES.length; i++) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = i === 0 ? "sine" : "triangle";
    osc.frequency.setValueAtTime(STEM_FREQUENCIES[i], now);
    gain.gain.setValueAtTime(i < activeLayers && isAudioEnabled() ? STEM_MAX_GAINS[i] : 0, now);
    osc.connect(gain).connect(c.destination);
    osc.start(now);
    stemOscs.push(osc);
    stemGains.push(gain);
  }
}

function applyStemGains(layers: number): void {
  if (!ctx || !stemsInit) return;
  try {
    const now = ctx.currentTime;
    const enabled = isAudioEnabled();
    for (let i = 0; i < stemGains.length; i++) {
      const target = enabled && i < layers ? STEM_MAX_GAINS[i] : 0;
      const g = stemGains[i].gain;
      g.cancelScheduledValues?.(now);
      g.setValueAtTime(g.value ?? 0, now);
      g.linearRampToValueAtTime(target, now + FADE_SECONDS);
    }
  } catch {
    /* ignore */
  }
}

export function setCombo(combo: number): void {
  const nextLayers = computeLayers(Math.max(0, Math.floor(Number.isFinite(combo) ? combo : 0)));
  if (nextLayers === activeLayers) return;
  activeLayers = nextLayers;
  applyStemGains(activeLayers);
}

export function playBeep(name: BeepName): void {
  if (!isAudioEnabled()) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume().catch(() => {});
  ensureStems(c);

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
  applyStemGains(0);
  if (ctx && ctx.state === "running") void ctx.suspend().catch(() => {});
}
export function resume(): void {
  if (ctx && ctx.state === "suspended" && isAudioEnabled()) {
    void ctx.resume().catch(() => {});
    applyStemGains(activeLayers);
  }
}
export function dispose(): void {
  for (const osc of stemOscs) {
    try { osc.stop(); osc.disconnect(); } catch { /* ignore */ }
  }
  for (const g of stemGains) {
    try { g.disconnect(); } catch { /* ignore */ }
  }
  stemOscs.length = 0;
  stemGains.length = 0;
  stemsInit = false;
  activeLayers = 1;
  const c = ctx;
  ctx = null;
  unlocked = false;
  if (c && c.state !== "closed") {
    void c.close().catch(() => {});
  }
}

