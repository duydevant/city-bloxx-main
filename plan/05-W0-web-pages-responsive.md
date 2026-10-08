# W0 — Web navigation, trang mới và responsive

Trạng thái: Planned. Dependency: C4 shared UI; shell/navigation có thể làm sớm. GDD: 54–55, 69, 72–74, 89–90.

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

- [ ] Extend SessionOptions với `initialScreen`, capabilities và callback điều hướng; screens Quick/City/Daily/stats/history/book dùng controller chung.
- [ ] Deep link chỉ chọn màn hình, không tự tạo scored run; active/pending run cần confirm trước chuyển mode.
- [ ] Header Web là language switch duy nhất; Playable giữ switch trong game.
- [ ] Locale update không remount game/reset run; translation keys cho mode/XP/mission/reward/empty/error.
- [ ] No global stores chứa mỗi-frame snapshots; React wrapper chỉ quản session lifecycle/capability.
- [ ] Auth controls phân biệt guest/scaffold/backend-ready; ẩn action không có endpoint.

## 3. Responsive / accessibility

- [ ] `/play` giữ viewport lock và không outer scroll ngang/dọc; footer ẩn riêng khi chơi.
- [ ] Các trang nội dung ngoài game được scroll dọc bình thường; không ép guide/statistics dài vào viewport làm mất nội dung.
- [ ] Toolbar mobile: title + mode trên dòng đầu, controls trên dòng hai; ẩn mode label thừa nếu nó chỉ lặp lại title. Replay chỉ ghi khi thật sự xem replay.
- [ ] Buttons ưu tiên touch target 44px; landscape rất thấp dùng layout hai vùng và thu gọn text thay vì che controls.
- [ ] Statistics/results dùng label/value rõ, không nhét population/accuracy/duration vào một câu dài. Portrait hai cột, chữ dài tự xuống dòng trong card.
- [ ] Guide chia section/paging; không nested scroll ở gameplay menu.
- [ ] Missions/book/history chia trang, giữ selected tab/filter khi quay lại.
- [ ] Focus order, keyboard actions, aria-live reward summary, lives label và loading/errors EN/VI.
- [ ] Safe areas/dynamic viewport/mobile browser bars; resize không tạo run mới.

## 4. First-time experience và SEO

- [ ] Persist tutorial flags riêng, migrate old save không bắt user học lại bắt buộc.
- [ ] First Quick hiển thị ba hint theo tiến trình: thả / căn tầng / combo; dismiss hoặc hoàn tất lưu một lần.
- [ ] First City giải thích adjacency và selected lot; first Daily giải thích UTC/20 body/roof.
- [ ] Titles/descriptions/canonical/sitemap phù hợp routes public; auth/private personalized pages không index.
- [ ] Server-render phần giới thiệu/catalog; personal save chỉ load client, không leak vào SSR/cache chung.
- [ ] Chưa generate hàng nghìn SEO pages rỗng; public tower pages chỉ khi C6 có published content.

## 5. Tests / DoD

- [ ] Direct URL, refresh, browser back/forward, deep-link không bỏ pending run.
- [ ] EN/VI và đổi locale giữa run không reset tick/floors/population.
- [ ] Web/Playable UI shared smoke: 320×568, 390×844, 900×430; thêm safe-area phone thực.
- [ ] `/play` không overflow; guide/content có thể scroll đúng; header/control action không bị cắt.
- [ ] Guest empty states và old save có data; replay unsupported có giải thích.
- [ ] Accessibility bằng keyboard, focus modal, contrast và announcement không spam mỗi frame.
- [ ] Metadata/sitemap/robots không index auth/private data.

DoD: các routes hoạt động với dữ liệu local thật, không mock thành tích online; W1 bật thêm account/cloud/rank mà không viết lại shared menus.
