# City Bloxx / Tower Bloxx — Research tổng hợp

> Tài liệu tổng hợp về **City Bloxx / Tower Bloxx bản Nokia/J2ME gốc của Digital Chocolate**.  
> Trọng tâm: cơ chế game, vòng lặp gameplay, chế độ chơi, điều kiện game over, cách tính điểm/population, combo, building types và city planning.

---

## 1. City Bloxx thực chất là game gì?

City Bloxx là game kết hợp giữa:

- **Arcade / timing:** canh thời điểm thả từng tầng nhà.
- **Physics nhẹ:** tầng nhà bị treo trên cần cẩu, đung đưa qua lại.
- **Stacking:** xếp càng thẳng thì tòa nhà càng ổn định.
- **Score attack:** cố tạo combo để tăng dân số/điểm.
- **Puzzle / city planning:** trong Build City, phải đặt các loại tòa nhà đúng vị trí trên bản đồ 5×5.

Cơ chế cơ bản rất đơn giản: một tầng nhà được treo trên cần cẩu và dao động ngang. Người chơi chỉ cần **một nút** — trên điện thoại Nokia thường là `5` hoặc nút OK — để thả tầng đó xuống.

Độ khó phát sinh từ việc:

> tầng trên lệch → trọng tâm tòa nhà lệch → tòa nhà lắc nhiều hơn → tầng tiếp theo khó căn hơn → càng cao càng khó.

---

## 2. Gameplay loop cơ bản

Một lượt xây nhà có thể hiểu theo vòng lặp:

```text
Cần cẩu đưa block vào
↓
Block đung đưa
↓
Người chơi bấm
↓
Block rơi
↓
Kiểm tra va chạm
↓
Cộng population / combo
↓
Tower lắc
↓
Block tiếp theo xuất hiện
```

Điểm quan trọng là game **không cho người chơi điều khiển trái/phải**.

Người chơi chỉ điều khiển:

> **thời điểm thả block.**

Đây là lý do game rất dễ học nhưng vẫn có skill ceiling tương đối cao.

---

## 3. Các kết quả khi thả một tầng

### 3.1. Perfect / gần như hoàn hảo

Ví dụ:

```text
██████
██████
██████
```

Kết quả:

- tower rất ổn định;
- dân số tăng tốt;
- kích hoạt hoặc kéo dài **Combo**;
- Combo meter được nạp/reset;
- những tầng tiếp theo trong thời gian combo được bonus population.

---

### 3.2. Đặt được nhưng bị lệch

Ví dụ:

```text
    ██████
  ██████
██████
```

Tầng vẫn được tính.

Nhưng tower sẽ:

- lệch;
- dao động mạnh hơn;
- khó xây tầng sau hơn;
- population thấp hơn so với placement đẹp;
- combo có thể bị mất.

Điểm hay trong thiết kế là game không nhất thiết phạt ngay lập tức một cú đặt xấu. Nó biến cú đặt xấu thành **độ khó tăng lên trong tương lai**.

---

### 3.3. Miss hoàn toàn

Ví dụ:

```text
            █████
              ↓
    █████
    █████
    █████
```

Block không chạm đủ vào tower và rơi xuống.

Người chơi mất **1 chance/life**.

Trong bản gốc, người chơi thường có **3 lần miss** cho một quá trình xây.

---

## 4. Tower sway — cơ chế vật lý quan trọng

Tower không đứng yên.

Tower đẹp:

```text
     │
     │
     │
     │
```

dao động nhỏ.

Tower lệch:

```text
       /
      /
     /
    /
```

dao động lớn.

Có thể hình dung logic:

```text
alignment error
↓
center-of-mass error
↓
tower sway increases
↓
next placement harder
↓
higher chance of further error
```

Từ đó tạo ra negative feedback loop:

```text
1 lỗi
↓
tower khó điều khiển hơn
↓
dễ mắc lỗi thứ 2
↓
tower càng lắc
↓
dễ chết hơn
```

Do đó tension tăng dần tự nhiên theo quá trình xây.

---

## 5. Combo hoạt động như thế nào?

Một cú đặt Perfect kích hoạt **Combo Meter**.

```text
Perfect!
COMBO ██████████
```

Meter giảm dần theo thời gian.

Trong khoảng thời gian combo đang hoạt động, mỗi tầng đặt tiếp theo sẽ đem lại **bonus population**.

Nếu tiếp tục Perfect trước khi meter hết:

```text
Perfect
↓
Combo active
↓
block
↓
Perfect
↓
Combo refreshed
↓
block
↓
Perfect
...
```

Người chơi có thể duy trì chuỗi rất dài.

Điểm quan trọng về thiết kế:

> Người chơi phải lựa chọn giữa việc chờ lâu để căn chuẩn và việc thả nhanh hơn để tận dụng thời gian combo.

---

## 6. Điểm trong City Bloxx thực chất là gì?

Cơ chế trọng tâm không chỉ là một con số score thông thường.

Hệ thống chính là:

# Population — dân số

Nói cách khác:

> xây càng chính xác → càng nhiều người chuyển vào tòa nhà → population càng cao.

Có thể coi gần đúng:

```text
SCORE ≈ POPULATION
```

đặc biệt trong Build City.

---

## 7. Population của một tầng phụ thuộc vào gì?

Không có một công thức toán học hoàn chỉnh được công bố rộng rãi, nhưng các yếu tố chính gồm:

```text
Population
=
base floor value
× alignment quality
× combo bonus
+ roof bonus
```

Đây chỉ là mô hình hóa cơ chế, không phải công thức code chính thức.

### Alignment

```text
perfect alignment
→ nhiều resident
```

```text
bad alignment
→ ít resident
```

### Combo

```text
floor population × bonus/multiplier
```

Chuỗi combo dài có thể tạo chênh lệch population rất lớn.

### Height

Ở Quick Game, tầng cao hơn thường đem lại nhiều resident hơn.

### Roof

Trong Build City, cuối mỗi building có một lần thả **roof** riêng.

Roof càng đẹp → population bonus càng cao.

Một số tower nếu đạt điều kiện population còn mở được **special / bonus roof**.

---

## 8. Hai mode chính

## Quick Game

Pure arcade.

```text
BUILD
BUILD
BUILD
BUILD
...
```

Không có city planning.

Mục tiêu:

> xây tower cao nhất / dân số cao nhất có thể trước khi mất hết mạng.

---

## Build City

Đây là mode có chiều sâu chiến thuật hơn.

Gameplay loop:

```text
CITY MAP
↓
chọn loại building
↓
BUILDING MINI GAME
↓
xây đủ số tầng
↓
đặt roof
↓
population được tính
↓
đặt building lên map
↓
city population tăng
↓
unlock building mới
↓
lặp lại
```

Nó kết hợp reflex + strategy.

---

## 9. Build City dùng bản đồ 5 × 5

Grid:

```text
□ □ □ □ □
□ □ □ □ □
□ □ □ □ □
□ □ □ □ □
□ □ □ □ □
```

Tổng cộng:

**25 ô đất.**

Mỗi ô chứa tối đa một building.

Điều này biến game thành một bài toán city planning thực sự.

---

## 10. Bốn loại building cơ bản

| Màu | Số tầng | Vai trò |
|---|---:|---|
| 🔵 Blue | 10 | Residential |
| 🔴 Red | 20 | Industrial |
| 🟢 Green | 30 | Office |
| 🟡 Yellow | 40 | High-rise / highest tier |

Khi bắt đầu:

```text
ONLY BLUE AVAILABLE
```

Các loại khác được unlock khi city population / city level tăng.

---

## 11. Luật đặt building

### Blue

```text
B
```

Có thể đặt ở **bất kỳ ô trống nào**.

---

### Red

Red yêu cầu có ít nhất một Blue ở ô liền cạnh.

Ví dụ hợp lệ:

```text
B R
```

---

### Green

Green cần cả Blue + Red ở các ô liền cạnh.

Ví dụ:

```text
 B
 G R
```

---

### Yellow

Yellow cần Blue + Red + Green ở các ô liền cạnh.

Ví dụ:

```text
    B
R   Y   G
```

---

## 12. Adjacency không tính diagonal

Chỉ tính:

```text
UP
DOWN
LEFT
RIGHT
```

Diagonal không được tính là neighbour.

Ví dụ hợp lệ:

```text
    B
R   Y
    G
```

Ví dụ diagonal thì không đủ điều kiện:

```text
B   .
  Y
.   G
```

---

## 13. Vì sao Yellow khó xây?

Yellow cần ba loại building khác bao quanh.

Corner chỉ có tối đa hai neighbour:

```text
Y □
□ □
```

Do đó Yellow không thể đặt ở corner bằng rule bình thường.

Ô trung tâm có tối đa:

```text
4 neighbours
```

nên phù hợp nhất cho Yellow.

Đây là phần khiến late game trở thành bài toán tối ưu bố trí.

---

## 14. Building có thể bị phá và thay thế

Trong Build City, có thể **demolish** một building rồi xây building khác lên ô đó.

Điều này mở ra strategy kiểu:

```text
Build Blue
↓
Blue unlocks Red
↓
build Red
↓
Red + Blue unlock Green placement
↓
build Green
↓
use all three to construct Yellow
↓
later demolish temporary Blue/Red
↓
replace with higher value towers
```

Vì vậy board cuối cùng không nhất thiết phản ánh đúng trình tự xây ban đầu.

---

## 15. City progression

Build City có progression thông qua:

```text
TOTAL POPULATION
↓
CITY LEVEL
↓
unlock content
```

Một số tài liệu cũ ghi nhận khoảng **20 milestone / city levels**, tiến dần đến trạng thái **Megalopolis**.

Long-term progression loop:

```text
tower quality
↓
tower population
↓
city population
↓
city level
↓
new building
↓
more efficient city
↓
more population
```

---

## 16. Game Over trong Quick Game

Quick Game dùng hệ thống ba miss:

```text
♥ ♥ ♥
↓
♥ ♥
↓
♥
↓
0
```

Sau **3 missed drops**:

# GAME OVER

Lúc đó score / high score của run được hiển thị hoặc lưu lại.

---

## 17. Build City không game over giống Quick Game

Trong Build City, ba miss chủ yếu kết thúc **quá trình xây tòa nhà hiện tại**, không nhất thiết kết thúc toàn bộ city run.

Có thể hình dung:

### Quick Game

```text
3 misses
↓
RUN OVER
```

### Build City

```text
3 misses
↓
CURRENT BUILDING ENDS
↓
poor building
↓
return to city
```

Tùy phiên bản, cách xử lý roof có thể hơi khác, nhưng điểm quan trọng là:

> không nên thiết kế Build City theo kiểu 3 miss = mất cả thành phố.

---

## 18. Roof trong Build City

Mỗi loại building có số tầng cố định:

```text
Blue   = 10 floors
Red    = 20 floors
Green  = 30 floors
Yellow = 40 floors
```

Sau khi đủ tầng, game cho người chơi thả:

# ROOF

Roof cũng phải canh timing.

Roof càng đẹp → population bonus càng cao.

Cấu trúc tension:

```text
floor 1
floor 2
...
floor 28
floor 29
floor 30
↓
ROOF
↓
FINAL POPULATION
```

Một cú roof xấu ở cuối có thể làm giảm kết quả của cả run.

---

## 19. Special / Bonus Roof

Khi đạt population đủ cao cho một loại building, game có thể unlock **bonus roof**.

Một số nguồn cũ ghi nhận các threshold xấp xỉ như:

```text
Blue bonus roof ≈ 70 residents
Red bonus roof ≈ 250
Green bonus roof ≈ 550
```

Các con số này có thể khác giữa các revision J2ME, nên không nên coi là tuyệt đối cho mọi bản.

---

## 20. Mục tiêu thực sự của Build City

Mục tiêu không phải chỉ là lấp đầy 25 ô.

Mục tiêu thực sự là:

> **tối đa hóa tổng population trong 25 ô đất hữu hạn.**

Yellow có tiềm năng population cao hơn nhiều, nhưng:

```text
Yellow requires B + R + G
```

Do đó game tạo ra bài toán:

> cần các building cấp thấp để mở điều kiện xây building cấp cao, nhưng building cấp thấp lại chiếm đất.

Đây là core strategy quan trọng nhất của Build City.

---

## 21. Core loop tổng thể của City Bloxx

```text
             ┌─────────────┐
             │ CITY MAP    │
             └──────┬──────┘
                    ↓
             CHOOSE BUILDING
                    ↓
             STACK FLOORS
                    ↓
           ALIGNMENT CHECK
              ↙          ↘
          PERFECT         BAD
            ↓              ↓
          COMBO          SWAY ↑
            ↓              ↓
       POPULATION        HARDER
             ↘            ↙
              NEXT FLOOR
                    ↓
                  ROOF
                    ↓
            TOWER POPULATION
                    ↓
              PLACE ON GRID
                    ↓
             CITY POPULATION
                    ↓
               CITY LEVEL
                    ↓
           UNLOCK NEW TOWER
                    ↓
                 REPEAT
```

---

## 22. Vì sao City Bloxx gây nghiện?

Game có bốn vòng feedback chồng lên nhau.

### Immediate loop

```text
swing → timing → drop
```

### Short-term loop

```text
perfect → combo → population
```

### Mid-term loop

```text
population → unlock tower
```

### Long-term loop

```text
city layout
→ optimize 25 slots
→ maximize population
→ reach Megalopolis
```

Vì vậy mặc dù control chỉ có **một nút**, game vẫn có cả:

- reflex;
- mastery;
- score chasing;
- puzzle;
- progression.

---

## 23. Các phần nên research tiếp

### Phần 2 — Scoring
- Population từng block
- Perfect
- Combo Meter
- Multiplier
- Roof
- Special roof
- High score

### Phần 3 — Build City
- Blue / Red / Green / Yellow
- Unlock condition
- City level
- 5×5 grid
- Demolish / replace
- Cách đạt population tối đa

### Phần 4 — Physics
- Crane swing
- Tower sway
- Collision
- Miss detection
- Có thể reverse-engineer thành công thức để code clone

### Phần 5 — Game Design Spec
Chuyển toàn bộ City Bloxx thành specification cho dev:
- state machine
- variables
- scoring pseudocode
- game-over conditions
- UI / HUD
- progression

### Phần 6 — So sánh phiên bản
- City Bloxx Nokia / J2ME
- Tower Bloxx Flash
- Tower Bloxx Deluxe
- Các bản remake Android

Mục đích là tránh lấy nhầm mechanic giữa các version.

---

## 24. Ghi chú quan trọng

Công thức population chính xác của bản gốc không được tài liệu chính thức công bố rõ ràng.

Do đó khi cần reverse-engineer game để clone, nên chia dữ liệu thành hai nhóm:

- **Mechanic đã xác minh chắc chắn**
- **Giá trị / threshold thay đổi theo version hoặc cần kiểm chứng thêm**

Đặc biệt phần **scoring algorithm**, combo bonus, population từng floor và threshold bonus roof nên được research thêm trước khi dùng làm thông số code chính thức.
