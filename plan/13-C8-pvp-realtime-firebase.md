# C8 — Solo PvP 1v1 Cược Xu (Coin Wager), Quan Sát Đối Thủ Trực Tiếp (Live Opponent View), Thống Kê Firebase RTDB & Chuẩn Hóa Asset Cần Cẩu

Trạng thái: Planned (21/10/2026). Dependency: C0–C7 & W1 đã hoàn thành. Scope: Core/Renderer/Content + Web (`base-game-nextjs` + `backend`) + cập nhật asset cần cẩu cho cả Web và Playable.

---

## 1. Tổng quan 4 trụ cột của Phase C8

1. **C8.1 — Chuẩn hóa lại Asset Cần cẩu & Điểm treo dây ở Cạnh dưới (`default`, `brick`, `winter`, `season`)**:
   - Sửa lại hình dáng 4 bộ cần cẩu sao cho **cạnh trên của thanh cẩu (top chord) dài hơn cạnh dưới (bottom chord)** và **ròng rọc / dây cáp treo từ CẠNH DƯỚI** (không còn treo ở cạnh trên cắt xuyên qua giàn thép).
2. **C8.2 — Hệ thống Tiền tệ `Coins` (Xu) & Cửa hàng Mua Skin Nhà / Cần cẩu (`Coin Shop`)**:
   - Tích luỹ `Coins` khi chơi đơn (Quick Tower, Build City, Daily, Rush, Sprint) để làm vốn đặt cược Solo PvP 1v1 và mua mở khóa trực tiếp mọi skin nhà, mái nhà, cần cẩu trong Sổ Kiến Trúc (`Architecture Book`).
3. **C8.3 — Solo PvP 1v1 Cược Xu (`Winner-Takes-All Coin Wager`) & Luật đấu Hết 3 Mạng**:
   - Chủ phòng cấu hình **Tổng tiền cược của cả 2 người (`totalPot = 2 × stakePerPlayer`)**.
   - Hai người chơi lấy `Coins` của mình ra đặt cược. Cả 2 cùng xây tự do với **3 mạng (`♥♥♥`)**.
   - Sau khi **cả 2 đều hết 3 mạng**, **ai xây được số tầng (`height`) thấp hơn sẽ thua cuộc**; **người thắng ăn trọn toàn bộ quỹ cược (`totalPot`)** (không phát xu thưởng miễn phí cho người thua).
4. **C8.4 — Cơ chế Quan sát Đối phương Trực tiếp (`Live Opponent View` trong Room & trong Trận) + Thống kê Realtime trên Google Firebase RTDB**:
   - **Trong Room chờ**: Nhìn thấy trực tiếp thẻ đối thủ, số `Coins`, huy hiệu, trạng thái `Đang chuẩn bị / Đã khóa cược`, biểu cảm nhanh (`Quick Emotes`) và **khung Preview trực tiếp bộ Skin Nhà + Cần cẩu của đối phương**.
   - **Trong lúc đang xây**: Nhìn thấy trực tiếp **Màn hình Tháp của đối phương (`Live Opponent Canvas` dạng Split-View / Picture-in-Picture)** với cần cẩu đang lắc, khối nhà đang rơi/trượt, nhãn `PERFECT! / MISS!` và chế độ **Xem toàn màn hình đối thủ (`Live Spectator`)** nếu mình hết 3 mạng trước.
   - **Trên Dashboard `/pvp`**: Thống kê thời gian thực qua **Google Firebase Realtime Database** (số người online, số trận đang đấu, tổng quỹ `Coins` đang cược trên toàn server, lịch sử kèo đấu trực tiếp, BXH Đại gia / Cao thủ PvP).

---

## 2. Thiết kế chi tiết từng phần

### Phần 1 (C8.1) — Sửa Asset Cần cẩu & Điểm treo dây ở Cạnh dưới

- **Vấn đề hiện tại**:
  - `crane_rig_default_sprite.png`: Mũi cần bên phải đang vát ngược (cạnh trên ngắn hơn cạnh dưới) và cụm ròng rọc đặt ở cạnh trên (`pulley: { x: 974, y: 64 }`).
  - `crane_rig_{brick,winter,season}_sprite.png`: Đầu mũi cần thẳng đứng và tọa độ `pulley` trong [`sprites.ts`](file:///d:/ANT_1/city-bloxx-main/packages/city-bloxx-renderer/src/sprites.ts) (`{ x: 931, y: 256 }`) đang nằm ở thanh ngang phía trên, khiến dây cáp nối từ cạnh trên cắt ngang qua thân cần cẩu.
- **Thiết kế chuẩn hóa**:
  ```
  [Đối trọng] === [Cabin] ======================= (Cạnh trên DÀI HƠN, vươn ra xa) ===\
                            \   /\   /\   /\   /\   /\   /\   /\   /\   /\   /\       \
                             =================================================[Ròng rọc]
                                                                    (Cạnh dưới NGẮN HƠN) |
                                                                                         | <-- Dây treo từ CẠNH DƯỚI
                                                                                        [🪝 Móc cẩu]
  ```
  - Vẽ/chuẩn hóa lại cả 4 file `crane_rig_{default,brick,winter,season}_sprite.png` (`1024×512` RGBA):
    - **Cạnh trên (Top Chord)** dài hơn **Cạnh dưới (Bottom Chord)** (đầu mũi cần vát chéo `\` từ mút trên bên phải thu vào mút dưới).
    - **Cụm ròng rọc treo cáp (Pulley)** gắn ở mặt dưới của **Cạnh dưới**.
  - Cập nhật `SPRITE_ANCHORS.crane.pulley` trong [`geometry.ts`](file:///d:/ANT_1/city-bloxx-main/packages/city-bloxx-renderer/src/geometry.ts) và `BRICK_ANCHORS.crane.pulley` trong [`sprites.ts`](file:///d:/ANT_1/city-bloxx-main/packages/city-bloxx-renderer/src/sprites.ts) xuống đúng tâm ròng rọc ở **cạnh dưới**.

---

### Phần 2 (C8.2) — Cơ chế Tích luỹ `Coins` (Chơi đơn) & Mua Skin Nhà / Cần cẩu

Để người chơi có `Coins` làm vốn đi cược PvP 1v1 và tiêu `Coins` thắng cược, hệ thống kinh tế được thiết kế như sau:

1. **Ví `Coins` trong `GameSave`**:
   - Khởi tạo người chơi mới với **`200 Coins` vốn khởi nghiệp** (`STARTING_COINS = 200`) để có thể lập phòng cược 1v1 ngay hoặc tích luỹ thêm.
   - Khi chơi các chế độ đơn (Quick Tower, Build City, Daily Tower, Perfect Rush, Skyline Sprint):
     - Mỗi tầng thân đáp thành công: **`+2 Coins`** (nếu đạt **Perfect**: **`+5 Coins`**).
     - Hoàn thành công trình hữu hạn (Build City / Daily Tower / Skyline Sprint 20F): thưởng thêm **`+30 Coins`**.
     - Nhận nhiệm vụ ngày: **`+15 Coins`**; nhận hợp đồng tuần: **`+50 Coins`**.
2. **Cửa hàng Mua Skin trực tiếp bằng `Coins` (`Architecture Book` $\rightarrow$ `Customize`)**:
   - Hiển thị số dư **`🪙 X Coins`** ở góc trên màn hình chính, Sổ Kiến Trúc và Sảnh PvP.
   - Mỗi vật phẩm trang bị trong [`cosmetics.ts`](file:///d:/ANT_1/city-bloxx-main/packages/city-bloxx-content/cosmetics.ts) có giá `coinPrice`:
     - **Skin Nhà (`building` — 4 class)**: `250 Coins` / nhà.
     - **Skin Mái (`roof` — 4 class + Mái Tuyết Mùa Đông)**: `200 Coins` – `350 Coins` / mái.
     - **Skin Cần cẩu (`crane`)**:
       - Cần cẩu Gạch cổ điển (`brick-crane`): `400 Coins`.
       - Cần cẩu Băng giá (`winter-crane`): `500 Coins`.
       - Cần cẩu Hoàng kim (`season-crane`): `600 Coins`.
   - Nếu người chơi chưa mở khóa skin theo mốc nhiệm vụ, nút **`Mua bằng Xu (🪙 X Coins)`** sẽ sáng lên khi đủ `Coins`. Bấm mua sẽ trừ `Coins`, thêm vào `save.inventory.owned` vĩnh viễn và cho phép trang bị ngay!

---

### Phần 3 (C8.3) — Cơ chế Cược Xu (`Coin Wager`) & Luật phân định Thắng/Thua trong Solo PvP 1v1

#### 1. Tạo phòng & Cấu hình Tổng tiền cược (`Total Pot Config`)
- Khi **Chủ phòng (`Host / P1`)** tạo phòng Solo 1v1, chủ phòng chọn **Tổng tiền cược của cả 2 người (`totalPot`)** (mỗi người đóng góp đúng `stakePerPlayer = totalPot / 2`):
  - Các mức chọn nhanh:
    - **`100 Coins`** (Mỗi người cược `50 Coins`)
    - **`200 Coins`** (Mỗi người cược `100 Coins`)
    - **`500 Coins`** (Mỗi người cược `250 Coins`)
    - **`1.000 Coins`** (Mỗi người cược `500 Coins`)
    - **`2.000 Coins`** (Mỗi người cược `1.000 Coins`)
    - **Tuỳ chỉnh (`Custom Pot`)**: Nhập số chẵn bất kỳ từ `20` đến `50.000 Coins` (không vượt quá `2 × P1.coins`).
- Chủ phòng có thể đổi mức `totalPot` ngay trong phòng chờ trước khi trận đấu bắt đầu (nếu đổi mức cược, trạng thái `Ready` của khách `P2` sẽ tự động reset để `P2` xác nhận lại mức cược mới, chống đổi kèo phút chót!).

#### 2. Khóa tiền cược (`Escrow`) khi Bắt đầu trận
- Cả `P1` và `P2` phải có `coins >= stakePerPlayer` mới bấm được nút **`Sẵn sàng & Đặt cược (Ready — Cược X 🪙)`**.
- Khi cả 2 đã bấm `Ready`, hệ thống chuyển trạng thái phòng sang `countdown` (`3-2-1`) rồi `active`, đồng thời **trừ tạm ứng (`escrow`) `stakePerPlayer` từ ví của mỗi người** đưa vào **`totalPot` (`2 × stakePerPlayer`)** nằm ở giữa bàn đấu.

#### 3. Luật xây & Phân định Thắng / Thua (`Winner-Takes-All`)
- **Trong trận**:
  - Cả 2 cùng xuất phát với **3 mạng (`lives = 3`)**, cùng loại nhà (`Residential` hoặc loại nhà chủ phòng chọn) và cùng hạt giống `seed`.
  - Hai bên cứ thế xây lên cao cho đến khi **cả 2 người chơi đều dùng hết 3 mạng (`p1.lives === 0 && p2.lives === 0`)**.
- **Cách tính Thắng / Thua sau khi cả 2 hết mạng**:
  1. **So sánh số tầng xây được (`height`)**:
     - **Ai có số tầng thấp hơn (`height` nhỏ hơn) $\rightarrow$ THUA CUỘC (`Loser`)**.
     - **Ai có số tầng cao hơn (`height` lớn hơn) $\rightarrow$ THẮNG CUỘC (`Winner`)**.
  2. **Nếu bằng đúng số tầng (`p1.height === p2.height`)**:
     - Xét **Dân số (`population`)** cao hơn thắng $\rightarrow$ Số lần **Perfect (`perfectCount`)** cao hơn thắng.
     - Nếu bằng nhau tuyệt đối mọi chỉ số $\rightarrow$ **HÒA (`Draw`)**.
- **Chia tiền cược (`Payout`)**:
  - **Người thắng (`Winner`)**: Nhận **100% `totalPot` (`+2 × stakePerPlayer`)** — tức thu hồi vốn cược và ăn trọn toàn bộ số `Coins` cược của đối phương!
  - **Người thua (`Loser`)**: Nhận **`0 Coins`** (mất `stakePerPlayer` đã đặt vào quỹ cược).
  - **Nếu Hòa tuyệt đối (`Draw`)**: Hoàn lại đúng `stakePerPlayer` cho mỗi người.
  - **Nếu 1 người bỏ cuộc / mất kết nối quá 15 giây (`Forfeit`)**: Người bỏ cuộc bị xử thua ngay lập tức, người còn lại ăn trọn `totalPot`.

---

### Phần 4 (C8.4) — Thiết kế "Nhìn thấy Đối phương Trực tiếp" (`Live Opponent View`)

Để trải nghiệm Solo 1v1 sống động như đang ngồi cạnh nhau, hệ thống đồng bộ trạng thái đối phương ở **2 giai đoạn**:

#### A. Giai đoạn 1: Trong Phòng Chờ (`Room Lobby View` — Trước trận đấu)

```
+-----------------------------------------------------------------------------------+
|  PHÒNG SOLO 1v1 · MÃ PHÒNG: [ BLOX99 ] [Sao chép]     QUỸ CƯỢC: 🪙 500 COINS     |
|                                                       (Mỗi người cược 250 Coins)  |
+-----------------------------------------+-----------------------------------------+
| 👤 BẠN (CHỦ PHÒNG)          🟢 Online   | 👤 ĐỐI THỦ: SkylinePro      🟢 Online   |
| 🏅 Huy hiệu: Mùa Đông  | Ví: 🪙 1,240   | 🏅 Huy hiệu: Gạch Cổ   | Ví: 🪙 890     |
| Thành tích PvP: 12 Thắng - 4 Thua       | Thành tích PvP: 9 Thắng - 5 Thua        |
|                                         | 💬 "🔥 Tăng cược lên 500 đi!"            |
| +-------------------------------------+ | +-------------------------------------+ |
| |   [Canvas Preview Trực Tiếp 240x150]| | |   [Canvas Preview Trực Tiếp 240x150]| |
| |   Tháp 3 tầng + Mái + Cần cẩu       | | |   Tháp 3 tầng + Mái + Cần cẩu       | |
| |   đang trang bị của BẠN             | | |   đang trang bị của ĐỐI THỦ         | |
| +-------------------------------------+ | +-------------------------------------+ |
| Trang bị: Nhà Gạch · Mái Tuyết · Cẩu Vàng| Trang bị: Nhà Mặc định · Cẩu Băng Giá  |
| Trạng thái: [ ✅ ĐÃ SẴN SÀNG (KHÓA 250🪙)]| Trạng thái: [ ⏳ ĐANG CHỌN TRANG BỊ... ]|
+-----------------------------------------+-----------------------------------------+
| Biểu cảm nhanh: [👋 Chào] [🔥 Tăng cược!] [⚡ Nhanh nào!] [😎 Tự tin] [Đổi Skin]   |
| Mức cược (Tổng Pot): ( ) 100🪙  ( ) 200🪙  (•) 500🪙  ( ) 1000🪙  [Tuỳ chỉnh...]  |
|                     [ BẮT ĐẦU / SẴN SÀNG CƯỢC 250 🪙 ]          [ Rời phòng ]    |
+-----------------------------------------------------------------------------------+
```

- **Những gì bạn nhìn thấy ở đối phương trong Room**:
  1. **Trạng thái hoạt động thời gian thực (`activityState`)**: Biết ngay đối phương đang `Ở trong phòng`, `Đang đổi Skin`, `Không đủ Xu cược`, hay `Đã bấm Sẵn sàng`.
  2. **Canvas Preview Tháp & Cần cẩu của đối phương**: Render trực tiếp bộ `equipment: { building, roof, crane }` của đối phương. Khi đối phương đổi skin cần cẩu hay skin nhà trong phòng, hình ảnh tháp mẫu bên thẻ đối phương tự động đổi theo ngay lập tức.
  3. **Bong bóng Biểu cảm / Chat nhanh (`Quick Emotes`)**: Gửi/nhận biểu cảm tức thì qua Firebase RTDB.

---

#### B. Giai đoạn 2: Trong Lúc Đấu (`In-Match Dual Live View` — Khi đang xây)

```
+-----------------------------------------------------------------------------------+
| 🟦 BẠN: 14 Tầng · 410 Dân · ♥♥♥         | 🪙 POT: 500 | 🟥 ĐỐI THỦ: 12 Tầng · ♥♥♡ |
|    Đang dẫn trước: +2 Tầng              |             |    Vừa thả: MISS! (-1 ♥)  |
+-------------------------------------------------------+---------------------------+
|                                                       | [MÀN HÌNH ĐỐI THỦ LIVE]   |
|                    [ CANVAS CHÍNH CỦA BẠN ]           | +-----------------------+ |
|                                                       | |      === [Cẩu ĐT]     | |
|              ===================[Cẩu]                 | |           |           | |
|                                  |                    | |         [Nhà]         | |
|                                [Nhà]                  | |         "MISS!"       | |
|                                                       | |        [Tháp 12F]     | |
|         --- Vạch độ cao đối thủ (Tầng 12) ---         | +-----------------------+ |
|                             [Tháp 14F]                | Trạng thái: Đang lắc...   |
|                             [Tháp 13F]                | Combo ĐT: ×0 | Độ lệch:48%|
+-------------------------------------------------------+---------------------------+
```

- **4 cơ chế giúp nhìn rõ đối phương đang chơi thế nào theo thời gian thực**:
  1. **Màn hình Canvas Trực tiếp của Đối thủ (`Live Opponent Mini-Canvas`)**:
     - Sử dụng một `QuickTowerGame` phụ chạy song song với cùng `seed` của phòng.
     - Mỗi khi đối phương bấm thả khối (`DropInput { sequence, tick, fraction }`) gửi qua Firebase RTDB, máy của bạn tái hiện **chính xác 100% cú thả đó trên Canvas của đối thủ**: nhìn thấy rõ cần cẩu đối thủ đang lắc, khối nhà rơi xuống khớp `PERFECT!` hay lệch mép nảy văng ra ngoài (`MISS!`), kèm đúng bộ Skin nhà/cần cẩu đối thủ đang mặc!
     - Đồng thời, định kỳ mỗi `12 ticks` (`200ms`), đối phương gửi gói đồng bộ `tick` hiện tại để cần cẩu trên màn hình phụ luôn lắc khớp nhịp thời gian thực với đối phương.
  2. **Vạch Ngang Độ Cao Đối Thủ (`Opponent Height Horizon Line`) ngay trên Canvas chính**:
     - Trên Canvas xây tháp của bạn có một đường kẻ ngang đứt nét màu đỏ cam đánh dấu **đỉnh tháp hiện tại của đối thủ (`OPPONENT: 12F`)** để bạn biết ngay mình đang cao hơn hay thấp hơn đối thủ bao nhiêu tầng mà không cần rời mắt khỏi tâm ngắm.
  3. **Thông báo Sự kiện Trực tiếp (`Live Match Feed Banner`)**:
     - Khi đối thủ đạt chuỗi `Perfect ×3`, `Perfect ×5` hoặc vừa bị `Miss mất 1 mạng (còn ♥♥♡)` hay `Đã hết sạch 3 mạng (Dừng ở tầng 16)`, một thông báo nhỏ hiện ngay trên thanh VS Bar để bạn nắm bắt tình hình tâm lý và chiến thuật (ví dụ: đối thủ đã chết ở tầng 16, bạn đang ở tầng 15 và còn 2 mạng $\rightarrow$ chỉ cần xây chắc chắn thêm 2 tầng nữa là chắc chắn ăn trọn `500 Coins`!).
  4. **Chế độ Khán giả Toàn màn hình (`Full-Screen Spectator Mode`) khi bạn hết mạng trước**:
     - Nếu bạn lỡ hết 3 mạng trước khi đối thủ hết mạng, bạn không bị đứng nhìn màn hình tĩnh — hệ thống tự động mở chế độ **Xem Trực Tiếp Màn Hình Đối Thủ (`Watching Opponent Live`)** phóng to Canvas của đối thủ để bạn theo dõi từng pha thả khối của họ cho đến khi họ hết mạng (hoặc vượt qua số tầng của bạn).

---

### Phần 5 (C8.4) — Cấu trúc Google Firebase Realtime Database (`RTDB Schema`)

```json
{
  "cityBloxxPvp": {
    "stats": {
      "global": {
        "onlinePlayers": 28,
        "activeMatches": 6,
        "totalMatchesCompleted": 412,
        "totalCoinsWagered": 185400,
        "biggestPotWon": 4000,
        "highestPvpTower": 47,
        "totalFloorsBuiltInPvp": 12890,
        "updatedAt": 1761013500000
      },
      "recentMatches": {
        "match_001": {
          "roomId": "room_xyz",
          "totalPot": 500,
          "winner": { "id": "u1", "name": "BuilderAlpha", "height": 24, "population": 610 },
          "loser": { "id": "u2", "name": "SkylinePro", "height": 19, "population": 480 },
          "endedAt": 1761013500000
        }
      },
      "leaderboard": {
        "u1": {
          "id": "u1",
          "name": "BuilderAlpha",
          "wins": 15,
          "losses": 3,
          "netCoinsWon": 4250,
          "bestHeight": 38,
          "elo": 1340
        }
      }
    },
    "rooms": {
      "room_xyz": {
        "roomId": "room_xyz",
        "roomCode": "BLOX99",
        "seed": 738192041,
        "building": "residential",
        "stakePerPlayer": 250,
        "totalPot": 500,
        "status": "waiting | countdown | active | settling | completed | aborted",
        "createdAt": 1761013400000,
        "startsAt": 1761013420000,
        "players": {
          "p1": {
            "id": "u1",
            "name": "BuilderAlpha",
            "coins": 1240,
            "wins": 12,
            "losses": 4,
            "badge": "winter-badge",
            "equipment": {
              "building": "brick-building-residential",
              "roof": "winter-roof-residential",
              "crane": "season-crane"
            },
            "activity": "ready",
            "ready": true,
            "stakeLocked": true,
            "connected": true,
            "emote": { "id": "fire", "text": "Tăng cược lên 500 đi!", "sentAt": 1761013410000 }
          },
          "p2": {
            "id": "u2",
            "name": "SkylinePro",
            "coins": 890,
            "wins": 9,
            "losses": 5,
            "badge": "brick-badge",
            "equipment": {
              "building": "default-building-residential",
              "roof": "default-roof-residential",
              "crane": "winter-crane"
            },
            "activity": "ready",
            "ready": true,
            "stakeLocked": true,
            "connected": true,
            "emote": null
          }
        },
        "live": {
          "p1": {
            "tick": 920,
            "height": 14,
            "population": 410,
            "lives": 3,
            "combo": 4,
            "perfectCount": 8,
            "lastPlacement": "perfect",
            "phase": "swing",
            "ended": false,
            "updatedAt": 1761013445000
          },
          "p2": {
            "tick": 915,
            "height": 12,
            "population": 330,
            "lives": 2,
            "combo": 0,
            "perfectCount": 5,
            "lastPlacement": "miss",
            "phase": "falling",
            "ended": false,
            "updatedAt": 1761013445000
          }
        },
        "drops": {
          "p1": { "0": { "sequence": 0, "tick": 32, "fraction": 0.01 } },
          "p2": { "0": { "sequence": 0, "tick": 38, "fraction": -0.45 } }
        },
        "result": {
          "winnerSlot": "p1",
          "loserSlot": "p2",
          "reason": "higher_tower",
          "totalPot": 500,
          "payouts": { "p1": 500, "p2": 0 },
          "netDelta": { "p1": 250, "p2": -250 },
          "p1Summary": { "height": 24, "population": 610, "perfectCount": 12, "lives": 0 },
          "p2Summary": { "height": 19, "population": 480, "perfectCount": 8, "lives": 0 },
          "verified": true,
          "settledAt": 1761013500000
        }
      }
    }
  }
}
```

---

## 3. Lộ trình thực thi từng bước (Execution Checklist)

- [ ] **Bước 1 (C8.1 — Asset Cần cẩu & Anchor cạnh dưới)**:
  - Sửa và xuất lại 4 file `crane_rig_{default,brick,winter,season}_sprite.png` với cạnh trên dài hơn cạnh dưới và ròng rọc nằm ở cạnh dưới.
  - Cập nhật `SPRITE_ANCHORS.crane` trong [`geometry.ts`](file:///d:/ANT_1/city-bloxx-main/packages/city-bloxx-renderer/src/geometry.ts) và `BRICK_ANCHORS.crane` trong [`sprites.ts`](file:///d:/ANT_1/city-bloxx-main/packages/city-bloxx-renderer/src/sprites.ts).
  - Kiểm tra `npm run assets:check` và test hiển thị dây treo từ cạnh dưới.
- [ ] **Bước 2 (C8.2 — Ví `Coins` & Mua Skin Nhà/Cần cẩu)**:
  - Thêm `coins` và `coinReceipts` vào `GameSave` (`save-state.ts`), thưởng `Coins` khi kết thúc lượt chơi đơn (`progression.ts` / `tracking.ts`), thêm hàm `buyCosmeticWithCoins(save, cosmeticId)` và `lockPvpStake` / `settlePvpWager`.
  - Cập nhật Sổ Kiến Trúc (`book-screens.ts`) để hiển thị số dư `Coins` và nút `Mua bằng Xu (🪙 X Coins)`.
- [ ] **Bước 3 (C8.3 & C8.4 — Firebase RTDB Adapter, Phòng chờ Live Preview & Màn hình Đấu 1v1 Dual-Canvas)**:
  - Tạo module `base-game-nextjs/lib/pvp/firebase-rtdb.ts` hỗ trợ kết nối **Google Firebase Realtime Database** (kèm Local Realtime Engine fallback để chạy ngay cả khi chưa điền key Firebase) và API xác thực kết quả `/api/v1/city-bloxx/pvp/*`.
  - Xây dựng giao diện **Phòng chờ Solo 1v1** (chọn mức tổng tiền cược `totalPot`, xem trực tiếp bộ Skin của đối phương trên Canvas Preview, gửi biểu cảm nhanh, khóa cược `Ready`).
  - Xây dựng giao diện **Thi đấu Solo 1v1 trực tiếp** (VS Bar + Quỹ cược `totalPot` + Vạch độ cao đối thủ + **Màn hình Canvas Trực tiếp của Đối thủ** + Chế độ xem toàn màn hình khi hết 3 mạng trước + Màn hình Kết quả trao toàn bộ `totalPot` cho người có số tầng cao hơn).
  - Xây dựng trang `/pvp` hiển thị **Bảng Thống kê Realtime từ Firebase RTDB** (Online, Trận đang đấu, Tổng xu cược, Lịch sử trận trực tiếp, BXH).
- [ ] **Bước 4 (C8.5 — Kiểm thử & Nghiệm thu `npm run evidence:c8`)**:
  - Viết unit tests (`c8-pvp-coins-crane.test.ts`) kiểm tra: toạ độ ròng rọc cạnh dưới cần cẩu, tích luỹ/mua skin bằng `Coins`, đặt cược/khóa cược/chia trọn `totalPot` cho người cao tầng hơn sau khi cả 2 hết 3 mạng, và đồng bộ thống kê Firebase RTDB.
  - Chạy kịch bản Chrome headless (`scripts/c8-evidence.cjs`) mô phỏng 2 người chơi tạo phòng cược `Coins`, nhìn thấy trang bị/tháp của nhau, đấu hết 3 mạng và xuất `plan/evidence/C8-validation.json`.
