import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import fixture from "../../../packages/city-bloxx-core/fixtures/quick-mixed-v13.json";
import {
  activeGhostMarker,
  allocateRun,
  beginDistrictTower,
  captureSkylineSnapshot,
  computePlacementHeatmap,
  deleteSkylineSnapshot,
  emptySave,
  extractOneDropResult,
  HALL_OF_FAME_LIMIT,
  initializeTracking,
  makeSummary,
  MAX_VIEWER_CACHE_BYTES,
  MAX_VIEWER_CACHE_ENTRIES,
  PHYSICS_VERSION,
  prepareSave,
  QuickTowerGame,
  QuickTowerReplay,
  REPLAY_SPEEDS,
  resolveOneDrop,
  resolvePersonalGhost,
  RULESET_VERSION,
  saveByteSize,
  settleRun,
  SKYLINE_ALBUM_LIMIT,
  toggleHallOfFame,
  validateAlbumState,
  validateRecord,
  type RunRecord,
} from "../../../packages/city-bloxx-core/src/index";
import {
  checkPendingRunGuard,
  compareChallengeResult,
  createDemoSocialStore,
  createSocialStore,
  defaultPlayerHandle,
  downloadPublicReplay,
  getPublicChallenge,
  getPublicProfile,
  getPublicTower,
  getTowerShareCard,
  issueChallengeTicket,
  moderateEntity,
  publishTower,
  REPLAY_DOWNLOAD_RATE_LIMIT,
  renderShareCardPng,
  reportPublicEntity,
  revokeTower,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  submitChallengeAttempt,
  upsertPlayerProfile,
  validateDisplayName,
} from "@/lib/social";

const goldenRecord = fixture as unknown as RunRecord;

describe("Phase C6 — One Drop, Replay Viewer, Personal Ghost, Hall/Album & Web Social", () => {
  describe("C6.1 — One Drop v1 & Placement Heatmap", () => {
    it("starts One Drop with 4 swaying prebuilt Residential floors, scores the single drop, and has no roof", () => {
      const def = resolveOneDrop("2026-10-19");
      expect(def.presetId).toBe("one-drop-v1");
      expect(def.prebuiltFloors).toBe(4);
      expect(def.targetBodyFloors).toBe(1);
      expect(def.lives).toBe(1);
      expect(def.roofEnabled).toBe(false);

      const game = new QuickTowerGame({
        mode: "one-drop",
        assist: false,
        seed: def.seed,
        building: def.classId,
        oneDrop: def,
      });

      const initial = game.getSnapshot();
      expect(initial.floors.length).toBe(4);
      expect(initial.floors.every(f => f.x === 0 && f.population === 0)).toBe(true);
      expect(initial.lives).toBe(1);
      expect(initial.isRoof).toBe(false);
      expect(initial.camera.lift).toBeGreaterThan(0);

      // Advance until block is near center of top floor and drop once
      for (let t = 0; t < 600 && game.getPhase() === "swing"; t++) {
        const s = game.getSnapshot();
        if (Math.abs(s.current.x) < 6) {
          expect(game.drop(0)).toBe(true);
          break;
        }
        game.advanceTicks(1);
      }
      while (game.getPhase() !== "ended") {
        game.advanceTicks(1);
      }

      const record = game.getRecord();
      expect(record.inputs.length).toBe(1);
      // Prebuilt 4 floors are not counted as player-built height
      expect(record.result.height).toBe(1);
      expect(record.result.population).toBeGreaterThan(0);
      expect(validateRecord(record).result).toEqual(record.result);

      // Ordinary Quick Tower first drop is still unscored foundation
      const ordinary = new QuickTowerGame({ mode: "quick", assist: false, seed: 42 });
      ordinary.advanceTicks(20);
      ordinary.drop(0);
      while (ordinary.getSnapshot().floors.length === 0) ordinary.advanceTicks(1);
      let save = initializeTracking(emptySave(), "inst-c6", 1000);
      const ordAlloc = allocateRun(save, 1000);
      const ordSummary = makeSummary(ordinary, ordAlloc.context, 2000, "abandoned");
      expect(ordSummary.metrics?.foundation).toBe(1);
      expect(ordSummary.metrics?.signedErrors.length).toBe(0);

      // One Drop single drop is scored (foundation === 0, 1 signedError) and grants 0 XP / 0 Quick PB
      const odAlloc = allocateRun(ordAlloc.save, 3000);
      const odSummary = makeSummary(game, odAlloc.context, 4000, "ended");
      expect(odSummary.metrics?.foundation).toBe(0);
      expect(odSummary.metrics?.signedErrors.length).toBe(1);

      save = settleRun(odAlloc.save, odSummary, record);
      expect(save.progression.xp).toBe(0);
      expect(save.standardQuickBest).toBe(0);
      expect(save.runs).toBe(0);
      expect(save.oneDrop.days.length).toBe(1);
      const odAttempt = extractOneDropResult(odSummary);
      expect(save.oneDrop.days[0].best?.absError).toBe(odAttempt.absError);
      expect(save.oneDrop.days[0].attempts).toBe(1);
    });

    it("simulates full fall and lower collision on a One Drop Miss (>= 100% error)", () => {
      const def = resolveOneDrop("2026-10-20");
      const game = new QuickTowerGame({
        mode: "one-drop",
        assist: false,
        seed: def.seed,
        building: def.classId,
        oneDrop: def,
      });

      // Wait until crane is far off center (> 115px) and drop to trigger a Miss
      let droppedAtX = 0;
      for (let t = 0; t < 2000; t++) {
        const s = game.getSnapshot();
        if (s.phase === "swing" && Math.abs(s.current.x) > 115) {
          droppedAtX = s.current.x;
          game.drop(0);
          break;
        }
        game.advanceTicks(1);
      }
      expect(Math.abs(droppedAtX)).toBeGreaterThan(115);

      let sawMissPhase = false;
      let maxFallY = 0;
      while (game.getPhase() !== "ended") {
        game.advanceTicks(1);
        const s = game.getSnapshot();
        if (s.phase === "miss") sawMissPhase = true;
        if (s.current.y > maxFallY) maxFallY = s.current.y;
      }
      expect(sawMissPhase).toBe(true);
      expect(maxFallY).toBeGreaterThan(300);
      expect(game.getResult().height).toBe(0);
      expect(game.getResult().misses).toBe(1);
    });

    it("computes 40 5%-bins Placement Heatmap with overflow Miss counts, excluding foundation and roof", () => {
      let save = initializeTracking(emptySave(), "inst-hm", 1000);
      const g = new QuickTowerGame(goldenRecord.config);
      let inputIdx = 0;
      for (let tick = 0; tick < goldenRecord.endTick; tick++) {
        if (goldenRecord.inputs[inputIdx]?.tick === tick) {
          g.drop(goldenRecord.inputs[inputIdx].fraction);
          inputIdx++;
        }
        g.advanceTicks(1);
      }
      const alloc = allocateRun(save, 1000);
      const summary = makeSummary(g, alloc.context, 2000);
      save = settleRun(alloc.save, summary, goldenRecord);

      const hmAll = computePlacementHeatmap(save.history, "all");
      expect(hmAll.bins.length).toBe(40);
      expect(hmAll.bins[0].minPercent).toBe(-100);
      expect(hmAll.bins[39].maxPercent).toBe(100);
      expect(hmAll.windowLimit).toBe(50);
      // 11 total inputs: 1 foundation (excluded) + 7 landed body + 3 misses = 10 scored body drops
      expect(hmAll.sampleCount).toBe(10);
      const binMisses = hmAll.bins.reduce((sum, bin) => sum + bin.missCount, 0);
      expect(hmAll.leftOverflowMiss + hmAll.rightOverflowMiss).toBe(2);
      expect(hmAll.leftOverflowMiss + hmAll.rightOverflowMiss + binMisses).toBe(3);

      const hmAssist = computePlacementHeatmap(save.history, "quick-assist");
      expect(hmAssist.sampleCount).toBe(0);
    });
  });

  describe("C6.2 — Replay Viewer Speed/Seek Controls & Personal Ghost", () => {
    it("produces the exact same deterministic result across all playback speeds and seek operations within cache limits", () => {
      for (const speed of REPLAY_SPEEDS) {
        const viewer = new QuickTowerReplay(goldenRecord);
        viewer.setSpeed(speed);
        expect(viewer.getSpeed()).toBe(speed);
        while (viewer.getPhase() !== "ended") {
          viewer.update(1 / 60);
        }
        expect(viewer.getResult()).toEqual(goldenRecord.result);
      }

      const seeker = new QuickTowerReplay(goldenRecord);
      const markers = seeker.getDropMarkers();
      expect(markers.length).toBe(goldenRecord.inputs.length);
      expect(markers[0].isFoundation).toBe(true);

      // Seek forward to drop #5, backward to drop #1, forward to result
      const snap5 = seeker.seekToDrop(5);
      expect(seeker.getTick()).toBe(markers[5].landingTick);
      expect(snap5.floors.length).toBeGreaterThanOrEqual(5);

      const snap1 = seeker.seekToDrop(1);
      expect(seeker.getTick()).toBe(markers[1].landingTick);
      expect(snap1.floors.length).toBe(2);

      const finalSnap = seeker.seekToResult();
      expect(finalSnap.phase).toBe("ended");
      expect(seeker.getResult()).toEqual(goldenRecord.result);

      const stats = seeker.getCacheStats();
      expect(stats.count).toBeLessThanOrEqual(MAX_VIEWER_CACHE_ENTRIES);
      expect(stats.bytes).toBeLessThanOrEqual(MAX_VIEWER_CACHE_BYTES);
    });

    it("resolves Personal Ghost for matching seed/config/version and reports seed-mismatch with retrySameSeedConfig", () => {
      let save = initializeTracking(emptySave(), "inst-ghost", 1000);
      const g = new QuickTowerGame(goldenRecord.config);
      let idx = 0;
      for (let t = 0; t < goldenRecord.endTick; t++) {
        if (goldenRecord.inputs[idx]?.tick === t) {
          g.drop(goldenRecord.inputs[idx].fraction);
          idx++;
        }
        g.advanceTicks(1);
      }
      const alloc = allocateRun(save, 1000);
      save = settleRun(alloc.save, makeSummary(g, alloc.context, 2000), goldenRecord);

      // Matching seed (42) -> available
      const match = resolvePersonalGhost(save, { seed: 42, mode: "quick", assist: false });
      expect(match.status).toBe("available");
      if (match.status === "available") {
        expect(match.ghost.markers.length).toBe(goldenRecord.inputs.length);
        const liveRun = new QuickTowerGame(goldenRecord.config);
        const active = activeGhostMarker(match.ghost, liveRun.getSnapshot());
        expect(active).not.toBeNull();
        expect(active?.sequence).toBe(0);
      }

      // Different seed (99) -> unavailable (seed-mismatch) with retrySameSeedConfig
      const mismatch = resolvePersonalGhost(save, { seed: 99, mode: "quick", assist: false });
      expect(mismatch.status).toBe("unavailable");
      if (mismatch.status === "unavailable") {
        expect(mismatch.reason).toBe("seed-mismatch");
        expect(mismatch.retrySameSeedConfig?.seed).toBe(42);
      }

      // Assist mismatch -> config-mismatch
      const assistMismatch = resolvePersonalGhost(save, { seed: 42, mode: "quick", assist: true });
      expect(assistMismatch.status).toBe("unavailable");
      if (assistMismatch.status === "unavailable") {
        expect(assistMismatch.reason).toBe("config-mismatch");
      }
    });
  });

  describe("C6.3 — Hall of Fame, Skyline Album & Save Budget", () => {
    it("protects up to 5 Hall of Fame pinned summaries across >50 history prunes while retaining at most 3 full replays", () => {
      let save = initializeTracking(emptySave(), "inst-hof", 1000);
      const pinnedIds: string[] = [];

      for (let i = 0; i < 60; i++) {
        const g = new QuickTowerGame({ seed: 100 + i, mode: "quick", assist: false });
        g.advanceTicks(15);
        g.drop(0);
        while (g.getSnapshot().floors.length === 0) g.advanceTicks(1);
        const alloc = allocateRun(save, 1000 + i * 100);
        const summary = makeSummary(g, alloc.context, 1050 + i * 100, "abandoned");
        save = settleRun(alloc.save, summary);
        if (i < HALL_OF_FAME_LIMIT) {
          save = toggleHallOfFame(save, summary.identity.id);
          pinnedIds.push(summary.identity.id);
        }
      }

      expect(save.hallOfFame.length).toBe(HALL_OF_FAME_LIMIT);
      expect(save.history.length).toBe(50);
      for (const pinnedId of pinnedIds) {
        expect(save.history.some(h => h.identity.id === pinnedId)).toBe(true);
      }
      expect(save.replays.length).toBeLessThanOrEqual(3);
    });

    it("captures up to 3 Skyline Album snapshots, rejects base64 images, grants 0 XP, and stays under 256 KiB", () => {
      let save = initializeTracking(emptySave(), "inst-album", 1000);
      const xpBefore = save.progression.xp;

      for (let i = 0; i < SKYLINE_ALBUM_LIMIT + 1; i++) {
        const slot = (i < SKYLINE_ALBUM_LIMIT ? i : 0) as 0 | 1 | 2;
        save = captureSkylineSnapshot(save, slot, 2000 + i * 1000);
      }
      expect(save.album.filter(Boolean).length).toBe(SKYLINE_ALBUM_LIMIT);
      expect(save.progression.xp).toBe(xpBefore);
      expect(save.album[0]?.lots.length).toBe(25);
      expect(save.album[0]?.capturedAt).toBe(5000);

      // Rejects any base64 / data URI injected into album state
      expect(() =>
        validateAlbumState([
          {
            ...save.album[0]!,
            lots: save.album[0]!.lots.map((lot, idx) =>
              idx === 0
                ? {
                    classId: "residential",
                    floors: 5,
                    population: 50,
                    rating: "A",
                    roof: true,
                    skin: "data:image/png;base64,iVBORw0KGgo=",
                    roofSkin: "default",
                  }
                : lot,
            ),
          },
          null,
          null,
        ]),
      ).toThrow();

      const prepared = prepareSave(save);
      const byteSize = saveByteSize(prepared);
      expect(byteSize).toBeLessThanOrEqual(256 * 1024);

      const afterDelete = deleteSkylineSnapshot(prepared, 0);
      expect(afterDelete.album.filter(Boolean).length).toBe(SKYLINE_ALBUM_LIMIT - 1);
    });
  });

  describe("C6.3 — Web Social, Moderation, Share Card 1200×630 & Beat This Tower", () => {
    it("enforces display name moderation, opt-in privacy, publish/revoke ownership, and replay download rate limits", () => {
      const store = createSocialStore();

      expect(validateDisplayName("ab").valid).toBe(false);
      expect(validateDisplayName("a".repeat(25)).valid).toBe(false);
      expect(validateDisplayName("Official Admin").valid).toBe(false);
      expect(validateDisplayName("Kien Truc Su VN").valid).toBe(true);
      expect(defaultPlayerHandle("user-123")).toMatch(/^Architect-\d{4}$/);

      upsertPlayerProfile(store, {
        playerId: "user-1",
        displayName: "Master Builder",
        publicOptIn: false,
        email: "secret@example.com",
        cloudPayload: { token: "private-cloud" },
      });
      // Not opted-in -> profile not public
      expect(getPublicProfile(store, "user-1")).toBeNull();

      // Opt-in -> public profile exposes curated fields only, never email or cloudPayload
      upsertPlayerProfile(store, { playerId: "user-1", publicOptIn: true });
      const pubProfile = getPublicProfile(store, "user-1");
      expect(pubProfile).not.toBeNull();
      expect(JSON.stringify(pubProfile)).not.toContain("secret@example.com");
      expect(JSON.stringify(pubProfile)).not.toContain("private-cloud");

      // Unauthenticated publish rejected
      expect(publishTower(store, { ownerId: null, runId: "r1", record: goldenRecord }).ok).toBe(false);

      // Tampered replay rejected
      const tampered: RunRecord = {
        ...goldenRecord,
        result: { ...goldenRecord.result, population: 9999 },
      };
      const tamperedRes = publishTower(store, { ownerId: "user-1", runId: "r-tamper", record: tampered });
      expect(tamperedRes.ok).toBe(false);

      // Valid publish + idempotency
      const pub1 = publishTower(store, {
        ownerId: "user-1",
        runId: "r-valid",
        record: goldenRecord,
        privateMetadata: { email: "secret@example.com", ip: "10.0.0.1" },
      });
      expect(pub1.ok).toBe(true);
      if (!pub1.ok) throw new Error("publish failed");
      const pub2 = publishTower(store, { ownerId: "user-1", runId: "r-valid", record: goldenRecord });
      expect(pub2.ok && pub2.tower.id).toBe(pub1.tower.id);
      expect(JSON.stringify(pub1.tower)).not.toContain("secret@example.com");
      expect(JSON.stringify(pub1.tower)).not.toContain("10.0.0.1");

      // Rate limit on public replay download
      for (let i = 0; i < REPLAY_DOWNLOAD_RATE_LIMIT; i++) {
        const dl = downloadPublicReplay(store, { towerId: pub1.tower.id, clientKey: "ip-1", now: 1000 + i });
        expect(dl.ok).toBe(true);
      }
      const rateLimited = downloadPublicReplay(store, { towerId: pub1.tower.id, clientKey: "ip-1", now: 1050 });
      expect(rateLimited.ok).toBe(false);
      if (!rateLimited.ok) expect(rateLimited.status).toBe(429);

      // Report & moderation disable
      const report = reportPublicEntity(store, {
        reporterId: "user-2",
        targetType: "tower",
        targetId: pub1.tower.id,
        reason: "Suspicious name",
      });
      expect(report.ok).toBe(true);
      moderateEntity(store, { targetType: "tower", targetId: pub1.tower.id, disable: true });
      expect(getPublicTower(store, pub1.tower.id)).toBeNull();
      moderateEntity(store, { targetType: "tower", targetId: pub1.tower.id, disable: false });
      expect(getPublicTower(store, pub1.tower.id)).not.toBeNull();

      // Unauthorized revoke rejected; owner revoke disables tower and challenge
      const badRevoke = revokeTower(store, { towerId: pub1.tower.id, actorId: "user-2" });
      expect(badRevoke.ok).toBe(false);
      const okRevoke = revokeTower(store, { towerId: pub1.tower.id, actorId: "user-1" });
      expect(okRevoke.ok).toBe(true);
      expect(getPublicTower(store, pub1.tower.id)).toBeNull();
      expect(getPublicChallenge(store, pub1.challengeId!)).toBeNull();
    });

    it("renders a valid 1200×630 Share Card PNG with exact verified numbers and safe long-name truncation in EN/VI", () => {
      const store = createDemoSocialStore();
      for (const locale of ["en", "vi"] as const) {
        const card = getTowerShareCard(store, "tower-1", locale);
        expect(card).not.toBeNull();
        if (!card) throw new Error("missing card");
        expect(card.width).toBe(SHARE_CARD_WIDTH);
        expect(card.height).toBe(SHARE_CARD_HEIGHT);
        expect(card.overflow).toBe(false);
        expect(card.exactNumbers.population).toBe(goldenRecord.result.population);
        expect(card.exactNumbers.height).toBe(goldenRecord.result.height);
        expect(card.exactNumbers.physicsVersion).toBe(PHYSICS_VERSION);
        expect(card.exactNumbers.rulesetVersion).toBe(RULESET_VERSION);

        // Verify PNG binary signature and IHDR dimensions
        expect(Array.from(card.png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
        const view = new DataView(card.png.buffer, card.png.byteOffset, card.png.byteLength);
        expect(view.getUint32(16, false)).toBe(1200);
        expect(view.getUint32(20, false)).toBe(630);
        // Verify IDAT zlib payload decompresses cleanly to 1200x630 RGB scanlines
        const idatLen = view.getUint32(33, false);
        const idatData = card.png.subarray(41, 41 + idatLen);
        const rawScanlines = inflateSync(idatData);
        expect(rawScanlines.length).toBe((1 + 1200 * 3) * 630);
      }

      // Very long architect name is truncated safely without overflowing
      const longCard = renderShareCardPng(
        {
          towerId: "t-long",
          displayName: "VeryLongArchitectDisplayNameThatExceedsTwentyFourCharacters",
          mode: "quick",
          population: 88,
          height: 8,
          accuracy: 83.4,
          perfectCount: 1,
          rating: "B",
        },
        "en",
      );
      expect(longCard.truncatedDisplayName.length).toBeLessThanOrEqual(24);
      expect(longCard.truncatedDisplayName.endsWith("...")).toBe(true);
      expect(longCard.overflow).toBe(false);
    });

    it("issues same-seed Beat This Tower tickets, blocks self-challenge/duplicate/tamper/retired-version, and protects pending City/Daily", () => {
      const store = createDemoSocialStore();

      // Self-challenge blocked
      const selfTicket = issueChallengeTicket(store, {
        challengeId: "challenge-2",
        challengerId: "demo-architect",
        now: 1000,
      });
      expect(selfTicket.ok).toBe(false);
      if (!selfTicket.ok) expect(selfTicket.code).toBe("SELF_CHALLENGE_FORBIDDEN");

      // Retired version blocked clearly instead of running mismatched ruleset
      const retiredTicket = issueChallengeTicket(store, {
        challengeId: "challenge-retired",
        challengerId: "challenger-1",
        now: 1000,
      });
      expect(retiredTicket.ok).toBe(false);
      if (!retiredTicket.ok) expect(retiredTicket.code).toBe("VERSION_RETIRED");

      // Valid challenger ticket + idempotent active ticket
      const ticket1 = issueChallengeTicket(store, {
        challengeId: "challenge-2",
        challengerId: "challenger-1",
        now: 1000,
      });
      expect(ticket1.ok).toBe(true);
      if (!ticket1.ok) throw new Error("ticket failed");
      const ticketDup = issueChallengeTicket(store, {
        challengeId: "challenge-2",
        challengerId: "challenger-1",
        now: 1500,
      });
      expect(ticketDup.ok && ticketDup.ticket.ticketId).toBe(ticket1.ticket.ticketId);

      // Tampered submission rejected without consuming ticket
      const tamperedAttempt = submitChallengeAttempt(store, {
        challengeId: "challenge-2",
        ticketId: ticket1.ticket.ticketId,
        challengerId: "challenger-1",
        record: {
          ...goldenRecord,
          result: { ...goldenRecord.result, population: 500 },
        },
        now: 2000,
      });
      expect(tamperedAttempt.ok).toBe(false);
      if (!tamperedAttempt.ok) expect(tamperedAttempt.code).toBe("TAMPERED_RESULT");

      // Valid submission succeeds once and blocks ticket reuse
      const validAttempt = submitChallengeAttempt(store, {
        challengeId: "challenge-2",
        ticketId: ticket1.ticket.ticketId,
        challengerId: "challenger-1",
        record: goldenRecord,
        now: 2100,
      });
      expect(validAttempt.ok).toBe(true);
      if (validAttempt.ok) {
        expect(validAttempt.outcome.winner).toBe("tie");
      }

      const reusedAttempt = submitChallengeAttempt(store, {
        challengeId: "challenge-2",
        ticketId: ticket1.ticket.ticketId,
        challengerId: "challenger-1",
        record: goldenRecord,
        now: 2200,
      });
      expect(reusedAttempt.ok).toBe(false);
      if (!reusedAttempt.ok) expect(reusedAttempt.code).toBe("TICKET_ALREADY_USED");

      // W1 tie-break order: population -> height -> accuracy -> perfectCount -> durationTicks
      expect(
        compareChallengeResult(
          { ...goldenRecord.result, durationTicks: 1200 },
          { ...goldenRecord.result, durationTicks: 1388 },
        ),
      ).toBe("challenger");

      // Pending City construction requires confirmation before starting a challenge
      const saveWithCity = beginDistrictTower(emptySave(), "downtown", 12, "residential", 42, 1000);
      const guard = checkPendingRunGuard(saveWithCity);
      expect(guard.requiresConfirmation).toBe(true);
      expect(guard.hasPendingCity).toBe(true);
    });
  });
});
