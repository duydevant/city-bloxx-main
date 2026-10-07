# C0–C2: trạng thái nghiệm thu

Cập nhật: 06/10/2026. Đây là trạng thái triển khai thực tế, thay cho các tỷ lệ ước lượng trước đó.

Visual fix sau feedback chơi thật: physics/ruleset chuyển sang 0.3.0. Bản trước còn lỗi camera recenter khi đáp và thiếu giai đoạn tiếp tải; các lỗi này đã sửa và bổ sung regression tests. Replay 0.2.0 không tương thích bị bỏ riêng, PB vẫn được giữ. C1 vẫn cần buổi playtest đầy đủ để chốt cảm giác.

Cập nhật độ khó: physics/ruleset hiện tại 0.4.0. Hai tầng đầu giữ nhịp dễ; từ tầng 3 tăng mượt tốc độ, biên độ cần cẩu và gió làm tháp lắc. Tầng 10/20/30 có swing nhanh hơn baseline khoảng 26%/58%/90%; biên độ tăng 230→280 world units và gió nền tối đa 22 world units. Perfect giảm sway do đặt lệch, không xóa gió theo chiều cao. Assist dùng một nửa cường độ tăng độ khó và vẫn chậm hơn Standard. Phase được tích phân theo tick, không đổi modulo period đột ngột; có cap sau khoảng 30 tầng. Không thay hitbox, không đổi vị trí ngang sau release.

| Phase | Trạng thái | Phần còn chờ |
|---|---|---|
| C0 | Hoàn thành phần nền móng và kiểm tra kỹ thuật | Benchmark thiết bị thật được thu cùng playtest C1 |
| C1 | Hoàn thành code và kiểm thử tự động | C1.6: 5–8 người chơi thật; đo FPS/load và chốt cảm giác trên điện thoại thật |
| C2 | Hoàn thành Quick Tower trên Web và Playable preview | Không còn tính năng C2 trong checklist chưa triển khai |

Không ghi C1 hoàn tất nghiệm thu sản phẩm khi chưa có người thử thật. YouTube SDK thật, certification, save checkpoint của Build City và backend leaderboard thuộc Y0/Y2/C3/W1, không nằm trong xác nhận này.

## C0 đã triển khai

- npm workspace: hai app và core/renderer/content, root commands; root `package-lock.json` là lockfile chính. Hai app lock cũ được giữ làm tham chiếu migration, không dùng để nâng dependency riêng. Migration đã chạy `npm install --package-lock-only --ignore-scripts --offline` thành công từ các bản pin hiện có.
- `RunConfig`, `DropInput`, `RunResult`, `RunRecord`, `GameSave`, capabilities và các port save/score/lifecycle/audio/clock/asset/analytics. Hai shell gọi chung scene, core và renderer.
- Core không dùng DOM, network, wall clock hay random toàn cục. Seed do adapter truyền; fixed tick 60 Hz; input chứa tick + sequence. Wave dùng phase nguyên và tọa độ quantize 0.001 world unit, normalized accuracy 0.001. Config/rules được freeze và version hóa.
- Interpolation cho block hiện tại lấy state tick trước; collision không phụ thuộc viewport hay FPS. Render sway dùng cùng hàm với collision. Wave parabolic xấp xỉ pendulum là lựa chọn prototype có chủ đích, có thể tune sau playtest.
- Golden fixture hiện tại `packages/city-bloxx-core/fixtures/quick-mixed-v4.json` chạy qua Node và Chrome; gồm combo hết hạn, sway cao, ba miss và release fraction. Fixture v2/v3 được giữ làm lịch sử. Không tuyên bố đã kiểm chứng mọi JS engine: Safari/Firefox nằm trong test thiết bị thật.
- Asset manifest có 21 file, kích thước, SHA-256, allowlist Web/Playable, budget từng file 2 MiB và tổng asset 15 MiB. Root build và direct app build đều kiểm manifest trước khi build. Runtime asset hiện ~3.94 MiB.
- Baseline dự kiến: Android tầm trung RAM 4 GB, Chrome portrait 390×844; iPhone/Safari nhỏ portrait 375×667; desktop Chrome landscape 900×430. Emulation hiện đã thử 390×844 và 900×430, không thay cho thiết bị thật.

## C1 đã triển khai

Điều chỉnh tỷ lệ dây theo feedback: chiều dài không tải bằng `pendulumLength / 1.15`; khi treo nhà dây dài hơn khoảng 15%. Khi pickup, chiều dài nội suy theo bán kính để không kéo dài quá mức. Physics, độ khó và replay 0.4.0 được giữ nguyên; đây là sửa geometry phần móc rỗng/chuyển tải. Tổng test hiện tại 23, gồm hai regression tests mới cho tỷ lệ dây và giới hạn trong lúc pickup.

- Swing → falling → settling (14 tick) → preparing (20 tick) → swing, hoặc miss → preparing/ended. Một input hợp lệ thả một block. Ba miss kết thúc lượt; không nhận drop trong giai đoạn chuyển tiếp.
- Gravity/overlap; Perfect/Great/Good/Risky; population/combo/streak; sway tăng theo lệch và chiều cao, Perfect giảm sway.
- Spawn đi theo camera khi tháp cao; camera có dead zone và dịch dần khi chuẩn bị/swing, giữ nguyên trong lúc rơi và đáp. Tầng đầu không recenter; test 40 tầng. Floor đầu tiên đáp đúng mặt đất, không còn lệch một tầng.
- Pendulum có quỹ đạo cung quanh pulley. Renderer dùng anchor pixel thật của PNG; dây vào mắt móc, tip móc nối hai dây nâng vào mái. Sprite floor crop phần body 256×128 và giữ đúng tỷ lệ 240×120 world units. Móc rỗng thu lên sau release; tầng mới chỉ xuất hiện sau khi đáp và thời gian settle.
- Render sway mỗi floor có weight cố định theo index, không đổi khi tăng số tầng. Khi thay amplitude ở impact, bias giữ offset liên tục rồi giảm dần. Vị trí load khi nhấn drop dùng đúng pose đã nội suy trên màn hình; fraction 0–1000 ghi trong input để replay tái tạo.
- Mouse/pointer/touch/Space/Enter; phím auto-repeat bị bỏ qua, pointer không chính bị bỏ qua; nút/menu không phát sinh drop xuyên vào arena.
- Tutorial ba input đầu, feedback impact/quality/miss, audio placeholder, sound toggle, reduced motion theo OS và nút trong game. Reduced motion giảm animation/rotation, giữ sway vật lý cần cho gameplay.
- Pause người chơi và lifecycle dừng game clock và RAF; resume không cộng thời gian đã pause. Cleanup hủy RAF, observer, listener và audio web; async load không dựng lại scene đã dispose.

## C2 đã triển khai

- Home Standard/Assist, result/retry/home, PB Standard và Assist riêng.
- Result có population, số tầng, accuracy trung bình `1 - normalized landing error`, Perfect, best streak, thời gian simulation và rating S/A/B/C/D. Rating có version và không dùng roof criterion cho Quick.
- Ghi seed/mode/assist/physics/ruleset/input tick+sequence+fraction/end tick/result. Replay tự mô phỏng lại input, không phát lại các outcome đã khai báo.
- Replay play/pause/resume/restart, last replay sau reload; guard bounds 4,096 input / 2 giờ. Run quá giới hạn vẫn cho chơi và lưu PB nhưng không lưu replay.
- Assist pendulum chậm hơn 1.5 lần và band chất lượng rộng hơn 1.5 lần. Đánh dấu unranked ngay từ đầu; không cập nhật Standard PB, không gọi ScorePort. Replay cũng không gọi ScorePort hoặc tăng runs.
- Save schema 2 migrate từ schema 1; Web migrate numeric PB alpha cũ. Chỉ giữ một replay, không tích lũy lịch sử vô hạn. Payload có version lạ hoặc lỗi đọc khiến phiên ở chế độ không ghi để bảo vệ save cũ. Lỗi ghi báo trên UI và có Retry save.
- Retry đồng bộ, không load lại image/bundle, không ads ở C2. Kết quả cũ là bản copy độc lập với lượt mới. Chỉ commit một lần ở kết thúc, save queue serialize các lần ghi.
- Playable bỏ force-ready trên timeout/error. Chỉ ready sau scene tương tác; nếu boot lỗi có Retry. Preview dùng mock SDK; không xem đây là chứng nhận SDK thật.

## Kiểm chứng

- Unit/acceptance: 21 tests, gồm 40 tầng, pause giữa fall, replay 30/60/120 FPS, golden fixture, Assist, migration, corrupt replay, sway và 30 commit. Năm motion regression tests kiểm tra release pose, tầng đầu không recenter, settle/preparing đúng thời điểm, sway không snap tại impact, nối móc/dây/roof và replay fraction. Ba difficulty tests đo swing trên tower thật 20 tầng, kiểm cap và mức tăng nhẹ hơn của Assist.
- Web lint/build và Playable typecheck/build/package check/zip.
- Chrome headless smoke trên hai production build: Node/browser golden result giống nhau; fixture v4 Standard đạt population 77, 8 tầng, accuracy 57.637%, end tick 1838. Có thêm screenshot liên tiếp hanging/falling/landed/next-load tại `tmp/c0-c2-qa/*-motion-*.png`.
- Thử held key + double pointer; replay pause/restart đúng result; replay không tăng runs; Assist không thay Standard PB; giả lập lỗi đọc/ghi storage có thông báo.
- 30 completed retries trên mỗi shell, đo heap sau GC. Báo cáo thực tế và screenshot nằm trong `tmp/c0-c2-qa/`; đây là kiểm tra leak cơ bản, không phải profiling điện thoại.
- Fake ScorePort xác nhận chỉ Standard submit; fake lifecycle xác nhận host pause/resume/dispose hủy/khởi động đúng RAF. SDK thật vẫn chờ Y0.
- Browser smoke chặn tải SDK bên ngoài để chủ động dùng mock preview trong môi trường offline. Đây không phải test network hay certification YouTube.

## Buổi playtest còn cần để chốt C1

Cho 5–8 người chưa chơi, không hướng dẫn bằng miệng. Mỗi người thử Standard trước rồi Assist, khoảng 10–15 phút.

| Người / thiết bị | Giây tới drop đầu | Hiểu cách thả? | Có cảm thấy hình lệch với collision? | FPS / load | Mức bực 1–5 | Tự retry? | Nhận xét |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |
| 6–8 nếu có | | | | | | | |

Mục tiêu: first drop dưới 10 giây từ khi tương tác được, không cần chỉ bằng miệng; pause/resize không nhảy kết quả; người chơi thấy dễ hiểu và muốn retry. Đo frame/load bằng browser profiler trên thiết bị thật, ghi p95 frame time và cold load. Mục tiêu 60 FPS Android baseline; nếu không đạt, tune/render tối ưu trước C3.

Biến tune nằm trong `packages/city-bloxx-core/src/rules.ts`: swing period/amplitude, gravity/max fall speed, overlap, quality bands, combo duration/bonus, sway gain/recovery/cap, cameraTopY, Assist multipliers, rating bands. Khi thay đổi scoring/physics phải đổi version và cập nhật golden fixture có chủ đích.
