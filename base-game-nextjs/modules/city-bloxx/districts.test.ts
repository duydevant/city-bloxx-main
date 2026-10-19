import { describe, expect, it } from "vitest";
import {
  acceptTrackedCity,
  acknowledgeEvolutionStage,
  beginCityTower,
  beginDistrictTower,
  BUILDING_IDS,
  BUILDINGS,
  CITY_EVOLUTION_STAGES,
  claimDistrictLandmark,
  demolishDistrictBuilding,
  deriveEvolutionStage,
  DISTRICT_CATALOG,
  districtGoalProgress,
  districtPlacementStatus,
  districtPopulation,
  DOCK_CLOCK_TOWER_LANDMARK,
  emptyCity,
  emptySave,
  initializeTracking,
  migrateSave,
  reconcileDistrictsState,
  restoreTower,
  selectDistrict,
  setLandmarkPlaced,
  totalCityPopulation,
  updateCityCheckpoint,
  validateDistrictCatalog,
  type BuildingId,
  type CityBuilding,
  type GameSave,
} from "../../../packages/city-bloxx-core/src/index";
import { placeAccurately } from "./test-simulation";

function makeBuilding(
  runId: string,
  classId: BuildingId,
  population: number,
  rating: CityBuilding["rating"] = "A",
  complete = true,
): CityBuilding {
  return {
    runId,
    classId,
    skin: "default",
    roofSkin: "default",
    floors: complete ? BUILDINGS[classId].floors : Math.max(1, BUILDINGS[classId].floors - 1),
    population,
    roof: complete,
    complete,
    accuracy: rating === "S" ? 98 : rating === "A" ? 90 : 75,
    rating,
  };
}

function populateDowntownForGoal(
  save: GameSave,
  options: {
    count?: number;
    classes?: BuildingId[];
    totalPopulation?: number;
    topRatedCount?: number;
  } = {},
): GameSave {
  const count = options.count ?? 12;
  const classes = options.classes ?? ["residential", "industrial", "office", "highrise"];
  const totalPopulation = options.totalPopulation ?? 8000;
  const topRatedCount = options.topRatedCount ?? 3;

  const next: GameSave = JSON.parse(JSON.stringify(save));
  next.city.unlocked = [...BUILDING_IDS];
  next.city.lots = Array.from({ length: 25 }, () => null);
  const basePop = count > 0 ? Math.floor(totalPopulation / count) : 0;
  const remainder = count > 0 ? totalPopulation - basePop * count : 0;

  for (let i = 0; i < count; i++) {
    const classId = classes[i % classes.length];
    const pop = basePop + (i === 0 ? remainder : 0);
    const rating: CityBuilding["rating"] = i < topRatedCount ? (i === 0 ? "S" : "A") : "B";
    const runId = `city-${next.city.nextRun++}`;
    next.city.lots[i] = makeBuilding(runId, classId, pop, rating, true);
    next.city.stats.builds++;
    next.city.stats.completed++;
    next.city.stats.floors += BUILDINGS[classId].floors;
    next.city.stats.byClass[classId]++;
  }
  next.districts.downtown = {
    lots: JSON.parse(JSON.stringify(next.city.lots)),
    stats: JSON.parse(JSON.stringify(next.city.stats)),
  };
  const reconciled = reconcileDistrictsState(next.city, next.districts, 1000);
  next.city = reconciled.city;
  next.districts = reconciled.districts;
  return next;
}

function populateHarborForGoal(
  save: GameSave,
  options: {
    count?: number;
    totalPopulation?: number;
    topRatedCount?: number;
  } = {},
): GameSave {
  const count = options.count ?? 16;
  const totalPopulation = options.totalPopulation ?? 12000;
  const topRatedCount = options.topRatedCount ?? 5;

  const next: GameSave = JSON.parse(JSON.stringify(save));
  next.districts.harbor.lots = Array.from({ length: 25 }, () => null);
  const basePop = count > 0 ? Math.floor(totalPopulation / count) : 0;
  const remainder = count > 0 ? totalPopulation - basePop * count : 0;

  for (let i = 0; i < count; i++) {
    const classId = BUILDING_IDS[i % BUILDING_IDS.length];
    const pop = basePop + (i === 0 ? remainder : 0);
    const rating: CityBuilding["rating"] = i < topRatedCount ? "A" : "B";
    const runId = `city-${next.city.nextRun++}`;
    next.districts.harbor.lots[i] = makeBuilding(runId, classId, pop, rating, true);
    next.districts.harbor.stats.builds++;
    next.districts.harbor.stats.completed++;
    next.districts.harbor.stats.floors += BUILDINGS[classId].floors;
    next.districts.harbor.stats.byClass[classId]++;
  }
  const reconciled = reconcileDistrictsState(next.city, next.districts, 2000);
  next.city = reconciled.city;
  next.districts = reconciled.districts;
  return next;
}

function finishPendingCityRun(save: GameSave): GameSave {
  const pending = save.city.pending!;
  const game = restoreTower(pending.checkpoint);
  for (let floor = 0; floor < BUILDINGS[pending.classId].floors; floor++) {
    placeAccurately(game, 0.02);
  }
  placeAccurately(game, 0.02); // roof
  expect(game.getPhase()).toBe("ended");
  return {
    ...save,
    city: updateCityCheckpoint(save.city, game),
  };
}

describe("C5 Districts, Landmarks, and City Evolution", () => {
  it("validates the versioned district catalog, Dock Clock Tower landmark, and evolution stages", () => {
    validateDistrictCatalog();
    expect(DISTRICT_CATALOG).toHaveLength(2);
    expect(DISTRICT_CATALOG[0].id).toBe("downtown");
    expect(DISTRICT_CATALOG[1].id).toBe("harbor");
    expect(DISTRICT_CATALOG[1].unlockRequiresDistrictId).toBe("downtown");
    expect(DISTRICT_CATALOG[1].landmark).toEqual(DOCK_CLOCK_TOWER_LANDMARK);
    expect(CITY_EVOLUTION_STAGES.map((s) => s.id)).toEqual([
      "village",
      "town",
      "city",
      "metro",
      "metropolis",
      "megacity",
    ]);
  });

  it("migrates schema 3 and 4 saves to schema 5, preserving lot IDs, scores, population, and legacy pending", () => {
    const legacyCity = emptyCity();
    legacyCity.unlocked = ["residential", "industrial"];
    legacyCity.nextRun = 2;
    legacyCity.lots[7] = makeBuilding("city-1", "residential", 640, "A", true);
    legacyCity.stats.builds = 1;
    legacyCity.stats.completed = 1;
    legacyCity.stats.floors = 10;
    legacyCity.stats.byClass.residential = 1;

    const withPending = beginCityTower(legacyCity, 12, "industrial", 42);
    // Simulate a legacy schema 3/4 pending tower without districtId
    delete (withPending.pending as { districtId?: string }).districtId;

    const migrated3 = migrateSave({
      schema: 3,
      standardQuickBest: 320,
      assistQuickBest: 120,
      runs: 4,
      city: withPending,
    });
    expect(migrated3.schema).toBe(5);
    expect(migrated3.districts.activeDistrict).toBe("downtown");
    expect(migrated3.districts.downtown.lots[7]).toEqual(legacyCity.lots[7]);
    expect(migrated3.city.pending?.districtId).toBe("downtown");
    expect(migrated3.city.pending?.runId).toBe("city-2");
    expect(migrated3.city.pending?.checkpoint).toEqual(withPending.pending?.checkpoint);
    expect(districtPopulation(migrated3, "downtown")).toBe(640);
    expect(migrated3.districts.evolution.currentStage).toBe("town");

    const schema4 = {
      ...emptySave(),
      schema: 4,
      city: withPending,
      districts: undefined,
    };
    schema4.tracking.installationId = "c4-install";
    schema4.tracking.nextSequence = 2;
    schema4.tracking.pendingCity = {
      identity: { id: "c4-install:1", installationId: "c4-install", sequence: 1 },
      startedAt: 500,
      cityRunId: "city-2",
    };
    const migrated4 = migrateSave(schema4);
    expect(migrated4.schema).toBe(5);
    expect(migrated4.districts.downtown.lots[7]).toEqual(legacyCity.lots[7]);
    expect(migrated4.city.pending?.districtId).toBe("downtown");
    expect(migrated4.city.pending?.checkpoint).toEqual(withPending.pending?.checkpoint);

    expect(() => migrateSave({ ...emptySave(), schema: 6 as 5 })).toThrow("Unknown save schema");
  });

  it("enforces exact boundary goals for Downtown (11/12 towers, 7999/8000 pop, 2/3 A/S, missing class)", () => {
    const base = initializeTracking(emptySave(), "c5-boundary", 1000);

    const elevenTowers = populateDowntownForGoal(base, { count: 11, totalPopulation: 8500, topRatedCount: 4 });
    expect(districtGoalProgress(elevenTowers, "downtown").met).toBe(false);
    expect(elevenTowers.districts.unlockedDistricts).toEqual(["downtown"]);

    const missingHighrise = populateDowntownForGoal(base, {
      count: 12,
      classes: ["residential", "industrial", "office"],
      totalPopulation: 8500,
      topRatedCount: 4,
    });
    expect(districtGoalProgress(missingHighrise, "downtown").requiredClasses.missing).toEqual(["highrise"]);
    expect(districtGoalProgress(missingHighrise, "downtown").met).toBe(false);
    expect(missingHighrise.districts.unlockedDistricts).toEqual(["downtown"]);

    const lowPop = populateDowntownForGoal(base, { count: 12, totalPopulation: 7999, topRatedCount: 4 });
    expect(districtGoalProgress(lowPop, "downtown").population.current).toBe(7999);
    expect(districtGoalProgress(lowPop, "downtown").met).toBe(false);
    expect(lowPop.districts.unlockedDistricts).toEqual(["downtown"]);

    const lowRatings = populateDowntownForGoal(base, { count: 12, totalPopulation: 8000, topRatedCount: 2 });
    expect(districtGoalProgress(lowRatings, "downtown").topRatedTowers.current).toBe(2);
    expect(districtGoalProgress(lowRatings, "downtown").met).toBe(false);
    expect(lowRatings.districts.unlockedDistricts).toEqual(["downtown"]);

    const exactPass = populateDowntownForGoal(base, { count: 12, totalPopulation: 8000, topRatedCount: 3 });
    const evalPass = districtGoalProgress(exactPass, "downtown");
    expect(evalPass.met).toBe(true);
    expect(exactPass.districts.completedDistricts).toContain("downtown");
    expect(exactPass.districts.unlockedDistricts).toEqual(["downtown", "harbor"]);
    expect(exactPass.districts.receipts.map((r) => r.id)).toEqual([
      "district-complete:downtown",
      "district-unlock:harbor",
    ]);
  });

  it("shares global unlocked classes across districts while keeping adjacency strictly within the target district", () => {
    let save = initializeTracking(emptySave(), "c5-adj", 1000);
    save = populateDowntownForGoal(save, { count: 12, totalPopulation: 8000, topRatedCount: 3 });
    expect(save.city.unlocked).toEqual(["residential", "industrial", "office", "highrise"]);

    // In Downtown, lot 0 is occupied, lot 1 is occupied, etc. Let's check Harbor lot 12:
    // Harbor is empty, so even though Industrial/Office/Highrise are globally unlocked,
    // Harbor lot 12 has no adjacent Residential support in Harbor!
    const harborIndustrial = districtPlacementStatus(save, "harbor", 12, "industrial");
    expect(harborIndustrial.locked).toBe(false);
    expect(harborIndustrial.districtLocked).toBe(false);
    expect(harborIndustrial.missing).toEqual(["residential"]);
    expect(harborIndustrial.valid).toBe(false);

    // Residential has no adjacency requirements and is valid on Harbor lot 7:
    expect(districtPlacementStatus(save, "harbor", 7, "residential").valid).toBe(true);

    // Build a Residential tower on Harbor lot 7:
    save = beginDistrictTower(save, "harbor", 7, "residential", 42, 1100);
    save = finishPendingCityRun(save);
    save = acceptTrackedCity(save, save.city.pending!.runId, 1200);
    expect(save.districts.harbor.lots[7]?.classId).toBe("residential");

    // Now Harbor lot 12 (adjacent to Harbor lot 7) is valid for Industrial, while Harbor lot 0 is not:
    expect(districtPlacementStatus(save, "harbor", 12, "industrial").valid).toBe(true);
    expect(districtPlacementStatus(save, "harbor", 0, "industrial").valid).toBe(false);
  });

  it("commits a pending Downtown result to Downtown even after switching the active UI district to Harbor (and vice versa)", () => {
    let save = initializeTracking(emptySave(), "c5-commit", 1000);
    save = populateDowntownForGoal(save, { count: 12, totalPopulation: 8000, topRatedCount: 3 });

    // Start a tower on Downtown lot 20
    save = beginDistrictTower(save, "downtown", 20, "residential", 55, 1500);
    const downtownRunId = save.city.pending!.runId;
    expect(save.city.pending?.districtId).toBe("downtown");

    // While pending in Downtown, switching to Harbor is allowed for viewing, but starting a second tower is rejected
    save = selectDistrict(save, "harbor");
    expect(save.districts.activeDistrict).toBe("harbor");
    expect(() => beginDistrictTower(save, "harbor", 0, "residential", 77, 1600)).toThrow(
      "Finish or cancel the pending tower first",
    );

    // Finish the Downtown run and accept while activeDistrict is still "harbor"
    save = finishPendingCityRun(save);
    save = acceptTrackedCity(save, downtownRunId, 1700);
    expect(save.districts.downtown.lots[20]?.runId).toBe(downtownRunId);
    expect(save.city.lots[20]?.runId).toBe(downtownRunId);
    expect(save.districts.harbor.lots[20]).toBeNull();

    // Now start a tower on Harbor lot 4, switch activeDistrict back to Downtown, and accept
    save = beginDistrictTower(save, "harbor", 4, "residential", 88, 1800);
    const harborRunId = save.city.pending!.runId;
    expect(save.city.pending?.districtId).toBe("harbor");
    save = selectDistrict(save, "downtown");
    expect(save.districts.activeDistrict).toBe("downtown");
    save = finishPendingCityRun(save);
    save = acceptTrackedCity(save, harborRunId, 1900);
    expect(save.districts.harbor.lots[4]?.runId).toBe(harborRunId);
    expect(save.districts.downtown.lots[4]?.runId).not.toBe(harborRunId);
  });

  it("enforces Harbor boundary goals, keeps unlock/completion one-way on demolish, and claims Dock Clock Tower once", () => {
    let save = initializeTracking(emptySave(), "c5-harbor", 1000);
    save = populateDowntownForGoal(save, { count: 12, totalPopulation: 8000, topRatedCount: 3 });
    expect(() => claimDistrictLandmark(save, "dock_clock_tower", 1500)).toThrow("Complete the Harbor district goal");

    // Harbor boundary failures: 15/16 towers, 11999/12000 pop, 4/5 A/S
    expect(
      districtGoalProgress(populateHarborForGoal(save, { count: 15, totalPopulation: 12500, topRatedCount: 6 }), "harbor")
        .met,
    ).toBe(false);
    expect(
      districtGoalProgress(populateHarborForGoal(save, { count: 16, totalPopulation: 11999, topRatedCount: 6 }), "harbor")
        .met,
    ).toBe(false);
    expect(
      districtGoalProgress(populateHarborForGoal(save, { count: 16, totalPopulation: 12000, topRatedCount: 4 }), "harbor")
        .met,
    ).toBe(false);

    // Exact Harbor completion: 16 towers, 12000 pop, 5 A/S
    save = populateHarborForGoal(save, { count: 16, totalPopulation: 12000, topRatedCount: 5 });
    expect(districtGoalProgress(save, "harbor").met).toBe(true);
    expect(save.districts.completedDistricts).toEqual(["downtown", "harbor"]);

    // Claim Dock Clock Tower landmark once
    const popBefore = totalCityPopulation(save);
    const xpBefore = save.progression.xp;
    save = claimDistrictLandmark(save, "dock_clock_tower", 2500);
    expect(save.districts.landmarks.dock_clock_tower).toEqual({
      claimed: true,
      placed: true,
      claimedAt: 2500,
    });
    // Repeat claim is idempotent and does not duplicate receipts or grant XP
    const claimedAgain = claimDistrictLandmark(save, "dock_clock_tower", 3000);
    expect(claimedAgain).toBe(save);
    expect(totalCityPopulation(save)).toBe(popBefore);
    expect(save.progression.xp).toBe(xpBefore);

    // Toggling landmark display does not affect lots, adjacency, or population
    save = setLandmarkPlaced(save, "dock_clock_tower", false);
    expect(save.districts.landmarks.dock_clock_tower.placed).toBe(false);
    save = setLandmarkPlaced(save, "dock_clock_tower", true);
    expect(save.districts.landmarks.dock_clock_tower.placed).toBe(true);
    expect(totalCityPopulation(save)).toBe(popBefore);

    // Demolishing Downtown and Harbor towers lowers current metrics and current evolution stage,
    // but never relocks Harbor or revokes completedDistricts or highestStage!
    expect(save.districts.evolution.currentStage).toBe("metropolis"); // 8000 + 12000 = 20000
    expect(save.districts.evolution.highestStage).toBe("metropolis");

    for (let lot = 0; lot < 12; lot++) {
      save = demolishDistrictBuilding(save, "downtown", lot, 3500);
    }
    expect(districtGoalProgress(save, "downtown").met).toBe(false);
    expect(districtGoalProgress(save, "downtown").completedPreviously).toBe(true);
    expect(save.districts.unlockedDistricts).toEqual(["downtown", "harbor"]);
    expect(save.districts.completedDistricts).toEqual(["downtown", "harbor"]);
    expect(totalCityPopulation(save)).toBe(12000);
    expect(save.districts.evolution.currentStage).toBe("metro");
    expect(save.districts.evolution.highestStage).toBe("metropolis");
  });

  it("derives all six City Evolution stages accurately and never creates XP/achievement loops on district switch", () => {
    expect(deriveEvolutionStage(0).id).toBe("village");
    expect(deriveEvolutionStage(499).id).toBe("village");
    expect(deriveEvolutionStage(500).id).toBe("town");
    expect(deriveEvolutionStage(1999).id).toBe("town");
    expect(deriveEvolutionStage(2000).id).toBe("city");
    expect(deriveEvolutionStage(7999).id).toBe("city");
    expect(deriveEvolutionStage(8000).id).toBe("metro");
    expect(deriveEvolutionStage(19999).id).toBe("metro");
    expect(deriveEvolutionStage(20000).id).toBe("metropolis");
    expect(deriveEvolutionStage(49999).id).toBe("metropolis");
    expect(deriveEvolutionStage(50000).id).toBe("megacity");

    let save = initializeTracking(emptySave(), "c5-evo", 1000);
    save = populateDowntownForGoal(save, { count: 12, totalPopulation: 25000, topRatedCount: 3 });
    save = populateHarborForGoal(save, { count: 16, totalPopulation: 26000, topRatedCount: 5 });
    expect(totalCityPopulation(save)).toBe(51000);
    expect(save.districts.evolution.currentStage).toBe("megacity");
    expect(save.districts.evolution.highestStage).toBe("megacity");
    expect(save.districts.evolution.notifiedStage).toBe("village");

    save = acknowledgeEvolutionStage(save);
    expect(save.districts.evolution.notifiedStage).toBe("megacity");

    const xpBefore = save.progression.xp;
    const achievementsBefore = [...save.progression.achievements];
    const receiptsBefore = [...save.districts.receipts];
    for (let i = 0; i < 5; i++) {
      save = selectDistrict(save, "harbor");
      save = selectDistrict(save, "downtown");
    }
    expect(save.progression.xp).toBe(xpBefore);
    expect(save.progression.achievements).toEqual(achievementsBefore);
    expect(save.districts.receipts).toEqual(receiptsBefore);
  });
});
