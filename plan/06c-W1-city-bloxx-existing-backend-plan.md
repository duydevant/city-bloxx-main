# W1 — Backend City Bloxx trên NestJS/TypeORM hiện có

Ngày nghiên cứu: **13/10/2026**; cập nhật triển khai **15/10/2026**. Baseline source: `eafbd5f`; game Web W0: `8dff07f`. Trạng thái: **In progress — W1.0–W1.1 Implemented, W1.2–W1.9 chưa triển khai**.

W1.0 đã có gateway overlay, route-specific JSON budgets, DB/Redis readiness, shared-core CJS/declarations/worker packaging và auth regression trên DB disposable. [Evidence W1.0](evidence/W1.0-validation.json), [hướng dẫn chạy](../backend/docs/city-bloxx-infrastructure.md). **W1.1 đã có tám game tables/indexes, chín permissions, one-time upgrade grants và module/policy/transaction repositories**. Fresh/full down-up/upgrade giữ auth history, revoked permissions, collisions và ownership/precision constraints qua trên builder/runtime images; [evidence W1.1](evidence/W1.1-validation.json), [schema guide](../backend/docs/city-bloxx-schema.md). Chưa nối Web auth hoặc triển khai game APIs, chưa migrate/deploy stack đang chạy. Mốc tiếp theo là **W1.2**.

Đây là plan triển khai hiện hành theo yêu cầu dùng source `backend/` đã có user/auth. Thay các quyết định kiến trúc trong file06/06a/06b: nghiệp vụ game nằm trong **NestJS backend hiện có**, dùng **TypeORM0.3 + PostgreSQL16 + Redis7 hiện có**; không xây auth/DB nghiệp vụ trong Next, không nâng ORM/DB major và không tạo user/session hệ thống thứ hai. Mục tiêu nghiệm thu vẫn là Docker local/staging; production TLS/SMTP/rollout là gate riêng.

## 1. Kết quả khảo sát source thực tế

| Phần | Code đã đọc / hiện trạng | Cách dùng cho City Bloxx |
|---|---|---|
| App | `backend/src/modules/app.module.ts`: SecurityModule, HealthModule, global guard/pipe/filter/interceptors | Import CityBloxxModule; tái dùng HTTP stack và dependency injection |
| ORM | `src/config/typeorm-options.ts`, `data-source.ts`: PostgreSQL, TypeORM0.3, SnakeNamingStrategy, synchronize=false, pool10 | Inject DataSource hiện có; migration additive và SQL parameterized như security services |
| User | `users`: UUID, pending/active/suspended, soft delete, email verification, token_version, profile fields | FK game tables tới users.id; không tạo User entity/schema thứ hai |
| Auth | `modules/security/auth.service.ts`, `auth.controller.ts`: register/login/me/refresh/logout/sessions/verify/reset/change password | Giữ endpoint và policy; Web chỉ cần adapter nối vào auth thật |
| Tokens | JWT HS256 access mặc định900s; refresh random256bit, hash trong DB, single-use rotation; session absolute30 ngày | Access token chỉ ở memory; refresh cookie HttpOnly; giữ security contract hiện có |
| Identity/RBAC | AccessGuard + SecurityService kiểm user/session/status/version/permissions từ DB mỗi request | Game route dùng req.actor; game ownership/email-verified checks riêng, không bỏ qua bởi super_admin |
| Email | InfrastructureService có encrypted mail_outbox, SMTP Nodemailer, dispatch/retry/cleanup | Dùng verify/reset email sẵn; không tạo email service/outbox mới |
| Rate limit | Redis Lua atomic INCR/EXPIRE; auth limiter fail503 nếu Redis unavailable | Giữ auth policy; game limiter dùng cùng connection với namespace/account buckets riêng |
| Audit | SecurityService.audit(tx, actor, action, target, metadata) + audit_logs | Ghi game moderation/verification/conflict trong transaction; metadata allowlist |
| Responses | SuccessResponseInterceptor + AllExceptionFilter + X-Request-Id | Giữ envelope hiện có, game bổ sung errorCode; không thay shape của user/admin APIs |
| CLI/Compose | `src/cli.ts`, migration AuthRbac, migrate/seed jobs; PostgreSQL16, Redis7, Mailpit, API31005 | Thêm game migrations/build artifacts; giữ users, volumes và stack đang chạy |
| Tests | Jest/security integration/admin-seed/disposable auth_test_* DB runner | Thêm game suite/DB riêng; không chạy destructive harness trên DB ứng dụng |

Kiểm tra read-only thực tế ngày13/10:

- API/DB/Redis/Mailpit containers hiện Up/healthy; API public local `127.0.0.1:31005`.
- `GET /api/v1/health` trả200, success=true, status=ok, db=up.
- `/swagger-json` có37 paths; có auth và users/me, không có route `city-bloxx`.
- `backend/node_modules` chưa có trên host. Chưa chạy build/unit/security integration trong lượt khảo sát này; health/source inspection không thay cho full security acceptance.
- Source security dùng TypeORM EntityManager với SQL parameterized; chưa có concrete User ORM entity để import. Game repositories tiếp tục cùng pattern, không bắt chuyển user sang decorators/EntitySchema.

## 2. Quyết định cần giữ và điểm tích hợp phải giải quyết

### 2.1 Auth/user đã có, không làm lại

- Giữ `/api/v1/auth/*` và `/api/v1/users/me*`, roles/permissions/admin/session lifecycle đã có.
- Giữ password policy mặc định12–128 theo backend, Argon2id64MiB/timeCost3/p1; verify24h, reset20 phút; không áp policy15 ký tự/Argon19MiB của plan cũ vào user đang tồn tại.
- Mặc định REQUIRE_EMAIL_VERIFICATION=true: user mới pending và chưa login được trước verify. Guest vẫn chơi local. Dù env auth cho login unverified, **ranked game luôn yêu cầu email_verified_at**.
- Giữ JWT access + refresh cookie. Không đổi thành opaque cookie-only session để hợp plan cũ; không trả refresh token qua JSON và không persist access token vào localStorage/IndexedDB.
- User profile hiện fullName/avatarUrl/username không phải game profile. Public leaderboard dùng game alias/publicId mới, không public email/fullName/roles/session ID.

### 2.2 Same-origin gateway và refresh giữa nhiều tab

Topology: browser → gateway `localhost:56789` → Web cho UI, Nest cho `/api/v1/*`. Web và API vẫn là hai processes/images, không có Next business Route Handlers. Local API31005/Swagger giữ cho debugging; browser game dùng `/api/v1`, không hardcode31005 trong client.

- Gateway Nginx giữ prefix `/api/v1`, Authorization, Origin/Referer, Set-Cookie và X-Request-Id; không cache auth/profile/cloud/runs; timeout API15s, cap body272KiB, không rewrite refresh cookie path.
- Cấu hình AUTH_ALLOWED_ORIGINS đúng Web origin và test origin; FRONTEND_USER_PORTAL_URL trỏ Web để email links tới `/verify-email` và `/reset-password` mới. Preserve trusted proxy policy, không tin forwarded IP từ Internet tùy ý.
- Web session adapter: login nhận access token memory; reload gọi refresh qua cookie rồi me. Per-tab single-flight + exclusive Web Lock `city-bloxx-auth-refresh` cho login/refresh/logout giữa tabs; fetch refresh chỉ được tạo sau khi lấy lock. BroadcastChannel báo logout/account changes/token updates trong memory.
- Nếu Web Locks không hỗ trợ: không auto-refresh nhiều tab không kiểm soát; hết access token thì yêu cầu login lại, giữ local/pending. Không dùng localStorage flag làm mutex không atomic.
- Backend coi duplicate refresh là replay và revoke session/family. Không tự retry refresh khi response mạng không rõ đã consume chưa; dừng auto-refresh, giữ save và yêu cầu login. Không đổi backend thành grace-window trong scope này.
- 401 không hard redirect giữa lượt. Pause network/account actions, checkpoint và giữ pending; hiển thị login-required. Không replay queue của accountA bằng access token của accountB.

### 2.3 Các gaps kỹ thuật có bằng chứng trong source

- Express default JSON limit có thể từ chối finish256KiB/save272KiB trước DTO. Thêm bounded parsers/route limits đúng path, giữ auth16KiB và reject unsupported encodings; test cả proxy lẫn Nest limit.
- HealthController hiện trả status=error nhưng HTTP200 khi DB down. Thêm `/api/v1/health/ready` trả503 cho DB/Redis unavailable, `/health/live` cho process; giữ health up contract và cập nhật Compose healthcheck dùng ready.
- `seedAuthRbac` chỉ gán role_permissions cho roles vừa tạo. Chỉ thêm CATALOG rồi seed không đủ cấp game permissions cho roles hiện hữu: cần **migration quyền game một lần**, seed fresh và không re-grant quyền đã revoke khi restart.
- Backend build context hiện chỉ `backend/`; shared core ngoài context. Chốt build bundle/type declarations và root Docker build context tại W1.0, không copy gameplay algorithms vào Nest.
- Test runner hiện revert migration cuối trong DB disposable. Khi thêm nhiều game migrations phải kiểm đầy đủ fresh/upgrade/down-up trong DB test, không nhầm revert game với auth migration.

## 3. Modules và ranh giới code

```text
backend/src/modules/city-bloxx/
  city-bloxx.module.ts
  common/       game actor/policy, errors, DTO contracts, game rate limiter
  profile/      game alias/publicId/preferences
  cloud-save/   revision, idempotency receipts, backups/conflict
  daily/        authoritative UTC definition
  runs/         start tickets, finish/state/lease/idempotency
  verification/ pool + worker loader, core adapter
  leaderboards/ public boards and private own standing
  moderation/   quarantined runs and admin policy/audit
  analytics/    bounded events, dedupe, retention
backend/src/database/migrations/  additive game tables/permissions
backend/scripts/                 shared-core/worker build, game acceptance/backup
base-game-nextjs/                 auth/cloud/ranked adapters, forms/boards, gateway config
packages/city-bloxx-core/         pure input resimulation API only
```

CityBloxxModule imports SecurityModule. Controller uses AuthRequest.actor/DTO/global validation; service checks identity/ownership; repository accepts transaction EntityManager. Public catalog/Daily/boards use `@Public`; own standing/profile/save/runs use Bearer AccessGuard and explicit policy. Moderation routes under `/api/v1/admin/city-bloxx` require permission decorators.

**TypeORM:** keep installed0.3 line and existing DataSource/pool/naming config. Game DTOs use class-validator/Swagger; game row interfaces + tx.query parameterized match SecurityService. Migrations create schema; synchronize remainsfalse; don't change all source to EntitySchema/ORM1.x. Transactions only use supplied manager; QueryRunner released in finally. [TypeORM transaction-scoped repositories](https://v0.typeorm.io/docs/working-with-entity-manager/custom-repository/).

**Shared core packaging:** backend independent yarn lock remains independent from root npm workspace. Add build-only esbuild + dts-bundle-generator for a standalone CJS core bundle and bundled declarations under gitignored backend/.generated; typecheck consumes local generated declarations, not imports TS outside backend that change Nest dist layout. Build copies CJS + worker into dist/src/resources/city-bloxx; Nest runtime remains dist/src/main.js. Worker does not instantiate DataSource, Redis or Nest app.

Docker backend builder context becomes repo root: copy backend manifests/lock first, then backend source and shared packages; install only backend locked deps, build core then Nest/worker. Runner preserves scripts, tsconfig-paths and startup paths. Tests run compiled runner artifacts, not only source TS. No gameplay asset PNGs/frontend modules required in API image.

## 4. Database mới — tái sử dụng users/auth/audit

Tất cả bảng game prefix `city_bloxx_`; owner FK `users.id`, không bảng users/sessions/tokens/roles/outbox mới. UUID app-generated; timestamps timestamptz UTC; payload/config JSONB; revisions BIGINT validated/serialized safely, numeric rates preserve precision.

| Bảng | Nội dung / constraint |
|---|---|
| profiles | user_id unique, public_id unique, alias2–24 plain text, locale/settings allowlist; no email/fullName copy |
| saves | user_id unique, schema, revision, normalized payload/hash, updated_at |
| save_mutations | unique(user_id,mutation_id), request_hash, committed_revision, receipt, expiry; retry safe |
| save_backups | owner/source/schema/raw-or-normalized snapshot/hash/revision, created/expires; retention30 ngày |
| run_tickets | run_id/token_hash unique, owner, canonical config/version/definition/date, expiry, submission hash/state/lease, encrypted start response |
| run_submissions | ticket unique, normalized inputs/endTick/hash, first_received_at, computed result/metrics/reject reason; recover queued processing after restart |
| leaderboard_entries | unique(user_id,board_key), accepted submission, computed sort metrics; publicId/alias projection |
| analytics_events | eventId unique, nullable authenticated owner hoặc anonymous session digest, allowlisted type/version/mode/class + bounded properties, server_received_at/expires |

Audit vào audit_logs hiện có qua SecurityService.audit(tx,...). Rate limits dùng Redis hiện có; không thêm DB limiter/auth cache. Game maintenance không sửa existing auth token/mail retention.

Game permissions: `city_bloxx_profile:read/update`, `city_bloxx_save:read/write`, `city_bloxx_runs:start/finish/read`, `city_bloxx_moderation:read/update`.

- Default user/admin nhận self game permissions; chỉ admin nhận moderation. Super_admin dùng bypass permission hiện có nhưng **không bypass owner/email/status/config invariants**.
- Migration additive inserts server-defined game permissions và role assignment một lần cho existing system roles. Permission code đã tồn tại nhưng không phải system permission hợp lệ: fail rõ, không silently promote custom permission.
- Fresh auth seed catalog includes game permissions; test fresh role assignments có game rights. Startup seed không re-add game grants đã operator revoke, không nâng role user thành admin.
- All self DTOs không nhận userId/accountId/roles; owner lấy từ actor. Public lookup theo publicId game, không theo private userId/email.

## 5. API contracts

Game prefix: **`/api/v1/city-bloxx`**. Reuse backend success envelope `{success:true,data,timestamp,path}` và error `{statusCode,errorCode,message,timestamp,path,details?}`; request ID ở `X-Request-Id`. Không thay toàn bộ auth response thành envelope khác. UI dịch game errorCode EN/VI; Swagger ghi đúng Bearer/Public/DTO examples.

### 5.1 User endpoints dùng nguyên bản

`POST /auth/register`, `/login`, `/refresh`, `/logout`, `/logout-all`, `/forgot-password`, `/reset-password`, `/verify-email`, `/resend-verification`; `GET /auth/me`, `/auth/sessions`; `GET/PATCH /users/me`, `/users/me/change-password`, `/users/me/permissions`. Đường dẫn dưới `/api/v1`; giữ exact DTO `fullName`, `deviceName`, `newPassword`... theo source, không giả `/auth/verify` hay `/profile` tồn tại.

### 5.2 Game endpoints bổ sung

| Method / path sau game prefix | Auth / dữ liệu |
|---|---|
| GET /catalog | Public class/cosmetic/version catalog; không personal ownership |
| GET/PATCH /profile | Own game alias/publicId/locale/preferences; không sửa role/status/user email |
| GET /save | Own cloud absent hoặc schema/revision/payload/hash/updatedAt |
| PUT /save | expectedRevision + mutationId + schema + payload; revision0 khi cloud chưa có |
| POST /save/resolve | Chọn local/cloud + expectedRevision + snapshot backup; CAS resolve |
| GET /daily/today | Public serverTime/dateUTC/pinned definition; offline personal still uses C4 local path |
| POST /runs/start | Verified account, mode quick/daily + clientRequestId; returns runId/ticket/config/versions/issuedAt/expiresAt |
| POST /runs/finish | Own ticket + inputs/endTick/versions; computed result/status;200 terminal,202 processing |
| GET /runs/:runId | Owner-only status/result; no ticket/token/inputs projection |
| GET /leaderboards/quick | Public current version board, cursor/limit |
| GET /leaderboards/daily | Public UTC date + version board, cursor/limit |
| GET /leaderboards/:mode/me | Auth own entry/rank, date/version parameters; separate from public route to avoid optional-auth ambiguity |
| POST /analytics/events | Auth account game events; owner từ actor, batch bounded |
| POST /analytics/guest-events | Public Guest events, anonymous session/flag unverified; same-origin + IP rate limit, không nhận userId/accountId hoặc trusted verification_reject |

Admin namespace `/api/v1/admin/city-bloxx`: GET runs quarantined list/detail; POST runs/:runId/quarantine and /release. Permission-gated, action reason/audit, no endpoint sets arbitrary score. Release only after successful resim and uses same best-update transaction; reject/hidden never added to boards.

Error statuses:400 malformed DTO,401 invalid session,403 permission/owner/verification,409 revision/idempotency payload conflict,410 expired unsettled ticket,413 body budget,422 impossible simulation,429 with Retry-After,503 retryable pool/DB/Redis unavailable. Private game responses no-store; public boards live/no-store for launch, catalog versioned cacheable.

## 6. Luồng và transaction invariants

### Cloud save

- Guest keeps existing localStorage save. Account snapshots/backups/queues in IndexedDB scoped by actor.userId; logout/account switch after checkpoint+confirm, never copy A into B/Guest silently.
- Cloud import is explicit. Local/cloud differ: display summary, choose source; don't add XP/stats/inventory. Backup before switching active save, failure keeps both.
- Local write durable first; cloud debounce2s/coalesce latest, flush pause/menu/result. UI distinguishes local saved vs cloud pending/error/conflict; SavePort doesn't falsely report remote success.
- PUT transaction: recheck identity, mutation receipt/hash, bounded normalized payload from worker, UPDATE WHERE owner AND revision=expected RETURNING newrevision, receipt. Same mutation+hash returns stored receipt without new write; changed hash409. Stale revision409 metadata; preserve pending queue.
- Resolve transaction writes remote backup + CAS; local backup must be durably acknowledged first. Unknown schema preserves raw, returns incompatible, never substitutes empty save. Backups/mutation receipts30 ngày, no implicit sync leaderboard.

### Ranked and verification

- Only Quick Standard and Daily; no Assist/City/replay/guest imported history. Source auth default verified login remains; explicit game policy rechecks verified email even if auth env is relaxed.
- Decode required art, then server start and game constructor from canonical config. Server picks seed/physics/ruleset/Daily UTC. Client result/XP/ranked flag never authoritative.
- Ticket256bit hash in DB, TTL24h, bound owner/config; clientRequestId same request returns same encrypted recoverable start response. Separate GAME_TICKET_ENCRYPTION_KEY/keyId, not reuse JWT_SECRET/mail_outbox key; purge ciphertext terminal/expired.
- Inputs<=4096, endTick<=432000, fraction0..1000, strict sequence/tick, all inputs consumed, exact ended tick. Pure resim returns computed metrics/result; existing verifyRecord/goldens retained.
- Worker pool2, waiting queue20, hard deadline5s; kill/replace timed-out worker. Save validation uses bounded jobs too, no long replay loop in Nest main event loop. Queue full returns503/Retry-After5s.
- Submission normalized hash, owner/ticket check, persistent payload row + verifying lease15s before enqueue; queued lease renew until processing. Startup/retry reclaims expired leases within ticket TTL. Accepted retry returns stored result after TTL; conflicting payload409.
- Duplicate while processing202, GET status every2s; no second worker. Timeout/worker crash resets retryable state, does not consume ticket; deterministic invalid rejects terminal; incomplete Daily computes outcome but no board.
- Finalize short TypeORM transaction: lock/recheck user/session/status/verification and ticket lease, write accepted result, lock account/board entry, update best, audit. No worker/SMTP/network call inside transaction. Same user suspend/delete before commit prevents new accepted settlement.
- Postgres READ COMMITTED + conditional writes/row locks/unique constraints; tx-only manager. Retry40001/40P01 max3 with jitter, not business conflicts. Never generic repository.save() as replacement for CAS/unique settlement.

### Board and local rewards

Board partition quick physics/rules version; Daily includes UTC date+definition version. Sort population DESC, height DESC, Perfect-body ratio DESC, misses ASC, ticks ASC, first server receivedAt ASC, runId ASC. Ratio NUMERIC(20,12) with numerator/denominator; no display-rounded percentage. first_received_at immutable across retries.

Default20/max50 cursor entries, live board+refresh; private own-standing uses same comparator. Public fields only game publicId/alias and computed metrics; no user email/fullName/session/raw save/input log.

Local finish settles C4 XP/stats/cosmetics once. Verification only changes web verification status/board; no second game reward. Offline without ticket can play personal; never attach new ticket to previously played inputs. Pending queue max16/account, backoff2/5/15/30/60s respecting Retry-After, expiry keeps local summary. Logout/401 parks own queue until same account re-authenticates.

### Limits/operations

- Preserve auth Redis defaults/source policy (login5/300s, refresh30/300s, public mutations10/300s unless configured); do not globally replace with old plan5/minute.
- Game Redis namespaces `city-bloxx:rate:*`: start10/min/account, finish5 new jobs/min/account, cloud30 writes/min/account, status30/min/account, analytics30 batches/min/account, public board/Daily60/min/IP. Redis unavailable503 fail closed.
- Auth/profile16KiB, analytics32KiB/max20 events, finish256KiB, save payload256KiB/envelope272KiB. Unknown game DTO properties forbidden; proxy and Nest streamed/parser limits both tested.
- Analytics allowlist: mode_start/run_finish/retry/city_accept/daily_attempt/complete/mission_claim/cosmetic_unlock/equip/save_error/load timing. IDs dedupe, unverified client events clearly labeled; verification rejection emitted server-side. No raw secrets/PII/inputs; raw events30 ngày.
- Game maintenance idempotent, distributed lock before sweep; archive/purge expired queues/ciphertext/backups/events. Reuse Redis connection and audit, don't remove auth cleanup history.
- Accepted raw input logs giữ30 ngày để debug/resim; quarantined logs90 ngày cho review. Sau retention xóa input/ciphertext, giữ owner/config/submission hash/computed metrics/idempotent receipt/board metadata; moderation release thiếu inputs trả conflict, không tạo score giả. Guest analytics30 batches/phút/IP + anonymous session, account analytics30/phút/account; cả hai labeled unverified telemetry.
- DB backup daily/retain14 ngày; restore separate DB checks users/auth tables + game hashes/boards + app start. Keep app image and additive migrations; no down-v or destructive down on app DB.

## 7. Milestones W1.0–W1.9 và acceptance

| Mốc | Thực hiện | Acceptance / commit |
|---|---|---|
| W1.0 — Implemented 15/10 | Baseline auth regression, gateway/env/origin, shared-core build/worker packaging, bounded parsers/readiness | Passed: 17 unit + 3 e2e, 9 admin-seed + 23 security scenarios, real Nginx cookie/Origin/limits/Web and runtime worker goldens. [Evidence](evidence/W1.0-validation.json). `feat(w1.0): integrate existing Nest backend with game infrastructure` |
| W1.1 — Implemented 15/10 | Game tables/indexes/additive permission migration; module/policy/repositories | Passed: 14 schema scenarios trên builder/runtime, 21 unit + 3 e2e, 9 admin-seed + 23 security, proxy/core regression. Fresh/upgrade giữ auth history; seed không re-grant. [Evidence](evidence/W1.1-validation.json). `feat(w1.1): add City Bloxx schema and permissions` |
| W1.2 | Web auth forms/client + memory JWT/cookie refresh coordinator; verify/reset/profile URLs reuse | Single/multiple tabs, strict refresh replay, response loss, expiry/logout/suspend, no token persistence/no hard redirect loss. `feat(w1.2): connect Web to existing user authentication` |
| W1.3 | Game alias/profile and cloud save/resolve APIs + receipts/backups | Own actor only; CAS race/idempotency; foreign user forbidden incl super self route; unknown schema/backup fail. `feat(w1.3): implement game profile and revisioned cloud API` |
| W1.4 | Web cloud adapter/IndexedDB/conflict/import/sync UI | Two tabs/devices, offline/reconnect, Guest/A/B isolated, local/cloud chosen, City/Daily pending survives. `feat(w1.4): connect cloud saves and guest migration` |
| W1.5 | Server Daily/start tickets/persistent submissions/lease/key handling | Verified account only, duplicate start, owner/config tamper, UTC midnight, TTL and restart. `feat(w1.5): issue server-authoritative game tickets` |
| W1.6 | Pure resim, Nest worker pool, atomic finish/best update and board APIs | Golden Quick/Daily exact, duplicate/concurrent settle once, incomplete excluded, timeout/overload/recovery, rational ties/paging. `feat(w1.6): verify game inputs and settle leaderboards` |
| W1.7 | Web ranked adapter/submission queue/verified result UI + leaderboard page | Reload/offline/expiry/429/503, two accounts, personal vs verified, no duplicate C4 rewards; Playable no API calls. `feat(w1.7): connect ranked Web play and boards` |
| W1.8 | Moderation policy/audit, analytics, retention/health/backup/restore jobs | No score edit API; release resim first; Redis/DB outage, cleanup replay safe, backup+restore separate DB. `feat(w1.8): add game moderation telemetry and operations` |
| W1.9 | Full game/security/frontend/package acceptance + versioned evidence/docs | Real Docker API/PG16/Redis7/Mailpit/gateway, migrations/restore/users preserved; headless and actual environment clearly distinguished. `test(w1.9): complete City Bloxx backend acceptance` |

Mỗi mốc commit khi tests tương ứng qua, không tích vì module scaffold hoặc API mock. Auth có source không đồng nghĩa game W1.2/Web integration đã xong. Thứ tự tuần tự bảng; không cài lại auth hay force-reset DB để vượt tests.

## 8. Test plan và phạm vi kiểm tra an toàn

### Backend/source checks khi implementation

- `backend`: yarn typecheck, yarn lint:check (không dùng lint --fix làm check), Jest unit, yarn build, compiled CLI/worker smoke. Chưa có host node_modules thì dùng test/builder container hoặc install locked deps khi được triển khai.
- Keep existing security.integration/admin-seed/Jest tests. Thêm game runner tạo `city_bloxx_test_<uuid>` DB riêng và Redis keys/test DB riêng; validate DB name, cleanup chỉ resource nó tạo, không FLUSHDB của app hay xóa mail của user.
- Migration fresh/full down-up chỉ disposable DB; upgrade fixture includes preexisting real user hashes/status/roles/sessions/audit. Không seed nâng verified/admin của account để làm game test đi qua.
- API tests use real PostgreSQL/Redis + real SMTP Mailpit test UUID addresses; auth user created through existing workflows, verify explicitly. Admin seed/revoked permissions regression preserved.

### Matrix bắt buộc

| Nhóm | Các trường hợp |
|---|---|
| Reuse auth | Existing exact DTO/envelope/JWT/cookie, 2-tab refresh, lost response, deleted/suspended/token_version/role revoke, verify/reset20 phút |
| Ownership/RBAC | A cannot read/write/finish B; DTO owner forged; super_admin cannot bypass self ownership/email rules; admin moderation missing decorator denied |
| Cloud | Absent/import, CAS2 writers, same/different mutation hash, backup/quota failure, unknown schema, revision history, Guest/A/B pending preservation |
| Ticket | Start retry/canonical config/date, worker lease renewal/reclaim, expired/offline/reload, finish accepted retry afterTTL, auth expiry during verification |
| Simulation | Malformed/oversized/log sequence/tick/fraction, fabricated client result, legacy flags/version, non-ended/unused inputs, Daily incomplete/roof Miss, exact goldens |
| Board | One best/account/version/date, rational ordering/ties/receivedAt stable, public projection/private me, quarantined release resim, live cursor contract |
| Operations | Parser/proxy limits, readiness503 vs liveness, Redis limiter outage/retry-after, worker kill/queue full/persistent job recovery, Docker artifacts, backup/restore |
| Frontend | EN/VI320×568/390×844/900×430, locale/pause/resize no remount, network/account changes, cloud/ranked labels and retry |
| Boundary | Full C0–C4/W0 and Playable builds/smoke; no HTTP/auth/Nest imports in shared core; no backend calls in Playable |

HTTP smoke hiện tại chỉ chứng minh service health và Swagger inventory. Không ghi full security/compile tests đã qua nếu chưa chạy commands/evidence cho source này.

## 9. Docker local/staging và bảo toàn backend hiện có

- Giữ PostgreSQL16/Redis7/TypeORM0.3/Nest11 và volumes `base-nest-bo-minh-auth` hiện tại. Không tự upgrade majors, rename/drop volume hay chạy auth migration initial lên existing incompatible schema.
- Extend backend Compose với Web/gateway/worker build support, giữ migrate/auth seed flow. Root Web port56789 chuyển public entry về gateway; Web/API liên lạc bằng service names, không qua browserlocalhost container.
- Backend direct API31005 và Mailpit58025 chỉ loopback local. DB55432/Redis56379 hiện loopback được giữ cho debug local; staging/production overlay bỏ host mappings DB/Redis/API debug, chỉ expose gateway.
- Shared root build context phải giữ dependency caching backend yarn.lock; root frontend npm lock riêng. Existing .env secrets không commit/in ra tool logs; env example bổ sung game key/version/limit/upstream và origins placeholders.
- Auth mail/reset URLs cập nhật Web routes; production Secure cookie same-site/TLS gate sau, không dùng local COOKIE_SECURE=false ở production.
- Backend migrate job hiện transaction all; giữ cho additive launch migrations, lock deployment/migration chạy một lần trước API. Concurrent migrations/deploy retry cần evidence, không dùng automatic schema synchronize.
- Add readiness DB+Redis+worker availability; logs requestId/runId/errorCode, allowlisted sanitized metadata. Public health không trả secrets; no token/JWT/input body dump.
- Restore rehearsal separate DB/volume; verify auth+game data, restore latest backup then run compatible app. Production deployment vẫn Planned khi local/staging hoàn tất.

## 10. Evidence, tài liệu và Definition of Done

Khi thực thi, tạo `plan/evidence/W1-nest-validation.json`: source commit/versions/environment, auth regression/game suites, migration/permissions diff, core golden, queue/worker/idempotency/concurrency, frontend/Playable boundaries, gateway/cookie/origin, backup/restore reports đã redact. Screenshots/logs/fixtures có commands tái tạo; không ghi credentials hoặc raw tickets.

W1 **Implemented** khi game endpoints và Web integration thật qua automated tests + Docker local/staging acceptance. Ghi riêng **Verified local/staging** và **Verified production**; chưa domain/TLS/SMTP thật thì production gate chưa xong. **Released** chỉ khi rollout thật và monitoring. User/auth hiện có được tái sử dụng và kiểm regression, không đánh dấu toàn W1 xong từ health hiện tại.

Plan này có ưu tiên cao hơn file06a/06b ở mọi điểm xung đột: Nest API thay Next Route Handlers, TypeORM0.3/PG16/Redis hiện hữu thay ORM1/PG17/noRedis, JWT+refresh rotation thay cookie-only auth, auth password/reset policy hiện có thay defaults cũ. File06 vẫn cung cấp game fairness/verification/cloud requirements không xung đột.

Nguồn: source paths ở mục1, backend/docs/auth-rbac/README.md, Swagger/health read-only ngày13/10; [TypeORM0.3 transaction scope](https://v0.typeorm.io/docs/working-with-entity-manager/custom-repository/), [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API), [BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel).
