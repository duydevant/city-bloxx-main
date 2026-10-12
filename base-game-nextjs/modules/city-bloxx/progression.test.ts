import { describe, expect, it } from "vitest"
import { ACHIEVEMENT_CATALOG, MISSION_CATALOG, MISSION_FALLBACKS } from "../../../packages/city-bloxx-content/progression"
import { acceptedProgression, acceptTrackedCity, achievementProgress, allocateRun, beginCityTower, beginDaily, BUILDING_IDS, BUILDINGS, checkpointDaily, claimMission, demolishCityBuilding, emptySave, ensureMissions, initializeTracking, levelProgress, makeSummary, migrateSave, prepareSave, QuickTowerGame, recordRunProgress, rerollSaveMission, resolveMissions, runXP, settleProgression, settleRun, updateCityCheckpoint, validateAchievementCatalog, validateMissionCatalog, type RunRecord } from "../../../packages/city-bloxx-core/src/index"
import fixture from "../../../packages/city-bloxx-core/fixtures/daily-v1.json"
import quick from "../../../packages/city-bloxx-core/fixtures/quick-mixed-v13.json"
import { createSaveController } from "../../../packages/city-bloxx-renderer/src/save-controller"
import { placeAccurately } from "./test-simulation"
import { creditDaily } from "../../../packages/city-bloxx-core/src/daily-state"

const at = Date.parse("2026-10-09T23:59:00Z"), nextDay = Date.parse("2026-10-10T00:01:00Z")
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const initial = () => ensureMissions(initializeTracking(emptySave(), "progress-test", at), at)
function game(record = fixture.complete as RunRecord) {
  const g = new QuickTowerGame(record.config)
  for (const input of record.inputs) { g.advanceTicks(input.tick - g.getTick()); g.drop(input.fraction / 1000) }
  g.advanceTicks(record.endTick - g.getTick()); return g
}
function pinned(save = initial()) {
  save.progression.missionDays[0].slots = ["land-10", "perfect-10", "roof-hit"].map(id => ({ definition: copy(MISSION_CATALOG.find(d => d.id === id)!), progress: 0, status: "active", completedAt: null, claimedAt: null }))
  return save
}
function trackedQuick(save = initial(), startedAt = at) {
  const q = allocateRun(save, startedAt), summary = makeSummary(game(quick as RunRecord), q.context, nextDay)
  q.save.tracking.activeQuick = { ...q.context, progress: summary }
  return { save: q.save, summary }
}

describe("C4.2 XP and catalogs", () => {
  for (const [xp, level] of [[0, 1], [99, 1], [100, 2], [399, 2], [400, 3], [239999, 49], [240100, 50], [Number.MAX_SAFE_INTEGER, 50]]) it(`derives ${xp} XP as builder level ${level}`, () => expect(levelProgress(xp).level).toBe(level))
  it("caps mastery, derives progress/remaining and rejects negative or unsafe XP", () => {
    expect(levelProgress(36100, 20)).toMatchObject({ level: 20, next: null, progress: 1, remaining: 0 })
    expect(levelProgress(250)).toMatchObject({ level: 2, progress: .5, remaining: 150 })
    for (const xp of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(() => levelProgress(xp)).toThrow()
  })
  it("rejects negative/overflow rewards, duplicate IDs and missing translations", () => {
    expect(MISSION_CATALOG.length).toBeGreaterThanOrEqual(12); expect(ACHIEVEMENT_CATALOG).toHaveLength(20)
    validateMissionCatalog(MISSION_CATALOG); validateAchievementCatalog()
    for (const xp of [-1, Infinity, Number.MAX_SAFE_INTEGER]) {
      expect(() => validateMissionCatalog([{ ...MISSION_CATALOG[0], xp }])).toThrow()
      expect(() => validateAchievementCatalog([{ ...ACHIEVEMENT_CATALOG[0], xp }])).toThrow()
    }
    expect(() => validateMissionCatalog([MISSION_CATALOG[0], MISSION_CATALOG[0]])).toThrow()
    expect(() => validateAchievementCatalog([{ ...ACHIEVEMENT_CATALOG[0], title: { en: "", vi: "" } }])).toThrow()
  })
  it("keeps base XP distinct from achievement XP and ignores summary reward claims", () => {
    const { save, summary } = trackedQuick(); summary.xpEarned = 99999; summary.unlockedAchievements = ["daily-7"]
    const settled = settleRun(save, summary)
    expect(runXP(summary)).toBe(37); expect(settled.progression.xp).toBe(87)
    expect(settled.progression.masteryXP.residential).toBe(37)
    expect(settled.history[0]).toMatchObject({ baseXPEarned: 37, bonusXPEarned: 50, xpEarned: 87, unlockedAchievements: ["perfect-1"] })
    expect(levelProgress(settled.progression.xp).level).toBe(1)
  })
  it("counts body/Assist/abandoned correctly; foundation and missed roof have no per-drop XP", () => {
    const q = allocateRun(initial(), at), g = new QuickTowerGame({ mode: "quick", seed: 42, assist: true })
    placeAccurately(g, .02); expect(runXP(makeSummary(g, q.context, nextDay, "abandoned"))).toBe(0)
    placeAccurately(g, .02)
    const summary = makeSummary(g, q.context, nextDay, "abandoned"), s = settleRun(q.save, summary)
    expect(s.progression.xp).toBe(7); expect(s.progression.achievements).toEqual([])
    expect(s.progression.masteryXP.residential).toBe(7); expect(s.stats.totals.completed).toBe(0)
    expect(settleRun(migrateSave(copy(s)), summary)).toEqual(s)
  })
})

describe("C4.2 mission receipts", () => {
  it("pins deterministic UTC/installation missions, three difficulties and City availability", () => {
    for (let n = 0; n < 80; n++) {
      const day = resolveMissions("2026-10-09", `installation-${n}`, ["residential"])
      expect(resolveMissions(day.dateUTC, `installation-${n}`, day.unlocked)).toEqual(day)
      expect(day.slots.map(s => s.definition.difficulty)).toEqual(["easy", "medium", "hard"])
      expect(new Set(day.slots.map(s => s.definition.id)).size).toBe(3)
      expect(day.slots.every(s => !s.definition.cityClass)).toBe(true)
    }
    const fallback = resolveMissions("2026-10-09", "test", ["residential"], [])
    expect(fallback.slots.map(s => s.definition)).toEqual(MISSION_FALLBACKS)
    const s = initial(), before = copy(s.progression.missionDays)
    s.city.unlocked.push("industrial")
    expect(ensureMissions(s, at).progression.missionDays).toEqual(before)
  })
  it("allows only one unstarted reroll per UTC day and preserves the pinned pool", () => {
    let s = pinned(); const id = s.progression.missionDays[0].slots[0].definition.id
    s = rerollSaveMission(s, "2026-10-09", id, at)
    expect(s.progression.missionDays[0].rerolled).toBe(true)
    const before = copy(s.progression)
    expect(rerollSaveMission(s, "2026-10-09", s.progression.missionDays[0].slots[1].definition.id, at).progression).toEqual(before)
    s = pinned(); s.progression.missionDays[0].slots[0].progress = 1
    expect(rerollSaveMission(s, "2026-10-09", id, at).progression).toEqual(s.progression)
    expect(rerollSaveMission(s, "2026-10-09", id, nextDay).progression.missionDays.find(d => d.dateUTC === "2026-10-09")).toEqual(s.progression.missionDays[0])
  })
  it("dedupes checkpoint/finish/reload events, retains start-day progress across midnight and claims once", () => {
    const q = allocateRun(pinned(), at), g = game(), summary = makeSummary(g, q.context, nextDay)
    q.save.daily = beginDaily(q.save.daily, new QuickTowerGame(g.config), q.context)
    q.save.daily = checkpointDaily(q.save.daily, g)
    let s = recordRunProgress(q.save, summary)
    expect(s.progression.xp).toBe(0)
    expect(s.progression.missionDays.find(d => d.dateUTC === "2026-10-09")!.slots.map(s => s.status)).toEqual(["ready", "ready", "ready"])
    expect(s.progression.missionDays.find(d => d.dateUTC === "2026-10-10")!.slots.every(s => s.progress === 0)).toBe(true)
    expect(recordRunProgress(s, summary).progression).toEqual(s.progression)
    s = settleRun(migrateSave(copy(s)), summary)
    expect(s.progression.xp).toBe(533); expect(s.progression.cursors).toEqual([])
    s = claimMission(s, "2026-10-09", "land-10", nextDay)
    expect(s.progression.xp).toBe(553); expect(s.progression.masteryXP.industrial).toBe(183)
    expect(claimMission(migrateSave(copy(s)), "2026-10-09", "land-10", nextDay)).toEqual(s)
    expect(settleRun(s, summary)).toBe(s)
  })
  it("permits claims through day six, expires on day seven and refuses clock rollback farming", () => {
    let s = pinned(); const slot = s.progression.missionDays[0].slots[0]
    slot.progress = 10; slot.status = "ready"; slot.completedAt = at
    expect(claimMission(s, "2026-10-09", "land-10", Date.parse("2026-10-15T23:59:59Z")).progression.xp).toBe(20)
    s = claimMission(s, "2026-10-09", "land-10", Date.parse("2026-10-16T00:00:00Z"))
    expect(s.progression.xp).toBe(0); expect(s.progression.missionDays.some(d => d.dateUTC === "2026-10-09")).toBe(false)
    expect(ensureMissions(s, at).progression.missionDays.some(d => d.dateUTC === "2026-10-09")).toBe(false)
    expect(claimMission(pinned(), "2026-10-09", "land-10", at).progression.xp).toBe(0)
  })
  it("filters non-Assist precision and height while generic missions still advance", () => {
    const s = pinned(), q = allocateRun(s, at), summary = makeSummary(game(), q.context, nextDay)
    summary.mode = "quick"; summary.daily = undefined; summary.assist = true; summary.complete = false
    const p = recordRunProgress(q.save, summary).progression.missionDays.find(d => d.dateUTC === "2026-10-09")!
    expect(p.slots[0].status).toBe("ready"); expect(p.slots[1].progress).toBe(0)
  })
  it("atomically retries the same claim snapshot after write failure and crash", async () => {
    let raw = JSON.stringify(pinned()), fail = false
    const controller = createSaveController({ load: async () => JSON.parse(raw), save: async s => { if (fail) return false; raw = JSON.stringify(s); return true } })
    let s = await controller.load(); const slot = s.progression.missionDays[0].slots[0]
    slot.progress = 10; slot.status = "ready"; slot.completedAt = at
    await controller.write(s); const before = raw
    s = claimMission(s, "2026-10-09", slot.definition.id, nextDay); fail = true
    expect(await controller.write(s)).toBe(false); expect(raw).toBe(before)
    expect(migrateSave(JSON.parse(raw)).progression.xp).toBe(0)
    fail = false; expect(await controller.write(s)).toBe(true)
    expect(claimMission(migrateSave(JSON.parse(raw)), "2026-10-09", slot.definition.id, nextDay).progression.xp).toBe(20)
  })
  it("keeps a claim and live Quick cursor consistent through crash-to-abandoned settlement", () => {
    const q = allocateRun(pinned(), at), g = new QuickTowerGame(42)
    for (let i = 0; i < 12; i++) placeAccurately(g, .02)
    const summary = makeSummary(g, q.context, at + 1000, "abandoned")
    q.save.tracking.activeQuick = { ...q.context, progress: summary }
    let s = recordRunProgress(q.save, summary)
    s = claimMission(s, "2026-10-09", "land-10", at + 1000)
    expect(s.progression.xp).toBe(20)
    s = settleRun(migrateSave(copy(s)), summary)
    expect(s.history[0].bonusXPEarned).toBe(200)
    expect(s.progression.xp).toBe(20 + runXP(summary) + 200)
    expect(s.progression.masteryXP.residential).toBe(runXP(summary))
    expect(claimMission(migrateSave(copy(s)), "2026-10-09", "land-10", at + 1000)).toEqual(s)
    expect(s.progression.cursors).toEqual([])
    expect(s.progression.missionDays[0].slots[0].progress).toBe(10)
  })
  it("refuses claim overflow and altered predicate/reward versions without mutating the save", () => {
    const s = pinned(), slot = s.progression.missionDays[0].slots[0]
    slot.progress = 10; slot.status = "ready"; slot.completedAt = at; s.progression.xp = Number.MAX_SAFE_INTEGER
    const before = copy(s)
    expect(() => claimMission(s, "2026-10-09", "land-10", nextDay)).toThrow("bounds")
    expect(s).toEqual(before)
    const altered = pinned(); altered.progression.missionDays[0].slots[0].definition.xp = 9999
    expect(() => migrateSave(altered)).toThrow("Unsupported mission rule")
  })
})

describe("C4.2 achievements and placement", () => {
  it("does not unlock any precision/streak/height achievement for an Assist run at all thresholds", () => {
    const q = trackedQuick(); q.summary.assist = true; q.summary.result.height = 100; q.summary.result.bestStreak = 20; q.summary.metrics!.body.perfect = 1000
    expect(settleProgression(q.save, q.summary, 0, 0).achievements).toEqual([])
  })
  it("unlocks seven credited Daily days even when none are consecutive", () => {
    const q = trackedQuick()
    for (const day of [9, 11, 13, 15, 17, 19, 21]) q.save.daily = creditDaily(q.save.daily, `2026-10-${day < 10 ? "0" : ""}${day}`)
    expect(q.save.daily.streak).toBe(1); expect(q.save.daily.lifetimeCreditedDays).toBe(7)
    const p = settleProgression(q.save, q.summary, 0, q.save.daily.lifetimeCreditedDays)
    expect(p.achievements).toContain("daily-7")
  })
  for (const d of ACHIEVEMENT_CATALOG) it(`unlocks ${d.id} at its event boundary exactly once`, () => {
    const q = trackedQuick(), s = q.save, summary = q.summary
    summary.metrics = { ...summary.metrics!, body: { perfect: 0, great: 0, good: 0, risky: 0, miss: 0 }, roof: null }
    summary.result = { ...summary.result, height: 0, bestStreak: 0 }; summary.complete = false
    if (d.metric === "class") { summary.complete = true; summary.mode = "city"; summary.building = d.classId! }
    if (d.metric === "perfect") { s.progression.counts.perfect = d.target - 1; summary.metrics.body.perfect = 1 }
    if (d.metric === "streak") summary.result.bestStreak = d.target
    if (d.metric === "height") summary.result.height = d.target
    if (d.metric === "roof") { s.progression.counts.roof = d.target - 1; summary.metrics.roof = "perfect" }
    if (d.metric === "city") { summary.mode = "city"; summary.complete = true; s.progression.counts.city = d.target - 1 }
    let p = d.metric === "city" ? acceptedProgression(s, summary, "city-1", nextDay) : settleProgression(s, summary, 0, d.metric === "daily" ? 7 : 0)
    expect(p.achievements).toContain(d.id); expect(p.unlocks.find(u => u.id === d.id)).toMatchObject({ version: "achievements-1", at: nextDay, xp: 50 })
    expect(achievementProgress(p, d)).toBe(d.target)
    const xp = p.xp; s.progression = p
    p = d.metric === "city" ? acceptedProgression(s, summary, "city-1", nextDay) : settleProgression(s, summary, 0, d.metric === "daily" ? 7 : 0)
    expect(p.unlocks.filter(u => u.id === d.id)).toHaveLength(1); expect(p.xp).toBe(xp)
    const below = initial(), low = copy(summary)
    low.complete = false; low.metrics!.body.perfect = 0; low.metrics!.roof = null; low.result.bestStreak = 0; low.result.height = 0
    if (d.metric === "perfect" && d.target > 1) { below.progression.counts.perfect = d.target - 2; low.metrics!.body.perfect = 1 }
    if (d.metric === "streak") low.result.bestStreak = d.target - 1
    if (d.metric === "height") low.result.height = d.target - 1
    if (d.metric === "roof" && d.target > 1) { below.progression.counts.roof = d.target - 2; low.metrics!.roof = "perfect" }
    if (d.metric === "city") { below.progression.counts.city = Math.max(0, d.target - 2); low.complete = d.target > 1 }
    const locked = d.metric === "city" ? acceptedProgression(below, low, "city-1", nextDay) : settleProgression(below, low, 0, 6)
    expect(locked.achievements).not.toContain(d.id)
  })
  it("settles City completion at finish and accepted placements once at accept; demolition keeps lifetime", () => {
    let s = pinned(); s.progression.missionDays[0].slots[2].definition = copy(MISSION_CATALOG.find(d => d.id === "city-accept")!)
    const g = new QuickTowerGame({ seed: 42, mode: "city", assist: false, building: "residential" })
    for (let i = 0; i <= BUILDINGS.residential.floors; i++) placeAccurately(g, .02)
    s.city = updateCityCheckpoint(beginCityTower(s.city, 12, "residential", 42), g)
    const q = allocateRun(s, at); s = q.save; const id = s.city.pending!.runId
    s.tracking.pendingCity = { ...q.context, cityRunId: id }
    const summary = makeSummary(g, q.context, nextDay)
    s = settleRun(s, summary); expect(s.progression.achievements).toContain("class-residential"); expect(s.progression.achievements).not.toContain("city-1")
    const mastery = s.progression.masteryXP.residential, before = s.progression.xp
    s = acceptTrackedCity(migrateSave(copy(s)), id, nextDay)
    expect(s.progression.xp).toBe(before + 50); expect(s.progression.masteryXP.residential).toBe(mastery)
    expect(s.progression.counts.city).toBe(1); expect(s.progression.missionDays.find(d => d.dateUTC === "2026-10-09")!.slots[2].status).toBe("ready")
    expect(acceptTrackedCity(s, id, nextDay)).toBe(s); expect(settleRun(s, summary)).toBe(s)
    s.city = demolishCityBuilding(s.city, 12); expect(s.progression.counts.city).toBe(1)
  })
  it("migrates old counters without issuing rewards, preserves unknown ownership and derives levels", () => {
    const s = initial(), old = { version: 1, xp: 400, masteryXP: Object.fromEntries(BUILDING_IDS.map(id => [id, 100])), achievements: ["future-badge"] }
    const raw = { ...s, progression: old, level: 999 }
    const loaded = migrateSave(raw)
    expect(loaded.progression.xp).toBe(400); expect(levelProgress(loaded.progression.xp).level).toBe(3)
    expect(loaded.progression.achievements).toEqual(["future-badge"]); expect(loaded.progression.unlocks).toEqual([])
    expect(migrateSave(copy(loaded))).toEqual(loaded)
    const changed = pinned(); changed.progression.missionDays[0].slots[0].definition.title.en = "Updated text"
    expect(migrateSave(copy(changed)).progression.missionDays).toEqual(changed.progression.missionDays)
    expect(() => migrateSave({ ...s, progression: { ...s.progression, cursors: [{ sequence: 999 }] } })).toThrow()
    expect(prepareSave(loaded).progression.achievements).toEqual(["future-badge"])
  })
})
