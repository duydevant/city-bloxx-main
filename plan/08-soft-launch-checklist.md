# Gate soft launch — nghiệm thu theo nền tảng

Trạng thái: Planned. Web gate = C4 + W0/W1. Playable gate = C4 + Y0–Y2. Một nền tảng có thể soft launch trước nếu gate riêng đã qua; không gọi cả hai đã phát hành khi YouTube còn chờ approval.

## 1. Feature gate chung

- [ ] Quick Standard/Assist, City và Daily hoạt động; core physics/bands/foundation không regression.
- [ ] Schema 1–3 migrate, pending legacy resume; errors không empty overwrite.
- [ ] Statistics/history, XP/mastery, ba daily missions, 20 achievements.
- [ ] Default + Classic Brick full set có approved art; equip/ownership tồn tại sau reload.
- [ ] EN/VI mọi menu/game/result/error/guide; language switch không reset lượt.
- [ ] Result thể hiện thành tích/thưởng một lần, không spam modal; Reduced Motion và skip count-up.
- [ ] Không fake rank/backend, không ads/payment/paid shop/energy.
- [ ] No outer scroll trong `/play`; các content page scroll có chủ đích.

## 2. Automated suite

Chạy từ root, dùng `npm.cmd` trên Windows:

```powershell
npm.cmd test
npm.cmd run assets:check
npm.cmd run lint
npm.cmd run build:web
npm.cmd run build:playable
npm.cmd run test:browser
```

- [ ] Không update fixtures/snapshots chỉ để che regression; có lý do versioned cho mọi expected change.
- [ ] Migration/reward idempotency/date-boundary fixtures đầy đủ.
- [ ] Replay verifier malformed inputs, mode/version/config mismatch và bounds.
- [ ] Asset hashes/crop/seams/budgets, core recursive boundary và Playable dependency boundary.
- [ ] Browser smoke report gắn build/version; headless results không được gọi GPU/FPS thật.

## 3. Thiết bị và performance

Test production, ít nhất Android Chrome phổ thông, iPhone Safari và desktop Chrome; Playable thêm host YouTube Android/iOS/web. Ghi model/OS/browser/app version và cách đo.

- [ ] Cold load/start interactive, tải Brick lần đầu, warm start, theme switch.
- [ ] Quick 50+ floors: swing/drop/collision/camera; City 40 body + roof; Daily 20 body + burst.
- [ ] Pause/resume 30 giây, tab background, app switch, orientation, locale, browser bars.
- [ ] 320×568 / 390×844 / 900×430 và điện thoại thật safe areas.
- [ ] Không decode image hoặc save serialize trong animation hot path; profiling trace đối chiếu đúng scene.
- [ ] Mục tiêu 60fps; trên representative 60Hz device p95 frame interval ≤20ms sau warm-up, không long task >50ms lặp theo mỗi drop. Nếu không đạt phải ghi nguyên nhân/giới hạn thiết bị và fix trước Verified, không đổi core để che hitch.
- [ ] Memory/cache bounded và không tăng vô hạn qua 20 retry/theme/resize; package/save byte reports.

Real-device playtest tối thiểu năm người: hiểu điều khiển/adjacency/Daily, tìm retry/progression, nhận biết reward. Feedback về cân bằng core ghi backlog riêng, không tự retune trong phase launch.

## 4. Gate Web

- [ ] Guest vẫn chơi; auth verify/reset/session/cookie hoạt động production.
- [ ] Cloud import/conflict/offline/revision/backup không mất save.
- [ ] Boards chỉ verified Quick Standard/Daily; duplicate/tampered input rejected.
- [ ] Docker build/run, HTTP health/play tại port 56789; `.env` config, no exposed DB/secret.
- [ ] TLS, SMTP, health/logging, migrations, backup và restore rehearsal.
- [ ] Basic funnel/retention events ingest đúng; consent/privacy text theo deployment thực tế.

## 5. Gate Playable

- [ ] firstFrameReady/gameReady đúng actual host; lifecycle/audio theo SDK.
- [ ] Save successful-load-before-write và score failure retry verified.
- [ ] Relative paths, no external services/login/share/QR; budgets passes.
- [ ] Test Suite/Developer Portal findings resolved; certification status ghi rõ.
- [ ] Approval/release artifact và rollback compatibility với save mới.

## 6. Rollout, monitoring và rollback

Web đầu tiên phát hành private/limited audience link, theo dõi ít nhất bảy ngày trước mở rộng. Daily/meta flags cho phép tắt entry mới khi lỗi nhưng giữ save/ownership/pending. Không chuyển flag làm lượt đang chơi đổi definition.

Theo dõi mỗi ngày: boot/crash, load/save failure, duplicate reward, verification rejects/503, completed runs, Daily completion/return và cosmetic unlock/equip. Metrics gameplay để tune sau, không là lý do tuyên bố launch thành công chỉ bằng một mẫu nhỏ.

Stop rollout khi có mất save/nhân reward/board giả hoặc lỗi boot tái hiện được. Revert app chỉ nếu parser đọc được save hiện hành; giữ backup trước migration. DB restore không tự động ghi đè production.

## 7. Evidence và sign-off

| Hạng mục | Build/commit | Report/thiết bị | Kết quả/ngày |
|---|---|---|---|
| Shared feature/test | Chưa có | Chưa có | Pending |
| Web production/Docker | Chưa có | Chưa có | Pending |
| Playable SDK/portal | Chưa có | Chưa có | Pending |
| Real-device performance/playtest | Chưa có | Chưa có | Pending |
| Backup/restore/rollback | Chưa có | Chưa có | Pending |

Chỉ ghi Released cho từng target sau gate tương ứng. Core ổn định hiện tại không thay thế các gate cho tính năng mới.
