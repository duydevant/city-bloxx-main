import { ASSIST_RULESET_VERSION, PHYSICS_VERSION, RULESET_VERSION } from "./rules";
import { QuickTowerGame, type RunRecord, type QuickTowerSnapshot } from "./run";
export const MAX_REPLAY_INPUTS = 4096;
export const MAX_REPLAY_TICKS = 60 * 60 * 60 * 2;
export function validateRecord(value: unknown): RunRecord {
  if (!value || typeof value !== "object") throw new Error("Invalid replay");
  const r = value as RunRecord;
  if (r.schema !== 1 || r.physicsVersion !== PHYSICS_VERSION || !r.config || r.config.mode !== "quick" ||
    !Number.isInteger(r.config.seed) || typeof r.config.assist !== "boolean" ||
    r.rulesetVersion !== (r.config.assist ? ASSIST_RULESET_VERSION : RULESET_VERSION) ||
    !Number.isInteger(r.endTick) || r.endTick < 1 || r.endTick > MAX_REPLAY_TICKS ||
    !Array.isArray(r.inputs) || r.inputs.length < 3 || r.inputs.length > MAX_REPLAY_INPUTS || !r.result) throw new Error("Unsupported replay version or bounds");
  let previous = -1;
  r.inputs.forEach((input, index) => {
    if (!input || !Number.isInteger(input.tick) || input.tick <= previous || input.tick >= r.endTick || input.sequence !== index || !Number.isInteger(input.fraction) || input.fraction < 0 || input.fraction > 1000) throw new Error("Invalid replay inputs");
    previous = input.tick;
  });
  return JSON.parse(JSON.stringify(r)) as RunRecord;
}
export class QuickTowerReplay {
  private run: QuickTowerGame;
  private inputIndex = 0;
  private accumulator = 0;
  private paused = false;
  readonly record: RunRecord;
  constructor(record: RunRecord) { this.record = validateRecord(record); this.run = new QuickTowerGame(this.record.config); }
  restart(): void { this.run = new QuickTowerGame(this.record.config); this.inputIndex = 0; this.accumulator = 0; this.paused = false; }
  setPaused(value: boolean): void { this.paused = value; }
  getSnapshot(): QuickTowerSnapshot { return this.run.getSnapshot(); }
  getPhase() { return this.run.getPhase(); }
  getInterpolationAlpha(): number { return this.accumulator; }
  getPreviousRenderSnapshot(snapshot?: QuickTowerSnapshot): QuickTowerSnapshot { return this.run.getPreviousRenderSnapshot(snapshot); }
  getResult() { return this.run.getResult(); }
  update(seconds: number): void {
    if (this.paused || !Number.isFinite(seconds)) return;
    this.accumulator += Math.max(0, Math.min(.1, seconds)) * 60;
    while (this.accumulator >= 1 - 1e-9) { this.advanceTicks(1); this.accumulator = Math.max(0, this.accumulator - 1); }
  }
  advanceTicks(count: number): void {
    if (!Number.isInteger(count) || count < 0) throw new Error("Invalid replay tick count");
    if (this.paused) return;
    for (let i = 0; i < count; i++) {
      const tick = this.run.getTick();
      if (tick >= this.record.endTick) return;
      const input = this.record.inputs[this.inputIndex];
      if (input?.tick === tick) { if (!this.run.drop(input.fraction / 1000)) throw new Error("Replay input rejected"); this.inputIndex++; }
      this.run.advanceTicks(1);
      if (this.run.getPhase() === "ended" && this.run.getTick() !== this.record.endTick) throw new Error("Replay end tick mismatch");
    }
  }
}
export function verifyRecord(value: unknown): RunRecord {
  const record = validateRecord(value);
  const replay = new QuickTowerReplay(record);
  replay.advanceTicks(record.endTick);
  const computed = replay.getResult();
  if (replay.getSnapshot().phase !== "ended" || Object.keys(computed).some(key => computed[key as keyof typeof computed] !== record.result[key as keyof typeof computed])) throw new Error("Replay result mismatch");
  return record;
}
