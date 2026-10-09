import { describe, expect, it } from "vitest"
import fixture from "../../../packages/city-bloxx-core/fixtures/daily-v1.json"
import { allocateRun, beginDaily, beginCityTower, checkpointDaily, checkpointTower, creditDaily, currentDailyStreak, dailyCountdown, emptyDaily, emptySave, initializeTracking, makeSummary, migrateSave, pinReplay, prepareSave, QuickTowerGame, QuickTowerReplay, resolveDaily, restoreTower, saveByteSize, settleDaily, settleRun, shiftUTCDate, utcDate, validateDaily, validateRecord, verifyRecord, type GameSave, type RunRecord } from "../../../packages/city-bloxx-core/src/index"

const records = [fixture.complete, fixture.roofMiss, fixture.failed] as RunRecord[]
const startTime = Date.parse("2026-10-09T23:59:00Z")
const endTime = Date.parse("2026-10-10T00:01:00Z")
function game(date = "2026-10-09") {
  const daily = resolveDaily(date)
  return new QuickTowerGame({ mode: "daily", building: daily.classId, seed: daily.seed, assist: false, daily })
}
function start(save = initializeTracking(emptySave(), "daily-test", startTime)) {
  const allocated = allocateRun(save, startTime), initial = game()
  return { save: { ...allocated.save, daily: beginDaily(allocated.save.daily, initial, allocated.context) }, context: allocated.context, game: initial }
}
function restored(record: RunRecord) { return restoreTower({ version: record.physicsVersion, config: record.config, inputs: record.inputs, tick: record.endTick }) }
function finish(save: GameSave, context: ReturnType<typeof start>["context"], record = records[0]) {
  const g = restored(record), next = { ...save, daily: checkpointDaily(save.daily, g) }
  return settleRun(next, makeSummary(g, context, endTime), record)
}

describe("C4.1 Daily definitions and UTC", () => {
  for (const definition of fixture.definitions) it(`pins the integer hash for ${definition.dateUTC}`, () => {
    expect(resolveDaily(definition.dateUTC)).toEqual(definition)
    expect(validateDaily(definition)).toEqual(definition)
  })
  for (const date of ["", "2026-2-01", "2026-02-29", "2024-02-30", "2026-13-01", "2026-04-31", "2026-00-01", "2026-10-09T00:00:00Z"]) it(`rejects invalid date ${date}`, () => expect(() => resolveDaily(date)).toThrow())
  it("uses UTC across midnight, local offsets, DST and leap/year boundaries", () => {
    expect(utcDate(Date.parse("2026-10-09T23:59:59.999Z"))).toBe("2026-10-09")
    expect(utcDate(Date.parse("2026-10-10T00:00:00Z"))).toBe("2026-10-10")
    expect(utcDate(Date.parse("2026-10-10T06:59:59.999+07:00"))).toBe("2026-10-09")
    expect(utcDate(Date.parse("2026-03-08T01:59:59-05:00"))).toBe("2026-03-08")
    expect(utcDate(Date.parse("2026-03-08T03:00:00-04:00"))).toBe("2026-03-08")
    expect(utcDate(Date.parse("2026-11-01T01:00:00-04:00"))).toBe("2026-11-01")
    expect(utcDate(Date.parse("2026-11-01T01:00:00-05:00"))).toBe("2026-11-01")
    expect(shiftUTCDate("2024-02-28", 1)).toBe("2024-02-29")
    expect(shiftUTCDate("2024-02-29", 1)).toBe("2024-03-01")
    expect(shiftUTCDate("2026-12-31", 1)).toBe("2027-01-01")
    expect(dailyCountdown(Date.parse("2026-10-09T23:59:59.999Z"))).toBe(1)
    expect(dailyCountdown(Date.parse("2026-10-10T00:00:00Z"))).toBe(86400)
    for (const invalid of [NaN, Infinity, -1, .5, Number.MAX_SAFE_INTEGER]) expect(() => utcDate(invalid)).toThrow()
  })
  it("freezes a defensive definition copy and rejects unsupported recipes or run variants", () => {
    const d = resolveDaily("2026-10-09"), g = new QuickTowerGame({ mode: "daily", building: "industrial", seed: d.seed, assist: false, daily: d })
    d.seed = 42
    expect(g.config.daily!.seed).toBe(fixture.complete.config.seed)
    expect(Object.isFrozen(g.config.daily)).toBe(true)
    for (const patch of [{ assist: true }, { building: "office" }, { seed: 42 }, { legacyPerfect: true }, { motionVersion: 12 }, { daily: { ...g.config.daily, scheduleVersion: "daily-v2" } }, { daily: { ...g.config.daily, physicsVersion: "physics-0.14.0" } }]) expect(() => new QuickTowerGame({ ...g.config, ...patch } as typeof g.config)).toThrow()
    expect(() => new QuickTowerGame({ ...g.config, mode: "quick" })).toThrow()
  })
})

describe("C4.1 finite runs, replay and checkpoints", () => {
  for (const [index, record] of records.entries()) it(`reproduces Daily golden result ${index} with tick and frame playback`, () => {
    expect(verifyRecord(record)).toEqual(record)
    const g = restored(record), replay = new QuickTowerReplay(record)
    for (let i = 0; i < record.endTick; i++) replay.update(1 / 60)
    expect(replay.getResult()).toEqual(record.result)
    expect(replay.getMetrics()).toEqual(g.getMetrics())
    expect(replay.getPhase()).toBe("ended")
    expect(g.getSnapshot().floors).toHaveLength(record.result.height)
    expect(g.getMetrics().foundation).toBe(1)
    expect(g.getMetrics().errorCount).toBe(record.result.height - 1 + record.result.misses - Number(index === 1))
    expect(g.getResult().ranked).toBe(false)
  })
  it("counts roof Miss as complete but never treats a failed body as eligible personal best", () => {
    const a = start(), complete = finish(a.save, a.context, records[1])
    expect(complete.daily.days[0].bestComplete!.result.height).toBe(20)
    expect(complete.history[0].complete).toBe(true)
    expect(complete.history[0].metrics!.roof).toBe("miss")
    const next = start({ ...complete, daily: { ...complete.daily, pending: null } })
    const failed = finish(next.save, next.context, records[2])
    expect(failed.daily.days[0].bestComplete).toEqual(complete.daily.days[0].bestComplete)
    expect(failed.daily.days[0].bestFailedHeight).toBe(1)
    expect(failed.history[0].complete).toBe(false)
    expect(failed.history[0].xpEarned).toBe(0)
  })
  it("resumes every simulation phase, including pending body and roof falls", () => {
    const phases = new Set<string>()
    for (const record of records) {
      const g = new QuickTowerGame(record.config); let index = 0
      for (let tick = 0; tick <= record.endTick; tick++) {
        const input = record.inputs[index]; if (input?.tick === tick) { g.drop(input.fraction / 1000); index++ }
        const key = `${g.getSnapshot().isRoof ? "roof-" : "body-"}${g.getPhase()}`
        if (!phases.has(key)) {
          phases.add(key)
          const resume = restoreTower(checkpointTower(g))
          expect(resume.getSnapshot()).toEqual(g.getSnapshot())
          expect(resume.getMetrics()).toEqual(g.getMetrics())
          resume.setPaused(true); resume.advanceTicks(100); expect(resume.getTick()).toBe(g.getTick())
        }
        g.advanceTicks(1)
      }
    }
    expect([...phases]).toEqual(expect.arrayContaining(["body-swing", "body-falling", "body-settling", "body-preparing", "body-miss", "body-ended", "roof-swing", "roof-falling", "roof-miss", "roof-ended"]))
  })
  it("rejects corrupted replay inputs and mode/version/result bounds", () => {
    const r = records[0], corruptions = [
      { physicsVersion: "physics-0.14.0" }, { rulesetVersion: "quick-tower-0.13.0" }, { config: { ...r.config, mode: "city" } },
      { inputs: [] }, { inputs: [...r.inputs, ...r.inputs] }, { inputs: r.inputs.map((v, i) => i === 1 ? { ...v, tick: r.inputs[0].tick } : v) },
      { inputs: r.inputs.map((v, i) => i === 0 ? { ...v, fraction: 1001 } : v) }, { inputs: r.inputs.map((v, i) => i === 0 ? { ...v, sequence: 2 } : v) },
      { endTick: 432001 }, { result: { ...r.result, ranked: true } }, { result: { ...r.result, height: 21 } }, { result: { ...r.result, height: 19 } }, { result: { ...r.result, misses: .5 } },
    ]
    for (const patch of corruptions) expect(() => validateRecord({ ...r, ...patch })).toThrow()
    expect(() => verifyRecord({ ...r, result: { ...r.result, population: r.result.population + 1 } })).toThrow()
    expect(() => restoreTower({ ...checkpointTower(game()), version: "physics-0.12.0" })).toThrow()
    expect(() => restoreTower({ ...checkpointTower(game()), config: { ...game().config, daily: { ...game().config.daily, targetBodyFloors: 30 } } })).toThrow()
  })
})

describe("C4.1 save, streak and settlement", () => {
  it("uses completed population, Perfect rate, misses, duration and received time in that order", () => {
    const a = start(), summary = makeSummary(restored(records[0]), a.context, endTime)
    const first = { ...summary, result: { ...summary.result, misses: 1, durationTicks: 3000 }, metrics: { ...summary.metrics!, body: { ...summary.metrics!.body, perfect: 10, great: 9 } } }
    const state = settleDaily(a.save.daily, first)
    const original = state.days[0].bestComplete!
    const cases = [
      { summary: { ...first, result: { ...first.result, population: 1306 } }, wins: true },
      { summary: { ...summary, result: { ...summary.result, population: 1304 } }, wins: false },
      { summary: { ...first, metrics: summary.metrics }, wins: true },
      { summary: { ...first, result: { ...first.result, misses: 0 } }, wins: true },
      { summary: { ...first, result: { ...first.result, durationTicks: 2999 } }, wins: true },
      { summary: { ...first, endedAt: endTime - 1 }, wins: true },
      { summary: { ...first, endedAt: endTime + 1 }, wins: false },
      { summary: { ...first, complete: false, result: { ...first.result, height: 1, population: 5000 } }, wins: false },
    ]
    for (const test of cases) {
      const best = settleDaily(state, test.summary).days[0].bestComplete!
      expect(JSON.stringify(best) !== JSON.stringify(original)).toBe(test.wins)
    }
  })
  it("counts attempts at start, credits only scored body drops, and keeps the pinned day across midnight", () => {
    const a = start()
    expect(a.save.daily.days[0].attempts).toBe(1)
    expect(a.save.daily.creditedDates).toEqual([])
    const foundationInput = records[0].inputs[0]
    a.game.advanceTicks(foundationInput.tick); a.game.drop(foundationInput.fraction / 1000)
    while (a.game.getSnapshot().floors.length === 0) a.game.advanceTicks(1)
    const foundation = checkpointDaily(a.save.daily, a.game)
    expect(foundation.creditedDates).toEqual([])
    const b = finish(a.save, a.context)
    expect(b.daily.creditedDates).toEqual(["2026-10-09"])
    expect(b.daily.lifetimeCreditedDays).toBe(1)
    expect(b.daily.days[0].attempts).toBe(1)
    expect(b.history[0].daily!.dateUTC).toBe("2026-10-09")
    expect(b.history[0].endedAt).toBe(endTime)
  })
  it("retains an ended checkpoint and settles result/resume/replay exactly once", () => {
    const a = start(), b = finish(a.save, a.context), migrated = migrateSave(prepareSave(b)), g = restoreTower(migrated.daily.pending!.checkpoint)
    expect(g.getPhase()).toBe("ended")
    expect(settleRun(migrated, makeSummary(g, a.context, endTime), g.getRecord())).toEqual(b)
    expect(b.daily.days[0].attempts).toBe(1)
    expect(b.daily.streak).toBe(1)
    expect(b.progression.xp).toBe(183)
    const replay = new QuickTowerReplay(b.lastReplay!); replay.advanceTicks(replay.record.endTick)
    expect(migrateSave(b)).toEqual(b)
    expect(pinReplay(b, b.replayRefs.latest)).toMatchObject({ daily: b.daily, progression: b.progression, stats: b.stats })
    expect(saveByteSize(prepareSave(b))).toBeLessThan(256 * 1024)
  })
  it("keeps Daily accessible before Industrial unlock and preserves Quick scores/City placement", () => {
    const initial = emptySave(); initial.standardQuickBest = 999; initial.assistQuickBest = 321; initial.runs = 45
    initial.city = beginCityTower(initial.city, 12, "residential", 42)
    const a = start(initializeTracking(initial, "daily-test", startTime)), b = finish(a.save, a.context)
    expect(b.city).toEqual(initial.city)
    expect(b.city.unlocked).toEqual(["residential"])
    expect([b.standardQuickBest, b.assistQuickBest, b.runs]).toEqual([999, 321, 45])
    expect(b.stats.byMode.daily.completed).toBe(1)
    expect(b.stats.byMode["quick-standard"].attempts).toBe(0)
    expect(b.stats.byMode.city.attempts).toBe(0)
  })
  it("requires explicit removal before a second pending Daily", () => {
    const a = start()
    expect(() => beginDaily(a.save.daily, game("2026-10-10"), a.context)).toThrow()
    expect(migrateSave(a.save).daily.pending!.checkpoint.config.daily!.dateUTC).toBe("2026-10-09")
    expect(() => checkpointDaily(a.save.daily, game("2026-10-10"))).toThrow()
  })
  it("preserves longest and lifetime streaks after pruning, dedupes repeats, and rejects backdated credits", () => {
    let daily = emptyDaily()
    for (let i = 0; i < 13; i++) {
      daily = creditDaily(daily, shiftUTCDate("2026-10-01", i))
      expect(creditDaily(daily, shiftUTCDate("2026-10-01", i))).toBe(daily)
    }
    expect(daily.creditedDates).toHaveLength(7)
    expect(daily.longestStreak).toBe(13); expect(daily.lifetimeCreditedDays).toBe(13)
    expect(currentDailyStreak(daily, "2026-10-13")).toBe(13)
    expect(currentDailyStreak(daily, "2026-10-14")).toBe(13)
    expect(currentDailyStreak(daily, "2026-10-15")).toBe(0)
    expect(creditDaily(daily, "2026-10-01")).toBe(daily)
    expect(creditDaily(daily, "2026-09-30")).toBe(daily)
    expect(currentDailyStreak(daily, "2026-10-01")).toBe(0)
    daily = creditDaily(daily, "2026-10-15")
    expect(daily.streak).toBe(1); expect(daily.longestStreak).toBe(13); expect(daily.lifetimeCreditedDays).toBe(14)
  })
  it("migrates C4.0 scaffold without clearing credits, settings or statistics", () => {
    const old = JSON.parse(JSON.stringify(emptySave()))
    old.standardQuickBest = 88; old.settings.locale = "vi"
    old.daily = { version: 1, creditedDates: ["2026-10-08"], streak: 1, longestStreak: 5 }; delete old.stats.byMode.daily
    const next = migrateSave(old)
    expect(next.daily).toMatchObject({ latestCreditedDate: "2026-10-08", lifetimeCreditedDays: 1, longestStreak: 5, pending: null })
    expect(next.standardQuickBest).toBe(88); expect(next.settings.locale).toBe("vi")
    expect(next.stats.byMode.daily.attempts).toBe(0)
  })
  it("preserves raw save when a pinned recipe or Daily metadata is unsupported", () => {
    const a = start(), bad = JSON.parse(JSON.stringify(a.save))
    bad.daily.pending.checkpoint.config.daily.scheduleVersion = "daily-v2"
    const before = JSON.stringify(bad)
    expect(() => migrateSave(bad)).toThrow(/Daily/)
    expect(JSON.stringify(bad)).toBe(before)
    for (const patch of [{ creditedDates: ["2026-02-29"] }, { lifetimeCreditedDays: -1 }, { days: [{ dateUTC: "2026-10-09", attempts: 1, bestComplete: null, bestFailedHeight: 21 }] }]) expect(() => migrateSave({ ...a.save, daily: { ...a.save.daily, ...patch } })).toThrow()
  })
  it("keeps only seven Daily dates while attempts and current-day PB survive retries", () => {
    let save = start().save
    save = finish(save, save.daily.pending!)
    const best = save.daily.days[0].bestComplete
    for (let i = 1; i < 10; i++) {
      const date = shiftUTCDate("2026-10-09", i), g = game(date), allocation = allocateRun({ ...save, daily: { ...save.daily, pending: null } }, endTime + i * 86400000)
      save = { ...allocation.save, daily: beginDaily(allocation.save.daily, g, allocation.context) }
      save = settleRun(save, makeSummary(g, allocation.context, endTime + i * 86400000, "abandoned"))
    }
    expect(save.daily.days).toHaveLength(7)
    expect(save.daily.days.find(d => d.dateUTC === "2026-10-09")).toBeUndefined()
    expect(save.daily.lifetimeCreditedDays).toBe(1)
    expect(save.daily.longestStreak).toBe(1)
    expect(best!.result.population).toBe(1305)
    expect(migrateSave(save)).toEqual(save)
  })
})
