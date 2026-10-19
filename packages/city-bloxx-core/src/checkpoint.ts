import { PHYSICS_VERSION } from "./rules";
import { QuickTowerGame, type DropInput, type RunConfig } from "./run";
export interface TowerCheckpoint { version: string; config: RunConfig; tick: number; inputs: DropInput[] }
export function checkpointTower(game: QuickTowerGame): TowerCheckpoint {
  const s = game.getSnapshot();
  if (s.tick > 432000 || s.drops.length > 4096) throw new Error("Checkpoint bounds exceeded");
  return { version: PHYSICS_VERSION, config: { ...game.config }, tick: s.tick, inputs: s.drops.map(d => ({ ...d })) };
}
// Re-simulation avoids serializing undocumented private state and preserves pending falls.
export function restoreTower(value: unknown): QuickTowerGame {
  if (!value || typeof value !== "object") throw new Error("Invalid checkpoint; original preserved");
  const c = value as TowerCheckpoint;
  if (![PHYSICS_VERSION, "physics-0.7.0", "physics-0.8.0", "physics-0.9.0", "physics-0.10.0", "physics-0.11.0", "physics-0.12.0"].includes(c.version) || !Number.isInteger(c.tick) || c.tick < 0 || c.tick > 432000 || !Array.isArray(c.inputs) || c.inputs.length > 4096 || !(c.config?.mode === "city" || ["daily", "perfect-rush", "skyline-sprint"].includes(c.config?.mode as string) && c.version === PHYSICS_VERSION)) throw new Error("Unsupported checkpoint; original preserved");
  const config: RunConfig = c.version === "physics-0.7.0" ? { ...c.config, legacyPerfect: true, legacyOverlap: true, legacyScoring:true }
    : c.version === "physics-0.8.0" ? { ...c.config, legacyOverlap: true, legacyScoring:true }
    : c.version === "physics-0.9.0" ? { ...c.config, legacyScoring:true }
    : c.version === "physics-0.10.0" ? { ...c.config, legacyMotion:true }
    : c.version === "physics-0.11.0" ? { ...c.config, motionVersion:11 }
    : c.version === "physics-0.12.0" ? { ...c.config, motionVersion:c.config.motionVersion ?? 12 } : c.config;
  const game = new QuickTowerGame(config);
  let previous = -1;
  for (let i = 0; i < c.inputs.length; i++) {
    const input = c.inputs[i];
    if (!input || !Number.isInteger(input.tick) || input.tick <= previous || input.tick > c.tick || input.sequence !== i || !Number.isInteger(input.fraction) || input.fraction < 0 || input.fraction > 1000) throw new Error("Invalid checkpoint input");
    game.advanceTicks(input.tick - game.getTick());
    if (game.getTick() !== input.tick || !game.drop(input.fraction / 1000)) throw new Error("Checkpoint input rejected");
    previous = input.tick;
  }
  game.advanceTicks(c.tick - game.getTick());
  if (game.getTick() !== c.tick) throw new Error("Checkpoint end mismatch");
  return game;
}
