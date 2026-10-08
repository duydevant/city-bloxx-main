# Backlog — mục GDD chưa cam kết triển khai trong C4–C7

Trạng thái: Deferred. Đây là danh sách có dependency/gate, không phải spec có thể tự triển khai. Muốn đưa một mục vào release phải có plan riêng và quyết định gameplay/security/art rõ ràng.

## 1. Gameplay và City

| Mục | GDD | Dependency / điều kiện mở |
|---|---|---|
| Old Town và district tiếp | 21, 98–99 | C5 Harbor có usage/goal data; art approved và save budget còn |
| City synergy | 22 | Tách bonus City-only/unranked, không buff Quick/Daily competitive; có UX adjacency dễ hiểu |
| Tower blueprints Narrow/Heavy/Tiny Roof | 24 | Versioned geometry profiles + collision/replay/server tests; không lấy skin làm luật |
| Survival | 30 | Đặc tả cuộc sống/finish criteria/reward rõ; kiểm soát run length/save bounds |
| Wind mode | 31 | Deterministic seeded wind, versioned recipe, verify/replay fixtures; không thay Classic |
| Prestige / Found New City | 62 | Multiple districts + backup/confirmation; ownership retention và reset scope được chốt |
| Rating weighted/S+ | 16 | Formula thresholds được chốt từ data, rating version riêng, không đổi PB cũ ngầm |

## 2. Competitive và social

| Mục | GDD | Dependency / điều kiện mở |
|---|---|---|
| Skill-based Builder Rank | 36 | Verified skill stats đủ; tiêu chí độc lập XP, anti-farm, rank/version migration |
| City/season/One Drop/multi-metric global boards | 50 | Server-authoritative phù hợp từng mode; không rank City bằng unsigned local cloud save |
| Async duel nhiều vòng | 52, 98 | C6 Beat This Tower ổn định; ticket/timeouts/ties/moderation rõ |
| Friends/follow/notifications | 52 | Public profiles opt-in, abuse reporting, privacy và vận hành |
| Advanced coaching/heatmap | 43 | Sample size đủ, data retention đúng, không khẳng định kỹ năng từ vài drop |
| Realtime PvP/tournament | 99 | Match/session protocol, latency fairness, dedicated infrastructure; không thuộc backend W1 |

## 3. Economy và monetization — chỉ sau soft launch

| Mục | GDD | Gate bắt buộc |
|---|---|---|
| Coins earn/shop | 63, 65, 68 | Server ledger, earn/claim idempotent, không import XP guest thành currency; cosmetic-only |
| Rewarded ads | 66 | Provider/SDK phù hợp từng platform, callbacks dedupe, consent, fallback no-fill/error |
| Interstitial caps | 67 | Không trong swing/drop, không sau mỗi retry, cap/UX được chốt và đo |
| Remove Ads / IAP | 65 | Payment ownership/refund/webhook security, tax/region/provider riêng; scope cần phê duyệt |
| Premium season / paid tier skips | 60, 65 | Free season validated + purchase ledger; không tăng score hoặc thay geometry |
| Energy/stamina gating | 64 | Không triển khai; trái nguyên tắc chơi ngay đã chọn |

Ads wrapper hiện có trong Playable không là bằng chứng provider được phép hoặc reward callback đã an toàn. Không thêm monetization như bước triển khai ngầm khi làm C7.

## 4. Content / art / vận hành

- Modern Glass, Old European, Neon Future và full Winter themes: sau Brick, mỗi full set có pipeline/budget riêng, không gen hàng loạt trước kiểm style.
- Per-class variants: đủ base/mid/roof/mini, giữ class ID và fairness; không cosmetic nửa bộ thiếu module.
- Animated skins: cache/frame/memory/perf gate, reduced motion và no gameplay advantage.
- Advanced skyline theme preview/rarity UI: khi đủ catalog, không phình launch bằng rarity giả hoặc shop trống.
- A/B testing: sau baseline event data, experiment ID pin theo account/session, không thử physics/ranked config khác nhau trong cùng board.
- Expanded audio tracks/promo assets: quyền sử dụng rõ, budget và actual device load test.

## 5. Chủ đích khác GDD launch đầy đủ

- Launch ba mode Quick/City/Daily; One Drop sau soft launch, thay vì tất cả modes ngay.
- Default + một full Classic Brick, không yêu cầu 2–3 full themes.
- Chỉ Quick Standard population + Daily verified boards Web; chưa City/season/mọi metric.
- Builder XP level/mastery trước, skill rank sau.
- Monetization sau soft launch; no energy luôn giữ.
- Playable có personal Daily/progression và một Quick SDK metric, không backend/social Web.

Các mục GDD còn lại đã có nơi theo dõi trong [audit](00-project-audit.md). Những định hướng retention/north-star không là module riêng; đánh giá qua analytics/QA/release. Không gạch 'hoàn thành GDD' chỉ vì mọi mục đã được phân loại.

## 6. Quy trình đưa backlog vào phase

1. Chọn nhu cầu/metric cần giải quyết và nền tảng áp dụng.
2. Audit dependency/policy/art/save/performance hiện hành.
3. Viết decision-complete spec, test/rollout và migration; xác nhận quyền/chi phí nếu có external provider.
4. Thêm link/phase vào README, status Planned; giữ lịch sử quyết định cũ.
5. Implement → Verify → Release bằng evidence, không tự coi Deferred là việc đang làm.
