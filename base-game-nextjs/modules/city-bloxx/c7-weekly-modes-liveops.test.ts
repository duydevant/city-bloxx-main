import { describe, expect, it, vi } from "vitest"
import {
  allocateRun,
  BUNDLED_LIVEOPS_MANIFEST,
  claimMission,
  claimSeasonTier,
  claimWeeklyContract,
  claimWinterEventGoal,
  comparePerfectRushBest,
  compareSkylineSprintBest,
  computeSprintScoreTicks,
  emptySave,
  ensureMissions,
  ensureWeeklyContracts,
  floorSway,
  initializeTracking,
  makeSummary,
  PERFECT_RUSH_RECIPE,
  prepareSave,
  QuickTowerGame,
  QuickTowerReplay,
  resolvePerfectRush,
  resolvePersonalGhost,
  resolveSkylineSprint,
  resolveWindowState,
  settleRun,
  SKYLINE_SPRINT_RECIPE,
  utcWeekStart,
  validateLiveOpsManifest,
  weeklyContractExpired,
  type LiveOpsManifest,
  type RunConfig,
} from "../../../packages/city-bloxx-core/src/index"
import { createTowerAudio } from "../../../packages/city-bloxx-renderer/src/audio"
import * as playableSfx from "../../../base-playable-main/src/platform/sfx"
import { placeAccurately } from "./test-simulation"
import {
  LIVEOPS_DEFAULT_TTL_SECONDS,
  LiveOpsConfigService,
  resolveWebLiveOpsManifest,
} from "@/lib/liveops/service"
import { GET as getContentActive } from "@/app/content/active/route"
import { GET as getApiContentActive } from "@/app/api/v1/city-bloxx/content/active/route"

function makePerfectRushConfig(seed: number): RunConfig {
  return {
    seed,
    mode: "perfect-rush",
    assist: false,
    building: "residential",
    perfectRush: resolvePerfectRush(),
  }
}

function makeSkylineSprintConfig(seed: number): RunConfig {
  return {
    seed,
    mode: "skyline-sprint",
    assist: false,
    building: "residential",
    skylineSprint: resolveSkylineSprint(),
  }
}

function placeMiss(game: QuickTowerGame): void {
  const feedback = game.getSnapshot().feedbackId
  for (let tick = 0; tick < 2000; tick++) {
    const state = game.getSnapshot()
    const index = state.floors.length - 1
    const top = index >= 0 ? state.floors[index].x + floorSway(state, index) : 0
    if (state.phase === "swing" && Math.abs(state.current.x - top) > 155) {
      if (!game.drop(0)) throw new Error("Miss drop rejected")
      for (let step = 0; step < 200 && game.getSnapshot().feedbackId === feedback; step++) {
        game.advanceTicks(1)
      }
      return
    }
    game.advanceTicks(1)
  }
  throw new Error("Could not find miss release position")
}

describe("Phase C7 — Weekly Contracts, Perfect Rush, Skyline Sprint, Events/Season, LiveOps & Adaptive Audio", () => {
  describe("C7.1 Weekly Contracts", () => {
    it("computes deterministic Monday UTC week start across Sunday and year crossover", () => {
      expect(utcWeekStart("2026-10-12")).toBe("2026-10-12") // Monday
      expect(utcWeekStart("2026-10-18")).toBe("2026-10-12") // Sunday -> same week Monday
      expect(utcWeekStart("2025-12-31")).toBe("2025-12-29") // Wednesday in year crossover week
      expect(utcWeekStart("2026-01-01")).toBe("2025-12-29") // Thursday in same Monday-started week
      expect(utcWeekStart("2026-01-05")).toBe("2026-01-05") // First Monday of 2026
    })

    it("tracks run-start week progress, enforces 7-day claim grace, awards +50 SP on claim, and bounds weeks <= 2 while retaining receipts", () => {
      const week1StartMs = Date.parse("2026-10-12T08:00:00.000Z")
      let save = ensureWeeklyContracts(
        initializeTracking(emptySave(), "c7-weekly-test", week1StartMs),
        week1StartMs,
      )
      expect(save.liveOps.weekly.weeks).toHaveLength(1)
      const week1 = save.liveOps.weekly.weeks[0]
      expect(week1.weekStartUTC).toBe("2026-10-12")
      expect(week1.slots.map((s) => s.definition.id)).toEqual([
        "weekly-land-200",
        "weekly-perfect-50",
        "weekly-finite-5",
      ])

      // Complete 5 Skyline Sprint finite towers started in week 1
      const game = new QuickTowerGame(makeSkylineSprintConfig(100))
      for (let f = 0; f < 20; f++) {
        placeAccurately(game, 0.02)
      }
      while (game.getPhase() !== "ended") game.advanceTicks(1)
      const record = game.getRecord()

      for (let i = 0; i < 5; i++) {
        const startAt = week1StartMs + i * 60_000
        const alloc = allocateRun(save, startAt)
        save = alloc.save
        const summary = makeSummary(game, alloc.context, startAt + 30_000)
        save = settleRun(save, summary, record)
      }

      const updatedWeek1 = save.liveOps.weekly.weeks.find((w) => w.weekStartUTC === "2026-10-12")!
      const finiteSlot = updatedWeek1.slots.find((s) => s.definition.id === "weekly-finite-5")!
      expect(finiteSlot.progress).toBe(5)
      expect(finiteSlot.status).toBe("ready")

      // Claim within 7-day grace window (e.g. Wednesday of next week: 2026-10-21)
      const graceClaimMs = Date.parse("2026-10-21T12:00:00.000Z")
      expect(weeklyContractExpired("2026-10-12", "2026-10-25")).toBe(false)
      expect(weeklyContractExpired("2026-10-12", "2026-10-26")).toBe(true)

      const xpBefore = save.progression.xp
      const spBefore = save.liveOps.freeSeason.sp
      save = claimWeeklyContract(save, "2026-10-12", "weekly-finite-5", graceClaimMs)
      expect(save.progression.xp).toBe(xpBefore + 400)
      expect(save.liveOps.freeSeason.sp).toBe(spBefore + 50)
      expect(save.liveOps.weekly.claimedReceipts).toContain("2026-10-12:weekly-finite-5")

      // Duplicate claim is a no-op
      const afterDuplicate = claimWeeklyContract(save, "2026-10-12", "weekly-finite-5", graceClaimMs + 1000)
      expect(afterDuplicate.progression.xp).toBe(save.progression.xp)
      expect(afterDuplicate.liveOps.freeSeason.sp).toBe(save.liveOps.freeSeason.sp)

      // Advance across 3 more weeks -> weeks array stays bounded <= 2, receipt stays preserved
      save = ensureWeeklyContracts(save, Date.parse("2026-10-26T01:00:00.000Z"))
      save = ensureWeeklyContracts(save, Date.parse("2026-11-02T01:00:00.000Z"))
      expect(save.liveOps.weekly.weeks.length).toBeLessThanOrEqual(2)
      expect(save.liveOps.weekly.claimedReceipts).toContain("2026-10-12:weekly-finite-5")
    })
  })

  describe("C7.2 Perfect Rush Mode", () => {
    it("enforces 3,600-tick deadline, rejects new inputs at tick >= 3600, resolves in-flight drop within <= 180 ticks, and verifies replay", () => {
      const config = makePerfectRushConfig(777)
      expect(config.mode).toBe("perfect-rush")
      expect(config.perfectRush?.deadlineTick).toBe(3600)
      expect(config.perfectRush?.maxEndTick).toBe(3780)

      const game = new QuickTowerGame(config)
      // Drop foundation + 2 Perfect body floors
      for (let i = 0; i < 3; i++) {
        placeAccurately(game, 0.02)
      }
      // Foundation does not count toward Perfect body score
      expect(game.getSnapshot().floors.length).toBe(3)
      expect(game.getSnapshot().perfectCount).toBe(2)

      // Advance to tick 3595 and release an in-flight block right before deadline
      const remainingTo3595 = 3595 - game.getTick()
      if (remainingTo3595 > 0) game.advanceTicks(remainingTo3595)
      while (game.getSnapshot().phase !== "swing" && game.getTick() < 3599) {
        game.advanceTicks(1)
      }
      if (game.getSnapshot().phase === "swing" && game.getTick() < 3600) {
        expect(game.drop(0)).toBe(true)
      }

      // Step to deadlineTick 3600
      const toDeadline = 3600 - game.getTick()
      if (toDeadline > 0) game.advanceTicks(toDeadline)
      expect(game.drop(0)).toBe(false) // No input allowed at or after deadlineTick!

      // Step until run ends within grace window
      let extra = 0
      while (game.getPhase() !== "ended" && extra <= PERFECT_RUSH_RECIPE.maxGraceTicks + 5) {
        game.advanceTicks(1)
        extra++
      }
      expect(game.getPhase()).toBe("ended")
      expect(game.getTick()).toBeLessThanOrEqual(PERFECT_RUSH_RECIPE.maxEndTick)

      const record = game.getRecord()
      expect(record.result.deadlineTick).toBe(3600)
      expect(record.result.durationTicks).toBe(record.endTick)
      expect(record.endTick).toBeLessThanOrEqual(3780)

      // Replay deterministic verification
      const replay = new QuickTowerReplay(record)
      replay.seekToResult()
      expect(replay.getSnapshot().perfectCount).toBe(game.getSnapshot().perfectCount)

      // Tampered input at tick 3600 must be rejected by replay validator
      const tampered = {
        ...record,
        inputs: [...record.inputs, { sequence: record.inputs.length, tick: 3600, fraction: 0 }],
      }
      expect(() => new QuickTowerReplay(tampered)).toThrow(/Invalid Perfect Rush replay bounds/i)
    })

    it("ranks PB by perfectCount -> population -> durationTicks, grants body XP without finite bonus, and never pollutes Quick PB", () => {
      expect(
        comparePerfectRushBest(
          { identityId: "a", seed: 1, perfectCount: 15, population: 400, height: 16, durationTicks: 3600, deadlineTick: 3600, accuracy: 95, endedAt: 1 },
          { identityId: "b", seed: 2, perfectCount: 14, population: 900, height: 15, durationTicks: 2000, deadlineTick: 3600, accuracy: 99, endedAt: 2 },
        ),
      ).toBe(true)

      expect(
        comparePerfectRushBest(
          { identityId: "a", seed: 1, perfectCount: 15, population: 500, height: 16, durationTicks: 3500, deadlineTick: 3600, accuracy: 95, endedAt: 1 },
          { identityId: "b", seed: 2, perfectCount: 15, population: 450, height: 16, durationTicks: 3000, deadlineTick: 3600, accuracy: 95, endedAt: 2 },
        ),
      ).toBe(true)

      const startAt = Date.parse("2026-10-15T10:00:00.000Z")
      let save = initializeTracking(emptySave(), "c7-rush-test", startAt)
      const alloc = allocateRun(save, startAt)
      save = alloc.save
      const game = new QuickTowerGame(makePerfectRushConfig(888))
      for (let i = 0; i < 3; i++) {
        placeAccurately(game, 0.02)
      }
      game.advanceTicks(3600 - game.getTick())
      while (game.getPhase() !== "ended") game.advanceTicks(1)

      const summary = makeSummary(game, alloc.context, Date.parse("2026-10-15T10:01:00.000Z"))
      save = settleRun(save, summary, game.getRecord())
      expect(save.standardQuickBest).toBe(0)
      expect(save.liveOps.perfectRush.best?.perfectCount).toBe(2)
      // 2 scored Perfect body floors = 2 * (5 + 2) = 14 base XP (no finite completion bonus)
      expect(save.history[0].baseXPEarned).toBe(14)
      expect(save.progression.masteryXP.residential).toBe(14)
    })
  })

  describe("C7.3 Skyline Sprint Mode", () => {
    it("computes sprintScoreTicks = durationTicks + 300 * misses, records time PB only on 20/20 completion, and grants finite completion bonus", () => {
      expect(computeSprintScoreTicks(1800, 0)).toBe(1800)
      expect(computeSprintScoreTicks(1800, 2)).toBe(2400)
      expect(
        compareSkylineSprintBest(
          { identityId: "a", seed: 1, sprintScoreTicks: 1900, durationTicks: 1900, misses: 0, population: 500, accuracy: 90, endedAt: 1 },
          { identityId: "b", seed: 2, sprintScoreTicks: 2100, durationTicks: 1800, misses: 1, population: 600, accuracy: 95, endedAt: 2 },
        ),
      ).toBe(true)

      const startAt = Date.parse("2026-10-15T11:00:00.000Z")
      let save = initializeTracking(emptySave(), "c7-sprint-test", startAt)
      // 1) Failed run (3 misses) -> records bestFailedHeight, bestComplete remains null
      const allocFail = allocateRun(save, startAt)
      save = allocFail.save
      const failGame = new QuickTowerGame(makeSkylineSprintConfig(321))
      placeAccurately(failGame, 0.02)
      for (let m = 0; m < 3; m++) {
        placeMiss(failGame)
      }
      while (failGame.getPhase() !== "ended") failGame.advanceTicks(1)
      save = settleRun(
        save,
        makeSummary(failGame, allocFail.context, Date.parse("2026-10-15T11:00:30.000Z")),
        failGame.getRecord(),
      )
      expect(save.liveOps.skylineSprint.bestComplete).toBeNull()
      expect(save.liveOps.skylineSprint.bestFailedHeight).toBe(1)

      // 2) Complete 20/20 run with 1 Miss -> records bestComplete with +300 penalty ticks and finite completion XP
      const allocWin = allocateRun(save, Date.parse("2026-10-15T11:05:00.000Z"))
      save = allocWin.save
      const winGame = new QuickTowerGame(makeSkylineSprintConfig(654))
      for (let f = 0; f < 20; f++) {
        if (f === 2) placeMiss(winGame)
        placeAccurately(winGame, 0.02)
      }
      while (winGame.getPhase() !== "ended") winGame.advanceTicks(1)
      expect(winGame.getResult().height).toBe(SKYLINE_SPRINT_RECIPE.targetBodyFloors)
      const winRecord = winGame.getRecord()
      expect(winRecord.result.misses).toBe(1)
      expect(winRecord.result.sprintScoreTicks).toBe(winGame.getResult().durationTicks + 300)

      save = settleRun(
        save,
        makeSummary(winGame, allocWin.context, Date.parse("2026-10-15T11:06:00.000Z")),
        winRecord,
      )
      expect(save.liveOps.skylineSprint.bestComplete?.sprintScoreTicks).toBe(
        winGame.getResult().durationTicks + 300,
      )
      // 19 scored Perfect body floors * 7 XP + 50 finite completion bonus = 183 base XP
      expect(save.history[0].baseXPEarned).toBe(19 * 7 + 50)
      expect(save.standardQuickBest).toBe(0)

      // Personal ghost uses dedicated sprint ruleset and matching seed
      const ghostRes = resolvePersonalGhost(save, makeSkylineSprintConfig(654))
      expect(ghostRes.status).toBe("available")
      if (ghostRes.status === "available") {
        expect(ghostRes.ghost.mode).toBe("skyline-sprint")
        expect(ghostRes.ghost.rulesetVersion).toBe("skyline-sprint-1")
      }
    })
  })

  describe("C7.4 & C7.5 Winter Event, Free Season & Web LiveOps Config Service", () => {
    it("credits Winter Event goals, supports 24h run-settlement grace and 7d claim grace, and retains cosmetics permanently after event ends", () => {
      const eventStartMs = Date.parse(BUNDLED_LIVEOPS_MANIFEST.winterEvent.startsAtUTC)
      const eventEndMs = Date.parse(BUNDLED_LIVEOPS_MANIFEST.winterEvent.endsAtUTC)

      let save = initializeTracking(emptySave(), "c7-winter-test", eventStartMs)
      save = {
        ...save,
        liveOps: {
          ...save.liveOps,
          winterEvent: {
            ...save.liveOps.winterEvent,
            landed: 499,
            perfect: 99,
            dailyComplete: 7,
          },
        },
      }

      // Start a run 10 minutes before event ends, finish 2 hours after event ends (within 24h runGraceHours)
      const runStartMs = eventEndMs - 10 * 60_000
      const runEndMs = eventEndMs + 2 * 3600_000
      expect(
        resolveWindowState(BUNDLED_LIVEOPS_MANIFEST.winterEvent, false, runEndMs, runStartMs),
      ).toBe("run-grace")

      const alloc = allocateRun(save, runStartMs)
      save = alloc.save
      const game = new QuickTowerGame(makePerfectRushConfig(555))
      // Land foundation + 1 Perfect body floor
      for (let i = 0; i < 2; i++) {
        placeAccurately(game, 0.02)
      }
      game.advanceTicks(3600 - game.getTick())
      while (game.getPhase() !== "ended") game.advanceTicks(1)

      save = settleRun(save, makeSummary(game, alloc.context, runEndMs), game.getRecord())
      expect(save.liveOps.winterEvent.landed).toBe(500)
      expect(save.liveOps.winterEvent.perfect).toBe(100)

      // Claim all 3 Winter goals during the 7-day claim grace window (3 days after event end)
      const claimAtMs = eventEndMs + 3 * 86_400_000
      save = claimWinterEventGoal(save, "winter-land-500", claimAtMs)
      save = claimWinterEventGoal(save, "winter-perfect-100", claimAtMs)
      save = claimWinterEventGoal(save, "winter-daily-7", claimAtMs)

      expect(save.inventory.owned).toContain("winter-roof-residential")
      expect(save.inventory.owned).toContain("winter-crane")
      expect(save.inventory.owned).toContain("winter-badge")

      // Even 30 days after event ends, owned Winter cosmetics remain permanently in save
      const afterExpiryMs = eventEndMs + 30 * 86_400_000
      expect(resolveWindowState(BUNDLED_LIVEOPS_MANIFEST.winterEvent, false, afterExpiryMs)).toBe("ended")
      const prepared = prepareSave(save)
      expect(prepared.inventory.owned).toContain("winter-roof-residential")
      expect(prepared.inventory.owned).toContain("winter-crane")
      expect(prepared.inventory.owned).toContain("winter-badge")
      expect(eventStartMs).toBeLessThan(eventEndMs)
    })

    it("awards Season SP from Daily Mission (+10), Weekly Contract (+50), and first Daily complete (+20), dedupes receipts, and unlocks 20 tiers", () => {
      const atMs = Date.parse("2026-10-15T12:00:00.000Z")
      let save = ensureMissions(initializeTracking(emptySave(), "c7-season-test", atMs), atMs)
      const day = save.progression.missionDays[0]
      const slot = day.slots[0]
      // Ready the first daily mission and claim it -> +10 SP
      save = {
        ...save,
        progression: {
          ...save.progression,
          missionDays: [
            {
              ...day,
              slots: day.slots.map((s, idx) =>
                idx === 0 ? { ...s, progress: s.definition.target, status: "ready" as const, completedAt: atMs } : s,
              ),
            },
          ],
        },
      }
      save = claimMission(save, day.dateUTC, slot.definition.id, atMs + 1000)
      expect(save.liveOps.freeSeason.sp).toBe(10)
      expect(save.liveOps.freeSeason.spReceipts).toContain(`mission:${day.dateUTC}:${slot.definition.id}`)

      // Set SP to 2000 (Tier 20) and claim Tier 1 (odd: +50 XP), Tier 2 (even: +100 XP), Tier 10 (season-badge), Tier 20 (season-crane)
      save = {
        ...save,
        liveOps: {
          ...save.liveOps,
          freeSeason: {
            ...save.liveOps.freeSeason,
            sp: 2000,
          },
        },
      }
      const xp0 = save.progression.xp
      save = claimSeasonTier(save, 1, atMs + 2000)
      expect(save.progression.xp).toBe(xp0 + 50)
      save = claimSeasonTier(save, 2, atMs + 3000)
      expect(save.progression.xp).toBe(xp0 + 150)
      save = claimSeasonTier(save, 10, atMs + 4000)
      expect(save.inventory.owned).toContain("season-badge")
      save = claimSeasonTier(save, 20, atMs + 5000)
      expect(save.inventory.owned).toContain("season-crane")
    })

    it("enforces immutable revisions, allowlisted validation (no physics/JS), 15-min TTL cache, audit log, rollback, and kill switch", async () => {
      const service = new LiveOpsConfigService(BUNDLED_LIVEOPS_MANIFEST)
      expect(service.getActiveManifest().ttlSeconds).toBe(LIVEOPS_DEFAULT_TTL_SECONDS)
      expect(service.getCacheHeaders()["Cache-Control"]).toContain("max-age=900")

      // Reject physics modification attempts
      expect(() =>
        validateLiveOpsManifest({
          ...BUNDLED_LIVEOPS_MANIFEST,
          revision: "rev-bad-physics",
          swingPeriodTicks: 90,
        }),
      ).toThrow(/Invalid|Unknown/)

      // Reject executable script injection in titles
      expect(() =>
        service.publishRevision(
          {
            ...BUNDLED_LIVEOPS_MANIFEST,
            revision: "rev-xss",
            winterEvent: {
              ...BUNDLED_LIVEOPS_MANIFEST.winterEvent,
              title: { en: "<script>alert(1)</script>", vi: "Sự kiện" },
            },
          },
          "admin@citybloxx",
          "Attempt XSS",
        ),
      ).toThrow(/Executable/)

      // Publish valid revision v2
      const rev2: LiveOpsManifest = {
        ...BUNDLED_LIVEOPS_MANIFEST,
        revision: "rev-2026-10-16-v2",
        publishedAtUTC: "2026-10-16T00:00:00.000Z",
      }
      service.publishRevision(rev2, "admin@citybloxx", "Scheduled rollout v2", "2026-10-16T00:00:00.000Z")
      expect(service.getActiveManifest().revision).toBe("rev-2026-10-16-v2")

      // Immutable revision cannot be overwritten
      expect(() =>
        service.publishRevision(rev2, "admin@citybloxx", "Overwrite attempt"),
      ).toThrow(/immutable/)

      // Kill switch update creates audited revision
      service.updateKillSwitch(
        { rushDisabled: true, eventsDisabled: true },
        "ops@citybloxx",
        "Pause Rush & Events for maintenance",
        "rev-2026-10-16-ks1",
        "2026-10-16T01:00:00.000Z",
      )
      expect(service.getActiveManifest().killSwitch.rushDisabled).toBe(true)
      expect(service.getActiveManifest().killSwitch.eventsDisabled).toBe(true)

      // Rollback to initial revision
      service.rollbackToRevision(
        BUNDLED_LIVEOPS_MANIFEST.revision,
        "ops@citybloxx",
        "Rollback after maintenance",
        "2026-10-16T02:00:00.000Z",
      )
      expect(service.getActiveManifest().revision).toBe(BUNDLED_LIVEOPS_MANIFEST.revision)
      expect(service.getActiveManifest().killSwitch.rushDisabled).toBe(false)
      expect(service.getAuditLog().map((a) => a.action)).toEqual(["publish", "kill-switch", "rollback"])

      // Verify Next.js route handlers return valid JSON with 900s cache headers
      const res1 = await getContentActive()
      expect(res1.status).toBe(200)
      expect(res1.headers.get("Cache-Control")).toContain("max-age=900")
      const json1 = await res1.json()
      expect(json1.status).toBe("ok")
      expect(json1.catalogIds.weeklyVersion).toBe("weekly-contracts-1")

      const res2 = await getApiContentActive()
      expect(res2.status).toBe(200)

      // Client TTL cache & offline last-good fallback
      const mem = new Map<string, string>()
      const mockStorage = {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => {
          mem.set(k, v)
        },
      }
      const netFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => service.getActiveContentResponse(),
      } as unknown as Response)

      const first = await resolveWebLiveOpsManifest({
        storage: mockStorage,
        fetchFn: netFetch,
        nowMs: 1_000_000,
      })
      expect(first.source).toBe("network")
      expect(netFetch).toHaveBeenCalledTimes(1)

      // Within 15-min TTL -> uses cache without network call
      const second = await resolveWebLiveOpsManifest({
        storage: mockStorage,
        fetchFn: netFetch,
        nowMs: 1_000_000 + 300_000,
      })
      expect(second.source).toBe("cache")
      expect(netFetch).toHaveBeenCalledTimes(1)

      // After 15-min TTL when offline -> falls back to last-good cached config
      const failFetch = vi.fn().mockRejectedValue(new Error("offline"))
      const third = await resolveWebLiveOpsManifest({
        storage: mockStorage,
        fetchFn: failFetch,
        nowMs: 1_000_000 + 950_000,
      })
      expect(third.source).toBe("last-good")
      expect(third.manifest.revision).toBe(BUNDLED_LIVEOPS_MANIFEST.revision)
    })
  })

  describe("C7.6 Adaptive Audio Polish", () => {
    it("unlocks 1 base loop + 3 combo layers at 3/6/10 with 150ms fade, zero per-frame oscillators, and suspends on mute/pause", () => {
      class MockGainNode {
        gain = {
          value: 0.0001,
          cancelScheduledValues: vi.fn(),
          setValueAtTime: vi.fn((v: number) => {
            this.gain.value = v
          }),
          linearRampToValueAtTime: vi.fn((v: number) => {
            this.gain.value = v
          }),
          exponentialRampToValueAtTime: vi.fn(),
        }
        connect = vi.fn(() => ({ connect: vi.fn() }))
        disconnect = vi.fn()
      }
      class MockOscillatorNode {
        type = "sine"
        frequency = {
          value: 220,
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        }
        connect = vi.fn(() => new MockGainNode())
        start = vi.fn()
        stop = vi.fn()
        disconnect = vi.fn()
        onended: (() => void) | null = null
      }
      class MockAudioContext {
        state = "running"
        currentTime = 10
        destination = {}
        createGain = vi.fn(() => new MockGainNode())
        createOscillator = vi.fn(() => new MockOscillatorNode())
        resume = vi.fn().mockResolvedValue(undefined)
        suspend = vi.fn().mockResolvedValue(undefined)
        close = vi.fn().mockResolvedValue(undefined)
      }

      const g = globalThis as unknown as {
        AudioContext?: unknown
        window?: { AudioContext?: unknown }
      }
      const prevAudioContext = g.AudioContext
      const prevWindow = g.window
      g.AudioContext = MockAudioContext
      g.window = { ...(prevWindow ?? {}), AudioContext: MockAudioContext }
      try {
        const audio = createTowerAudio()
        audio.play("perfect")
        expect(audio.getAudioDiagnostics?.().activeLayers).toBe(1) // Base layer active

        audio.setCombo?.(3)
        expect(audio.getAudioDiagnostics?.().activeLayers).toBe(2)

        audio.setCombo?.(6)
        expect(audio.getAudioDiagnostics?.().activeLayers).toBe(3)

        audio.setCombo?.(10)
        const diag10 = audio.getAudioDiagnostics!()
        expect(diag10.activeLayers).toBe(4)
        expect(diag10.fadeDurationMs).toBe(150)
        expect(diag10.stemOscillatorsCreated).toBe(4) // 4 stem oscillators created once, 0 per frame
        expect(diag10.externalAudioBytes).toBe(0)

        // Combo ends -> fades back to base layer (1)
        audio.setCombo?.(0)
        expect(audio.getAudioDiagnostics?.().activeLayers).toBe(1)

        // Suspend / pause suspends all layers
        audio.suspend()
        expect(audio.getAudioDiagnostics?.().activeLayers).toBe(0)
        audio.dispose()

        // Also verify Playable sfx adaptive layers
        playableSfx.unlock()
        playableSfx.playBeep("tap")
        playableSfx.setCombo(6)
        playableSfx.suspend()
        playableSfx.dispose()
      } finally {
        if (prevAudioContext === undefined) delete g.AudioContext
        else g.AudioContext = prevAudioContext
        if (prevWindow === undefined) delete g.window
        else g.window = prevWindow
      }
    })
  })
})
