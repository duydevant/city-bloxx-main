import { resolveDaily, type DailyDefinition } from "./daily";
import { PHYSICS_VERSION, RULESET_VERSION } from "./rules";
import { QuickTowerGame, type DropInput, type RunConfig } from "./run";

export interface RankedInputs {
  config: RunConfig; physicsVersion: string; rulesetVersion: string;
  inputs: DropInput[]; endTick: number;
}
// Pure bounded simulation. No client result, clock, networking or persistence.
export function resimulateRun(value: RankedInputs) {
  if (!value || typeof value !== "object" || Object.keys(value).some(k => !["config","physicsVersion","rulesetVersion","inputs","endTick"].includes(k)))
    throw new Error("Invalid ranked envelope");
  const { config, inputs, endTick } = value;
  if (value.physicsVersion !== PHYSICS_VERSION) throw new Error("Unsupported ranked version");
  if (!config || !["quick", "daily"].includes(config.mode) || config.assist !== false ||
      !Number.isInteger(config.seed) || config.seed < -2147483648 || config.seed > 2147483647 ||
      Object.keys(config).some(k => !["seed", "mode", "assist", ...(config.mode === "daily" ? ["daily","building"] : [])].includes(k)))
    throw new Error("Invalid ranked config");
  let daily: DailyDefinition | undefined;
  if (config.mode === "daily") {
    if (!config.daily) throw new Error("Invalid Daily config");
    daily = resolveDaily(config.daily.dateUTC);
    if (Object.keys(config.daily).length !== Object.keys(daily).length ||
        Object.keys(daily).some(k => daily![k as keyof DailyDefinition] !== config.daily![k as keyof DailyDefinition]) ||
        config.seed !== daily.seed || (config.building !== undefined && config.building !== daily.classId)) throw new Error("Invalid Daily config");
  }
  if (value.physicsVersion !== PHYSICS_VERSION || value.rulesetVersion !== (daily?.rulesetVersion ?? RULESET_VERSION))
    throw new Error("Unsupported ranked version");
  if (!Number.isInteger(endTick) || endTick < 1 || endTick > 432000 || !Array.isArray(inputs) || inputs.length > 4096)
    throw new Error("Invalid ranked bounds");
  let previous = -1;
  for (const [index, i] of inputs.entries()) {
    if (!i || Object.keys(i).some(k => !["tick", "sequence", "fraction"].includes(k)) ||
        i.sequence !== index || !Number.isInteger(i.tick) || i.tick <= previous || i.tick >= endTick ||
        !Number.isInteger(i.fraction) || i.fraction < 0 || i.fraction > 1000) throw new Error("Invalid ranked input");
    previous = i.tick;
  }
  const game = new QuickTowerGame(daily ? {...config,building:daily.classId} : config);
  let index = 0;
  for (let tick = 0; tick < endTick; tick++) {
    if (game.getPhase() === "ended") throw new Error("Run ended early");
    if (inputs[index]?.tick === tick) {
      if (!game.drop(inputs[index].fraction / 1000)) throw new Error("Unused ranked input");
      index++;
    }
    game.advanceTicks(1);
  }
  if (index !== inputs.length || game.getPhase() !== "ended" || game.getTick() !== endTick)
    throw new Error("Run is not exactly ended");
  const result = game.getResult(), metrics = game.getMetrics();
  return { result, metrics, eligible: config.mode === "quick" || result.height === daily!.targetBodyFloors,
    perfectBody: metrics.body.perfect, bodyPlacements: Object.values(metrics.body).reduce((a, b) => a + b, 0) };
}
