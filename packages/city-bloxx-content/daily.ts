// Versioned bundled recipe. Changing this recipe requires a new schedule/ruleset ID.
export const DAILY_RECIPE = Object.freeze({ scheduleVersion: "daily-v1", rulesetVersion: "daily-tower-1", classId: "industrial", targetBodyFloors: 20, roofEnabled: true, objective: "population" } as const);
