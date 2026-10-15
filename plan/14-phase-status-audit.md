# 14 — Audit trạng thái phase cập nhật 15/10/2026

Audit ban đầu đối chiếu HEAD `1e0ebdc` và 19 file code/test thay đổi với task/DoD của `plan/`. Cập nhật sau khi hoàn thiện C4.0–C4.3 và W0 theo yêu cầu người dùng; evidence audit cũ được giữ riêng bên dưới.

## Kết luận

**Cập nhật 15/10:** đã tiếp tục theo yêu cầu mới; **W1.0–W1.2 Implemented**, toàn W1 **In progress**, tiếp theo W1.3. Nginx/core-worker/schema/permissions và Web auth thật đã qua local automated acceptance. 247 tests, lint/builds và real-browser/Nest/SMTP suites qua, gồm hai tab/refresh response loss/suspend giữa Quick. [Evidence W1.2](evidence/W1.2-validation.json). Câu “dừng trước W1” trong snapshot hoàn thành W0 bên dưới là lịch sử, không còn là chỉ thị hiện hành.

**C4.0–C4.3 và W0 đã hoàn thành triển khai (Implemented)**. C4.0 `11c3901`, C4.1 `ab4d02d`, C4.2 `0b72f10`, C4.3 `5b63174`; W0 commit `feat(w0): complete Web routes navigation and guest experience` hoàn thiện content routes/local data, shared navigation/deep-link, tutorials/Guest/accessibility/SEO. 231/231 tests, lint, hai production builds, save/Daily evidence và toàn bộ Chrome smoke cả hai shell qua. [Evidence W0](evidence/W0-validation.json); [C4.3 evidence lịch sử](evidence/C4.3-validation.json). **Dừng trước W1 Backend theo yêu cầu**; actual SDK/thiết bị/server verification/release giữ gate riêng.

| Phase/tài liệu | Trạng thái thực tế | Bằng chứng / phần còn thiếu |
|---|---|---|
| 00 — Project audit | Snapshot đã có | Giữ nguyên baseline schema 3 trước C4; không đổi snapshot cũ thành tiến độ mới. |
| C4.0 — Save/stats/history | Implemented — hoàn thành | 139/139 tests, lint/assets/boundaries, hai builds, browser smoke cả hai shell và save-size evidence qua. Recovery, serial snapshots, base XP/receipts, 160 EN/VI catalog strings đã có. |
| C4.1 — Daily Tower | Implemented — hoàn thành | Recipe `daily-v1`, ruleset `daily-tower-1`, Industrial 20 body + một roof; pinned UTC date, pending/resume, complete PB/failed height, streak/longest/lifetime và seven-day strip. 32 Daily tests, golden fixtures và browser EN/VI/rollover/replay/lifecycle hai shell qua; Quick PB/City unlock giữ nguyên. |
| C4.2 — Progression/missions/achievements | Implemented — hoàn thành | 44 progression tests, đủ 20 achievement boundary fixtures, XP curve/caps/overflow; missions UTC/availability/fallback/claim/reroll, crash/reload idempotency và shared result/menu EN/VI. Browser hai shell qua ở ba kích thước; grouped unlocks, skip/Reduced Motion/pause/save retry qua. [Evidence](evidence/C4.2-validation.json). |
| C4.3 — Cosmetics/Architecture Book | Implemented — hoàn thành | Catalog 19 items, Brick 18 PNG + badge, lifetime grants một lần, inventory migration, mix building/roof/crane và City/pending pin. 13 tests cosmetics; browser EN/VI/keyboard/layout/failure/retry/golden fairness hai shell, alpha/seam/budget/cache qua. [Evidence](evidence/C4.3-validation.json). |
| W0 — Web routes/responsive | Implemented — hoàn thành | Đủ content routes/shared controllers/local data, deep-link/confirm/Back/Forward/pending, Guest/auth unavailable, independent tutorials/migration, normal content scroll và locked play. 231 tests, lint/builds, EN/VI/layout/keyboard/SEO và full browser smoke hai shell qua. [Evidence](evidence/W0-validation.json). Actual phone gate chưa Verified. |
| W1 — Backend game/cloud/leaderboards | In progress — W1.0–W1.2 Implemented | Có hạ tầng/schema/permissions và Web auth thật, JWT memory/refresh cookie, EN/VI forms/profile/recovery, Web Locks và in-place sign-in. 247 tests, build/lint, real-browser và auth/schema/security regression qua. [Evidence](evidence/W1.2-validation.json). W1.3–W1.9 còn mở: game profile/cloud APIs, sync/ranked/pool/boards/ops. Chưa migrate/deploy stack hiện có. |
| Y0–Y2 — Playable integration/release | Planned; có adapters/package và C4 content | Preview/host adapters/save envelope tồn tại; C4 content/package mới qua. Chưa actual-host SDK acceptance, persisted score retry/ack, device/Test Suite/Portal approval. |
| Soft launch | Planned | C4/W0/W1 và Y0–Y2 gate chưa hoàn tất; automated tests/build không chứng minh release. |
| C5 — Districts/landmarks | Planned | City vẫn một Downtown; chưa schema 5/district operations/Harbor/landmarks. |
| C6 — Challenges/replay/social | Planned | Có Last replay/history pin cơ bản; chưa One Drop config, speeds/seek/heatmap/ghost/Album/public publish/share/challenge. |
| C7 — Weekly/modes/LiveOps | Planned | Chưa weekly contracts, Perfect Rush/Sprint recipes, LiveOps catalogs/admin/layered audio. |
| 12 — Art requirements | Brick approved/imported; các bộ sau Planned | 48 runtime assets/target, full Brick pack 1.095.236 bytes; hashes/alpha/bbox/seams/anchors/cache qua. Compact-v3 chỉ hai mids source chưa import; district/landmark/Winter và device QA còn Planned. |
| 13 — Backlog | Deferred | Giữ gate riêng; không biến các mục backlog thành phase đã xong. |

Nền C0, Quick C2 và City C3 đã có code trong lịch sử trước bộ plan này; C1 còn playtest/benchmark thật. Việc đó không đồng nghĩa các phase nâng cấp trong `plan/` hoàn tất. Evidence lịch sử ở [00](00-project-audit.md), [PROGRESS](../PROGRESS.md) và [review checklist](../PROJECT_REVIEW_CHECKLIST.md).

## Kiểm chứng hoàn thành C4.0

- `npm.cmd run check`: 139/139 tests (14 files, 23 tests C4.0), lint, asset/boundary checks, Web production build và Playable package qua.
- `npm.cmd run test:browser`: Chrome headless Web/Playable qua toàn bộ, EN/VI ở 320×568 / 390×844 / 900×430; stats/history/pin/reload/settings/recovery, corrupted raw/unknown schema, City accept/keep-old/cancel/reload và replay không nhân stats/XP.
- `npm.cmd run test:save`: schema 3 → 4 giữ City pending v12, PB/counters; 70 runs prune còn 50 summaries, receipts và 2.590 XP giữ nguyên khi settle lại identity cũ. Payload 47.539 bytes UTF-8 / 95.078 UTF-16; SDK envelope 47.551 / 95.102, dưới 262.144.
- Evidence version hóa: [C4.0 validation](evidence/C4.0-validation.json). Full browser/screenshot ở `tmp/c0-c2-qa/`; before/after save và byte report ở `tmp/c4-qa/`, tái tạo bằng commands trên.

## Kiểm chứng audit ban đầu (trước sửa)

| Kiểm tra | Kết quả |
|---|---|
| Assets + core recursive / Playable dependency boundary | Qua; 29 approved assets, 12,52 MiB mỗi target. |
| Vitest | Qua 131/131, 13 test files; gồm 15 tests C4.0. |
| ESLint | Qua. |
| Web production build | Qua compile, TypeScript và prerender sau khi giữ output cũ trong `tmp/next-cache-before-phase-audit-20261008`. |
| Playable production package | Qua typecheck/Vite/package validator/zip sau khi giữ output cũ trong `tmp/playable-dist-before-phase-audit-20261008`; initial 1,46 MiB, total 12,63 MiB. |
| Browser smoke | Fail tại Web `trackingSmoke`, `scripts/browser-smoke.cjs:93`: actual attempts 2, expected 1. Chưa kiểm chứng toàn bộ Web hoặc Playable trong lượt này. |
| Thiết bị/host thật | Chưa chạy; không đánh dấu Verified/Released. |

Lỗi smoke ban đầu là expected attempts cũ: `captureMotion` đã abandon một lượt trước recorded run. Đã sửa assertion thành **2 attempts / 1 abandoned / 1 ended**, kiểm stats/XP không tăng qua replay và chạy lại toàn bộ hai shell. Corruption fixture mới inject lúc document boot, tránh pagehide flush của phiên trước làm mất fixture.

## Các thiếu sót C4.0 đã khép

1. Có Recover saved progress / Retry load EN/VI; chỉ bật writes và thay phiên chưa lưu sau validated load thành công. Raw hỏng và unknown schema vẫn giữ khi retry thất bại.
2. Base run XP theo versioned catalog `run-xp-1`, cấp cùng transaction/receipt với stats; repeated finish/replay/accept không thưởng lại. Legacy unknown không dựng XP giả. Missions/levels/achievements vẫn ở C4.2.
3. Shared data screens và save controller tách riêng; catalog content chứa 160 chuỗi EN/VI có typed keys.
4. Browser smoke qua cả hai production shell, kể cả reload/settings/pin/recovery và City keep-old/cancel.
5. Sáu controller tests bao phủ raw parse/validation errors, timeout/late/retry/superseded/disposed load, immutable serial writes, quota rejection và retry giữ last-good; core tests kiểm idempotent XP/overflow/City outcomes.
6. Có before/after save + UTF-8/UTF-16/envelope reports; 70-run pruning giữ pending/receipts/ownership/lifetime/XP, oversized mandatory snapshot bị từ chối.

Toàn bộ checkbox [C4.0](01-C4.0-save-stats-history.md) đã tích. Phase hoàn thành ở mức Implemented; chưa dùng headless preview thay cho actual SDK, điện thoại thật hoặc Released.
