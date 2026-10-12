# W1 — Backend Web, auth, cloud save và verified leaderboard

Trạng thái: Planned. Dependency: C4.0/C4.1 contracts; nghiệm thu cùng W0/C4. GDD: 50–51, 78–88, 93, 95.

Kế hoạch triển khai chi tiết sau W0 `8dff07f`: [06a — W1 implementation plan](06a-W1-implementation-plan.md), chia W1.0–W1.9, database/API contracts, file scope, acceptance và commit từng mốc. W1 vẫn Planned; cập nhật này chỉ viết plan, không triển khai backend.

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

- [ ] Argon2id password hashing, opaque DB-backed sessions; HttpOnly cookie, Secure production, SameSite=Lax.
- [ ] Thay Zustand localStorage access/refresh-token scaffold bằng user/session status query; không lưu password/token vào analytics.
- [ ] CSRF protection qua same-origin checks và token trên cookie-auth mutations; parameterized DB access.
- [ ] Email/password registration; SMTP env configurable cho verify/reset. Ranked yêu cầu verified email; local guest vẫn chơi được khi SMTP lỗi.
- [ ] Session expiry 30 ngày, revoke on logout/password reset; login errors không enumerate users.
- [ ] Profile mặc định private; không collect public PII. Public opt-in UI làm ở C6.
- [ ] Rate limit DB-backed: auth 5 requests/phút/IP (forgot tối đa 3/giờ/email), starts 10/phút/account, finishes 5/phút/account; trả Retry-After.
- [ ] Input length limits, error validation và request timeouts; server không chạy synchronous replay vô hạn chặn app.

## 4. Verification và leaderboard

- [ ] POST body tối đa 256 KiB; input ≤4096, endTick ≤432000, sequence/tick/fraction bounds theo core.
- [ ] Kiểm tra ticket/session/config/version/start time; không tin `result`, XP hoặc client ranked flag.
- [ ] Verification trong bounded worker-thread pool: hai jobs đồng thời, timeout 5 giây/job, queue tối đa 20; overload trả 503/retry, không mất ticket.
- [ ] Re-sim exact input/tick, chỉ chấp nhận ended result hợp lệ; Daily đủ 20 body mới ranked.
- [ ] Persist verified result và update personal board best trong một DB transaction.
- [ ] Quick Standard và Daily boards riêng; partition physics/ruleset/definition version, không so luật khác nhau.
- [ ] Sort population DESC, height DESC, Perfect rate DESC, Miss ASC, simulation ticks ASC, receivedAt ASC, runId ASC. Server không dùng client wall-clock để tie-break.
- [ ] Daily definition key bao gồm UTC date; Quick launch chỉ population board, height là secondary metric, không thêm nhiều board rỗng.
- [ ] Suspicious score vượt sanity bounds quarantine/reject theo verifier, không tự sửa score. Có admin audit log tối thiểu.

Deterministic resimulation chặn result/config giả, không chứng minh người thật không dùng bot. Không quảng cáo hệ thống này là chống cheat tuyệt đối.

## 5. Cloud save / guest migration

- [ ] Khi login, giữ local snapshot và remote snapshot; hiển thị conflict summary, không tự cộng XP/population/inventory.
- [ ] Empty cloud cho phép user chọn import guest. Guest stats/ownership vẫn private/unverified, không tạo leaderboard entry.
- [ ] Existing cloud và local khác nhau: chọn bản để tiếp tục; preserve non-selected snapshot một bản backup trong 30 ngày.
- [ ] `PUT /save` cần revision; mismatch 409 trả latest metadata, không last-write-wins âm thầm.
- [ ] Schema validation/migration server, max payload 256 KiB cho launch; unknown schema bảo toàn raw và báo incompatible.
- [ ] Offline giữ local queue; reconnect upload theo revision, pending ranked submission giữ ticket/inputs tới TTL.
- [ ] Không reset pending tower lúc logout; guest copy tách khỏi account save và giải thích trạng thái.

Cloud tiến trình local có thể bị chỉnh nên không là nguồn verified skill hoặc paid currency. Reward ledger có giá trị tiền không thuộc phase này; sau này phải tách server-authoritative economy, không chuyển guest XP thành tiền.

## 6. Analytics / Docker / vận hành

Events launch: session_start, mode_start, run_finish, retry, city_accept, daily_attempt/complete, mission_claim, cosmetic_unlock/equip, save_error, verification_reject và load timing. Event IDs dedupe, version/date/mode/class; không password/email/input log trong analytics. Retention raw events 30 ngày; không external analytics trong Playable.

- [ ] Prisma migrations có version; production deploy chạy migration một lần trước app release, không mỗi request.
- [ ] `.env.example` ghi WEB_PORT=56789, bind/public URL, DB/SMTP/session config placeholders; `.env` không commit secret.
- [ ] Compose lấy port/env variables; database private volume, healthcheck, app health endpoint.
- [ ] TLS qua reverse proxy; public URL/cookie settings production không dùng localhost mặc định.
- [ ] Backup database mỗi ngày, giữ 14 ngày; rehearsal restore vào DB riêng trước soft launch.
- [ ] `/api/health` không lộ config; logs runId/errorCode; monitor save errors/503/verification rejects.
- [ ] Retain old app image; rollback app chỉ khi DB schema backward-compatible; restore là thao tác có phê duyệt, không tự overwrite production.

## 7. Tests / DoD

- [ ] Register/login/logout/verify/reset expiry/reuse, CSRF, cookie attributes, rate limits, no email enumeration.
- [ ] Config tamper, fabricated score, invalid tick, huge payload, old version, non-ended replay reject.
- [ ] Same valid inputs bằng core result; duplicate/concurrent finish cập nhật một lần.
- [ ] Worker overload/timeout không giữ ticket settled sai; retry được.
- [ ] Daily qua nửa đêm, offline expired ticket và Assist không vào boards.
- [ ] Cloud revisions/conflict/import/backup/unknown schema, logout-account switch không leak save.
- [ ] Docker image build + HTTP health/play ở port 56789; DB restore thực tế; production SMTP/TLS.

DoD: endpoints thật thay scaffold, verified boards chỉ dữ liệu server, guest vẫn chơi; có deployment và restore evidence. Không đánh dấu xong nếu chỉ mock API hoặc compose config hợp lệ.
