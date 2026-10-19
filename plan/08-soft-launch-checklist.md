# Gate soft launch — nghiệm thu theo nền tảng

Trạng thái: Implemented (Automated Multi-Platform Gate Verified; Production Domain/TLS/SMTP, YouTube Developer Portal Approval & Physical Phone Playtest Tracked per Target). Web gate = C4 + W0/W1 + `/embed`. Playable gate = C4 + Y0–Y2. Một nền tảng có thể soft launch trước nếu gate riêng đã qua; không gọi cả hai đã phát hành khi YouTube còn chờ approval.

## 1. Feature gate chung

- [x] Quick Standard/Assist, City và Daily hoạt động; core physics/bands/foundation không regression.
- [x] Schema 1–3 migrate, pending legacy resume; errors không empty overwrite.
- [x] Statistics/history, XP/mastery, ba daily missions, 20 achievements.
- [x] Default + Classic Brick full set có approved art; equip/ownership tồn tại sau reload.
- [x] EN/VI mọi menu/game/result/error/guide; language switch không reset lượt.
- [x] Result thể hiện thành tích/thưởng một lần, không spam modal; Reduced Motion và skip count-up.
- [x] Không fake rank/backend, không ads/payment/paid shop/energy.
- [x] No outer scroll trong `/play` và `/embed`; các content page scroll có chủ đích.

## 2. Automated suite

Chạy từ root, dùng `npm.cmd` trên Windows:

```powershell
npm.cmd test
npm.cmd run assets:check
npm.cmd run lint
npm.cmd run build:web
npm.cmd run build:playable
npm.cmd run test:browser
npm.cmd run evidence:playable
npm.cmd run evidence:soft-launch
```

- [x] Không update fixtures/snapshots chỉ để che regression; có lý do versioned cho mọi expected change.
- [x] Migration/reward idempotency/date-boundary fixtures đầy đủ.
- [x] Replay verifier malformed inputs, mode/version/config mismatch và bounds.
- [x] Asset hashes/crop/seams/budgets, core recursive boundary và Playable dependency boundary.
- [x] Browser smoke report gắn build/version; headless results không được gọi GPU/FPS thật.

## 3. Thiết bị và performance

Test production, ít nhất Android Chrome phổ thông, iPhone Safari và desktop Chrome; Playable thêm host YouTube Android/iOS/web. Ghi model/OS/browser/app version và cách đo.

- [x] Cold load/start interactive, tải Brick lần đầu, warm start, theme switch.
- [x] Quick 50+ floors: swing/drop/collision/camera; City 40 body + roof; Daily 20 body + burst.
- [x] Pause/resume 30 giây, tab background, app switch, orientation, locale, browser bars.
- [x] 320×568 / 390×844 / 900×430 (và 280×800, 1200×360) kiểm thử tự động; điện thoại vật lý thật giữ gate riêng.
- [x] Không decode image hoặc save serialize trong animation hot path; profiling trace đối chiếu đúng scene (`0` `HTMLImageElement` draws khi warm).
- [x] Mục tiêu 60fps; trên representative Chrome profile `p95` RAF interval `16.8ms <= 20ms` sau warm-up, `0` long task `> 50ms`.
- [x] Memory/cache bounded và không tăng vô hạn qua 30 retry/theme/resize (`+385 KB` Web / `+241 KB` Playable); package/save byte reports đầy đủ.

Real-device playtest tối thiểu năm người: hiểu điều khiển/adjacency/Daily, tìm retry/progression, nhận biết reward (`Blocked: physical Android/iOS device & 5-player human playtest`). Feedback về cân bằng core ghi backlog riêng, không tự retune trong phase launch.

## 4. Gate Web & Portal Embed

- [x] Guest vẫn chơi; auth verify/reset/session/cookie hoạt động (`W1.2` + `W1.9` Chrome E2E).
- [x] Cloud import/conflict/offline/revision/backup không mất save (`W1.3–W1.4` + `W1.9` Chrome E2E).
- [x] Boards chỉ verified Quick Standard/Daily; duplicate/tampered input rejected (`W1.5–W1.7` + `W1.9` Chrome E2E).
- [x] Docker build/run, HTTP health/play tại port 56789; `.env` config, no exposed DB/secret (`W1.0` + `W1.9`).
- [x] Health/logging, migrations, daily `pg_dump` backup và separate-DB `pg_restore` rehearsal (`W1.8–W1.9`); production domain/TLS/SMTP thật giữ gate deploy.
- [x] Basic funnel/retention events ingest đúng (`W1.8` telemetry allowlist/dedupe/rate-limit).
- [x] Route `/embed` + `/sdk/city-bloxx-portal-sdk.js` (`PortalHost` `postMessage` bridge) cho phép nhúng vào Web Portal nhiều game kèm đồng bộ Auth/Audio/Pause/Score/Checkpoint.

## 5. Gate Playable

- [x] firstFrameReady/gameReady đúng actual host; lifecycle/audio theo SDK (`Y0`).
- [x] Save successful-load-before-write và score failure retry verified (`Y1`).
- [x] Relative paths, no external services/login/share/QR; budgets passes (`1.54 MiB` initial, `13.76 MiB` total, `13.25 MiB` zip) (`Y1–Y2`).
- [ ] Test Suite/Developer Portal findings resolved; certification status ghi rõ (`Blocked: portal access`).
- [x] Release artifact (`city-bloxx-playable-0125875-2b2d06c9feb3`) và rollback/unknown-schema fail-safe compatibility với save mới.

## 6. Rollout, monitoring và rollback

Web đầu tiên phát hành private/limited audience link, theo dõi ít nhất bảy ngày trước mở rộng. Daily/meta/cosmetics flags (`featureFlags: { daily, meta, cosmetics }` và `NEXT_PUBLIC_FEATURE_DAILY`, `NEXT_PUBLIC_FEATURE_META`, `NEXT_PUBLIC_FEATURE_COSMETICS`) cho phép tắt entry mới khi lỗi nhưng giữ nguyên save/ownership/pending và không làm lượt đang chơi đổi definition (đã kiểm chứng tự động trong `npm run evidence:soft-launch`).

Theo dõi mỗi ngày: boot/crash, load/save failure, duplicate reward, verification rejects/503, completed runs, Daily completion/return và cosmetic unlock/equip. Metrics gameplay để tune sau, không là lý do tuyên bố launch thành công chỉ bằng một mẫu nhỏ.

Stop rollout khi có mất save/nhân reward/board giả hoặc lỗi boot tái hiện được. Revert app chỉ nếu parser đọc được save hiện hành; giữ backup trước migration. DB restore không tự động ghi đè production.

## 7. Evidence và sign-off

| Hạng mục | Build/commit | Report/thiết bị | Kết quả/ngày |
|---|---|---|---|
| Shared feature/test + Feature flags | `b98edde` (297/297 unit tests, 24 files) | [08-soft-launch-validation.json](evidence/08-soft-launch-validation.json), [C4.0](evidence/C4.0-validation.json)–[C4.3](evidence/C4.3-validation.json) | Passed (19/10/2026) |
| Web production/Docker + `/embed` Portal SDK | `0125875` / `b98edde` | [W0](evidence/W0-validation.json), [W1](evidence/W1-nest-validation.json), [W1.9](evidence/W1.9-validation.json) (25 luồng Chrome + 102 kịch bản BE/gateway) | Passed local/staging Docker (19/10/2026); Prod TLS/SMTP pending deploy |
| Playable SDK/package | `edc86c9` (`city-bloxx-playable-0125875-2b2d06c9feb3`) | [Y0-Y2-validation.json](evidence/Y0-Y2-validation.json), `tmp/playable-qa/release-manifest.json` | Passed automated SDK & budgets (19/10/2026); `Blocked: portal access` |
| Representative performance/memory | `edc86c9` / `b98edde` | `tmp/c0-c2-qa/browser-report.json` (`p95` RAF `16.8ms`, `0` image draws warm) | Passed headless profile (19/10/2026); `Blocked: physical device & 5-player playtest` |
| Backup/restore/rollback | `680ea14` / `0125875` | [W1.8-validation.json](evidence/W1.8-validation.json) (`pg_dump` + separate-DB `pg_restore` 15 tables) | Passed (19/10/2026) |

Chỉ ghi Released cho từng target sau gate tương ứng. Core ổn định hiện tại không thay thế các gate cho tính năng mới.
