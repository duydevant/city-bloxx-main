import { BUILDINGS, isBuildingId, type BuildingId } from "./buildings";
import { deriveEvolutionStage, totalCityPopulation, type CityEvolutionStageId as EvolutionStageId, type DistrictId, type LandmarkId } from "./districts";
import { isDistrictId, isEvolutionStageId, isLandmarkId } from "../../city-bloxx-content/districts";
import type { GameSave } from "./save-state";

export const HALL_OF_FAME_LIMIT = 5;
export const SKYLINE_ALBUM_LIMIT = 3;

export interface SkylineLotSnapshot {
  classId: BuildingId;
  floors: number;
  population: number;
  rating: "S" | "A" | "B" | "C" | "D";
  roof: boolean;
  skin: string;
  roofSkin: string;
}

export interface SkylineSnapshot {
  slot: 0 | 1 | 2;
  districtId: DistrictId;
  capturedAt: number;
  population: number;
  evolutionStage: EvolutionStageId;
  landmarkId: LandmarkId | null;
  lots: (SkylineLotSnapshot | null)[];
}

export type SkylineAlbumState = [SkylineSnapshot | null, SkylineSnapshot | null, SkylineSnapshot | null];

export function emptyAlbum(): SkylineAlbumState {
  return [null, null, null];
}

const integer = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const skinTag = (n: unknown): n is string =>
  typeof n === "string" &&
  /^[a-zA-Z0-9_.-]{1,64}$/.test(n) &&
  !/^data:/i.test(n);

function validAlbumLot(lot: unknown): lot is SkylineLotSnapshot {
  if (!lot || typeof lot !== "object") return false;
  const l = lot as SkylineLotSnapshot;
  return (
    isBuildingId(l.classId) &&
    integer(l.floors) &&
    l.floors >= 1 &&
    l.floors <= BUILDINGS[l.classId].floors &&
    integer(l.population) &&
    l.population >= 1 &&
    ["S", "A", "B", "C", "D"].includes(l.rating) &&
    typeof l.roof === "boolean" &&
    skinTag(l.skin) &&
    skinTag(l.roofSkin)
  );
}

export function validateAlbumState(value: unknown): SkylineAlbumState {
  if (value === undefined) return emptyAlbum();
  if (!Array.isArray(value) || value.length !== SKYLINE_ALBUM_LIMIT) {
    throw new Error("Invalid Skyline Album state; original save preserved");
  }
  const result: SkylineAlbumState = [null, null, null];
  for (let i = 0; i < SKYLINE_ALBUM_LIMIT; i++) {
    const entry = value[i];
    if (entry === null) {
      result[i] = null;
      continue;
    }
    if (!entry || typeof entry !== "object") {
      throw new Error("Invalid Skyline Album slot; original save preserved");
    }
    const s = entry as SkylineSnapshot;
    if (
      s.slot !== i ||
      !isDistrictId(s.districtId) ||
      !integer(s.capturedAt) ||
      !integer(s.population) ||
      !isEvolutionStageId(s.evolutionStage) ||
      (s.landmarkId !== null && !isLandmarkId(s.landmarkId)) ||
      !Array.isArray(s.lots) ||
      s.lots.length !== 25 ||
      !s.lots.every(lot => lot === null || validAlbumLot(lot))
    ) {
      throw new Error("Invalid Skyline Album snapshot; original save preserved");
    }
    const sumPop = s.lots.reduce((sum, lot) => sum + (lot ? lot.population : 0), 0);
    if (s.population !== sumPop) {
      throw new Error("Skyline Album population mismatch; original save preserved");
    }
    result[i] = {
      slot: i as 0 | 1 | 2,
      districtId: s.districtId,
      capturedAt: s.capturedAt,
      population: s.population,
      evolutionStage: s.evolutionStage,
      landmarkId: s.landmarkId,
      lots: s.lots.map(lot => (lot ? { ...lot } : null)),
    };
  }
  return result;
}

export function captureSkylineSnapshot(
  save: GameSave,
  slot: 0 | 1 | 2,
  capturedAt: number,
  districtId: DistrictId = save.districts.activeDistrict,
): GameSave {
  if (![0, 1, 2].includes(slot) || !integer(capturedAt) || !isDistrictId(districtId)) {
    throw new Error("Invalid Skyline Album capture bounds");
  }
  const districtState = districtId === "harbor" ? save.districts.harbor : save.districts.downtown;
  const lots: (SkylineLotSnapshot | null)[] = districtState.lots.map(lot =>
    lot
      ? {
          classId: lot.classId,
          floors: lot.floors,
          population: lot.population,
          rating: lot.rating,
          roof: lot.roof,
          skin: lot.skin ?? "default",
          roofSkin: lot.roofSkin ?? "default",
        }
      : null,
  );
  const population = lots.reduce((sum, lot) => sum + (lot ? lot.population : 0), 0);
  const evolutionStage = deriveEvolutionStage(totalCityPopulation(save)).id;
  const landmarkId: LandmarkId | null =
    districtId === "harbor" && save.districts.landmarks.dock_clock_tower.placed
      ? "dock_clock_tower"
      : null;
  const nextAlbum: SkylineAlbumState = [...save.album] as SkylineAlbumState;
  nextAlbum[slot] = {
    slot,
    districtId,
    capturedAt,
    population,
    evolutionStage,
    landmarkId,
    lots,
  };
  return { ...save, album: nextAlbum };
}

export function deleteSkylineSnapshot(save: GameSave, slot: 0 | 1 | 2): GameSave {
  if (![0, 1, 2].includes(slot)) throw new Error("Invalid Skyline Album slot");
  const nextAlbum: SkylineAlbumState = [...save.album] as SkylineAlbumState;
  nextAlbum[slot] = null;
  return { ...save, album: nextAlbum };
}
