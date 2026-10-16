# City Bloxx profile and revisioned cloud API (W1.3)

These endpoints extend the existing Nest user/auth/RBAC system. Prefix: `/api/v1/city-bloxx`. All five operations require Bearer authentication and the matching `city_bloxx_profile:read/update` or `city_bloxx_save:read/write` permission. Save mutations additionally require a verified email, including for super-admin. Owners always come from the current actor; no request accepts an owner/account ID. Private responses, including parser/auth errors, use `Cache-Control: no-store`.

| Operation | Request / result |
|---|---|
| `GET /profile` | Lazily creates an independent game public UUID and default alias `Builder`; returns `publicId`, `alias`, `locale`, boolean `preferences`, `updatedAt` |
| `PATCH /profile` | Optional alias (2–24 characters, no controls/angle brackets), locale `en`/`vi`, preferences `soundEnabled`/`musicEnabled`/`reducedMotion`. Preference patches merge. Unknown fields and null values rejected. Never copies or edits account email/fullName/roles. |
| `GET /save` | `revision`, `schema`, `payload`, `hash`, `updatedAt`, `compatibility` (`absent`, `compatible`, `incompatible`). Absent save has revision `"0"`, null payload/metadata. Future-schema cloud payload stays readable without migration. |
| `PUT /save` | `expectedRevision` decimal string, `mutationId` UUID v4, positive integer `schema`, object `payload`. Schema must match `payload.schema`; supported schemas 1–4 migrate in the worker to schema 4. Returns a mutation receipt with revision/metadata. |
| `POST /save/resolve` | `expectedRevision`, `mutationId`, `choice: "local" | "cloud"`, `local: {schema, rawPayload}`, `localBackupAcknowledged: true`. Client first durably backs up both candidates. Server atomically backs up both snapshots and commits the selected candidate with the next revision and receipt (`backupIds`, `choice`). |

Success uses the existing `{success:true,data,timestamp,path}` wrapper. No save operation contributes a score to leaderboards or turns imported progress into a verified run. Web synchronization and Guest/account IndexedDB integration are implemented in [W1.4](../../base-game-nextjs/docs/cloud-saves.md).

Example first upload, where `payload` is an existing complete local GameSave:

```json
{
  "expectedRevision": "0",
  "mutationId": "cd2cef3a-7ae5-4f44-91bf-19b33005a0ba",
  "schema": 4,
  "payload": {"schema": 4, "...": "complete existing GameSave fields required"}
}
```

The abbreviated payload above documents the envelope, not a valid empty save. Do not replace a rejected snapshot with `emptySave()`.

## Conflict, idempotency and recovery

Canonical request hashes sort object keys. A successful upload hashes the normalized payload, rather than JSON property order. Within 30 days, the same owner/mutation ID and request hash returns the exact stored receipt, even after later uploads. A changed hash returns `409 GAME_MUTATION_CONFLICT`. Resolve also hashes the original raw local snapshot, choice and backup acknowledgement, so a changed backup cannot reuse an old receipt.

Each commit serializes by an account-scoped PostgreSQL transaction advisory lock, including first inserts and competing receipts. It rechecks identity/session/permission/verified email after worker validation, compares the exact BIGINT revision, executes an owner/revision conditional write, then stores receipt and sanitized audit metadata in that transaction. Revision strings never pass through JavaScript numbers. A stale revision returns `409 GAME_REVISION_CONFLICT` with `latest` metadata (no full payload); fetch the latest snapshot before asking the player to choose. Revisions above `Number.MAX_SAFE_INTEGER` remain exact. Exhausting PostgreSQL BIGINT returns `GAME_REVISION_EXHAUSTED` without writing.

Resolve requires an existing cloud snapshot and the current revision. Both local raw JSON and cloud snapshots are backed up for 30 days. Any failure, including the second backup insert, rolls back both backups, the save, receipt and audit. A future local schema can be preserved verbatim as a backup when choosing cloud. Future cloud schemas are returned as incompatible and cannot be replaced by an older client; choosing cloud preserves them. Neither path substitutes an empty save. Local acknowledgement is a client durability assertion, not server access to browser storage; the W1.4 Web client waits for its IndexedDB backup transaction to complete before sending it.

Backup hashes digest the exact stored raw UTF-8 text. Save hashes digest canonical normalized JSON. An independent minute-based maintenance task deletes at most 500 expired backups and 500 expired receipts per pass using expiry indexes; expired receipts also stop being reusable at write time. Cleanup never changes auth tables or existing auth retention.

## Budgets and failure behavior

- Raw/normalized snapshot: 256 KiB UTF-8; the transaction also checks PostgreSQL JSONB text size before any mutation. HTTP envelope: 272 KiB (JSON string escaping in resolve counts toward the envelope). Oversize returns 413.
- Validation runs in isolated workers, with no Nest/DB/Redis in a worker: at most two concurrent workers and twenty queued jobs, 128 MiB heap per worker, 5-second deadline including queue time, maximum nesting depth 64. Timeout/crash/queue overflow returns `503 GAME_WORKER_UNAVAILABLE`; workers terminate before their slots are reused. Later requests can recover.
- PostgreSQL-incompatible text (NUL/unpaired surrogate) is rejected before normalized JSONB storage. Future local snapshots backed up as raw JSON text preserve escaped content.
- Redis uses only `city-bloxx:rate:save:<actor UUID>`, 30 write attempts/minute/account. A receipt retry also counts. Redis failure returns 503 before validation/commit. HTTP 429/503 include `Retry-After` (60/5 seconds); CORS exposes it.
- Game transactions use 2-second lock waits and 5-second statement timeouts. Retryable SQL connection/lock/query-timeout errors return `503 GAME_STORE_UNAVAILABLE`; no receipt is committed on rollback. Retry with the same mutation ID and request.
- Business-invalid save: `422 GAME_SAVE_INVALID`; future selected upload: `409 GAME_SAVE_INCOMPATIBLE`. Strict class-validator DTO failures retain the existing backend 422 contract; invalid BIGINT range returns 400. The auth module's validation/response contract is unchanged. Game errors retain stable `errorCode`; conflict metadata stays available in production.

Readiness now probes an isolated worker in addition to PostgreSQL/Redis. Compiled code uses only bundled `dist/src/resources/city-bloxx`; Jest/ts-node source runners use `.generated` from `yarn build:core`. Run `yarn build` before compiled development/watch startup so bundled resources exist.

## Reproduce acceptance

From repository root with the existing local Docker infrastructure available:

```sh
docker build --target builder -f backend/Dockerfile -t city-bloxx-w1-test:local .
docker run --rm city-bloxx-w1-test:local sh -c "yarn typecheck && yarn lint:check && yarn test:core && yarn test --runInBand"
npm run evidence:w1
docker build -f backend/Dockerfile -t city-bloxx-w1-api:local .
```

`test/cloud.integration.cjs` refuses any database outside the guarded disposable `auth_test_*` name and matching TEST_DATABASE. It exercises real HTTP through Nginx, actual transactions/core workers, CAS/idempotency races, private/super-admin boundaries, future schemas/raw backups, precision/size/Unicode limits, induced backup failure, Redis failure, suspension during validation, lock contention, retention and account-isolated rate limits. Worker unit tests cover caps, queue deadlines, crashes, shutdown and recovery. Existing schema/auth/security regression remains in the same runner. Test containers/databases are removed; no live migration or deployment occurs. [Versioned evidence](../../plan/evidence/W1.3-validation.json).
