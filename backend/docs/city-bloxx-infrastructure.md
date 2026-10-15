# W1.0 — City Bloxx backend infrastructure

City Bloxx uses the existing Nest authentication/RBAC service. The API image bundles the same pure core used by Web/Playable. No auth schema, password, session or permission contract changes in this milestone.

## Build and checks

Run Docker builds from the repository root. Backend dependencies still come only from `backend/package.json` and `backend/yarn.lock`; frontend npm workspaces are not installed in the API image.

```sh
docker build --target builder -f backend/Dockerfile -t city-bloxx-w1-test:local .
docker run --rm city-bloxx-w1-test:local sh -c "yarn typecheck && yarn lint:check && yarn test:core"
docker build -f backend/Dockerfile -t city-bloxx-w1-api:local .
docker run --rm city-bloxx-w1-api:local node test/core-artifacts.cjs
```

`yarn build:core` creates a standalone CJS bundle and bundled declarations in ignored `.generated/`. The build checks that all bundled runtime imports stay in core/content. Nest consumes generated declarations; it never compiles shared source under a second root. `yarn build` copies bundle, worker and Quick/Daily golden fixtures into `dist/src/resources/city-bloxx/`. The existing `dist/src/main.js` and CLI paths stay stable.

`test:core` verifies Quick and all three Daily golden outcomes, UTC definition fixtures and fabricated-result rejection, using both the runtime loader and actual Node workers. This worker is the packaging/regression entry point. The bounded ranked verification pool and server-authoritative API are W1.6 work.

## Local gateway

From `backend/`, with the existing backend `.env` and volumes:

```sh
docker compose -f docker-compose.yml -f docker-compose.game.yml up -d --build
```

The overlay adds Web and Nginx; `/api/v1/*` goes to Nest and other paths go to Web. Public local entry is `http://localhost:56789`. Configure `GAME_PUBLIC_URL`, `GAME_WEB_PORT` and `GAME_AUTH_ALLOWED_ORIGINS` together when changing the address. The overlay sets the email portal URL and enables exactly one trusted proxy hop. Nginx replaces forwarded IP headers, preserves cookie paths/Origin/Authorization/request IDs and disables API caching. Recreate the gateway when recreating upstream services so its DNS resolution follows their new addresses.

The standalone root Web Compose deployment also uses port 56789. Transition that Web deployment to this overlay before running the gateway at the same port. Existing backend DB/Redis project names, volumes and migration/seed flow are retained. Do not generate replacement DB credentials for an existing volume if its `.env` is missing; recover the existing deployment configuration first.

Local debug API remains loopback 31005; production TLS, external SMTP and rollout have separate acceptance gates. W1.0 does not enable the Web sign-in UI or game/cloud/ranked routes.

## HTTP budgets and health

Native Nest automatic body parsing is disabled at both production and e2e boot. A single selected parser enforces these byte budgets before controller/DTO work, including chunked requests:

| Routes | JSON body limit |
|---|---:|
| Auth, user profile and default | 16 KiB |
| Game analytics/guest-events | 32 KiB |
| Game runs/finish | 256 KiB |
| Game save/save-resolve envelope | 272 KiB |

Compressed bodies and non-JSON mutation bodies are rejected with 415. Invalid JSON returns 400, oversized bodies 413. The gateway caps all bodies at 272 KiB. Cloud payload-specific validation remains W1.3 work.

`GET /api/v1/health/live` only reports process liveness. `/health/ready` returns 200 when PostgreSQL and Redis respond, 503 otherwise; no connection details are exposed. The legacy `/health` response is preserved. Worker pool readiness will be added when the pool exists in W1.6.

## Isolated gateway/auth acceptance

With a running existing backend stack and `city-bloxx-web:local` available, from the repository root:

```sh
docker pull nginx:1.28-alpine
npm run evidence:w1
```

The runner reads the existing API container environment without printing values, creates three temporary containers and an `auth_test_*` database, verifies real Nginx/auth/cookies/Origin/body limits plus production Web `/play`, and runs existing admin-seed/security/Jest suites. It preserves current application containers/volumes. Test Redis uses DB 1 without flushing it; Mailpit queries only UUID-addressed test messages. Temporary credentials are removed in `finally`. A sanitized result is written under ignored `tmp/w1-infrastructure-*/result.json`. Set `W1_ENV_CONTAINER` to select another trusted local API template container.

The tests also run migration down/up and seed twice exclusively in their newly created database. This is not a production deploy or restore test.
