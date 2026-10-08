# 00 — Audit dự án tại 08/10/2026

Trạng thái: Audit snapshot. Đây không phải chứng nhận production hoặc SDK thật.

## 1. Phạm vi đối chiếu

Đối chiếu toàn bộ cấu trúc GDD, research, platform comparison, các plan/checklist/progress với source của shared core, renderer/content, Web, Playable, asset scripts và automated tests. Không coi generated build, asset chưa import hoặc giao diện TODO là tính năng hoàn thành.

Trong lượt lập roadmap: `npm.cmd test` qua 116/116; `npm.cmd run assets:check` qua, 29 asset manifest, 12,52 MiB/target. Build/browser smoke trước đó có evidence trong progress nhưng không phải benchmark điện thoại thật. Git worktree sạch trước khi viết bộ plan này.

## 2. Kiến trúc thực tế

| Khu vực | Hiện có | Hệ quả triển khai |
|---|---|---|
| `packages/city-bloxx-core/src/` | Run, rules, collision, replay, checkpoint, city, buildings, save, ports | Tận dụng pure deterministic core; không đưa DOM/network/wall clock vào |
| `packages/city-bloxx-renderer/src/` | Canvas, session/menu, geometry/sprites, population, feedback/audio/guide | Dùng chung; tách controller/menu khi thêm C4, không thay render engine |
| `packages/city-bloxx-content/` | Buildings catalog và assets manifest | Chưa có Daily/missions/achievement/cosmetic catalogs |
| `base-game-nextjs/` | Next shell, local save, EN/VI, auth/profile scaffold, SEO | Không có backend/database; auth API còn TODO |
| `base-playable-main/` | Vite shell, shared game, host/save/score/lifecycle adapters | Preview hoạt động; cần kiểm tra SDK thật và score retry |
| Root Docker | Standalone Web image, compose/env, deploy guide | Port 56789 đã cấu hình; runtime Docker chưa được nghiệm thu |

Baseline hiện hành: `physics-0.13.0`, `quick-tower-0.13.0`, `quick-tower-assist-0.13.0`, `build-city-7`, save schema 3. Không dùng đoạn progress cũ ghi physics 0.10 hoặc band khác làm nguồn luật.

## 3. Mapping GDD → hiện trạng → nơi xử lý

| Mục GDD | Hiện trạng | Phase |
|---|---|---|
| 6–15, 17–20, 70–71 | Core/Quick/City, móng miễn chấm, combo/streak, mái, class, Assist đã có | Giữ baseline; real-device QA ở gate |
| 16 | Rating cơ bản có; chưa đủ công thức weighted/S+ của GDD | Backlog rating v2 |
| 21, 23, 61 | Một Downtown; chưa có district/landmark/evolution | C5 |
| 22, 24 | Chưa có synergy/blueprint đặc biệt | Backlog |
| 25–26, 58 | Chưa có Daily/streak | C4.1 |
| 27–29 | Chưa có One Drop, Perfect Rush, Sprint | C6/C7 |
| 30–31 | Chưa có Survival/Wind riêng | Backlog |
| 32–35, 37–38 | Chưa có contracts/missions/XP/mastery/achievements | C4.2/C7 |
| 36 | Chưa có skill-based Builder Rank | Backlog; không đánh tráo bằng XP |
| 39, 41A–41S, 68 | Chỉ default runtime; chưa có unlock/equipment/collection | C4.3, art file 12; các theme mở rộng backlog |
| 40–41 | Chưa có Skyline Album/Hall of Fame | C6 |
| 42–45 | Result/PB/local counters có; full history/lifetime còn thiếu | C4.0, C6 heatmap |
| 46–49 | Replay gần nhất Quick có; chưa có timeline/ghost/public challenge | C4.1 replay Daily; C6 |
| 50–53, 79–81 | Chưa có verified boards/backend/social/share | W1/C6; City/season boards backlog |
| 54–55 | Result 6 cards/CTA cơ bản có; chưa có reward/meta progress | C4.2/W0 |
| 56–57, 59–60 | Chưa có retention loop ngoài PB/City; event/season chưa có | C4/C7 |
| 62–67 | Không energy đúng hướng; economy/ads/payment/prestige chưa có | Deferred; SDK ads wrapper không phải gameplay ads |
| 69, 72–76 | Guide EN/VI, mobile/FX/camera có; first-run tutorial state chưa đủ | W0/soft launch |
| 77 | SFX placeholder; chưa có adaptive music | C7 audio polish |
| 78, 82 | Local/SDK save, migration/version/checkpoint đã có | C4.0 mở rộng; W1 cloud |
| 83–88 | AnalyticsPort có, product analytics chưa dùng | W1; A/B testing backlog |
| 89–90 | Home/play/guide/auth/profile/SEO cơ bản có | W0 bổ sung routes; C6 public content |
| 91–108 | Core phần lớn đã có, launch/meta/competitive chưa đầy đủ | Soft-launch gate, không tuyên bố MVP toàn GDD xong |
| 109–113, appendix | Tiêu chí đánh giá/risks, không phải module đã có | Theo dõi qua QA và release monitoring |

## 4. Đã triển khai cần giữ nguyên

- Foundation mới ở vị trí thả, không quality/Perfect/Miss/life loss/combo; không tính vào accuracy.
- Band theo độ lệch: Perfect ≤5%, Great ≤15%, Good ≤30%, Risky <40%, Miss ≥40%, không làm tròn để vượt band.
- Body 144×120; loaded cable ngắn dần theo height, empty hook sát crane; tốc độ tăng theo ramp mới.
- Miss có swept collision với facade theo đường rơi, chạm rồi bật/rơi; không cộng nhiều Miss cho cùng input.
- Quick Standard/Assist có PB riêng; chỉ Standard gửi score.
- City 25 lot, mục tiêu thân 10/20/30/40; adjacency bốn hướng, class unlock một chiều, roof một lần.
- City pending/reload/accept/rebuild/demolish, zero-floor không chiếm lot; population tính từ lot hiện tại.
- Population FX đại diện theo bốn class; không đổi population qua animation; Reduced Motion chỉ phần phụ.
- EN/VI, toolbar/mobile stats/guide, combo overlay chỉ khi hoạt động, `/play` không outer scroll.
- Raster cache/decode trước animation, fixed-tick core và fractional drop/replay.

## 5. Những blocker thật cho phase tiếp theo

1. `RunConfig` chỉ Quick/City; `validateRecord` chỉ Quick, yêu cầu ít nhất ba input. Daily/One Drop phải có validation theo mode, không nới validator vô điều kiện.
2. Save schema 3 chỉ có hai PB, runs, lastReplay và City. Chưa có run metadata, reward receipts, progression, daily, equipment hoặc full stats.
3. City `skin` chỉ `default`; validator reset skins/inventory. Cần migration khi C4.3, nếu không cosmetic mất sau reload.
4. City `runId` hiện dùng bộ đếm local; cần identity chung cho summary/reward/server mà vẫn giữ legacy pending tương thích.
5. Không có lịch sử để tái tính thống kê cũ. Không lấy số tower đang đứng làm tổng số tower lifetime.
6. Session UI lớn và locale thay live text; C4 nên tách controllers và catalog translations, không nối thêm mọi thứ vào một hàm.
7. Playable submit lỗi hiện chưa persist pending score; lỗi gửi không được coi là đã đồng bộ.
8. Asset check scan core chỉ cấp gốc; thêm subfolders phải kiểm tra recursive và boundaries theo capability.

## 6. Art và release chưa hoàn thành

- Runtime: 12 building modules + 4 minis + lot + 2 background + crane/hook + 8 population sprites.
- Compact-v3 source: mới có residential mid và industrial mid; 10 module còn lại chưa có. Hai file này chưa thay runtime.
- Favicon/tim đang có vector fallback; prompt PNG tồn tại nhưng không mặc định đã import.
- Classic Brick full set, district/landmark art và audio layers chưa có.
- Chưa có backend/cloud/verified leaderboard; profile scaffold không chứng minh account hoạt động.
- Chưa có YouTube certification, real-device FPS/GPU benchmark hoặc Docker runtime acceptance trong evidence hiện tại.

## 7. Cách dùng audit

Audit này là baseline cố định, không tích checkbox tính năng mới tại đây. Cập nhật trạng thái vào từng phase và [README](README.md). Có thể bổ sung audit mới có ngày, không xóa evidence cũ hoặc biến TODO thành đã xong.
