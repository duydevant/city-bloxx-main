import { BUILDING_IDS, BUILDINGS, isBuildingId, type BuildingId } from "./buildings";
import { checkpointTower, restoreTower, type TowerCheckpoint } from "./checkpoint";
import { QuickTowerGame, type RunResult } from "./run";

export interface CityBuilding {
  runId: string; classId: BuildingId; skin: "default"; floors: number; population: number;
  roof: boolean; complete: boolean; accuracy: number; rating: RunResult["rating"];
}
export interface PendingCityTower { runId: string; lot: number; classId: BuildingId; checkpoint: TowerCheckpoint }
export interface CitySave {
  version: 1; lots: (CityBuilding | null)[]; unlocked: BuildingId[]; nextRun: number;
  pending: PendingCityTower | null; inventory: { skins: string[] };
  stats: { builds: number; floors: number; completed: number; byClass: Record<BuildingId, number> };
}
export function emptyCity(): CitySave {
  return { version: 1, lots: Array.from({ length: 25 }, () => null), unlocked: ["residential"], nextRun: 1, pending: null,
    inventory: { skins: ["default"] }, stats: { builds: 0, floors: 0, completed: 0, byClass: { residential: 0, industrial: 0, office: 0, highrise: 0 } } };
}
export function cityPopulation(city: CitySave): number { return city.lots.reduce((sum, lot) => sum + (lot?.population ?? 0), 0); }
export function adjacentLots(lot: number): number[] {
  if (!Number.isInteger(lot) || lot < 0 || lot >= 25) return [];
  const row = Math.floor(lot / 5), col = lot % 5;
  return [row > 0 ? lot - 5 : -1, row < 4 ? lot + 5 : -1, col > 0 ? lot - 1 : -1, col < 4 ? lot + 1 : -1].filter(n => n >= 0);
}
export function placementStatus(city: CitySave, lot: number, classId: BuildingId): { valid: boolean; locked: boolean; missing: BuildingId[] } {
  const neighbors = adjacentLots(lot).map(index => city.lots[index]?.classId);
  const missing = BUILDINGS[classId].requires.filter(id => !neighbors.includes(id));
  const locked = !city.unlocked.includes(classId);
  return { valid: Number.isInteger(lot) && lot >= 0 && lot < 25 && !locked && missing.length === 0, locked, missing };
}
const copy = (city: CitySave): CitySave => JSON.parse(JSON.stringify(city));
export function beginCityTower(city: CitySave, lot: number, classId: BuildingId, seed: number): CitySave {
  if (city.pending) throw new Error("Finish or cancel the pending tower first");
  if (!placementStatus(city, lot, classId).valid) throw new Error("Invalid city placement");
  const next = copy(city), game = new QuickTowerGame({ seed, mode: "city", assist: false, building: classId });
  next.pending = { runId: `city-${next.nextRun++}`, lot, classId, checkpoint: checkpointTower(game) };
  return next;
}
export function updateCityCheckpoint(city: CitySave, game: QuickTowerGame): CitySave {
  if (!city.pending || game.config.mode !== "city" || game.config.building !== city.pending.classId || game.config.seed !== city.pending.checkpoint.config.seed) throw new Error("City checkpoint does not match pending tower");
  // Only pending changes per drop/impact; do not JSON-serialize every completed lot on the input path.
  return { ...city, pending: { ...city.pending, checkpoint: checkpointTower(game) } };
}
export function cancelCityTower(city: CitySave): CitySave { const next = copy(city); next.pending = null; return next; }
export function acceptCityTower(city: CitySave, runId: string): CitySave {
  // Only the currently pending transaction can be committed, exactly once.
  if (!city.pending || city.pending.runId !== runId) return city;
  const pending = city.pending, game = restoreTower(pending.checkpoint);
  if (game.getPhase() !== "ended") throw new Error("Tower has not ended");
  if (!placementStatus(city, pending.lot, pending.classId).valid) throw new Error("City placement no longer valid");
  const next = copy(city), s = game.getSnapshot(), result = game.getResult();
  next.pending = null;
  if (result.height === 0) return next; // Preserve an old building on a failed rebuild.
  const complete = result.height === BUILDINGS[pending.classId].floors;
  next.lots[pending.lot] = { runId, classId: pending.classId, skin: "default", floors: result.height,
    population: result.population, roof: !!s.roof, complete, accuracy: result.accuracy, rating: result.rating };
  next.stats.builds++; next.stats.floors += result.height;
  if (complete) {
    next.stats.completed++; next.stats.byClass[pending.classId]++;
    const id = BUILDING_IDS[BUILDING_IDS.indexOf(pending.classId) + 1];
    if (id && !next.unlocked.includes(id)) next.unlocked.push(id);
  }
  return next;
}
export function demolishCityBuilding(city: CitySave, lot: number): CitySave {
  if (city.pending) throw new Error("Finish or cancel the pending tower before demolition");
  if (!Number.isInteger(lot) || lot < 0 || lot >= 25) throw new Error("Invalid lot");
  const next = copy(city); next.lots[lot] = null; return next;
}
function integer(value: unknown, max = 1000000000): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max; }
export function validateCity(value: unknown): CitySave {
  if (!value || typeof value !== "object") throw new Error("Invalid city; original preserved");
  const city = value as CitySave;
  if (city.version !== 1 || !Array.isArray(city.lots) || city.lots.length !== 25 || !integer(city.nextRun) || city.nextRun < 1 || !Array.isArray(city.unlocked) || !city.unlocked.includes("residential") || city.unlocked.some(id => !isBuildingId(id)) || new Set(city.unlocked).size !== city.unlocked.length || !city.stats || !integer(city.stats.builds) || !integer(city.stats.floors) || !integer(city.stats.completed) || !city.stats.byClass || BUILDING_IDS.some(id => !integer(city.stats.byClass[id]))) throw new Error("Invalid city bounds; original preserved");
  const runIds = new Set<string>();
  city.lots.forEach(lot => {
    if (lot === null) return;
    if (!lot || !isBuildingId(lot.classId) || !/^city-[1-9]\d*$/.test(lot.runId) || Number(lot.runId.slice(5)) >= city.nextRun || runIds.has(lot.runId) || !integer(lot.floors, BUILDINGS[lot.classId].floors) || lot.floors < 1 || !integer(lot.population, 1000000) || typeof lot.roof !== "boolean" || typeof lot.complete !== "boolean" || lot.complete !== (lot.floors === BUILDINGS[lot.classId].floors) || (lot.roof && !lot.complete) || !Number.isFinite(lot.accuracy) || lot.accuracy < 0 || lot.accuracy > 100 || !["S", "A", "B", "C", "D"].includes(lot.rating)) throw new Error("Invalid city building; original preserved");
    runIds.add(lot.runId);
  });
  if (city.pending !== null) {
    const p = city.pending;
    if (!p || !isBuildingId(p.classId) || !integer(p.lot, 24) || p.runId !== `city-${city.nextRun - 1}` || runIds.has(p.runId) || !placementStatus(city, p.lot, p.classId).valid) throw new Error("Invalid pending city tower; original preserved");
    const game = restoreTower(p.checkpoint);
    if (game.config.building !== p.classId) throw new Error("Pending class mismatch");
  }
  const next = copy(city);
  next.lots.forEach(lot => { if (lot) lot.skin = "default"; }); // Unknown skins are cosmetic only.
  next.inventory = { skins: ["default"] };
  return next;
}
