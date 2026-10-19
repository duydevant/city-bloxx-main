# W1 — Backend Web, auth, cloud save và verified leaderboard

Trạng thái: Implemented — hoàn thành W1.0–W1.9 (Verified local/staging Docker), cập nhật 19/10/2026 theo [06c](06c-W1-city-bloxx-existing-backend-plan.md); Verified production / Released chờ domain/TLS/SMTP thật và rollout. [Evidence W1 tổng hợp](evidence/W1-nest-validation.json), [W1.0](evidence/W1.0-validation.json), [W1.1](evidence/W1.1-validation.json), [W1.2](evidence/W1.2-validation.json), [W1.3](evidence/W1.3-validation.json), [W1.4](evidence/W1.4-validation.json), [W1.5](evidence/W1.5-validation.json), [W1.6](evidence/W1.6-validation.json), [W1.7](evidence/W1.7-validation.json), [W1.8](evidence/W1.8-validation.json), [W1.9](evidence/W1.9-validation.json). Dependency: C4.0/C4.1 contracts; nghiệm thu cùng W0/C4. GDD: 50–51, 78–88, 93, 95.

Kế hoạch lịch sử sau W0 `8dff07f`: [06a — W1 implementation plan](06a-W1-implementation-plan.md), chia W1.0–W1.9, database/API contracts, file scope, acceptance và commit từng mốc. Bản06a được viết khi W1 còn Planned; trạng thái triển khai mới nhất theo06c và evidence ở trên.

**Cập nhật13/10/2026:** đã có Nest user/auth/RBAC source tại `backend/`. Dùng [06c — City Bloxx trên backend hiện có](06c-W1-city-bloxx-existing-backend-plan.md) làm plan implementation hiện hành. Các phần dưới và06a/06b giữ đặc tả lịch sử; lựa chọn Next Route Handlers/ORM/auth/rate-limit topology xung đột được thay bằng Nest11 + TypeORM0.3 + PostgreSQL16 + Redis7 + JWT/refresh contract đã có. Game fairness/cloud/verification requirements còn phù hợp tiếp tục áp dụng; không tạo user/auth thứ hai.

## 1. Kiến trúc và boundary

Next Route Handlers trong app hiện tại + PostgreSQL + Prisma. Shared core làm server replay verification; không service gameplay thứ hai. Database chỉ mạng nội bộ Docker, không publish port DB mặc định. Không thêm Redis chỉ để làm launch.

Auth thật thay TODO hiện có. Guest chơi không cần login; ranked/cloud yêu cầu account. Playable không import module HTTP/auth/analytics này.

## 2. Database và interfaces

Các entities tối thiểu: User, Session, EmailToken, PlayerProfile, CloudSave (schema/revision/payload), RunTicket, VerifiedRun, LeaderboardEntry, AnalyticsEvent. Unique constraints cho run ID, ticket settlement và leaderboard key theo account/mode/definition/version.

API dưới `/api/v1`; response success/error typed, không expose stack trace hoặc secret:

| Endpoint | Contract |
|---|---|
| `POST /auth/register`, `/login`, `/logout` | Email/password, session cookie; logout revoke session |
| `GET /auth/me` | Profile/current session; 401 khi không login |
| `POST /auth/verify`, `/forgot-password`, `/reset-password` | Single-use expiring token; không reveal email tồn tại |
| `GET /profile`, `PATCH /profile` | Private profile/settings; display name validated |
| `GET /save`, `PUT /save` | Revision + schema payload; PUT cần expected revision |
| `GET /daily/today` | Server UTC/date và pinned versioned definition |
| `POST /runs/start` | Mode/definition yêu cầu; server cấp run ID/ticket/config canonical |
| `POST /runs/finish` | Ticket + input log/endTick/version; server tính lại result |
| `GET /leaderboards/quick`, `/leaderboards/daily` | Paginated verified entries/current player rank |
| `POST /analytics/events` | Batched allowlisted events, rate-limited, no per-frame spam |

Ranked config do server cấp; client không được chọn legacy flags, Assist, band, class hoặc target tùy ý. Run ticket là opaque random token lưu hash trong DB, bound account/config, TTL 24 giờ; finish sau UTC rollover vẫn dùng ngày ticket. Mỗi ticket chỉ settle một lần; repeated identical submit trả cùng result; conflicting payload trả 409.

## 3. Authentication / security

- [x] Argon2id password hashing, DB-backed sessions + JWT memory/HttpOnly refresh cookie theo06c; Secure production, SameSite=Lax.
- [x] Thay Zustand localStorage access/refresh-token scaffold bằng user/session status query; không lưu password/token vào analytics.
- [x] CSRF protection qua same-origin checks trên cookie-auth mutations; parameterized DB access.
- [x] Email/password registration; SMTP env configurable cho verify/reset. Ranked yêu cầu verified email; local guest vẫn chơi được khi SMTP lỗi.
- [x] Session expiry 30 ngày, revoke on logout/password reset; login errors không enumerate users.
- [x] Profile mặc định private; không collect public PII. Public opt-in UI làm ở C6.
- [x] Rate limit Redis-backed theo06c: auth policy hiện hữu + game starts 10/phút/account, finishes 5/phút/account, cloud/status/analytics 30/phút; trả Retry-After.
- [x] Input length limits, error validation và request timeouts; server không chạy synchronous replay vô hạn chặn app.

## 4. Verification và leaderboard

- [x] POST body tối đa 256 KiB; input ≤4096, endTick ≤432000, sequence/tick/fraction bounds theo core.
- [x] Kiểm tra ticket/session/config/version/start time; không tin `result`, XP hoặc client ranked flag.
- [x] Verification trong bounded worker-thread pool: hai jobs đồng thời, timeout 5 giây/job, queue tối đa 20; overload trả 503/retry, không mất ticket.
- [x] Re-sim exact input/tick, chỉ chấp nhận ended result hợp lệ; Daily đủ 20 body mới ranked.
- [x] Persist verified result và update personal board best trong một DB transaction.
- [x] Quick Standard và Daily boards riêng; partition physics/ruleset/definition version, không so luật khác nhau.
- [x] Sort population DESC, height DESC, Perfect rate DESC, Miss ASC, simulation ticks ASC, receivedAt ASC, runId ASC. Server không dùng client wall-clock để tie-break.
- [x] Daily definition key bao gồm UTC date; Quick launch chỉ population board, height là secondary metric, không thêm nhiều board rỗng.
- [x] Quarantine/release có RBAC, resimulate trước khi release, không tự sửa score. Có admin audit log đầy đủ.

Deterministic resimulation chặn result/config giả, không chứng minh người thật không dùng bot. Không quảng cáo hệ thống này là chống cheat tuyệt đối.

## 5. Cloud save / guest migration

- [x] Khi login, giữ local snapshot và remote snapshot; hiển thị conflict summary, không tự cộng XP/population/inventory.
- [x] Empty cloud cho phép user chọn import guest. Guest stats/ownership vẫn private/unverified, không tạo leaderboard entry.
- [x] Existing cloud và local khác nhau: chọn bản để tiếp tục; preserve non-selected snapshot một bản backup trong 30 ngày.
- [x] `PUT /save` cần revision; mismatch 409 trả latest metadata, không last-write-wins âm thầm.
- [x] Schema validation/migration server, max payload 256 KiB cho launch; unknown schema bảo toàn raw và báo incompatible.
- [x] Offline giữ local queue; reconnect upload theo revision, pending ranked submission giữ ticket/inputs tới TTL.
- [x] Không reset pending tower lúc logout; guest copy tách khỏi account save và giải thích trạng thái.

Cloud tiến trình local có thể bị chỉnh nên không là nguồn verified skill hoặc paid currency. Reward ledger có giá trị tiền không thuộc phase này; sau này phải tách server-authoritative economy, không chuyển guest XP thành tiền.

## 6. Analytics / Docker / vận hành

Events launch: session_start, mode_start, run_finish, retry, city_accept, daily_attempt/complete, mission_claim, cosmetic_unlock/equip, save_error, verification_reject và load timing. Event IDs dedupe, version/date/mode/class; không password/email/input log trong analytics. Retention raw events 30 ngày; không external analytics trong Playable.

- [x] TypeORM migrations có version theo06c; deploy chạy migration một lần trước app release, không mỗi request.
- [x] `.env.example` ghi WEB_PORT=56789, bind/public URL, DB/SMTP/session config placeholders; `.env` không commit secret.
- [x] Compose lấy port/env variables; database private volume, healthcheck, app health/readiness endpoint.
- [ ] TLS qua reverse proxy trên domain thật; public URL/cookie settings production (gate production riêng).
- [x] Backup database mỗi ngày, giữ 14 ngày; rehearsal restore vào DB riêng đã xác minh đủ 15 bảng, SHA-256 cloud save và boot app.
- [x] `/api/v1/health*` không lộ config; logs requestId/runId/errorCode; monitor save errors/503/verification rejects.
- [x] Retain old app image; rollback app chỉ khi DB schema backward-compatible; restore là thao tác có phê duyệt, không tự overwrite production.

## 7. Tests / DoD

- [x] Register/login/logout/verify/reset expiry/reuse, CSRF, cookie attributes, rate limits, no email enumeration.
- [x] Config tamper, fabricated score, invalid tick, huge payload, old version, non-ended replay reject.
- [x] Same valid inputs bằng core result; duplicate/concurrent finish cập nhật một lần.
- [x] Worker overload/timeout không giữ ticket settled sai; retry được.
- [x] Daily qua nửa đêm, offline expired ticket và Assist không vào boards.
- [x] Cloud revisions/conflict/import/backup/unknown schema, logout-account switch không leak save.
- [x] Docker image build + HTTP health/play qua gateway; DB restore rehearsal thực tế trên PG16 riêng (production SMTP/TLS giữ gate riêng).

DoD: endpoints thật thay scaffold, verified boards chỉ dữ liệu server, guest vẫn chơi; có local/staging Docker acceptance và restore evidence tại [W1-nest-validation.json](evidence/W1-nest-validation.json). Production TLS/SMTP/rollout theo gate [08 — Soft-launch checklist](08-soft-launch-checklist.md).
