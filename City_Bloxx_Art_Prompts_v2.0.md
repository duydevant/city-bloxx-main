# City Bloxx — Prompt, asset và thư mục v2.0

**Thay thế phần stack building từ 07/10/2026:** dùng [Art Prompts v3 — compact 1,2:1](City_Bloxx_Art_Prompts_v3.0.md). Thông số 256×128 trong v2 không còn áp dụng cho ảnh building mới; các loại asset khác giữ nguyên.

Ngày 06/10/2026. Đi cùng [Development Plan v2](City_Bloxx_Development_Plan_v2.0.md).

Tài liệu này cung cấp prompt để sản xuất ảnh; chưa generate ảnh. Tất cả hình là thiết kế original. Mọi đường dẫn tương đối tính từ `D:\ANT_1\city-bloxx-main\`.

## 1. Hướng mỹ thuật đề xuất

**Daylight City:** 2D stylized, hình khối rõ, cel shading nhẹ, ánh sáng ấm từ trên trái. Tươi, dễ đọc trên điện thoại, có chi tiết kiến trúc nhưng không vụn. Art đẹp ở kích thước chơi thật quan trọng hơn đẹp khi zoom ảnh nguồn.

Hai camera khác nhau:

- **Stack:** front orthographic elevation, không phối cảnh hội tụ, cạnh trên/dưới nằm ngang. Mỗi sprite `mid` chỉ là một tầng; các tầng phải ghép thành tòa cao mà không lộ khe.
- **City:** mô hình nguyên tòa, góc isometric 2:1 thống nhất với ô đất. Minis là biểu tượng class, không phản ánh chính xác 10/20/30/40 tầng. Số tầng/population thật hiện trong UI.

| Class ID | Nhận diện | Màu nhấn default | Mái |
|---|---|---|---|
| `residential` | Cửa sổ đôi, ban công nhỏ, thân thiện | Blue `#4B91D1`, cát `#E8CF9E` | Flat parapet, bồn nước nhỏ |
| `industrial` | Khung dày, cửa sổ ngang, panel thép | Red `#C45B4E`, charcoal `#38434D` | Vent/ống khói thấp |
| `office` | Nhịp kính thẳng, mullion đều | Green `#4B9D89`, kính `#B9DBDF` | Clean flat cap |
| `highrise` | Gân dọc, nhịp cửa thanh, sang | Yellow `#D9B34C`, cream `#F0E4C7` | Crown bậc, spire ngắn |

Dùng màu và hình đồng thời; không chỉ đổi màu bốn hình giống nhau. Độ khó/width do class config quyết định, không do model vẽ đẹp hay xấu.

**Baseline để làm prototype:** bốn class cùng collision width và story height; khác silhouette bằng cửa/khung/mái. Nếu C1 cần width khác, khóa bảng geometry mới trước A02 rồi mới xuất lại art. Skin trong cùng class luôn giữ geometry đã khóa.

## 2. Nơi lưu — ba bước dễ nhớ

```text
art/source/...       ảnh vừa generate, chưa đưa vào game
        ↓ chọn, sửa, tách nền, căn hình
art/approved/...     PNG RGBA chuẩn, đã kiểm tra, nguồn xuất chính
        ↓ export/optimize theo manifest
art/exports/web/... và art/exports/youtube/...
        ↓ sync đúng target
base-game-nextjs/public/game/...
base-playable-main/public/game/...
```

Ảnh generate mới bỏ vào `source`, không ghi đè ảnh đã duyệt. Game không load trực tiếp `art/`. `exports` là staging; `public/game` là runtime thật. Script export/sync sẽ triển khai ở C0–C3; hiện chưa có pipeline tự động.

```text
art/
├── README.md
├── reference/                       ảnh tham chiếu/style đã duyệt, không ship
├── source/
│   ├── style/
│   ├── stack/default/
│   ├── city/default/
│   ├── ui/default/
│   ├── fx/default/
│   ├── bg/default/
│   ├── marketing/
│   └── audio/                       âm thanh về sau, không dùng prompt ảnh
├── approved/
│   ├── stack/default/
│   ├── city/default/
│   ├── ui/default/
│   ├── fx/default/
│   ├── bg/default/
│   └── marketing/
└── exports/
    ├── web/                         game/..., images/... hoặc icon export
    └── youtube/                     game/...; submission/ nằm riêng
```

Theme tiếp theo thay folder `default` bằng `brick`, `glass`, `european`, `neon`, `winter`... Không đưa folder source hay thumbnail marketing vào gói game YouTube.

Các thư mục ngoài `art/README.md` trong cây trên là thư mục dự kiến; tạo khi nhận asset đầu tiên. Không cần tạo các file PNG rỗng để giữ chỗ.

## 3. Quy tắc tên file và mapping chính xác

```text
Nguồn:   {category}_{subject}_{theme}_{part}_v001.png
Duyệt:   {category}_{subject}_{theme}_{part}.png
Runtime: giữ basename bản duyệt, tối ưu PNG trước; WebP chỉ đổi sau khi QA
```

Tên chỉ chữ thường ASCII, số và `_`, không dấu/khoảng trắng. ID trong catalog không chứa extension. Revision `_v002` chỉ ở source; thay asset runtime phải có `contentVersion`/hash manifest để tránh cache cũ.

| Loại | File nguồn ví dụ | Bản duyệt | Đích runtime |
|---|---|---|---|
| Tầng lặp | `art/source/stack/default/bldg_residential_default_mid_v001.png` | `art/approved/stack/default/bldg_residential_default_mid.png` | `<APP>/public/game/stack/default/bldg_residential_default_mid.png` |
| Mini city | `art/source/city/default/city_office_default_mini_v001.png` | `art/approved/city/default/city_office_default_mini.png` | `<APP>/public/game/city/default/city_office_default_mini.png` |
| Nền | `art/source/bg/default/bg_downtown_default_map_v001.png` | `art/approved/bg/default/bg_downtown_default_map.png` | `<APP>/public/game/bg/default/bg_downtown_default_map.png` |
| UI | `art/source/ui/default/ui_life_default_icon_v001.png` | `art/approved/ui/default/ui_life_default_icon.png` | `<APP>/public/game/ui/default/ui_life_default_icon.png` |
| Icon app | `art/source/marketing/icon_app_default_square_v001.png` | `art/approved/marketing/icon_app_default_square.png` | `base-game-nextjs/app/icon.png`; bản submission YouTube để riêng |
| OG | `art/source/marketing/og_city_default_landscape_v001.png` | `art/approved/marketing/og_city_default_landscape.png` | `base-game-nextjs/public/images/og_city.png` |

`<APP>` là `base-game-nextjs` hoặc `base-playable-main`. Chỉ copy asset có target trong manifest. URL web: `/game/stack/default/bldg_residential_default_mid.png`; URL Playables: `./game/stack/default/bldg_residential_default_mid.png`.

So với plan v1.0: thay thư mục số `art/01-stack` bằng `art/source/stack/default`; `hook_hook_default` thành `crane_hook_default_sprite`; huy chương thống nhất trong `ui/default`, không có thêm thư mục `medal`. Nếu đã có ảnh theo tên cũ, map vào manifest mới khi import, không xóa nguồn cũ.

## 4. Hợp đồng kỹ thuật của ảnh

Các kích thước dưới là khổ **xuất cuối**. Tool có thể generate lớn hơn rồi crop/resize bằng editor. Prompt không bảo đảm pixel-perfect: phải kiểm tra và căn lại.

**Cập nhật theo phản hồi về nhà bị dài/nhiều gian:** body của base/mid đổi từ 384×96 (4:1, quá dài) thành **256×128 (2:1)** trên canvas 512×256. Đây là kích thước của **một tầng thuộc một tòa nhà duy nhất**, không phải hai hoặc ba căn nhà ghép ngang. Cả bốn class dùng cùng khung này ở baseline; phân biệt bằng mặt tiền/vật liệu, không nhân số căn. Quy cách mới bên dưới thay thông số cũ; chưa có runtime code cần migrate trong lượt sửa tài liệu này.

| Loại | Khổ PNG runtime | Alpha | Điểm neo/quy tắc |
|---|---:|:---:|---|
| `base`, `mid` | 512×256 | Có | Body 256×128, x=128..384, y=64..192; origin (256,192); cao tầng 128 px |
| `roof` | 512×256 | Có | Chân mái tại y=192; footprint rộng 256 px, x=128..384; toàn bộ mái trong y=32..192 |
| Crane rig | 1024×512 | Có | Lưu `cableAnchorPx` đo từ ảnh đã duyệt; không đoán tọa độ trước |
| Crane hook | 128×128 | Có | Top cable socket tại giữa phía trên; `blockAttachPx` đo thực |
| City mini/landmark | 256×384 | Có | Ground anchor (128,320), cùng góc iso; chừa 64px dưới |
| City lot | 256×128 | Có | Diamond đỉnh (128,8),(240,64),(128,120),(16,64), center (128,64) |
| Icon, medal, FX | 128×128 | Có | Center (64,64), padding ≥12 px |
| Panel tùy chọn | 256×256 | Có | 9-slice inset 24 px, cần artist căn chính xác |
| Stack sky | 1024×1536 | Không | Không kéo dãn; layer gradient/crop theo camera |
| Map background | 1536×1024 | Không | Vùng giữa 65% yên; lot grid là layer riêng |
| App icon | 512×512 | Không | Chủ thể giữa, safe margin 12%; không chữ |
| Web OG | 1200×630 | Không | Chữ được layout sau, không nhờ AI vẽ chữ |

`mid` phải phủ kín body tới cạnh trên/dưới tại cùng x; outline ở cạnh ghép nên mỏng hoặc do renderer vẽ một lần. Không có mái/đất/bóng đổ phía dưới mỗi tầng. Renderer đặt origin tầng tiếp theo cách 128 source pixels quy đổi sang world units, **không** cách 256px canvas. Transparent padding không phải collision box.

### 4.1. Kích thước phần nhà bên trong ảnh — dùng cho cả bốn `mid`

| Thành phần | Pixel trên canvas 512×256 | Tỷ lệ canvas |
|---|---|---|
| Khối nhà duy nhất | Rộng 256, cao 128 | 50% rộng × 50% cao |
| Khoảng trống trái/phải | 128 mỗi bên | 25% mỗi bên |
| Khoảng trống trên/dưới | 64 mỗi bên | 25% mỗi bên |
| Tỷ lệ bản thân khối nhà | Rộng:cao = 2:1 | Không kéo dài để chứa thêm cửa |
| Cửa sổ | Một cụm duy nhất ở giữa; industrial 1 cửa rộng, office 1 mảng kính chia 2 bằng mullion mảnh | Là chi tiết trên cùng một mặt tiền, không phải căn nhà riêng |

Nếu tool chỉ hỗ trợ 1536×1024, yêu cầu cùng tỷ lệ **khối nhà 2:1**, rộng 768×cao 384 và nằm giữa; sau đó crop canvas thành 1536×768 (padding trái/phải 384, trên/dưới 192), resize đều xuống 512×256. Không ép ảnh 3:2 thành 2:1 bằng stretch. Cách dễ nhất là dùng canvas 2:1 ngay khi công cụ hỗ trợ.

Một tầng `mid` không có mái, cửa ra vào hay sân. Nếu cần hình **nguyên một căn/tòa nhà** có mái và cửa, đó là `city_*_mini`, không phải `bldg_*_mid`.

Đợt đầu dùng base như tầng đầu tiên có thể thả, mid từ tầng 2; base không phải một tầng bonus cộng ngoài 10/20/30/40. Ground platform nếu có sẽ vẽ bằng code. Roof không tính vào floors.

Mini city có chân đúng anchor; renderer neo vào center lot. Vẽ từ hàng xa tới gần để tránh che sai thứ tự; UI hit area theo lot, không theo pixel mini. Missing sprite dùng placeholder và log asset ID, không làm ngừng game.

Metadata mẫu **để triển khai**, không phải file đang được game đọc:

```json
{
  "id": "bldg_residential_default_mid",
  "source": "art/approved/stack/default/bldg_residential_default_mid.png",
  "path": "stack/default/bldg_residential_default_mid.png",
  "targets": ["web", "youtube"],
  "loadGroup": "core",
  "sizePx": [512, 256],
  "originPx": [256, 192],
  "visualBodyPx": [128, 64, 256, 128],
  "storyStepPx": 128,
  "geometryId": "residential_v1",
  "contentVersion": 1
}
```

Geometry va chạm chính thức nằm trong ruleset. Metadata này căn renderer, không cho skin tự định nghĩa lợi thế gameplay. Atlas trimming phải giữ original size/offset/pivot, có gutter và edge extrusion để tránh viền rò khi scale.

## 5. Cách dùng prompt

Với sprite: ghép **S + mô tả từng file + N**. Các prompt edit cần attach ảnh đã duyệt. Với background/marketing dùng prompt riêng; không thêm S vì S yêu cầu nền trong suốt.

**S — prefix sprite:**

```text
Create one original production sprite for a friendly 2D city-stacking mobile game. Clean bold shapes, crisp edges, restrained soft cel shading, warm daylight from upper left, readable at small size. Match the attached approved Daylight City reference in materials, palette and line weight. Isolated single asset on a truly transparent RGBA background with clean alpha edges, no painted checkerboard. Keep generous transparent padding and the whole object inside the canvas.
```

Nếu chưa có reference thì bỏ câu `Match the attached...`; sau A00 luôn attach reference. Bật tùy chọn transparent background của công cụ nếu có. Nếu công cụ không xuất alpha: dùng một nền phẳng màu chưa có trên chủ thể, ghi rõ để artist tách nền. Không mặc định magenta vì Neon có magenta và dễ bị mất chi tiết khi key.

**N — suffix hạn chế:**

```text
No text, letters, numerals, watermark, brand logo, existing game artwork, photorealism, depth of field, motion blur, characters, ground plane, cast shadow outside the object, baked UI, or additional objects. Do not crop the subject. Do not include multiple alternatives in one image.
```

Đây là prompt sinh nội dung; artist chịu trách nhiệm chỉnh seam, scale, alpha, palette. Không nhờ model tạo atlas tự căn hoặc spritesheet nhiều frame chính xác rồi đem dùng trực tiếp.

## 6. A00 — Style anchor trước khi làm hàng loạt

File: `art/source/style/anchor_daylight_city_v001.png`. Bản được chọn copy sang `art/reference/anchor_daylight_city.png`. Chỉ reference, không ship.

```text
Original visual development board for a warm, friendly 2D city stacking game. On a neutral pale gray background, show four separate front orthographic one-story floor modules: a cozy blue-accent sand apartment with paired windows, a red-brick industrial module with heavy metal framing, a green-accent glass office module with clean vertical mullions, and a cream-and-gold high-rise module with elegant narrow window rhythm. All four have the same structural floor height and horizontal landing edges. Below each, show its separate roof cap. At the side, show a sunflower-yellow side-view construction crane without cable, hook or building. Warm daylight from upper left, crisp readable silhouettes, soft cel shading, consistent materials and line weight. Give every item ample separation. No labels, text, logo, watermark, existing game assets or photorealism. This is a reference board, not a packed spritesheet.
```

Duyệt bằng mắt ở kích thước nhỏ: 4 class phân biệt bằng cửa/khung/mái và màu; không chuyển camera giữa module; crane có điểm thả rõ. Reference board không cắt tự động thành runtime sprite.

## 7. A01–A02 — Bộ nhà default: prompt cho từng mảnh

Folder nguồn: `art/source/stack/default/`. Mỗi tên trong bảng thêm `_v001.png`; bản duyệt bỏ revision. Xuất `stack/default/` cho cả hai app.

### 7.1. Bốn tầng lặp (`mid`)

Bốn prompt dưới **đã đầy đủ, copy riêng từng prompt**, không cần ghép S/N. Mỗi lần chỉ generate một file. Không attach cả style board nhiều nhà làm reference bố cục: crop đúng mẫu class cần dùng hoặc ghi rõ chỉ tham khảo style, không sao chép số lượng vật thể trong board. Nếu đã có một `mid` đúng hình khối, dùng nó làm reference geometry cho các class còn lại.

**`bldg_residential_default_mid` — làm đầu tiên cho C1:**

```text
Create exactly ONE compact rectangular floor block belonging to ONE apartment tower, for a 2D stacking game. This is one middle story of one building, not a complete house and not a row of houses.

Canvas: 512 pixels wide by 256 pixels high, transparent RGBA. The visible block itself must be 256 pixels wide by 128 pixels high, centered at (256,128). Its bounding rectangle is x=128 to 384, y=64 to 192. Leave 128 pixels transparent on the left and right, and 64 pixels transparent above and below. The block itself is exactly twice as wide as it is tall. If generating at another resolution, preserve these proportions.

Strict straight-on orthographic front view. One continuous sand-plaster facade, one uninterrupted rectangular outer silhouette, muted cornflower-blue trim and ONE centered paired window unit contained within the facade. The two panes are parts of one window, not two apartments. Flat horizontal top and bottom edges, suitable for seamless vertical stacking. Cozy residential character, clean bold shapes, crisp edges, restrained cel shading, warm upper-left daylight, original design.

Do not widen the block to add details. No multiple buildings, attached houses, row houses, wings, separate facade sections, side-by-side modules, duplicate objects or sprite sheet. No roof, entrance door, balcony protrusions, foundation, ground, side wall, perspective, external shadow, text, numbers, logo or watermark. Do not draw dimension lines or the bounding rectangle. Real transparent background, no checkerboard.
```

**`bldg_industrial_default_mid`:**

```text
Create exactly ONE compact rectangular industrial floor block belonging to ONE tower, for a 2D stacking game. This is one middle story of one building, not a complete factory complex, warehouse row or multiple buildings.

Canvas: 512 pixels wide by 256 pixels high, transparent RGBA. The visible block itself must be 256 pixels wide by 128 pixels high, centered at (256,128). Its bounding rectangle is x=128 to 384, y=64 to 192. Leave 128 pixels transparent on the left and right, and 64 pixels transparent above and below. The block itself is exactly twice as wide as it is tall, compact rather than a long horizontal strip. If generating at another resolution, preserve these proportions.

Strict straight-on orthographic front view. ONE continuous terracotta-red brick facade enclosed by ONE charcoal steel outer frame, with ONE centered broad industrial window occupying at most half the block width. Small rivets on the outer frame only. Express industrial weight through thick trim and materials, not extra width or extra rooms. Flat horizontal top and bottom edges for seamless vertical stacking. Original friendly 2D game art, bold simple shapes, crisp edges, restrained cel shading, warm upper-left daylight.

Do not widen the block to add details. No second or third unit, multiple buildings, attached sheds, wings, repeated factory sections, separate facade sections, side-by-side blocks or sprite sheet. No roof, chimney, rooftop machinery, loading door, entrance, foundation, ground, visible side wall, perspective, external shadow, text, numbers, logo or watermark. Do not draw dimension lines or the bounding rectangle. Real transparent background, no checkerboard.
```

**`bldg_office_default_mid`:**

```text
Create exactly ONE compact rectangular office floor block belonging to ONE office tower, for a 2D stacking game. This is one middle story of one building, not several office buildings or a long row of rooms.

Canvas: 512 pixels wide by 256 pixels high, transparent RGBA. The visible block itself must be 256 pixels wide by 128 pixels high, centered at (256,128). Its bounding rectangle is x=128 to 384, y=64 to 192. Leave 128 pixels transparent on the left and right, and 64 pixels transparent above and below. The block itself is exactly twice as wide as it is tall. If generating at another resolution, preserve these proportions.

Strict straight-on orthographic front view. ONE continuous pale blue-green glass facade enclosed by ONE slim ivory outer frame, with a single thin central mullion dividing the central glass area into exactly TWO panes. Both panes are inside the SAME building block, not separate architectural units. Dark teal-green trim, one subtle shared reflection, no repeated facade bays. Flat horizontal top and bottom edges for seamless vertical stacking. Original friendly 2D game art, bold clean shapes, crisp edges, restrained cel shading, warm upper-left daylight.

Do not widen the block to add details. No second or third building, connected office wings, repeated rooms, separate facade sections, side-by-side blocks, duplicate objects or sprite sheet. No roof, lobby, entrance door, foundation, ground, visible side wall, perspective, external shadow, text, numbers, logo or watermark. Do not draw dimension lines or the bounding rectangle. Real transparent background, no checkerboard.
```

**`bldg_highrise_default_mid`:**

```text
Create exactly ONE compact rectangular high-rise floor block belonging to ONE tower, for a 2D stacking game. This is one middle story of one building, not a whole skyscraper or several towers.

Canvas: 512 pixels wide by 256 pixels high, transparent RGBA. The visible block itself must be 256 pixels wide by 128 pixels high, centered at (256,128). Its bounding rectangle is x=128 to 384, y=64 to 192. Leave 128 pixels transparent on the left and right, and 64 pixels transparent above and below. The block itself is exactly twice as wide as it is tall. If generating at another resolution, preserve these proportions.

Strict straight-on orthographic front view. ONE continuous warm-cream facade, a restrained gold outer frame and ONE centered dark window unit divided into two narrow panes by a thin gold rib. Elegant original art-deco-inspired detailing contained inside the same rectangle. Flat horizontal top and bottom edges for seamless vertical stacking. Clean bold shapes, crisp edges, restrained cel shading, warm upper-left daylight.

Do not widen the block to add details. No multiple buildings, twin towers, wings, separate facade sections, repeated architectural bays, side-by-side blocks or sprite sheet. No crown, spire, roof, entrance, foundation, ground, visible side wall, perspective, external shadow, text, numbers, logo or watermark. Do not draw dimension lines or the bounding rectangle. Real transparent background, no checkerboard.
```

### 7.2. Bốn tầng đầu (`base`)

Attach `mid` tương ứng. Dùng S + **base template** thay `{DESCRIPTION}` bằng dòng bảng + N.

```text
Edit the attached approved middle-floor module into its first-floor entrance variant. Output exactly ONE block of ONE building. Canvas 512x256; the only building body is 256x128 at x=128..384, y=64..192, a 2:1 rectangle. Preserve its exact orthographic camera, structural width, story height, horizontal top and bottom boundaries, palette, lighting and registration. Replace only the facade details with {DESCRIPTION}. All entrance details must fit inside the same single-story rectangle; simplify details instead of widening the building. No separate storefronts, multiple buildings, extra wings, steps below the baseline, pavement, roof, extra story or detached decoration. Transparent background with 128px left/right and 64px top/bottom padding. Do not draw dimensions.
```

| File | `{DESCRIPTION}` |
|---|---|
| `bldg_residential_default_base` | a welcoming blue-trim double entrance with two warm side windows and a shallow awning contained within the body |
| `bldg_industrial_default_base` | one centered charcoal loading door within a continuous red-brick facade, no additional entrance or window groups |
| `bldg_office_default_base` | a broad glass lobby door between two clean vertical mullions, with dark green accents |
| `bldg_highrise_default_base` | an elegant cream-and-gold entrance portal with four slim geometric vertical accents |

### 7.3. Bốn mái (`roof`)

Attach mid để match vật liệu. Dùng S + **roof template** + N.

```text
Create exactly ONE separate roof cap for ONE building, matching the attached approved floor module. Canvas 512x256. Roof landing edge runs from x=128 to x=384 at y=192, exactly 256px wide. Keep every visible part inside x=128..384 and y=32..192; leave all remaining canvas transparent. Strict front orthographic elevation, exactly the same structural footprint and camera. A perfectly horizontal flat underside is the landing edge; all decorative structures rise above it. Show only {DESCRIPTION}. No second roof, side-by-side caps, wings, walls extending into another full story, complete building, ground or angled landing edge. Do not draw dimension lines. Keep the whole cap visible.
```

| File | `{DESCRIPTION}` |
|---|---|
| `bldg_residential_default_roof` | a warm sand flat parapet with blue coping and one small low cylindrical water tank |
| `bldg_industrial_default_roof` | a charcoal utility parapet with two low vents and one short brick chimney, without smoke |
| `bldg_office_default_roof` | a clean ivory and teal flat roof cap with a small centered glass skylight |
| `bldg_highrise_default_roof` | an elegant stepped cream-and-gold crown with a short centered spire, fully inside the canvas |

Đến cuối A02 có đúng **12 sprite building default**: 4 class × base/mid/roof. Không generate nguyên tower 10–40 tầng để dùng làm stacking.

## 8. A01 — Crane và hook

Folder `art/source/stack/default/`, cả hai target; S + đoạn dưới + N.

**`crane_rig_default_sprite_v001.png`**, runtime 1024×512:

```text
A single side-view tower-crane upper assembly for a 2D stacking game, strict side orthographic view. A dark steel horizontal lattice jib extends to the right from a compact sunflower-yellow operator cabin and short upper mast. A small counterweight extends to the left. Keep an obvious empty cable mounting point near the right end of the jib. Bold simplified construction, no perspective convergence. Upper assembly only: no long ground mast, ground base, cable, rope, hook, hanging block, building or people.
```

**`crane_hook_default_sprite_v001.png`**, runtime 128×128:

```text
A single compact crane lifting hook assembly in strict front view, dark steel hook beneath a small sunflower-yellow pulley housing. Clear top cable socket centered on the vertical axis. Bold thick shapes readable at tiny size. No long cable, crane arm, hanging load, motion lines or background scene.
```

Cable vẽ bằng code từ anchor rig tới hook; block gắn theo anchor, không bake chung hook + floor. Đo anchor trên ảnh duyệt rồi ghi manifest; skin rig không được làm điểm treo hoặc vị trí spawn đổi.

## 9. A03 — City minis và ô đất

Nguồn `art/source/city/default/`; xuất `city/default/` cả hai app.

### 9.1. Minis: một tòa hoàn chỉnh mỗi file

Dùng S + template + N. Attach mid/roof tương ứng để match class.

```text
A complete miniature {DESCRIPTION}, designed as a city-map building token. Consistent 2:1 isometric game projection with a compact square footprint, front-left and front-right faces visible, vertical edges upright. Match the attached class reference materials and roof. Simplify windows into readable groups; this is an icon-like whole building, not a literal rendering of every gameplay floor. Entire building visible, centered horizontally, grounded at a clean single baseline with generous transparent space around it. No lot tile, ground slab, roads, trees, surrounding buildings, detached shadow or UI.
```

| File | `{DESCRIPTION}` |
|---|---|
| `city_residential_default_mini_v001.png` | cozy apartment building with blue trim, warm sand walls, small balconies and a low water-tank roof |
| `city_industrial_default_mini_v001.png` | stocky red-brick factory with charcoal steel framing, a broad loading door and short rooftop vents |
| `city_office_default_mini_v001.png` | upright office tower with pale blue-green glass, evenly spaced ivory mullions and dark green roof trim |
| `city_highrise_default_mini_v001.png` | tall elegant cream-and-gold skyscraper with vertical ribs and a distinctive stepped crown and short spire |

City mini cao/thấp chỉ để đọc class; trạng thái tower dở thêm badge bằng code, không sinh mọi biến thể số tầng.

### 9.2. Lot

**`lot_empty_default_tile_v001.png`:** S + đoạn dưới + N.

```text
A single empty city building lot in consistent 2:1 isometric projection, a clean diamond of warm light concrete with a restrained darker edge. Flat readable surface, no building, markings, pavement extensions, dirt particles, grass, shadow or surrounding scenery. Symmetric footprint, perfectly centered, transparent outside the diamond.
```

**Selection/valid/invalid overlay:** ưu tiên code/SVG theo đúng polygon lot; không cần generate ba ảnh. Outline gold = selected, green = valid, red + hatch = invalid; không chỉ dùng màu để truyền thông tin. Nếu cần texture frame, tên `lot_selected_default_frame.png`, cùng canvas/diamond, ruột transparent; code vẫn vẽ hit area.

## 10. A04 — Background

Nguồn `art/source/bg/default/`; **không ghép S hoặc N**. Dùng đầy đủ prompt dưới.

**`bg_stack_default_sky_v001.png`**, xuất 1024×1536:

```text
Original portrait background for a friendly 2D city stacking game, warm daylight, clean soft cel-shaded illustration. A calm blue sky with a few broad soft clouds near the outer edges. A very faint distant skyline only along the bottom fifth, low contrast and atmospheric. Keep the central sixty percent of the picture almost empty so a moving crane and tower remain easy to read. No foreground building, crane, text, letters, logo, watermark, people or user interface. Full opaque background, no transparent areas, no dramatic lighting or detailed cloud texture.
```

**`bg_downtown_default_map_v001.png`**, xuất 1536×1024:

```text
Original wide background for a friendly 2D city-building game, a warm downtown plaza seen from an elevated isometric-compatible camera. Keep the central sixty-five percent calm, broad and open, with warm neutral paving and minimal texture. Suggest distant city blocks, a few simplified trees and a small park only around the outside border. No grid, no building lots, no central buildings, roads crossing the center, text, labels, logo, watermark or user interface. Soft upper-left daylight, clean cel shading, full opaque background. The interactive five-by-five lot grid will be rendered separately.
```

Nền stack dùng crop/layer trời theo viewport; tỷ lệ cực rộng có thể phủ thêm gradient. Không stretch nhà hoặc background tới méo. Trên mobile, ưu tiên đọc tower hơn hiển thị đủ tranh nền.

District sau dùng prompt map trên, thay đoạn cảnh theo bảng. Mỗi file vào `art/source/bg/{theme}/`, xuất `bg/{theme}/`.

| File nguồn | Thay cảnh border | Phase |
|---|---|---|
| `bg_harbor_default_map_v001.png` | calm harbor water, distant dock cranes and small warehouses, only at the borders | W4/Y3 |
| `bg_oldtown_european_map_v001.png` | warm old-town plaster facades and copper roofs around a quiet stone square | W4 |
| `bg_business_glass_map_v001.png` | distant modern glass towers and a transit avenue outside the central plaza | W4+ |
| `bg_riverside_default_map_v001.png` | a soft river bend, promenade and broad tree shapes at the border | W4+ |
| `bg_tech_neon_map_v001.png` | restrained futuristic architecture with cyan accents, still low contrast | W4+/Y4 |
| `bg_night_neon_map_v001.png` | dark blue city silhouettes and sparse amber window lights, quiet dark center | W4+/Y4 |
| `bg_winter_winter_map_v001.png` | thin snow caps, cool paving and small warm-lit windows around the border | W4/Y4 |

## 11. UI, badges và FX

Controls, chữ, số điểm, progress bars, combo meter, layout panel và trạng thái button ưu tiên code/CSS/SVG để rõ ở mọi cỡ. Web tận dụng UI sẵn có; không render một ảnh UI lớn rồi đặt hitbox lên. Sprite UI dùng khi cần chất liệu minh họa.

### 11.1. Icons

Nguồn `art/source/ui/default/`. S + `A single centered game icon depicting {SUBJECT}. Chunky simple silhouette, balanced padding, no surrounding frame.` + N.

| File nguồn | `{SUBJECT}` | Dùng |
|---|---|---|
| `ui_life_default_icon_v001.png` | a warm coral enamel heart | HUD |
| `ui_population_default_icon_v001.png` | two simple warm-ivory human bust silhouettes | HUD/city |
| `ui_floor_default_icon_v001.png` | three compact blue floor slabs stacked vertically | Result |
| `ui_daily_default_icon_v001.png` | a cream tear-off calendar with a small gold sun symbol and no digits | Daily |
| `ui_mastery_default_icon_v001.png` | a small architect compass with a gold star | Mastery |
| `ui_achievement_default_icon_v001.png` | a gold trophy with broad sturdy handles | Achievements |
| `ui_collection_default_icon_v001.png` | an open book containing a simple building silhouette | Architecture Book |
| `ui_demolish_default_icon_v001.png` | a chunky hammer beside one cracked brick | City |
| `ui_lock_default_icon_v001.png` | a rounded dark-steel padlock with a gold keyhole | Locked item |
| `ui_coin_default_icon_v001.png` | a warm gold coin embossed with a tiny building silhouette, without letters | W5a, chưa cần MVP |

Back/pause/settings/retry/close dùng icon vector trong code. Playables không dùng icon giống nút host đặt sát nút host, không có nút quit. Combo bar/ring vẽ code để thể hiện đúng lượng thời gian còn lại.

### 11.2. Medal

S + `One small centered shield medal, identical outer silhouette across the set, depicting {SUBJECT}. No ribbons or text.` + N. Folder UI như trên.

| File nguồn | `{SUBJECT}` |
|---|---|
| `medal_c_default_badge_v001.png` | matte bronze with one horizontal embossed bar |
| `medal_b_default_badge_v001.png` | brushed silver with two horizontal embossed bars |
| `medal_a_default_badge_v001.png` | warm gold with a small central star |
| `medal_s_default_badge_v001.png` | polished gold with a simple raised crown |
| `medal_splus_default_badge_v001.png` | polished gold with a raised crown and one small four-point sparkle inside the shield |

Chữ C/B/A/S/S+ đặt riêng bằng UI text để dịch/đổi cỡ. Có thể ship code badges trước, không phải asset blocker C2.

### 11.3. Panel tùy chọn

File `ui_panel_default_frame_v001.png`, nguồn UI. S + đoạn sau + N:

```text
A square ornamental game panel frame in warm cream and dark navy. Flat front view, small restrained decoration contained in the four corners, straight perfectly uniform edges, transparent center. Designed for nine-slice scaling with no artwork crossing between corner, edge and center regions. No inner content, symbols, labels or buttons.
```

Chỉ dùng sau khi artist căn lại 24px border; nếu không có giá trị thị giác rõ, panel CSS đủ tốt.

### 11.4. FX

Nguồn `art/source/fx/default/`. S + đoạn bảng + N; xuất 128×128 RGBA. Animation bằng scale/opacity/particle emitter, không yêu cầu AI tự tạo 16 frame đồng nhất.

| File nguồn | Prompt nội dung |
|---|---|
| `fx_perfect_default_burst_v001.png` | One tight gold-white four-point impact starburst with four tiny short chips; crisp core, restrained glow, no broad bloom that hides a landing surface. |
| `fx_landing_default_dust_v001.png` | One compact warm gray stylized landing dust puff, three broad rounded lobes spreading sideways, thin and low, with no large opaque cloud. |
| `fx_miss_default_chip_v001.png` | One small warm concrete debris chip, angular but simple, readable silhouette, no surrounding dust or additional pieces. |
| `fx_unlock_default_star_v001.png` | One small clean warm-gold five-point celebration star with a bright center, no trail or surrounding sparkles. |

Reduced motion giảm shake/particles; flash không che cạnh landing. C1/C2 có thể dùng FX code hoàn toàn, chỉ thêm bitmap khi cần.

## 12. A05 — Theme set và skin variants

Default approved là reference bắt buộc. Edit từng sprite, không generate lại cả tòa từ đầu. Folder nguồn: `art/source/{stack|city}/{theme}/`; background tương ứng ở `bg/{theme}/`.

**Template edit theme:**

```text
Edit only the materials and decorative facade treatment of the attached approved game sprite into the following theme: {THEME_DESCRIPTION}. Preserve the exact camera, structural footprint, top and bottom landing boundaries, story height, registration, transparent padding, object count and major silhouette. Keep the class identity and readability at small size. If this is a crane, preserve its cable mounting point and do not add a cable or hook. If this is a roof, preserve its flat underside. If this is a city miniature, preserve its isometric camera and ground anchor. Do not introduce text, logos, new floors, a ground plane or background. Preserve true alpha transparency.
```

| Theme ID | `{THEME_DESCRIPTION}` | Target/đợt |
|---|---|---|
| `brick` | Warm classic brick architecture with pale stone trim; blue apartment accents, red industrial masonry, green office details and gold high-rise accents; vintage yellow-painted steel for crane parts | Web W2; YouTube Y3 nếu đủ budget |
| `glass` | Clean modern architecture with blue-green glass, pale steel and restrained class-color accents; brushed white steel for crane parts | Web W2 public/W4; YouTube chọn lọc |
| `european` | Old European warm plaster and pale stone, restrained arched facade details within existing window bays, copper roof trim and weathered cream-painted crane steel | W4 |
| `neon` | Dark navy futuristic panels with restrained cyan and magenta luminous accents; preserve readable large window groups and keep glow inside the approved silhouette | W4/Y4 |
| `winter` | The same architecture with a thin snow treatment contained within the approved silhouette, cool reflections and warm window light; snow must not move the structural landing edge | W4/Y4 |
| `coastal` | Pale stucco, desaturated sea-blue trim and sun-warmed wood details, clean daylight with the original geometry | Sau W4 |
| `midcentury` | Muted teal and cream panels, warm wood accents and geometric window framing inside the original facade grid | Sau W4 |
| `industrialretro` | Dark riveted steel, warm oxidized copper and subdued brick textures with clear large panels | Sau W4 |
| `artdeconight` | Deep navy stone, subtle brass ribs and warm amber windows, restrained geometric art-deco ornament | Sau W4 |
| `halloween` | Muted violet and pumpkin-orange decorative accents, warm window glow, simple small seasonal motifs contained within the existing body | Event |

Mỗi full theme tiêu chuẩn: **19 ảnh** = 12 building modules + 4 city minis + 1 rig + 1 hook + 1 background. FX tùy chọn không tính. Roof family đã nằm trong 12 module, không đếm thêm lần nữa.

Tên file mẫu cho Brick:

```text
bldg_residential_brick_base.png
bldg_residential_brick_mid.png
bldg_residential_brick_roof.png
bldg_industrial_brick_base.png
bldg_industrial_brick_mid.png
bldg_industrial_brick_roof.png
bldg_office_brick_base.png
bldg_office_brick_mid.png
bldg_office_brick_roof.png
bldg_highrise_brick_base.png
bldg_highrise_brick_mid.png
bldg_highrise_brick_roof.png
city_residential_brick_mini.png
city_industrial_brick_mini.png
city_office_brick_mini.png
city_highrise_brick_mini.png
crane_rig_brick_sprite.png
crane_hook_brick_sprite.png
bg_downtown_brick_map.png
```

Per-class variant dùng theme/variant ID riêng như `brickb`, `condo`, `motel`, `warehouse`, `powerstation`, `corporategrid`, `luxuryspire`. Mỗi variant đủ base/mid/roof/mini; chỉ thay mô tả vật liệu của class đó trong template edit. Giữ `classId` gốc để không biến skin thành class có luật mới.

## 13. A06 — Roof và crane reward độc lập

Giai đoạn C4/Y1 chỉ chọn **một** reward, đề xuất crane `blackgold` (rig + hook), để progression có phần thưởng thật mà không cần cả theme.

Crane: dùng theme edit template + các mô tả sau. Tên `crane_rig_{variant}_sprite`, `crane_hook_{variant}_sprite`; nguồn `art/source/stack/{variant}/`.

| Variant | Mô tả |
|---|---|
| `whitesteel` | clean white-painted steel with pale blue cabin glass and restrained gray joints |
| `blackgold` | charcoal-black steel with restrained warm gold joints and frame accents |
| `retro` | slightly weathered muted yellow paint, dark steel joints and an ivory cabin stripe |
| `artdeco` | cream paint and restrained stepped gold geometric trim without changing the jib silhouette |
| `winter` | thin snow caps inside the existing silhouette, unchanged cable mounting point |

Roof độc lập: file `roof_{class}_{variant}_cap.png`; source `art/source/stack/{variant}/`; geometry theo class. Nếu preview whole-building cần cập nhật mini preview tương ứng hoặc dùng renderer ghép, không hiển thị mini có mái sai.

**Prompt roof reward:** S + đoạn sau + N, attach roof default của class.

```text
Edit the attached roof cap into {ROOF_DESCRIPTION}. Preserve the exact flat landing underside, width, camera, registration and transparent padding. Keep all decorative features above the landing line and fully within the existing canvas. It is a cosmetic roof cap only, with no extra structural story and no change to the supporting building.
```

| Variant | `{ROOF_DESCRIPTION}` |
|---|---|
| `gold` | a prestige version in warm brushed gold with a small embossed star |
| `glasscrown` | a clean pale blue glass crown with a restrained ivory frame |
| `utility` | a compact dark steel utility cap with neatly arranged low vents |
| `artdeco` | a refined stepped cream and brass crown with a short centered fin |
| `neonbeacon` | a dark navy cap with a small cyan beacon and restrained glow |
| `winter` | the same cap with a thin contained layer of snow and warm accent lights |

Baseline launch dùng mái theo class; các mái reward mở dần W4/Y3, không thay roof score bonus.

## 14. A07 — Landmarks, decorations và district upgrades

Nguồn `art/source/city/{theme}/`, xuất `city/{theme}/`; 256×384 RGBA; W4/Y3 trở đi.

S + template sau + N:

```text
One complete miniature landmark: {LANDMARK_DESCRIPTION}. Original architecture, consistent 2:1 isometric city-map projection, upright vertical edges, compact square footprint, clean ground baseline and warm upper-left daylight. Strong recognizable silhouette at small size, simplified large details, same material language as the approved Daylight City reference. Entire structure visible with transparent padding. No ground tile, detached shadow, neighboring buildings, people or background. No text or digits even on clocks or signs.
```

| File nguồn | `{LANDMARK_DESCRIPTION}` |
|---|---|
| `city_clocktower_default_landmark_v001.png` | a warm stone civic clock tower with a simple round clock face using tick marks only and a copper cap |
| `city_hotel_default_landmark_v001.png` | a grand cream hotel with a welcoming entrance and a restrained stepped gold roof |
| `city_radio_default_landmark_v001.png` | a compact steel radio tower on a small utility base, with a clear antenna silhouette |
| `city_observatory_default_landmark_v001.png` | a pale stone observatory with a large blue-green hemispherical dome |
| `city_stadium_default_landmark_v001.png` | a compact oval stadium with simplified stands and a small green field |
| `city_station_default_landmark_v001.png` | a civic central station with a broad arch and a short blue-green glass canopy |
| `city_museum_default_landmark_v001.png` | a low cream-stone museum with a clean column rhythm and shallow copper roof |
| `city_spire_default_landmark_v001.png` | a slender cream-and-gold public viewing spire with a circular observation crown |

Landmark là map asset, không mặc định cần bộ stacking riêng. Nếu muốn landmark-build challenge, dùng existing building class + ruleset rồi trao landmark; chỉ làm special construction mechanic khi có design riêng.

Decoration cho synergy non-Classic: S + `One compact {OBJECT}, consistent 2:1 isometric city-map projection, clean baseline, no ground outside its small footprint.` + N.

| File nguồn | `{OBJECT}` |
|---|---|
| `city_park_default_decoration_v001.png` | city park with three broad tree canopies and a small cream bench |
| `city_transit_default_decoration_v001.png` | transit shelter with a blue-green glass canopy and a simple entry opening, no signage |
| `city_plaza_default_decoration_v001.png` | circular stone fountain with a restrained small water jet |

Không dành chỗ landmark bằng cách âm thầm xóa lot có người chơi: spec district W4 phải quy định slot riêng hoặc conversion có preview.

## 15. A08 — Marketing, app icon, thumbnail

Nguồn `art/source/marketing/`. Đây là minh họa marketing, không thay ảnh chụp gameplay thật. Brand tên game chưa chốt; prompt không bake chữ.

**`icon_app_default_square_v001.png`:**

```text
Original square app icon illustration for a friendly city stacking game. One sunflower-yellow crane hook lowering a warm sand-and-blue apartment floor toward a small neatly stacked tower, bold central silhouette, crisp cel shading, warm upper-left daylight. Simple deep blue opaque background, strong separation, all important shapes within the central seventy-six percent of the square. No words, letters, numerals, brand logos, watermark, UI, people, tiny background details or copied game art.
```

**`og_city_default_landscape_v001.png`:**

```text
Original wide promotional illustration for a warm 2D city stacking game. On the right, a sunflower-yellow crane lowers one floor above an elegant cream-and-gold tower. Along the lower edge, show a small friendly skyline containing a blue-accent apartment, a red-brick industrial building and a green-glass office. Keep the left forty percent mostly calm blue sky for a title to be typeset later. Crisp readable shapes, soft cel shading, warm upper-left daylight, full opaque background. No text, logos, watermark, numerical scores or imitation gameplay interface.
```

Web export: `art/exports/web/images/og_city.png` → `base-game-nextjs/public/images/og_city.png`. Icon export vào `base-game-nextjs/app/icon.png`.

YouTube metadata: chuẩn bị composition không logo/branding và crop theo kích thước/ratio portal yêu cầu tại Y2; lưu `art/exports/youtube/submission/thumbnail_{width}x{height}.png`. **Không** copy `submission/` vào `public/game`. Screenshot lấy từ game chạy: `art/exports/youtube/submission/screenshot_city_01.png`, `screenshot_stack_01.png`; video quay build thật. Quy cách metadata phải đối chiếu [Design requirements](https://developers.google.com/youtube/gaming/playables/certification/requirements_design) và trường portal, không coi icon 512 là đủ bộ nộp.

## 16. Thứ tự sản xuất và khối lượng

| Đợt | Asset | Số ảnh | Cần trước |
|---|---|---:|---|
| A00 | Style reference | 1, không ship | Trước batch art |
| A01 | Residential mid + rig + hook | 3 | C1 nghiệm thu art |
| A02 | 11 building modules còn lại | 11 | C3 |
| A03 | 4 city minis + empty lot | 5 | C3 |
| A04 | Stack sky + Downtown map | 2 | C3 polish |
| UI/FX | Icons, medals, FX tùy nhu cầu | Tối đa 19 ảnh MVP nếu chọn 9 icons + 5 medals + 4 FX + 1 panel | C2–C4; code thay được |
| A05 | Brick full set | 19 | W2 |
| A06 | Blackgold rig + hook | 2 | C4/Y1 |
| A08 | App icon + OG scene | 2, không nằm trong gameplay bundle | W2/Y2 |
| A07 | Landmarks/district/themes | Theo từng release | W4/Y3 trở đi |

**Core visual pack:** 21 ảnh = 12 building + 2 crane + 4 mini + 1 lot + 2 background. Với reward Blackgold là 23 ảnh gameplay trước UI/FX. Web thêm Brick thành 42 ảnh gameplay. Số ảnh không thay thế phép đo byte/texture memory.

Không bắt đầu bằng toàn bộ 8 landmarks, 10 themes hoặc sprite theo mọi số tầng. Sau khi core tốt mới tăng content.

## 17. Quy trình nhận và kiểm tra asset

1. Generate một asset bằng prompt, lưu đúng `art/source/.../*_v001.png`; giữ prompt/reference/tool/date trong note cùng basename `.md` nếu cần truy xuất.
2. Duyệt style ở kích thước chơi thật. Với mid, ghép thử 10 tầng; nhìn cạnh ghép, cửa sổ và drift. Với mini, đặt thử cả 25 lot.
3. Làm alpha thật, căn footprint/baseline/anchor, xuất đúng khổ vào `art/approved/...`. Bảo toàn source.
4. Khai báo manifest: asset ID, path, target, load group, size/pivot, content version. Nhập script export/sync ở C0–C3; trước đó có thể copy thủ công theo mapping.
5. Export staging theo allowlist. Tối ưu PNG hoặc WebP có alpha sau QA; nếu đổi extension phải sửa manifest đồng bộ. Không nén mất mát làm nhòe cạnh landing.
6. Sync tới đúng `public/game`; không copy cả `art/`. Không xóa file runtime không có trong manifest một cách tự động khi chưa phân biệt được file người dùng.
7. Test nền trắng/đen/xanh để thấy halo, 1×/2× DPR, mobile nhỏ, resize, stack sway, collision guide và chế độ grayscale.
8. Build đo initial/total/file size và heap; thử asset missing/loading chậm. Default fallback khi theme lỗi; gameplay không đợi tải skin tùy chọn.

Checklist duyệt mỗi sprite: đúng filename; đúng một chủ thể; đúng camera; alpha không có caro giả; không text/logo; đúng pivot; không cắt crown/hook; seam mid không hở; frame/skin không làm hình collision sai cảm nhận.

**Bắt đầu ngay:** làm A00, rồi ba ảnh A01. Khi có ba ảnh đó, đã đủ để đưa visual vào prototype Quick Tower; phần còn lại đi theo phase, không chặn việc viết core.
