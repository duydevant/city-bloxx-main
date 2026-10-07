# CITY BLOXX — PRODUCTION PLAN v1.0

**Loại:** Kế hoạch sản xuất theo phase, cho Web và YouTube Playables  
**Ngày:** 2026-10-06  
**Đọc cùng:** `City_Bloxx_Online_GDD_v1.0 (1).md`, `city_bloxx_research.md`, `City_Bloxx_Web_vs_YouTube_Playables.md`  
**Trạng thái code hôm nay:** `base-game-nextjs` là khung app (auth, i18n, layout), chưa có luật chơi. `base-playable-main` là khung YouTube Playables đã xong SDK, save, ads, score, pause. Game demo Tap Rush nằm trong `src/game/` và sẽ được thay.

Quy tắc một câu, giữ nguyên từ bản so sánh nền tảng:

> Một gameplay core. Web là bản đủ dịch vụ. Playables là bản đóng gói, đi qua SDK, và tôn trọng giới hạn bundle.

---

# 1. Cách dùng tài liệu này

Làm đúng thứ tự phase. Mỗi phase có mục **Xong khi**. Chưa xong thì chưa mở phase sau, trừ phần vẽ.

Ảnh làm theo mục 8 và 9. File nguồn để trong `art/`. File game thật để trong `public/game/` của đúng app. Game không import từ `art/`.

Số population, ngưỡng bonus roof, và mốc mở khóa trong tài liệu research là số tham khảo từ bản J2ME, chưa đủ để coi là công thức chính thức. Mọi hằng số gameplay đặt trong `rulesetVersion`. Đổi cảm giác chơi thì tăng version, không sửa âm thầm save cũ.

---

# 2. Quyết định đã chốt cho plan này

| # | Quyết định | Lý do |
|---|---|---|
| 1 | Thêm `packages/city-bloxx-core`. Hai app hiện tại giữ nguyên vai trò vỏ. | GDD và bản so sánh đều yêu cầu một core. Khung Playables cấm sửa `src/platform/` và `src/main.ts`. |
| 2 | Core là TypeScript thuần. Không DOM, không React, không `ytgame`, không `fetch`. | Cùng một kết quả trên web, server, và Playables. |
| 3 | Swing là hàm của seed + thời gian. Cùng seed và cùng timestamp thì ra cùng kết quả. | Replay, Daily, và chấm điểm server cần điều này từ phase 1. |
| 4 | Quick Tower dùng một loại sàn, kéo dài đến khi miss 3 lần. Roof thuộc Build City. | Research: roof là nhịp cuối của building có số tầng cố định. |
| 5 | Build City: miss 3 lần kết thúc building hiện tại, thành phố còn. Tower dở được đặt xuống ô, không có roof bonus. Người chơi có thể phá và xây lại. | Research mục 14 và 17. |
| 6 | Va chạm theo class, không theo skin. Skin chỉ đổi hình. | GDD 41A và 41R. |
| 7 | `sendScore` của Playables gửi population, số nguyên. | SDK chỉ có một kênh điểm. Web mới có nhiều bảng. |
| 8 | Daily dùng cùng công thức seed trên cả hai nền tảng. | Playables không gọi server. Web vẫn có thể ra cùng đề. |
| 9 | Profile web và save YouTube là hai hồ sơ. Không hứa đồng bộ. | Bản so sánh mục 23. |
| 10 | Playables bản 1 đóng gói bộ hình `default`. Classic Brick, Modern Glass, Neon nằm trên web, nơi asset tải sau được. | Zip Playables phải nhỏ. GDD muốn 2–3 theme ở launch là mục tiêu web. |
| 11 | Phase 2 dùng tiếng beep tổng hợp, chưa cần file nhạc. | Khung Playables đã có `host.beep`. Đỡ tốn dung lượng. |
| 12 | Không có energy, ticket, hay timer hồi mạng. | GDD mục 64. |
| 13 | Ảnh là thiết kế gốc. Không vẽ lại asset Digital Chocolate. | Tránh đụng bản quyền. |
| 14 | Tên trên sản phẩm tạm là City Bloxx Online. Ảnh trong game không bake chữ. | Tên thương mại chưa chốt. Model hay viết sai chữ. |

Hằng số đề xuất cho `rulesetVersion = 1`, ghi rõ là tuning, chưa phải số gốc:

| Hạng | Tầng | Ai đặt được | Độ rộng va chạm | Bonus roof khi population sàn đạt |
|---|---:|---|---:|---:|
| Residential / Blue | 10 | Ô trống bất kỳ | 1.00 | 70 |
| Industrial / Red | 20 | Kề Blue, bốn hướng | 1.28 | 250 |
| Office / Green | 30 | Kề Blue và kề Red | 0.92 | 550 |
| High-rise / Yellow | 40 | Kề Blue, Red, và Green | 0.78 | 1200 |

Mở khóa đề xuất: Red khi có 2 tower Blue hoàn thành. Green khi city population đạt 2.000 và đã có 1 Red. Yellow khi city population đạt 8.000 và đã có 1 Green. Chéo không tính là kề.

Band đặt tầng, lấy từ GDD, vẫn là điểm bắt đầu để tune:

```text
Perfect  0.00–0.08
Great    0.08–0.22
Good     0.22–0.45
Risky    0.45–0.75
Miss     không đủ chồng lớp
```

---

# 3. Hai sản phẩm khác nhau ở đâu

Core giống nhau: physics, sway, combo, population, roof, 4 class, lưới 5×5, mission, achievement, replay event, catalog skin.

| Việc | Web | Playables |
|---|---|---|
| Chỗ chạy | Next.js, route thật, có SEO | Một trang trong `src/game/`, màn hình là state |
| Lưu | localStorage lúc chưa có server, sau đó API | `host.save` / `host.load`, mục tiêu dưới 500 KiB |
| Điểm cao | Nhiều bảng trên server | `host.sendScore(population)` |
| Daily | Cùng seed, rank thật | Cùng seed, chữ trên màn là điểm của mình, không bịa hạng |
| Replay | Upload, URL công khai, Beat This Tower | Replay lần này và kỷ lục cá nhân |
| Tài khoản | Chơi không cần. Nộp bảng xếp hạng thì cần. | Không màn hình đăng nhập |
| Quảng cáo | Giữa các run, có trần tần suất | `host.interstitialThen` và rewarded của YouTube |
| Shop, bạn bè, PvP, season pass | Có, từ phase 8–10 | Không làm |
| Ảnh | `base-game-nextjs/public/game/`, bản sau có thể đưa lên CDN | `base-playable-main/public/game/`, đường dẫn tương đối `./game/...` |
| Nhạc và skin thêm | Tải thêm được | Phải nằm trong zip. Thêm skin nghĩa là bản build mới |

Playables giữ các điều kiện khung đã có: SDK load trước game, `firstFrameReady` rồi `gameReady`, không đè `window.ytgame`, không request ra domain khác, không link ra ngoài, không nút share, tên file chỉ gồm chữ, số, dấu chấm, gạch dưới và gạch ngang, bundle khởi tạo dưới 30 MiB và nên dưới 15 MiB, save dưới 3 MiB và nên dưới 500 KiB, chơi được bằng chuột và cảm ứng, không khóa chiều màn hình.

---

# 4. Cấu trúc thư mục

```text
D:\ANT_1\city-bloxx-main\
├── art\                                      NGUỒN. Game không import thư mục này.
│   ├── 00-style-anchor\
│   ├── 01-stack\
│   ├── 02-city\
│   ├── 03-ui\
│   ├── 04-fx\
│   ├── 05-bg\
│   ├── 06-store\
│   └── audio\                                Để trống đến khi bỏ synth.
│
├── packages\
│   └── city-bloxx-core\                      Tạo ở phase 0.
│       ├── package.json
│       ├── tsconfig.json
│       └── src\
│           ├── index.ts
│           ├── physics\                      swing.ts, sway.ts, overlap.ts
│           ├── tower\                        run.ts, roof.ts
│           ├── scoring\                      population.ts, combo.ts, rating.ts
│           ├── city\                         grid.ts, adjacency.ts, demolish.ts
│           ├── daily\                        seed.ts
│           ├── replay\                       events.ts, simulate.ts
│           ├── save\                         schema.ts
│           ├── missions\
│           ├── achievements\
│           ├── cosmetics\                    catalog.ts
│           └── rules\                        versions.ts, buildings.ts, bands.ts
│
├── base-game-nextjs\
│   ├── app\(main)\                           Route web, thêm dần.
│   ├── modules\city-bloxx\                   Vỏ web. Tạo ở phase 1.
│   │   ├── adapter\                          Save, ads, share, leaderboard.
│   │   ├── render\                           Canvas, camera, input.
│   │   └── screens\                          React bọc ngoài canvas.
│   ├── public\
│   │   ├── game\                             ẢNH GAME WEB. Cùng cây thư mục với Playables.
│   │   ├── images\                           Ảnh SEO / marketing. Đã có. Không nhét sprite.
│   │   └── icons\                            Icon site. Đã có.
│   └── public\game\
│       ├── stack\
│       ├── city\
│       ├── ui\
│       ├── fx\
│       └── bg\
│
└── base-playable-main\
    ├── src\game\                             Chỉ viết game ở đây.
    ├── src\platform\                         Không sửa.
    ├── src\main.ts                           Không sửa.
    └── public\game\                          ẢNH NẰM TRONG dist.zip.
        ├── stack\
        ├── city\
        ├── ui\
        ├── fx\
        └── bg\
```

`packages/city-bloxx-core` được cả hai app phụ thuộc qua workspace của repo. Root thêm `package.json` với `workspaces` trỏ tới `packages/*`, `base-game-nextjs`, và `base-playable-main`.

Capability là dữ liệu truyền vào, không phải cờ rải trong core:

```ts
type PlatformCapabilities = {
  cloudSave: "local" | "backend" | "youtube";
  leaderboard: "none" | "custom" | "sendScore";
  ads: "none" | "web" | "youtube";
  publicReplay: boolean;
  externalShare: boolean;
  remoteConfig: boolean;
  pvp: boolean;
  friends: boolean;
  shop: boolean;
};
```

Web bật `custom`, `backend`, `publicReplay`, `externalShare`, `remoteConfig`, `pvp`, `friends`, `shop` theo đúng phase, không bật sớm. Playables dùng `youtube`, `sendScore`, `ads: "youtube"`, mọi cờ còn lại tắt.

---

# 5. Tên file và chỗ xuất

## 5.1. Ngữ pháp tên

```text
{nhóm}_{chủ thể}_{theme}_{mảnh}.png
```

Chỉ chữ thường, số, và gạch dưới. Không dấu, không khoảng trắng, không `@`. Vite Playables từ chối tên file lạ, và Test Suite cũng vậy.

| Nhóm | Chủ thể | Theme | Mảnh |
|---|---|---|---|
| `bldg` | `residential` `industrial` `office` `highrise` | `default` `brick` `glass` `neon` | `base` `mid` `roof` |
| `crane` | `rig` | cùng bộ theme | không có mảnh thêm |
| `hook` | `hook` | cùng bộ theme | không có mảnh thêm |
| `city` | `residential` `industrial` `office` `highrise` | cùng bộ theme | `mini` |
| `lot` | `empty` `frame` | `default` | không có mảnh thêm |
| `bg` | `stack` `downtown` | `default` | không có mảnh thêm |
| `ui` | `panel` `button` `life` `combo` `demolish` `lock` | `default` | không có mảnh thêm |
| `medal` | `c` `b` `a` `s` `splus` | `default` | không có mảnh thêm |
| `fx` | `perfect` `miss` | `default` | không có mảnh thêm |
| `icon` | `app` | `default` | không có mảnh thêm |

Ví dụ đúng: `bldg_residential_default_mid.png`  
Ví dụ sai: `Residential Mid.png`, `tòa-nhà-xanh.png`

## 5.2. Ba lớp lưu

| Lớp | Đường dẫn | Ai được đụng | Ghi chú |
|---|---|---|---|
| Nguồn generate | `art\...` | Người vẽ / tool ảnh | Giữ bản lớn, nền magenta, chưa căn baseline |
| Runtime web | `base-game-nextjs\public\game\...` | Game web | PNG trong suốt, đã căn |
| Runtime Playables | `base-playable-main\public\game\...` | File zip | Chỉ bản `default` ở đợt 1. Đường dẫn trong code là `./game/...` |

Cây con bên dưới `game\` giống hệt nhau:

```text
game\stack\     sàn, mái, cần cẩu, móc
game\city\      mô hình nhỏ và ô đất
game\ui\        panel, nút, icon, huy chương
game\fx\        vệt perfect và miss
game\medal\     C B A S S+
game\bg\        nền
```

Store và ảnh chia sẻ web không vào zip Playables:

```text
art\06-store\icon_app_512.png
art\06-store\og_scene.png
base-game-nextjs\app\icon.png                         icon site Next
base-game-nextjs\public\images\og.png                 ảnh Open Graph
```

Ảnh chụp màn hình nộp YouTube lấy từ game đang chạy, không generate giao diện giả.

## 5.3. Khổ canvas runtime

Mọi sàn nhà là một tầng, cùng chiều cao câu chuyện. Class khác nhau ở bề ngang và mặt tiền. Tòa cao vì xếp nhiều tầng, không phải vì một sprite đã là cả tòa nhà.

| Loại | Canvas xuất | Nội dung |
|---|---|---|
| Sàn `base` và `mid` | 512×256 | Dải tầng nằm ở y 96–192. Chân tầng chạm y 192. Căn giữa theo chiều ngang. |
| Mái `roof` | 512×256 | Chân mái chạm y 192, phần trang trí vươn lên trên. |
| Cần cẩu | 1024×512 | Nhìn nghiêng, cần vươn sang phải. Không vẽ dây, không vẽ móc. |
| Móc | 128×128 | Chủ thể ở giữa. |
| Mô hình city | 256×256 | Cả tòa nhà, chân chạm đáy canvas. |
| Ô đất | 256×256 | |
| Icon, huy chương, fx | 128×128 | Chủ thể ở giữa, chừa khoảng thở. |
| Panel và nút | 256×256 | Bốn góc có chi tiết, cạnh thẳng để 9-slice, lòng trong trống. |
| Nền stack | 1024×1536 | Có thể bỏ qua và tô gradient bằng code ở phase 1. |
| Icon cửa hàng | 512×512 | Không chữ. |
| Ảnh OG | 1200×630 | Cảnh, không chữ. Chữ đặt bằng CSS hoặc công cụ thiết kế. |

Tỉ lệ bề ngang nên mắt thường thấy được: Industrial rộng nhất, Residential trung bình, Office hẹp hơn, High-rise hẹp và thanh. Va chạm thật nằm ở `rules/buildings.ts`, không lấy từ pixel trong suốt.

Điểm neo móc của cần cẩu ghi ở `art\01-stack\crane_rig_default.json`:

```json
{ "hook": [0.78, 0.46] }
```

Tọa độ chuẩn hóa theo ảnh cần cẩu, góc trên-trái là 0,0. Sửa số này sau khi ảnh thật được duyệt, cho khớp đầu cần.

## 5.4. Bộ file `default` phải có

```text
art\01-stack\bldg_residential_default_base.png
art\01-stack\bldg_residential_default_mid.png
art\01-stack\bldg_residential_default_roof.png
art\01-stack\bldg_industrial_default_base.png
art\01-stack\bldg_industrial_default_mid.png
art\01-stack\bldg_industrial_default_roof.png
art\01-stack\bldg_office_default_base.png
art\01-stack\bldg_office_default_mid.png
art\01-stack\bldg_office_default_roof.png
art\01-stack\bldg_highrise_default_base.png
art\01-stack\bldg_highrise_default_mid.png
art\01-stack\bldg_highrise_default_roof.png
art\01-stack\crane_rig_default.png
art\01-stack\crane_rig_default.json
art\01-stack\hook_hook_default.png

art\02-city\city_residential_default_mini.png
art\02-city\city_industrial_default_mini.png
art\02-city\city_office_default_mini.png
art\02-city\city_highrise_default_mini.png
art\02-city\lot_empty_default.png
art\02-city\lot_frame_default.png
art\05-bg\bg_downtown_default.png
```

Quick Tower phase 1 chỉ cần bốn file: `crane_rig_default`, `hook_hook_default`, `bldg_residential_default_mid`, và tùy chọn `bg_stack_default`. Các file còn lại vào trước khi code Build City xong.

Theme sau này copy đúng tên, đổi `default` thành `brick`, `glass`, hoặc `neon`. Ví dụ web: `base-game-nextjs\public\game\stack\bldg_office_glass_mid.png`.

## 5.5. Đưa file từ nguồn sang game

1. Generate vào `art\`, nền magenta `#FF00FF`.
2. Tách nền thành alpha. Góc trong suốt phải trong suốt thật.
3. Căn baseline đúng mục 5.3.
4. Xuất PNG vào `public\game\` của web.
5. Copy cùng đường dẫn tương đối vào Playables chỉ với bộ `default`, cho đến khi có đo dung lượng.
6. Trong Playables, mọi URL là tương đối: `./game/stack/bldg_residential_default_mid.png`.
7. Trong web, URL gốc site: `/game/stack/bldg_residential_default_mid.png`.
8. Mỗi file trong zip Playables nên dưới 512 KiB. Ảnh phẳng đúng khổ ở trên nằm trong mức đó. Không đưa bản master 1536px vào `public`.

Dây cáp vẽ bằng code, từ điểm neo trên cần cẩu xuống móc. Không làm sprite dây.

---

# 6. Các phase

## Phase 0 — Khóa chỗ code và chỗ ảnh

**Mục tiêu:** Hai app cùng gọi được một hàm version. Thư mục ảnh tồn tại để bỏ file vào đúng chỗ.

**Chung**

- Tạo workspace và `packages/city-bloxx-core`.
- `rules/versions.ts` xuất `physicsVersion`, `rulesetVersion`, `saveVersion`.
- Test vitest của core chạy được.
- Web và Playables import core, hiện chuỗi version trên một màn hình tạm.

**Web:** phụ thuộc workspace, chưa thêm route chơi.  
**Playables:** `src/game/index.ts` gọi core rồi vẽ một dòng version. Không sửa `src/platform`.  
**Ảnh:** tạo cây `art\` và hai cây `public\game\`. Chưa cần sprite đẹp.  
**Chưa làm:** physics, city, tài khoản.

**Xong khi:** `npm test` trong core xanh, và cả hai app dev đều hiện cùng một số version.

## Phase 1 — Cảm giác thả tầng

**Mục tiêu:** Quick Tower chơi được trên cả hai máy local. Một nút. Lệch thì tòa lắc mạnh hơn. Perfect và miss đọc được ngay.

**Chung**

- Vòng lặp: khối đung đưa, người chơi thả, đo chồng lớp, cộng population, cập nhật sway, khối sau xuất hiện.
- Input là thời điểm. Không có nút trái phải.
- Desktop: Space, Enter, click. Mobile và Playables: tap cả vùng chơi.
- 3 mạng. HUD: population, số tầng, combo, mạng.
- Combo có thời gian. Perfect nạp lại combo. Perfect cũng giảm một phần sway đã tích.
- Population một tầng = nền × chất lượng đặt × hệ số combo × hệ số nhà. Công thức nằm trong `scoring/`, có test.
- Camera luôn thấy mặt tiếp đất. Tower là hình chính, HUD nhường chỗ.
- Run ghi `physicsVersion`, `rulesetVersion`, seed, và danh sách drop `{ t, alignment }`.
- `simulate(seed, events)` tái hiện kết quả. Đây là hàm web sẽ dùng lại ở server.

**Web**

- Route `app/(main)/play/page.tsx`.
- Module `modules/city-bloxx/`.
- Kỷ lục local. Chưa có đăng nhập trên đường chơi.
- Chặn scroll, zoom, và double-tap của trình duyệt trên vùng chơi.

**Playables**

- Thay demo Tap Rush trong `src/game/`.
- `autoReady: true` cho đến khi có intro.
- Pause của YouTube dừng swing và gọi save.
- Tôn trọng mute của YouTube.
- Hết run thì `flushScore` bằng population.
- Save local best qua `host.save`.

**Ảnh cần trước khi phase kết thúc:** `crane_rig_default`, `hook_hook_default`, `bldg_residential_default_mid`. Nền trời làm bằng gradient nếu ảnh chưa có.

**Chưa làm:** Build City, Daily, tài khoản, skin, quảng cáo thật, file nhạc.

**Xong khi:** Một người chưa đọc GDD thả được tầng trong 10 giây, thấy khác biệt giữa perfect và miss, và chết sau 3 miss trên cả web lẫn preview Playables. Test overlap và population xanh.

## Phase 2 — Quick Tower đủ để chơi thử nội bộ

**Mục tiêu:** Chơi lại dưới 2 giây. Kết quả một run nói được mình chơi thế nào.

**Chung**

- Màn kết quả: population, chiều cao, perfect rate, streak, thời gian, hạng tower C / B / A / S / S+.
- Trọng số hạng lấy từ GDD: 40% độ chính xác, 25% perfect rate, 15% số miss, 10% mái, 10% combo. Quick Tower chưa có mái thì 10% đó cộng vào độ chính xác.
- Assist Mode, ghi nhãn unranked: swing chậm, vùng perfect rộng, sway nhẹ, vạch căn. Run assist không được nộp điểm.
- Beep chung: perfect, miss, win, lose. Playables gọi `host.beep`. Web dùng cùng mapper.
- Điểm cắm quảng cáo lúc bấm chơi lại, triển khai rỗng.
- Perfect có nháy ngắn bằng code. Miss thấy khối rơi.

**Web:** màn kết quả React. Chưa share.  
**Playables:** kết quả bằng DOM trong `host.stage`. `interstitialThen` bọc hành động chơi lại, cooldown 60 giây của khung giữ nguyên. Chạy Test Suite bằng `npm run preview` hoặc `dist.zip`, không dùng `npm run dev`. Thử xoay máy, pause, mute, chuột và cảm ứng.

**Ảnh:** icon mạng, khung combo, năm huy chương. Có thể làm bằng hình học CSS nếu ảnh chưa kịp, rồi thay file sau.

**Xong khi:** Playables qua checklist mục 9 của README khung (package không FAIL, pause có save, mute tắt tiếng, ngôn ngữ đổi chữ HUD). Web chơi tốt bằng một ngón trên điện thoại.

## Phase 3 — Build City

**Mục tiêu:** Vòng thành phố gốc. 25 ô. Bốn loại nhà. Đặt đúng luật. Phá và thay. Mái là cú thả cuối.

**Chung**

- Map 5×5, một district Downtown.
- Chọn ô, chọn loại hợp lệ, xây đúng số tầng, thả mái, ghi population, trở lại map.
- Luật kề bốn hướng như mục 2.
- Phá nhà trả ô trống. Population thành phố là tổng nhà đang đứng.
- Tower dở vẫn được đặt, không cộng roof bonus.
- Bonus roof khi qua ngưỡng tuning, đổi sprite mái sang biến thể trang trí hơn trong cùng file roof hoặc một lớp fx. Không thêm class mới.
- City level là hàm của population, mở loại nhà.
- Save: 25 ô, mỗi ô gồm class, số tầng đã xây, có mái hay chưa, population, rating, skin id. Cộng stats tối thiểu.

**Web:** route `/build-city`. Save localStorage cho đến phase 7.  
**Playables:** màn city là state trong `src/game/`, không phải route. Save qua `host.save`. Tăng `VITE_SAVE_VERSION` vì hình dạng dữ liệu đổi. Schema bọc `{v, d}` của khung giữ nguyên.

**Ảnh:** đủ bộ `default` ở mục 5.4, gồm mini city, ô trống, khung ô, nền downtown.

**Chưa làm:** district thứ hai, landmark, synergy, shop.

**Xong khi:** Xây được Blue, mở Red, đặt Red cạnh Blue, bị từ chối khi đặt Yellow ở góc, phá một nhà, và tải lại vẫn còn thành phố trên cả hai app.

## Phase 4 — Daily

**Mục tiêu:** Cùng một ngày là cùng một đề, không cần Playables gọi server.

**Chung**

- `dailySeed = hash(utcDate + rulesetVersion + physicsVersion + "daily-tower")`.
- Đề chọn sẵn class, seed swing, và một mục tiêu: population, perfect rate, streak, thời gian, hoặc số miss.
- Lưu best trong ngày theo mục tiêu đó.

**Web**

- Route `/daily`.
- Server, khi có, phát đúng seed mà hàm local đã tính, để client và server không lệch.
- Bảng daily là bảng riêng.

**Playables**

- Cùng hàm seed.
- Hết run thì `sendScore` nếu population cao hơn kỷ lục đã gửi. Khung đã chặn gửi lùi và gửi số lẻ.
- Chữ trên màn: điểm và kỷ lục của người chơi. Không vẽ hạng thế giới.

**Ảnh:** không bộ mới. Một icon lịch trong `art\03-ui\ui_daily_default.png` nếu muốn. HUD có thể dùng chữ.

**Chưa làm:** One Drop, Perfect Rush, Wind Mode.

**Xong khi:** Đổi ngày UTC thì đề đổi. Cùng ngày thì web và Playables ra cùng seed. Test khóa cứng một ngày mẫu.

## Phase 5 — Nhiệm vụ, thành tích, sổ kiến trúc

**Mục tiêu:** Sau mỗi run có việc ngày mai, mà save Playables vẫn nhỏ.

**Chung**

- 3 nhiệm vụ mỗi ngày, sinh từ daily seed. Ví dụ: 15 lần Great trở lên, một tower Red, một mái Perfect, combo 8, chơi Daily, cải thiện một ô.
- Khoảng 20 thành tích nhóm precision, streak, height, recovery, city.
- Mastery đếm theo class: số tower, số perfect, hạng tốt nhất.
- Sổ kiến trúc đọc catalog. Phase này mới có skin `default`, các ô khác hiện khóa.
- Save thêm mission, achievement, stats. Replay chỉ giữ run hiện tại và kỷ lục, dạng event compact, không snapshot physics.

**Web:** hiện trên profile có sẵn ở `app/(main)/profile`.  
**Playables:** một màn sổ trong stage. Không trang người chơi công khai.

**Xong khi:** Hoàn thành một nhiệm vụ, tải lại, việc đó vẫn xong. Save mẫu Build City đầy 25 ô cộng 20 thành tích nằm dưới 500 KiB.

## Phase 6 — Bộ hình launch

**Mục tiêu:** Bốn silhouette `default` đã khóa. Web có thêm theme. Playables vẫn nhẹ.

**Chung**

- Catalog skin. Chọn skin trước khi xây. Geometry và population không đổi.
- Mở khóa bằng mastery, không bán ở phase này.
- Crane và mái đi theo theme đang chọn.

**Web**

- `default` cộng Classic Brick, rồi Modern Glass. Neon nếu bộ Brick đã ổn.
- Ảnh theme chỉ nằm ở `base-game-nextjs\public\game\`.

**Playables**

- Zip chỉ có `default` cho đến khi đo `dist.zip`.
- Thêm `brick` chỉ khi tổng bundle vẫn nên dưới 15 MiB và từng file dưới 512 KiB.
- Không tải PNG từ CDN.

**Ảnh:** làm theo mục 9.10, bằng cách sửa từ file `default` đã duyệt, không generate lại silhouette.

**Xong khi:** Đổi skin trên web, đo một run assist và một run ranked, population cùng input thì trùng. Playables vẫn package sạch với bộ default.

## Phase 7 — Web cạnh tranh

**Mục tiêu:** Soft launch web. Playables không đi vào phase này.

**Web**

- Backend tối thiểu: auth, profile, nộp run, bảng xếp hạng, daily.
- Server gọi cùng `simulate`. Không tin population client gửi lên.
- Payload: ruleset, physics version, seed, drop timestamps, kết quả khai báo.
- Run assist, run sai version, và run lệch simulate thì từ chối.
- Route: `/leaderboard`, `/my-towers`, `/tower/[id]`, `/how-to-play`.
- Replay cơ bản xem lại được.
- Tài khoản chỉ chặn lúc nộp điểm và lúc xem hồ sơ mây. Quick Tower local vẫn chơi được.

**Playables:** không thêm endpoint. Vẫn save YouTube và `sendScore`.

**Ảnh:** `icon_app_512`, `og_scene`, và ảnh chụp game thật cho trang chủ.

**Xong khi:** Sửa population trong request thì server từ chối. Hai client cùng seed và cùng timestamp thì cùng hạng điểm. Trang chủ, chơi, city, daily, bảng xếp hạng, và cách chơi đều mở được.

## Phase 8 — Web xã hội và đấu bất đồng bộ

**Mục tiêu:** Người khác chơi lại đúng đề của mình. Vẫn chưa đấu realtime.

**Web**

- Share card là ảnh kết quả tải về hoặc copy link. Chữ vẽ bằng layout web, không bake trong PNG nền.
- Beat This Tower: link mở đúng seed.
- Ghost từ replay event của kỷ lục cá nhân, rồi tới replay công khai.
- Async duel: cùng seed, so population, perfect rate, thời gian, số miss.
- Bạn bè và bảng của bạn bè.

**Playables:** không nút share, không link, không ghost người lạ. Ghost kỷ lục của chính mình được phép nếu event đã nằm trong save và còn ngân sách byte.

**Chưa làm:** Tower Race realtime. Cái đó cần WebSocket và server phòng, để sau khi async đã có người chơi.

## Phase 9 — District, landmark, mode phụ

Chỉ mở khi Quick Tower có người chơi lại, Daily có người quay lại, và Build City có người xây tiếp sau tower đầu.

**Chung nếu có trong bundle:** district mới là thêm nền, luật modifier, và mục tiêu. Landmark là building đặc biệt, mở bằng mastery. Mode phụ: One Drop, Perfect Rush, Skyline Sprint. Wind Mode chỉ trong event, không đụng Classic.

**Web:** featured trên home, bên dưới Build City, Daily, và Quick.  
**Playables:** mỗi lần thêm district hoặc mode là một bản zip mới, nội dung bật theo ngày trong config đóng gói sẵn.

**Ảnh:** một nền district một prompt theo mẫu Downtown. Landmark theo mẫu mục 9.12. Theme Old European và Winter Town dùng cách sửa của mục 9.10.

## Phase 10 — LiveOps và mùa

**Web:** remote config, sự kiện, shop cosmetic, season pass, quảng cáo riêng, gói bỏ quảng cáo. Cosmetic trả tiền dùng cùng va chạm với skin mặc định. Không bán độ chính xác, mạng, hay population.

**Playables:** sự kiện đã nằm trong bundle và đến ngày thì mở. Rewarded ad cho thử skin hoặc tiếp tục ở mode casual, không đụng ranked. Không giá tiền, không link shop, không mạng quảng cáo khác.

Prestige city và giải đấu nằm ở cuối phase này, web trước.

---

# 7. Lịch ảnh gắn với phase

| Thứ tự vẽ | Việc | Phase code cần nó |
|---|---|---|
| 1 | Tờ khóa style A00 | Trước khi vẽ hàng loạt |
| 2 | Cần cẩu, móc, sàn residential mid | Phase 1 |
| 3 | Icon HUD và huy chương | Phase 2, CSS thay tạm được |
| 4 | Đủ 4 class × base, mid, roof | Phase 3 |
| 5 | Bốn mô hình city, ô đất, nền downtown | Phase 3 |
| 6 | Fx perfect và miss, nếu code chưa đủ rõ | Phase 2–3 |
| 7 | Classic Brick, Modern Glass, Neon bằng sửa từ default | Phase 6, web |
| 8 | Icon 512 và cảnh OG | Phase 7 |
| 9 | District mới, landmark, theme mùa | Phase 9–10 |

Không vẽ 50 skin trước khi bốn class `default` nhìn thoáng đã biết loại nào.

---

# 8. Khóa hình

## 8.1. Ngôn ngữ hình

Có hai camera, không dùng chung một ảnh.

**Stack.** Nhìn nghiêng, một tầng mỗi sprite, cần cẩu ở trên, móc và sàn đung đưa. Người chơi phải đọc độ lệch bằng mắt khi tòa đang lắc.

**City.** Mô hình cả tòa nhà, nhỏ, đặt lên lưới 5×5. Đây không phải sprite được xếp tầng.

Bốn loại phải nhận ra bằng bóng, kể cả khi bỏ màu:

- Residential: thấp, vừa, nhiều cửa sổ, ban công nhỏ, ấm.
- Industrial: rộng, dày, mái máy, ống và khối cơ khí.
- Office: hẹp hơn industrial, mặt lưới kính đều, thẳng.
- High-rise: hẹp, thanh, đỉnh có vương miện. Chiều cao thật sự đến từ 40 tầng.

Màu gợi ý cho bộ `default`, tên gọi nội bộ là Daylight City:

- Residential: cát ấm, mái hiên xanh hoa ngô.
- Industrial: gạch đỏ và than.
- Office: kính xanh xám, khung nhạt.
- High-rise: kem và vàng ấm, đỉnh bậc.
- Cần cẩu: vàng hoa hướng dương, thép tối.
- Trời: xanh cuối chiều.

## 8.2. Câu style dán trước mọi prompt

Dán nguyên đoạn này ở đầu mỗi prompt standalone:

```text
Stylized 2D mobile game illustration, clean bold silhouette, soft cel shading, thick readable shapes, warm late-afternoon daylight, saturated natural colors, crisp edges, original architecture. Isolated on a flat pure magenta background #FF00FF. No text, no letters, no numbers, no logo, no watermark, no photo realism, no ground, no cast shadow.
```

Prompt city và prompt store đổi câu nền, phần đó viết đủ trong từng mục bên dưới, không cộng thêm câu magenta nếu mục đó đã nói nền khác.

## 8.3. Sau khi có ảnh duyệt

Ảnh cùng loại sau tờ A00 nên sửa từ ảnh đã duyệt, không generate mới. Giữ bóng, số nhịp cửa sổ, và chiều cao tầng. Chỉ đổi chất liệu. Nếu tool không sửa ảnh được thì dùng prompt standalone, rồi so với A00 và vẽ lại nếu bóng đã trôi.

---

# 9. Prompt theo loại

Khổ và đường dẫn là việc xuất file, không nhét vào prompt. Model vẽ dễ hỏng khi gặp kích thước pixel.

## 9.1. Tờ khóa style

| | |
|---|---|
| ID | A00 |
| Phase | 0, trước hàng loạt |
| Lưu | `art\00-style-anchor\anchor_daylight_city.png` |
| Đưa vào game | Không |

```text
Stylized 2D mobile game illustration sheet on a flat pure magenta background. Four separate one-story floor slabs in side elevation, evenly spaced in a row, plus one construction crane above them and one small roof cap under each slab. From left to right the slabs are: a cozy sand-colored apartment slice with a blue awning and small balconies; a wider red-brick industrial slice with thick steel panels; a narrower pale glass office slice with an even window grid; a slim cream-and-gold tower slice with an elegant stepped crown floating just above it as a separate roof shape. A sunflower-yellow tower crane with a dark steel jib sits across the top, hook empty. Warm late-afternoon light, bold silhouettes, soft cel shading, crisp edges, clear gaps between every object. No text, no letters, no numbers, no logo, no watermark, no ground, no cast shadow.
```

Duyệt A00 khi: bốn sàn khác bóng rõ, cùng một chiều cao tầng, cần cẩu không dính vào sàn, nền một màu.

## 9.2. Sàn tầng lặp — `mid`

Một tầng, nhìn nghiêng, mặt phải. Đây là khối đung đưa và cũng là tầng xếp lên. Cùng chiều cao với các loại khác.

| File | Class |
|---|---|
| `art\01-stack\bldg_residential_default_mid.png` | Residential |
| `art\01-stack\bldg_industrial_default_mid.png` | Industrial |
| `art\01-stack\bldg_office_default_mid.png` | Office |
| `art\01-stack\bldg_highrise_default_mid.png` | High-rise |

Câu chung, rồi thêm một đoạn class:

```text
Stylized 2D mobile game illustration, clean bold silhouette, soft cel shading, warm late-afternoon daylight, crisp edges, original architecture. A single one-story building floor slab in strict side elevation, facing right, one story tall and meant to be stacked on identical copies. Flat pure magenta background #FF00FF. No text, no letters, no numbers, no logo, no people, no ground, no cast shadow, no roof, no crane.
```

Thêm đúng một đoạn:

```text
Residential: cozy sand-colored walls, cornflower-blue awning, small balconies, friendly rectangular windows, medium width.
```

```text
Industrial: the widest slab, red brick and charcoal steel, thick mechanical panels, a short vent pipe, heavy and blocky.
```

```text
Office: narrower than the apartment, pale sage glass in a strict even window grid, thin light frame, clean and vertical.
```

```text
High-rise: the narrowest slab, cream stone and warm gold trim, tall elegant windows, refined and slim.
```

Phase 1 chỉ cần bản Residential.

## 9.3. Tầng trệt — `base`

Cùng bóng và cùng bề ngang với `mid` của class đó. Thêm cửa đi và chân nhà nặng hơn. Không mái.

| File |
|---|
| `art\01-stack\bldg_residential_default_base.png` |
| `art\01-stack\bldg_industrial_default_base.png` |
| `art\01-stack\bldg_office_default_base.png` |
| `art\01-stack\bldg_highrise_default_base.png` |

```text
Stylized 2D mobile game illustration, clean bold silhouette, soft cel shading, warm late-afternoon daylight, crisp edges. The ground floor of a stackable building, strict side elevation facing right, same story height as an upper floor but with a street door and a heavier base. Flat pure magenta background #FF00FF. No text, no letters, no numbers, no logo, no people, no ground plane, no cast shadow, no roof, no crane.
```

Thêm đoạn class của mục 9.2. Với Residential, cửa là cửa nhà ấm. Industrial là cổng xưởng. Office là sảnh kính. High-rise là cửa lớn có viền vàng.

Nếu đang sửa ảnh: lấy `mid` đã duyệt, giữ chiều cao và bề ngang, đổi tầng giữa thành tầng trệt có cửa.

## 9.4. Mái — `roof`

Chân mái thẳng để ngồi lên sàn. Phần trang trí ở phía trên. Cùng họ hình với class.

| File |
|---|
| `art\01-stack\bldg_residential_default_roof.png` |
| `art\01-stack\bldg_industrial_default_roof.png` |
| `art\01-stack\bldg_office_default_roof.png` |
| `art\01-stack\bldg_highrise_default_roof.png` |

```text
Stylized 2D mobile game illustration, clean bold silhouette, soft cel shading, warm late-afternoon daylight, crisp edges. One rooftop cap in strict side elevation facing right, flat bottom edge so it can sit on a floor slab, decoration rising upward. Flat pure magenta background #FF00FF. No text, no letters, no numbers, no logo, no people, no ground, no cast shadow, no crane, no extra floors.
```

Thêm một đoạn:

```text
Residential: low warm roof, small chimney, blue awning shadow, friendly.
```

```text
Industrial: flat utility roof, wide, a vent box and a short pipe, red brick and dark steel.
```

```text
Office: clean glass crown, pale frame, a simple flat mechanical lip.
```

```text
High-rise: stepped cream-and-gold crown, the signature top of the tower, elegant and taller than the other roofs.
```

## 9.5. Cần cẩu

| | |
|---|---|
| File | `art\01-stack\crane_rig_default.png` |
| Kèm | `art\01-stack\crane_rig_default.json` sau khi chốt điểm neo |

```text
Stylized 2D mobile game illustration of a single tower crane in strict side elevation, jib pointing right. Sunflower-yellow mast and jib, dark steel joints, a small cabin on the jib, compact counterweight on the left. The hook point at the right end of the jib is empty: no cable, no hook, no load. Soft cel shading, bold silhouette, warm daylight, crisp edges. Flat pure magenta background #FF00FF. No text, no letters, no numbers, no logo, no building, no ground, no cast shadow.
```

## 9.6. Móc

| File | `art\01-stack\hook_hook_default.png` |

```text
Stylized 2D mobile game illustration of a single crane hook with a short pulley block, sunflower yellow and dark steel, matching a simple toy-like construction crane. Centered, bold silhouette, soft cel shading, crisp edges. Flat pure magenta background #FF00FF. No cable, no building, no text, no letters, no numbers, no ground, no cast shadow.
```

## 9.7. Mô hình cả tòa cho map

Đây là cả tòa nhà đã xây xong, dùng trên lưới. Không dùng để xếp tầng.

| File |
|---|
| `art\02-city\city_residential_default_mini.png` |
| `art\02-city\city_industrial_default_mini.png` |
| `art\02-city\city_office_default_mini.png` |
| `art\02-city\city_highrise_default_mini.png` |

```text
Stylized 2D mobile game illustration of one complete building, front three-quarter view, small enough to read as a map token, bold silhouette, soft cel shading, warm late-afternoon daylight, crisp edges. Flat pure magenta background #FF00FF. No text, no letters, no numbers, no logo, no people, no ground plane, no cast shadow, no crane.
```

Thêm một đoạn:

```text
Residential: a ten-story feeling walk-up, sand walls, blue awnings, many small balconies, compact and friendly. Not a skyscraper.
```

```text
Industrial: a wide heavy factory, red brick and charcoal steel, sawtooth roof machines, shorter than the towers but much broader.
```

```text
Office: a clean glass office tower, pale grid of windows, medium height, straight and corporate.
```

```text
High-rise: a slim cream-and-gold skyscraper with a stepped crown, the tallest of the four, elegant and iconic.
```

Bốn ảnh này đứng cạnh nhau phải cùng một tỷ lệ: High-rise cao nhất, Industrial thấp và rộng nhất.

## 9.8. Ô đất

| File | Việc |
|---|---|
| `art\02-city\lot_empty_default.png` | Ô trống |
| `art\02-city\lot_frame_default.png` | Khung khi chọn ô |

```text
Stylized 2D game tile of an empty city lot, slight top-down diamond, warm concrete pad with a soft dirt edge, no building. Bold readable shape, soft daylight, crisp edges. Flat pure magenta background #FF00FF. No text, no letters, no numbers, no logo, no trees, no cars, no shadow blob.
```

```text
Stylized 2D game tile, the same empty city lot diamond, drawn as a clean selection frame: thick warm-gold corner marks and an even edge, center empty. Flat pure magenta background #FF00FF. No text, no letters, no numbers, no building, no ground scenery.
```

## 9.9. Nền

| File | Dùng |
|---|---|
| `art\05-bg\bg_stack_default.png` | Sau lưng tòa đang xây. Có thể hoãn. |
| `art\05-bg\bg_downtown_default.png` | Nền map Downtown |

Nền không dùng magenta. Nền được vẽ kín.

```text
Wide stylized 2D game background of a clear late-afternoon sky over a distant soft city silhouette, warm blue sky, a few simple clouds, the skyline very faint and low in the frame so a crane and tower can sit in front. Painterly, no detail that competes with the foreground, no text, no letters, no logo, no characters.
```

```text
Stylized 2D top-down city district backdrop for a five-by-five lot grid, downtown blocks suggested around the edges only, warm pavement, a river corner and a few trees kept outside the center. The center stays visually calm so building tokens stay readable. Soft daylight, saturated but gentle, no text, no letters, no numbers, no logo, no individual hero building in the middle.
```

District sau này giữ bố cục đó và đổi chất: Harbor thêm nước, Old Town thêm mái ngói mờ, Winter thêm tuyết. Mỗi file là `art\05-bg\bg_{tên}_default.png`, với tên không dấu: `harbor`, `oldtown`, `business`, `riverside`, `tech`, `night`, `winter`.

## 9.10. Đổi theme từ ảnh default

Không viết lại bóng. Với từng file `default` đã căn, bảo tool sửa ảnh:

**Classic Brick** — lưu bằng cách đổi `default` thành `brick`.

```text
Keep the exact silhouette, width, story height, window rhythm, and camera. Change only the materials to classic red-brown brick, pale stone lintels, and a vintage sunflower crane if this image is the crane. Same magenta background, same empty margins. No text.
```

**Modern Glass** — `glass`.

```text
Keep the exact silhouette, width, story height, window rhythm, and camera. Change only the materials to pale steel and blue-green glass, cleaner frames, fewer bricks. Same magenta background, same empty margins. No text.
```

**Neon Future** — `neon`. Web trước. Playables chỉ nhận khi còn ngân sách zip.

```text
Keep the exact silhouette, width, story height, window rhythm, and camera. Change only the materials to dark panels with restrained cyan and magenta neon edges, still readable in daylight, not a blur of glow. Same magenta background outside the building, same empty margins. No text.
```

Bộ file theme, mỗi theme 18 file, chỉ trên web cho đến khi đo zip:

```text
bldg_{residential|industrial|office|highrise}_{brick|glass|neon}_{base|mid|roof}.png
crane_rig_{brick|glass|neon}.png
hook_hook_{brick|glass|neon}.png
city_{residential|industrial|office|highrise}_{brick|glass|neon}_mini.png
```

Old European, Winter Town, Industrial Retro, Coastal, Mid-Century, Art Deco Nights dùng lại câu "Keep the exact silhouette..." và một câu chất liệu. Chưa làm ở đợt 1.

Gợi ý chất liệu khi tới phase 9:

```text
Old European: warm plaster, stone arches, copper roof edges.
Winter Town: the same building with a thin snow cap and cool window light, silhouette unchanged.
```

## 9.11. UI

Icon một kiểu, một chủ thể, chừa viền, đọc được khi thu nhỏ. Nền magenta.

| File | Prompt thêm sau câu style |
|---|---|
| `art\03-ui\ui_life_default.png` | A single small heart-shaped life pip made of warm coral enamel, chunky and simple. |
| `art\03-ui\ui_combo_default.png` | A single circular combo meter rim, empty center, warm gold, slight tick marks, no digits. |
| `art\03-ui\ui_demolish_default.png` | A single chunky hammer cracking a tiny brick, clear at a glance. |
| `art\03-ui\ui_lock_default.png` | A single rounded padlock, warm steel and gold. |
| `art\03-ui\ui_daily_default.png` | A single tear-off calendar page with a sun mark, no numbers and no letters. |
| `art\03-ui\ui_perfect_default.png` | A single sharp four-point spark, warm white and gold. |

Câu đầy đủ là câu style mục 8.2, cộng câu ở bảng, cộng: `Centered game icon, generous padding, one subject only.`

Panel và nút, để 9-slice:

| File | Prompt |
|---|---|
| `art\03-ui\ui_panel_default.png` | A square UI window frame for a mobile game, ornament only in the four corners, edges perfectly straight and even so they can stretch, center fully empty and the same magenta as the outside. Warm cream and soft navy, soft cel shading. No text, no letters, no icons in the middle. |
| `art\03-ui\ui_button_default.png` | A square game button frame, same corner-and-straight-edge construction, warm gold face, empty center in magenta. No text, no icon. |

Huy chương. Cùng một hình khiên, chỉ đổi kim loại và một ký hiệu hình, không dùng chữ.

| File | Prompt thêm |
|---|---|
| `art\03-ui\medal_c_default.png` | A bronze shield medal with one horizontal bar. |
| `art\03-ui\medal_b_default.png` | A cool steel shield medal with two horizontal bars. |
| `art\03-ui\medal_a_default.png` | A warm gold shield medal with a small star. |
| `art\03-ui\medal_s_default.png` | A bright gold shield medal with a crown notch. |
| `art\03-ui\medal_splus_default.png` | A gold shield medal with a crown notch and a tiny second spark beside it, still no letters. |

Câu đầy đủ: câu style, cộng câu huy chương, cộng `Centered, generous padding, identical shield silhouette across the set.`

## 9.12. Hiệu ứng

Ưu tiên làm perfect và miss bằng code ở phase 2. Chỉ generate khi hiệu ứng code chưa đọc được.

| File | Prompt |
|---|---|
| `art\04-fx\fx_perfect_default.png` | Stylized 2D game impact flash, a tight gold-white starburst with a few short chips, bold and readable, centered. Flat pure magenta background #FF00FF. No text, no building, no smoke cloud that hides the tower. |
| `art\04-fx\fx_miss_default.png` | Stylized 2D game dust puff from a dropped block, a few warm gray chips and a short sideways dust curl, centered, readable. Flat pure magenta background #FF00FF. No text, no building, no flame. |

## 9.13. Icon và ảnh chia sẻ

| File | Đưa đi |
|---|---|
| `art\06-store\icon_app_512.png` | YouTube Playables icon, và `base-game-nextjs\app\icon.png` |
| `art\06-store\og_scene.png` | Chỉ web, xuất tiếp thành `base-game-nextjs\public\images\og.png` |

```text
App icon illustration, a sunflower-yellow tower crane hook lowering a single sand-colored apartment floor slab, bold silhouette, soft cel shading, warm daylight, centered with generous padding. Flat deep blue background, no text, no letters, no numbers, no logo, no watermark.
```

```text
Wide stylized 2D illustration of a small city at late afternoon, a slim cream-and-gold tower in front, a yellow crane above it, four different rooftops around it, warm and inviting, lots of clear sky on the left for a title to be added later. No text, no letters, no numbers, no logo, no watermark, no user interface.
```

## 9.14. Landmark, để phase 9

Chưa generate trong đợt này. Khi tới, mỗi landmark là một mini city, không phải sàn xếp tầng. File: `art\02-city\city_landmark_{tên}_default_mini.png`. Tên không dấu: `clocktower`, `hotel`, `radio`, `observatory`, `stadium`, `station`, `museum`, `spire`.

Mẫu cho Skyline Spire:

```text
Stylized 2D mobile game illustration of one complete landmark tower, front three-quarter view, a slim public spire with a viewing crown, cream stone and warm gold, distinct from a normal residential block and from the high-rise crown already designed. Bold silhouette, soft cel shading, warm daylight. Flat pure magenta background #FF00FF. No text, no letters, no logo, no people, no ground plane, no cast shadow.
```

Các landmark khác giữ câu đó, đổi đoạn mô tả công trình: đồng hồ, khách sạn lớn, tháp radio, đài thiên văn, sân vận động, ga trung tâm, bảo tàng.

## 9.15. Da cần cẩu thêm, phase 9–10

Sửa từ `crane_rig_default.png`. Giữ bóng và chiều cần. File `art\01-stack\crane_rig_{tên}.png`.

```text
Keep the exact crane silhouette, jib direction, and empty hook point. Change only the finish to clean white steel and pale blue glass. Same magenta background. No cable, no hook, no text.
```

```text
Keep the exact crane silhouette, jib direction, and empty hook point. Change only the finish to black steel with restrained gold joints. Same magenta background. No cable, no hook, no text.
```

```text
Keep the exact crane silhouette and empty hook point. Change only the finish to a thin layer of snow on the same yellow crane. Same magenta background. No cable, no hook, no text.
```

Tên file tương ứng: `crane_rig_whitesteel.png`, `crane_rig_blackgold.png`, `crane_rig_winter.png`. Móc đi kèm `hook_hook_whitesteel.png` và các tên cùng họ, sửa từ `hook_hook_default.png`.

---

# 10. Save gọn, để Playables không phình

Một blob, version ở field `saveVersion` của core. Khung Playables bọc thêm `{v, d}` riêng. Đổi hình dữ liệu thì tăng cả hai.

Nên có:

```text
profile cục bộ: tên hiển thị, assist đã bật hay chưa, skin đang chọn
city: 25 ô, mỗi ô vài số nguyên
stats và mastery: bộ đếm
missions: id theo ngày và cờ xong
achievements: bit
replay: một run gần nhất và một kỷ lục, mỗi drop là thời điểm cộng alignment
```

Không lưu snapshot vị trí từng frame. Population tính lại từ event khi cần.

Web phase 7 đưa city và lịch sử run lên server. Bản local vẫn là bản nháp khi mất mạng. Playables không gửi blob này đi đâu ngoài `saveData`.

---

# 11. Soft launch từng nền tảng

**Playables** khi xong phase 6: Quick Tower, Build City, Daily local, mission, thành tích, skin default, save YouTube, sendScore, quảng cáo YouTube giữa các run, Test Suite sạch, zip nên dưới 15 MiB.

**Web** khi xong phase 7: mọi thứ của Playables cộng tài khoản, bảng xếp hạng đã kiểm, replay cơ bản, My Towers, trang cách chơi, và ít nhất một theme ngoài default.

Cả hai soft launch đều chưa có: PvP realtime, bạn bè, shop, season pass, nhiều district, landmark, Wind Mode.

---

# 12. Việc cố ý để muộn

- Mười mode trên home.
- Energy.
- Skin đổi va chạm hoặc đổi điểm.
- Coi ngưỡng 70 / 250 / 550 là sự thật tuyệt đối.
- Backend bên trong core.
- Link, share, và shop trong build Playables.
- Đồng bộ save web với save YouTube.
- File nhạc lớn trước khi synth đã đủ cho bản chơi thử.
- Ảnh chụp UI giả để nộp store.

---

# 13. Việc ngay sau khi duyệt plan

1. Tạo cây thư mục mục 4, chưa cần sprite đẹp.
2. Generate A00 vào `art\00-style-anchor\`.
3. Duyệt bốn bóng và cần cẩu.
4. Generate ba file phase 1 vào `art\01-stack\`.
5. Bắt đầu phase 0 trong code chỉ khi A00 đã được nhận, để art và code gặp nhau ở phase 1.
