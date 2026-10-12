# W1 — Kế hoạch backend chi tiết với TypeORM

Ngày lập: 12/10/2026. Baseline: W0 `8dff07f`, C4.3 `5b63174`; 231 tests và Web/Playable smoke đã qua. Trạng thái: **Planned — chưa triển khai backend**. Đặc tả gốc: [06 — W1](06-W1-backend-auth-cloud-leaderboards.md). Đây là bản kế hoạch W1 dùng **TypeORM** theo quyết định mới nhất của người dùng, thay lựa chọn ORM trong file06/06a. Chỉ viết tài liệu; không cài dependency, tạo database hay triển khai backend. Các mặc định bên dưới đã chốt cho lần triển khai đầu.

## 1. Mục tiêu nghiệm thu Docker local/staging

Người chơi Guest tiếp tục chơi và lưu trên máy. Người có tài khoản đăng nhập thật, chọn đồng bộ tiến trình và xem trạng thái cloud. Người đã xác minh email có thể bắt đầu Quick Standard/Daily với ticket server, gửi inputs và nhận kết quả được server tính lại. Leaderboard chỉ lấy verified runs. App chạy Docker local/staging tại port Web 56789 với PostgreSQL 17 private, TypeORM, SMTP Mailpit, healthcheck, backup và restore rehearsal vào DB riêng. Production domain/TLS/SMTP thật thuộc gate sau; không cần credentials production để hoàn thành backend local/staging.

Không đưa City/Assist/replay/guest history vào board. Không thêm social/public profile, paid economy, Redis hoặc service gameplay riêng. Playable tiếp tục dùng host/local adapters, không gọi Web backend.

## 2. Những chỗ phải thay từ baseline

| Hiện tại | Thay đổi trong W1 |
|---|---|
| `lib/api/auth.api.ts` throw TODO; Axios đọc access/refresh token từ localStorage | API same-origin `/api/v1`; auth session cookie; bỏ Bearer/refresh interceptor cũ và hard redirect 401 |
| `auth.store.ts` persist token; UI W0 chỉ Guest | Auth status query từ `/auth/me`; không coi token scaffold là phiên hợp lệ; chỉ dọn key `auth-storage`, giữ save Guest |
| `.env.example` API URL trỏ localhost:3001 | Client base path `/api/v1`; public URL dùng cho email/origin/canonical; backend cùng app Next |
| Compose chỉ có Web | PostgreSQL + migrate job + backup job; DB không publish port mặc định |
| SavePort chỉ đọc `city-bloxx.quick-save.v2` | Web adapter tách Guest/account, revision, offline queue và conflict UI; game không đọc HTTP |
| Session start dùng seed/clock client | Optional adapter chuẩn bị ranked run bằng canonical server config; personal/offline vẫn dùng luồng cũ |
| `verifyRecord` yêu cầu result client rồi so equality | Thêm hàm resim từ canonical config + inputs/endTick, trả computed result/metrics; giữ verifier/replay hiện tại tương thích |
| Worker chưa có trong Docker standalone | Build worker entry riêng, copy runtime asset vào image, smoke chính image đó |

Trước khi viết Route Handler phải đọc `AGENTS.md` và docs Next bản cài trong repo. TypeORM/Argon2/SMTP package versions được kiểm tra tương thích Node image rồi pin lockfile ở W1.0; không nâng framework chỉ để làm backend.

## 3. Kiến trúc và vị trí code dự kiến

```text
base-game-nextjs/
  app/api/v1/                  Route Handlers: validate/auth/call service/respond
  app/api/health/              liveness; readiness endpoint kiểm DB có timeout
  server/
    env.ts, db.ts, http/       config validation, TypeORM, error/request limits
    auth/, profile/           session, CSRF, email tokens, private profile
    cloud/                    revision, backup, import/conflict
    runs/, leaderboards/      tickets, settlement, ranking queries
    verification/             pool + worker entry, không DOM/network trong sim
    analytics/, maintenance/  allowlist, rate limits, retention, audit
  server/db/data-source.ts    DataSource factory, dùng chung runtime và CLI
  server/db/data-source-cli.ts CLI entry, không import Next/server-only guard
  server/db/entities/         EntitySchema có typed interfaces
  server/db/migrations/       timestamped MigrationInterface up/down
  dist/backend/              CLI/entities/migrations JS + worker CJS được build
  lib/api/                    typed cookie-auth client
  modules/account/            forms, current session, verify/reset
  modules/cloud/              account save adapter và conflict UI
  modules/city-bloxx/         ranked Web adapter/status; tái dùng shared session
packages/city-bloxx-core/     bounded deterministic resimulation, không HTTP/DB
scripts/                     integration/evidence/backup/restore commands
```

Route Handlers dùng Node runtime. Server modules không vào client bundle; DB/SMTP/session secrets không mang prefix `NEXT_PUBLIC_`. Private responses `Cache-Control: no-store`; không cache `/auth/me`, `/profile`, `/save` theo người dùng vào cache chung. Worker sim chạy ngoài main event loop; không giữ transaction mở suốt job.

Launch vận hành một app instance với pool hai jobs, queue 20, timeout 5 giây/job. Nếu tăng replica phải tính lại tổng worker/DB connection budget; idempotency, rate limit và lease vẫn dùng DB, không dựa vào memory của một process.


## 3A. Quyết định TypeORM bắt buộc

### DataSource và entities

- Dùng TypeORM dòng1.x, PostgreSQL driver `pg`, EntitySchema typed; pin exact compatible patch vào lockfile tại W1.0. Không dùng decorators/emitDecoratorMetadata hoặc sửa SWC để nhận legacy decorators.
- Server runtime lấy một DataSource/process qua cached initialization promise; dev hot reload cache trên globalThis. Initialize lỗi thì clear promise để retry; không tạo pool mới mỗi request và không destroy DataSource sau từng response.
- Tách pure DataSource factory/CLI khỏi Next-only import guard. Runtime entry có server-only guard; migration CLI chạy bằng Node, không phụ thuộc React/Next runtime.
- Chốt `synchronize:false`, `dropSchema:false`, `migrationsRun:false` cho local/test/staging/production. Schema chỉ thay bằng migrations được review. [TypeORM migration setup](https://typeorm.io/docs/migrations/setup/).
- Entities/migrations import bằng explicit manifests. Không glob lẫn TS/JS làm load trùng hoặc dựa vào tên file sau Next bundling.
- Bảng/columns snake_case; IDs UUID; timestamps timestamptz UTC; snapshots/config/input logs JSONB. Opaque hashes lưu cố định; fields bí mật không select trong public projections.
- Counts/revision dùng PostgreSQL BIGINT với DTO string nếu vượt JS safe integer; chỉ convert khi kiểm Number.isSafeInteger. Rates NUMERIC đọc thành string/rational metadata, không implicit parseFloat để tie-break.
- DataSource pool max10, connection timeout5s, statement timeout3s, idle-in-transaction timeout5s. Env override chỉ dùng cho môi trường vận hành đã benchmark; không bật query logging chứa payload/tokens.

### Migrations và Docker artifacts

- Mỗi migration có timestamp, tên mô tả, `up` và `down`; generated SQL phải review trước commit. Kiểm fresh DB, upgrade giữ dữ liệu và schema diff không còn pending changes.
- Compiler/build tạo `dist/backend/db/data-source-cli.js`, explicit entity/migration JS và worker CJS; artifacts git-ignore. CLI job chạy TypeORM `migration:run -d` trên compiled DataSource này.
- Compose `migrate` job dùng DB private, chạy thành công trước `web`; deploy serialize migrations với PostgreSQL advisory lock trên cùng QueryRunner connection. Release lock/release runner trong finally.
- Transaction mode mỗi migration (`each`); launch indexes tạo bình thường trong transaction. Nếu về sau có index concurrently, migration đó tách transaction và ghi rõ runbook, không đưa vào initial schema.
- Không tự revert production data để rollback app. `migration:revert` chỉ nghiệm thu ở DB test/restore riêng; production dùng expand/contract hoặc reviewed forward fix.
- Docker copy backend artifacts và TypeORM/pg runtime dependencies rõ ràng; test CLI/worker bằng runner image cuối, không chỉ chạy source TS ngoài Docker.

### Transactions và chống race

- Dùng `dataSource.transaction("READ COMMITTED", manager => ...)`; mọi query trong transaction dùng manager hoặc repository lấy từ chính manager. Không dùng global repository trong callback. [TypeORM transactions](https://typeorm.io/docs/transactions/).
- Cloud CAS dùng UPDATE với accountId + expectedRevision, increment revision ngay trong SQL, RETURNING revision mới; affected0 trả409. `@VersionColumn`/optimistic read không thay được CAS write.
- Idempotency receipts unique(owner,mutationId); cùng mutation/hash trả receipt, khác hash409. Receipt, cloud update và remote backup commit cùng transaction.
- EmailToken consume bằng UPDATE WHERE used_at IS NULL AND expires_at > database_now RETURNING; update user/revoke sessions cùng transaction.
- Rate limit dùng parameterized INSERT ... ON CONFLICT DO UPDATE + RETURNING count, không SELECT rồi tăng count ngoài transaction.
- Claim ticket bằng conditional UPDATE status/lease; xác minh worker ngoài transaction; finalize kiểm lease owner để worker cũ không settle sau reclaim.
- Leaderboard finalize giữ unique(account,boardKey); insert entry nếu absent rồi lock entry và compare tuple, update best cùng ticket/VerifiedRun/audit. Không dùng generic repository.save() cho race-sensitive best update.
- Retry toàn transaction tối đa3 lần chỉ cho SQLSTATE40001/40P01, jitter25–100ms; không retry validation, unique business conflict hay auth errors. Bắt constraint names để map23505 thành idempotent result/409 đúng trường hợp.
- QueryRunner thủ công phải rollback/release trong finally; không gọi SMTP, await worker hoặc network khi đang giữ DB transaction.

## 4. Entities và constraints đã chốt

| Entity | Trường/constraint cần có |
|---|---|
| User | UUID, normalized email unique, passwordHash, emailVerifiedAt, createdAt/status; email không public |
| Session | userId, tokenHash unique, csrf binding, expiresAt, revokedAt; chỉ trả raw session token bằng cookie lúc tạo |
| EmailToken | userId, purpose verify/reset, tokenHash unique, expiresAt, usedAt; consume atomic |
| PlayerProfile | userId unique, displayName, locale/preferences, private mặc định |
| CloudSave | userId unique, schema, revision, payload, payloadHash, updatedAt; compare-and-swap revision |
| CloudSaveMutation | unique(owner, mutationId), requestHash, committedRevision, receipt/expiry; retry không ghi thêm revision |
| CloudSaveBackup | owner, source/revision/schema/raw snapshot, createdAt/expiresAt; một backup conflict hiện hành cho mỗi phía, giữ 30 ngày |
| RunTicket | runId unique, tokenHash unique, account, canonical config/version/definition, issuedAt/expiresAt, status, submissionHash, verificationLease |
| VerifiedRun | ticketId unique, account, computed result/metrics, versions, board key, server receivedAt, accepted/rejected/quarantined status |
| LeaderboardEntry | unique(account, boardKey), verifiedRunId, sortable computed metrics; không đọc CloudSave để lấy điểm |
| RateLimitBucket | unique(scope, hashed subject, window); increments atomic + expiresAt |
| AnalyticsEvent | eventId unique, allowlisted type/version, account/session ref tùy loại, bounded properties, createdAt/expiresAt |
| AuditLog | actor/action/runId/requestId/reason/server time; không ghi raw cookie/password/email token |

Các bảng nội bộ là phần bổ sung cần cho yêu cầu rate-limit/backup/audit của file 06. Thêm indexes cho token lookup/expiry, owner save, board ordering, ticket state/lease và event retention. Không cascade làm mất audit hay verified history ngoài retention policy đã chốt.

## 5. Contract API cho implementation

Mọi path dưới đây có prefix `/api/v1`, ngoại trừ health. Success: `{ data, requestId }`; error: `{ error: { code, message, details? }, requestId }`. Client dịch error code EN/VI. Không trả stack trace/secret. `401` chưa login, `403` không đủ quyền/email chưa verified/CSRF, `409` conflict, `413` vượt body limit, `422` data không hợp lệ, `429` có Retry-After, `503` retryable dependency/worker unavailable.

| API | Request / response quan trọng |
|---|---|
| `GET /auth/csrf` | Pre-auth CSRF token có binding/expiry, no-store; dùng cho cả login/register/reset/logout và authenticated mutations |
| `POST /auth/register` | email/password/displayName; generic acknowledgment cho account trùng; phát verify email; không trả bearer token |
| `POST /auth/login` | email/password; set opaque session cookie + rotated CSRF; trả private user/session metadata |
| `GET /auth/me`, `POST /auth/logout` | query session thật; logout revoke và clear cookie; offline/network fail không giả đã logout thành công |
| `POST /auth/verify`, `/resend-verification`, `/forgot-password`, `/reset-password` | token single-use; verify TTL24h, reset TTL1h; resend invalidate token cũ; reset revoke tất cả sessions |
| `GET/PATCH /profile` | private display name/locale/settings allowlist; không mass-assign userId/emailVerified/status |
| `GET /save` | absent cloud hoặc `{schema,revision,payload,payloadHash,updatedAt}` |
| `PUT /save` | `{expectedRevision,schema,payload,mutationId}`; absent dùng revision 0, initial revision 1; canonical normalized payload hash |
| `POST /save/resolve` | lựa chọn local/cloud + expectedRevision + snapshot cần backup; transaction backup/conflict resolution trước đổi active save |
| `GET /daily/today` | `{serverTime,dateUTC,definition}`; definition version pinned, UTC lấy server |
| `POST /runs/start` | `{mode:quick|daily, clientRequestId}`; trả `{runId,ticket,issuedAt,expiresAt,config,versions,definitionKey}` |
| `POST /runs/finish` | `{runId,ticket,inputs,endTick,versions}`; result/metrics do server tính. `200` đã xử lý, `202` đang xử lý; không nhận XP hoặc tin client result |
| `GET /runs/{runId}` | Owner-authenticated status/result để poll; không trả ticket/input logs; rate30 requests/phút/account |
| `GET /leaderboards/quick`, `/leaderboards/daily` | version/date key, cursor, limit default20/max50; entries/nextCursor/current player standing nếu login |
| `POST /analytics/events` | batch ≤20, body ≤32KiB; event ID/type/version + bounded properties; unknown type/property reject |
| `/api/health`, `/api/ready` | liveness không lộ config; readiness DB check timeout, không lộ credentials |

Body limit auth/profile 16KiB; finish ≤256KiB; CloudSave payload ≤256KiB UTF-8 nhưng envelope HTTP cần allowance riêng bounded 272KiB. Không dùng limit HTTP 256KiB cho save envelope rồi vô tình từ chối payload hợp lệ sát budget. Local save budget C4 vẫn giữ 256KiB và validation hiện hành.


## 5A. Defaults, flow và giới hạn đã chốt trong Plan Mode

| Thành phần | Quyết định |
|---|---|
| ORM/DB | TypeORM DataSource + EntitySchema, PostgreSQL17; không triển khai ORM khác |
| Local services | Web56789, DB private, Mailpit SMTP1025 private/UI8025 loopback, migrate/test/backup jobs |
| Auth | Email trim/lowercase, không strip dấu chấm hoặc plus; password15–128 code points; display name2–24; email private |
| Session/CSRF | Session30 ngày; signed CSRF10 phút; verify24h/reset1h; reset revoke sessions |
| Save storage | Guest giữ localStorage hiện hành; account snapshots/backups/offline queue dùng IndexedDB theo account ID |
| Cloud writes | Local durable write trước; cloud debounce2s, coalesce latest; flush pause/result/menu; hiển thị local saved/cloud pending riêng |
| Cloud conflict | expectedRevision + mutationId; không merge totals; backup30 ngày trước khi thay active snapshot |
| Ranked | Quick Standard/Daily; verified-email account; server-issued canonical config; personal/offline không upload retroactive |
| Submission | Ticket24h, lease15s; same payload idempotent; processing202, poll owner-only GET status |
| Workers | Pool2, queue20, hard timeout5s; invalid/body quá lớn reject trước queue; DB-free sim worker |
| Client retry | Backoff2/5/15/30/60s, tôn trọng Retry-After; max16 pending runs/account, đầy queue thì chơi personal |
| Request limits | Auth/profile16KiB; finish256KiB; save payload256KiB/envelope272KiB; analytics32KiB/20 events |
| Rate limits | Auth5/phút/IP; forgot3/giờ/email; start10/phút/account; finish5 jobs mới/phút/account; status/analytics30/phút/subject |
| Boards | Live board, default20/max50 entries; server receivedAt tie-break; Perfect-body ratio NUMERIC(20,12), numerator/denominator giữ nguyên |
| Retention | Analytics/cloud backups30 ngày; DB backups hằng ngày giữ14 ngày |
| Acceptance | Docker local/staging thật + Mailpit + PostgreSQL integration + restore DB riêng; production TLS/SMTP deferred |

Luồng ranked: verified session → prepare/decode art → server start/config/ticket → constructor game → local finish/XP một lần → persisted submission queue → worker resim → TypeORM transaction → cập nhật verified/board status. Server response không trả thưởng gameplay lần nữa.

Luồng cloud: đọc local/remote → nếu cloud rỗng chọn import Guest hoặc tạo mới → nếu khác chọn nguồn + backup → switch namespace sau checkpoint/confirm → serial local save + revisioned upload. Account A/B/Guest không dùng chung queue hoặc tự sao chép pending tower sang nhau.

Nếu SMTP lỗi, account chưa verified vẫn login/personal/cloud; ranked bị khóa. Nếu DB/worker lỗi, trả503 và giữ local result/ticket retry. Nếu session hết hạn, pause account network operations, giữ save và yêu cầu login lại, không hard redirect hoặc bỏ pending run.

Authenticated GET status có thể poll mỗi2s khi processing, dừng khi terminal; obey429 Retry-After. Same accepted submit trả stored result kể cả TTL đã qua; conflicting inputs409; ticket chưa settled và hếtTTL không được tạo ticket mới để hợp thức hóa old inputs.

Board entries chỉ public alias và computed score; private profile/email/save không public. Live pagination có thể đổi khi có score mới; client có refresh, không hứa stable snapshot xuyên requests.

## 6. Trình tự triển khai, commit và acceptance

| Mốc | Phụ thuộc | Kết quả phải có |
|---|---|---|
| W1.0 | W0 | Contract/config/boundary/package choices |
| W1.1 | W1.0 | DB schema/migrations/health/rate-limit foundation |
| W1.2 | W1.1 | Cookie sessions/login/logout/CSRF |
| W1.3 | W1.2 | Verify/reset email, private profile |
| W1.4 | W1.2 | Cloud revision/conflicts/guest-account isolation |
| W1.5 | W1.3 | Server Daily/tickets/canonical config |
| W1.6 | W1.5 | Worker verification/atomic board settlement |
| W1.7 | W1.4 + W1.6 | Web forms/cloud/ranked/boards integration |
| W1.8 | W1.7 | Analytics/retention/production operations |
| W1.9 | tất cả | Full local/staging acceptance, Mailpit/Docker/restore evidence |

Làm tuần tự theo bảng để dễ review và commit. Mỗi mốc là một hoặc vài commit có phạm vi rõ; chỉ tích khi acceptance của mốc qua. Không đánh dấu W1 hoàn thành vì riêng auth hoặc API mock chạy được.

### W1.0 — Khóa contract và cấu hình

- [ ] Viết request/response schemas, error codes, auth/CSRF bootstrap, canonical version key và rules retry/idempotency.
- [ ] Pin compatible TypeORM/PostgreSQL image/Argon2id/SMTP dependencies; kiểm native hashing chạy trong Node Linux runner.
- [ ] Thêm env validation server: DATABASE_URL, PUBLIC_URL, trusted origins/proxy, cookie config, SMTP, worker/timeouts, rate limits/retention.
- [ ] Đổi client API sang same-origin path; xác định module server-only và build worker standalone.

Acceptance: schema reject malformed/oversized data; thiếu env báo rõ lúc runtime startup; static build không yêu cầu connect production DB/SMTP; Playable graph không nhập backend. Commit dự kiến: `feat(w1.0): define backend contracts and configuration`.

### W1.1 — PostgreSQL, migrations và HTTP foundation

- [ ] Schema/indexes/unique constraints ở mục 4; TypeORM DataSource/EntitySchema/repositories và transaction-scoped EntityManager.
- [ ] Compose DB private persistent volume, healthcheck; migrate service riêng chạy một lần trước app; không migrate mỗi request/replica.
- [ ] Request ID/error mapping/body reader bounded/no-store; health/readiness; DB-backed rate limiter có atomic concurrent increments.
- [ ] Trusted proxy allowlist trước khi lấy client IP; không tin tùy ý X-Forwarded-For. Rate limits ở file06 giữ baseline, counters hoạt động khi có nhiều processes.

Acceptance: TypeORM CLI từ compiled Docker artifact chạy được; migrations từ DB rỗng và upgrade qua, không schema drift/synchronize; transaction rollback/manager scoping và unique constraints/concurrent buckets đúng; DB down readiness fail có timeout, health không leak env; app/DB restart giữ dữ liệu. Commit: `feat(w1.1): add database migrations and backend foundation`.

### W1.2 — Authentication bằng session cookie

- [ ] Register/login/logout/me; Argon2id salted hashes; policy password 15–128 Unicode code points, không truncate/trim password và không bắt composition tùy tiện.
- [ ] Argon2id m=19MiB/t=2/p=1; benchmark container để kiểm tra tải, không tự đổi cost trong mốc này; dummy hash check cho email không tồn tại. [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- [ ] Session random 32 bytes, DB chỉ token hash; expires sau30 ngày; rotate sau login; HttpOnly/SameSite=Lax/Secure production, Path=/, không Domain rộng. Cookie `__Host-` production; dev HTTP dùng tên riêng, không hạ Secure production.
- [ ] Origin exact match + header CSRF token ký HMAC-SHA256, TTL10 phút, bound session hoặc random HttpOnly pre-auth cookie; rotate binding sau login; không xem SameSite là cơ chế duy nhất. [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
- [ ] Thay localStorage token store/interceptor bằng session query và credentials same-origin; 401 trả Guest/session expired UI, giữ pending game, không tự hard redirect giữa lượt.

Acceptance: login thành công/sai, expired/revoked/logout, cookie flags, CSRF thiếu/sai/cross-origin, generic error chống enumeration, parallel rate limit và account isolation qua. Commit: `feat(w1.2): implement cookie sessions and authentication`.

### W1.3 — Verify email, password reset, private profile

- [ ] Verify/resend/forgot/reset dùng single-use hashed expiring tokens; token consume atomic trong transaction; URL public lấy server config.
- [ ] Email failure có retry path, không tạo verified user giả; đã tạo account nhưng SMTP fail vẫn login/personal play, ranked bị khóa.
- [ ] Reset revoke sessions; UI linktoken đọc client rồi POST, không tự consume bằng GET của email scanner; token không vào analytics/logs.
- [ ] Profile validation: display name 2–24 ký tự, plain text, trim name, chặn control characters; email private, public board chỉ alias. Chưa có public profile opt-in/social.

Acceptance: inbox test thật trên môi trường test, expired/reused token, concurrent consume một lần, resend/reset invalidation, no email enumeration, profile ownership. Commit: `feat(w1.3): add email verification reset and profile`.

### W1.4 — Cloud save và Guest migration

- [ ] Save service dùng `migrateSave`/`prepareSave` hiện hành; bounded validation phải chạy trong worker/bounded job nếu đụng replay/checkpoint dài, tránh khóa main event loop.
- [ ] CAS update `WHERE userId AND revision=expectedRevision`; update payload + increment revision atomic. Idempotent mutationId/payload hash cho network retry; không tạo revision mới vì retry request y hệt.
- [ ] Empty cloud: hỏi import Guest hoặc bắt đầu cloud mới. Cloud khác local: so sánh summary/schema/updatedAt; user chọn bản tiếp tục, không cộng XP/stats/ownership.
- [ ] Backup bản không chọn trước replace; remote backup transaction, local backup xác nhận ghi được; backup fail thì giữ cả hai và chưa thay bản active.
- [ ] Namespace Guest/account trong storage; một active save/session writer. Chuyển account hoặc logout lúc đang chơi cần checkpoint/confirm; không ghép snapshot tài khoản A vào Guest/B.
- [ ] Offline queue chỉ upload active account với expected revision; reconnect 409 mở conflict, không tự overwrite. Unknown schema giữ raw/backup và báo incompatible, không tạo empty save thay nó.

Acceptance: two devices/tabs cùng revision chỉ một write thắng; idempotent retry, Guest import, conflict chọn mỗi phía/backup failure, schema lỗi/quota/offline và logout-account switch giữ City/Daily pending. Commit: `feat(w1.4): implement revisioned cloud saves and conflicts`.

### W1.5 — Daily authoritative và ranked tickets

- [ ] Server UTC Daily definition dùng content/core hiện có, không client chọn date/seed/class/target/legacy flags.
- [ ] Start chỉ verified-email account; mode Quick Standard hoặc Daily. Quick dùng canonical current physics/rules, Assist false; Daily pin date/recipe lúc issued.
- [ ] Opaque ticket 32 random bytes, DB hash, account/config binding, TTL24h. `clientRequestId` unique/account giúp start retry trả cùng run/ticket: lưu start response có ticket dạng encrypted ciphertext, keyId và server-only encryption key để recover response. Key không nằm cùng DB dump; xóa ciphertext khi settled/expired. Không giả trả cùng ticket khi DB chỉ còn hash không thể phục hồi raw token.
- [ ] State issued → verifying(lease) → settled/rejected/quarantined. Operational failure trở lại retryable, không ghi settled; lease hết hạn sau process crash có thể reclaim trong TTL.
- [ ] Accepted duplicate phải đọc được stored result sau TTL; startUTC/definition giữ nguyên qua midnight. Chưa có ticket khi offline thì chơi personal, không gắn ticket mới vào inputs đã chơi.

Acceptance: unverified/Guest/Assist/City reject, config tamper, duplicate start, token-account mismatch, expiration, server UTC rollover, reload ticket queue. Commit: `feat(w1.5): issue canonical ranked run tickets`.

### W1.6 — Worker verifier và leaderboard APIs

- [ ] Thêm pure resim nhận config server, input log, endTick/versions. Validate sequence/tick/fraction, input≤4096, ticks≤432000; không cần client result để tạo kết quả đúng. C4 verifier golden fixtures vẫn qua.
- [ ] Pool hai jobs, queue20, hard timeout5s; timeout terminate/replace worker; malformed payload reject trước queue. Packaging worker chạy được trong actual standalone image.
- [ ] Queue full/DB unavailable/timeout trả503 + retry instructions, ticket không bị tiêu thụ. Submission hash bind canonical normalized inputs; same submit reuse result, conflicting submit409; concurrent identical không tạo hai settlement.
- [ ] Re-sim đủ tới ended; Daily incomplete không lên board dù vẫn trả computed personal outcome. Simulation-invalid reject; deterministic impossible score quarantine/reject có reason/audit, không sửa score.
- [ ] Transaction finalize lease/ticket, insert unique VerifiedRun, update account best và audit. DB race/deadlock có bounded retry; không giữ transaction trong lúc worker chạy.
- [ ] Board key chứa mode/physics/ruleset/reward-independent definition version; Daily thêm UTC date. Sort population DESC, height DESC, Perfect-body rate DESC, misses ASC, durationTicks ASC, server receivedAt ASC, runId ASC.
- [ ] Board rate tính từ computed metrics; giữ numerator/denominator, không dùng display percentage đã làm tròn. SQL sort bằng NUMERIC(20,12), giữ numerator/denominator và kiểm fixture rational ordering; partition versions không trộn luật.
- [ ] Cursor pagination/current player standing cùng ordering; không trả email/raw save/ticket/input logs. Public leaderboard dùng alias, không public account profile.

Acceptance: real core goldens, fabricated result/changed seed/config/endTick/old version, non-ended log, concurrent/repeated finish, worker overload/crash/timeout/retry, Daily midnight/incomplete, exact board ties và paging qua. Commit có thể tách `feat(w1.6): verify ranked runs in workers` và `feat(w1.6): settle verified leaderboards atomically`.

### W1.7 — Kết nối Web vào backend thật

- [ ] Khôi phục forms sign-in/register/verify/reset và profile session status; loading/error/resend/logout EN/VI; UI chỉ bật capability khi endpoint hoạt động.
- [ ] Cloud adapter nối SavePort, UI import/conflict/backup/sync status; không để hai controller ghi cùng active save. Auth/locale updates không remount run.
- [ ] Optional ranked adapter `prepareRun` trước constructor trả canonical config + run reference; web adapter giữ ticket/queue, shared core không biết cookie/HTTP/DB. Phân biệt personal và verified result trong UI.
- [ ] Khi finish local result/stats settle theo C4 một lần; server response chỉ cập nhật verification/board status, không cộng XP hay cosmetic thêm lần nữa.
- [ ] Queue persisted per account + run, inputs/ticket giữ tớiTTL; backoff2/5/15/30/60 giây, tôn trọng Retry-After cho429/503. Tối đa16 pending submissions/account; đủ queue thì chỉ cho start personal, không âm thầm xóa run. Logout/account switch dừng gửi queue dưới sai account; expiry giữ local summary, báo không xếp hạng.
- [ ] Thêm `/leaderboard` có Quick/Daily, ngày/version/tab, empty/error/paging/current player state thật; server-reported UTC cho ranked entry. Guest có thể xem board, không submit.

Acceptance: browser production Guest/verified/unverified, two accounts/cloud conflict/offline/reload, queue retry/expiry, simultaneous tabs, signed-in locale/resize/pause, verified vs personal labels và pending construction qua. Playable full smoke vẫn qua và không request tới `/api/v1`. Commit: `feat(w1.7): connect accounts cloud and ranked Web play`.

### W1.8 — Analytics và vận hành

- [ ] Event allowlist file06, bounded batch/dedupe/event version; rate-limit analytics riêng 30 batches/phút/subject. Không email/password/session/ticket/inputs; server verification rejection xuất từ server.
- [ ] Daily maintenance cleanup sessions/tokens/leases/rate buckets, cloud backups30 ngày và raw analytics30 ngày; jobs repeat idempotent.
- [ ] Docker migrate job một lần, app non-root, DB private, health/readiness; TLS proxy, production origin/cookie settings; trusted forwarded-IP config.
- [ ] Backup hằng ngày giữ14 ngày, mã hóa/permission/storage phù hợp; rehearsal restore vào DB riêng, kiểm row counts/cloud hashes/verified board và app reconnect.
- [ ] Logs requestId/runId/errorCode; monitor401/429/503, worker queue/timeout, save conflict/error, SMTP lỗi và backup age. Giữ app image cũ; migration expand/contract để rollback app còn đọc schema.

Acceptance: image thật chạy HTTP tại56789, DB restart persistent, migrate concurrency safe, worker asset có trong image, DB inaccessible public, scheduled jobs/backup/restore chứng minh được. Trong task này nghiệm thu Docker local/staging + Mailpit + restore DB riêng; production TLS/SMTP là gate sau phải chạy thực tế. Commit: `feat(w1.8): add telemetry maintenance and deployment operations`.

### W1.9 — Nghiệm thu và đánh dấu phase

- [ ] Unit core hiện hành + API/service/security tests + PostgreSQL integration DB riêng (không SQLite/mock thay transaction race).
- [ ] Chrome Web signed-in/Guest hai locale/ba viewports; Playable regression; migrations fresh/upgrade; payload/save/worker/concurrency/load limits.
- [ ] Docker build/run/health/play, native Argon2/worker/runtime compatibility; SMTP Mailpit receive/verify/reset và cookie/CSRF assertions trong local/staging; production TLS/SMTP được ghi thành gate chưa chạy.
- [ ] Restore rehearsal DB riêng + documented app rollback; tuyệt đối không overwrite production DB để làm test.
- [ ] Tạo `plan/evidence/W1-validation.json` + reports/screenshots/logs redacted; ghi environment, commit, commands, migrations, fixture/result và hạn chế.
- [ ] Update file06/README/audit/PROGRESS. `Implemented` cần endpoints thật và automated evidence; `Verified local/staging` cần image thật, Mailpit và restore evidence với environment ghi rõ; `Verified production` cần TLS/SMTP thật; `Released` chỉ khi thực sự rollout và monitoring.

Commit dự kiến: `test(w1.9): complete backend acceptance and evidence`. Không chốt thời gian hoàn thành cố định khi chưa benchmark worker/hashing và chưa có môi trường vận hành.

## 7. Luồng quan trọng cần kiểm trước khi bật capability

**Đăng nhập và cloud:** Guest snapshot → session thật → load remote → nếu khác, chọn nguồn + backup → switch active namespace → serial local save/cloud revision. Không đổi run đang chơi trước checkpoint/confirm.

**Ranked:** verified session → decode/prep assets → start ticket/config → tạo game từ config → local finish một lần → persisted finish queue → worker resim → DB transaction → verified badge/board. Timeout/network fail chỉ giữ pending submit; local result không bị mất.

**Submit trùng:** normalize payload → hash → kiểm owner/ticket → nếu settled cùng hash trả stored result; khác hash409 → claim verification lease → worker → transaction finalize. Retry sau timeout dùng cùng payload; invalid inputs không được biến thành điểm verified.

**Cloud conflict:** expectedRevision cũ →409 metadata mới → giữ local queue và remote → UI lựa chọn → backup không-selected → CAS resolve. Nếu remote đổi tiếp trong lúc chọn, conflict lại; không auto cộng tiến trình.

## 8. Test matrix bắt buộc

| Nhóm | Trường hợp dễ sai phải có evidence |
|---|---|
| TypeORM | DataSource init concurrency/retry, HMR pool reuse, explicit manifests/compiled CLI, migration fresh/upgrade/revert test-only, synchronize disabled, transaction rollback/runner release, CAS/locks/retry SQLSTATE |
| Auth | Login CSRF, cookie Secure prod, generic errors, reset revoke, concurrent single-use token, expired session trong lúc chơi |
| Cloud | 2 tabs/devices, same mutation retry, backup/quota fail, unknown schema, local/account A/account B namespace, pending City/Daily |
| Ticket | Start retry, token owner/config tamper, midnight, TTL, finish retry sau response mất, reload/offline, logout đổi account |
| Verification | Worker kill/timeout/full queue, huge body/ticks/fraction/sequence, old versions, invalid/non-ended, exact goldens |
| Boards | Assist/City/replay/incomplete Daily bị loại; unique best/account, 7-level tie-break, cursor không skip/duplicate trong snapshot/query policy |
| Operations | DB/SMTP down, process restart/lease recovery, migrate once, native package build, worker file missing, backup restore thật |
| Boundary | Playable không import/call backend; physics/XP/cosmetics/tutorial/pending local không thay vì verified response |

Leaderboard có thể thay đổi giữa hai requests; contract phải nêu cursor phản ánh live board hoặc thêm snapshot token. Launch dùng live board + refresh, không hứa snapshot ổn định nếu chưa lưu snapshot.

## 9. Thông tin vận hành cần trước gate thực tế

- Local mặc định PUBLIC_URL=http://localhost:56789 và bind127.0.0.1. Production domain/HTTPS URL chỉ cần ở gate triển khai production sau này.
- Local/staging dùng Mailpit: SMTP mailpit:1025 trong Docker; UI127.0.0.1:8025; from city-bloxx@localhost.test. SMTP provider/from/credentials thật chỉ yêu cầu ở gate production.
- PostgreSQL17: development/test credentials qua env, private network; named volume cho app DB, DB test/restore riêng; backup local directory bị git-ignore.
- Launch một app process, pool DB tối đa10 connections; chỉ trust reverse proxy đã allowlist; benchmark worker/hashing trên container local/staging.

Local/staging không dùng production DB hay inbox người thật. Chưa có domain/SMTP credentials production không chặn backend local/staging; production acceptance để riêng, không ghi đã qua khi chưa chạy.

## 10. Nguồn kỹ thuật và quy tắc dùng

Các con số game/queue/TTL/retention chính lấy từ file06; các defaults bổ sung được chốt trong tài liệu này. Kiểm API/package versions lại khi bắt đầu implementation.

- Next cookies có API async và chỉ ghi cookie trong Route Handler/Server Function: [Next cookies](https://nextjs.org/docs/app/api-reference/functions/cookies); ưu tiên docs Next cài trong repo khi code.
- Cookie/session protection: [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
- TypeORM DataSource/repositories: [DataSource](https://typeorm.io/docs/data-source/data-source/).
- Transaction dùng EntityManager được cấp trong callback, không dùng global manager: [TypeORM transactions](https://typeorm.io/docs/transactions/).
- Schema definitions: [EntitySchema](https://typeorm.io/docs/entity/separating-entity-definition/).
- Migrations: [TypeORM migration setup](https://typeorm.io/docs/migrations/setup/).
- Bounded CPU worker/pool: [Node worker_threads](https://nodejs.org/api/worker_threads.html); kiểm theo Node image đã pin.

Deterministic verification xác nhận kết quả tuân thủ luật/config, không chứng minh người chơi không dùng bot. Cloud XP/ownership vẫn personal/unverified; W1 không biến chúng thành currency hoặc competitive proof.
