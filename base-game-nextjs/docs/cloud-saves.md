# W1.4 — Web cloud saves and Guest migration

The Web shell now uses the existing Nest `/city-bloxx/profile`, `/save` and `/save/resolve` endpoints. Open the cloud button in the header to inspect local/cloud status, choose a conflicting snapshot, import Guest progress or download originals/backups. On narrow screens the button uses a cloud icon with the full status in its accessible label/title. Auth-only pages have a floating equivalent. The panel and account forms support EN/VI.

## Ownership and durability

- Guest retains `city-bloxx.quick-save.v2` and the legacy best-score migration in localStorage. Existing Guest recovery/unsaved-play behavior remains: an unreadable save disables writes until recovery succeeds. Unknown/corrupt originals are never replaced by an empty save.
- Each account has an independent record in IndexedDB `city-bloxx.accounts.v1` (`accounts`, keyed by actor UUID). It contains raw local snapshot, local version, cloud baseline/revision, pending mutation, conflict snapshot and retry deadline. Backups have an owner index and expiry index. Browser storage never contains a JWT, password or refresh token.
- `city-bloxx.active-save-owner.v1` remembers only the last opened UUID. An expired/uncertain auth session can reopen its cached account snapshot, with cloud actions paused; it does not silently reinterpret that save as Guest. Confirmed logout opens the separate Guest context. Cross-tab identity changes checkpoint and require review before opening another context.
- Login explicitly confirms the account-context change. Login/logout wait for the active renderer's durable local checkpoint. Bound save ports carry a context generation and local version; late writes/responses cannot change another account. Switching contexts preserves unfinished City/Daily checkpoints. Leaving Quick retains its existing settlement behavior.
- A successful `SavePort.save()` acknowledges only completed local persistence. IndexedDB resolves on transaction completion with strict durability, including backup writes; quota/abort/blocked storage fails visibly. Accounts never fall back to Guest/localStorage when IndexedDB is unavailable.

`lib/cloud/coordinator.ts` owns synchronization, `storage.ts` owns IndexedDB transactions, `browser.ts` binds auth/lifecycle/Web Locks/BroadcastChannel, and `use-cloud.ts` exposes stable snapshots to React. The shared renderer only uses optional port flushing and an awaitable local checkpoint/drain; it has no Web API/IndexedDB dependency. Playable keeps its existing adapter and package boundary.

## Sync and conflict behavior

Local writes happen first. Unsent writes coalesce over two seconds; pause, menu, result, pagehide and hidden visibility request a cloud flush after the local checkpoint. Page termination cannot guarantee remote delivery, so the durable queue remains authoritative for later retry.

Before HTTP, an IndexedDB transaction persists a fixed mutation UUID, expected decimal revision and immutable request. Once a request might have reached the server, newer local work never changes that request. Its receipt is acknowledged first, then the newer snapshot gets a new mutation/revision. Lost response/reload retries the exact request; backend receipts prevent duplicate commits. Decimal BIGINT revisions remain strings throughout.

Cloud sends use the original account's `AuthSession.request`, with owner checks before and after the request. A per-account Web Lock reduces duplicate traffic between tabs. Without that lock, the shared transaction-persisted request and server idempotency still protect the commit. BroadcastChannel carries only owner/version notifications, never save payloads or credentials. An older tab cannot overwrite a newer local version: its attempted checkpoint is backed up and it must explicitly open the saved account copy.

Network/503 failures retain the queue; retry honors a persisted Retry-After deadline (5-second fallback, 60 seconds for 429). Reconnect retries. Auth/permission failures pause cloud actions. Definitive 400/413/422 rejection backs up the rejected mutation before releasing it, so a corrected local snapshot can use a new mutation. Lock-service failures remain retryable without unhandled promise rejections.

On first account use, no cached snapshot means the server must confirm whether cloud exists before creating account progress. Compatible cloud can initialize an empty device cache. Existing offline changes are compared with their baseline; a different cloud revision/payload produces an explicit conflict. A newer cloud copy is never loaded into a running session silently.

The conflict panel shows separate best/XP/City population/pending City/Daily summaries, cloud revision and update time. Choosing local/cloud first durably backs up both candidates (and any superseded pending request), then persists a fixed resolve request with `localBackupAcknowledged: true`. The active local snapshot changes only after the server commits resolve. Client or server backup failure preserves both candidates. A repeated/lost resolve response reuses the same request. No stats, XP, inventory or towers are added together.

Guest import requires an explicit confirmation with both summaries. It backs up the Guest original and the account's existing device copy before replacement; Guest stays unchanged. If offline, the imported candidate remains local and syncs later using CAS. If cloud has changed, selection is still required. Import never publishes a verified score.

Unknown schema originals remain available for download. A future cloud schema cannot be overwritten by this client. The player can keep a compatible device snapshot for local play while leaving cloud conflict unresolved. Backups are owner-scoped, have 30-day expiry, and the download transaction filters expired snapshots and removes up to 500 expired records via the expiry index. Account snapshots and pending queues are not expired or removed on logout.

## Acceptance

```sh
npm test
npm run lint
npm run build:playable
docker build --target builder -f backend/Dockerfile -t city-bloxx-w1-test:local .
docker build --build-arg NODE_IMAGE=node:22-alpine --build-arg NEXT_PUBLIC_SITE_URL=http://localhost:56789 --build-arg NEXT_PUBLIC_SITE_NAME=CityBloxx -t city-bloxx-web:local .
npm run evidence:cloud
npm run evidence:auth
npm run test:browser
```

`evidence:cloud` uses actual Chrome profiles for two independent devices, same-profile tabs, actual IndexedDB and Nest/PostgreSQL/Redis/Mailpit/Nginx. It verifies registration/SMTP/login, game alias, explicit Guest import, API-offline reload/reconnect, consumed/lost write response, both conflict choices, induced IndexedDB backup failure, account/Guest isolation, raw future-schema preservation and EN/VI layouts. The same runner executes existing cloud/schema/auth/security regression and removes its temporary containers/databases/env file.

The test environment is copied only from documented backend environment keys; unrelated multiline PEM values are not copied into Docker env-files. No credentials are printed. Existing application containers/volumes are preserved; these commands do not migrate/deploy the live stack.

Full Web/Playable smoke expects temporary previews on Web 3010 and Playable 4173. It covers shared gameplay/save recovery and mobile/landscape layouts. Unit tests exercise storage/network failure and delayed account races deterministically; the Chrome suite additionally checks actual storage transactions and real server receipts. [Versioned evidence](../../plan/evidence/W1.4-validation.json).

Offline API recovery does not install a service worker or make an uncached Web shell load without network. Pagehide delivery is best effort; durable local data/queue survives. Actual-device and production TLS/SMTP/rollout remain separate gates. Server tickets, ranked verification and boards remain W1.5–W1.7.
