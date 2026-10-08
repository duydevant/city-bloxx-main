# Y0–Y2 — Playable SDK, hardening, certification và release

Trạng thái: Planned. Dependency: adapter hiện tại; Y0 audit có thể làm sớm, release cần C4. Không phụ thuộc W1. GDD: 74, 78, 82 và platform comparison.

## 1. Phạm vi sản phẩm

Quick Standard/Assist, City, Daily personal, progression/Book/Classic Brick. Một SDK score channel: PB population Quick Standard. Không gửi City/Daily/Assist hoặc thay metric giữa release mà không cập nhật cấu hình host.

Không backend riêng, login/account form, external share links/QR hoặc external analytics. Có SPA navigation và in-game EN/VI; host locale là default.

## 2. Y0 — SDK readiness/lifecycle/audio

- [ ] Audit SDK load order, firstFrameReady và gameReady; gọi firstFrameReady khi frame loading đầu đã hiển thị, gameReady chỉ khi tương tác thực sự được.
- [ ] Error boot có retry/error screen; không timer báo ready giả.
- [ ] Save load success trước mọi write; load failure khác no-existing-save, không empty save overwrite.
- [ ] Pause/resume actual host là nguồn chính; visibility fallback chỉ chạy mock ngoài YouTube, không double pause/resume thật.
- [ ] Pause cả physics, FX, audio và pending timeline; resume không nhận delta thời gian khổng lồ.
- [ ] SDKaudio host state có quyền cao nhất. Không hiện global mute control trùng host trong actual Playable; nếu có lựa chọn riêng chỉ là SFX/music preference, không bypass host mute. Web giữ nút tiếng hiện tại.
- [ ] Orientation/resize không reset run hoặc save; UI touch/mouse, no drop xuyên toolbar.
- [ ] session disposal removes listeners/caches; remount không nhân loop hoặc event subscription.

## 3. Y1 — Save/score/content hardening

- [ ] Game schema migration nằm trong envelope SDK ổn định; không tăng envelope version rồi reset save.
- [ ] Persist highest pending Quick Standard PB và last acknowledged score metadata; submit idempotent monotonic.
- [ ] Submit failure giữ pending; retry exponential 1/2/4/8/16 giây, cap 30 giây, cancel khi disposed; retry lại khi resume/reload.
- [ ] Sau load thành công, reconcile saved PB với pending/ack state; nếu SDK cho đọc best thì reconcile host best, nếu không thì gửi saved best an toàn theo contract SDK hiện tại.
- [ ] Mới ghi ack khi SDK promise thành công. Save ack error có thể resend cùng PB, không làm hạ best.
- [ ] Best-effort flush score/save khi lifecycle hỗ trợ; không hứa async persistence chắc chắn sau app bị kill.
- [ ] Error UI rõ pending vs synced; không nói đã đồng bộ nếu chỉ console.warn.
- [ ] C4 catalogs/assets đóng gói local; Daily seed cùng Web, không fetch remote calendar.
- [ ] Lazy-load optional theme trước run; preload default minimum; no image decode trên swing/drop path.
- [ ] Package validator kiểm tra cả actual initial transfer-to-ready và total archive, không chỉ một estimate tên file.

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

- [ ] Production package artifact có build ID, physics/ruleset/save/catalog version và checksum.
- [ ] Bundle analyzer/Test Suite passes; SDK actual save/load, score, readiness, lifecycle/audio có evidence.
- [ ] YouTube Android/iOS/web: touch, mouse, landscape/portrait và extreme aspect ratios; không orientation lock.
- [ ] Cold start, reinstall/restore/cloud persistence theo SDK; offline/load fail/no-save/quota fail có retry.
- [ ] Chơi Quick 50+ body, City High-rise + roof, Daily complete/retry và max parachute burst trên điện thoại thật.
- [ ] Avatar/account/social Web assets không bị import qua transitive dependencies.
- [ ] Upload Developer Portal và giải quyết findings; approval là external dependency, không gọi preview là certification.

Release rollback dùng artifact trước vẫn đọc được save mới hoặc policy hỗ trợ tương thích rõ ràng; không deploy old parser rồi overwrite schema mới. Save phải fail-safe với unknown version.

## 6. DoD / evidence

Y0: integration verified actual SDK. Y1: fault-injection save/score retry + budgets passes. Y2: Test Suite/portal/device results và approved/released build ID. Nếu chưa có quyền portal, ghi `Blocked: portal access` ở Y2, các phase shared vẫn tiếp tục độc lập.
