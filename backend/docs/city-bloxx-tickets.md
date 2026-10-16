# Server Daily, tickets and durable submissions (W1.5)

The existing Nest API now owns ranked run configuration and ticket issuance. It uses the W1.1 tables and existing user/session/RBAC policy; no new migration or auth system is required. This milestone persists work and supplies worker lease primitives. **Simulation, terminal settlement and leaderboards remain W1.6**. A new valid finish is queued and returns 202; this version does not declare it verified or publish a score.

All routes are under `/api/v1/city-bloxx`, use the existing response envelope and return `Cache-Control: no-store`, including errors.

| Route | Contract |
|---|---|
| `GET /daily/today` | Public `serverTime`, `dateUTC`, canonical shared-core `definition`; date changes at UTC midnight. 60 requests/minute/IP. |
| `POST /runs/start` | Bearer + `city_bloxx_runs:start` + verified email. Strict `{mode: "quick" | "daily", clientRequestId: UUIDv4}`. Returns HTTP 200 with `runId`, opaque `ticket`, canonical `config`, `physicsVersion`, `rulesetVersion`, `issuedAt`, `expiresAt`. |
| `POST /runs/finish` | Bearer + `city_bloxx_runs:finish` + verified email. Strict `{runId, ticket, physicsVersion, rulesetVersion, endTick, inputs}`. New/pending submission returns 202 and `Retry-After: 2`; identical terminal retry returns 200 and stored result even after ticket TTL. |
| `GET /runs/:runId` | Bearer + `city_bloxx_runs:read`, owner only. Returns run ID/mode/status/times/result/reject code. Never returns ticket, ciphertext, inputs, private user ID or email. |

Quick is Standard only: server random signed 32-bit seed, `mode: quick`, `assist: false`, current physics/rules. Daily pins the server UTC date, deterministic definition and its versions at issuance. Client seed/config/date/assist/result/owner fields are forbidden. Shared input validation uses zero-based sequence, strictly increasing ticks starting at zero or later, tick below endTick, integer fraction 0..1000, maximum 4096 inputs and endTick 1..432000. Exact gameplay validity and end conditions are checked in W1.6, outside the HTTP event loop.

## Idempotency and storage

Tickets are random 256-bit values. PostgreSQL stores only the SHA-256 token digest plus an AES-256-GCM encrypted original start response. Authenticated encryption binds the response to owner UUID and run UUID. A per-owner/request advisory transaction lock plus the existing unique constraint makes concurrent start retries return the exact original ticket/config/times. UUID casing is normalized for locks and rate reservations. Reusing clientRequestId with another mode returns `409 GAME_START_CONFLICT`; expiry returns 410 and never creates a replacement ticket for that request.

Ticket TTL is exactly 24 hours from the database issuance clock. A retry recovers the persisted response without resolving today's Daily again. The request hash excludes the changing server date, so a retry across midnight still returns the original definition.

Finish authenticates ownership/token/versions and validates input ordering before reserving a new-job allowance. No client result or trusted ranked flag is accepted. The normalized hash fixes input field order. Under the owner/ticket row lock, a transaction rechecks identity/session/verified status, inserts the complete submission and immutable first_received_at, records the submission hash and sets a 15-second lease. A changed payload returns 409; concurrent identical submissions insert once. Retrying a persisted submission does not spend another new-job allowance. Redis atomically deduplicates concurrent finish reservations by run ID. Redis calls happen outside database transactions; a reserved allowance may survive a later database failure until its minute window expires.

Limits are start 10/minute/account, finish 5 distinct new run reservations/minute/account and status 30/minute/account. 429 returns Retry-After 60; Redis/key/store unavailability returns retryable 503. No ticket/submission is silently replaced on failure. Permissions/status/session checks apply to super-admin on own routes too.

## Key configuration and rotation

Set these in the API environment, through the existing secret management mechanism:

- `GAME_TICKET_ENCRYPTION_KEY`: dedicated 32 random bytes, canonical base64 (44 characters).
- `GAME_TICKET_KEY_ID`: immutable identifier for that key, 1..64 letters/digits/underscore/hyphen.
- `GAME_TICKET_DECRYPTION_KEYS`: JSON object mapping retained old key IDs to base64 keys; default `{}`.

Never reuse JWT_SECRET or MAIL_OUTBOX_KEY. Generate key material locally with a cryptographic random generator and keep it out of Git/logs. Missing active configuration leaves existing auth/cloud services usable but fails new ticket issuance closed with 503. Invalid configured keys fail startup without printing their values. Ciphertext parsing rejects noncanonical base64 and authentication/tag/context failures. Recovery with a missing old key returns 503 and does not mint a different ticket.

To rotate, retain the old ID/key in the decryption map, set a new active key and ID, then restart API processes through the normal deployment flow. Keep old keys until all their outstanding tickets have expired (24 hours plus cleanup/deployment margin). Reusing an ID for different material is rejected when both are configured. Restart is required to reload keys; this task does not change live API configuration.

## Persistent worker handoff

`RunsService.claim()` selects one queued submission or expired processing lease using `FOR UPDATE SKIP LOCKED`, assigns a fresh lease UUID and marks its submission processing. Concurrent claimants cannot take the same job. `renew(runId, leaseId)` extends an unexpired lease by 15 seconds only while ticket and lease remain valid. `release` conditionally requeues a retryable job and invalidates the old lease. A process can reclaim an expired lease after restart; first_received_at and submission payload/hash stay unchanged. W1.6 must renew queued/in-flight work and fence settlement by the current lease in its final transaction.

There is deliberately no simulation dispatcher in W1.5. Queued jobs remain durable for W1.6. The HTTP `processing` status covers both persisted queue and active verification. The internal claim APIs are not public routes and cannot settle scores. Do not treat a 202 response as an accepted run.

A startup/minute sweep locks at most 500 expired issued/processing tickets with SKIP LOCKED, marks them expired, clears lease and encrypted response/key ID, and rejects any unfinished submission as expired in the same transaction. Terminal writes must clear ciphertext (enforced by schema). Multiple API processes can sweep safely. This does not alter auth retention, existing users or unrelated Redis data; long-term input retention is W1.8.

## Validation

```sh
docker build --target builder -f backend/Dockerfile -t city-bloxx-w1-test:local .
docker run --rm city-bloxx-w1-test:local sh -c "yarn typecheck && yarn lint:check"
npm run evidence:w1
docker build -f backend/Dockerfile -t city-bloxx-w1-api:local .
docker run --rm city-bloxx-w1-api:local node test/core-artifacts.cjs
```

The infrastructure runner uses guarded disposable databases, existing PostgreSQL/Redis/Mailpit infrastructure and temporary API/gateway/Web containers. `test/runs.integration.cjs` verifies accounts through the real existing verification endpoint with test SMTP/outbox capture. It tests start concurrency, config/owner tampering, actual transactions/Redis limits, finish retries, expiry, encryption recovery, exclusive claims and renewal/reclaim/release. A fresh Node process reclaims a persisted expired lease. Terminal accepted/rejected retry tests use explicit database fixtures; they do not claim W1.6 simulation has run. Jest separately checks key rotation, tampered ciphertext and UTC midnight. Schema/cloud/auth/security suites remain mandatory.

No live migration, deployment, frontend ranked integration, actual-device test or production key rollout is implied. See [versioned evidence](../../plan/evidence/W1.5-validation.json).
