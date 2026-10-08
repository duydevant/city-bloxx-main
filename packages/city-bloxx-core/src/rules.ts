export const PHYSICS_VERSION = "physics-0.13.0";
export const RULESET_VERSION = "quick-tower-0.13.0";
export const ASSIST_RULESET_VERSION = "quick-tower-assist-0.13.0";
export const CITY_RULESET_VERSION = "build-city-7";
export const CITY_RATING_VERSION = "city-rating-1";
export const RATING_VERSION = "quick-rating-1";
export const SAVE_VERSION = 4;

export const QUICK_TOWER_RULES = Object.freeze({
  tickRate: 60,
  worldHeight: 1280,
  groundY: 1090,
  floorWidth: 144,
  floorHeight: 120,
  spawnY: 392.8,
  swingAmplitude: 200,
  gravityPerTick: 0.72,
  maxFallSpeed: 30,
  minimumOverlapRatio: 0.6,
  lives: 3,
  comboDurationTicks: 180,
  perfectThreshold: 0.05,
  greatThreshold: 0.15,
  goodThreshold: 0.30,
  maxSway: 30,
  swingPeriodTicks: 192,
  swayPeriodTicks: 114,
  basePopulation: 10,
  comboBonus: 0.12,
  swayErrorGain: 16,
  perfectRecovery: 2.5,
  feedbackTicks: 36,
  missTicks: 42,
  inputDebounceTicks: 8,
  cameraTopY: 820,
  worldWidth: 840,
  // Nominal v0.11 maximum; current loaded length applies loadedCableScale below.
  pendulumLength: 229.8,
  loadedCableScale: 0.9,
  swingCycleScale: 0.81,
  emptyCableLength: 18,
  retractTicks: 18,
  cablePivotY: 80,
  hookToRoof: 83,
  landingHoldTicks: 14,
  prepareTicks: 20,
  cameraDeadZone: 210,
  cameraSpeed: 3,
  swayBuildFloors: 6,
  swingRotation: 0.04,
  heightSwayGain: 0.02,
  assistSwingMultiplier: 1.5,
  assistThresholdMultiplier: 1.5,
  difficultyGraceFloors: 2,
  difficultyRampFloors: 28,
  maxSwingSpeedBonus: 0.9,
  // Keep horizontal travel within the shorter cable's physical arc.
  maxSwingAmplitudeBonus: 20,
  heightWindPerFloor: 0.8,
  maxHeightWind: 22,
  maxSwaySpeedBonus: 0.45,
  assistDifficultyStrength: 0.5,
} as const);
export interface QuickDifficulty {
  speedMultiplier: number; amplitude: number; baselineSway: number; swaySpeedMultiplier: number;
  cableLength: number; emptyCableLength: number;
}
// Completed floors, speed relative to the 192-tick oscillator, loaded cable ratio, ambient sway.
export const HEIGHT_DIFFICULTY = Object.freeze([
  [0,.72,1,0], [2,.72,1,0], [10,.76,.95,1], [20,.84,.90,2.5],
  [30,.94,.84,4], [40,1.04,.78,5.5], [50,1.14,.72,7], [60,1.22,.68,8],
] as const);
export function getQuickDifficulty(height: number, assist = false, legacyMotion = false, motionVersion?: 11 | 12): QuickDifficulty {
  if (!legacyMotion) {
    const h = Math.max(0,Number.isFinite(height)?height:0);
    const upper = HEIGHT_DIFFICULTY.findIndex(point=>point[0]>=h);
    const b = HEIGHT_DIFFICULTY[upper<0?HEIGHT_DIFFICULTY.length-1:upper];
    const a = HEIGHT_DIFFICULTY[Math.max(0,(upper<0?HEIGHT_DIFFICULTY.length-1:upper)-1)];
    const t = a===b?0:Math.min(1,(h-a[0])/(b[0]-a[0]));
    const speed = a[1]+(b[1]-a[1])*t, ratio = a[2]+(b[2]-a[2])*t;
    const cableLength = QUICK_TOWER_RULES.pendulumLength*ratio*(motionVersion===11?1:QUICK_TOWER_RULES.loadedCableScale);
    const strength = assist?QUICK_TOWER_RULES.assistDifficultyStrength:1;
    return {
      speedMultiplier:(.72+(speed-.72)*strength)/(assist?QUICK_TOWER_RULES.assistSwingMultiplier:1)/(motionVersion===11?1:motionVersion===12?.9:QUICK_TOWER_RULES.swingCycleScale),
      // A shorter cable needs a narrower arc; never let horizontal travel exceed cable length.
      amplitude:cableLength*.8, cableLength, emptyCableLength:QUICK_TOWER_RULES.emptyCableLength,
      baselineSway:(a[3]+(b[3]-a[3])*t)*strength,
      swaySpeedMultiplier:1+Math.min(Math.max(0,h-2),58)/58*.18*strength,
    };
  }
  // Already-started City towers retain the exact v0.7–v0.10 motion until accepted/cancelled.
  const floors = Math.max(0, Math.floor(Number.isFinite(height) ? height : 0) - QUICK_TOWER_RULES.difficultyGraceFloors);
  const ramp = Math.min(1, floors / QUICK_TOWER_RULES.difficultyRampFloors);
  const strength = assist ? QUICK_TOWER_RULES.assistDifficultyStrength : 1;
  return {
    cableLength:QUICK_TOWER_RULES.pendulumLength, emptyCableLength:QUICK_TOWER_RULES.pendulumLength/1.15,
    speedMultiplier: (1 + ramp * QUICK_TOWER_RULES.maxSwingSpeedBonus * strength) / (assist ? QUICK_TOWER_RULES.assistSwingMultiplier : 1),
    amplitude: QUICK_TOWER_RULES.swingAmplitude + ramp * QUICK_TOWER_RULES.maxSwingAmplitudeBonus * strength,
    baselineSway: Math.min(QUICK_TOWER_RULES.maxHeightWind, floors * QUICK_TOWER_RULES.heightWindPerFloor) * strength,
    swaySpeedMultiplier: 1 + ramp * QUICK_TOWER_RULES.maxSwaySpeedBonus * strength,
  };
}
export const QUALITY_POPULATION_FACTORS = Object.freeze({ perfect: 1.5, great: 1.25, good: 1, risky: 0.7 });
export const QUICK_RATING_RULES = Object.freeze({ sHeight: 20, sAccuracy: 94, aHeight: 10, aAccuracy: 85, bHeight: 5, bAccuracy: 70 });
