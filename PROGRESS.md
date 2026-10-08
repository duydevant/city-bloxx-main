# City Bloxx — trạng thái hiện tại

Cập nhật 08/10/2026. Tài liệu này bổ sung các thay đổi mới hơn checklist C0–C2.

Checklist để rà soát đã xong/còn thiếu/thứ tự làm tiếp: [PROJECT_REVIEW_CHECKLIST](PROJECT_REVIEW_CHECKLIST.md).

## C4.0 — hoàn thành triển khai 08/10/2026

Save schema 4, stable run identity/sequence receipts, lifetime stats/history/replay pin, settings, base run XP settlement, recovery load và serial immutable save writes đã xong. Shared EN/VI catalog/menu dùng cho Web và Playable. 139/139 unit tests, lint/assets/boundaries, hai production builds, save evidence và Chrome smoke cả hai shell đều qua. Save mẫu 70 runs còn 50 summaries, giữ pending City v12/receipts/2.590 XP; envelope UTF-16 95.102 bytes dưới budget 256 KiB. Phase ở mức Implemented; Daily/missions/levels/cosmetics, server verification và actual-host/device/release gates vẫn riêng. Chi tiết: [C4.0](plan/01-C4.0-save-stats-history.md), [evidence](plan/evidence/C4.0-validation.json).

## Tuning mới — dây thu theo tầng, độ khó tới 50 tầng và icon UI

Lượt mới dùng physics/Quick `0.13.0`, City `build-city-7`. Chu kỳ một vòng ngắn thêm 10% so với 0.12 ở mọi tầng, cả Standard và Assist (còn 81% chu kỳ của 0.11). Dây giữ kích thước 0.12: dài nhất 206,82, rút dần theo số tầng đã đặt. Móc rỗng thu về mắt dây cách puly 18 world units sau 18 ticks (~0,3 giây). Cung ngang bằng 80% chiều dài dây để không vượt bán kính. Pha dao động tích phân liên tục, không nhảy khi tăng tầng.

| Tầng đã xây | Dây có tải (world units) | Một vòng dao động Standard | Gió nền thân tháp |
|---|---:|---:|---:|
| 0–2 | 206,8 | 3,60 giây | 0 |
| 10 | 196,5 | 3,41 giây | 1 |
| 20 | 186,1 | 3,09 giây | 2,5 |
| 30 | 173,7 | 2,76 giây | 4 |
| 40 | 161,3 | 2,49 giây | 5,5 |
| 50 | 148,9 | 2,27 giây | 7 |
| ≥60 | 140,6 | 2,12 giây | 8 |

- Nội suy giữa các mốc, cap ở 60 tầng. Tầng 10 chỉ nhanh hơn đầu lượt ~5,6%; giữ đường tăng độ khó, nhân chu kỳ 0.12 với 0,9. Assist giảm tốc và mức tăng thêm, cùng hình học dây và band chấm chất lượng.
- Miss ≥40% chỉ chấm một lần tại mặt phẳng tầng cao nhất. Nếu có phần chồng ngang (<100%), nhà va vào tầng đó, nảy nhẹ rồi trượt khỏi mép. Nếu không chồng ngang (≥100%), nhà tiếp tục rơi theo trục dọc và xét tầng dưới thực sự nằm trên đường rơi. Kiểm tra swept facade 144×120 gồm mặt trên/cạnh/dưới và chuyển động sway, tránh xuyên tầng khi rơi nhanh; góc xoay là hiệu ứng hình ảnh. Va nhiều lần không mất thêm mạng, không thêm tầng hay dân số. Va chạm có vòng lóe/bụi 0,4 giây, tối đa 8 hạt; Reduced Motion chỉ vòng lóe tĩnh. Nhà Miss rơi hết phần nhìn thấy hoặc đáp đất trước khi tải nhà mới; Miss mái cũng có hoạt ảnh rồi mới kết thúc.
- Các công trình City đang dở từ 0.7–0.12 giữ chuyển động/luật Miss cũ đến hết lượt để phục hồi đúng input. Fixture City 0.10/0.11/0.12 được kiểm tra khôi phục đúng vị trí/tầng/camera/dân số, kể cả lưu lại rồi mở tiếp. Lượt 0.13 đang va chạm cũng khôi phục đúng hoạt ảnh và diễn biến tiếp theo. Quick replay physics cũ không được phát dưới luật mới; PB, dân số và nhà đã nhận được giữ.
- HUD đổi ba dấu chấm thành ba tim vector: đỏ hồng còn mạng, viền xám rỗng khi mất; có nhãn EN/VI và không đổi độ rộng khi mất mạng. Web có favicon vector ba khối xếp tháp tại `app/icon.svg`.
- [UI Art Prompts v4](City_Bloxx_UI_Art_Prompts_v4.0.md) có ba prompt riêng, bbox cụ thể, kích thước export và tên/đường dẫn: favicon master 1024², hai tim 512² → runtime 64². Nguồn lưu trong `art/source/brand/default/` và `art/source/ui/default/`. PNG gen chưa được import; SVG hiện tại dùng được ngay.
- 116 unit tests qua, gồm tỷ lệ chu kỳ 90% so với 0.12 ở cả Standard/Assist, đường va chạm Miss trên/dưới/cạnh/đúng 100% và sway, mất một mạng, pause và restore khi đang va, Quick 50 tầng còn ba mạng, bốn tier City, migration City 0.10/0.11/0.12. Lint, build/package và Chrome smoke hai nền tảng qua, gồm 8 hạt va chạm/Reduced Motion, ảnh va mép và rơi, replay, save/resume, responsive EN/VI và population FX. Ảnh `tmp/c0-c2-qa/*-miss-1-impact.png`, `*-miss-2-sliding.png`. Cân bằng 40–50 tầng vẫn cần chơi thử với người thật; bot chỉ xác nhận có thể xây đúng luật.

## Polish mới — toolbar, responsive, render và Docker Web

- Nhãn Replay không phải nút: đổi “Xem lại” thành “Phát lại” để rõ đây là input ghi sẵn, không phải lượt chơi trực tiếp. Bản đồ dùng nhãn “Trung tâm”, không lặp lại tên chế độ. Reduced Motion giảm hiệu ứng phụ/rotation, không thay luật hay điểm; có tooltip giải thích.
- Web không render nút EN/VI trong game, dùng header để đổi ngôn ngữ; Playable không có header nên vẫn giữ. Mobile luôn có dòng tên + chế độ, dòng dưới chứa toàn bộ nút toolbar không wrap. Nút giảm chuyển động được dành nhiều chiều ngang hơn.
- Kết quả Quick/City dùng 6 thẻ label/value, 2 cột trên portrait; trạng thái mái/nhà cũ là đoạn riêng. Landscape thấp dùng hai vùng tóm tắt/thống kê. Hướng dẫn Web và trong game dùng heading + bullet, 6 phần ngắn; các quality band tách từng dòng.
- Combo chuyển thành overlay trên arena: hiện/ẩn không đổi kích thước canvas. Hint giữ chiều cao tối thiểu 2 dòng. Mỗi frame tái sử dụng một snapshot cho paint/previous; schedule đọc phase trực tiếp. Checkpoint City chỉ thay pending, không serialize toàn bộ lots ngay lúc bấm thả.
- Ảnh tầng/crane/hook được crop và rasterize vào cache theo viewport/DPR một lần sau load/resize; animation dùng canvas nhỏ thay PNG lớn. Decode ảnh xong trước khi dùng. Quick/Replay chờ ảnh người/dù ở màn chuẩn bị trước khi chạy, không giải mã bộ ảnh mới giữa swing. Không sửa PNG nguồn, physics, band hay save version.
- Docker Web có `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.env`/`.env.example` ở root. Port, bind, image, restart, healthcheck và public config đều lấy từ `.env`; mặc định Web `http://localhost:56789/play` (cập nhật 08/10). Builder bật Next standalone và tracing root monorepo; chạy local vẫn dùng `next start` bình thường. Xem [DOCKER_WEB](DOCKER_WEB.md) để deploy máy chủ trực tiếp qua IP hoặc qua reverse proxy/domain.
- Reduced Motion vẫn nội suy vị trí swing/fall (chỉ bỏ rotation/hiệu ứng phụ), tránh chuyển động theo nấc và giữ fraction thả đúng vị trí đang thấy.
- 104/104 unit tests, lint và build/package hai nền tảng đã qua. Browser smoke kiểm tra toolbar, stats Quick/City EN/VI, 6 trang guide EN/VI ở 320×568, 390×844, 900×430, header switch không reset run, combo không resize arena. Screenshot/report trong `tmp/c0-c2-qa/`.
- Profile RAF thật riêng (không fake clock), Chrome headless DPR 2: CPU phần lớn dưới 1 ms, khoảng cách RAF ~16,7 ms; vẫn có spike ~20 ms. Không vẽ PNG lớn trên đường animation đã warm; không thấy long task ≥50 ms ở mẫu 4,5 giây. Đây không phải GPU/display FPS hay kết luận đã hết khựng trên máy người dùng; cần kiểm tra lại bản production trên thiết bị thực.
- `docker compose config --quiet` đã qua. Chưa build/run container: môi trường chặn Docker config/context và pipe engine (`Access denied`/`permission denied`). Không đánh dấu Docker runtime đã nghiệm thu.

## Cập nhật mới nhất — hướng dẫn, EN/VI và C3.8

- Web có `/guide/build-city`; cả Web/Playable có hướng dẫn 6 trang trong menu. Home/auth/profile/404, title, menu, HUD, canvas feedback và nhãn dân số hỗ trợ Anh–Việt. Đổi ngôn ngữ giữa lượt không tạo run mới hay mất tiến trình; Playable lấy ngôn ngữ mặc định từ host/SDK, nút EN/VI cho phép đổi trong phiên.
- Tầng móng của lượt mới đặt tại vị trí thả, không chấm chất lượng, không mất mạng, không cộng Perfect/streak/combo; nhận dân số cơ bản và không tham gia accuracy. Combo bar chỉ hiện khi combo còn hoạt động, không giữ một thanh rỗng.
- C3.8 đã triển khai: hoàn thành thân City thì người/dù đi vào tầng trên trước bảng kết quả, khoảng 3,6 giây; Quick Tower có burst sau tầng được chấm đáp thành công. Reduced Motion chỉ hiện +dân số. Không cộng dân số/save thêm qua animation; reload kết quả không phát lại hiệu ứng. Bộ 8 PNG của cả 4 class đã có, kiểm tra RGBA và import nguyên bản vào hai public/game; renderer crop/căn harness riêng và cache sprite nhỏ, không sửa file nguồn.
- Số sprite đại diện theo class Residential/Industrial/Office/High-rise: Perfect 4/6/8/10; Great 3/4/6/8; Good 2/3/4/6; Risky 1/2/3/4; Miss không tạo burst. City completion dùng chất lượng mái nếu đáp, hoặc tầng thân cuối nếu trượt mái nhưng đủ thân; công trình chưa đủ thân không có completion burst. Sprite không tương đương 1 dân. Người 24×48 world units, tán dù khoảng 72–80 world units; mắt dây nối harness.
- Kiểm chứng: 100/100 unit tests, lint, Web build, Playable package và Chrome smoke cả hai nền tảng qua. Browser kiểm tra đổi ngôn ngữ giữa lượt không đổi số tầng/dân, móng không combo, tầng Perfect mới hiện combo, 4 loại dù/người/Reduced Motion/kết thúc FX, hướng dẫn EN/VI và site Home/auth/profile/404. City map EN/VI không scroll ở 320×568, 390×844, 900×430. Chưa đo GPU/FPS điện thoại thật, chưa chứng nhận SDK thật; animation count-up số chưa triển khai.

Layout no-scroll 07/10/2026: /play khóa chiều cao viewport, ẩn footer riêng khi chơi, bỏ minimum height 480px; arena flex-basis 0 tránh canvas kéo giãn layout. Menu City bỏ overflow:auto, grid 25 ô co theo phần chiều cao còn lại, màn ngang chia map/nút thành hai cột và màn nhỏ dùng spacing/font gọn. Chrome smoke Web/Playable kiểm tra 390×844, 320×568, 900×430: document không overflow dọc/ngang, menu không scroll, nút nằm trong panel và ô map cao tối thiểu 24px. Build hai nền tảng và browser smoke qua; các trang Web khác vẫn scroll bình thường.

Polish 07/10/2026: thêm Double/Triple Perfect và Perfect ×N (Canvas pulse/tia vàng giới hạn, Reduced Motion chỉ chữ); mái không cộng streak. Bỏ brightness filter toàn arena khi đáp, cache sky theo viewport/DPR, tránh ghi lại HUD không đổi. City map thêm tooltip tọa độ/lý do chặn và cảnh báo không có ô trống hợp lệ; click/chạm mới chọn ô, không phải hover. Office vẫn cần cả Residential và Industrial trong 4 ô liền cạnh, không tính chéo. C1.5a–c trong development plan phân biệt phần đã triển khai và adaptive music/FPS điện thoại thật còn thiếu; chưa cam kết loại bỏ mọi giật trên thiết bị thật.

Kiểm chứng lượt polish: 80/80 unit test, lint, build Web + Playable package và Chrome browser smoke đều qua. Browser kiểm tra nhãn Double/Triple/×6, số hạt tăng có giới hạn và Reduced Motion không có hạt; screenshot `tmp/c0-c2-qa/*-perfect-streak.png`, báo cáo `tmp/c0-c2-qa/browser-report.json`. Timing trong report chỉ là CPU submit Canvas headless, không phải FPS trình bày/GPU hoặc bằng chứng hiệu năng điện thoại thật.

- C0: nền móng và kiểm tra kỹ thuật đã xong.
- C1: core feel đã triển khai; còn C1.6 playtest 5–8 người và đo FPS/load trên điện thoại thật.
- C2: Quick Tower, result, replay, Standard/Assist và save đã triển khai trên Web và Playable preview.
- C3: Build City đã triển khai dùng chung hai nền tảng; xem phạm vi và kiểm chứng bên dưới. Art compact mới đang chờ generate/import và playtest người thật.
- C4 — Daily/missions/mastery/cosmetics chưa bắt đầu. C3.8 người nhảy dù đã có; còn playtest feel, count-up/polish bổ sung và benchmark điện thoại thật.

## Logic hiện tại

Physics 0.10.0, Quick ruleset 0.10.0, City ruleset build-city-4, city rating city-rating-1. Body 144×120 world units (1,2:1), hẹp hơn 40% so với 240×120. Dây có tải 229.8 world units, ngắn hơn 40% so với 383; dây không tải bằng chiều dài có tải / 1.15. Biên độ đu 200→220; tốc độ và gió vẫn tăng theo chiều cao.

Sau tầng móng, Perfect lệch ≤5% (≤7,2 world units); Great >5–15%; Good >15–30%; Risky >30–<40%; Miss ≥40% (≥57,6 world units), đúng 40% cũng trượt. Kiểm tra raw error với threshold quantized, không làm tròn sai lệch để thăng band. Standard/Assist/City lượt mới cùng band; Assist chỉ chậm hơn và có ramp/gió nhẹ hơn, không nới band. Không tự căn nhà; chỉ khối đang thả trượt, chưa có cơ chế cả tháp sụp.

PB giữ nguyên; replay cũ không tương thích bỏ riêng. Fixture hiện tại: `packages/city-bloxx-core/fixtures/quick-mixed-v10.json`. Checkpoint City 0.7/0.8/0.9 giữ scoring/móng/band cũ đến hết lượt qua legacy flags, không mất nhà đang xây; lượt mới dùng luật mới. Prepare vẫn chờ đủ khoảng trống cho cung đu của tầng mới, không spawn trong tower; checkpoint legacy giữ timing cũ.

## C3 đã triển khai

1. Bản đồ 5×5 (25 ô), chọn ô và loại nhà, highlight vị trí hợp lệ và lý do chưa đủ điều kiện.
2. Bốn loại nhà, mục tiêu 10/20/30/40 tầng, mái nhà, rating và mở khóa.
3. Xây dở, hủy, xây lại giữ nhà cũ, phá nhà; runId ngăn cộng kết quả hai lần.
4. Commit đồng bộ ô đất/dân số/inventory/stats; checkpoint sau mỗi tầng để reload khôi phục được.
5. Migration và bảo vệ save; test adjacency góc/cạnh/giữa, rebuild, zero-floor và reload lúc result/placement.

Save payload schema 3 migrate từ 1/2, giữ key Web cũ và envelope YouTube version 1. Checkpoint chứa config/tick/input fraction, khôi phục bằng deterministic re-simulation; lưu sau drop, mỗi kết quả tầng, pause/pagehide và cuối tower. Pending kết quả chờ nhận cũng được lưu, không tự commit. Chỉ commit runId đang pending một lần; zero-floor không chiếm đất hoặc thay nhà cũ. Dân số thành phố được tính từ lot hiện tại, không cộng chồng khi rebuild.

Blue bất kỳ; Red kề Blue; Green kề Blue+Red; Yellow kề Blue+Red+Green, chỉ bốn hướng. Hoàn thành và nhận một nhà mở class tiếp theo; phá nhà không khóa lại. Ba miss trước mái có thể giữ tower dở, không completion unlock. Mái chỉ thử một lần; miss giữ thân hoàn thành nhưng không roof bonus. Prototype roof bonus = population cơ bản của class ×5×accuracy mái; body population 10/20/30/40 theo class. Đây là tuning v1, không phải công thức gốc đã xác minh.

## Kiểm chứng và phần còn chờ

- 78 unit/acceptance tests: gồm 8 sprite tests kiểm alpha của từng hàng/body edges cho base/mid bốn class; biên Perfect ±7,2/±7,201; biên miss ±57,599/±57,6/±57,601 cho Standard/Assist/City; migration checkpoint cũ; bốn tier/mái, 40 tầng xây nhanh/camera, adjacency, restore, commit/rebuild/cancel/demolition/migration/catalog/score guard. Test bot tháp cao dự đoán vị trí đỉnh ở lúc đáp qua simulation, không chỉ canh lúc thả và không sửa state game để xây.
- Web lint/build, Playable typecheck/build/package; bundle tổng ~4.00 MiB, startup ~1.41 MiB.
- Chrome headless hai production shell: Quick/replay/Assist còn hoạt động; city 25 ô, khóa class, reload sau 2 tầng rồi xây tiếp, mái, pending result reload, accept, giữ nhà cũ khi cancel rebuild, phá nhà; score chỉ Quick Standard. Báo cáo/screenshot ở `tmp/c0-c2-qa/`.
- Chưa coi headless/emulation là playtest trên điện thoại thật hoặc certification YouTube SDK thật. Chưa có cloud/backend leaderboard.
- Đã sửa khe hở giữa các tầng do transparent padding: `renderer/src/sprites.ts` chứa crop facade đo riêng cho base/mid từng class, tất cả map kín 144×120 world units. PNG nguồn/runtime không bị sửa; không đổi physics/checkpoint/hitbox. Đã kiểm ảnh ghép bốn tầng Industrial/Office trên cả hai shell (`*-industrial-seams.png`, `*-office-seams.png`). Viền kiến trúc trong bản vẽ vẫn được giữ, không phải khe trong suốt.
- Art hiện tại được giữ nguyên và thu gọn trong renderer; 12 ảnh compact cần gen theo [prompt v3](City_Bloxx_Art_Prompts_v3.0.md), lưu `art/source/stack/compact-v3/`, rồi QA/căn/export và đổi crop/hash. Không chạy export v001 để thay art này.

Sau C3 là C4 (Daily/missions/mastery/cosmetics). Nhánh Web còn W0/W1/W2; Playables còn Y0 tích hợp/kiểm chứng SDK thật, Y1 và Y2 đóng gói/certification. Preview không thay cho certification.

## C3.8 — population celebration đã triển khai

Đã import 8 PNG người/dù tách riêng theo bốn class từ `art/approved/fx/population/default/`; palette/trang phục gắn với nhà tương ứng. Xem quy cách và tình trạng thực tế ở phần cập nhật mới nhất bên trên, cùng [Art Prompts v3](City_Bloxx_Art_Prompts_v3.0.md).

Build hiện tại giữ nhà khi thân đủ tầng, người/dù bay vào tầng trên và hiện +population rồi tới kết quả; tối đa 10 sprite đại diện. Reduced Motion chỉ chữ, effect clock dừng theo pause/lifecycle, reset khi đổi scene; reload pending result không phát lại thưởng. Core tính dân số trước FX, commit thành phố vẫn một lần khi nhận nhà. Dùng chung Canvas renderer cho Web/Playable. Count-up số, nút skip riêng và benchmark điện thoại thật là phần polish còn chờ.
