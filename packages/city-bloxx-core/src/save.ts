import { type RunRecord } from "./run";
import { verifyRecord } from "./replay";
import { emptyCity, validateCity, type CitySave } from "./city";
export interface GameSave { schema: 3; standardQuickBest: number; assistQuickBest: number; runs: number; lastReplay: RunRecord | null; city: CitySave }
export function emptySave(): GameSave { return { schema: 3, standardQuickBest: 0, assistQuickBest: 0, runs: 0, lastReplay: null, city: emptyCity() }; }
const integer = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : 0;
export function migrateSave(value: unknown): GameSave {
  if (!value || typeof value !== "object") throw new Error("Invalid save; original data preserved");
  const s = value as Record<string, unknown>;
  if (s.schema !== 1 && s.schema !== 2 && s.schema !== 3) throw new Error("Unknown save schema; original save preserved");
  let replay: RunRecord | null = null;
  if (s.lastReplay) { try { replay = verifyRecord(s.lastReplay); } catch { /* incompatible replay is optional */ } }
  return { schema: 3, standardQuickBest: integer(s.standardQuickBest), assistQuickBest: integer(s.assistQuickBest), runs: integer(s.runs), lastReplay: replay, city: s.schema === 3 ? validateCity(s.city) : emptyCity() };
}
export function commitRun(save: GameSave, record: RunRecord): GameSave {
  if (record.config.mode !== "quick") throw new Error("City runs cannot update Quick scores");
  const result = record.result;
  return { schema: 3, city: JSON.parse(JSON.stringify(save.city)), standardQuickBest: result.ranked ? Math.max(save.standardQuickBest, result.population) : save.standardQuickBest,
    assistQuickBest: result.ranked ? save.assistQuickBest : Math.max(save.assistQuickBest, result.population),
    runs: save.runs + 1, lastReplay: record.inputs.length <= 4096 && record.endTick <= 432000 ? JSON.parse(JSON.stringify(record)) : null };
}
