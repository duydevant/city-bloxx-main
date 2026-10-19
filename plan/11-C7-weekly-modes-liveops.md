# C7 — Weekly contracts, modes bổ sung và LiveOps

Trạng thái: Implemented & Verified (19/10/2026) — [Evidence](evidence/C7-validation.json). Dependency: C5/C6 released và vận hành save/backend ổn định. GDD: 28–29, 32, 34, 59–60, 77.

## 1. Release sequence và defaults

| Subrelease | Nội dung | Defaults |
|---|---|---|
| C7.1 | Weekly contracts | Ba nhiệm vụ, tuần UTC bắt đầu thứ Hai |
| C7.2 | Perfect Rush | 60 giây simulation active, Residential, no roof |
| C7.3 | Skyline Sprint | 20 body Residential, Miss +5 giây, no roof |
| C7.4 | Winter event | 14 ngày, một bộ reward nhỏ, không full theme |
| C7.5 | Free season | 42 ngày, 20 mốc, không premium track |
| C7.6 | Adaptive audio polish | Layers theo combo, host-aware, optional |

Mỗi subrelease có config/ruleset version và acceptance riêng. Không đổi Classic bands/swing/collision bằng remote config. Wind/Survival/blueprints/synergy còn backlog.

## 2. Weekly contracts

- [x] Versioned pool (`weekly-contracts-1`), deterministic UTC week selection (`utcWeekStart`); lọc availability tương tự daily missions.
- [x] Ba defaults: 200 landed scored body (200 XP), 50 Perfect non-Assist (300 XP), năm finite tower hoàn thành (400 XP).
- [x] Một lần claim/contract/week; không free reroll tuần trong v1.
- [x] Progress dùng run-start week (`utcWeekStart(summary.identity.startedDateUTC)`), hoàn thành có bảy ngày grace claim (`weeklyContractExpired`); UI thể hiện reset UTC.
- [x] Save bounded active week + previous week (`weeks.length <= 2`); claim receipts giữ qua prune (`claimedReceipts`).

## 3. Mode rules

### Perfect Rush

60 giây active simulation = 3.600 ticks, same Classic geometry/bands/height difficulty. Ba lives; hết lives hoặc hết timer kết thúc. Mục tiêu số Perfect body; secondary population rồi simulation duration. Foundation không tính, roof không có. Pause/host background dừng ticks; không cộng thời gian thật bỏ app.

Nếu timer hết khi block đang falling, resolve block đang thả với maximum 180 extra ticks nhưng không nhận input mới; Perfect của block đã được thả trước deadline được tính. EndTick/validator phải bao gồm finishing window và kiểm no input sau deadline. Timer result ghi deadline và endTick riêng.

### Skyline Sprint

20 body gồm foundation, no roof, ba lives; kết thúc khi đủ body hoặc hết lives. Score = active simulation ticks tới completion + 300 ticks mỗi Miss. Chỉ completed run có time PB; failed run ghi best height/history. Timer không tính pause/FX sau completion.

Hai mode có separate PB/result/replay contracts; không gửi Playable Quick SDK score hoặc vào Quick board. W1 verification có thể verify mode nhưng v1 chỉ personal board trong game; thêm global board cần backlog competitive extension.

XP: Rush per-scored body, không finite completion bonus; Sprint per-scored body + finite complete bonus. Daily bonus chỉ mode Daily. Mastery Residential nhận body/completion XP, no special mode XP multiplier.

## 4. Event và season

Winter event 14 ngày UTC: cumulative 500 landed body, 100 Perfect non-Assist, bảy Daily completes → nhận Winter crane rig/hook, winter roof Residential và profile badge tương ứng. Không yêu cầu hoàn thành City class đang khóa, không event gameplay buffs.

Season 42 ngày, 20 tiers; mỗi tier 100 season points, cumulative. Daily complete đầu ngày +20 SP; daily mission claim +10 SP; weekly contract claim +50 SP. Không convert guest lifetime XP/Coins sang SP. 20 reward tiers dùng alternate 50 builder XP (odd tiers), 100 builder XP (even tiers), tier 10 thay bằng season badge, tier 20 thay bằng một crane set đã approved. Free track, không mua skip.

- [x] Rewards catalog ready trước bật event/season, asset/content version pin (`cosmetics-2`, `liveops-1`, `58` approved assets, `14.51 MiB`).
- [x] Claim earned rewards trong bảy ngày sau end; ownership tồn tại vĩnh viễn. Chưa earned không claim sau deadline.
- [x] Run bắt đầu trước end có thể settle theo pinned period trong 24 giờ (`settlementGraceHours: 24`); không mở attempt mới sau expiry.
- [x] Catalog unavailable/error dùng default UI, không reset progression đã earned.
- [x] Event/season receipts và SP transactions dedupe bằng run/claim IDs (`spReceipts`), không cấp SP qua replay.

Lịch start cụ thể là release parameter `startsAtUTC`, được set một lần trong manifest khi chọn ngày phát hành và test trước activation. Duration/rules đã cố định; không hardcode một ngày cũ vào source.

## 5. Config và platform behavior

Web backend lưu immutable published config revisions; signed/validated allowlisted content config, TTL cache 15 phút. `GET /content/active` trả catalog IDs/date/revision; không chứa executable JS. Admin publish cần audit log và rollback về revision tương thích.

Kill switch tắt entry mới khi lỗi; active runs pin old config tới finish, reward owner không mất. Catalog mới không thể bật class physics buffs trong Classic. Local offline dùng last-good config và hiển thị personal/unverified nếu server ticket không có.

Playable config/lịch assets đóng gói; không fetch Web endpoint. Tắt event theo UTC expiry local, cập nhật manifest qua release. Không hứa instant remote kill switch trong YouTube. Đồng hồ local có thể chỉnh, nên event rewards ở đó chỉ cosmetic/personal.

## 6. Audio polish

Một loop base + ba layer bổ sung theo combo 3/6/10; fade 150ms, không oscillator hoặc decode mỗi frame. Khi combo hết fade về base; Reduced Motion không bắt buộc mute audio. Mute/pause/host audio state suspend tất cả layers; gameReady không chờ tải optional music.

Source/licensing rõ ràng, runtime audio ≤1 MiB tổng cho release đầu (`0 B` external audio files — procedural Web Audio synth loop + 3 layers); nếu vượt budget chia lazy scenes hoặc postpone music, không làm initial load quá gate. Không dùng nhạc có bản quyền không được phép.

## 7. Tests / DoD / monitoring

- [x] Monday UTC/year crossover/week claim grace, events start/end/24h settlement/expiry (`c7-weekly-modes-liveops.test.ts`).
- [x] Rush deadline falling/resolution cap, inputs after deadline, pause exploit; Sprint 20 body + Miss penalty exact (`c7-weekly-modes-liveops.test.ts`).
- [x] Separate PB/ruleset/replay, no Quick SDK score pollution (`c7-weekly-modes-liveops.test.ts`).
- [x] Repeated reward/SP/claim, config revision rollback, asset unavailable/expired owner retention (`c7-weekly-modes-liveops.test.ts`).
- [x] Web auth/config validation/admin audit, Playable zero external fetch (`c7-weekly-modes-liveops.test.ts`, `scripts/c7-evidence.cjs`).
- [x] Audio host mute/pause/layer thresholds, memory/load/mobile performance (`c7-weekly-modes-liveops.test.ts`, `scripts/c7-evidence.cjs`).
- [x] Quan sát completion/retry, Daily return, reward claim/equip, save/config errors; review sau mỗi subrelease ít nhất bảy ngày trước mở rộng.

DoD: từng subrelease qua same soft-launch technical gates; không coi cả C7 hoàn thành sau khi chỉ thêm weekly menu. (Verified 19/10/2026: 323/323 unit tests across 27 files, `npm run check`, `npm run evidence:c7` — [Evidence](evidence/C7-validation.json)).
