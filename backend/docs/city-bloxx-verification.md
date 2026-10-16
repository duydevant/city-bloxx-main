# Input verification and leaderboards (W1.6)

The existing Nest backend now dispatches persisted submissions to bounded simulation workers, stores computed outcomes and updates each account's best board entry atomically. No client score/result is trusted. Web ranked play and submission UI remain W1.7; verification does not award local XP/stats a second time.

## Simulation and dispatch

`packages/city-bloxx-core/src/verification.ts` exports pure `resimulateRun`: canonical server config/versions, ordered integer inputs (maximum 4096), endTick 1..432000, no assist/legacy/City variants. It executes each input at its exact tick, rejects unsuccessful drops/unused input, rejects early or missing termination and requires the exact final tick. It returns computed result, metrics, Perfect body numerator/denominator and board eligibility. Existing replay verification and goldens are retained.

Daily body completion (height 20) is eligible, including roof Miss. An attempt ending before completing the body is a valid computed outcome with `boardEligible: false` and no board entry. Foundation and roof do not enter the Perfect body fraction; the denominator includes scored body attempts, including misses, matching existing Daily statistics. Pure simulation does not read a clock, storage, DOM or network.

New Daily start configs include the definition's Industrial building. For outstanding W1.5 configs that omitted building, verification derives it from the already pinned canonical definition; no old encrypted start receipt is rewritten.

`VerificationService` starts automatically unless `GAME_VERIFICATION_ENABLED=false`. It polls durable SQL work on startup and every second. At most 22 local jobs can be claimed/enqueued; the shared worker pool enforces two active workers, twenty waiting jobs and a five-second total deadline including queue time. Save validation uses the same pool. Workers have a 128 MiB old-generation cap, are terminated on deadline/error and release their slot only after termination. Queue saturation on HTTP finish returns retryable 503 after preserving the submitted payload; retry uses the same ticket/request.

Every claimed queued/in-flight job renews its 15-second lease every three seconds. Crash/timeout/overload/store failures conditionally release the same lease to queued state with five-second backoff. A crashed process leaves a reclaimable expired lease. Stale lease owners cannot renew, release or settle reclaimed work. Unsupported worker versions remain retryable; only deterministic `GAME_RUN_INVALID` becomes terminal rejected. Shutdown stops claims and drains bounded pending work; uncompleted durable jobs can be reclaimed.

## Migration, identity and atomic settlement

Additive migration `1792108800000-CityBloxxVerification` adds submitter session UUID, token version, retry deadline and nullable board eligibility to existing submissions. It also indexes retry eligibility and bounds board body_placements to 4096. There are still eight game tables. Existing users/auth data, input payloads, hashes and first_received_at are preserved. No JWT or ticket secret is persisted in the new columns.

Old pending submissions have no invented session identity: they remain parked until their verified owner retries the exact finish payload. A retry from another valid session of the same account rebinds submitter context, requeues and invalidates the previous lease without changing inputs/hash/first_received_at. Claim filters require a live verified account, matching token version, live own session and current finish permission (or system super-admin). Revoked/suspended/deleted/expired contexts remain parked.

After simulation, a short transaction locks/rechecks current identity, session, email verification and permissions; uses the existing security privilege mutation lock; locks the ticket; checks current lease/expiry/submission hash/context; stores computed result/metrics/eligibility; clears ticket ciphertext/lease; conditionally updates best; and appends one sanitized audit. No worker/Redis/SMTP call runs inside the transaction. Identity and lease/ticket time are checked again before returning for commit. SQL serialization/deadlock aborts retry at most three transactions with jitter; business denials are not retried. Any best-write/audit failure rolls everything back. A denied context cannot publish a score and can resume after valid owner authentication.

`POST /runs/finish` still returns 202 with Retry-After 2 while queued/processing, or 200 for an identical terminal retry. `GET /runs/:runId` and terminal finish include `boardEligible` (null before verification), computed result and rejection code. Accepted receipts survive ticket TTL. Conflicting normalized payloads return 409. Status/finish never project inputs, session IDs or ciphertext.

## Board APIs and ordering

All routes use the existing `/api/v1/city-bloxx` prefix, envelope, errors and no-store policy.

| Route | Access |
|---|---|
| `GET /leaderboards/quick` | Public current Standard Quick board |
| `GET /leaderboards/daily?dateUTC=YYYY-MM-DD` | Public UTC Daily board; default server current UTC date |
| `GET /leaderboards/:mode/me` | Bearer/current own `city_bloxx_runs:read`; same ordering/visibility, own entry/rank or null |

Public query: `limit` default 20/max 50, opaque `cursor`, optional `physicsVersion`/`rulesetVersion`; Daily additionally permits `dateUTC` and `scheduleVersion` (default daily-v1). Unknown query properties, invalid dates/cursors/limits and cursor partitions are rejected. Own standing does not accept a cursor. Public boards are limited to 60 requests/minute/IP; own standing to 30/minute/account. Redis failure fails closed with 503; 429 includes Retry-After 60.

Partitions use mode + physics/rules, and Daily also pinned UTC date + definition ID. One best/account/partition is stored. Ordering is population DESC, height DESC, Perfect body ratio DESC, misses ASC, ticks ASC, immutable first server receivedAt ASC, run UUID ASC. The upsert uses this same comparator, including earlier timestamp/UUID on exact ties; a worse/equal later result cannot replace the best.

Population and ranks are decimal strings. Perfect ratio is PostgreSQL NUMERIC(20,12), with its integer numerator/denominator retained. At most 4096 body attempts means distinct rational rates differ by more than 1/4096², so twelve decimal digits preserve their exact ordering; display-rounded percentages never order the board. SQL copies original first_received_at directly into best rows. Cursor timestamps preserve all six PostgreSQL fractional digits instead of JavaScript Date milliseconds.

Public entries contain only game publicId/alias, rank and computed sorting metrics/timestamp. Private user IDs, emails/full names, session IDs, inputs and ticket secrets are excluded. Inactive/deleted owners and nonaccepted/quarantined submissions are excluded. Cursors contain validated sorting values and the run UUID, bound to a board partition; no private owner UUID. Boards are live: page requests use current ranks, not a frozen snapshot. Refresh from page one when standings change.

## Acceptance and remaining gates

```sh
docker build --target builder -f backend/Dockerfile -t city-bloxx-w1-test:local .
docker run --rm city-bloxx-w1-test:local sh -c "yarn typecheck && yarn lint:check && yarn test:core"
npm run evidence:w1
npm test
npm run build:playable
docker build -f backend/Dockerfile -t city-bloxx-w1-api:local .
docker run --rm city-bloxx-w1-api:local node test/core-artifacts.cjs
```

The acceptance runner creates guarded disposable databases and temporary API/gateway/Web containers. It pauses automatic API dispatch for deterministic W1.5 lease tests, then W1.6 tests execute actual workers and SQL settlement. A fresh Node process runs the actual automatic startup dispatcher against persisted jobs, with HTTP status/result checks. Test accounts verify through the existing endpoint using local SMTP/outbox capture. Controlled worker failures and explicit sorting fixtures are labeled separately from real simulations. Existing schema/cloud/auth/security regression remains required.

No live migration/deployment/key rollout is performed. No ranked frontend or leaderboard page is added here. Moderation management, long-term cleanup, operational backup/restore and production/actual-device acceptance remain W1.8–W1.9 gates. See [versioned evidence](../../plan/evidence/W1.6-validation.json).
