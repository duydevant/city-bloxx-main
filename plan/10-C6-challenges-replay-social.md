# C6 — One Drop, replay nâng cao, ghost và social Web

Trạng thái: Planned. Dependency: soft launch; public/share/verification cần W1. GDD: 27, 40–41, 43, 47–49, 52–53.

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

- [ ] Dedicated versioned challenge config/preset trong content; preset tạo từ trusted core recipe, không deserialize arbitrary client tower state.
- [ ] Mode dispatcher/validator cho một input; giữ riêng yêu cầu min input Quick/finite.
- [ ] Result/history ghi preset/version/seed, không tính bốn tầng target là tầng người chơi đã xây.
- [ ] Menu/guide giải thích one shot; retry tạo identity mới, replay không tạo reward.
- [ ] Miss ≥100% có thể chạm lower facade/ground theo engine, không force top collision khi không overlap.

## 3. Replay viewer và heatmap

- [ ] Controls 0,5×/1×/2×/4×, play/pause/restart, drop markers, seek-to-drop và result boundary.
- [ ] Seek re-sim từ start hoặc bounded checkpoint cache trong viewer; không sửa replay input/state để nhảy nhanh.
- [ ] Cache viewer-only, tối đa 16 snapshots và ≤16 MiB; không persist cả snapshots vào SDK save.
- [ ] Playback speed chỉ đổi số tick simulation/real time; collision/result giữ deterministic.
- [ ] Unsupported version giữ summary và giải thích, không đoán bằng luật hiện tại.
- [ ] Heatmap dùng scored body errors, signed convention trái/phải; bins 5% từ -100% đến +100%, overflow Miss ở hai bin biên với count riêng. Foundation/roof loại ra; filter Assist/mode.
- [ ] Heatmap history window ghi rõ số mẫu, không gọi là lifetime nếu chỉ giữ 50 summaries/errors. Lifetime totals giữ riêng C4.0.

## 4. Personal ghost

Ghost đầu chỉ là marker release/landing timing/vị trí từ một PB supported cùng seed/config/version, không render tower thứ hai. Quick có PB khác seed thì không ghost trực tiếp: phải chọn retry same-seed challenge mới hoặc hiển thị unavailable.

Không dùng ghost input thay người chơi, không nhận ghost event vào stats/reward; reduced motion bỏ phụ pulse nhưng marker rõ. Tối đa một ghost, không additional main-loop simulation mỗi frame nếu có thể precompute markers trước start.

## 5. Hall of Fame / Skyline Album

- Hall of Fame tối đa năm pinned summaries; nằm trong 50 history slots nhưng protected khi prune. Chỉ ba replay full được retain như C4, không hứa cả năm đều xem lại.
- Skyline Album tối đa ba snapshot của selected district: 25 lots, class/height/population/rating/skin IDs, landmark và timestamp; không ghi toàn bộ save.
- Snapshot không trở thành playable save/achievement input. Capture không cấp reward; thay slot cần confirm.
- Local/SDK Album không lưu PNG base64; render snapshot theo asset catalog lúc xem. Web có thể generate share PNG khi user yêu cầu.

## 6. Web public/share/Beat This Tower

- [ ] `PublishedTower` opt-in từ verified Quick Standard/Daily có supported replay; City/Album có share image nhưng không competitive verified City board.
- [ ] `/towers/[id]`, `/players/[id]`, `/challenges/[id]`: public data curated, không email/cloud payload.
- [ ] `POST /towers/publish`, `DELETE /towers/[id]`: ownership required, publish/revoke idempotent; revoke tắt challenge/public access tương ứng.
- [ ] Public profile display name 3–24 ký tự, validated/moderated; generated handle mặc định, opt-in profile, report/disable route trước public rollout.
- [ ] Share card PNG 1200×630: server draw tower preview + typeset EN/VI text, mode/population/height/version. Không dùng AI gen ảnh thống kê có số giả.
- [ ] Beat This Tower phát server ticket cùng seed/config/version, không cùng account replay; ranked eligibility theo W1 verifier.
- [ ] Challenge winner theo population và tie-break W1; báo version retired/unavailable thay chạy ruleset khác. Link không reset pending City/Daily khi chưa confirm.
- [ ] Public replay download có limits/rate limiting; sensitive metadata như precise user location/device không public.

Playable không render link share/login/profile, không gọi publish APIs. Hall/Album/personal challenge vẫn dùng được.

## 7. Tests / DoD

- [ ] One Drop một input được chấm, foundation ordinary vẫn miễn; seeded target không XP/floor count.
- [ ] Same replay result ở mọi speed/seek; pause/restart không phát reward; corrupted/version mismatch reject.
- [ ] Ghost same config validation, seed mismatch unavailable, không tác động score/perf.
- [ ] Pins/prune/replay quota, three Album snapshots/save size; no base64 persistence.
- [ ] Publish auth/ownership/revoke/moderation/private data, challenge duplicate ticket và tamper.
- [ ] Share PNG data khớp verified result, EN/VI/long name không overflow.
- [ ] Both platform smoke/device profile và Playable dependency checks.

DoD theo từng subrelease: personal challenge/replay hoàn chỉnh; public rollout chỉ sau moderation/privacy/verification gate. Realtime/async duel nhiều vòng còn backlog.
