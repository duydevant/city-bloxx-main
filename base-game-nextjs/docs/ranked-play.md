# Ranked Web play (W1.7)

The Web game menu offers **Ranked Quick** and **Ranked Daily** for the active account. A verified email and an available same-origin Nest gateway are required to start. Guest, personal Quick/Daily, Assist, City and replay keep their existing local behavior. The Playable does not install the ranked adapter or call these endpoints.

The renderer decodes the required artwork, obtains a server ticket, constructs the game from its canonical config, and durably binds the ticket to its local C4 identity before the crane moves. Daily uses the server UTC date and keeps it through resume. Resuming an existing personal/imported Daily cannot obtain a new ticket for its past inputs.

## Device queue

`lib/ranked/coordinator.ts` owns the queue; `browser.ts` binds it to the existing memory-JWT/HttpOnly-refresh auth session and cloud owner. `storage.ts` uses the separate IndexedDB database `city-bloxx.ranked.v1`, with one `accounts` row per owner. Read/write transactions acknowledge only on completion with strict durability.

Start first persists a UUID client request ID. Network retries reuse it; an unbound ticket can be reused after canceled navigation. Each renderer mount has a controller nonce, so two tabs cannot both bind the same ticket even with an identical stale C4 sequence. Web Locks serialize network work per owner; atomic IndexedDB changes and server receipts remain the durability boundary. BroadcastChannel messages contain the owner only.

A completed attempt first settles normal C4 progress, then queues an immutable finish body containing only the ticket, versions, inputs and end tick. Personal results are displayed separately from server results. Queue failure preserves personal progress and shows a save retry; the open page retains the completion in memory. On reload, a matching retained personal replay or completed Daily checkpoint can recover a completion only for its already bound ticket. Clearing browser data or losing all retained copies of the unsaved completion prevents that online submission from being recovered.

There are at most 16 nonterminal attempts per account. Starting another attempt trims terminal device history to the latest 32. Accepted/rejected/expired attempts discard their local ticket and raw submission body; personal summaries remain. Auth credentials never enter this database or GameSave, and ranked tickets never enter cloud save payloads.

## Retry and identity

- Offline/reload retains the exact finish body. Transient errors use 2/5/15/30/60-second backoff and honor a longer server `Retry-After`, including after manual retry/reload.
- Processing polls every two seconds. After reload or reauthentication the first request reposts the original finish body so Nest can bind the current session before polling.
- 401/403 parks the queue until its owning account reauthenticates. Every request checks the current account before and after the auth transport; switching to B never sends A's queue under B or displays A's results for B.
- 400/409/410/413/422 are terminal device outcomes. Expiry/rejection keeps personal results. Queued work is not expired merely by the device clock: Nest may already have accepted a finish whose response was lost, and its receipt remains readable after ticket TTL.
- Server acceptance updates verification/board status only. It never grants C4 XP, missions, achievements or personal statistics again.

The header trophy opens the EN/VI queue panel, with local vs server results, state, retry time, verification/sign-in links and retry saving/sending. The cloud panel remains responsible for save conflicts; a locked account pauses new ranked requests.

## Leaderboards

`/leaderboards` reads public Quick Standard and UTC Daily boards from Nest. Daily defaults to the server date. It shows public aliases, ranks and computed metrics; the account's `/me` standing is fetched separately with auth. Each page requests 20 rows and uses the server's opaque cursor for the next page. Boards are live: refresh from the first page when standings move. Internal owner IDs and tickets are never rendered.

Integration exposed a backend Daily partition mismatch: pg returns a SQL DATE as local-midnight `Date`, whereas public queries use a `YYYY-MM-DD` string. `boards.service.ts` now normalizes that calendar date before building the key, without converting it through UTC. Regression tests assert that an actual settled Daily appears in both the public board and its owner's standing. The compiled runtime is also checked under `TZ=Asia/Ho_Chi_Minh`.

## Validation

Run `npm test`, `npm run lint`, `npm run build:playable`, and the production Docker Web build. `npm run evidence:ranked` uses the existing guarded infrastructure runner: new disposable databases and three temporary containers, real Nest/PostgreSQL/Redis/Mailpit/Nginx, production Web, real Chrome and IndexedDB. Only animation frames and explicitly named network/quota faults are controlled. It temporarily enables automatic verification in that test API, then restarts that API with dispatch disabled for deterministic backend lease tests. Existing app containers, volumes and keys are preserved.

`scripts/browser-smoke.cjs` accepts `CITY_BLOXX_WEB_SMOKE_URL` and `CITY_BLOXX_PLAYABLE_SMOKE_URL` to run the shared regression suite against separate previews. Evidence for this milestone is in `plan/evidence/W1.7-validation.json`. Moderation, telemetry and operations remain W1.8; production rollout and actual-device certification remain separate gates.
