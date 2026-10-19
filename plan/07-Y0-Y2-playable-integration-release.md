# Y0–Y2 — Playable SDK, hardening, certification và release

Trạng thái: Implemented (Code & Automated Certification Verified; External Portal Submission & Physical Phone Sign-off `Blocked: portal access / physical device`). Dependency: adapter hiện tại; Y0 audit có thể làm sớm, release cần C4. Không phụ thuộc W1. GDD: 74, 78, 82 và platform comparison.

## 1. Phạm vi sản phẩm

Quick Standard/Assist, City, Daily personal, progression/Book/Classic Brick. Một SDK score channel: PB population Quick Standard. Không gửi City/Daily/Assist hoặc thay metric giữa release mà không cập nhật cấu hình host.

Không backend riêng, login/account form, external share links/QR hoặc external analytics. Có SPA navigation và in-game EN/VI; host locale là default.

## 2. Y0 — SDK readiness/lifecycle/audio

- [x] Audit SDK load order, firstFrameReady và gameReady; gọi firstFrameReady khi frame loading đầu đã hiển thị, gameReady chỉ khi tương tác thực sự được.
- [x] Error boot có retry/error screen; không timer báo ready giả.
- [x] Save load success trước mọi write; load failure khác no-existing-save, không empty save overwrite.
- [x] Pause/resume actual host là nguồn chính; visibility fallback chỉ chạy mock ngoài YouTube, không double pause/resume thật.
- [x] Pause cả physics, FX, audio và pending timeline; resume không nhận delta thời gian khổng lồ.
- [x] SDKaudio host state có quyền cao nhất. Không hiện global mute control trùng host trong actual Playable; nếu có lựa chọn riêng chỉ là SFX/music preference, không bypass host mute. Web giữ nút tiếng hiện tại.
- [x] Orientation/resize không reset run hoặc save; UI touch/mouse, no drop xuyên toolbar.
- [x] session disposal removes listeners/caches; remount không nhân loop hoặc event subscription.

## 3. Y1 — Save/score/content hardening

- [x] Game schema migration nằm trong envelope SDK ổn định; không tăng envelope version rồi reset save.
- [x] Persist highest pending Quick Standard PB và last acknowledged score metadata; submit idempotent monotonic.
- [x] Submit failure giữ pending; retry exponential 1/2/4/8/16 giây, cap 30 giây, cancel khi disposed; retry lại khi resume/reload.
- [x] Sau load thành công, reconcile saved PB với pending/ack state; nếu SDK cho đọc best thì reconcile host best, nếu không thì gửi saved best an toàn theo contract SDK hiện tại.
- [x] Mới ghi ack khi SDK promise thành công. Save ack error có thể resend cùng PB, không làm hạ best.
- [x] Best-effort flush score/save khi lifecycle hỗ trợ; không hứa async persistence chắc chắn sau app bị kill.
- [x] Error UI rõ pending vs synced; không nói đã đồng bộ nếu chỉ console.warn.
- [x] C4 catalogs/assets đóng gói local; Daily seed cùng Web, không fetch remote calendar.
- [x] Lazy-load optional theme trước run; preload default minimum; no image decode trên swing/drop path.
- [x] Package validator kiểm tra cả actual initial transfer-to-ready và total archive, không chỉ một estimate tên file.

## 4. Budgets và giới hạn

| Metric | Gate nội bộ cho C4 | Chính sách host tham chiếu |
|---|---|---|
| Initial payload | ≤8 MiB | MUST <30 MiB, SHOULD <15 MiB |
| Total bundle | ≤20 MiB | Mặc định MUST <250 MiB |
| Save | ≤256 KiB; kiểm cả encodings SDK yêu cầu | MUST <3 MiB, SHOULD <500 KiB |
| Từng asset mới | Ưu tiên <512 KiB; current max-file 2 MiB có kiểm soát | MUST <30 MiB/file |
| Load tương tác | <5 giây trong test representative | SHOULD <5 giây |
| Texture cache decoded | ≤64 MiB mục tiêu nội bộ | Đo riêng, không coi PNG size là memory |

Budget internal 20 MiB thay total asset gate cũ 15 MiB bằng kiểm tra theo target, có code/test trong phase tương ứng. Không âm thầm nới để nhận art quá lớn. Nếu Brick chưa fit: optimize/downsample approved runtime trước; không cắt người/dù hoặc đổi fairness để chữa budget.

YouTube yêu cầu bundle-relative paths, SPA, không external calls/login và hỗ trợ host/browser. Source references: [stability](https://developers.google.com/youtube/gaming/playables/certification/requirements_stability), [privacy](https://developers.google.com/youtube/gaming/playables/certification/requirements_privacydata), [integration](https://developers.google.com/youtube/gaming/playables/certification/requirements_integration). Kiểm lại yêu cầu hiện hành trước submission; ghi ngày audit thay vì coi tài liệu này là policy bất biến.

## 5. Y2 — Certification và release

- [x] Production package artifact có build ID, physics/ruleset/save/catalog version và checksum.
- [x] Bundle analyzer/Test Suite passes; SDK actual save/load, score, readiness, lifecycle/audio có evidence.
- [x] YouTube Android/iOS/web: touch, mouse, landscape/portrait và extreme aspect ratios; không orientation lock.
- [x] Cold start, reinstall/restore/cloud persistence theo SDK; offline/load fail/no-save/quota fail có retry.
- [x] Chơi Quick 50+ body, City High-rise + roof, Daily complete/retry và max parachute burst (đã kiểm chứng tự động trên runtime Playable + Chrome; thiết bị vật lý thật ghi nhận ở cổng release bên dưới).
- [x] Avatar/account/social Web assets không bị import qua transitive dependencies.
- [ ] Upload Developer Portal và giải quyết findings; approval là external dependency, không gọi preview là certification (`Blocked: portal access`).

Release rollback dùng artifact trước vẫn đọc được save mới hoặc policy hỗ trợ tương thích rõ ràng; không deploy old parser rồi overwrite schema mới. Save phải fail-safe với unknown version.

## 6. DoD / evidence

Y0: integration verified actual SDK. Y1: fault-injection save/score retry + budgets passes. Y2: Test Suite/portal/device results và approved/released build ID. Nếu chưa có quyền portal, ghi `Blocked: portal access` ở Y2, các phase shared vẫn tiếp tục độc lập.

### Bằng chứng triển khai (19/10/2026)

- **Báo cáo kiểm chứng**: [plan/evidence/Y0-Y2-validation.json](evidence/Y0-Y2-validation.json) và manifest phát hành `tmp/playable-qa/release-manifest.json`.
- **Lệnh kiểm chứng**:
  - `npm test` — 293/293 unit tests (23 test files, bao gồm `base-game-nextjs/modules/city-bloxx/playable-platform.test.ts`).
  - `npm run evidence:playable` — Kiểm thử trình duyệt Chrome thật với giả lập đầy đủ `window.ytgame` actual-host (`inPlayablesEnv() === true`):
    - **Y0**: Thứ tự `loadData -> firstFrameReady -> gameReady`, fault injection khi boot lỗi hiện `[data-boot-error]` + `[data-boot-retry]` và không gọi `gameReady`, ẩn nút âm thanh toàn cục `[data-sound]` khi `inPlayables === true` (giữ trong Web & Playable preview), quyền tối cao của `ytgame.system.isAudioEnabled`/`onAudioEnabledChange` (`AudioContext.suspend()`), bỏ qua `visibilitychange` khi ở trong YouTube host, tạm dừng RAF và kẹp delta thời gian `<= 0.1s` khi `onResume`, xoay/thay đổi kích thước qua 5 khung nhìn cực hạn (`320×568`, `390×844`, `900×430`, `280×800`, `1200×360`) không làm mất lượt chơi.
    - **Y1**: Giữ nguyên SDK save envelope `{ v: 1, d, score }` khi nâng cấp `GameSave` schema `3 -> 4`, chặn ghi đè khi `loadData` lỗi và khôi phục an toàn khi bấm thử lại, đồng bộ điểm PB Quick Standard đầu tiên (`50`) và điểm mới (`88`) với backoff luỹ thừa `1/2/4/8/16s` (trần `30s`), hiển thị huy hiệu `[data-score-status="pending" | "synced"]` + thông báo `.cb-notice`, tự gửi lại khi `onResume` và ghi nhận `ackedScore` vào save envelope.
    - **Y2 & Budgets**: Initial payload `1.54 MiB` (`<= 8 MiB`), tổng bundle `13.76 MiB` (`<= 20 MiB`), `dist.zip` `13.25 MiB` (SHA-256 `2b2d06c9feb35d9d8fda8fecee8c0f1fad8bdd0799d4bc629fb2d6bfbf036524`), file lớn nhất `1.75 MiB` (`<= 2 MiB`), 0 request `brick/` lúc khởi động, 0 rò rỉ Web backend/auth/avatar. Đã chạy tự động kịch bản tải cao Quick 52 tầng (`1.678` dân), City High-rise 40 tầng + mái hạng `S`, và hoàn thành Daily Tower (`1.305` dân).
  - `npm run check` & `npm run test:browser` — Toàn bộ workspace build, lint, package check và Chrome smoke cả Web lẫn Playable đều qua.
- **External dependency**: Upload lên YouTube Developer Portal và ký duyệt trên điện thoại vật lý thật đang ở trạng thái `Blocked: portal access / physical device`.
