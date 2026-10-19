import type { GameSave } from "./save";
import type { RunConfig, RunRecord } from "./run";
export interface RankedPort {
  start(mode: "quick" | "daily"): Promise<{id: string; config: RunConfig}>;
  bind(id: string, localId: string): Promise<void>;
  complete(id: string, record: RunRecord): Promise<void>;
  resume(localId: string, config: RunConfig): Promise<string | null>;
  abandon(localId: string): Promise<void>;
  recover(save: GameSave): Promise<void>;
}
export type ScoreSyncStatus = "idle" | "pending" | "synced" | "error";
export interface ScoreSyncState { status: ScoreSyncStatus; pendingScore: number; ackedScore: number; retryAttempt?: number }
export interface SavePort { load(): Promise<GameSave>; save(value: GameSave): Promise<boolean>; flush?(): Promise<void> }
export interface ScorePort { submitStandardQuick(population: number): Promise<void>; getState?(): ScoreSyncState; onStateChange?(cb: (state: ScoreSyncState) => void): () => void }
export interface LifecyclePort { isPaused(): boolean; onPause(cb: () => void): () => void; onResume(cb: () => void): () => void }
export interface AdaptiveAudioDiagnostics {
  initialized: boolean;
  suspended: boolean;
  disposed: boolean;
  currentCombo: number;
  activeLayers: number;
  fadeDurationMs: 150;
  stemOscillatorsCreated: number;
  layerTransitions: number;
  externalAudioBytes: 0;
  layerGains: readonly [number, number, number, number];
}
export interface AudioPort {
  play(quality: string): void;
  setCombo?(combo: number): void;
  getAudioDiagnostics?(): AdaptiveAudioDiagnostics;
  suspend(): void;
  dispose(): void;
}
export interface ClockPort { seed(): number }
export interface AssetPort { baseUrl: string }
export interface AnalyticsPort { event(name: string, data?: Record<string, number | string>): void }
export interface Capabilities { platform: "web" | "playable"; externalServices: boolean; standardScore: boolean; account?: "guest" | "scaffold" | "backend-ready" }
export interface TrackingPort { installationId(): string; now(): number }

