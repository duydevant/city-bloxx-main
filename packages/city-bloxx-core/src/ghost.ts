import type { BuildingId } from "./buildings";
import { QuickTowerReplay, validateRecord, type ReplayDropMarker } from "./replay";
import { ASSIST_RULESET_VERSION, PHYSICS_VERSION, RULESET_VERSION } from "./rules";
import type { QuickTowerSnapshot, RunConfig, RunRecord, RunResult } from "./run";
import type { GameSave } from "./save-state";

export interface PersonalGhost {
  sourceId: string;
  seed: number;
  mode: RunConfig["mode"];
  assist: boolean;
  building: BuildingId;
  physicsVersion: string;
  rulesetVersion: string;
  result: RunResult;
  markers: readonly ReplayDropMarker[];
}

export type GhostResolution =
  | { status: "available"; ghost: PersonalGhost }
  | {
      status: "unavailable";
      reason: "no-pb" | "seed-mismatch" | "config-mismatch" | "version-unsupported";
      retrySameSeedConfig?: RunConfig;
    };

function expectedRuleset(config: RunConfig): string {
  if (config.mode === "one-drop") return config.oneDrop?.rulesetVersion ?? RULESET_VERSION;
  if (config.mode === "daily") return config.daily?.rulesetVersion ?? RULESET_VERSION;
  if (config.mode === "perfect-rush") return config.perfectRush?.rulesetVersion ?? "perfect-rush-1";
  if (config.mode === "skyline-sprint") return config.skylineSprint?.rulesetVersion ?? "skyline-sprint-1";
  return config.assist ? ASSIST_RULESET_VERSION : RULESET_VERSION;
}

export function buildPersonalGhost(sourceId: string, record: RunRecord): PersonalGhost {
  const valid = validateRecord(record);
  const viewer = new QuickTowerReplay(valid);
  const markers = viewer.getDropMarkers();
  return Object.freeze({
    sourceId,
    seed: valid.config.seed,
    mode: valid.config.mode,
    assist: valid.config.assist,
    building: valid.config.building ?? "residential",
    physicsVersion: valid.physicsVersion,
    rulesetVersion: valid.rulesetVersion,
    result: { ...valid.result },
    markers,
  });
}

export function resolvePersonalGhost(save: GameSave, config: RunConfig): GhostResolution {
  const targetRuleset = expectedRuleset(config);
  const targetBuilding = config.building ?? "residential";
  const modeReplays = save.replays.filter(entry => entry.record?.config?.mode === config.mode);
  if (modeReplays.length === 0) {
    return { status: "unavailable", reason: "no-pb" };
  }

  const sameConfigReplays = modeReplays.filter(
    entry =>
      entry.record.config.assist === config.assist &&
      (entry.record.config.building ?? "residential") === targetBuilding &&
      (config.mode !== "daily" || entry.record.config.daily?.dateUTC === config.daily?.dateUTC) &&
      (config.mode !== "one-drop" || entry.record.config.oneDrop?.dateUTC === config.oneDrop?.dateUTC),
  );
  if (sameConfigReplays.length === 0) {
    return { status: "unavailable", reason: "config-mismatch" };
  }

  const supportedVersionReplays = sameConfigReplays.filter(
    entry => entry.record.physicsVersion === PHYSICS_VERSION && entry.record.rulesetVersion === targetRuleset,
  );
  if (supportedVersionReplays.length === 0) {
    return { status: "unavailable", reason: "version-unsupported" };
  }

  const sortBest = (a: { id: string; record: RunRecord }, b: { id: string; record: RunRecord }) => {
    if (config.mode === "one-drop") {
      if (a.record.result.height !== b.record.result.height) {
        return b.record.result.height - a.record.result.height;
      }
      if (a.record.result.accuracy !== b.record.result.accuracy) {
        return b.record.result.accuracy - a.record.result.accuracy;
      }
      return a.record.result.durationTicks - b.record.result.durationTicks;
    }
    if (config.mode === "perfect-rush") {
      if (b.record.result.perfectCount !== a.record.result.perfectCount) {
        return b.record.result.perfectCount - a.record.result.perfectCount;
      }
      if (b.record.result.population !== a.record.result.population) {
        return b.record.result.population - a.record.result.population;
      }
      return a.record.result.durationTicks - b.record.result.durationTicks;
    }
    if (config.mode === "skyline-sprint") {
      const aComplete = Number(a.record.result.height >= 20);
      const bComplete = Number(b.record.result.height >= 20);
      if (aComplete !== bComplete) return bComplete - aComplete;
      const aScore = a.record.result.sprintScoreTicks ?? a.record.result.durationTicks + a.record.result.misses * 300;
      const bScore = b.record.result.sprintScoreTicks ?? b.record.result.durationTicks + b.record.result.misses * 300;
      if (aScore !== bScore) return aScore - bScore;
      return b.record.result.accuracy - a.record.result.accuracy;
    }
    if (b.record.result.population !== a.record.result.population) {
      return b.record.result.population - a.record.result.population;
    }
    if (b.record.result.height !== a.record.result.height) {
      return b.record.result.height - a.record.result.height;
    }
    return a.record.result.durationTicks - b.record.result.durationTicks;
  };

  const sortedAll = [...supportedVersionReplays].sort(sortBest);
  const matchingSeed = sortedAll.filter(entry => entry.record.config.seed === config.seed);
  if (matchingSeed.length === 0) {
    const bestOverall = sortedAll[0];
    return {
      status: "unavailable",
      reason: "seed-mismatch",
      retrySameSeedConfig: JSON.parse(JSON.stringify(bestOverall.record.config)) as RunConfig,
    };
  }

  const chosen = matchingSeed[0];
  try {
    return {
      status: "available",
      ghost: buildPersonalGhost(chosen.id, chosen.record),
    };
  } catch {
    return { status: "unavailable", reason: "version-unsupported" };
  }
}

export function activeGhostMarker(ghost: PersonalGhost | null, snapshot: QuickTowerSnapshot): ReplayDropMarker | null {
  if (!ghost || snapshot.phase === "ended") return null;
  const sequence =
    snapshot.phase === "swing" || snapshot.phase === "preparing"
      ? snapshot.drops.length
      : Math.max(0, snapshot.drops.length - 1);
  return ghost.markers[sequence] ?? null;
}
