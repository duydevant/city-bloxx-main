import { ASSIST_RULESET_VERSION, CITY_RATING_VERSION, CITY_RULESET_VERSION, getQuickDifficulty, PHYSICS_VERSION, QUALITY_POPULATION_FACTORS, QUICK_RATING_RULES as Rating, QUICK_TOWER_RULES as R, RATING_VERSION, RULESET_VERSION, type QuickDifficulty } from "./rules";
import { BUILDINGS, isBuildingId, type BuildingId } from "./buildings";
import { sweepTower } from "./collision";
import { emptyMetrics, recordMetric, type RunMetrics } from "./metrics";
import { validateDaily, type DailyDefinition } from "./daily";

export type PlacementQuality = "perfect" | "great" | "good" | "risky" | "miss";
export type RunPhase = "preparing" | "swing" | "falling" | "settling" | "miss" | "ended";
export interface RunConfig { seed: number; mode: "quick" | "city" | "daily"; assist: boolean; building?: BuildingId; daily?: DailyDefinition; legacyPerfect?: boolean; legacyOverlap?: boolean; legacyScoring?: boolean; legacyMotion?: boolean; motionVersion?: 11 | 12 }
export interface DropInput { tick: number; sequence: number; fraction: number }
export type DropEvent = DropInput;
export interface PlacedFloor { x: number; quality: Exclude<PlacementQuality, "miss">; population: number; error: number }
export interface RunResult {
  population: number; height: number; accuracy: number; perfectCount: number;
  bestStreak: number; durationTicks: number; misses: number; ranked: boolean;
  rating: "S" | "A" | "B" | "C" | "D"; ratingVersion: string;
}
export interface QuickTowerSnapshot {
  physicsVersion: string; rulesetVersion: string; seed: number; assist: boolean;
  tick: number; phase: RunPhase; lives: number; population: number;
  perfectCount: number; streak: number; bestStreak: number; comboLevel: number;
  comboRatio: number; sway: number; swayOffset: number;
  difficulty: QuickDifficulty;
  camera: { x: number; lift: number }; loadProgress: number;
  crane: { x: number; y: number }; released: { x: number; y: number };
  floors: readonly PlacedFloor[];
  building: BuildingId; targetFloors: number; isRoof: boolean; roof: PlacedFloor | null;
  current: { x: number; y: number; rotation: number };
  impact?: { tick: number; x: number; y: number; floorIndex: number; normalX: number; normalY: number } | null;
  lastPlacement: PlacementQuality | null; feedbackId: number; feedbackRatio: number;
  drops: readonly DropInput[];
}
export interface RunRecord {
  schema: 1; config: RunConfig; physicsVersion: string; rulesetVersion: string;
  inputs: DropInput[]; endTick: number; result: RunResult;
}
const q = (n: number) => Math.round(n * 1000) / 1000;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
// Integer phase and quantized parabolic wave avoid runtime-dependent trigonometry.
export function wave(tick: number, period: number): number {
  const phase = ((tick % period) + period) % period;
  const triangle = phase < period / 2 ? -1 + phase * 4 / period : 3 - phase * 4 / period;
  return q(triangle * (2 - Math.abs(triangle)));
}
function seedPhase(seed: number): number {
  let value = seed | 0;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  return value >>> 0;
}
export function floorSway(snapshot: QuickTowerSnapshot, index: number): number {
  return q(snapshot.swayOffset * floorSwayWeight(index));
}
export function floorSwayWeight(index: number): number { return clamp(index / R.swayBuildFloors, 0, 1); }
export function cameraLift(snapshot: QuickTowerSnapshot): number {
  return snapshot.camera.lift;
}
export class QuickTowerGame {
  readonly config: RunConfig;
  private tickCount = 0;
  private accumulator = 0;
  private paused = false;
  private phase: RunPhase = "swing";
  private lives: number = R.lives;
  private population = 0;
  private perfectCount = 0;
  private streak = 0;
  private bestStreak = 0;
  private comboLevel = 0;
  private comboTicks = 0;
  private sway = 0;
  private currentX = 0;
  private currentY: number = R.spawnY;
  private currentRotation = 0;
  private previousCurrent = { x: 0, y: R.spawnY as number, rotation: 0 };
  private previousPhase: RunPhase = "swing";
  private previousFloorCount = 0;
  private fallSpeed = 0;
  private missTicks = 0;
  private missAge = 0;
  private missVelocityX = 0;
  private missGroundTick = -1;
  private lastContactFloor: number | null = null;
  private impact: NonNullable<QuickTowerSnapshot["impact"]> | null = null;
  private transitionTicks = 0;
  private cameraX = 0;
  private cameraY = 0;
  private craneX = 0;
  private released = { x: 0, y: R.spawnY as number };
  private swayBias = 0;
  private lastPlacement: PlacementQuality | null = null;
  private feedbackId = 0;
  private feedbackTicks = 0;
  private readonly floors: PlacedFloor[] = [];
  private readonly drops: DropInput[] = [];
  private roof: PlacedFloor | null = null;
  private readonly metrics = emptyMetrics();
  private readonly phaseOffset: number;
  private swingPhase = 0;
  private swayPhase = 0;
  constructor(config: number | RunConfig = 1) {
    const value = typeof config === "number" ? { seed: config, mode: "quick" as const, assist: false } : config;
    if (!Number.isInteger(value.seed) || !["quick", "city", "daily"].includes(value.mode) || typeof value.assist !== "boolean" || (value.mode === "city" && (!isBuildingId(value.building) || value.assist))) throw new Error("Invalid run config");
    const daily = value.mode === "daily" ? validateDaily(value.daily) : undefined;
    if (daily ? value.assist || value.seed !== daily.seed || value.building !== daily.classId : value.daily !== undefined) throw new Error("Invalid Daily config");
    if (value.legacyPerfect !== undefined && (value.mode !== "city" || typeof value.legacyPerfect !== "boolean")) throw new Error("Invalid legacy rules");
    if (value.legacyOverlap !== undefined && (value.mode !== "city" || typeof value.legacyOverlap !== "boolean")) throw new Error("Invalid legacy overlap rules");
    if (value.legacyScoring !== undefined && (value.mode !== "city" || typeof value.legacyScoring !== "boolean")) throw new Error("Invalid legacy scoring rules");
    if (value.legacyMotion !== undefined && (value.mode !== "city" || typeof value.legacyMotion !== "boolean")) throw new Error("Invalid legacy motion rules");
    if (value.motionVersion !== undefined && (value.mode !== "city" || ![11,12].includes(value.motionVersion))) throw new Error("Invalid motion version");
    this.config = Object.freeze({ ...value, ...(daily ? { daily } : {}), seed: value.seed | 0 });
    this.phaseOffset = seedPhase(this.config.seed);
    this.swingPhase = (this.phaseOffset % R.swingPeriodTicks) * 1000;
    this.swayPhase = (this.phaseOffset % R.swayPeriodTicks) * 1000;
    this.updateSwing();
    this.previousCurrent = { x: this.currentX, y: this.currentY, rotation: this.currentRotation };
  }
  setPaused(paused: boolean): void { this.paused = paused; }
  getTick(): number { return this.tickCount; }
  getPhase(): RunPhase { return this.phase; }
  getMetrics(): RunMetrics { return { ...this.metrics, body: { ...this.metrics.body }, signedErrors: [...this.metrics.signedErrors] }; }
  getInterpolationAlpha(): number { return this.accumulator; }
  getPreviousRenderSnapshot(snapshot = this.getSnapshot()): QuickTowerSnapshot {
    if (this.previousFloorCount !== snapshot.floors.length) return snapshot;
    return { ...snapshot, phase: this.previousPhase, current: { ...this.previousCurrent } };
  }
  update(seconds: number): void {
    if (this.paused || !Number.isFinite(seconds)) return;
    this.accumulator += clamp(seconds, 0, .1) * R.tickRate;
    while (this.accumulator >= 1 - 1e-9) { this.step(); this.accumulator = Math.max(0, this.accumulator - 1); }
  }
  advanceTicks(count: number): void {
    if (!Number.isInteger(count) || count < 0) throw new Error("Invalid tick count");
    if (!this.paused) for (let i = 0; i < count; i++) this.step();
  }
  drop(renderFraction = 1): boolean {
    const previous = this.drops[this.drops.length - 1];
    if (this.paused || this.phase !== "swing" || (previous && this.tickCount - previous.tick < R.inputDebounceTicks)) return false;
    const fraction = Math.round(clamp(renderFraction, 0, 1) * 1000);
    if (this.previousPhase === "swing" && this.previousFloorCount === this.floors.length) {
      this.currentX = q(this.previousCurrent.x + (this.currentX - this.previousCurrent.x) * fraction / 1000);
      this.currentY = q(this.previousCurrent.y + (this.currentY - this.previousCurrent.y) * fraction / 1000);
      this.currentRotation = q(this.previousCurrent.rotation + (this.currentRotation - this.previousCurrent.rotation) * fraction / 1000);
    }
    this.phase = "falling"; this.fallSpeed = 0;
    this.released = { x: this.currentX, y: this.currentY };
    this.previousCurrent = { x: this.currentX, y: this.currentY, rotation: this.currentRotation };
    this.previousPhase = "falling";
    this.drops.push({ tick: this.tickCount, sequence: this.drops.length, fraction });
    return true;
  }
  getSnapshot(): QuickTowerSnapshot {
    return {
      physicsVersion: PHYSICS_VERSION, rulesetVersion: this.config.mode === "daily" ? this.config.daily!.rulesetVersion : this.config.mode === "city" ? this.config.legacyPerfect ? "build-city-1" : this.config.legacyOverlap ? "build-city-2" : this.config.legacyScoring ? "build-city-3" : this.config.legacyMotion ? "build-city-4" : this.config.motionVersion===11 ? "build-city-5" : this.config.motionVersion===12 ? "build-city-6" : CITY_RULESET_VERSION : this.config.assist ? ASSIST_RULESET_VERSION : RULESET_VERSION,
      seed: this.config.seed, assist: this.config.assist, tick: this.tickCount, phase: this.phase,
      lives: this.lives, population: this.population, perfectCount: this.perfectCount,
      streak: this.streak, bestStreak: this.bestStreak, comboLevel: this.comboLevel,
      comboRatio: this.comboTicks / R.comboDurationTicks, sway: this.swayAmplitude(), swayOffset: this.swayOffset(),
      difficulty: this.difficulty(),
      camera: { x: this.cameraX, lift: this.cameraY },
      crane: { x: this.craneX, y: R.cablePivotY - this.cameraY }, released: { ...this.released },
      loadProgress: this.phase === "preparing" ? 1 - this.transitionTicks / R.prepareTicks : 1,
      floors: this.floors.map(f => ({ ...f })), building: this.config.building ?? "residential",
      targetFloors: this.targetFloors(),
      isRoof: this.isRoof(), roof: this.roof ? { ...this.roof } : null,
      current: { x: this.currentX, y: this.currentY, rotation: this.currentRotation },
      impact: this.impact ? {...this.impact} : null,
      lastPlacement: this.lastPlacement, feedbackId: this.feedbackId, feedbackRatio: this.feedbackTicks / R.feedbackTicks,
      drops: this.drops.map(d => ({ ...d })),
    };
  }
  getResult(): RunResult {
    const scored = this.config.legacyScoring ? this.floors : this.floors.slice(1);
    const accuracy = scored.length ? q(scored.reduce((sum, f) => sum + 1 - f.error, 0) / scored.length * 100) : 0;
    const rating = this.floors.length >= Rating.sHeight && accuracy >= Rating.sAccuracy ? "S" : this.floors.length >= Rating.aHeight && accuracy >= Rating.aAccuracy ? "A" : this.floors.length >= Rating.bHeight && accuracy >= Rating.bAccuracy ? "B" : this.floors.length > 0 ? "C" : "D";
    const cityRating = this.config.mode !== "quick" ? (this.floors.length < this.targetFloors() ? "D" : this.roof && accuracy >= 94 && this.roof.error <= .08 ? "S" : this.roof && accuracy >= 85 ? "A" : accuracy >= 70 ? "B" : "C") : rating;
    return { population: this.population, height: this.floors.length, accuracy, perfectCount: this.perfectCount,
      bestStreak: this.bestStreak, durationTicks: this.tickCount, misses: R.lives - this.lives,
      ranked: this.config.mode === "quick" && !this.config.assist, rating: cityRating, ratingVersion: this.config.mode !== "quick" ? CITY_RATING_VERSION : RATING_VERSION };
  }
  getRecord(): RunRecord {
    if (this.phase !== "ended") throw new Error("Cannot record unfinished run");
    return { schema: 1, config: { ...this.config }, physicsVersion: PHYSICS_VERSION,
      rulesetVersion: this.getSnapshot().rulesetVersion, inputs: this.drops.map(d => ({ ...d })), endTick: this.tickCount, result: this.getResult() };
  }
  private step(): void {
    if (this.phase === "ended") return;
    this.previousCurrent = { x: this.currentX, y: this.currentY, rotation: this.currentRotation };
    this.previousPhase = this.phase; this.previousFloorCount = this.floors.length;
    const previousSway = this.swayOffset();
    this.tickCount++;
    const difficulty = this.difficulty();
    // Integrate phase instead of changing tick % period: height changes cannot jump the pendulum.
    this.swingPhase = (this.swingPhase + Math.round(difficulty.speedMultiplier * 1000)) % (R.swingPeriodTicks * 1000);
    this.swayPhase = (this.swayPhase + Math.round(difficulty.swaySpeedMultiplier * 1000)) % (R.swayPeriodTicks * 1000);
    if (this.feedbackTicks > 0) this.feedbackTicks--;
    if (this.comboTicks > 0 && --this.comboTicks === 0) this.comboLevel = 0;
    // Recovery changes amplitude without jumping the tower at impact.
    this.swayBias = q(this.swayBias * .85);
    if (this.phase === "settling") {
      if (--this.transitionTicks <= 0) this.spawnFloor();
      return;
    }
    if (this.phase === "swing" || this.phase === "preparing") {
      this.updateCamera(); this.updateSwing();
      if (this.phase === "preparing") {
        if (this.transitionTicks > 0) this.transitionTicks--;
        // Rapid successful drops must not outrun camera follow and spawn inside the tower.
        const surfaceY = R.groundY - this.floors.length * R.floorHeight;
        const lowestLoadBottom = R.cablePivotY + difficulty.cableLength + R.hookToRoof - this.cameraY + R.floorHeight;
        if (this.transitionTicks <= 0 && (this.config.legacyOverlap || lowestLoadBottom < surfaceY)) this.phase = "swing";
      }
      return;
    }
    if (this.phase === "miss" && !this.legacyMiss()) {
      this.advanceMiss(previousSway); return;
    }
    this.fallSpeed = q(Math.min(R.maxFallSpeed, this.fallSpeed + R.gravityPerTick));
    this.currentY = q(this.currentY + this.fallSpeed);
    if (this.phase === "falling") {
      this.currentRotation = q(this.currentRotation * .985);
      const surfaceY = R.groundY - this.floors.length * R.floorHeight;
      if (this.currentY + R.floorHeight >= surfaceY) {
        this.resolveLanding(surfaceY - R.floorHeight);
        if (this.getPhase() === "miss" && !this.legacyMiss()) this.resolveMissContact(previousSway);
      }
    } else {
      this.currentRotation = q(this.currentRotation + .06);
      if (--this.missTicks <= 0) { if (this.lives <= 0) this.phase = "ended"; else this.spawnFloor(); }
    }
  }
  private updateSwing(): void {
    const difficulty = this.difficulty();
    const w = wave(this.swingPhase / 1000, R.swingPeriodTicks);
    const displacement = w * difficulty.amplitude;
    this.currentX = q(this.craneX + displacement);
    // Suspension eye follows an arc around the crane pulley; the load remains level.
    this.currentY = q(R.cablePivotY + Math.sqrt(Math.max(0,difficulty.cableLength ** 2 - displacement ** 2)) + R.hookToRoof - this.cameraY);
    this.currentRotation = q(w * R.swingRotation);
  }
  private resolveLanding(targetY: number): void {
    if (!this.floors.length && !this.config.legacyScoring) {
      // Ground has no alignment target. Never snap to center or award a Perfect/combo.
      const population = this.config.mode !== "quick" ? BUILDINGS[this.config.building!].population : R.basePopulation;
      this.floors.push({ x:this.currentX, quality:"good", population, error:0 });
      this.metrics.foundation = 1;
      this.population += population; this.currentY = targetY;
      this.lastPlacement = null; this.feedbackId++; this.feedbackTicks = 0;
      this.phase = "settling"; this.transitionTicks = R.landingHoldTicks; return;
    }
    const previousX = this.floors.length ? this.floors[this.floors.length - 1].x : 0;
    const offset = this.swayOffset();
    const targetX = previousX + offset * floorSwayWeight(this.floors.length - 1);
    const error = q(Math.abs(this.currentX - targetX));
    const signedError = q((this.currentX - targetX) / R.floorWidth);
    // New runs miss AT 40% displacement; legacy pending City towers keep the old 18% overlap rule.
    const missed = this.config.legacyOverlap
      ? R.floorWidth - error < R.floorWidth * .18
      : error >= q(R.floorWidth * (1 - R.minimumOverlapRatio));
    if (missed) { recordMetric(this.metrics, "miss", signedError, this.isRoof()); this.registerMiss(); return; }
    const normalized = q(error / R.floorWidth);
    const threshold = this.config.legacyScoring && this.config.assist ? R.assistThresholdMultiplier : 1;
    // Compare raw error so 94.999% cannot round up into Perfect. Assist uses the same band.
    // Already-started v0.7 City towers retain their original scoring on checkpoint migration.
    const perfectWindow = this.config.legacyPerfect ? 0 : R.perfectThreshold * R.floorWidth;
    const great = this.config.legacyScoring ? .22 : R.greatThreshold;
    const good = this.config.legacyScoring ? .45 : R.goodThreshold;
    const greatMatch = this.config.legacyScoring ? normalized <= great * threshold : error <= q(R.floorWidth * great);
    const goodMatch = this.config.legacyScoring ? normalized <= good * threshold : error <= q(R.floorWidth * good);
    const quality = error <= perfectWindow ? "perfect" : greatMatch ? "great" : goodMatch ? "good" : "risky";
    if (!this.floors.length) this.metrics.foundation = 1;
    else recordMetric(this.metrics, quality, signedError, this.isRoof());
    const basePopulation = this.config.mode !== "quick" ? BUILDINGS[this.config.building!].population : R.basePopulation;
    const population = Math.max(1, Math.round(basePopulation * QUALITY_POPULATION_FACTORS[quality] * (this.comboTicks > 0 ? 1 + this.comboLevel * R.comboBonus : 1)));
    if (this.isRoof()) {
      const bonus = Math.round(basePopulation * 5 * (1 - normalized));
      this.roof = { x: q(this.currentX - offset), quality, population: bonus, error: normalized };
      this.population += bonus; this.currentY = targetY;
      this.lastPlacement = quality; this.feedbackId++; this.feedbackTicks = R.feedbackTicks;
      this.phase = "ended"; return;
    }
    // Keep each existing floor's sway weight stable when another floor is added.
    this.floors.push({ x: q(this.currentX - offset * floorSwayWeight(this.floors.length)), quality, population, error: normalized });
    if (quality === "perfect") {
      this.perfectCount++; this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak);
      this.comboLevel++; this.comboTicks = R.comboDurationTicks;
      this.metrics.maxCombo = Math.max(this.metrics.maxCombo, this.comboLevel);
      this.sway = q(Math.max(0, this.sway - R.perfectRecovery));
    } else {
      this.streak = 0;
      this.sway = q(clamp(this.sway + normalized * R.swayErrorGain + this.floors.length * R.heightSwayGain, 0, R.maxSway));
    }
    const newWave = wave(this.swayPhase / 1000, R.swayPeriodTicks);
    this.swayBias = q(offset - newWave * this.swayAmplitude());
    this.population += population; this.currentY = targetY;
    this.lastPlacement = quality; this.feedbackId++; this.feedbackTicks = R.feedbackTicks;
    this.phase = "settling"; this.transitionTicks = R.landingHoldTicks;
  }
  private registerMiss(): void {
    this.lives--; this.streak = 0; this.comboLevel = 0; this.comboTicks = 0;
    this.lastPlacement = "miss"; this.feedbackId++; this.feedbackTicks = R.feedbackTicks;
    if (this.isRoof() && this.legacyMiss()) { this.phase = "ended"; return; }
    this.phase = "miss"; this.missTicks = R.missTicks;
    this.missAge = 0; this.missVelocityX = 0; this.missGroundTick = -1;
    this.lastContactFloor = null;
  }
  private legacyMiss(): boolean {
    return !!(this.config.legacyMotion || this.config.legacyScoring || this.config.legacyOverlap || this.config.legacyPerfect || this.config.motionVersion);
  }
  private resolveMissContact(previousSway: number): void {
    const hit = sweepTower(this.previousCurrent,{x:this.currentX,y:this.currentY},this.floors,previousSway,this.swayOffset());
    if (!hit) return;
    const fresh = this.lastContactFloor !== hit.floorIndex;
    if (fresh) this.impact = {tick:this.tickCount,x:q(hit.x),y:q(hit.y),floorIndex:hit.floorIndex,normalX:hit.normalX,normalY:hit.normalY};
    this.lastContactFloor = hit.floorIndex;
    if (hit.floorIndex === -1) {
      this.currentY = R.groundY-R.floorHeight; this.fallSpeed = 0; this.missVelocityX = 0;
      if (this.missGroundTick < 0) this.missGroundTick = this.tickCount;
      return;
    }
    const direction = hit.normalX || Math.sign(this.currentX-hit.floorX) || 1;
    this.missVelocityX = direction*6;
    if (hit.normalY < 0) {
      this.currentY = R.groundY-(hit.floorIndex+2)*R.floorHeight;
      this.fallSpeed = fresh ? -4 : 0;
    } else if (hit.normalY > 0) {
      this.currentY = R.groundY-hit.floorIndex*R.floorHeight;
      this.fallSpeed = Math.max(0,this.fallSpeed);
    } else {
      this.currentX = q(hit.floorX+hit.normalX*(R.floorWidth+.01));
    }
  }
  private advanceMiss(previousSway: number): void {
    this.missAge++; this.missTicks--;
    if (this.missGroundTick < 0) {
      this.fallSpeed = q(Math.min(R.maxFallSpeed,this.fallSpeed+R.gravityPerTick));
      this.currentX = q(this.currentX+this.missVelocityX);
      this.currentY = q(this.currentY+this.fallSpeed);
      this.resolveMissContact(previousSway);
      const direction = Math.sign(this.missVelocityX) || Math.sign(this.currentX-this.craneX) || 1;
      this.currentRotation = q(clamp(this.currentRotation+direction*.025,-.28,.28));
    }
    const belowView = this.currentY+this.cameraY>R.worldHeight+R.floorHeight;
    const onGround = this.missGroundTick>=0 && this.tickCount-this.missGroundTick>=12;
    if (this.missTicks<=0 && (belowView || onGround || this.missAge>=180)) {
      if (this.lives<=0 || this.isRoof()) this.phase="ended";
      else this.spawnFloor();
    }
  }
  private targetFloors(): number { return this.config.mode === "daily" ? this.config.daily!.targetBodyFloors : this.config.mode === "city" ? BUILDINGS[this.config.building!].floors : 0; }
  private isRoof(): boolean { return this.targetFloors() > 0 && this.floors.length >= this.targetFloors(); }
  private spawnFloor(): void { this.phase = "preparing"; this.transitionTicks = R.prepareTicks; this.fallSpeed = 0; this.impact = null; this.updateSwing(); }
  private updateCamera(): void {
    const top = this.floors.length ? this.floors[this.floors.length - 1].x : 0;
    this.craneX = q(this.craneX + clamp(top - this.craneX, -R.cameraSpeed, R.cameraSpeed));
    const targetX = Math.abs(top) <= R.cameraDeadZone ? 0 : top - Math.sign(top) * R.cameraDeadZone;
    const targetY = Math.max(0, R.cameraTopY - (R.groundY - this.floors.length * R.floorHeight));
    this.cameraX = q(this.cameraX + clamp(targetX - this.cameraX, -R.cameraSpeed, R.cameraSpeed));
    this.cameraY = q(this.cameraY + clamp(targetY - this.cameraY, -R.cameraSpeed, R.cameraSpeed));
  }
  private difficulty(): QuickDifficulty { return getQuickDifficulty(this.floors.length,this.config.assist,!!(this.config.legacyMotion||this.config.legacyScoring||this.config.legacyOverlap||this.config.legacyPerfect),this.config.motionVersion); }
  private swayAmplitude(): number { return this.sway + this.difficulty().baselineSway; }
  private swayOffset(): number { return this.floors.length ? q(wave(this.swayPhase / 1000, R.swayPeriodTicks) * this.swayAmplitude() + this.swayBias) : 0; }
}
