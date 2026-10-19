# C6 — One Drop, replay nâng cao, ghost và social Web

Trạng thái: Implemented — hoàn thành triển khai (C6.1 + C6.2 + C6.3). Dependency: soft launch; public/share/verification cần W1. GDD: 27, 40–41, 43, 47–49, 52–53.

## 1. Chia release nội bộ

1. C6.1: One Drop personal + heatmap cơ bản.
2. C6.2: replay timeline/speed/seek + personal ghost.
3. C6.3: Hall of Fame/Skyline Album + public/share/Beat This Tower Web.

Không chat/friends/realtime, không One Drop global board trong release đầu. Shared challenge/replay dùng trên Playable nhưng Web-only services bị exclude khỏi bundle.

## 2. One Drop v1

- Prebuilt target tower gồm bốn body Residential thẳng, top center tại world X=420, phase/sway từ challenge seed.
- One scored body block thả vào target. Đây không phải foundation của lượt thường: không miễn chấm lần thả đầu tiên.
- Một input duy nhất; success/Miss có full collision/fall animation hiện hành; không có roof hoặc thêm life retry trong cùng attempt.
- Daily UTC seed riêng `one-drop-v1|date`, retry không giới hạn; class City unlock không liên quan.
- Kết quả: quality, signed normalized error, absolute error, population biểu diễn theo scoring v1; personal best theo absolute error thấp nhất, rồi duration ticks thấp nhất.
- V1 chỉ personal skill stats/challenge achievements về sau; không XP, City placement hoặc Quick PB, tránh farming một drop thành completion tower.

Tasks:

- [x] Dedicated versioned challenge config/preset trong content; preset tạo từ trusted core recipe, không deserialize arbitrary client tower state.
- [x] Mode dispatcher/validator cho một input; giữ riêng yêu cầu min input Quick/finite.
- [x] Result/history ghi preset/version/seed, không tính bốn tầng target là tầng người chơi đã xây.
- [x] Menu/guide giải thích one shot; retry tạo identity mới, replay không tạo reward.
- [x] Miss ≥100% có thể chạm lower facade/ground theo engine, không force top collision khi không overlap.

## 3. Replay viewer và heatmap

- [x] Controls 0,5×/1×/2×/4×, play/pause/restart, drop markers, seek-to-drop và result boundary.
- [x] Seek re-sim từ start hoặc bounded checkpoint cache trong viewer; không sửa replay input/state để nhảy nhanh.
- [x] Cache viewer-only, tối đa 16 snapshots và ≤16 MiB; không persist cả snapshots vào SDK save.
- [x] Playback speed chỉ đổi số tick simulation/real time; collision/result giữ deterministic.
- [x] Unsupported version giữ summary và giải thích, không đoán bằng luật hiện tại.
- [x] Heatmap dùng scored body errors, signed convention trái/phải; bins 5% từ -100% đến +100%, overflow Miss ở hai bin biên với count riêng. Foundation/roof loại ra; filter Assist/mode.
- [x] Heatmap history window ghi rõ số mẫu, không gọi là lifetime nếu chỉ giữ 50 summaries/errors. Lifetime totals giữ riêng C4.0.

## 4. Personal ghost

Ghost đầu chỉ là marker release/landing timing/vị trí từ một PB supported cùng seed/config/version, không render tower thứ hai. Quick có PB khác seed thì không ghost trực tiếp: phải chọn retry same-seed challenge mới hoặc hiển thị unavailable.

Không dùng ghost input thay người chơi, không nhận ghost event vào stats/reward; reduced motion bỏ phụ pulse nhưng marker rõ. Tối đa một ghost, không additional main-loop simulation mỗi frame nếu có thể precompute markers trước start.

## 5. Hall of Fame / Skyline Album

- Hall of Fame tối đa năm pinned summaries; nằm trong 50 history slots nhưng protected khi prune. Chỉ ba replay full được retain như C4, không hứa cả năm đều xem lại.
- Skyline Album tối đa ba snapshot của selected district: 25 lots, class/height/population/rating/skin IDs, landmark và timestamp; không ghi toàn bộ save.
- Snapshot không trở thành playable save/achievement input. Capture không cấp reward; thay slot cần confirm.
- Local/SDK Album không lưu PNG base64; render snapshot theo asset catalog lúc xem. Web có thể generate share PNG khi user yêu cầu.

## 6. Web public/share/Beat This Tower

- [x] `PublishedTower` opt-in từ verified Quick Standard/Daily có supported replay; City/Album có share image nhưng không competitive verified City board.
- [x] `/towers/[id]`, `/players/[id]`, `/challenges/[id]`: public data curated, không email/cloud payload.
- [x] `POST /towers/publish`, `DELETE /towers/[id]`: ownership required, publish/revoke idempotent; revoke tắt challenge/public access tương ứng.
- [x] Public profile display name 3–24 ký tự, validated/moderated; generated handle mặc định, opt-in profile, report/disable route trước public rollout.
- [x] Share card PNG 1200×630: server draw tower preview + typeset EN/VI text, mode/population/height/version. Không dùng AI gen ảnh thống kê có số giả.
- [x] Beat This Tower phát server ticket cùng seed/config/version, không cùng account replay; ranked eligibility theo W1 verifier.
- [x] Challenge winner theo population và tie-break W1; báo version retired/unavailable thay chạy ruleset khác. Link không reset pending City/Daily khi chưa confirm.
- [x] Public replay download có limits/rate limiting; sensitive metadata như precise user location/device không public.

Playable không render link share/login/profile, không gọi publish APIs. Hall/Album/personal challenge vẫn dùng được.

## 7. Tests / DoD

- [x] One Drop một input được chấm, foundation ordinary vẫn miễn; seeded target không XP/floor count.
- [x] Same replay result ở mọi speed/seek; pause/restart không phát reward; corrupted/version mismatch reject.
- [x] Ghost same config validation, seed mismatch unavailable, không tác động score/perf.
- [x] Pins/prune/replay quota, three Album snapshots/save size; no base64 persistence.
- [x] Publish auth/ownership/revoke/moderation/private data, challenge duplicate ticket và tamper.
- [x] Share PNG data khớp verified result, EN/VI/long name không overflow.
- [x] Both platform smoke/device profile và Playable dependency checks.

DoD theo từng subrelease: personal challenge/replay hoàn chỉnh; public rollout chỉ sau moderation/privacy/verification gate. Realtime/async duel nhiều vòng còn backlog.

## 8. Evidence hoàn thành C6 (19/10/2026)

- **Code & Modules**:
  - `packages/city-bloxx-content/one-drop.ts` & `packages/city-bloxx-core/src/one-drop.ts`: `ONE_DROP_RECIPE` (`one-drop-v1`, ruleset `one-drop-1`), 4 tầng Residential dựng sẵn đang lắc, 1 cú thả tính điểm (`inputs.length === 1`), 1 mạng, không mái, vật lý rơi/va chạm thân dưới khi Miss (`>= 100%`), kỷ lục cá nhân theo `absError` thấp nhất rồi `durationTicks` thấp nhất, không cộng XP hay ảnh hưởng Quick PB/City.
  - `packages/city-bloxx-core/src/metrics.ts`: `computePlacementHeatmap(history, filter)` với 40 bin `5%` từ `-100%` đến `+100%`, bộ đếm tràn Miss hai biên (`<-100%` và `>+100%`), loại bỏ tầng móng và mái, ghi rõ mẫu cửa sổ 50 lượt gần nhất.
  - `packages/city-bloxx-core/src/replay.ts` & `packages/city-bloxx-core/src/ghost.ts`: điều khiển tốc độ `0.5× / 1× / 2× / 4×`, `getDropMarkers()`, `seekToTick` / `seekToDrop` / `seekToResult`, bộ nhớ đệm checkpoint chỉ trong viewer (`<= 16` snapshots, `<= 16 MiB`, không lưu vào `GameSave`), và `PersonalGhost` tiền tính toán từ PB replay cùng seed/config/version (hỗ trợ `retrySameSeedConfig` khi lệch hạt giống, Reduced Motion bỏ vòng xung phụ).
  - `packages/city-bloxx-core/src/album.ts` & `packages/city-bloxx-core/src/save-state.ts`: `Hall of Fame` tối đa 5 bản tóm tắt ghim được bảo vệ khi dọn lịch sử 50 lượt (giữ tối đa 3 replay đầy đủ); `Skyline Album` tối đa 3 bản chụp quận (25 ô, biểu tượng, cấp đô thị, hộp thoại xác nhận khi ghi đè, 0 XP, từ chối chuỗi base64/data URI, tổng `GameSave <= 256 KiB`).
  - `base-game-nextjs/lib/social/share-card.ts`, `base-game-nextjs/lib/social/index.ts`, `base-game-nextjs/modules/city-bloxx/social-pages.tsx`, `/towers/[id]`, `/players/[id]`, `/challenges/[id]`: xuất bản/thu hồi tháp xác minh, kiểm duyệt tên hiển thị `3–24` ký tự + hồ sơ opt-in + báo cáo/vô hiệu hoá, giới hạn tốc độ tải replay công khai, kết xuất thẻ chia sẻ PNG `1200×630` chuẩn RFC 1950/1951 (EN/VI, cắt tên dài an toàn, khớp số liệu xác minh), và thử thách `Beat This Tower` cùng hạt giống (vé server, chặn tự thách đấu/dùng lại vé/sửa kết quả/phiên bản đã ngừng hỗ trợ, hộp thoại xác nhận bảo vệ lượt City/Daily đang dở).
- **Kiểm chứng**:
  - `npm test`: **314/314 unit tests (26 files)** qua, bao gồm `c6-challenges-replay-social.test.ts` (10 bộ kiểm thử chuyên sâu cho C6.1, C6.2, C6.3).
  - `npm run check`: `assets:check`, `test`, `lint`, `build:web`, `build:playable` qua sạch; gói Playable không chứa bất kỳ mã Web social hay route công khai nào.
  - `npm run evidence:c6`: kiểm thử Chrome headless trên cả Web và Playable ở `320×568`, `390×844`, `900×430` (EN/VI) cùng các trang công khai `/towers/[id]`, `/players/[id]`, `/challenges/[id]`. Xem [plan/evidence/C6-validation.json](evidence/C6-validation.json).

