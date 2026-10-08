import type { GameSave } from "./save";
export interface SavePort { load(): Promise<GameSave>; save(value: GameSave): Promise<boolean> }
export interface ScorePort { submitStandardQuick(population: number): Promise<void> }
export interface LifecyclePort { isPaused(): boolean; onPause(cb: () => void): () => void; onResume(cb: () => void): () => void }
export interface AudioPort { play(quality: string): void; suspend(): void; dispose(): void }
export interface ClockPort { seed(): number }
export interface AssetPort { baseUrl: string }
export interface AnalyticsPort { event(name: string, data?: Record<string, number | string>): void }
export interface Capabilities { platform: "web" | "playable"; externalServices: boolean; standardScore: boolean }
export interface TrackingPort { installationId(): string; now(): number }
