# W1.2 — Web account integration

The Web app calls the existing Nest `/api/v1/auth/*` and `/api/v1/users/me*` endpoints through the same-origin Nginx gateway. It does not implement a second auth service in Next. Backend password/session policies, strict single-use refresh rotation, DTOs and response envelopes are retained.

## Pages and actions

- `/sign-in`, `/sign-up`, `/forgot-password`, `/resend-verification`, `/verify-email`, `/reset-password` have EN/VI forms and private/no-referrer metadata. New passwords use the backend baseline of 12–128 characters. Login permits existing passwords up to 128 characters; no password is silently trimmed.
- Email links require an explicit submit, so link prefetch does not consume tokens. The client reads the one-time token into a ref and removes its query from the current URL/history. Invalid/expired/reused links show a recovery action. Nginx access logs omit query strings, credentials and referrers; proxy error logging is limited to critical configuration/process failures to avoid per-request URL leakage.
- `/profile` shows real private account information, editable full name/username, change password, and confirmed logout/logout-all. Guest retains a local progress preview. Registration and recovery display server-compatible generic messages, with no raw server errors or credentials in UI/logs.
- Header sign-in opens a native modal. Switching sign-in/register/recovery forms in that modal does not navigate away from a live game. The shared session's generic `checkpointAndPause()` flushes local progress and pauses Quick/City/Daily. Remote account changes or session loss also checkpoint/pause; resuming remains an explicit game action.

Cloud synchronization, account-scoped saves, guest import and verified boards remain later milestones. Signing in at W1.2 leaves progress on this device. A Web API must be reachable through the gateway; standalone Next without that backend remains playable as Guest and reports account actions unavailable.

## Session and concurrency

`lib/auth/session.ts` keeps the access JWT and private profile only in memory. Refresh stays in the backend's HttpOnly `/api/v1/auth` cookie; refresh requests have no token body. The previous `auth-storage` key is removed without modifying the game save. No JWT/password is written to localStorage, sessionStorage or IndexedDB.

Cookie-mutating login/refresh/logout operations use exclusive Web Lock `city-bloxx-auth-refresh`. Each tab also uses single-flight refresh. BroadcastChannel asks peers for a current token and shares updates only in memory. Durable non-secret control metadata contains a revision and blocked/Guest flags. It is a crash receipt and stale-message guard, not a storage-based mutex. Web Locks supply the actual exclusion.

Before consuming a refresh cookie, the coordinator records a blocked receipt. Only a confirmed response enables automatic recovery again. Lost response, timeout or crash leaves the receipt blocked across tabs/reloads; explicit login is required. A delayed token broadcast from before logout cannot undo the newer blocked revision. A known missing backend/absent cookie stays Guest without repeated refresh attempts.

Without Web Locks, automatic refresh is disabled; explicit login works until access expiry. If durable storage is unavailable, explicit memory-only login remains possible while automatic recovery is disabled. Without BroadcastChannel, Web Locks still serialize cookie rotation, but tabs may rotate serially instead of sharing a token. No backend grace window or replay exception is introduced.

Account requests bind to the original actor and local session generation. A 401 may refresh and retry once; an account change cancels that retry, and stale responses cannot replace the current identity. Network failures are not automatically retried. Expiry, suspension or failed recovery clears account actions without a hard redirect or save reset. Normal logout uses the cookie so an expired bearer cannot shadow it; logout-all refreshes a needed bearer while preserving the original actor check.

## Acceptance

Run from the repo root with the existing local backend stack and Chrome installed:

```sh
docker build --target builder -f backend/Dockerfile -t city-bloxx-w1-test:local .
docker build --build-arg NODE_IMAGE=node:22-alpine --build-arg NEXT_PUBLIC_SITE_URL=http://localhost:56789 --build-arg "NEXT_PUBLIC_SITE_NAME=City Bloxx Online" -t city-bloxx-web:local .
npm run evidence:auth
```

The runner starts temporary Web/API/gateway containers and disposable databases; existing application containers, credentials, data and volumes are preserved. Browser port defaults to 56891 (`W1_BROWSER_PORT` override), Chrome debugging to 9236 (`W1_CHROME_PORT`). Temporary credential files are removed. Test accounts are UUID-addressed and email verification/reset uses actual Mailpit SMTP capture; fixtures never activate users to bypass email verification. Suspension is injected only for a created fixture user inside the disposable DB.

Browser acceptance checks two-tab expiry with one rotation, a response-stage failure after the server has consumed refresh, reload suppression and explicit login recovery, profile/recovery/password/logout flows, no-Locks fallback, 320×568 / 390×844 / 900×430 EN/VI layout, and a mounted live Quick preserved across suspension/modal changes. Native Web Locks/BroadcastChannel are used. Client expiry/visibility is controlled by the test; this is headless local acceptance, not actual-device or production certification.

`npm test` also exercises the coordinator with independent tabs sharing a serialized lock and crash metadata, no-storage/no-Locks fallbacks, logout expiry, stale broadcasts, account-bound retries and sanitized same-origin transport. Full Web/Playable smoke remains `npm run test:browser` against Web 3010 and Playable 4173 previews. [Versioned evidence](../../plan/evidence/W1.2-validation.json).
