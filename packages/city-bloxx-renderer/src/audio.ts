import type { AdaptiveAudioDiagnostics, AudioPort } from "../../city-bloxx-core/src/index";

const STEM_FREQUENCIES = [110, 164.81, 220, 329.63] as const; // Base loop + 3 combo stems (A2, E3, A3, E4)
const STEM_MAX_GAINS = [0.018, 0.014, 0.012, 0.01] as const;
const FADE_SECONDS = 0.15; // 150ms fade

export function computeActiveLayers(combo: number): number {
  if (combo >= 10) return 4;
  if (combo >= 6) return 3;
  if (combo >= 3) return 2;
  return 1;
}

export function createTowerAudio(): AudioPort {
  let context: AudioContext | null = null;
  let disposed = false;
  let suspended = false;
  let currentCombo = 0;
  let activeLayers = 1;
  let stemOscillatorsCreated = 0;
  let layerTransitions = 0;
  let stemsInitialized = false;
  const stemOscillators: OscillatorNode[] = [];
  const stemGains: GainNode[] = [];
  const targetGains: [number, number, number, number] = [STEM_MAX_GAINS[0], 0, 0, 0];

  function ensureStems(ctx: AudioContext): void {
    if (stemsInitialized || disposed) return;
    stemsInitialized = true;
    const now = ctx.currentTime;
    for (let i = 0; i < STEM_FREQUENCIES.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.setValueAtTime(STEM_FREQUENCIES[i], now);
      const initialGain = i < activeLayers && !suspended ? STEM_MAX_GAINS[i] : 0;
      targetGains[i] = initialGain;
      gain.gain.setValueAtTime(initialGain, now);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      stemOscillators.push(osc);
      stemGains.push(gain);
      stemOscillatorsCreated++;
    }
  }

  function applyLayerGains(nextActiveLayers: number): void {
    for (let i = 0; i < 4; i++) {
      targetGains[i] = !suspended && !disposed && i < nextActiveLayers ? STEM_MAX_GAINS[i] : 0;
    }
    if (!context || !stemsInitialized || disposed) return;
    try {
      const now = context.currentTime;
      for (let i = 0; i < stemGains.length; i++) {
        const g = stemGains[i].gain;
        g.cancelScheduledValues?.(now);
        g.setValueAtTime(g.value ?? 0, now);
        g.linearRampToValueAtTime(targetGains[i], now + FADE_SECONDS);
      }
    } catch {
      /* optional WebAudio ramp */
    }
  }

  return {
    play(quality) {
      if (disposed) return;
      suspended = false;
      try {
        context ??= new AudioContext();
        void context.resume().catch(() => {});
        ensureStems(context);
        const osc = context.createOscillator();
        const gain = context.createGain();
        const time = context.currentTime;
        osc.type = "triangle";
        osc.frequency.setValueAtTime(quality === "miss" ? 180 : quality === "perfect" ? 880 : 520, time);
        osc.frequency.exponentialRampToValueAtTime(quality === "miss" ? 80 : 1040, time + 0.12);
        gain.gain.setValueAtTime(0.08, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
        osc.connect(gain).connect(context.destination);
        osc.start();
        osc.stop(time + 0.16);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
      } catch {
        /* sound is optional */
      }
    },
    setCombo(combo: number) {
      if (disposed) return;
      const normalized = Math.max(0, Math.floor(Number.isFinite(combo) ? combo : 0));
      currentCombo = normalized;
      const nextLayers = computeActiveLayers(normalized);
      if (nextLayers === activeLayers) return;
      activeLayers = nextLayers;
      layerTransitions++;
      applyLayerGains(activeLayers);
    },
    getAudioDiagnostics(): AdaptiveAudioDiagnostics {
      return {
        initialized: stemsInitialized,
        suspended,
        disposed,
        currentCombo,
        activeLayers: suspended || disposed ? 0 : activeLayers,
        fadeDurationMs: 150,
        stemOscillatorsCreated,
        layerTransitions,
        externalAudioBytes: 0,
        layerGains: [...targetGains] as [number, number, number, number],
      };
    },
    suspend() {
      suspended = true;
      applyLayerGains(0);
      if (context) void context.suspend().catch(() => {});
    },
    dispose() {
      disposed = true;
      suspended = true;
      for (let i = 0; i < 4; i++) targetGains[i] = 0;
      for (const osc of stemOscillators) {
        try {
          osc.stop();
          osc.disconnect();
        } catch {
          /* ignore */
        }
      }
      for (const gain of stemGains) {
        try {
          gain.disconnect();
        } catch {
          /* ignore */
        }
      }
      stemOscillators.length = 0;
      stemGains.length = 0;
      if (context) void context.close().catch(() => {});
      context = null;
    },
  };
}
