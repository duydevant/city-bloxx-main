# 14 — Audit trạng thái phase ngày 08/10/2026

Đối chiếu HEAD `1e0ebdc` và 19 file code/test thay đổi trong working tree với task/DoD của `plan/`. Đây là kết quả kiểm tra hiện trạng, không phải yêu cầu triển khai thêm tính năng.

## Kết luận

Chưa có phase nâng cấp C4.0–C7, Web W0/W1 hoặc Playable Y0–Y2 nào đạt đầy đủ DoD để đánh dấu hoàn thành và commit implementation thành phase hoàn tất. C4.0 đã có phần lớn nền code, nhưng phải giữ **In progress** vì còn các task và gate chưa qua. Commit audit chỉ gồm tài liệu; code đang làm được giữ nguyên, chưa stage/commit.

| Phase/tài liệu | Trạng thái thực tế | Bằng chứng / phần còn thiếu |
|---|---|---|
| 00 — Project audit | Snapshot đã có | Giữ nguyên baseline schema 3 trước C4; không đổi snapshot cũ thành tiến độ mới. |
| C4.0 — Save/stats/history | In progress | Schema 4, identity/receipts, lifetime metrics, history/replay/pin, settings và hai shell đã wiring; 15 unit tests C4.0 qua. Browser smoke fail; retry load/recovery, locale catalog, reward hook và fault-injection/report chưa đủ. |
| C4.1 — Daily Tower | Planned | `RunConfig` chỉ Quick/City; chưa DailyDefinition/seed recipe, pending Daily, streak transaction, menu/guide/result Daily. `DailyState` rỗng không phải Daily gameplay. |
| C4.2 — Progression/missions/achievements | Planned | Chỉ có fields XP/mastery/achievements trong save; chưa catalog, reducers/reward claims, missions/reroll, builder/mastery levels hoặc UI. |
| C4.3 — Cosmetics/Architecture Book | Planned | Chỉ có inventory/equipment scaffold default; chưa Classic Brick catalog/art, equip/unlock, Book, renderer resolve equipment. |
| W0 — Web routes/responsive | Planned; có baseline shell | Có Home/play/guide/profile/auth, EN/VI và viewport layout từ C0–C3. Chưa `/daily`, `/statistics`, `/my-towers`, `/buildings`, `/guide/daily`, initialScreen/deep-link/tutorial flags và đầy đủ accessibility/navigation QA. Stats/history trong shared menu chưa thay cho routes W0. |
| W1 — Backend/auth/cloud/leaderboards | Planned | Auth API vẫn throw TODO; chưa Route Handlers/database/Prisma, sessions/cloud conflicts/tickets/server verifier/boards/restore evidence. |
| Y0–Y2 — Playable integration/release | Planned; có adapters/package | Preview/host adapters/save envelope tồn tại; package mới qua. Chưa actual-host SDK acceptance, persisted score retry/ack, C4 content, device/Test Suite/Portal approval. |
| Soft launch | Planned | C4/W0/W1 và Y0–Y2 gate chưa hoàn tất; automated tests/build không chứng minh release. |
| C5 — Districts/landmarks | Planned | City vẫn một Downtown; chưa schema 5/district operations/Harbor/landmarks. |
| C6 — Challenges/replay/social | Planned | Có Last replay/history pin cơ bản; chưa One Drop config, speeds/seek/heatmap/ghost/Album/public publish/share/challenge. |
| C7 — Weekly/modes/LiveOps | Planned | Chưa weekly contracts, Perfect Rush/Sprint recipes, LiveOps catalogs/admin/layered audio. |
| 12 — Art requirements | Planned; baseline art có sẵn | 29 runtime assets/target qua hashes/budgets. Compact-v3 mới có Residential mid và Industrial mid source, chưa thay runtime; chưa full Brick/district/landmark art. |
| 13 — Backlog | Deferred | Giữ gate riêng; không biến các mục backlog thành phase đã xong. |

Nền C0, Quick C2 và City C3 đã có code trong lịch sử trước bộ plan này; C1 còn playtest/benchmark thật. Việc đó không đồng nghĩa các phase nâng cấp trong `plan/` hoàn tất. Evidence lịch sử ở [00](00-project-audit.md), [PROGRESS](../PROGRESS.md) và [review checklist](../PROJECT_REVIEW_CHECKLIST.md).

## Kiểm chứng lượt audit

| Kiểm tra | Kết quả |
|---|---|
| Assets + core recursive / Playable dependency boundary | Qua; 29 approved assets, 12,52 MiB mỗi target. |
| Vitest | Qua 131/131, 13 test files; gồm 15 tests C4.0. |
| ESLint | Qua. |
| Web production build | Qua compile, TypeScript và prerender sau khi giữ output cũ trong `tmp/next-cache-before-phase-audit-20261008`. |
| Playable production package | Qua typecheck/Vite/package validator/zip sau khi giữ output cũ trong `tmp/playable-dist-before-phase-audit-20261008`; initial 1,46 MiB, total 12,63 MiB. |
| Browser smoke | Fail tại Web `trackingSmoke`, `scripts/browser-smoke.cjs:93`: actual attempts 2, expected 1. Chưa kiểm chứng toàn bộ Web hoặc Playable trong lượt này. |
| Thiết bị/host thật | Chưa chạy; không đánh dấu Verified/Released. |

Lỗi smoke cần xử lý theo nghĩa của metric: `captureMotion` bắt đầu Standard, đặt foundation, rồi Home (abandoned attempt); `recordedRun` sau đó hoàn thành thêm một lượt. C4.0 đếm attempts gồm abandoned, nên tổng 2 phù hợp flow hiện tại. Không đủ bằng chứng gọi đây là lỗi nhân reward; phải cập nhật assertion/baseline đúng và chạy lại toàn bộ smoke, thay vì bỏ assertion hoặc lấy report cũ làm kết quả mới.

## Điều kiện còn thiếu để chốt C4.0

1. Hoàn thiện retry load/recovery: load lỗi hiện giữ raw và chặn write, nhưng session không có đường retry load; `Retry save` không bật lại `storageWritable`.
2. Hoàn thiện hoặc ghi rõ dependency của reward/XP contract. Hiện `settleRun` cập nhật summary/stats/receipts/PB, chưa cấp XP; công thức/gameplay progression ở C4.2. Không tích checkbox finish cấp skill/XP khi mới có counters.
3. Hoàn thiện locale catalog/refactor task: `data-screens.ts` đã tách UI, nhưng translation vẫn inline/runtime Map.
4. Sửa smoke assertion cho abandoned attempt, chạy qua EN/VI/mobile statistics/history/replay/settings trên cả hai production shell.
5. Bổ sung bằng chứng/test qua adapter cho corrupted raw, delayed load/late result, serial writes, quota/write failure và các flow City finish/keep-old/cancel/reload không ghi stats/reward lại.
6. Lưu save trước/sau và byte-size report (UTF-8/UTF-16, gồm envelope Playable); giữ pending/receipts/lifetime/ownership khi vượt quota. Test size hiện có chưa thay cho report toàn flow.

Checkbox của [C4.0](01-C4.0-save-stats-history.md) phản ánh các mục đã đối chiếu source/unit tests; task có nhiều điều kiện còn thiếu giữ `[ ]` cùng chú thích. Chỉ chuyển cả phase sang Implemented/hoàn thành sau khi các điều kiện trên được giải quyết và test/build/smoke qua; Verified/Released cần evidence môi trường/phát hành tương ứng.
