# W1.1 — Game schema and permissions

The additive migrations create eight game tables attached to existing `users.id`, plus nine game permissions. Existing users, passwords, roles, sessions, auth tokens, audit history and mail outbox are retained. This milestone supplies database/policy foundations; the game HTTP APIs and Web account forms arrive in later milestones.

## Migrations

| Migration | Change |
|---|---|
| `1792022400000-CityBloxxSchema` | Eight tables, owner foreign keys, unique/retention/board indexes and immutable submission receipt time |
| `1792022401000-CityBloxxPermissions` | Frozen nine-permission catalog snapshot and one-time grants to existing system user/admin roles |

Run the existing migration job before API/seed startup. TypeORM runs the entire pending chain in one transaction. No schema synchronization or initial auth migration rewrite is used. A reserved game permission owned by a custom/non-system permission, or a non-system role occupying `user`/`admin`, aborts the new migrations without partial table/grant creation. Resolve that collision explicitly before retrying; migration does not promote custom objects.

Fresh installs receive game rights through auth seed when it creates system roles. Upgrades receive the new rights once through the permission migration. Repeated migration/seed runs do not restore subsequently revoked grants or reactivate permissions. User receives seven self permissions; admin receives those plus moderation read/update. Super admin retains the existing permission bypass, while game owner and verified-email checks remain mandatory.

Down migrations are for disposable test rehearsals: game down removes game data and game permission assignments, including assignments to other roles. It never drops auth tables or rewrites auth accounts. A production application rollback should retain additive schema; do not execute game down to roll back a deployed image.

## Stored contracts

| Table prefix `city_bloxx_` | Key behavior |
|---|---|
| `profiles` | One profile/account, independent public UUID, plain alias, EN/VI locale, boolean preferences allowlist (`soundEnabled`, `musicEnabled`, `reducedMotion`) |
| `saves` | One cloud snapshot/account; positive schema/revision, object payload/hash; JSONB text budget 256 KiB |
| `save_mutations` | Unique account/mutation receipt, request hash and committed revision, 30-day default retention |
| `save_backups` | Local/cloud source, raw payload retained without parsing unknown schema, hash/revision, 30-day default retention |
| `run_tickets` | Unique run/token digest and account/client request; pinned config/version/UTC definition, lease and encrypted-response fields |
| `run_submissions` | One submission/ticket with composite owner FK, bounded ticks/input count, computed result fields and immutable first receipt timestamp |
| `leaderboard_entries` | One best/account/partition, matching submission owner, exact NUMERIC ratio and full comparator index |
| `analytics_events` | Event UUID dedupe, distinct account/anonymous identity, bounded object properties, server-only verification-reject event |

BIGINT revision/population and NUMERIC ratio values stay decimal strings through the repository boundary. `decimalRevision` validates canonical nonnegative BIGINT strings without converting them through JavaScript numbers; revision zero denotes an absent cloud save and is not stored as a save row. W1.3 adds [profile/cloud DTO, worker and transaction rules](city-bloxx-cloud.md); ranked business rules remain W1.5/W1.6. These tables alone do not verify a score or establish a board entry's eligibility.

`CityBloxxModule` imports existing `SecurityModule`. `GameStore.transaction` checks identity/permission using the supplied transaction manager; `GameRepository` refuses a global manager and scopes all reads to the actor's owner ID. `GamePolicyService` checks ownership without role bypass and optionally requires verified email for ranked operations. No game endpoint is exposed in W1.1.

## Acceptance

From repository root after building the test image:

```sh
docker build --target builder -f backend/Dockerfile -t city-bloxx-w1-test:local .
docker run --rm city-bloxx-w1-test:local sh -c "yarn typecheck && yarn lint:check && yarn test:core"
npm run evidence:w1
```

The Docker runner uses the trusted running backend container as an environment/network template and removes its temporary credential file. Schema tests create and remove only UUID-named `city_bloxx_test_*` databases. Existing auth/gateway regression continues to use separate `auth_test_*` databases. No live database is migrated by this command.

The 14 schema scenarios exercise fresh/full down-up, auth-only upgrade with real Argon2 hashes and preexisting account/session/token/role/audit/outbox fixtures, one-time grants, revoked/inactive permissions, custom collisions and transactional rollback, unique/owner/precision/bounds constraints, and actual transaction repositories/policy. The auth runner now reverts every migration in its own disposable DB, rather than mistaking the final game-permission down for a full schema rehearsal.

The same `node -r tsconfig-paths/register test/run-game-schema.cjs` suite runs in the runtime image with an existing trusted test environment/network; it does not require source TypeScript. [Versioned W1.1 evidence](../../plan/evidence/W1.1-validation.json).
