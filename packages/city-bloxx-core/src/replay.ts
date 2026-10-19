import { ASSIST_RULESET_VERSION, PHYSICS_VERSION, QUICK_TOWER_RULES as R, RULESET_VERSION } from "./rules";
import { QuickTowerGame, type PlacementQuality, type QuickTowerSnapshot, type RunRecord } from "./run";

export const MAX_REPLAY_INPUTS = 4096;
export const MAX_REPLAY_TICKS = 60 * 60 * 60 * 2;
export const REPLAY_SPEEDS = [0.5, 1, 2, 4] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];
export const MAX_VIEWER_CACHE_ENTRIES = 16;
export const MAX_VIEWER_CACHE_BYTES = 16 * 1024 * 1024;

export interface ReplayDropMarker {
  sequence: number;
  releaseTick: number;
  releaseX: number;
  releaseY: number;
  landingTick: number;
  landingX: number;
  landingY: number;
  quality: PlacementQuality;
  signedError: number;
  isFoundation: boolean;
  isRoof: boolean;
}

export interface ReplayCacheStats {
  count: number;
  maxEntries: number;
  bytes: number;
  maxBytes: number;
}

interface ViewerCheckpoint {
  tick: number;
  inputIndex: number;
  game: QuickTowerGame;
  bytes: number;
}

export function validateRecord(value: unknown): RunRecord {
  if (!value || typeof value !== "object") throw new Error("Invalid replay");
  const r = value as RunRecord;
  if (
    r.schema !== 1 ||
    r.physicsVersion !== PHYSICS_VERSION ||
    !r.config ||
    !["quick", "daily", "one-drop", "perfect-rush", "skyline-sprint"].includes(r.config.mode) ||
    !Number.isInteger(r.config.seed) ||
    typeof r.config.assist !== "boolean" ||
    r.rulesetVersion !==
      (r.config.mode === "one-drop"
        ? r.config.oneDrop?.rulesetVersion
        : r.config.mode === "daily"
          ? r.config.daily?.rulesetVersion
          : r.config.mode === "perfect-rush"
            ? r.config.perfectRush?.rulesetVersion
            : r.config.mode === "skyline-sprint"
              ? r.config.skylineSprint?.rulesetVersion
              : r.config.assist
                ? ASSIST_RULESET_VERSION
                : RULESET_VERSION) ||
    !Number.isInteger(r.endTick) ||
    r.endTick < 1 ||
    r.endTick > MAX_REPLAY_TICKS ||
    !Array.isArray(r.inputs) ||
    (r.config.mode === "one-drop"
      ? r.inputs.length !== 1
      : r.config.mode === "perfect-rush"
        ? r.inputs.length < 1 || r.inputs.length > MAX_REPLAY_INPUTS
        : r.inputs.length < 3 || r.inputs.length > MAX_REPLAY_INPUTS) ||
    !r.result
  ) {
    throw new Error("Unsupported replay version or bounds");
  }
  const game = new QuickTowerGame(r.config);
  if (r.config.mode === "daily") {
    const result = r.result;
    if (
      r.inputs.length < 4 ||
      r.inputs.length > 23 ||
      ![result.height, result.population, result.perfectCount, result.bestStreak, result.misses].every(
        n => Number.isSafeInteger(n) && n >= 0,
      ) ||
      result.height < 1 ||
      result.height > game.getSnapshot().targetFloors ||
      result.ranked !== false ||
      result.misses > 3 ||
      result.durationTicks !== r.endTick ||
      !Number.isFinite(result.accuracy) ||
      result.accuracy < 0 ||
      result.accuracy > 100 ||
      result.ratingVersion !== "city-rating-1" ||
      !["S", "A", "B", "C", "D"].includes(result.rating) ||
      (result.height < 20
        ? result.misses !== 3 || r.inputs.length !== result.height + 3
        : ![result.height + result.misses, result.height + result.misses + 1].includes(r.inputs.length))
    ) {
      throw new Error("Invalid Daily replay bounds");
    }
  } else if (r.config.mode === "one-drop") {
    const result = r.result;
    if (
      r.inputs.length !== 1 ||
      ![result.height, result.population, result.perfectCount, result.bestStreak, result.misses].every(
        n => Number.isSafeInteger(n) && n >= 0,
      ) ||
      result.height > 1 ||
      result.misses > 1 ||
      result.height + result.misses !== 1 ||
      result.ranked !== false ||
      result.durationTicks !== r.endTick ||
      !Number.isFinite(result.accuracy) ||
      result.accuracy < 0 ||
      result.accuracy > 100 ||
      result.ratingVersion !== "city-rating-1" ||
      !["S", "A", "B", "C", "D"].includes(result.rating)
    ) {
      throw new Error("Invalid One Drop replay bounds");
    }
  } else if (r.config.mode === "perfect-rush") {
    const result = r.result;
    if (
      r.endTick > 3780 ||
      r.inputs.some(inp => inp.tick >= 3600) ||
      ![result.height, result.population, result.perfectCount, result.bestStreak, result.misses].every(
        n => Number.isSafeInteger(n) && n >= 0,
      ) ||
      result.ranked !== false ||
      result.misses > 3 ||
      result.durationTicks !== r.endTick ||
      !Number.isFinite(result.accuracy) ||
      result.accuracy < 0 ||
      result.accuracy > 100 ||
      result.ratingVersion !== "city-rating-1" ||
      !["S", "A", "B", "C", "D"].includes(result.rating)
    ) {
      throw new Error("Invalid Perfect Rush replay bounds");
    }
  } else if (r.config.mode === "skyline-sprint") {
    const result = r.result;
    if (
      r.inputs.length < 3 ||
      r.inputs.length > 23 ||
      ![result.height, result.population, result.perfectCount, result.bestStreak, result.misses].every(
        n => Number.isSafeInteger(n) && n >= 0,
      ) ||
      result.height < 1 ||
      result.height > 20 ||
      result.ranked !== false ||
      result.misses > 3 ||
      result.durationTicks !== r.endTick ||
      result.sprintScoreTicks !== result.durationTicks + result.misses * 300 ||
      !Number.isFinite(result.accuracy) ||
      result.accuracy < 0 ||
      result.accuracy > 100 ||
      result.ratingVersion !== "city-rating-1" ||
      !["S", "A", "B", "C", "D"].includes(result.rating)
    ) {
      throw new Error("Invalid Skyline Sprint replay bounds");
    }
  }
  let previous = -1;
  r.inputs.forEach((input, index) => {
    if (
      !input ||
      !Number.isInteger(input.tick) ||
      input.tick <= previous ||
      input.tick >= r.endTick ||
      input.sequence !== index ||
      !Number.isInteger(input.fraction) ||
      input.fraction < 0 ||
      input.fraction > 1000
    ) {
      throw new Error("Invalid replay inputs");
    }
    previous = input.tick;
  });
  return JSON.parse(JSON.stringify(r)) as RunRecord;
}

export class QuickTowerReplay {
  private run: QuickTowerGame;
  private inputIndex = 0;
  private accumulator = 0;
  private paused = false;
  private speed: ReplaySpeed = 1;
  private markers: ReplayDropMarker[] | null = null;
  private readonly cache: ViewerCheckpoint[] = [];
  private cacheBytes = 0;
  readonly record: RunRecord;

  constructor(record: RunRecord) {
    this.record = validateRecord(record);
    this.run = new QuickTowerGame(this.record.config);
  }

  restart(): void {
    this.run = new QuickTowerGame(this.record.config);
    this.inputIndex = 0;
    this.accumulator = 0;
    this.paused = false;
  }

  setPaused(value: boolean): void {
    this.paused = value;
  }

  isPaused(): boolean {
    return this.paused;
  }

  getSpeed(): ReplaySpeed {
    return this.speed;
  }

  setSpeed(value: ReplaySpeed): void {
    if (!REPLAY_SPEEDS.includes(value)) throw new Error("Unsupported replay speed");
    this.speed = value;
  }

  getTick(): number {
    return this.run.getTick();
  }

  getEndTick(): number {
    return this.record.endTick;
  }

  getSnapshot(): QuickTowerSnapshot {
    return this.run.getSnapshot();
  }

  getPhase() {
    return this.run.getPhase();
  }

  getInterpolationAlpha(): number {
    return this.accumulator;
  }

  getPreviousRenderSnapshot(snapshot?: QuickTowerSnapshot): QuickTowerSnapshot {
    return this.run.getPreviousRenderSnapshot(snapshot);
  }

  getResult() {
    return this.run.getResult();
  }

  getMetrics() {
    return this.run.getMetrics();
  }

  getCacheStats(): ReplayCacheStats {
    return {
      count: this.cache.length,
      maxEntries: MAX_VIEWER_CACHE_ENTRIES,
      bytes: this.cacheBytes,
      maxBytes: MAX_VIEWER_CACHE_BYTES,
    };
  }

  private ensurePrecomputed(): void {
    if (this.markers !== null) return;
    const sim = new QuickTowerGame(this.record.config);
    const markers: ReplayDropMarker[] = [];
    this.cache.length = 0;
    this.cacheBytes = 0;
    const interval = Math.max(1, Math.ceil(this.record.endTick / MAX_VIEWER_CACHE_ENTRIES));
    let idx = 0;
    let pending: {
      sequence: number;
      releaseTick: number;
      releaseX: number;
      releaseY: number;
      floorsBefore: number;
      errorsBefore: number;
      isFoundation: boolean;
      isRoof: boolean;
    } | null = null;

    const maybeCache = (tick: number, inputIdx: number) => {
      if (this.cache.length >= MAX_VIEWER_CACHE_ENTRIES) return;
      if (tick === 0 || (tick % interval === 0 && tick < this.record.endTick)) {
        const snapshotJson = JSON.stringify(sim.getSnapshot());
        const bytes = snapshotJson.length * 2;
        if (this.cacheBytes + bytes <= MAX_VIEWER_CACHE_BYTES) {
          this.cache.push({ tick, inputIndex: inputIdx, game: sim.clone(), bytes });
          this.cacheBytes += bytes;
        }
      }
    };

    for (let tick = 0; tick < this.record.endTick; tick++) {
      maybeCache(tick, idx);
      const input = this.record.inputs[idx];
      if (input?.tick === tick) {
        const beforeSnap = sim.getSnapshot();
        const beforeMetrics = sim.getMetrics();
        if (!sim.drop(input.fraction / 1000)) throw new Error("Replay input rejected");
        const afterDrop = sim.getSnapshot();
        pending = {
          sequence: input.sequence,
          releaseTick: tick,
          releaseX: afterDrop.released.x,
          releaseY: afterDrop.released.y,
          floorsBefore: beforeSnap.floors.length,
          errorsBefore: beforeMetrics.errorCount,
          isFoundation: this.record.config.mode !== "one-drop" && beforeSnap.floors.length === 0 && !this.record.config.legacyScoring,
          isRoof: beforeSnap.isRoof,
        };
        idx++;
      }
      sim.advanceTicks(1);
      if (pending) {
        const snap = sim.getSnapshot();
        if (snap.phase !== "falling") {
          const metrics = sim.getMetrics();
          let quality: PlacementQuality = snap.lastPlacement ?? "good";
          let signedError = 0;
          if (pending.isFoundation) {
            quality = "good";
            signedError = 0;
          } else if (pending.isRoof) {
            quality = metrics.roof ?? "miss";
            signedError = metrics.roofError ?? 0;
          } else if (metrics.signedErrors.length > 0 && metrics.errorCount > pending.errorsBefore) {
            signedError = metrics.signedErrors[metrics.signedErrors.length - 1] ?? 0;
          }
          const landingY = R.groundY - (pending.floorsBefore + 1) * R.floorHeight;
          markers.push({
            sequence: pending.sequence,
            releaseTick: pending.releaseTick,
            releaseX: pending.releaseX,
            releaseY: pending.releaseY,
            landingTick: sim.getTick(),
            landingX: snap.current.x,
            landingY,
            quality,
            signedError,
            isFoundation: pending.isFoundation,
            isRoof: pending.isRoof,
          });
          pending = null;
        }
      }
    }
    this.markers = markers;
  }

  getDropMarkers(): readonly ReplayDropMarker[] {
    this.ensurePrecomputed();
    return this.markers!.map(m => ({ ...m }));
  }

  private stepTicksInternal(count: number): void {
    for (let i = 0; i < count; i++) {
      const tick = this.run.getTick();
      if (tick >= this.record.endTick) return;
      const input = this.record.inputs[this.inputIndex];
      if (input?.tick === tick) {
        if (!this.run.drop(input.fraction / 1000)) throw new Error("Replay input rejected");
        this.inputIndex++;
      }
      this.run.advanceTicks(1);
      if (this.run.getPhase() === "ended" && this.run.getTick() !== this.record.endTick) {
        throw new Error("Replay end tick mismatch");
      }
    }
  }

  seekToTick(targetTick: number): QuickTowerSnapshot {
    if (!Number.isInteger(targetTick) || targetTick < 0 || targetTick > this.record.endTick) {
      throw new Error("Replay seek tick out of bounds");
    }
    this.ensurePrecomputed();
    let bestCheckpoint: ViewerCheckpoint | null = null;
    for (const cp of this.cache) {
      if (cp.tick <= targetTick && (!bestCheckpoint || cp.tick > bestCheckpoint.tick)) {
        bestCheckpoint = cp;
      }
    }
    if (bestCheckpoint && (this.run.getTick() > targetTick || bestCheckpoint.tick > this.run.getTick())) {
      this.run = bestCheckpoint.game.clone();
      this.inputIndex = bestCheckpoint.inputIndex;
    } else if (this.run.getTick() > targetTick) {
      this.run = new QuickTowerGame(this.record.config);
      this.inputIndex = 0;
    }
    this.accumulator = 0;
    const remaining = targetTick - this.run.getTick();
    if (remaining > 0) {
      this.stepTicksInternal(remaining);
    }
    return this.run.getSnapshot();
  }

  seekToDrop(sequence: number): QuickTowerSnapshot {
    this.ensurePrecomputed();
    const marker = this.markers!.find(m => m.sequence === sequence);
    if (!marker) throw new Error("Replay drop marker not found");
    return this.seekToTick(marker.landingTick);
  }

  seekToResult(): QuickTowerSnapshot {
    return this.seekToTick(this.record.endTick);
  }

  update(seconds: number): void {
    if (this.paused || !Number.isFinite(seconds)) return;
    this.accumulator += Math.max(0, Math.min(0.1, seconds)) * 60 * this.speed;
    while (this.accumulator >= 1 - 1e-9) {
      this.stepTicksInternal(1);
      this.accumulator = Math.max(0, this.accumulator - 1);
    }
  }

  advanceTicks(count: number): void {
    if (!Number.isInteger(count) || count < 0) throw new Error("Invalid replay tick count");
    if (this.paused) return;
    this.stepTicksInternal(count);
  }
}

export function verifyRecord(value: unknown): RunRecord {
  const record = validateRecord(value);
  const replay = new QuickTowerReplay(record);
  replay.advanceTicks(record.endTick);
  const computed = replay.getResult();
  if (
    replay.getSnapshot().phase !== "ended" ||
    Object.keys(computed).some(key => computed[key as keyof typeof computed] !== record.result[key as keyof typeof computed])
  ) {
    throw new Error("Replay result mismatch");
  }
  return record;
}

