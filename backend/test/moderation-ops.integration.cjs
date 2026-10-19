const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Redis = require('ioredis');
const { Client } = require('pg');
const { DataSource } = require('typeorm');
const { cityBloxxCore: core } = require('../dist/src/common/city-bloxx-core');
const { typeormOptions } = require('../dist/src/config/typeorm-options');
const { AnalyticsService } = require('../dist/src/modules/city-bloxx/analytics.service');
const { BoardsService } = require('../dist/src/modules/city-bloxx/boards.service');
const { GamePolicyService } = require('../dist/src/modules/city-bloxx/common/game-policy.service');
const { GameStore } = require('../dist/src/modules/city-bloxx/common/game-store.service');
const { GameWorkerService } = require('../dist/src/modules/city-bloxx/common/game-worker.service');
const { MaintenanceService } = require('../dist/src/modules/city-bloxx/maintenance.service');
const { RunsService } = require('../dist/src/modules/city-bloxx/runs.service');
const { VerificationService } = require('../dist/src/modules/city-bloxx/verification.service');
const { SecurityService } = require('../dist/src/modules/security/security.service');
const { createBackup, rehearseRestore } = require('../scripts/backup-restore.cjs');

if (
  !/^auth_test_[a-z0-9_]+$/.test(process.env.TEST_DATABASE || '') ||
  process.env.DB_DATABASE !== process.env.TEST_DATABASE
) {
  throw new Error('Disposable auth_test database required');
}

const db = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.TEST_DATABASE,
});
const base = process.env.TEST_GATEWAY_BASE_URL || process.env.TEST_BASE_URL;
const directBase = process.env.TEST_BASE_URL || base;
const allowedOrigin = process.env.TEST_GATEWAY_ORIGIN || 'http://localhost:56789';
let passed = 0;

async function req(method, route, body, user, extraHeaders = {}, baseUrl = base) {
  const r = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(user ? { authorization: `Bearer ${user.accessToken}` } : {}),
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let json = null;
  try {
    json = await r.json();
  } catch {
    json = null;
  }
  return { status: r.status, json, headers: r.headers };
}

function status(r, expected) {
  assert.equal(
    r.status,
    expected,
    `HTTP ${r.status} expected ${expected}: ${JSON.stringify(r.json)}`,
  );
  return r.json?.data;
}

async function test(name, fn) {
  await fn();
  passed++;
  console.log(`PASS moderation-ops: ${name}`);
}

function generateRecord(ticket, kind = 'fail') {
  const g = new core.QuickTowerGame(ticket.config);
  while (g.getPhase() !== 'ended' && g.getTick() < 60000) {
    const s = g.getSnapshot();
    if (s.phase === 'swing') {
      const prev = s.floors.at(-1);
      const target = prev
        ? prev.x + s.swayOffset * core.floorSwayWeight(s.floors.length - 1)
        : 0;
      const shouldFail =
        (kind === 'fail' && s.floors.length >= 2) ||
        (kind === 'tall' && s.floors.length >= 4);
      if (shouldFail ? Math.abs(s.current.x - target) > 110 : Math.abs(s.current.x - target) < 3) {
        g.drop(0);
      }
    }
    g.advanceTicks(1);
  }
  assert.equal(g.getPhase(), 'ended');
  return g.getRecord();
}

const finishBody = (t, r) => ({
  runId: t.runId,
  ticket: t.ticket,
  physicsVersion: t.physicsVersion,
  rulesetVersion: t.rulesetVersion,
  inputs: r.inputs,
  endTick: r.endTick,
});

async function main() {
  await db.connect();
  const source = new DataSource(typeormOptions);
  await source.initialize();
  const redis = new Redis(process.env.REDIS_URL);
  const infra = { redis };
  const support = require('./game-test-support.cjs')(db, base);
  const users = [];
  const createUser = async () => {
    const u = await support.user();
    users.push(u);
    return u;
  };

  const security = new SecurityService(source);
  const store = new GameStore(source, new GamePolicyService(security));
  const runs = new RunsService(store, infra, source);
  const pool = new GameWorkerService();
  const boards = new BoardsService(source, store, infra);
  const verifier = new VerificationService(runs, pool, store, boards, security);
  const maintenance = new MaintenanceService(source, security, infra);

  const settleRun = async (u, kind = 'fail') => {
    const t = status(
      await req('POST', '/city-bloxx/runs/start', {
        mode: 'quick',
        clientRequestId: randomUUID(),
      }, u),
      200,
    );
    const rec = generateRecord(t, kind);
    const f = finishBody(t, rec);
    status(await req('POST', '/city-bloxx/runs/finish', f, u), 202);
    const job = await runs.claim(t.runId);
    assert.ok(job, 'expected claimable run job');
    await verifier.process(job);
    return { t, rec, f };
  };

  const readerRoleId = randomUUID();
  try {
    const player = await createUser();
    const moderator = await createUser();
    const readerOnly = await createUser();

    // Grant admin role to moderator (has city_bloxx_moderation:read + update)
    await db.query(
      `INSERT INTO user_roles(user_id, role_id)
       SELECT $1, id FROM roles WHERE code = 'admin'`,
      [moderator.id],
    );
    // Create a custom role with only city_bloxx_moderation:read for readerOnly
    await db.query(
      `INSERT INTO roles(id, code, name, is_system, is_active)
       VALUES ($1, $2, 'City Bloxx Read Only Moderator', false, true)`,
      [readerRoleId, `cb_mod_read_${readerRoleId.slice(0, 8)}`],
    );
    await db.query(
      `INSERT INTO role_permissions(role_id, permission_id)
       SELECT $1, id FROM permissions WHERE code = 'city_bloxx_moderation:read'`,
      [readerRoleId],
    );
    await db.query(
      `INSERT INTO user_roles(user_id, role_id) VALUES ($1, $2)`,
      [readerOnly.id, readerRoleId],
    );

    let lowRun;
    let highRun;
    let invalidRun;

    await test('Swagger documents W1.8 moderation, analytics, and catalog endpoints; RBAC and no-score-edit enforced', async () => {
      const swaggerUrl = directBase.replace('/api/v1', '/swagger-json');
      const swagger = await (await fetch(swaggerUrl)).json();
      for (const expectedPath of [
        '/api/v1/admin/city-bloxx/runs',
        '/api/v1/admin/city-bloxx/runs/{runId}',
        '/api/v1/admin/city-bloxx/runs/{runId}/quarantine',
        '/api/v1/admin/city-bloxx/runs/{runId}/release',
        '/api/v1/city-bloxx/catalog',
        '/api/v1/city-bloxx/analytics/events',
        '/api/v1/city-bloxx/analytics/guest-events',
      ]) {
        assert.ok(swagger.paths[expectedPath], `Missing Swagger path ${expectedPath}`);
      }

      lowRun = await settleRun(player, 'fail');
      highRun = await settleRun(player, 'tall');
      assert.ok(highRun.rec.result.population > lowRun.rec.result.population);

      // Standard player is denied moderation read/update
      status(await req('GET', '/admin/city-bloxx/runs', undefined, player), 403);
      status(
        await req(
          'POST',
          `/admin/city-bloxx/runs/${highRun.t.runId}/quarantine`,
          { reason: 'player self quarantine attempt' },
          player,
        ),
        403,
      );

      // Read-only moderator can list/detail but cannot quarantine or release
      const readList = status(
        await req(
          'GET',
          '/admin/city-bloxx/runs?moderationState=visible',
          undefined,
          readerOnly,
        ),
        200,
      );
      assert.ok(readList.runs.some((r) => r.runId === highRun.t.runId));
      const detail = status(
        await req(
          'GET',
          `/admin/city-bloxx/runs/${highRun.t.runId}`,
          undefined,
          readerOnly,
        ),
        200,
      );
      assert.equal(detail.runId, highRun.t.runId);
      assert.equal(detail.inputsPresent, true);
      assert.equal(detail.inputCount, highRun.rec.inputs.length);
      for (const forbidden of [
        'inputs',
        'token_hash',
        'encrypted_start_response',
        'submitter_session_id',
        'email',
        'password_hash',
      ]) {
        assert.equal(
          forbidden in detail,
          false,
          `Moderation detail leaked ${forbidden}`,
        );
      }
      status(
        await req(
          'POST',
          `/admin/city-bloxx/runs/${highRun.t.runId}/quarantine`,
          { reason: 'insufficient permission' },
          readerOnly,
        ),
        403,
      );

      // Arbitrary score edit fields are rejected by strict DTO validation (422 PayloadValidationPipe)
      status(
        await req(
          'POST',
          `/admin/city-bloxx/runs/${highRun.t.runId}/quarantine`,
          { reason: 'attempt score edit', population: 999999 },
          moderator,
        ),
        422,
      );
      status(
        await req(
          'POST',
          `/admin/city-bloxx/runs/${highRun.t.runId}/release`,
          { reason: 'attempt score edit', result: { population: 999999 } },
          moderator,
        ),
        422,
      );
    });

    await test('quarantine hides run from board, restores previous best run, extends input retention to 90d, and release resimulates first', async () => {
      const beforeMe = status(
        await req('GET', '/city-bloxx/leaderboards/quick/me', undefined, player),
        200,
      );
      assert.equal(
        Number(beforeMe.entry.population),
        highRun.rec.result.population,
      );

      const quarantined = status(
        await req(
          'POST',
          `/admin/city-bloxx/runs/${highRun.t.runId}/quarantine`,
          { reason: 'Suspected macro timing review' },
          moderator,
        ),
        200,
      );
      assert.equal(quarantined.moderationState, 'quarantined');
      const expiryMs =
        Date.parse(quarantined.inputsExpiresAt) -
        Date.parse(quarantined.firstReceivedAt);
      assert.ok(
        expiryMs >= 89 * 86400 * 1000,
        `Expected >= 90d retention window on quarantined run, got ${expiryMs}`,
      );

      // Default admin runs list returns quarantined runs
      const qList = status(
        await req('GET', '/admin/city-bloxx/runs', undefined, moderator),
        200,
      );
      assert.ok(qList.runs.some((r) => r.runId === highRun.t.runId));

      // Leaderboard now shows player's remaining valid lower run instead of blanking standing
      const duringMe = status(
        await req('GET', '/city-bloxx/leaderboards/quick/me', undefined, player),
        200,
      );
      assert.ok(duringMe.entry, 'Expected remaining valid run on leaderboard');
      assert.equal(
        Number(duringMe.entry.population),
        lowRun.rec.result.population,
      );

      // Release resimulates from raw inputs and restores high run as best
      const released = status(
        await req(
          'POST',
          `/admin/city-bloxx/runs/${highRun.t.runId}/release`,
          { reason: 'Verified clean replay' },
          moderator,
        ),
        200,
      );
      assert.equal(released.moderationState, 'visible');

      const afterMe = status(
        await req('GET', '/city-bloxx/leaderboards/quick/me', undefined, player),
        200,
      );
      assert.equal(
        Number(afterMe.entry.population),
        highRun.rec.result.population,
      );

      const audits = await db.query(
        `SELECT action, metadata FROM audit_logs
         WHERE target_id = $1 AND action IN ('city_bloxx.run.quarantine', 'city_bloxx.run.release')
         ORDER BY created_at ASC`,
        [highRun.t.runId],
      );
      assert.equal(audits.rows.length, 2);
      assert.equal(audits.rows[0].action, 'city_bloxx.run.quarantine');
      assert.equal(audits.rows[0].metadata.reason, 'Suspected macro timing review');
      assert.equal(audits.rows[1].action, 'city_bloxx.run.release');
      assert.equal(audits.rows[1].metadata.reason, 'Verified clean replay');
    });

    await test('server emits verification_reject telemetry on invalid run; rejected or input-expired runs cannot be released', async () => {
      const t = status(
        await req('POST', '/city-bloxx/runs/start', {
          mode: 'quick',
          clientRequestId: randomUUID(),
        }, player),
        200,
      );
      invalidRun = {
        t,
        f: {
          runId: t.runId,
          ticket: t.ticket,
          physicsVersion: t.physicsVersion,
          rulesetVersion: t.rulesetVersion,
          inputs: [],
          endTick: 1,
        },
      };
      status(await req('POST', '/city-bloxx/runs/finish', invalidRun.f, player), 202);
      const job = await runs.claim(t.runId);
      await verifier.process(job);

      const serverEvents = await db.query(
        `SELECT * FROM city_bloxx_analytics_events
         WHERE user_id = $1 AND type = 'verification_reject' AND source = 'server'`,
        [player.id],
      );
      assert.equal(serverEvents.rows.length, 1);
      assert.equal(serverEvents.rows[0].properties.runId, t.runId);
      assert.equal(serverEvents.rows[0].properties.errorCode, 'GAME_RUN_INVALID');
      assert.equal(serverEvents.rows[0].properties.unverifiedTelemetry, false);

      // Quarantine the rejected run, then attempt release -> 409 GAME_MODERATION_NOT_RELEASABLE
      status(
        await req(
          'POST',
          `/admin/city-bloxx/runs/${t.runId}/quarantine`,
          { reason: 'Quarantine rejected run' },
          moderator,
        ),
        200,
      );
      const badRelease = await req(
        'POST',
        `/admin/city-bloxx/runs/${t.runId}/release`,
        { reason: 'Attempt to release rejected run' },
        moderator,
      );
      assert.equal(badRelease.status, 409);
      assert.equal(badRelease.json.errorCode, 'GAME_MODERATION_NOT_RELEASABLE');
    });

    await test('public catalog and authenticated/guest analytics enforce allowlist, dedupe, origin, PII rejection, and rate limits', async () => {
      const catDirect = await req('GET', '/city-bloxx/catalog', undefined, undefined, {}, directBase);
      assert.equal(catDirect.status, 200);
      assert.equal(catDirect.headers.get('cache-control'), 'public, max-age=300');
      assert.equal(catDirect.json.data.versions.physicsVersion, core.PHYSICS_VERSION);
      assert.equal(catDirect.json.data.buildings.length, 4);
      assert.ok(catDirect.json.data.cosmetics.length > 0);

      const catGateway = await req('GET', '/city-bloxx/catalog');
      assert.equal(catGateway.status, 200);
      assert.equal(catGateway.json.data.buildings.length, 4);

      const eventId = randomUUID();
      const authBatch = status(
        await req(
          'POST',
          '/city-bloxx/analytics/events',
          {
            events: [
              {
                eventId,
                type: 'mode_start',
                version: core.RULESET_VERSION,
                mode: 'quick',
                classId: 'residential',
                properties: { fps: 60 },
              },
              {
                eventId,
                type: 'mode_start',
                version: core.RULESET_VERSION,
                mode: 'quick',
              },
            ],
          },
          player,
        ),
        200,
      );
      assert.deepEqual(authBatch, {
        accepted: 1,
        duplicates: 1,
        unverifiedTelemetry: true,
      });

      // Repeating same eventId in a second request is idempotently deduplicated
      const retryBatch = status(
        await req(
          'POST',
          '/city-bloxx/analytics/events',
          {
            events: [
              {
                eventId,
                type: 'mode_start',
                version: core.RULESET_VERSION,
                mode: 'quick',
              },
            ],
          },
          player,
        ),
        200,
      );
      assert.deepEqual(retryBatch, {
        accepted: 0,
        duplicates: 1,
        unverifiedTelemetry: true,
      });

      // Client cannot emit server-only verification_reject or pass userId/PII
      status(
        await req(
          'POST',
          '/city-bloxx/analytics/events',
          {
            events: [
              {
                eventId: randomUUID(),
                type: 'verification_reject',
                version: core.RULESET_VERSION,
              },
            ],
          },
          player,
        ),
        422,
      );
      status(
        await req(
          'POST',
          '/city-bloxx/analytics/events',
          {
            userId: player.id,
            events: [
              {
                eventId: randomUUID(),
                type: 'retry',
                version: core.RULESET_VERSION,
              },
            ],
          },
          player,
        ),
        422,
      );
      const piiRes = await req(
        'POST',
        '/city-bloxx/analytics/events',
        {
          events: [
            {
              eventId: randomUUID(),
              type: 'save_error',
              version: core.RULESET_VERSION,
              properties: { accessToken: 'secret-token' },
            },
          ],
        },
        player,
      );
      assert.equal(piiRes.status, 400);
      assert.equal(piiRes.json.errorCode, 'GAME_ANALYTICS_INVALID');

      // Guest analytics requires trusted Origin/Referer (CORS blocks untrusted Origin header; service blocks missing Origin / untrusted Referer)
      const corsBlockedGuest = await req(
        'POST',
        '/city-bloxx/analytics/guest-events',
        {
          anonymousSessionId: 'guest_sess_abcdef123456',
          events: [
            {
              eventId: randomUUID(),
              type: 'session_start',
              version: core.RULESET_VERSION,
            },
          ],
        },
        undefined,
        { origin: 'https://untrusted.example' },
      );
      assert.equal(corsBlockedGuest.status, 403);
      assert.equal(corsBlockedGuest.json.errorCode, 'GAME_HTTP_403');

      const untrustedGuest = await req(
        'POST',
        '/city-bloxx/analytics/guest-events',
        {
          anonymousSessionId: 'guest_sess_abcdef123456',
          events: [
            {
              eventId: randomUUID(),
              type: 'session_start',
              version: core.RULESET_VERSION,
            },
          ],
        },
        undefined,
        { referer: 'https://untrusted.example/play' },
      );
      assert.equal(untrustedGuest.status, 403);
      assert.equal(untrustedGuest.json.errorCode, 'GAME_ORIGIN_FORBIDDEN');

      const guestEventId = randomUUID();
      const trustedGuest = status(
        await req(
          'POST',
          '/city-bloxx/analytics/guest-events',
          {
            anonymousSessionId: 'guest_sess_abcdef123456',
            events: [
              {
                eventId: guestEventId,
                type: 'session_start',
                version: core.RULESET_VERSION,
                properties: { locale: 'vi' },
              },
            ],
          },
          undefined,
          { origin: allowedOrigin },
        ),
        200,
      );
      assert.deepEqual(trustedGuest, {
        accepted: 1,
        duplicates: 0,
        unverifiedTelemetry: true,
      });

      const storedGuest = (
        await db.query(
          'SELECT * FROM city_bloxx_analytics_events WHERE event_id = $1',
          [guestEventId],
        )
      ).rows[0];
      assert.equal(storedGuest.user_id, null);
      assert.match(storedGuest.anonymous_session_hash, /^[0-9a-f]{64}$/);
      assert.equal(storedGuest.properties.unverifiedTelemetry, true);

      // Rate limit guest session (30/min) -> 429 with Retry-After: 60 (via directBase so X-Forwarded-For varies per request while session stays fixed)
      const limitedSession = `guest_rate_${randomUUID().replace(/-/g, '')}`;
      for (let i = 0; i < 30; i++) {
        status(
          await req(
            'POST',
            '/city-bloxx/analytics/guest-events',
            {
              anonymousSessionId: limitedSession,
              events: [
                {
                  eventId: randomUUID(),
                  type: 'retry',
                  version: core.RULESET_VERSION,
                },
              ],
            },
            undefined,
            {
              origin: allowedOrigin,
              'x-forwarded-for': `10.99.${Math.floor(i / 10)}.${(i % 10) + 1}`,
            },
            directBase,
          ),
          200,
        );
      }
      const overLimit = await req(
        'POST',
        '/city-bloxx/analytics/guest-events',
        {
          anonymousSessionId: limitedSession,
          events: [
            {
              eventId: randomUUID(),
              type: 'retry',
              version: core.RULESET_VERSION,
            },
          ],
        },
        undefined,
        { origin: allowedOrigin, 'x-forwarded-for': '10.99.9.99' },
        directBase,
      );
      assert.equal(overLimit.status, 429);
      assert.equal(overLimit.headers.get('retry-after'), '60');
      assert.equal(overLimit.json.errorCode, 'GAME_RATE_LIMITED');

      // Direct service check for Redis limiter outage -> 503 GAME_RATE_UNAVAILABLE
      const brokenAnalytics = new AnalyticsService(source, store, {
        redis: {
          eval: async () => {
            throw new Error('redis unavailable');
          },
        },
      });
      const claims = require('jsonwebtoken').decode(player.accessToken);
      await assert.rejects(
        () =>
          brokenAnalytics.recordAuthenticated(
            { userId: player.id, sessionId: claims.sid, version: claims.ver },
            {
              events: [
                {
                  eventId: randomUUID(),
                  type: 'retry',
                  version: core.RULESET_VERSION,
                },
              ],
            },
          ),
        (err) =>
          err.getStatus() === 503 &&
          err.getResponse()?.errorCode === 'GAME_RATE_UNAVAILABLE',
      );
    });

    await test('retention sweep purges 30d visible inputs while protecting <90d quarantined inputs, preserves receipts/boards, and is replay-safe', async () => {
      // Backdate lowRun (visible) to 31 days ago so its inputs expire
      await db.query(
        `ALTER TABLE city_bloxx_run_submissions DISABLE TRIGGER cb_submission_received_at`,
      );
      try {
        await db.query(
          `UPDATE city_bloxx_run_submissions
           SET first_received_at = now() - interval '31 days',
               inputs_expires_at = now() - interval '1 day'
           WHERE run_id = $1`,
          [lowRun.t.runId],
        );
      } finally {
        await db.query(
          `ALTER TABLE city_bloxx_run_submissions ENABLE TRIGGER cb_submission_received_at`,
        );
      }

      // Quarantine highRun and backdate it to 45 days ago (< 90 days) with expired inputs_expires_at:
      // sweep must NOT purge quarantined inputs before 90 days!
      status(
        await req(
          'POST',
          `/admin/city-bloxx/runs/${highRun.t.runId}/quarantine`,
          { reason: 'Hold for 90-day retention test' },
          moderator,
        ),
        200,
      );
      await db.query(
        `ALTER TABLE city_bloxx_run_submissions DISABLE TRIGGER cb_submission_received_at`,
      );
      try {
        await db.query(
          `UPDATE city_bloxx_run_submissions
           SET first_received_at = now() - interval '45 days',
               inputs_expires_at = now() - interval '1 hour'
           WHERE run_id = $1`,
          [highRun.t.runId],
        );
      } finally {
        await db.query(
          `ALTER TABLE city_bloxx_run_submissions ENABLE TRIGGER cb_submission_received_at`,
        );
      }

      // Insert an expired analytics event to verify event retention cleanup
      const expiredEventId = randomUUID();
      await db.query(
        `INSERT INTO city_bloxx_analytics_events
         (event_id, user_id, source, type, version, properties, server_received_at, expires_at)
         VALUES ($1, $2, 'client', 'retry', $3, '{"unverifiedTelemetry":true}'::jsonb, now() - interval '31 days', now() - interval '1 day')`,
        [expiredEventId, player.id, core.RULESET_VERSION],
      );

      const firstSweep = await maintenance.sweep(true);
      assert.equal(firstSweep.skipped, false);
      assert.ok(firstSweep.purgedInputs >= 1);
      assert.ok(firstSweep.deletedEvents >= 1);

      // lowRun (visible, 31d old) had its inputs purged, but its result, metrics, and idempotent receipt remain!
      const lowRow = (
        await db.query(
          'SELECT inputs, result, metrics, submission_hash FROM city_bloxx_run_submissions WHERE run_id = $1',
          [lowRun.t.runId],
        )
      ).rows[0];
      assert.equal(lowRow.inputs, null);
      assert.deepEqual(lowRow.result, lowRun.rec.result);
      const idempotentFinish = status(
        await req('POST', '/city-bloxx/runs/finish', lowRun.f, player),
        200,
      );
      assert.deepEqual(idempotentFinish.result, lowRun.rec.result);

      // highRun (quarantined, 45d old < 90d) still has its inputs!
      const highRowAt45d = (
        await db.query(
          'SELECT inputs FROM city_bloxx_run_submissions WHERE run_id = $1',
          [highRun.t.runId],
        )
      ).rows[0];
      assert.ok(
        Array.isArray(highRowAt45d.inputs),
        'Quarantined inputs must be kept until 90 days',
      );

      // Now age highRun past 90 days (91 days), run CLI maintain twice, and verify release returns 409 GAME_MODERATION_INPUTS_EXPIRED
      await db.query(
        `ALTER TABLE city_bloxx_run_submissions DISABLE TRIGGER cb_submission_received_at`,
      );
      try {
        await db.query(
          `UPDATE city_bloxx_run_submissions
           SET first_received_at = now() - interval '91 days',
               inputs_expires_at = now() - interval '1 day'
           WHERE run_id = $1`,
          [highRun.t.runId],
        );
      } finally {
        await db.query(
          `ALTER TABLE city_bloxx_run_submissions ENABLE TRIGGER cb_submission_received_at`,
        );
      }

      for (let i = 0; i < 2; i++) {
        const cliMaintain = spawnSync(
          process.execPath,
          ['-r', 'tsconfig-paths/register', 'dist/src/cli.js', 'maintain'],
          { env: process.env, encoding: 'utf8' },
        );
        assert.equal(cliMaintain.status, 0, cliMaintain.stderr || cliMaintain.stdout);
      }

      const highRowAt91d = (
        await db.query(
          'SELECT inputs, result FROM city_bloxx_run_submissions WHERE run_id = $1',
          [highRun.t.runId],
        )
      ).rows[0];
      assert.equal(highRowAt91d.inputs, null);
      assert.deepEqual(highRowAt91d.result, highRun.rec.result);

      const expiredRelease = await req(
        'POST',
        `/admin/city-bloxx/runs/${highRun.t.runId}/release`,
        { reason: 'Attempt release after 90d input expiry' },
        moderator,
      );
      assert.equal(expiredRelease.status, 409);
      assert.equal(expiredRelease.json.errorCode, 'GAME_MODERATION_INPUTS_EXPIRED');
    });

    await test('daily backup with 14-day pruning and separate-DB restore rehearsal preserve auth+game tables and boot app', async () => {
      // Write a cloud save for player so restore rehearsal also verifies cloud save hash integrity
      const initialSave = core.emptySave();
      status(
        await req(
          'PUT',
          '/city-bloxx/save',
          {
            expectedRevision: '0',
            mutationId: randomUUID(),
            schema: 4,
            payload: initialSave,
          },
          player,
        ),
        200,
      );

      const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'city-bloxx-backups-'));
      try {
        // Seed an expired 16-day-old backup and a valid 5-day-old backup to verify 14-day retention pruning
        const oldDate = new Date(Date.now() - 16 * 86400 * 1000);
        const recentDate = new Date(Date.now() - 5 * 86400 * 1000);
        const oldCreated = await createBackup({
          env: process.env,
          backupDir,
          retainDays: 14,
          now: oldDate,
        });
        const recentCreated = await createBackup({
          env: process.env,
          backupDir,
          retainDays: 14,
          now: recentDate,
        });
        const latestCreated = await createBackup({
          env: process.env,
          backupDir,
          retainDays: 14,
          now: new Date(),
        });

        assert.equal(
          fs.existsSync(oldCreated.dumpPath),
          false,
          '16-day-old backup dump should be pruned',
        );
        assert.equal(
          fs.existsSync(oldCreated.manifestPath),
          false,
          '16-day-old backup manifest should be pruned',
        );
        assert.equal(
          fs.existsSync(recentCreated.dumpPath),
          true,
          '5-day-old backup dump should be retained',
        );
        assert.equal(
          fs.existsSync(latestCreated.dumpPath),
          true,
          'Latest backup dump should be retained',
        );

        const manifestText = fs.readFileSync(latestCreated.manifestPath, 'utf8');
        assert.equal(
          /password|accessToken|refreshToken|@example\.test/i.test(manifestText),
          false,
          'Backup manifest must not contain secrets or PII',
        );

        const rehearsed = await rehearseRestore({
          env: process.env,
          dumpPath: latestCreated.dumpPath,
          manifestPath: latestCreated.manifestPath,
          bootApp: true,
        });
        assert.equal(rehearsed.verifiedTables, 15);
        assert.equal(rehearsed.appVerification.readyStatus, 200);
        assert.ok(rehearsed.appVerification.quickBoardEntries >= 1);
        assert.ok(rehearsed.appVerification.catalogCosmetics >= 1);

        // Confirm disposable restore DB was dropped after rehearsal
        const gone = await db.query(
          'SELECT count(*)::int AS count FROM pg_database WHERE datname = $1',
          [rehearsed.restoredDatabase],
        );
        assert.equal(gone.rows[0].count, 0);
      } finally {
        fs.rmSync(backupDir, { recursive: true, force: true });
      }
    });

    console.log(`MODERATION/TELEMETRY/OPERATIONS SUITE: ${passed} scenarios passed`);
  } finally {
    await verifier.onModuleDestroy();
    await pool.onModuleDestroy();
    for (const u of users) {
      for (const k of ['start', 'finish', 'status', 'analytics', 'save']) {
        await redis.del(`city-bloxx:rate:${k}:${u.id}`).catch(() => undefined);
      }
    }
    await db
      .query('DELETE FROM user_roles WHERE role_id = $1', [readerRoleId])
      .catch(() => undefined);
    await db
      .query('DELETE FROM role_permissions WHERE role_id = $1', [readerRoleId])
      .catch(() => undefined);
    await db
      .query('DELETE FROM roles WHERE id = $1', [readerRoleId])
      .catch(() => undefined);
    await redis.quit();
    await source.destroy();
    await db.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
