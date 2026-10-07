# City Bloxx — checklist rà soát dự án

Cập nhật 07/10/2026. Phân biệt **code/kiểm thử đã xong** với **nghiệm thu sản phẩm/phát hành**. Web và Playable đang dùng chung Quick Tower + Build City; không có nghĩa đã hoàn tất toàn bộ roadmap.

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
- [x] Dây có tải dài nhất 229,8 (ngắn hơn 40% so với bản đầu), rút dần còn 165,5 ở tầng 50, cap 156,3 tại tầng 60. Dây rỗng chỉ 18 world units để móc sát puly; thay yêu cầu cũ tỷ lệ có tải/không tải 1,15.
- [x] Tốc độ tăng nhẹ theo mốc 0–60 tầng; chu kỳ đầu 4,44 giây, tầng 10 là 4,21, tầng 50 là 2,81. Giảm gió nền để xây cao dễ kiểm soát hơn.
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

### Ưu tiên 2 — C4: Daily và progression (chưa triển khai)

- [ ] Daily theo UTC date + schedule/content version, finite 20 tầng, local PB cho Playable.
- [ ] Daily missions khả thi theo unlock, reroll có giới hạn, achievements và claim idempotent.
- [ ] Mastery bốn class, XP/builder level, stats, Architecture Book.
- [ ] Cosmetic kiếm và trang bị được, không thay collision/score; bounded replay/save và rollover không phá active run.

### Ưu tiên 3 — hoàn thiện riêng từng nền tảng

**Web W0 (mới có shell Quick/City, chưa đủ W0):**

- [ ] Route/menu Quick/City/Daily hoàn chỉnh; guest-first; IndexedDB cho save/replay, navigation checkpoint.
- [ ] i18n/keyboard/accessibility/analytics, refresh/back/rotation/private-mode QA.

**Web W1/W2 (chưa triển khai):**

- [ ] Auth thật, database/cloud save, guest→account và xử lý conflict/revision.
- [ ] Run ticket, server resimulation/score validation, chống submit lặp/rate-limit.
- [ ] Leaderboard/replay/profile, soft-launch telemetry, retention/performance/error monitoring.

**Playable Y0 (adapter có, chưa audit/certification SDK thật):**

- [ ] Test ready/save/score/pause/resume trong host YouTube thật; quota/save errors; không lấy mock preview làm bằng chứng certification.

**Playable Y1/Y2 (chưa hoàn thành):**

- [ ] Tích hợp Daily/meta, rà dependency/external requests, startup/payload/memory.
- [ ] Test Suite, thiết bị thật, submission metadata/package và sửa lỗi review. Có zip chưa đồng nghĩa được duyệt/phát hành.

## 5. Quyết định cần người dùng soát

- [ ] Có giữ band Risky không? Nếu có, duyệt ngưỡng Good/Risky mới bên trên.
- [ ] Có muốn cơ chế sụp cả tháp hay chỉ rơi khối sai như hiện tại?
- [ ] Ưu tiên người nhảy dù/feel polish trước Daily như đề xuất?
- [ ] Art còn 12 building compact chưa gen/import; 8 ảnh người/dù đã hoàn thành. Tài liệu prompt: [v3](City_Bloxx_Art_Prompts_v3.0.md).

Nguồn ảnh building: `art/source/stack/compact-v3/`. Nguồn người/dù: `art/source/fx/population/default/`. Trạng thái kỹ thuật mới nhất: [PROGRESS](PROGRESS.md). Checklist này không tự đánh dấu các đầu việc tương lai là đã triển khai.
