# City Bloxx — kế hoạch nâng cấp sau core

Ngày cập nhật: 19/10/2026. Bộ tài liệu này đặc tả roadmap và theo dõi bằng chứng triển khai. Audit trạng thái mới nhất: [14 — Phase status audit](14-phase-status-audit.md); file 00 giữ nguyên snapshot trước C4.

## Đọc từ đâu?

**Mốc hiện tại:** **Y0–Y2 (Playable SDK, hardening, certification và release) và W1 (W1.0–W1.9) đã hoàn thành triển khai (Implemented)**.
- **Y0–Y2**: Hoàn thiện thứ tự `firstFrameReady`/`gameReady`, màn hình lỗi khởi động, bảo vệ ghi save trước khi load thành công, quyền tối cao của `ytgame.system` về pause/resume/audio (ẩn nút `[data-sound]` trong actual Playable, kẹp delta `<= 0.1s`), lưu `pendingScore`/`ackedScore` trong envelope `{ v: 1, d, score }`, đồng bộ PB Quick Standard monotonic idempotent với backoff `1/2/4/8/16s` (trần `30s`) + trạng thái UI `[data-score-status]`, trình kiểm tra gói `check-package.mjs` + manifest SHA-256 `zip-dist.mjs`, 293/293 unit tests và `npm run evidence:playable` ([Evidence Y0–Y2](evidence/Y0-Y2-validation.json); portal upload & thiết bị thật: `Blocked: portal access / physical device`).
- **W1 (W1.0–W1.9)**: Đầy đủ hạ tầng/schema/permissions, Web auth/cloud sync/Guest import, server tickets/durable verification/atomic settlement, Web ranked Quick/Daily + leaderboards, moderation RBAC/quarantine/release resimulation, catalog + telemetry, retention sweep 30d/90d, daily `pg_dump`/14d pruning + separate-DB `pg_restore` rehearsal và nghiệm thu hợp nhất W1.9 ([Evidence W1 tổng hợp](evidence/W1-nest-validation.json), [W1.9](evidence/W1.9-validation.json)).
- Tiếp theo: **Soft-launch checklist** ([08](08-soft-launch-checklist.md)) và **C5 Districts, landmarks** ([09](09-C5-districts-landmarks.md)).

1. Đọc [audit hiện trạng](00-project-audit.md) để biết code đang có gì và khác GDD ở đâu.
2. Triển khai lần lượt C4.0 → C4.1 → C4.2 → C4.3.
3. Sau C4.3, hoàn thiện Web W0/W1 và Playable Y0–Y2. Hai nhánh không phụ thuộc backend của nhau.
4. Nghiệm thu [soft launch](08-soft-launch-checklist.md), rồi triển khai C5 → C6 → C7 theo từng release.
5. Asset cần sản xuất tập trung trong [art requirements](12-art-requirements.md); phần chưa cam kết nằm ở [backlog](13-backlog.md).

## Mục lục và dependency

| Tài liệu | Dependency | Trạng thái |
|---|---|---|
| [00 — Project audit](00-project-audit.md) | Code/GDD hiện tại | Audit snapshot |
| [01 — C4.0 Save, stats, history](01-C4.0-save-stats-history.md) | C0–C3 hiện tại | Implemented — hoàn thành triển khai |
| [02 — C4.1 Daily Tower](02-C4.1-daily-tower.md) | C4.0 | Implemented — hoàn thành triển khai |
| [03 — C4.2 Progression, missions, achievements](03-C4.2-progression-missions-achievements.md) | C4.0–C4.1 | Implemented — hoàn thành triển khai |
| [04 — C4.3 Cosmetics, Architecture Book](04-C4.3-cosmetics-architecture-book.md) | C4.2 + approved art | Implemented — hoàn thành triển khai |
| [05 — W0 Web pages, responsive](05-W0-web-pages-responsive.md) | C4 shared UI | Implemented — hoàn thành triển khai |
| [06 — W1 requirements lịch sử](06-W1-backend-auth-cloud-leaderboards.md), [06c — plan game trên Nest backend hiện có](06c-W1-city-bloxx-existing-backend-plan.md) | C4/W0 + user/auth `backend/` | Implemented — hoàn thành triển khai W1.0–W1.9 (Verified local/staging Docker) |
| [07 — Y0–Y2 Playable release](07-Y0-Y2-playable-integration-release.md) | Y0 audit làm sớm; release cần C4 | Implemented — hoàn thành triển khai Y0–Y2 (`Blocked: portal access` cho submission) |
| [08 — Soft-launch checklist](08-soft-launch-checklist.md) | C4 + W0/W1 cho Web; C4 + Y0–Y2 cho Playable | Planned |
| [09 — C5 Districts, landmarks](09-C5-districts-landmarks.md) | Soft launch | Planned |
| [10 — C6 Challenges, replay, social](10-C6-challenges-replay-social.md) | Soft launch; public/social cần W1 | Planned |
| [11 — C7 Weekly, modes, LiveOps](11-C7-weekly-modes-liveops.md) | C5/C6 + vận hành ổn định | Planned |
| [12 — Art requirements](12-art-requirements.md) | Theo phase tương ứng | Brick approved/imported; các bộ sau Planned |
| [13 — Backlog](13-backlog.md) | Có gate riêng | Deferred |
| [14 — Phase status audit](14-phase-status-audit.md) | Code + kiểm tra cập nhật 19/10/2026 | Audit snapshot |

C4.0 `11c3901`, C4.1 `ab4d02d`, C4.2 `0b72f10` và **C4.3 `5b63174` đã hoàn thành triển khai**. C4.3 có full Classic Brick (18 PNG + SVG badge), ownership/unlock/equip một inventory, active-run/City snapshots và Architecture Book/customizer EN/VI. 228/228 tests, lint, hai production builds, save/Daily/cosmetics evidence và toàn bộ Chrome smoke Web/Playable qua tại C4.3; [evidence C4.3](evidence/C4.3-validation.json). [C4.0](evidence/C4.0-validation.json), [C4.1](evidence/C4.1-validation.json), [C4.2](evidence/C4.2-validation.json) giữ kết quả lịch sử. Tại mốc C4.3, W1 và Y0–Y2 còn Planned; hiện cả W1 và Y0–Y2 đã hoàn thành triển khai theo bảng trạng thái ở trên.

**W0, W1 (W1.0–W1.9) và Y0–Y2 cũng đã hoàn thành triển khai**: W0 hoàn thiện Web routes/local data, deep-link/confirm/pending preservation, Guest UI, tutorials, EN/VI, responsive/accessibility và SEO ([evidence W0](evidence/W0-validation.json)); W1 hoàn thiện toàn bộ backend Nest11/TypeORM0.3/PG16/Redis7, Web auth/cloud sync/ranked play/leaderboards, moderation/telemetry/retention/backup-restore và nghiệm thu hợp nhất W1.9 ([evidence W1 tổng hợp](evidence/W1-nest-validation.json), [W1.9](evidence/W1.9-validation.json)); Y0–Y2 hoàn thiện Playable SDK readiness/lifecycle/audio, save/score hardening + retry backoff, package budgets + release manifest và kiểm thử trình duyệt actual-host ([evidence Y0–Y2](evidence/Y0-Y2-validation.json)). Actual phone hardware, YouTube Developer Portal submission và production TLS/SMTP/release vẫn thuộc gate tương ứng.

Ngày13/10 đã nghiên cứu backend user/auth/RBAC hiện có tại `backend/`. Plan hiện hành là [06c](06c-W1-city-bloxx-existing-backend-plan.md): thêm City Bloxx modules, cloud/tickets/verification/boards vào Nest, nối Web với JWT+refresh cookie đã có. Không xây lại user/auth trong Next. Ngày15/10 đã kiểm baseline và source W1.0 bằng security/integration suites; Web auth đã nối tại W1.2; game profile/cloud API đã có tại W1.3. File06a/06b giữ lịch sử và không dùng các lựa chọn kiến trúc xung đột với06c.

## Các quyết định đã chốt

- Ưu tiên Daily + progression cho cả hai nền tảng; backend Web triển khai sau nền shared.
- Soft launch có Quick, Build City, Daily, progression và Default + Classic Brick. One Drop là upgrade sau soft launch.
- Cosmetics earn-by-play; không ads, payment, paid shop hoặc energy trong soft launch.
- Không retune core để thực hiện roadmap này. Baseline: physics `0.13.0`, Quick `0.13.0`, City `build-city-7`; body 144×120 world units.
- Perfect ≤5%, Great >5–15%, Good >15–30%, Risky >30–<40%, Miss ≥40%; foundation mới không chấm điểm.
- Mọi mode/config/reward có version. Skin không đổi collision, scoring hoặc lợi thế gameplay.
- Web dùng Next hiện có; game backend mở rộng NestJS/TypeORM/PostgreSQL và Redis đang có trong `backend/`, tái dùng user/auth/RBAC. Playable không gọi Web backend.
- Dùng UTC cho Daily/missions/events. Đồng hồ do adapter cung cấp; core không đọc thời gian máy hoặc mạng.
- Web giữ port deploy `56789`; các biến vận hành lấy từ `.env`.

## Quy ước triển khai và Definition of Done

Các checkbox chưa tích là công việc chưa làm. Chỉ đổi trạng thái khi có evidence:

- `Planned`: đã có đặc tả, chưa viết tính năng.
- `In progress`: đang triển khai, ghi task còn thiếu.
- `Implemented`: code có và automated tests qua; chưa mặc định đã qua thiết bị/host thật.
- `Verified`: acceptance, production build và kiểm tra môi trường thực tế liên quan đã qua.
- `Released`: bản đã phát hành; ghi build/version/ngày và monitoring.

Mỗi phase cập nhật phần evidence cuối tài liệu: commit, test commands, report, thiết bị/browser/SDK, migration và known limitations. Không ghi thời gian phát triển cố định khi chưa chia task/ước lượng bởi người thực hiện.

Trong mỗi nhiệm vụ code, đọc `AGENTS.md` áp dụng cho thư mục đó. Tái sử dụng workspace core/render/content, không viết lại gameplay trong hai app. Các catalog/schema/module được mô tả là đích dự kiến, không phải file đã tồn tại.

## Nguồn và thứ tự ưu tiên

- [GDD](../City_Bloxx_Online_GDD_v1.0%20%281%29.md): yêu cầu sản phẩm, đối chiếu số mục trong từng phase.
- [Research](../city_bloxx_research.md), [so sánh nền tảng](../City_Bloxx_Web_vs_YouTube_Playables.md): bối cảnh.
- [Development plan v2](../City_Bloxx_Development_Plan_v2.0.md), [production plan v1](../City_Bloxx_Production_Plan_v1.0.md): tài liệu lịch sử, không dùng số physics/scoring cũ để ghi đè code hiện hành.
- [Progress](../PROGRESS.md), [review checklist](../PROJECT_REVIEW_CHECKLIST.md), [acceptance C0–C2](../C0_C1_C2_ACCEPTANCE.md): evidence lịch sử; audit mới ở file 00.

Nếu có khác biệt: quyết định người dùng mới nhất và baseline code đã nghiệm thu thắng ví dụ tuning cũ. Yêu cầu host hiện hành thắng tài liệu nền tảng cũ. Backlog không được tự đưa vào phase đang làm.
