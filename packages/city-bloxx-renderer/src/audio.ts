import type { AudioPort } from "../../city-bloxx-core/src/index";
export function createTowerAudio(): AudioPort {
  let context: AudioContext | null = null;
  let disposed = false;
  return {
    play(quality) {
      if (disposed) return;
      try {
        context ??= new AudioContext();
        void context.resume().catch(() => {});
        const osc = context.createOscillator(); const gain = context.createGain();
        const time = context.currentTime;
        osc.type = "triangle"; osc.frequency.setValueAtTime(quality === "miss" ? 180 : quality === "perfect" ? 880 : 520, time);
        osc.frequency.exponentialRampToValueAtTime(quality === "miss" ? 80 : 1040, time + .12);
        gain.gain.setValueAtTime(.08, time); gain.gain.exponentialRampToValueAtTime(.001, time + .15);
        osc.connect(gain).connect(context.destination); osc.start(); osc.stop(time + .16);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      } catch { /* sound is optional */ }
    },
    suspend() { if (context) void context.suspend().catch(() => {}); },
    dispose() { disposed = true; if (context) void context.close().catch(() => {}); context = null; },
  };
}
