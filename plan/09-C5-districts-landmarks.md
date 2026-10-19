# C5 — Harbor, mục tiêu district, landmark và city evolution

Trạng thái: Implemented — hoàn thành triển khai (19/10/2026). Dependency: soft launch ổn định. GDD: 21, 23, 61; synergy 22 nằm backlog.

## 1. Nội dung release đầu

Downtown hiện tại + Harbor mới, mỗi district 5×5 riêng. Không Old Town hoặc nhiều district cùng lúc. Bốn class/rules/adjacency hiện tại giữ nguyên, class unlock và equipment dùng chung profile.

Harbor dùng cùng building themes; art mới chỉ background, district thumbnail và Dock Clock Tower landmark/mini. Không biến Harbor thành Wind mode hoặc tăng điểm Classic theo district.

## 2. District catalog và unlock

| District | Điều kiện mở | Mục tiêu hoàn thành |
|---|---|---|
| Downtown | Có sẵn | 12 tower đủ body đang đặt, đủ bốn class hiện diện, ≥8.000 population, ≥3 tower A/S |
| Harbor | Đã đạt mục tiêu Downtown ít nhất một lần | 16 tower đủ body đang đặt, ≥12.000 population, ≥5 tower A/S |

Các điều kiện là conjunction, không OR. Target counters tính lot hiện tại, không lifetime placements để farm bằng rebuild. Unlock/completion milestone một chiều: sau khi được ghi receipt, demolish không khóa district lại; UI vẫn hiển thị current metrics và trạng thái earned.

Dock Clock Tower: hoàn thành Harbor mở một landmark cosmetic free, người chơi claim một lần. Landmark có dedicated slot ngoài 25 lot; không ảnh hưởng adjacency/population/score/unlock class. Không buộc landmark vào mục tiêu mở chính nó.

## 3. Save và tasks

- [x] District catalog có ID/version, 25-lot layout, background, unlock predicates, goal và landmark definition.
- [x] Save schema 5 migrate current `city` thành `districts.downtown`; giữ lot index, nextRun, inventory/equipment reference, stats và pending.
- [x] `pending` thêm districtId; legacy pending gán Downtown, không đổi run identity/physics/equipment.
- [x] City operations nhận districtId rõ ràng: select/start/accept/rebuild/demolish; không dựa UI active tab để commit async result.
- [x] Global class unlock một nguồn; City transaction tính population/counters của đúng district.
- [x] Total current city population = sum current lots của unlocked districts; không cộng lifetime population.
- [x] District unlock/completion/landmark claim qua receipt C4.0; không nhận lại XP/achievement do đổi tab.
- [x] UI district picker, locked preview/requirements, goal cards và dedicated landmark slot.
- [x] Các bản C4 không hiểu schema 5 phải preserve raw save; deploy rollback chỉ với compatible reader.

Chỉ một pending City build toàn profile ở release đầu. Chuyển district được xem map nhưng không start tower thứ hai khi pending chưa resolve/cancel. Quick/Daily có thể chơi khi City pending được pause/checkpoint như hiện tại.

## 4. City evolution

Derive từ tổng current population: Village <500; Town 500–<2.000; City 2.000–<8.000; Metro 8.000–<20.000; Metropolis 20.000–<50.000; Megacity ≥50.000. Đây là presentation stage, không paid currency hoặc skill rank.

Current stage có thể giảm khi demolish; highest stage earned lưu riêng và không bị mất. Stage chỉ đổi accent/label/background border trong menu, không spawn effect hoặc thay physics giữa run. Có notification một lần khi đạt highest stage mới.

## 5. UX / art / hiệu năng

Locked Harbor card có progress requirements; unlock show một modal gọn rồi vào district khi user chọn. Grid vẫn đủ 25 lot touchable. Harbor background preload lúc switch, không decode trong gameplay; default neutral background fallback nếu asset fail.

Landmark dùng mini 256×384 alpha, ground anchor như city minis; một slot ở header/plaza ngoài grid, không che lot. Không đưa nền water/landmark graphic vào collision engine. Art paths/prompts ở [file 12](12-art-requirements.md).

## 6. Tests / DoD

- [x] Schema 3→4→5 và City pending legacy; same lot IDs/score/population trước sau.
- [x] Adjacency không xuyên district; unlocked class shared nhưng hỗ trợ lot vẫn phải ở district đang xây.
- [x] Result ở Downtown, đổi UI Harbor rồi accept vẫn commit Downtown.
- [x] Boundary goals (11/12, 7.999/8.000, 2/3 A/S), chưa đủ class không unlock.
- [x] Demolish/rebuild goal derivation, earned milestone một chiều, landmark claim once.
- [x] Total population/evolution stage/current vs highest, không tạo achievement loop.
- [x] EN/VI, safe areas/portrait/landscape/no-scroll; extra art/save/cache budgets cả hai targets.

DoD: Harbor playable end-to-end trên hai nền tảng với real art và schema migration; chưa synergy gameplay hoặc Old Town.

## 7. Bằng chứng nghiệm thu (19/10/2026)

- **Code & Catalog**: `packages/city-bloxx-content/districts.ts` (`districts-1`, `landmarks-1`, 6 cấp `CITY_EVOLUTION_STAGES`), `packages/city-bloxx-core/src/districts.ts`, `packages/city-bloxx-core/src/city.ts`, `packages/city-bloxx-core/src/save-state.ts` (Save Schema 5 + migration `1..4 -> 5`), `packages/city-bloxx-renderer/src/district-screens.ts` và `packages/city-bloxx-renderer/src/session.ts`.
- **Art**: Sinh và chuẩn hoá `bg/harbor/bg_harbor_default_map.png` (`1536×1024`), `bg/harbor/bg_harbor_default_thumb.png` (`512×512`) và `city/harbor/landmark_dock_clock_tower_mini.png` (`256×384` RGBA, anchor `(128,320)`), đồng bộ vào cả hai `public/game` và `packages/city-bloxx-content/assets.manifest.json` (`51 approved assets, 14.13 MiB`). Báo cáo QA tại [`art/qa/harbor-import.json`](../art/qa/harbor-import.json).
- **Tests & Evidence**:
  - `npm test` (`base-game-nextjs/modules/city-bloxx/districts.test.ts`): **304/304 unit tests pass** (25 files).
  - `npm run check`: Qua kiểm tra asset, 304 unit tests, ESLint, Next.js build và Playable zip package (`14.36 MiB` total <= `20 MiB` gate).
  - `npm run evidence:c5`: Chrome headless kiểm thử end-to-end cả Web và Playable qua `320×568`, `390×844`, `900×430` (EN/VI, không tràn khung, ô đất `>= 24px`, mở khoá Harbor, phá nhà giữ mở khoá một chiều, nhận & hiển thị `dock_clock_tower` ở slot riêng ngoài lưới 25 ô, tiến hoá đô thị `Megacity`). Xem [`plan/evidence/C5-validation.json`](evidence/C5-validation.json).

