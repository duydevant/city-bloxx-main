# City Bloxx Moderation, Telemetry, Retention & Backup Operations

## 1. Admin Moderation (`/api/v1/admin/city-bloxx`)

All moderation endpoints require active session identity, verified authorization via `SecurityService`, and transaction-scoped `lockAdmin` serialization:

- `GET /api/v1/admin/city-bloxx/runs` (`city_bloxx_moderation:read`): lists `quarantined` (default) or `visible` runs with safe projection (`runId`, `userId`, `publicId`, `alias`, `mode`, `state`, `moderationState`, `physicsVersion`, `rulesetVersion`, `definitionId`, `dateUTC`, `endTick`, `boardEligible`, `result`, `metrics`, `rejectCode`, `inputsPresent`, `firstReceivedAt`, `inputsExpiresAt`, `verifiedAt`, `updatedAt`). Never returns raw `inputs`, `token_hash`, `encrypted_start_response`, `submitter_session_id`, `email`, or `password_hash`.
- `GET /api/v1/admin/city-bloxx/runs/:runId` (`city_bloxx_moderation:read`): returns the safe projection plus `config`, `submissionHash`, and `inputCount`.
- `POST /api/v1/admin/city-bloxx/runs/:runId/quarantine` (`city_bloxx_moderation:update`): requires `{ reason }`, sets `moderation_state = 'quarantined'`, extends `inputs_expires_at` to at least 90 days (`GREATEST(inputs_expires_at, first_received_at + interval '90 days', now() + interval '90 days')`), removes the run from `city_bloxx_leaderboard_entries` and restores the player's best remaining `accepted + visible + board_eligible` run on that board partition, and writes `city_bloxx.run.quarantine` to `audit_logs`.
- `POST /api/v1/admin/city-bloxx/runs/:runId/release` (`city_bloxx_moderation:update`): requires `{ reason }`. No arbitrary score editing endpoint or field is accepted. Release requires `state = 'accepted'` (`409 GAME_MODERATION_NOT_RELEASABLE` otherwise) and `inputs IS NOT NULL` (`409 GAME_MODERATION_INPUTS_EXPIRED` if purged after retention), executes deterministic worker resimulation (`GameWorkerService`) first, then atomically sets `moderation_state = 'visible'`, updates `city_bloxx_leaderboard_entries` via `BoardsService.updateBest`, and writes `city_bloxx.run.release` to `audit_logs`.

## 2. Telemetry & Public Catalog (`/api/v1/city-bloxx`)

- `GET /api/v1/city-bloxx/catalog`: public, rate-limited 60/min/IP (`city-bloxx:rate:catalog:*`), cacheable (`Cache-Control: public, max-age=300`), returns current physics/ruleset/save/cosmetic versions, building classes, and cosmetic definitions without personal ownership.
- `POST /api/v1/city-bloxx/analytics/events`: authenticated (`city_bloxx_profile:read`), 32 KiB body limit, 1–20 events/batch, rate-limited 30 batches/min/account (`city-bloxx:rate:analytics:*`), deduplicated by `eventId` (`ON CONFLICT DO NOTHING`), rejects PII/tokens/inputs/userId/accountId, and forces `properties.unverifiedTelemetry = true`.
- `POST /api/v1/city-bloxx/analytics/guest-events`: public, requires trusted `Origin`/`Referer` in `AUTH_ALLOWED_ORIGINS` (`403 GAME_ORIGIN_FORBIDDEN`), rate-limited 30 batches/min/IP and 30 batches/min/anonymous session (`city-bloxx:rate:guest-analytics:*`), stores SHA-256 `anonymous_session_hash` with `user_id = NULL` and `properties.unverifiedTelemetry = true`.
- `verification_reject`: emitted exclusively server-side (`source = 'server'`) by `VerificationService.settle` when a submitted run fails deterministic resimulation (`GAME_RUN_INVALID`).

## 3. Retention Sweep & Maintenance CLI

`MaintenanceService` runs periodically (every 60s) and on-demand via CLI (`yarn db:maintain` / `node scripts/cli.cjs maintain`):

- Acquires Redis distributed lock (`city-bloxx:maintenance:lock`) and PostgreSQL transaction advisory lock (`pg_try_advisory_xact_lock(1792022499)`).
- Transitions expired unsettled `issued`/`processing` tickets to `expired`, clears `encrypted_start_response`, and marks unsettled `queued`/`processing` submissions `rejected` (`GAME_TICKET_EXPIRED`).
- Purges raw `inputs = NULL` on terminal (`accepted`/`rejected`) submissions past `inputs_expires_at` (30 days for `visible`, >= 90 days for `quarantined`) while preserving `result`, `metrics`, `submission_hash`, `first_received_at`, idempotent finish receipts, and leaderboard entries.
- Deletes expired rows (`expires_at <= now()`) from `city_bloxx_save_backups`, `city_bloxx_save_mutations`, and `city_bloxx_analytics_events` in bounded batches (`LIMIT 500`), without touching auth tables or user history.
- Records `city_bloxx.maintenance.sweep` in `audit_logs`.

## 4. Daily Backup & Separate-DB Restore Rehearsal

`backend/scripts/backup-restore.cjs` provides non-destructive PostgreSQL 16 backup and separate-database restore verification:

- `yarn db:backup` (`node scripts/backup-restore.cjs backup [--dir <path>] [--retain-days 14]`): creates a custom-format `pg_dump` (`0600`) and a redacted SHA-256 manifest of all 15 auth + game tables, and prunes backup pairs older than 14 days.
- `yarn db:restore-rehearsal` (`node scripts/backup-restore.cjs rehearse`): creates a fresh backup, restores it into a disposable `city_bloxx_restore_<timestamp>_<hex>` database (never overwriting the active database), verifies all 15 table row counts and SHA-256 digests, checks cloud save and leaderboard invariants, boots the compiled Nest application against the restored database to verify `/api/v1/health/ready`, `/api/v1/city-bloxx/leaderboards/quick`, and `/api/v1/city-bloxx/catalog`, and drops the disposable restore database on completion.
