# City Bloxx — trạng thái hiện tại

Cập nhật 19/10/2026. Tài liệu này bổ sung các thay đổi mới hơn checklist C0–C2.

Checklist để rà soát đã xong/còn thiếu/thứ tự làm tiếp: [PROJECT_REVIEW_CHECKLIST](PROJECT_REVIEW_CHECKLIST.md).

## C5 — hoàn thành triển khai Harbor, mục tiêu district, landmark và city evolution (19/10/2026)

Tiếp tục từ Soft Launch `7df93dd` theo [09](plan/09-C5-districts-landmarks.md) và [12](plan/12-art-requirements.md):
- **District Catalog & Save Schema 5**: Thêm `DISTRICT_CATALOG` (`districts-1`: `downtown` và `harbor`, mỗi quận 25 ô `5×5` riêng), `DOCK_CLOCK_TOWER_LANDMARK` (`landmarks-1`) và 6 cấp `CITY_EVOLUTION_STAGES` (`Village` → `Megacity`). Nâng cấp `GameSave` lên `schema: 5` (`1..4 -> 5`), đồng bộ `city.lots`/`districts.downtown`, gán `districtId: "downtown"` cho `pending` legacy, tách biệt hoàn toàn điều kiện kề 4 hướng trong từng quận nhưng dùng chung class đã mở khoá toàn cục, và lưu biên nhận một chiều (`district-complete`, `district-unlock`, `landmark-claim`) để phá nhà không khoá lại quận hay làm mất cấp đô thị cao nhất (`highestStage`).
- **Harbor Art & Runtime Import**: Sinh và chuẩn hoá `bg/harbor/bg_harbor_default_map.png` (`1536×1024`), `bg/harbor/bg_harbor_default_thumb.png` (`512×512`) và `city/harbor/landmark_dock_clock_tower_mini.png` (`256×384` RGBA, neo chân tại `(128,320)`), đồng bộ sang cả hai `public/game` và `packages/city-bloxx-content/assets.manifest.json` (`51 approved assets, 14.13 MiB`).
- **UI & Kiểm chứng đa nền tảng**: Thêm màn hình chọn Quận / Biểu tượng & Tiến hoá đô thị (`1/3..3/3`), modal chúc mừng mở khoá Harbor, preload nền Harbor với fallback màu trung tính, và ô quảng trường riêng `[data-landmark-slot="dock_clock_tower"]` ngoài lưới 25 ô. Qua **304/304 unit tests (25 files)**, `npm run check`, `npm run test:save` và `npm run evidence:c5` trên Chrome headless cả Web lẫn Playable ở `320×568`, `390×844`, `900×430` ([Evidence C5](plan/evidence/C5-validation.json)).

## 08 — hoàn thành nghiệm thu Soft Launch & `/embed` Portal SDK (19/10/2026)

Tiếp tục từ Y0–Y2 `edc86c9` và `/embed` `b98edde` theo [08](plan/08-soft-launch-checklist.md):
- **Route nhúng `/embed` & `PortalHost` SDK**: Thêm route độc lập `/embed` không có Header/Footer của web riêng, hỗ trợ `Content-Security-Policy: frame-ancestors` và cầu nối hai chiều `postMessage` (`city-bloxx:portal` v1) cùng SDK client (`lib/portal/client.ts` và `/sdk/city-bloxx-portal-sdk.js`) để nhúng vào bất kỳ Web Portal nhiều game nào kèm đồng bộ Auth (`adoptPortalSession`/`adoptPortalGuest`), Audio (`mute`/`unmute`), Lifecycle (`pause`/`resume`), Ngôn ngữ (`en`/`vi`), Điểm số (`score`) và `checkpoint()`.
- **Feature Flags & Rollback an toàn**: Hỗ trợ `featureFlags: { daily, meta, cosmetics }` (`NEXT_PUBLIC_FEATURE_DAILY`, `NEXT_PUBLIC_FEATURE_META`, `NEXT_PUBLIC_FEATURE_COSMETICS`) và `session.setFeatureFlags(...)` cho phép tắt mở mới Daily/Progression/Architecture Book khi bảo trì mà vẫn giữ nguyên `save.progression`, `save.inventory`, lượt Daily đang dở (`save.daily.pending`) và không đổi definition của lượt đang chơi.
- **Nghiệm thu tổng hợp Soft Launch**: Qua **297/297 unit tests (24 files)**, `npm run lint`, `npm run build`, `npm run evidence:playable` và `npm run evidence:soft-launch` ([Evidence 08](plan/evidence/08-soft-launch-validation.json)).

## Y0–Y2 — hoàn thành triển khai Playable SDK, hardening, certification và release (19/10/2026)

Tiếp tục từ W1.9 `0125875` theo [07](plan/07-Y0-Y2-playable-integration-release.md):
- **Y0 — SDK readiness, lifecycle & audio**: Đảm bảo `firstFrameReady()` gọi ngay sau khi sơn frame `#loading` đầu tiên và `gameReady()` chỉ gọi sau khi `game.create(host)` hoàn tất, ẩn `#loading` và sơn xong frame tương tác. Nếu khởi động lỗi, hiển thị `[data-boot-error]` + `[data-boot-retry]` EN/VI mà không gọi `gameReady()`. Khoá mọi thao tác ghi save trước khi `loadSave()` thành công để không ghi đè dữ liệu hỏng/schema lạ. Trong actual Playable (`inPlayablesEnv() === true`), `ytgame.system` giữ quyền tối cao về pause/resume (tắt `visibilitychange` fallback, tạm dừng physics/FX/audio/timelines, kẹp frame delta `<= 0.1s` khi `onResume`) và audio (`AudioContext.suspend()`, ẩn nút âm thanh toàn cục `[data-sound]` trong actual Playable nhưng giữ trên Web và Playable preview). `session.dispose()` giải phóng cả cache sprite/image/population của `QuickTowerRenderer`, `AudioContext` và bộ hẹn giờ retry điểm.
- **Y1 — Save, score & content hardening**: Giữ nguyên SDK save envelope `{ v: 1, d, score }` (`v: 1`) khi migrate `GameSave` (`1..3 -> 4`), kiểm tra đệ quy lone surrogates UTF-16 và ngân sách nội bộ `<= 256 KiB`. Lưu bền vững `pendingScore`, `ackedScore`, `ackedAt`; đối soát PB Quick Standard đã lưu sau khi load thành công; gửi điểm monotonic idempotent chỉ khi `sdk().engagement.sendScore` thành công, retry theo backoff luỹ thừa `1/2/4/8/16s` (trần `30s`) + tự gửi lại khi `onResume`/reload, và hiển thị rõ trạng thái `[data-score-status="pending" | "synced"]` + `.cb-notice` trên UI.
- **Y2 — Package budgets, manifest & automated certification**: `check-package.mjs` và `zip-dist.mjs` kiểm tra chặt ngân sách (`initial 1.54 MiB <= 8 MiB`, `total 13.76 MiB <= 20 MiB`, `dist.zip 13.25 MiB`, `max file 1.75 MiB <= 2 MiB`, 0 request `brick/` lúc khởi động, 0 rò rỉ Web backend/auth/avatar) và sinh `tmp/playable-qa/release-manifest.json` kèm `buildId`, bộ phiên bản physics/ruleset/save/catalog và SHA-256 checksum. Qua **293/293 unit tests** (`playable-platform.test.ts`), `npm run evidence:playable` trên Chrome thật (5 khung nhìn cực hạn `320×568`..`1200×360`, Quick 52 tầng `1.678` dân, High-rise 40 tầng + mái hạng `S`, Daily complete `1.305` dân), `npm run check` và `npm run test:browser`. [Evidence Y0–Y2](plan/evidence/Y0-Y2-validation.json). Upload YouTube Developer Portal và ký duyệt trên điện thoại thật ghi `Blocked: portal access / physical device`.

## W1 — hoàn thành triển khai W1.0–W1.9 (19/10/2026); Verified local/staging Docker

Tiếp tục từ W0 `8dff07f` trên source `backend/` hiện có theo [06c](plan/06c-W1-city-bloxx-existing-backend-plan.md):
- **W1.0–W1.1**: Gateway Nginx same-origin (`/api/v1` + Web `/play`), bounded JSON parsers (16KiB/32KiB/256KiB/272KiB), `/api/v1/health/ready` (DB + Redis + worker pool), đóng gói shared core CJS/declarations/worker, 8 bảng `city_bloxx_*` và 9 permissions `city_bloxx_*` (fresh/down-up/upgrade bảo toàn lịch sử auth và quyền đã revoke).
- **W1.2–W1.4**: Web auth thật (đăng ký/đăng nhập/verify/reset/profile/password/logout EN/VI, JWT memory + HttpOnly refresh cookie, Web Locks + BroadcastChannel giữa nhiều tab), game profile + revisioned cloud save/resolve CAS + biên nhận idempotent + worker save validation, và Web cloud sync/IndexedDB/conflict/Guest import không trộn tài khoản.
- **W1.5–W1.7**: Server-authoritative Daily UTC + run tickets 256-bit/24h (encrypted start receipt/key rotation), persistent submission queue/leases, pure resimulation trong worker pool (2 workers/20 queue/5s timeout), atomic settlement/best leaderboard entry, public/private keyset leaderboards và Web ranked Quick/Daily + `/leaderboards` EN/VI.
- **W1.8–W1.9**: Admin moderation (`/api/v1/admin/city-bloxx/runs*`, RBAC `city_bloxx_moderation:read/update`, không sửa điểm tùy ý, quarantine ẩn khỏi board + khôi phục best kế tiếp + giữ inputs 90 ngày, release bắt buộc resimulate), public catalog + authenticated/guest analytics allowlist/dedupe/PII rejection/rate limit 30/phút + server `verification_reject`, CLI `maintain` có distributed lock xóa inputs quá hạn (30d/90d) giữ nguyên receipts/boards, và `backup-restore.cjs` (`pg_dump` + prune 14 ngày + `pg_restore` sang DB riêng kiểm đủ 15 bảng, SHA-256 cloud save và boot app).
- **Nghiệm thu hợp nhất W1.9**: `npm run evidence:w1:full` (6 luồng Chrome auth + 9 luồng Chrome cloud + 10 luồng Chrome ranked EN/VI 320/390/900 + 102 kịch bản tích hợp BE/gateway + 49 BE unit + 3 e2e + restore rehearsal), `npm run check` (287 Web/core tests, lint, production Web/Playable builds/zip) và `npm run test:browser` (full Chrome smoke cả hai shell). Toàn bộ containers/volumes đang chạy được bảo toàn. [Evidence W1 tổng hợp](plan/evidence/W1-nest-validation.json), [W1.9](plan/evidence/W1.9-validation.json). Production domain/TLS/SMTP thật và rollout giữ gate riêng.

## W0 — hoàn thành triển khai 12/10/2026; dừng trước Backend

Tiếp tục từ C4.3 `5b63174`: Home Quick/City/Daily CTA/local preview, `/daily`, `/statistics`, `/my-towers`, `/buildings`, `/guide/daily` và các guide/profile hiện có đã hoàn thiện. Shared controller đọc dữ liệu local, content scroll bình thường và `/play` giữ viewport lock. Session có initialScreen/navigation callback/account capability; deep links mở menu/detail, không auto scored run; confirm chuyển màn hình giữ pending City/Daily, Back/Forward không remount. Guest hiển thị thật, auth unavailable không có form gửi tới endpoint chưa tồn tại.

Tutorial flags độc lập cho Quick/City/Daily, legacy save không bắt học lại; dismiss/completion persist. EN/VI, tab/filter memory, 44px content/mobile toolbar, safe-area/dynamic viewport CSS, skip link/modal focus và reward aria-live tĩnh đã có. Public intro/catalog prerender, personal save client-only; canonical/sitemap public và noindex/robots auth/private qua.

231/231 tests (18 files), lint/assets/boundaries, Web/Playable production builds, save/Daily evidence và full Chrome smoke hai shell qua. QA W0 tám content routes EN/VI ở 320×568, 390×844, 900×430; direct URL/refresh/Back/Forward, old save 50 summaries, unsupported replay, pending City/Daily và live Quick cancel qua. Save envelope UTF-16 112.146 bytes dưới 256 KiB. [Plan W0](plan/05-W0-web-pages-responsive.md), [evidence](plan/evidence/W0-validation.json). Commit: `feat(w0): complete Web routes navigation and guest experience`. **W1 Backend chưa bắt đầu, dừng theo yêu cầu người dùng**. Actual phone/host/release gates giữ riêng.

## C4.3 — hoàn thành triển khai 12/10/2026

Tiếp tục từ C4.2 `0b72f10`: versioned catalog 19 items, full Classic Brick 18 PNG + SVG badge, lifetime unlock theo class/Daily/collection, một inventory GameSave và migration legacy City, equip building/roof theo class + crane chung đã xong. Unknown ownership được giữ và render fallback Default. Lượt mới pin trang bị; đổi equipment không thay pending run/skyline, rebuild mới thay snapshot. Architecture Book bốn class/collection và customizer ba bước có EN/VI, locked preview, loading/failure/retry, save retry, keyboard/focus/ARIA và mobile paging.

228/228 tests (13 cosmetics), lint/assets/boundaries, hai production builds, save/Daily/cosmetics evidence và Chrome production smoke đầy đủ hai shell qua. Default/Brick/mixed cùng seed/input giữ golden replay/results; pause/equip/reload/resume giữ Brick của City pending. Pack 1.095.236 bytes; 28 cached sprites dùng 1.785.012 bytes raster canvas, warm render không draw HTMLImageElement. Capacity 50 summaries/10 grants/legacy pending v12 có SDK envelope UTF-16 114.022 bytes dưới 256 KiB. Art gốc/prompt tại [provenance](art/source/brick-prompts.md), approved/import report tại [QA](art/qa/brick-import.json). Chi tiết: [C4.3](plan/04-C4.3-cosmetics-architecture-book.md), [evidence](plan/evidence/C4.3-validation.json). Commit: `feat(c4.3): complete Classic Brick cosmetics and Architecture Book`. Phase tiếp theo **W0 — Web pages/responsive**; actual phone/host/server/release giữ gate riêng.

## C4.2 — hoàn thành triển khai 12/10/2026

Tiếp tục từ C4.1 `ab4d02d`: builder level 1–50, class mastery 1–20 theo XP curve, Daily first-complete bonus, 15 mission definitions với ba slot/ngày UTC, một reroll trước tiến độ, claim bảy ngày, và 20 achievements đã xong. Receipts tách finish/accept/claim; checkpoint, reload và crash không nhân XP. Migration giữ XP/ownership và không trả lại history. Menu/result EN/VI phân trang, mastery selector, grouped levels/unlocks, count-up skip/Reduced Motion/pause và pending/error/retry save có trên Web lẫn Playable.

215/215 tests (44 progression), lint/assets/boundaries, hai production builds, save/Daily/progression evidence và Chrome smoke đầy đủ hai shell qua. Daily golden giữ 1.305 population/20 floors; 533 builder XP gồm 183 base + 50 Daily + 300 achievements, Industrial mastery chỉ 183; claim ba missions tăng builder lên 653 rồi reload/retry không cộng lại. Capacity fixture với 50 summaries, 21 claims, 20 ownership và City pending v12 dưới 256 KiB. Chi tiết: [C4.2](plan/03-C4.2-progression-missions-achievements.md), [evidence](plan/evidence/C4.2-validation.json). Commit: `feat(c4.2): complete progression missions and achievements`. Phase tiếp theo **C4.3 — Cosmetics/Architecture Book**; host/thiết bị/server/release theo gate riêng.

## C4.1 — hoàn thành triển khai 09/10/2026

Tiếp tục sau C4.0 commit `11c3901`: Daily Tower Industrial 20 body + một roof, recipe `daily-v1`, hash UTC date, ruleset `daily-tower-1`, pending checkpoint riêng, resume/result/replay, complete personal best, failed height, attempts và streak đã xong. Giữ longest/lifetime khi prune bảy ngày; chặn credit ngày cũ khi clock rollback. Daily không đổi Quick PB hoặc unlock City. Shared entry/history/guide/result EN/VI; retry replay cũ xác nhận trước khi thay pending khác.

171/171 tests (32 Daily), lint/assets/boundaries, Web/Playable production builds, save/Daily evidence và Chrome smoke hai shell qua ở 320×568, 390×844, 900×430. Reload foundation falling/scored body/result, UTC midnight, host pause/resume và replay không nhân attempts/streak/XP; Daily không gửi Standard score. Golden complete 1.305 population / 20 body, roof Miss vẫn complete; failed height lưu riêng. Mẫu Daily save 19.792 bytes, một settlement 183 XP. Chi tiết: [C4.1](plan/02-C4.1-daily-tower.md), [evidence](plan/evidence/C4.1-validation.json). Commit: `feat(c4.1): complete Daily Tower and UTC streaks`. Phase tiếp theo **C4.2**; SDK/thiết bị thật/server ranking vẫn thuộc gate đã lập kế hoạch.

## C4.0 — hoàn thành triển khai 08/10/2026

Save schema 4, stable run identity/sequence receipts, lifetime stats/history/replay pin, settings, base run XP settlement, recovery load và serial immutable save writes đã xong. Shared EN/VI catalog/menu dùng cho Web và Playable. 139/139 unit tests, lint/assets/boundaries, hai production builds, save evidence và Chrome smoke cả hai shell đều qua. Save mẫu 70 runs còn 50 summaries, giữ pending City v12/receipts/2.590 XP; envelope UTF-16 95.102 bytes dưới budget 256 KiB. Phase ở mức Implemented; Daily/missions/levels/cosmetics, server verification và actual-host/device/release gates vẫn riêng. Chi tiết: [C4.0](plan/01-C4.0-save-stats-history.md), [evidence](plan/evidence/C4.0-validation.json).

## Tuning mới — dây thu theo tầng, độ khó tới 50 tầng và icon UI

Lượt mới dùng physics/Quick `0.13.0`, City `build-city-7`. Chu kỳ một vòng ngắn thêm 10% so với 0.12 ở mọi tầng, cả Standard và Assist (còn 81% chu kỳ của 0.11). Dây giữ kích thước 0.12: dài nhất 206,82, rút dần theo số tầng đã đặt. Móc rỗng thu về mắt dây cách puly 18 world units sau 18 ticks (~0,3 giây). Cung ngang bằng 80% chiều dài dây để không vượt bán kính. Pha dao động tích phân liên tục, không nhảy khi tăng tầng.

| Tầng đã xây | Dây có tải (world units) | Một vòng dao động Standard | Gió nền thân tháp |
|---|---:|---:|---:|
| 0–2 | 206,8 | 3,60 giây | 0 |
| 10 | 196,5 | 3,41 giây | 1 |
| 20 | 186,1 | 3,09 giây | 2,5 |
| 30 | 173,7 | 2,76 giây | 4 |
| 40 | 161,3 | 2,49 giây | 5,5 |
| 50 | 148,9 | 2,27 giây | 7 |
| ≥60 | 140,6 | 2,12 giây | 8 |

- Nội suy giữa các mốc, cap ở 60 tầng. Tầng 10 chỉ nhanh hơn đầu lượt ~5,6%; giữ đường tăng độ khó, nhân chu kỳ 0.12 với 0,9. Assist giảm tốc và mức tăng thêm, cùng hình học dây và band chấm chất lượng.
- Miss ≥40% chỉ chấm một lần tại mặt phẳng tầng cao nhất. Nếu có phần chồng ngang (<100%), nhà va vào tầng đó, nảy nhẹ rồi trượt khỏi mép. Nếu không chồng ngang (≥100%), nhà tiếp tục rơi theo trục dọc và xét tầng dưới thực sự nằm trên đường rơi. Kiểm tra swept facade 144×120 gồm mặt trên/cạnh/dưới và chuyển động sway, tránh xuyên tầng khi rơi nhanh; góc xoay là hiệu ứng hình ảnh. Va nhiều lần không mất thêm mạng, không thêm tầng hay dân số. Va chạm có vòng lóe/bụi 0,4 giây, tối đa 8 hạt; Reduced Motion chỉ vòng lóe tĩnh. Nhà Miss rơi hết phần nhìn thấy hoặc đáp đất trước khi tải nhà mới; Miss mái cũng có hoạt ảnh rồi mới kết thúc.
- Các công trình City đang dở từ 0.7–0.12 giữ chuyển động/luật Miss cũ đến hết lượt để phục hồi đúng input. Fixture City 0.10/0.11/0.12 được kiểm tra khôi phục đúng vị trí/tầng/camera/dân số, kể cả lưu lại rồi mở tiếp. Lượt 0.13 đang va chạm cũng khôi phục đúng hoạt ảnh và diễn biến tiếp theo. Quick replay physics cũ không được phát dưới luật mới; PB, dân số và nhà đã nhận được giữ.
- HUD đổi ba dấu chấm thành ba tim vector: đỏ hồng còn mạng, viền xám rỗng khi mất; có nhãn EN/VI và không đổi độ rộng khi mất mạng. Web có favicon vector ba khối xếp tháp tại `app/icon.svg`.
- [UI Art Prompts v4](City_Bloxx_UI_Art_Prompts_v4.0.md) có ba prompt riêng, bbox cụ thể, kích thước export và tên/đường dẫn: favicon master 1024², hai tim 512² → runtime 64². Nguồn lưu trong `art/source/brand/default/` và `art/source/ui/default/`. PNG gen chưa được import; SVG hiện tại dùng được ngay.
- 116 unit tests qua, gồm tỷ lệ chu kỳ 90% so với 0.12 ở cả Standard/Assist, đường va chạm Miss trên/dưới/cạnh/đúng 100% và sway, mất một mạng, pause và restore khi đang va, Quick 50 tầng còn ba mạng, bốn tier City, migration City 0.10/0.11/0.12. Lint, build/package và Chrome smoke hai nền tảng qua, gồm 8 hạt va chạm/Reduced Motion, ảnh va mép và rơi, replay, save/resume, responsive EN/VI và population FX. Ảnh `tmp/c0-c2-qa/*-miss-1-impact.png`, `*-miss-2-sliding.png`. Cân bằng 40–50 tầng vẫn cần chơi thử với người thật; bot chỉ xác nhận có thể xây đúng luật.

## Polish mới — toolbar, responsive, render và Docker Web

- Nhãn Replay không phải nút: đổi “Xem lại” thành “Phát lại” để rõ đây là input ghi sẵn, không phải lượt chơi trực tiếp. Bản đồ dùng nhãn “Trung tâm”, không lặp lại tên chế độ. Reduced Motion giảm hiệu ứng phụ/rotation, không thay luật hay điểm; có tooltip giải thích.
- Web không render nút EN/VI trong game, dùng header để đổi ngôn ngữ; Playable không có header nên vẫn giữ. Mobile luôn có dòng tên + chế độ, dòng dưới chứa toàn bộ nút toolbar không wrap. Nút giảm chuyển động được dành nhiều chiều ngang hơn.
- Kết quả Quick/City dùng 6 thẻ label/value, 2 cột trên portrait; trạng thái mái/nhà cũ là đoạn riêng. Landscape thấp dùng hai vùng tóm tắt/thống kê. Hướng dẫn Web và trong game dùng heading + bullet, 6 phần ngắn; các quality band tách từng dòng.
- Combo chuyển thành overlay trên arena: hiện/ẩn không đổi kích thước canvas. Hint giữ chiều cao tối thiểu 2 dòng. Mỗi frame tái sử dụng một snapshot cho paint/previous; schedule đọc phase trực tiếp. Checkpoint City chỉ thay pending, không serialize toàn bộ lots ngay lúc bấm thả.
- Ảnh tầng/crane/hook được crop và rasterize vào cache theo viewport/DPR một lần sau load/resize; animation dùng canvas nhỏ thay PNG lớn. Decode ảnh xong trước khi dùng. Quick/Replay chờ ảnh người/dù ở màn chuẩn bị trước khi chạy, không giải mã bộ ảnh mới giữa swing. Không sửa PNG nguồn, physics, band hay save version.
- Docker Web có `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.env`/`.env.example` ở root. Port, bind, image, restart, healthcheck và public config đều lấy từ `.env`; mặc định Web `http://localhost:56789/play` (cập nhật 08/10). Builder bật Next standalone và tracing root monorepo; chạy local vẫn dùng `next start` bình thường. Xem [DOCKER_WEB](DOCKER_WEB.md) để deploy máy chủ trực tiếp qua IP hoặc qua reverse proxy/domain.
- Reduced Motion vẫn nội suy vị trí swing/fall (chỉ bỏ rotation/hiệu ứng phụ), tránh chuyển động theo nấc và giữ fraction thả đúng vị trí đang thấy.
- 104/104 unit tests, lint và build/package hai nền tảng đã qua. Browser smoke kiểm tra toolbar, stats Quick/City EN/VI, 6 trang guide EN/VI ở 320×568, 390×844, 900×430, header switch không reset run, combo không resize arena. Screenshot/report trong `tmp/c0-c2-qa/`.
- Profile RAF thật riêng (không fake clock), Chrome headless DPR 2: CPU phần lớn dưới 1 ms, khoảng cách RAF ~16,7 ms; vẫn có spike ~20 ms. Không vẽ PNG lớn trên đường animation đã warm; không thấy long task ≥50 ms ở mẫu 4,5 giây. Đây không phải GPU/display FPS hay kết luận đã hết khựng trên máy người dùng; cần kiểm tra lại bản production trên thiết bị thực.
- `docker compose config --quiet` đã qua. Chưa build/run container: môi trường chặn Docker config/context và pipe engine (`Access denied`/`permission denied`). Không đánh dấu Docker runtime đã nghiệm thu.

## Cập nhật mới nhất — hướng dẫn, EN/VI và C3.8

- Web có `/guide/build-city`; cả Web/Playable có hướng dẫn 6 trang trong menu. Home/auth/profile/404, title, menu, HUD, canvas feedback và nhãn dân số hỗ trợ Anh–Việt. Đổi ngôn ngữ giữa lượt không tạo run mới hay mất tiến trình; Playable lấy ngôn ngữ mặc định từ host/SDK, nút EN/VI cho phép đổi trong phiên.
- Tầng móng của lượt mới đặt tại vị trí thả, không chấm chất lượng, không mất mạng, không cộng Perfect/streak/combo; nhận dân số cơ bản và không tham gia accuracy. Combo bar chỉ hiện khi combo còn hoạt động, không giữ một thanh rỗng.
- C3.8 đã triển khai: hoàn thành thân City thì người/dù đi vào tầng trên trước bảng kết quả, khoảng 3,6 giây; Quick Tower có burst sau tầng được chấm đáp thành công. Reduced Motion chỉ hiện +dân số. Không cộng dân số/save thêm qua animation; reload kết quả không phát lại hiệu ứng. Bộ 8 PNG của cả 4 class đã có, kiểm tra RGBA và import nguyên bản vào hai public/game; renderer crop/căn harness riêng và cache sprite nhỏ, không sửa file nguồn.
- Số sprite đại diện theo class Residential/Industrial/Office/High-rise: Perfect 4/6/8/10; Great 3/4/6/8; Good 2/3/4/6; Risky 1/2/3/4; Miss không tạo burst. City completion dùng chất lượng mái nếu đáp, hoặc tầng thân cuối nếu trượt mái nhưng đủ thân; công trình chưa đủ thân không có completion burst. Sprite không tương đương 1 dân. Người 24×48 world units, tán dù khoảng 72–80 world units; mắt dây nối harness.
- Kiểm chứng: 100/100 unit tests, lint, Web build, Playable package và Chrome smoke cả hai nền tảng qua. Browser kiểm tra đổi ngôn ngữ giữa lượt không đổi số tầng/dân, móng không combo, tầng Perfect mới hiện combo, 4 loại dù/người/Reduced Motion/kết thúc FX, hướng dẫn EN/VI và site Home/auth/profile/404. City map EN/VI không scroll ở 320×568, 390×844, 900×430. Chưa đo GPU/FPS điện thoại thật, chưa chứng nhận SDK thật; animation count-up số chưa triển khai.

Layout no-scroll 07/10/2026: /play khóa chiều cao viewport, ẩn footer riêng khi chơi, bỏ minimum height 480px; arena flex-basis 0 tránh canvas kéo giãn layout. Menu City bỏ overflow:auto, grid 25 ô co theo phần chiều cao còn lại, màn ngang chia map/nút thành hai cột và màn nhỏ dùng spacing/font gọn. Chrome smoke Web/Playable kiểm tra 390×844, 320×568, 900×430: document không overflow dọc/ngang, menu không scroll, nút nằm trong panel và ô map cao tối thiểu 24px. Build hai nền tảng và browser smoke qua; các trang Web khác vẫn scroll bình thường.

Polish 07/10/2026: thêm Double/Triple Perfect và Perfect ×N (Canvas pulse/tia vàng giới hạn, Reduced Motion chỉ chữ); mái không cộng streak. Bỏ brightness filter toàn arena khi đáp, cache sky theo viewport/DPR, tránh ghi lại HUD không đổi. City map thêm tooltip tọa độ/lý do chặn và cảnh báo không có ô trống hợp lệ; click/chạm mới chọn ô, không phải hover. Office vẫn cần cả Residential và Industrial trong 4 ô liền cạnh, không tính chéo. C1.5a–c trong development plan phân biệt phần đã triển khai và adaptive music/FPS điện thoại thật còn thiếu; chưa cam kết loại bỏ mọi giật trên thiết bị thật.

Kiểm chứng lượt polish: 80/80 unit test, lint, build Web + Playable package và Chrome browser smoke đều qua. Browser kiểm tra nhãn Double/Triple/×6, số hạt tăng có giới hạn và Reduced Motion không có hạt; screenshot `tmp/c0-c2-qa/*-perfect-streak.png`, báo cáo `tmp/c0-c2-qa/browser-report.json`. Timing trong report chỉ là CPU submit Canvas headless, không phải FPS trình bày/GPU hoặc bằng chứng hiệu năng điện thoại thật.

- C0: nền móng và kiểm tra kỹ thuật đã xong.
- C1: core feel đã triển khai; còn C1.6 playtest 5–8 người và đo FPS/load trên điện thoại thật.
- C2: Quick Tower, result, replay, Standard/Assist và save đã triển khai trên Web và Playable preview.
- C3: Build City đã triển khai dùng chung hai nền tảng; xem phạm vi và kiểm chứng bên dưới. Art compact mới đang chờ generate/import và playtest người thật.
- C4 — Daily/missions/mastery/cosmetics chưa bắt đầu. C3.8 người nhảy dù đã có; còn playtest feel, count-up/polish bổ sung và benchmark điện thoại thật.

## Logic hiện tại

Physics 0.10.0, Quick ruleset 0.10.0, City ruleset build-city-4, city rating city-rating-1. Body 144×120 world units (1,2:1), hẹp hơn 40% so với 240×120. Dây có tải 229.8 world units, ngắn hơn 40% so với 383; dây không tải bằng chiều dài có tải / 1.15. Biên độ đu 200→220; tốc độ và gió vẫn tăng theo chiều cao.

Sau tầng móng, Perfect lệch ≤5% (≤7,2 world units); Great >5–15%; Good >15–30%; Risky >30–<40%; Miss ≥40% (≥57,6 world units), đúng 40% cũng trượt. Kiểm tra raw error với threshold quantized, không làm tròn sai lệch để thăng band. Standard/Assist/City lượt mới cùng band; Assist chỉ chậm hơn và có ramp/gió nhẹ hơn, không nới band. Không tự căn nhà; chỉ khối đang thả trượt, chưa có cơ chế cả tháp sụp.

PB giữ nguyên; replay cũ không tương thích bỏ riêng. Fixture hiện tại: `packages/city-bloxx-core/fixtures/quick-mixed-v10.json`. Checkpoint City 0.7/0.8/0.9 giữ scoring/móng/band cũ đến hết lượt qua legacy flags, không mất nhà đang xây; lượt mới dùng luật mới. Prepare vẫn chờ đủ khoảng trống cho cung đu của tầng mới, không spawn trong tower; checkpoint legacy giữ timing cũ.

## C3 đã triển khai

1. Bản đồ 5×5 (25 ô), chọn ô và loại nhà, highlight vị trí hợp lệ và lý do chưa đủ điều kiện.
2. Bốn loại nhà, mục tiêu 10/20/30/40 tầng, mái nhà, rating và mở khóa.
3. Xây dở, hủy, xây lại giữ nhà cũ, phá nhà; runId ngăn cộng kết quả hai lần.
4. Commit đồng bộ ô đất/dân số/inventory/stats; checkpoint sau mỗi tầng để reload khôi phục được.
5. Migration và bảo vệ save; test adjacency góc/cạnh/giữa, rebuild, zero-floor và reload lúc result/placement.

Save payload schema 3 migrate từ 1/2, giữ key Web cũ và envelope YouTube version 1. Checkpoint chứa config/tick/input fraction, khôi phục bằng deterministic re-simulation; lưu sau drop, mỗi kết quả tầng, pause/pagehide và cuối tower. Pending kết quả chờ nhận cũng được lưu, không tự commit. Chỉ commit runId đang pending một lần; zero-floor không chiếm đất hoặc thay nhà cũ. Dân số thành phố được tính từ lot hiện tại, không cộng chồng khi rebuild.

Blue bất kỳ; Red kề Blue; Green kề Blue+Red; Yellow kề Blue+Red+Green, chỉ bốn hướng. Hoàn thành và nhận một nhà mở class tiếp theo; phá nhà không khóa lại. Ba miss trước mái có thể giữ tower dở, không completion unlock. Mái chỉ thử một lần; miss giữ thân hoàn thành nhưng không roof bonus. Prototype roof bonus = population cơ bản của class ×5×accuracy mái; body population 10/20/30/40 theo class. Đây là tuning v1, không phải công thức gốc đã xác minh.

## Kiểm chứng và phần còn chờ

- 78 unit/acceptance tests: gồm 8 sprite tests kiểm alpha của từng hàng/body edges cho base/mid bốn class; biên Perfect ±7,2/±7,201; biên miss ±57,599/±57,6/±57,601 cho Standard/Assist/City; migration checkpoint cũ; bốn tier/mái, 40 tầng xây nhanh/camera, adjacency, restore, commit/rebuild/cancel/demolition/migration/catalog/score guard. Test bot tháp cao dự đoán vị trí đỉnh ở lúc đáp qua simulation, không chỉ canh lúc thả và không sửa state game để xây.
- Web lint/build, Playable typecheck/build/package; bundle tổng ~4.00 MiB, startup ~1.41 MiB.
- Chrome headless hai production shell: Quick/replay/Assist còn hoạt động; city 25 ô, khóa class, reload sau 2 tầng rồi xây tiếp, mái, pending result reload, accept, giữ nhà cũ khi cancel rebuild, phá nhà; score chỉ Quick Standard. Báo cáo/screenshot ở `tmp/c0-c2-qa/`.
- Chưa coi headless/emulation là playtest trên điện thoại thật hoặc certification YouTube SDK thật. Chưa có cloud/backend leaderboard.
- Đã sửa khe hở giữa các tầng do transparent padding: `renderer/src/sprites.ts` chứa crop facade đo riêng cho base/mid từng class, tất cả map kín 144×120 world units. PNG nguồn/runtime không bị sửa; không đổi physics/checkpoint/hitbox. Đã kiểm ảnh ghép bốn tầng Industrial/Office trên cả hai shell (`*-industrial-seams.png`, `*-office-seams.png`). Viền kiến trúc trong bản vẽ vẫn được giữ, không phải khe trong suốt.
- Art hiện tại được giữ nguyên và thu gọn trong renderer; 12 ảnh compact cần gen theo [prompt v3](City_Bloxx_Art_Prompts_v3.0.md), lưu `art/source/stack/compact-v3/`, rồi QA/căn/export và đổi crop/hash. Không chạy export v001 để thay art này.

Sau C3 là C4 (Daily/missions/mastery/cosmetics). Nhánh Web còn W0/W1/W2; Playables còn Y0 tích hợp/kiểm chứng SDK thật, Y1 và Y2 đóng gói/certification. Preview không thay cho certification.

## C3.8 — population celebration đã triển khai

Đã import 8 PNG người/dù tách riêng theo bốn class từ `art/approved/fx/population/default/`; palette/trang phục gắn với nhà tương ứng. Xem quy cách và tình trạng thực tế ở phần cập nhật mới nhất bên trên, cùng [Art Prompts v3](City_Bloxx_Art_Prompts_v3.0.md).

Build hiện tại giữ nhà khi thân đủ tầng, người/dù bay vào tầng trên và hiện +population rồi tới kết quả; tối đa 10 sprite đại diện. Reduced Motion chỉ chữ, effect clock dừng theo pause/lifecycle, reset khi đổi scene; reload pending result không phát lại thưởng. Core tính dân số trước FX, commit thành phố vẫn một lần khi nhận nhà. Dùng chung Canvas renderer cho Web/Playable. Count-up số, nút skip riêng và benchmark điện thoại thật là phần polish còn chờ.
