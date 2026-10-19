import {
  CITY_EVOLUTION_STAGE_IDS,
  CITY_EVOLUTION_STAGES,
  DISTRICT_CATALOG,
  DISTRICT_IDS,
  DOCK_CLOCK_TOWER_LANDMARK,
  LANDMARK_IDS,
  type CityEvolutionStageDefinition,
  type CityEvolutionStageId,
  type DistrictDefinition,
  type DistrictGoalSpec,
  type DistrictId,
  type LandmarkDefinition,
  type LandmarkId,
} from "../../city-bloxx-content/districts";
export {
  CITY_EVOLUTION_STAGE_IDS,
  CITY_EVOLUTION_STAGES,
  DISTRICT_CATALOG,
  DISTRICT_IDS,
  DOCK_CLOCK_TOWER_LANDMARK,
  LANDMARK_IDS,
  type CityEvolutionStageDefinition,
  type CityEvolutionStageId,
  type DistrictDefinition,
  type DistrictGoalSpec,
  type DistrictId,
  type LandmarkDefinition,
  type LandmarkId,
};
import { BUILDING_IDS, BUILDINGS, isBuildingId, type BuildingId } from "./buildings";
import { checkpointTower } from "./checkpoint";
import { adjacentLots, type CityBuilding, type CitySave } from "./city";
import { DEFAULT_EQUIPMENT, equipmentFor, validateRunEquipment, type RunEquipment } from "./cosmetics";
import { QuickTowerGame } from "./run";
import { allocateRun, type GameSave } from "./save-state";

export interface DistrictLotState {
  lots: (CityBuilding | null)[];
  stats: { builds: number; floors: number; completed: number; byClass: Record<BuildingId, number> };
}

export interface DistrictMilestoneReceipt {
  id: string;
  version: "districts-1" | "landmarks-1";
  at: number;
}

export interface LandmarkSlotState {
  claimed: boolean;
  placed: boolean;
  claimedAt: number | null;
}

export interface CityEvolutionState {
  currentStage: CityEvolutionStageId;
  highestStage: CityEvolutionStageId;
  notifiedStage: CityEvolutionStageId;
}

export interface DistrictsState {
  version: 1;
  activeDistrict: DistrictId;
  unlockedDistricts: DistrictId[];
  completedDistricts: DistrictId[];
  downtown: DistrictLotState;
  harbor: DistrictLotState;
  landmarks: Record<LandmarkId, LandmarkSlotState>;
  receipts: DistrictMilestoneReceipt[];
  evolution: CityEvolutionState;
}

export interface DistrictGoalEvaluation {
  districtId: DistrictId;
  met: boolean;
  completedPreviously: boolean;
  completedTowers: { current: number; target: number; met: boolean };
  requiredClasses: { current: BuildingId[]; missing: BuildingId[]; target: number; met: boolean };
  population: { current: number; target: number; met: boolean };
  topRatedTowers: { current: number; target: number; met: boolean };
}

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const integer = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;
const validItemId = (id: unknown): id is string => typeof id === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(id);
const validReceiptId = (id: unknown): id is string => typeof id === "string" && /^[a-zA-Z0-9_:.-]{1,80}$/.test(id);

export function isDistrictId(value: unknown): value is DistrictId {
  return typeof value === "string" && (DISTRICT_IDS as readonly string[]).includes(value);
}

export function isLandmarkId(value: unknown): value is LandmarkId {
  return typeof value === "string" && (LANDMARK_IDS as readonly string[]).includes(value);
}

export function isCityEvolutionStageId(value: unknown): value is CityEvolutionStageId {
  return typeof value === "string" && (CITY_EVOLUTION_STAGE_IDS as readonly string[]).includes(value);
}

export function districtDefinition(districtId: DistrictId): DistrictDefinition {
  const found = DISTRICT_CATALOG.find((d) => d.id === districtId);
  if (!found) throw new Error(`Unknown district: ${districtId}`);
  return found;
}

export function stageRank(stageId: CityEvolutionStageId): number {
  const stage = CITY_EVOLUTION_STAGES.find((s) => s.id === stageId);
  return stage ? stage.rank : 0;
}

export function deriveEvolutionStage(population: number): CityEvolutionStageDefinition {
  const safePop = Number.isFinite(population) && population > 0 ? Math.floor(population) : 0;
  for (let i = CITY_EVOLUTION_STAGES.length - 1; i >= 0; i--) {
    if (safePop >= CITY_EVOLUTION_STAGES[i].minPopulation) return CITY_EVOLUTION_STAGES[i];
  }
  return CITY_EVOLUTION_STAGES[0];
}

export function validateDistrictCatalog(
  catalog: readonly DistrictDefinition[] = DISTRICT_CATALOG,
  stages: readonly CityEvolutionStageDefinition[] = CITY_EVOLUTION_STAGES,
): void {
  if (!Array.isArray(catalog) || catalog.length !== 2 || new Set(catalog.map((d) => d?.id)).size !== catalog.length) {
    throw new Error("Invalid district catalog");
  }
  for (const d of catalog) {
    if (
      !d ||
      !isDistrictId(d.id) ||
      d.version !== "districts-1" ||
      d.gridWidth !== 5 ||
      d.gridHeight !== 5 ||
      d.lotCount !== 25 ||
      typeof d.backgroundAsset !== "string" ||
      !d.backgroundAsset.endsWith(".png") ||
      typeof d.thumbnailAsset !== "string" ||
      !d.thumbnailAsset.endsWith(".png") ||
      (d.unlockRequiresDistrictId !== null && !isDistrictId(d.unlockRequiresDistrictId)) ||
      !d.goal ||
      !integer(d.goal.completedTowers, 25) ||
      d.goal.completedTowers < 1 ||
      !Array.isArray(d.goal.requiredClasses) ||
      d.goal.requiredClasses.some((c: unknown) => !isBuildingId(c)) ||
      !integer(d.goal.population, 1000000) ||
      d.goal.population < 1 ||
      !integer(d.goal.topRatedTowers, 25) ||
      !d.title?.en ||
      !d.title?.vi
    ) {
      throw new Error("Invalid district definition");
    }
    if (d.landmark !== null) {
      const lm = d.landmark;
      if (
        !lm ||
        !isLandmarkId(lm.id) ||
        lm.version !== "landmarks-1" ||
        lm.districtId !== d.id ||
        typeof lm.asset !== "string" ||
        !lm.asset.endsWith(".png") ||
        !lm.anchor ||
        lm.anchor.width !== 256 ||
        lm.anchor.height !== 384 ||
        !lm.title?.en ||
        !lm.title?.vi
      ) {
        throw new Error("Invalid landmark definition");
      }
    }
  }
  if (!Array.isArray(stages) || stages.length !== 6) throw new Error("Invalid city evolution stages");
  for (let i = 0; i < stages.length; i++) {
    const st = stages[i];
    if (!st || !isCityEvolutionStageId(st.id) || st.rank !== i || !integer(st.minPopulation) || !st.title?.en || !st.title?.vi) {
      throw new Error("Invalid city evolution stage definition");
    }
  }
}

export function emptyDistrictLotState(): DistrictLotState {
  return {
    lots: Array.from({ length: 25 }, () => null),
    stats: { builds: 0, floors: 0, completed: 0, byClass: { residential: 0, industrial: 0, office: 0, highrise: 0 } },
  };
}

export function emptyDistricts(downtown: DistrictLotState = emptyDistrictLotState()): DistrictsState {
  return {
    version: 1,
    activeDistrict: "downtown",
    unlockedDistricts: ["downtown"],
    completedDistricts: [],
    downtown: copy(downtown),
    harbor: emptyDistrictLotState(),
    landmarks: {
      dock_clock_tower: { claimed: false, placed: false, claimedAt: null },
    },
    receipts: [],
    evolution: {
      currentStage: "village",
      highestStage: "village",
      notifiedStage: "village",
    },
  };
}

export function evaluateDistrictLotGoal(
  districtId: DistrictId,
  lotState: DistrictLotState,
  completedPreviously = false,
): DistrictGoalEvaluation {
  const def = districtDefinition(districtId);
  const completedTowersCurrent = lotState.lots.filter((l): l is CityBuilding => l !== null && l.complete).length;
  const presentClasses = BUILDING_IDS.filter((id) =>
    lotState.lots.some((l) => l !== null && l.complete && l.classId === id),
  );
  const missingClasses = def.goal.requiredClasses.filter((id) => !presentClasses.includes(id));
  const populationCurrent = lotState.lots.reduce((sum, lot) => sum + (lot?.population ?? 0), 0);
  const topRatedCurrent = lotState.lots.filter(
    (l): l is CityBuilding => l !== null && (l.rating === "A" || l.rating === "S"),
  ).length;

  const completedTowersMet = completedTowersCurrent >= def.goal.completedTowers;
  const requiredClassesMet = missingClasses.length === 0;
  const populationMet = populationCurrent >= def.goal.population;
  const topRatedMet = topRatedCurrent >= def.goal.topRatedTowers;
  const met = completedTowersMet && requiredClassesMet && populationMet && topRatedMet;

  return {
    districtId,
    met,
    completedPreviously: completedPreviously || met,
    completedTowers: { current: completedTowersCurrent, target: def.goal.completedTowers, met: completedTowersMet },
    requiredClasses: {
      current: presentClasses,
      missing: missingClasses,
      target: def.goal.requiredClasses.length,
      met: requiredClassesMet,
    },
    population: { current: populationCurrent, target: def.goal.population, met: populationMet },
    topRatedTowers: { current: topRatedCurrent, target: def.goal.topRatedTowers, met: topRatedMet },
  };
}

export function districtGoalProgress(save: GameSave, districtId: DistrictId): DistrictGoalEvaluation {
  const state = districtId === "harbor" ? save.districts.harbor : save.districts.downtown;
  return evaluateDistrictLotGoal(districtId, state, save.districts.completedDistricts.includes(districtId));
}

export function districtPopulation(save: GameSave, districtId: DistrictId): number {
  const state = districtId === "harbor" ? save.districts.harbor : save.districts.downtown;
  return state.lots.reduce((sum, lot) => sum + (lot?.population ?? 0), 0);
}

export function totalCityPopulation(save: GameSave): number {
  return save.districts.unlockedDistricts.reduce((sum, id) => sum + districtPopulation(save, id), 0);
}

function addReceiptOnce(
  receipts: DistrictMilestoneReceipt[],
  id: string,
  version: "districts-1" | "landmarks-1",
  at: number,
): DistrictMilestoneReceipt[] {
  if (receipts.some((r) => r.id === id)) return receipts;
  return [...receipts, { id, version, at }];
}

export function reconcileDistrictsState(
  city: CitySave,
  districts: DistrictsState,
  at = 0,
): { city: CitySave; districts: DistrictsState } {
  const nextCity = copy(city);
  const nextDistricts = copy(districts);

  // Keep city.lots/stats and districts.downtown synchronized.
  const cityHasData = nextCity.stats.builds > 0 || nextCity.lots.some((l) => l !== null);
  const downtownHasData = nextDistricts.downtown.stats.builds > 0 || nextDistricts.downtown.lots.some((l) => l !== null);
  if (cityHasData && !downtownHasData) {
    nextDistricts.downtown = { lots: copy(nextCity.lots), stats: copy(nextCity.stats) };
  } else {
    nextCity.lots = copy(nextDistricts.downtown.lots);
    nextCity.stats = copy(nextDistricts.downtown.stats);
  }
  if (nextCity.pending && !nextCity.pending.districtId) {
    nextCity.pending.districtId = "downtown";
  }

  const safeAt = integer(at) ? at : 0;

  const downtownEval = evaluateDistrictLotGoal(
    "downtown",
    nextDistricts.downtown,
    nextDistricts.completedDistricts.includes("downtown"),
  );
  if (downtownEval.met && !nextDistricts.completedDistricts.includes("downtown")) {
    nextDistricts.completedDistricts.push("downtown");
  }
  if (nextDistricts.completedDistricts.includes("downtown")) {
    nextDistricts.receipts = addReceiptOnce(nextDistricts.receipts, "district-complete:downtown", "districts-1", safeAt);
    if (!nextDistricts.unlockedDistricts.includes("harbor")) {
      nextDistricts.unlockedDistricts.push("harbor");
    }
    nextDistricts.receipts = addReceiptOnce(nextDistricts.receipts, "district-unlock:harbor", "districts-1", safeAt);
  }

  if (nextDistricts.unlockedDistricts.includes("harbor")) {
    const harborEval = evaluateDistrictLotGoal(
      "harbor",
      nextDistricts.harbor,
      nextDistricts.completedDistricts.includes("harbor"),
    );
    if (harborEval.met && !nextDistricts.completedDistricts.includes("harbor")) {
      nextDistricts.completedDistricts.push("harbor");
    }
    if (nextDistricts.completedDistricts.includes("harbor")) {
      nextDistricts.receipts = addReceiptOnce(nextDistricts.receipts, "district-complete:harbor", "districts-1", safeAt);
    }
  }

  const totalPop = nextDistricts.unlockedDistricts.reduce((sum, id) => {
    const lotState = id === "harbor" ? nextDistricts.harbor : nextDistricts.downtown;
    return sum + lotState.lots.reduce((s, lot) => s + (lot?.population ?? 0), 0);
  }, 0);
  const currentStage = deriveEvolutionStage(totalPop).id;
  const highestStage =
    stageRank(currentStage) > stageRank(nextDistricts.evolution.highestStage)
      ? currentStage
      : nextDistricts.evolution.highestStage;
  const notifiedStage =
    stageRank(nextDistricts.evolution.notifiedStage) > stageRank(highestStage)
      ? highestStage
      : nextDistricts.evolution.notifiedStage;
  nextDistricts.evolution = { currentStage, highestStage, notifiedStage };

  return { city: nextCity, districts: nextDistricts };
}

function validateDistrictLotState(lotState: unknown, nextRun: number, runIds: Set<string>): DistrictLotState {
  if (!lotState || typeof lotState !== "object") throw new Error("Invalid district lot state; original preserved");
  const d = lotState as DistrictLotState;
  if (
    !Array.isArray(d.lots) ||
    d.lots.length !== 25 ||
    !d.stats ||
    !integer(d.stats.builds) ||
    !integer(d.stats.floors) ||
    !integer(d.stats.completed) ||
    !d.stats.byClass ||
    BUILDING_IDS.some((id) => !integer(d.stats.byClass[id]))
  ) {
    throw new Error("Invalid district bounds; original preserved");
  }
  d.lots.forEach((lot) => {
    if (lot === null) return;
    if (
      !lot ||
      !isBuildingId(lot.classId) ||
      !/^city-[1-9]\d*$/.test(lot.runId) ||
      Number(lot.runId.slice(5)) >= nextRun ||
      runIds.has(lot.runId) ||
      !integer(lot.floors, BUILDINGS[lot.classId].floors) ||
      lot.floors < 1 ||
      !integer(lot.population, 1000000) ||
      typeof lot.roof !== "boolean" ||
      typeof lot.complete !== "boolean" ||
      lot.complete !== (lot.floors === BUILDINGS[lot.classId].floors) ||
      (lot.roof && !lot.complete) ||
      !Number.isFinite(lot.accuracy) ||
      lot.accuracy < 0 ||
      lot.accuracy > 100 ||
      !["S", "A", "B", "C", "D"].includes(lot.rating) ||
      !validItemId(lot.skin) ||
      (lot.roofSkin !== undefined && !validItemId(lot.roofSkin))
    ) {
      throw new Error("Invalid district building; original preserved");
    }
    validateRunEquipment({ building: lot.skin, roof: lot.roofSkin ?? "default", crane: "default" }, lot.classId);
    runIds.add(lot.runId);
  });
  return copy(d);
}

export function normalizeDistricts(
  value: unknown,
  city: CitySave,
  at = 0,
): { city: CitySave; districts: DistrictsState } {
  validateDistrictCatalog();
  if (value === undefined) {
    const initial = emptyDistricts({ lots: copy(city.lots), stats: copy(city.stats) });
    const reconciled = reconcileDistrictsState(city, initial, at);
    reconciled.districts.evolution.notifiedStage = reconciled.districts.evolution.highestStage;
    return reconciled;
  }
  if (!value || typeof value !== "object") throw new Error("Invalid districts state; original preserved");
  const d = value as DistrictsState;
  if (
    d.version !== 1 ||
    !isDistrictId(d.activeDistrict) ||
    !Array.isArray(d.unlockedDistricts) ||
    !d.unlockedDistricts.includes("downtown") ||
    d.unlockedDistricts.some((id) => !isDistrictId(id)) ||
    new Set(d.unlockedDistricts).size !== d.unlockedDistricts.length ||
    !d.unlockedDistricts.includes(d.activeDistrict) ||
    !Array.isArray(d.completedDistricts) ||
    d.completedDistricts.some((id) => !isDistrictId(id) || !d.unlockedDistricts.includes(id)) ||
    new Set(d.completedDistricts).size !== d.completedDistricts.length ||
    (d.unlockedDistricts.includes("harbor") && !d.completedDistricts.includes("downtown"))
  ) {
    throw new Error("Invalid districts unlock state; original preserved");
  }

  const runIds = new Set<string>();
  let downtown = validateDistrictLotState(d.downtown, city.nextRun, runIds);
  const harbor = validateDistrictLotState(d.harbor, city.nextRun, new Set<string>(runIds));
  for (const lot of harbor.lots) {
    if (lot) {
      if (runIds.has(lot.runId)) throw new Error("Duplicate runId across districts; original preserved");
      runIds.add(lot.runId);
    }
  }
  if (!d.unlockedDistricts.includes("harbor") && (harbor.stats.builds > 0 || harbor.lots.some((l) => l !== null))) {
    throw new Error("Locked harbor cannot contain buildings; original preserved");
  }

  // If caller mutated save.city directly while leaving save.districts.downtown empty, sync from city.
  const cityEmpty = city.stats.builds === 0 && city.lots.every((l) => l === null);
  const downtownEmpty = downtown.stats.builds === 0 && downtown.lots.every((l) => l === null);
  if (!cityEmpty && downtownEmpty) {
    downtown = { lots: copy(city.lots), stats: copy(city.stats) };
  } else if (
    !cityEmpty &&
    !downtownEmpty &&
    (JSON.stringify(city.lots) !== JSON.stringify(downtown.lots) ||
      JSON.stringify(city.stats) !== JSON.stringify(downtown.stats))
  ) {
    // Prefer city whensave.city was updated directly via legacy CitySave helpers
    downtown = { lots: copy(city.lots), stats: copy(city.stats) };
  }

  if (!d.landmarks || typeof d.landmarks !== "object" || !d.landmarks.dock_clock_tower) {
    throw new Error("Invalid district landmarks; original preserved");
  }
  const lm = d.landmarks.dock_clock_tower;
  if (
    typeof lm.claimed !== "boolean" ||
    typeof lm.placed !== "boolean" ||
    (!lm.claimed && (lm.placed || lm.claimedAt !== null)) ||
    (lm.claimed && (!integer(lm.claimedAt) || !d.completedDistricts.includes("harbor")))
  ) {
    throw new Error("Invalid landmark state; original preserved");
  }

  if (
    !Array.isArray(d.receipts) ||
    d.receipts.length > 32 ||
    new Set(d.receipts.map((r) => r?.id)).size !== d.receipts.length ||
    d.receipts.some(
      (r) =>
        !r ||
        !validReceiptId(r.id) ||
        !["districts-1", "landmarks-1"].includes(r.version) ||
        !integer(r.at),
    )
  ) {
    throw new Error("Invalid district receipts; original preserved");
  }

  if (
    !d.evolution ||
    !isCityEvolutionStageId(d.evolution.currentStage) ||
    !isCityEvolutionStageId(d.evolution.highestStage) ||
    !isCityEvolutionStageId(d.evolution.notifiedStage) ||
    stageRank(d.evolution.highestStage) < stageRank(d.evolution.currentStage) ||
    stageRank(d.evolution.highestStage) < stageRank(d.evolution.notifiedStage)
  ) {
    throw new Error("Invalid city evolution state; original preserved");
  }

  const normalized: DistrictsState = {
    version: 1,
    activeDistrict: d.activeDistrict,
    unlockedDistricts: [...d.unlockedDistricts],
    completedDistricts: [...d.completedDistricts],
    downtown,
    harbor,
    landmarks: {
      dock_clock_tower: { claimed: lm.claimed, placed: lm.placed, claimedAt: lm.claimedAt },
    },
    receipts: copy(d.receipts),
    evolution: copy(d.evolution),
  };

  return reconcileDistrictsState(city, normalized, at);
}

export function districtPlacementStatus(
  save: GameSave,
  districtId: DistrictId,
  lot: number,
  classId: BuildingId,
): { valid: boolean; locked: boolean; districtLocked: boolean; missing: BuildingId[] } {
  const districtLocked = !save.districts.unlockedDistricts.includes(districtId);
  const lotState = districtId === "harbor" ? save.districts.harbor : save.districts.downtown;
  const neighbors = adjacentLots(lot).map((index) => lotState.lots[index]?.classId);
  const missing = BUILDINGS[classId].requires.filter((id) => !neighbors.includes(id));
  const locked = !save.city.unlocked.includes(classId);
  return {
    valid: !districtLocked && Number.isInteger(lot) && lot >= 0 && lot < 25 && !locked && missing.length === 0,
    locked,
    districtLocked,
    missing,
  };
}

export function selectDistrict(save: GameSave, districtId: DistrictId): GameSave {
  if (!isDistrictId(districtId)) throw new Error("Unknown district");
  if (!save.districts.unlockedDistricts.includes(districtId)) throw new Error("District is locked");
  if (save.districts.activeDistrict === districtId) return save;
  return {
    ...save,
    districts: {
      ...save.districts,
      activeDistrict: districtId,
    },
  };
}

export function beginDistrictTower(
  save: GameSave,
  districtId: DistrictId,
  lot: number,
  classId: BuildingId,
  seed: number,
  startedAt: number,
  equipment: RunEquipment = equipmentFor(save, classId),
): GameSave {
  if (!isDistrictId(districtId)) throw new Error("Unknown district");
  if (!save.districts.unlockedDistricts.includes(districtId)) throw new Error("District is locked");
  if (save.city.pending) throw new Error("Finish or cancel the pending tower first");
  const status = districtPlacementStatus(save, districtId, lot, classId);
  if (!status.valid) throw new Error("Invalid city placement");

  const allocated = allocateRun(save, startedAt);
  const next = copy(allocated.save);
  const validEquip = validateRunEquipment(equipment ?? { ...DEFAULT_EQUIPMENT }, classId);
  const game = new QuickTowerGame({ seed, mode: "city", assist: false, building: classId });
  const runId = `city-${next.city.nextRun++}`;

  next.city.pending = {
    runId,
    districtId,
    lot,
    classId,
    checkpoint: checkpointTower(game),
    equipment: validEquip,
  };
  next.tracking.pendingCity = {
    ...allocated.context,
    equipment: validEquip,
    cityRunId: runId,
  };
  return next;
}

export function demolishDistrictBuilding(
  save: GameSave,
  districtId: DistrictId,
  lot: number,
  at = 0,
): GameSave {
  if (!isDistrictId(districtId)) throw new Error("Unknown district");
  if (!save.districts.unlockedDistricts.includes(districtId)) throw new Error("District is locked");
  if (save.city.pending) throw new Error("Finish or cancel the pending tower before demolition");
  if (!Number.isInteger(lot) || lot < 0 || lot >= 25) throw new Error("Invalid lot");

  const next = copy(save);
  if (districtId === "harbor") {
    next.districts.harbor.lots[lot] = null;
  } else {
    next.districts.downtown.lots[lot] = null;
    next.city.lots[lot] = null;
  }
  const reconciled = reconcileDistrictsState(next.city, next.districts, at);
  return { ...next, city: reconciled.city, districts: reconciled.districts };
}

export function claimDistrictLandmark(
  save: GameSave,
  landmarkId: LandmarkId,
  at: number,
): GameSave {
  validateDistrictCatalog();
  if (!isLandmarkId(landmarkId)) throw new Error("Unknown landmark");
  if (!integer(at)) throw new Error("Invalid landmark claim timestamp");
  const lmDef = DOCK_CLOCK_TOWER_LANDMARK;
  if (!save.districts.completedDistricts.includes(lmDef.districtId)) {
    throw new Error("Complete the Harbor district goal before claiming its landmark");
  }
  if (
    save.districts.landmarks[landmarkId].claimed ||
    save.districts.receipts.some((r) => r.id === `landmark-claim:${landmarkId}`)
  ) {
    return save;
  }
  const next = copy(save);
  next.districts.landmarks[landmarkId] = {
    claimed: true,
    placed: true,
    claimedAt: at,
  };
  next.districts.receipts = addReceiptOnce(
    next.districts.receipts,
    `landmark-claim:${landmarkId}`,
    "landmarks-1",
    at,
  );
  return next;
}

export function setLandmarkPlaced(save: GameSave, landmarkId: LandmarkId, placed: boolean): GameSave {
  if (!isLandmarkId(landmarkId)) throw new Error("Unknown landmark");
  const current = save.districts.landmarks[landmarkId];
  if (!current.claimed) throw new Error("Landmark must be claimed before placement");
  if (current.placed === placed) return save;
  const next = copy(save);
  next.districts.landmarks[landmarkId].placed = placed;
  return next;
}

export function acknowledgeEvolutionStage(save: GameSave): GameSave {
  if (save.districts.evolution.notifiedStage === save.districts.evolution.highestStage) return save;
  return {
    ...save,
    districts: {
      ...save.districts,
      evolution: {
        ...save.districts.evolution,
        notifiedStage: save.districts.evolution.highestStage,
      },
    },
  };
}
