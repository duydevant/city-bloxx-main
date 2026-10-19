# City Bloxx — checklist rà soát dự án

Cập nhật 08/10/2026. Phân biệt **code/kiểm thử đã xong** với **nghiệm thu sản phẩm/phát hành**. Web và Playable đang dùng chung Quick Tower + Build City; không có nghĩa đã hoàn tất toàn bộ roadmap.

## Polish bổ sung mới nhất

- [x] Web đổi ngôn ngữ từ header, bỏ nút trùng trong game; Playable giữ nút.
- [x] Toolbar mobile: tên/chế độ một dòng, toàn bộ nút một dòng dưới; nhãn replay “Phát lại”.
- [x] Thống kê Quick/City dạng label/value, hướng dẫn chia 6 phần/bullet; bố cục EN/VI portrait/landscape.
- [x] Combo overlay không resize canvas; cache sprite tầng/crane/hook, decode/load ảnh phụ trước khi chạy Quick/Replay; giảm snapshot allocation per frame.
- [x] Docker Web + cấu hình root `.env`; compose config hợp lệ; hướng dẫn chạy trong `DOCKER_WEB.md`.
- [ ] Build/run Docker thực tế (bị chặn quyền engine ở môi trường hiện tại).
- [ ] Xác nhận hết khựng trên máy/trình duyệt của người dùng. Profile headless/CPU không thay đo GPU/thiết bị thật.

## 1. Luật mới để soát

- [x] Nhà rộng 144, cao 120 world units, tỷ lệ 1,2:1; hitbox hẹp hơn 40% so với bản 240×120.
- [x] Dây có tải ngắn thêm 10% so với 0.11: dài nhất 206,8, rút dần còn 148,9 ở tầng 50, cap 140,6 tại tầng 60. Dây rỗng vẫn chỉ 18 world units để móc sát puly; thay yêu cầu cũ tỷ lệ có tải/không tải 1,15.
- [x] Chu kỳ rút thêm 10% ở mọi tầng so với 0.12: đầu 3,60 giây, tầng 20 là 3,09, tầng 30 là 2,76, tầng 50 là 2,27. Áp dụng cả Standard/Assist; tăng tốc từ từ theo mốc 0–60. City đang xây dở giữ chuyển động cũ đến hết lượt.
- [x] Miss chạm tầng trên thì nảy/trượt khỏi mép; lệch ≥100% bỏ qua tầng không chạm và xét các tầng dưới theo đường rơi. Có va cạnh, sway và va đất, vòng lóe/bụi; chỉ mất một mạng mỗi lần thả. Miss mái diễn hoạt ảnh trước kết quả; checkpoint 0.7–0.12 giữ luật cũ, checkpoint mới khôi phục cả trạng thái va chạm.
- [x] Tim vector đầy/rỗng cho số mạng, favicon vector và bộ 3 prompt PNG có bbox/đường dẫn: `City_Bloxx_UI_Art_Prompts_v4.0.md`.
- [ ] Gen/import favicon PNG + hai PNG tim theo v4 nếu muốn thay bộ vector hiện tại.
- [x] Perfect khớp 95–100%, tức lệch ≤5% bề rộng (≤7,2 world units).
- [x] Lượt mới: **lệch ≥40% bề rộng thì miss** (≥57,6 world units). Lệch <40% mới có thể đáp; đúng 40% cũng trượt. Cả Quick Standard, Assist và City dùng cùng ngưỡng va chạm.
- [x] Sai lệch tính tại thời điểm va chạm với đỉnh đang lắc, không tính tại thời điểm bấm thả.
- [x] City đang xây từ 0.7/0.8/0.9 giữ luật cũ đến hết lượt để khôi phục checkpoint đúng; nhà đã đặt, dân số và PB không bị xóa khi cập nhật.
- [x] Band đã được người dùng duyệt và áp dụng: Perfect ≤5%, Great >5–15%, Good >15–30%, Risky >30–<40%, Miss ≥40%. Standard/Assist/City lượt mới dùng cùng band; Assist trợ giúp bằng chuyển động, không nới band.
- [x] Móng lượt mới không chấm chất lượng/mất mạng/combo, không tính accuracy; giữ vị trí thả và nhận dân số cơ bản.
- [x] Trang hướng dẫn City và UI/game hỗ trợ EN/VI; đổi ngôn ngữ giữa lượt không reset. Thanh combo ẩn khi chưa hoạt động.
- [ ] Nếu muốn **cả tháp sụp**, cần chốt luật riêng (độ nghiêng, trọng tâm, điều kiện đổ, tổn thất). Hiện miss chỉ làm rơi khối đang thả; tháp không tự sụp.

## 2. Những phần đã hoàn thành kỹ thuật

### C0 — nền móng

- [x] npm workspace, core/renderer/content dùng chung, hai shell Web/Playable.
- [x] Simulation fixed tick, seed, input/fraction, version hóa rules/physics và kiểm tra replay.
- [x] Save/score/lifecycle/audio adapters và asset manifest/hash/budget check.
- [x] 29 asset runtime: 21 bộ cũ + 8 người/dù mới của cả bốn loại nhà đã import cho cả hai app; 12 building compact chưa có.

### C1 — gameplay core đã có code

- [x] Swing → falling → settling → preparing; ba miss kết thúc lượt.
- [x] Drop tại đúng vị trí hiển thị, không tự căn giữa tầng đầu, không tạo tầng mới trước khi tầng cũ đáp.
- [x] Crane/cable/hook/slings nối với mái; camera follow và sway không nhảy tại impact.
- [x] Crop body riêng từng PNG base/mid để bỏ khoảng trong suốt, nhà gạch/Office/các class ghép tầng sát nhau; giữ hitbox/physics.
- [x] Khi xây nhanh/tháp cao, chỉ mở drop tầng tiếp sau khi camera tạo đủ khoảng trống; không spawn trong tower.
- [x] Độ khó tăng theo chiều cao, Assist, pause/resume, touch/mouse/keyboard, giảm chuyển động.
- [x] Population/combo/streak, Perfect/Great/Good và feedback; audio hiện là placeholder.

### C2 — Quick Tower

- [x] Home, Standard/Assist, result/retry/PB và thống kê.
- [x] Last replay, play/pause/restart, kiểm tra kết quả deterministic.
- [x] PB Standard/Assist tách riêng; replay/Assist/City không gửi score Quick chuẩn.
- [x] Save, migration, bảo vệ dữ liệu cũ khi lỗi đọc, thông báo lỗi ghi và retry.

### C3 — Build City

- [x] Downtown 5×5, chọn ô và class, highlight vị trí hợp lệ/lý do thiếu điều kiện.
- [x] Bốn loại nhà 10/20/30/40 tầng, mái là drop riêng, finite rating/roof bonus và unlock.
- [x] Adjacency bốn hướng: Blue bất kỳ; Red kề Blue; Green kề Blue+Red; Yellow kề cả ba.
- [x] Tower dở, zero-floor không chiếm ô, cancel/rebuild giữ nhà cũ đến khi nhận kết quả, phá nhà có xác nhận.
- [x] Commit một lần theo runId, dân số tính từ lot, không cộng chồng khi rebuild.
- [x] Checkpoint sau drop/floor/pause/kết thúc, reload/resume và pending result chờ nhận.
- [x] Save schema 3, migrate 1/2, unknown-skin fallback, validation/bảo vệ city khi dữ liệu lỗi.

### Tài liệu/art/kiểm thử

- [x] Plan shared/Web/Playable và checklist tiến độ.
- [x] 12 prompt building compact (mid/base/roof ×4), kích thước vật thể/bbox/tên file/đường dẫn.
- [x] 8 prompt population (người/dù ×4), trang phục/palette theo class, bbox/anchor và scale ghép.
- [x] Unit/acceptance cho core, bốn tier, replay/save, checkpoint/transactions và biên Perfect/miss.
  - 78 tests; 8 tests alpha/seam của base/mid, biên miss 40% kiểm cả trái/phải và Standard/Assist/City; 40 tầng/camera thử bằng bot dự đoán collision.
- [x] Production build/package hai app; Chrome headless smoke cho Quick và City, input/storage/lifecycle/score guards.

## 3. Các phần đang có nhưng phải hoàn thiện

- [ ] **C1.6 nghiệm thu feel:** playtest 5–8 người chưa biết game; đo first drop/retry/frustration, chỉnh tốc độ và độ lắc theo dữ liệu.
- [ ] **Benchmark thật:** Android/iPhone, Chrome/Safari, FPS/load/memory, portrait/landscape. Headless không thay cho điện thoại thật.
- [ ] **Art building compact:** người dùng gen 12 PNG, QA alpha/body/seam, căn đúng bbox, import cả hai app, đổi crop/manifest/hash. Hiện renderer vẫn dùng crop ảnh cũ và thu gọn hình.
- [x] **Art population:** 8 PNG RGBA đã có, import nguyên bản và QA hình trong renderer cả hai shell; crop/anchor/harness riêng theo class, cache sprite nhỏ. Bản nguồn giữ nguyên ở art/approved/fx/population/default với `_v001`.
- [ ] **Âm thanh thật:** thay beep/placeholder bằng SFX đồng bộ drop/impact/Perfect/miss/roof/nhận dân số; mute/lifecycle vẫn phải đúng.
- [ ] **UI/UX:** làm rõ quality/accuracy, class unlock, trạng thái lưu thành công/thất bại và nhà dở; rà accessibility/keyboard và menu dài trên điện thoại.
- [ ] **Balance:** population/roof bonus/rating/unlock/combo là tuning prototype; cần playtest, không coi là công thức game gốc.

## 4. Thứ tự công việc tiếp theo đề xuất

### Ưu tiên 1 — polish C3.8 trước C4

1. [ ] Nhận và QA 12 building compact. 8 population đã xong.
2. [x] Animation hoàn thành nhà: giữ tower, người/dù theo class bay vào tầng trên và hiện +population; Reduced Motion chỉ chữ. Count-up số là polish riêng chưa triển khai.
3. [ ] Tách visual count-up khỏi giá trị core/commit; không cộng dân số lần hai khi replay/reload/skip.
4. [x] Giới hạn người đại diện tối đa 10, stagger 0,12 giây; không một sprite cho từng người dân.
5. [x] Reduced-motion, pause theo lifecycle, cleanup khi đổi scene; kết quả cũ không phát thưởng lại. Nút skip riêng chưa có, là polish tùy chọn.
6. [ ] SFX/FX mái/nhận nhà/Perfect/miss, rồi test cả Web và Playable trên điện thoại thật.

### Ưu tiên 2 — C4–C7, W0–W1, Y0–Y2 & Soft Launch (đã hoàn thành kỹ thuật 19/10/2026)

- [x] **C4.0–C4.3**: Save schema 4, thống kê/lịch sử 50 lượt, Daily Tower (`daily-v1`) + chuỗi ngày UTC, Builder Level `1–50`, Mastery 4 class `1–20`, 15 nhiệm vụ ngày + 20 thành tựu, bộ trang bị Classic Brick 19 món & Sổ kiến trúc ([Evidence C4.3](plan/evidence/C4.3-validation.json)).
- [x] **W0 & W1**: 8 trang nội dung Web EN/VI responsive, IndexedDB save, Auth thật + Cloud Save CAS + Server-authoritative Daily/Run Ticket + Worker Pool Resimulation + Keyset Leaderboards + Admin Moderation + Backup/Restore ([Evidence W0](plan/evidence/W0-validation.json), [Evidence W1](plan/evidence/W1-nest-validation.json)).
- [x] **Y0–Y2 & Soft Launch (08)**: Tích hợp YouTube Playables SDK (`firstFrameReady`, `gameReady`, lifecycle/audio pause, save envelope UTF-16 `<= 256 KiB`, score retry backoff), đóng gói `dist.zip` (`14.56 MiB <= 20 MiB`), và route nhúng `/embed` kèm `PortalHost` SDK + Feature Flags ([Evidence Y0–Y2](plan/evidence/Y0-Y2-validation.json), [Evidence 08](plan/evidence/08-soft-launch-validation.json)).
- [x] **C5 — Districts & Landmarks**: Quận Harbor `5×5`, biểu tượng Tháp Đồng hồ Cảng (`dock_clock_tower`), 6 cấp tiến hoá đô thị (`Village` → `Megacity`), `GameSave` schema 5 ([Evidence C5](plan/evidence/C5-validation.json)).
- [x] **C6 — Challenges, Replay & Social**: Chế độ One Drop v1 + biểu đồ nhiệt 40 bin, Replay tốc độ `0.5×..4×` + tua mốc thả, Personal Ghost, Hall of Fame (5 ghim) + Skyline Album (3 ảnh chụp), chia sẻ tháp/hồ sơ công khai/Beat This Tower ([Evidence C6](plan/evidence/C6-validation.json)).
- [x] **C7 — Weekly Contracts, Modes bổ sung, Events/Season, LiveOps & Adaptive Audio**: Hợp đồng tuần Thứ Hai UTC, Perfect Rush (60s), Skyline Sprint (20 tầng + phạt 5s/Miss), Sự kiện Mùa đông (14 ngày), Mùa giải Miễn phí (42 ngày, 20 bậc), dịch vụ cấu hình Web LiveOps (`/content/active` TTL 15 phút + audit/rollback/kill switch) và nhạc nền thích ứng 4 lớp theo combo `3/6/10` ([Evidence C7](plan/evidence/C7-validation.json)).

## 5. Các cổng vận hành / phần cứng thực tế giữ riêng

- [ ] Playtest người thật (5–8 người) và đo GPU/FPS trên thiết bị di động vật lý (Android/iPhone).
- [ ] Upload gói `dist.zip` lên YouTube Playables Developer Portal và ký duyệt trên thiết bị thật.
- [ ] Cấu hình tên miền/TLS/SMTP thực tế khi triển khai máy chủ Production công khai.

Nguồn ảnh building: `art/source/stack/`. Nguồn người/dù: `art/source/fx/population/default/`. Trạng thái kỹ thuật mới nhất: [PROGRESS](PROGRESS.md).
