# W0 — Web navigation, trang mới và responsive

Trạng thái: **Implemented — hoàn thành triển khai ngày 12/10/2026**. Dependency: C4 shared UI đã đáp ứng (`5b63174`). GDD: 54–55, 69, 72–74, 89–90. Evidence: [W0 validation](evidence/W0-validation.json). Dừng trước W1 Backend theo yêu cầu người dùng.

## 1. Routes và nội dung

| Route | Nội dung | Data |
|---|---|---|
| `/` | Quick-first, City/Daily CTA, mô tả và links guide | Catalog; client personal preview sau load |
| `/play` | Shared game, mở Quick mặc định; deep-link screen qua wrapper | Session/save |
| `/daily` | Daily hôm nay, luật, personal result, Play CTA | C4.1; server definition ở W1 |
| `/statistics` | Tổng quan/kỹ năng/class | C4.0 stats |
| `/my-towers` | 50 summary, filter mode, details/replay | C4.0 history |
| `/buildings` | Architecture Book/collections và luật class | Catalog + C4.3 ownership |
| `/guide/build-city` | Giữ hướng dẫn hiện tại, bổ sung liên kết | EN/VI content |
| `/guide/daily` | UTC/seed/completion/streak/verified vs personal | C4.1 content |
| `/profile` | Guest state; account/cloud status sau W1 | Không giả login thành công |

Không tạo leaderboard placeholder có rank giả. `/leaderboard` thêm ở W1 khi có data thật. Public tower/player/challenge ở C6, không dựng empty social network trước.

## 2. Integration shared session

- [x] Extend SessionOptions với `initialScreen`, capabilities và callback điều hướng; screens Quick/City/Daily/stats/history/book dùng controller chung.
- [x] Deep link chỉ chọn màn hình, không tự tạo scored run; active/pending run cần confirm trước chuyển mode.
- [x] Header Web là language switch duy nhất; Playable giữ switch trong game.
- [x] Locale update không remount game/reset run; translation keys cho mode/XP/mission/reward/empty/error.
- [x] No global stores chứa mỗi-frame snapshots; React wrapper chỉ quản session lifecycle/capability.
- [x] Auth controls phân biệt guest/scaffold/backend-ready; ẩn action không có endpoint.

## 3. Responsive / accessibility

- [x] `/play` giữ viewport lock và không outer scroll ngang/dọc; footer ẩn riêng khi chơi.
- [x] Các trang nội dung ngoài game được scroll dọc bình thường; không ép guide/statistics dài vào viewport làm mất nội dung.
- [x] Toolbar mobile: title + mode trên dòng đầu, controls trên dòng hai; ẩn mode label thừa nếu nó chỉ lặp lại title. Replay chỉ ghi khi thật sự xem replay.
- [x] Buttons ưu tiên touch target 44px; landscape rất thấp dùng layout hai vùng và thu gọn text thay vì che controls.
- [x] Statistics/results dùng label/value rõ, không nhét population/accuracy/duration vào một câu dài. Portrait hai cột, chữ dài tự xuống dòng trong card.
- [x] Guide chia section/paging; không nested scroll ở gameplay menu.
- [x] Missions/book/history chia trang, giữ selected tab/filter khi quay lại.
- [x] Focus order, keyboard actions, aria-live reward summary, lives label và loading/errors EN/VI.
- [x] Safe areas/dynamic viewport/mobile browser bars; resize không tạo run mới.

## 4. First-time experience và SEO

- [x] Persist tutorial flags riêng, migrate old save không bắt user học lại bắt buộc.
- [x] First Quick hiển thị ba hint theo tiến trình: thả / căn tầng / combo; dismiss hoặc hoàn tất lưu một lần.
- [x] First City giải thích adjacency và selected lot; first Daily giải thích UTC/20 body/roof.
- [x] Titles/descriptions/canonical/sitemap phù hợp routes public; auth/private personalized pages không index.
- [x] Server-render phần giới thiệu/catalog; personal save chỉ load client, không leak vào SSR/cache chung.
- [x] Chưa generate hàng nghìn SEO pages rỗng; public tower pages chỉ khi C6 có published content.

## 5. Tests / DoD

- [x] Direct URL, refresh, browser back/forward, deep-link không bỏ pending run.
- [x] EN/VI và đổi locale giữa run không reset tick/floors/population.
- [x] Web/Playable UI shared smoke: 320×568, 390×844, 900×430.
- [ ] Gate Verified/Released: safe-area, browser bars và touch trên điện thoại thật; chưa dùng headless để đánh dấu đã qua thiết bị thật.
- [x] `/play` không overflow; guide/content có thể scroll đúng; header/control action không bị cắt.
- [x] Guest empty states và old save có data; replay unsupported có giải thích.
- [x] Accessibility bằng keyboard, focus modal, contrast và announcement không spam mỗi frame.
- [x] Metadata/sitemap/robots không index auth/private data.

DoD: các routes hoạt động với dữ liệu local thật, không mock thành tích online; W1 bật thêm account/cloud/rank mà không viết lại shared menus.

## 6. Evidence hoàn thành

- Commit cùng code/checklist: `feat(w0): complete Web routes navigation and guest experience`, sau C4.3 `5b63174`.
- Đủ routes trên bảng: Home Quick/City/Daily CTA + local preview; Daily, Statistics, My Towers, Buildings dùng shared controllers; hai guide có intro/catalog EN/VI được prerender. Personal save chỉ đọc client. Content scroll dọc bình thường, footer hiện; `/play` viewport lock/footer ẩn giữ nguyên.
- `SessionOptions.initialScreen`, `presentation`, `onNavigate`, `TowerSession.navigate` và account capability đã có. `/play?screen=city|daily|statistics|history|book|progression` chỉ mở màn hình. Replay deep link mở detail có CTA, không auto scored run. Chuyển qua URL trong cùng wrapper không remount; active/pending cần confirm, pending City/Daily được giữ.
- Guest/scaffold hiển thị đúng; token scaffold không được dùng để giả đã đăng nhập. Auth routes chỉ giải thích unavailable, không còn email/password/submit thiếu endpoint. Không thêm backend, database, cloud hay rank giả.
- Tutorial flags `quick/city/daily` độc lập trong schema 4; save cũ thiếu field được coi đã hướng dẫn. Quick ba bước theo drops, dismiss hoặc hoàn thành persist; City/Daily intro có dismiss và completion. Statistics/history filters, Book class/collection, progression tab/class/mission date giữ trong controller khi quay lại.
- Touch target content và toolbar mobile 44px, actions 44px khi đủ chiều cao; low viewport giữ controls compact/paging và City lots ≥24px. Focus không tự cuộn trang khi mở panel; modal navigation trap Tab/Shift-Tab, skip link, lives/preview labels, static reward summary aria-live (animated counter không live), loading/error/save feedback EN/VI.
- `npm.cmd run check`: 231/231 tests ở 18 files (3 tutorial migration tests), lint/assets/boundaries, Web build và Playable typecheck/package/zip qua. Final `npm.cmd run build`/`lint` sau ARIA polish cũng qua.
- `npm.cmd run test:web`, `npm.cmd run test:browser`: eight content routes EN/VI ở ba kích thước; direct URL, refresh, native Back/Forward, City pause/switch/reload/resume, Daily pending khi deep link, live Quick cancel, old-save 50 summaries và unsupported replay explanation qua. Full C0–C4 smoke hai shell, locale giữa run, golden fairness, save faults và host lifecycle vẫn qua; không có Runtime exception.
- `npm.cmd run test:save`/`test:daily` qua: 70 settlements/50 summaries/legacy City pending v12 giữ; envelope UTF-16 112.146 bytes dưới 262.144. Daily golden 1.305 population, 20 body, 533 XP không đổi.
- `npm.cmd run evidence:web` ghi [versioned evidence](evidence/W0-validation.json). Browser reports/screenshots tái tạo ở `tmp/c0-c2-qa/`; save report ở `tmp/c4-qa/`. C4.0–C4.3 evidence giữ lịch sử.

W0 hoàn thành ở mức Implemented. Actual phone/SDK/release gates còn mở; W1 Backend giữ Planned và không bắt đầu trong task này.
