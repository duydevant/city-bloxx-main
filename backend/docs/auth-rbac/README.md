# Authentication + RBAC

## Chạy local bằng Docker

```sh
node scripts/setup-local.cjs
docker compose up -d --build
node scripts/bootstrap-local.cjs
```

- API: http://localhost:31005/api/v1
- Swagger: http://localhost:31005/swagger
- Mailpit: http://localhost:58025 (email verification/reset local)
- PostgreSQL: localhost:55432; Redis: localhost:56379.
- Stack/volume tên `base-nest-bo-minh-auth`, tách stack cũ. Không dùng `down -v` nếu muốn giữ tài khoản.
- Secret DB/JWT/outbox ngẫu nhiên trong `.env` gitignored. Super admin local được bootstrap qua stdin, credential ở `.tmp/local-super-admin.json`, không có default password và không in ra terminal.

### Seed tài khoản admin từ .env

`scripts/setup-local.cjs` tạo `ADMIN_EMAIL=admin@example.test`, `ADMIN_PASSWORD` ngẫu nhiên và `ADMIN_FULL_NAME` trong `.env` local. Với `.env` đã tồn tại, script chỉ bổ sung admin config khi cả hai biến chưa được khai báo; không ghi đè cấu hình người dùng. Muốn chọn tài khoản khác, sửa các biến này trước lần seed đầu tiên. `.env.example` để email/password trống, không ship credential mặc định.

```dotenv
ADMIN_EMAIL=your-admin@example.com
ADMIN_PASSWORD=<your-own-strong-password-at-least-12-characters>
ADMIN_FULL_NAME=Administrator
```

```sh
# Compose migrate service chạy migrate + seed trước API; tự seed admin khi có đủ biến.
docker compose up -d --build
# Khi thay đổi .env, dùng container mới để đọc giá trị mới (exec giữ env cũ của container):
docker compose run --rm migrate node scripts/cli.cjs seed-admin
# Nếu đã build/cài dependencies và chạy trực tiếp ngoài Docker:
yarn seed:admin
```

Admin mới active, email verified theo thao tác provisioning tin cậy của operator, có roles `user` + `admin`, không có `super_admin`. Password hash Argon2id; không log hoặc ghi credential vào audit. Seed chạy lại giữ nguyên password/status/roles/profile, kể cả khi tài khoản seed đã bị suspend hoặc thu hồi role; thay `ADMIN_PASSWORD` không reset password của account cũ. Dùng password-change/reset workflow để đổi mật khẩu. Nếu email trùng một user thường chưa được provision bằng seed, seed từ chối thay đổi/nâng quyền. Để cả email/password trống thì chỉ seed role/permission, bỏ qua account; khai báo một biến hoặc password yếu thì lỗi rõ ràng và rollback.

## Kiểm tra

```sh
docker compose build test
docker compose --profile test run --rm test
docker compose --profile test run --rm test yarn typecheck
docker compose --profile test run --rm test yarn lint:check
```

Test runner tạo DB `auth_test_*` riêng, migration down/up trên DB này, seed hai lần, boot compiled API, chạy Jest và security integration; chỉ xóa DB nó tạo, không reset DB ứng dụng. Tests dùng Redis DB 1; app local dùng DB 0. Mailpit là mailbox local dùng chung nên chỉ sử dụng email test UUID.

## JWT/cookie/client contract

- HS256 theo yêu cầu chủ dự án. JWT_SECRET tối thiểu 64 ký tự (local: 32 random bytes hex); chỉ accept HS256, issuer/audience/type/exp và UUID claims hợp lệ.
- TTL access 900s; refresh opaque 256 bits, SHA-256 digest trong DB, single-use rotation; session absolute 30 ngày, không gia hạn deadline.
- Login/refresh trả `{success,data:{accessToken,tokenType,expiresIn,user},timestamp,path}`. Refresh chỉ trong cookie HttpOnly, SameSite=Lax, Path=/api/v1/auth; Secure bắt buộc production. Local HTTP dùng COOKIE_SECURE=false.
- Frontend gọi refresh với credentials và Origin trong AUTH_ALLOWED_ORIGINS, thực hiện single-flight. Duplicate refresh kể cả do client race bị coi là replay: một request có thể thành công nhưng session/family sau đó bị revoke, cần login lại.
- Chưa hỗ trợ cross-site SameSite=None hoặc native JSON refresh transport. Chỉ deploy topology same-site cho web; cần workflow CSRF bổ sung trước khi mở cross-site.
- Logout nhận Bearer hoặc refresh cookie; cookie-only logout cần Origin hợp lệ. Logout-all/reset/change-password revoke mọi session và tăng token_version. Change password cần currentPassword và bắt login lại.
- Guard đọc DB mỗi request, không cache permissions. Suspend/delete/revoke/demotion ảnh hưởng request tiếp theo; request đang thực thi không bị hủy giữa chừng.

## Quyền và API

API prefix `/api/v1`; Swagger là route/DTO inventory của 51 endpoints auth/profile/admin. Admin APIs có explicit permission decorators và policy service. Query dùng `page`/`pageSize` (integer, <=100), payload list `{data:[],pagination:{page,pageSize,total,totalPages}}` nằm trong success `data`.

- `user`: profile:read/profile:update self-only. Default role duy nhất và protected.
- `admin`: baseline permissions được liệt kê explicit trong catalog seed; không bypass system protections.
- `super_admin`: protected server-defined bypass permission checks, vẫn chịu ownership/session/account/invariants.
- Role/permission system không sửa/delete/deactivate qua API. Role/permission codes bất biến; PATCH chỉ display fields, status custom resource ở route riêng.
- Admin không sửa role đang giữ, không tự thay assigned roles, không grant ngoài tập quyền hiện tại hay quản lý target cao quyền hơn. Bảo vệ recipients khi thay role-permission.
- Assign super_admin chỉ secure operator CLI; API generic không nhận assignment này kể cả super admin. CLI bootstrap tạo tài khoản mới, không upgrade tài khoản hiện hữu. Suspend/delete final active super admin bị chặn bằng transaction/advisory lock.
- PUT assignments replace atomic; POST add và DELETE remove idempotent set operations. Delete custom role/permission có assignments trả 409.
- Custom permission không tự gắn enforcement vào business route. Developer phải dùng server-defined policy cho route tương ứng.
- Public register không auto-login; email verification bật mặc định. Profile PATCH không nhận email/status/roles/password. Admin create dùng invitation reset link + verification riêng nếu policy bật.

## Schema/migration/seed

TypeORM DataSource dùng chung PostgreSQL config, migrations versioned, synchronize=false. Business repositories dùng EntityManager SQL tham số hóa cho partial indexes và row locking; không dùng ORM synchronize để sinh schema.

10 bảng nghiệp vụ users/roles/permissions/assignments/sessions/tokens/audit + encrypted `mail_outbox`; UUID sinh application-side, không cần pgcrypto extension. User soft-delete; token/assignment không soft-delete; audit actor FK SET NULL. Password Argon2id (64MiB, timeCost=3, parallelism=1). Token hashing chỉ dùng SHA-256 cho cryptographically random token, không cho password.

```sh
docker compose exec -T api node scripts/cli.cjs migrate
docker compose exec -T api node scripts/cli.cjs seed
# Credentials JSON đọc từ stdin, không đưa password vào command args:
docker compose exec -T api node scripts/cli.cjs bootstrap-super-admin
```

Seed idempotent; không tự phục hồi assignment bị thu hồi trên system role đã tồn tại. Cập nhật catalog mới cần migration/reconcile explicit có review. Bootstrap không overwrite credential của existing user. Migrate service chạy trước API; production dùng single migration job.

## Mail/audit/operations

Mail outbox AES-256-GCM với MAIL_OUTBOX_KEY riêng; raw reset/verify token không lưu trong token tables hoặc logs. Worker claim FOR UPDATE SKIP LOCKED, retry/backoff, xóa ciphertext sau send/expiry. SMTP là at-least-once: crash sau SMTP acceptance có thể gửi lại cùng one-time link. Failed delivery không làm mất token, quan sát backlog/attempts. Mailpit chỉ local; production dùng SMTP thật và không expose Mailpit.

Audit success cùng transaction mutation; authorization denial ghi ngoài transaction rollback. Audit metadata allowlist, không raw secrets, không raw request body; unexpected exceptions không dump query parameters. Audit retention chưa tự xóa: vận hành cần xác định retention trước production, kiểm soát quyền đọc và bảo vệ backups.

Cleanup định kỳ xóa session sau expiry +7 ngày (refresh lineage cascade), reset/verify sau expiry +7 ngày, sent mail sau 1 ngày. Redis chỉ dùng distributed rate limit, authorization không phụ thuộc cache. Limiter unavailable trả 503 thay vì bỏ rate limit.

Default budgets/300s: login 5, refresh 30, các auth mutation public khác 10, theo IP và normalized email digest. Có thể override `<ROUTE>_RATE_LIMIT` bằng positive integer, ví dụ LOGIN_RATE_LIMIT. Các thông số cấu hình cần phù hợp reverse proxy/topology; APP_TRUST_PROXY=false local, true chỉ tin 1 hop khi proxy đã được kiểm soát.

## Deployment và rollback

Fresh local DB đã tách riêng. Với DB hiện hữu phải inventory schema/migration history và dữ liệu trước khi chạy migration này: migration cố tình không IF NOT EXISTS để không che xung đột users/roles cũ. Không tự convert email verification/admin roles của account cũ. Nếu có schema cũ cần additive adaptation/backfill riêng, không chạy DDL mới lên production mù.

Staging: backup/restore rehearsal → migrate → seed → bootstrap qua operator stdin/secret manager → tests → verify SMTP/cookie/proxy/origins → deploy compatible app. NODE_ENV=production, COOKIE_SECURE=true, PostgreSQL/Redis trên network private, secret riêng từng môi trường. Không dùng compose local overrides cho production.

Rollback production giữ additive tables/audit history; rollback app compatible schema hoặc forward-fix. Migration down phá schema chỉ chạy disposable test DB trước khi ghi dữ liệu ứng dụng. Khi cần rotate HS256 secret hiện tại, tất cả access JWT cũ mất hiệu lực; refresh hợp lệ có thể cấp access JWT mới. Muốn force logout toàn bộ phải revoke sessions/token versions riêng. Outbox key rotation cần drain/purge encrypted queue trước đổi key.
