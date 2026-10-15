
# NestJS Authentication + RBAC

City Bloxx W1.0: [shared core build, gateway, readiness and isolated acceptance](docs/city-bloxx-infrastructure.md). Docker build context is now the repository root; Compose handles this automatically.

City Bloxx W1.1: [game schema, migration/seed grants and transaction ownership policy](docs/city-bloxx-schema.md).

NestJS 11, TypeORM 0.3, PostgreSQL 16, Redis 7, JWT HS256, Argon2id. Backend gồm authentication, refresh rotation, sessions, email/password lifecycle, RBAC N:N và admin APIs.

## Chạy local bằng Docker

Cần Node.js 22 để chạy setup script và Docker Compose.

```sh
node scripts/setup-local.cjs
docker compose up -d --build
```

Setup tạo `.env` với secret và password admin ngẫu nhiên. Chỉnh `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FULL_NAME` trước lần seed đầu nếu muốn dùng tài khoản riêng. Migrate service tự chạy migration và seed trước API.

- API: http://localhost:31005/api/v1
- Swagger: http://localhost:31005/swagger
- Email local/Mailpit: http://localhost:58025
- PostgreSQL: localhost:55432; Redis: localhost:56379.

## Seed và bootstrap

```sh
# Container mới đọc cấu hình ADMIN_* mới nhất từ .env:
docker compose run --rm migrate node scripts/cli.cjs seed-admin
# Super admin dành cho thao tác đặc quyền, bootstrap riêng qua stdin:
node scripts/bootstrap-local.cjs
```

Admin env-seed có roles `user` + `admin`; password nằm trong `.env` gitignored. Seed chạy lại không overwrite password, status hay role assignment của account đã provision. Super admin local dùng password ngẫu nhiên, lưu tại `.tmp/local-super-admin.json` gitignored.

## Kiểm tra

```sh
docker compose build test
docker compose --profile test run --rm test
docker compose --profile test run --rm test yarn typecheck
docker compose --profile test run --rm test yarn lint:check
```

Tests dùng database `auth_test_*` riêng, không reset dữ liệu ứng dụng.

## Chạy ngoài Docker

Sau khi cấu hình PostgreSQL/Redis/SMTP trong `.env`:

```sh
yarn install --frozen-lockfile
yarn build
yarn migrate:run
yarn seed:run
yarn start:dev
```

Chi tiết API contract, security policy, env, migrations và deployment/rollback: [hướng dẫn Auth/RBAC](docs/auth-rbac/README.md).
