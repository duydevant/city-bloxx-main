# City Bloxx — nhà compact v3

07/10/2026. Quy cách này thay phần building stack v2. Không đổi crane/hook/sky/lot/minis. Chưa generate hoặc thay ảnh đã duyệt.

## Kích thước phải khóa

Đây là kích thước **vật thể**, không phải chỉ kích thước canvas:

| Loại | Canvas PNG | Vật thể | Vị trí trong canvas |
|---|---|---|---|
| mid/base | 512×256, RGBA | 192×160, tỷ lệ 1,2:1 | x=160..352, y=48..208 |
| roof | 512×256, RGBA | Footprint 192; toàn mái tối đa 192×160 | x=160..352, chân tại y=208; cao nhất không vượt y=48 |

Mid/base origin (256,208); hai cạnh ghép trên/dưới ngang tuyệt đối. Một ảnh chỉ có **một module tầng** thuộc **một tòa nhà độc lập**, không phải cả tòa 10–40 tầng. Mặt tiền chỉ 1–2 cột cửa sổ. Không nhà bên cạnh, không gian phụ, không cánh dài, không nhà song sinh, không row house. Công nghiệp là một tháp công nghiệp nhỏ, không phải xưởng dài hoặc nhà kho có nhiều gian.

Runtime body mới rộng 144, cao 120 world units (1,2:1), hẹp hơn 40% so với 240×120. Vùng hợp lệ để đáp cũng hẹp tương ứng; Perfect khớp 95–100% theo tuning mới. Canvas 512×256 vẫn là hình chữ nhật vì có padding; **phần nhà bên trong** phải gần vuông.

AI không bảo đảm đúng tọa độ pixel. Generate lớn hơn theo cùng tỷ lệ nếu cần, rồi artist căn body về khung trên. Không kéo dãn PNG 2:1 cũ để coi là art mới; bản game tạm thời dùng art cũ được thu gọn cho tới khi import v3.

## Lưu file ở đâu

Đặt ảnh mới tại `D:\ANT_1\city-bloxx-main\art\source\stack\compact-v3\`. Không ghi đè source v001 hoặc approved khi chưa kiểm tra.

| Loại | Tên file nguồn mới |
|---|---|
| Nhà ở | bldg_residential_default_mid_v003.png / bldg_residential_default_base_v003.png / bldg_residential_default_roof_v003.png |
| Công nghiệp | bldg_industrial_default_mid_v003.png / bldg_industrial_default_base_v003.png / bldg_industrial_default_roof_v003.png |
| Văn phòng | bldg_office_default_mid_v003.png / bldg_office_default_base_v003.png / bldg_office_default_roof_v003.png |
| Cao tầng | bldg_highrise_default_mid_v003.png / bldg_highrise_default_base_v003.png / bldg_highrise_default_roof_v003.png |

Sau QA/import: `art/approved/stack/default/bldg_<class>_default_<part>.png` → cả `base-game-nextjs/public/game/stack/default/` và `base-playable-main/public/game/stack/default/`. Giữ basename runtime, bỏ `_v003`; cập nhật SHA/dimensions trong `packages/city-bloxx-content/assets.manifest.json` và crop tại `packages/city-bloxx-renderer/src/sprites.ts` sang (160,48,192,160) cho từng ảnh đã import. **Chưa tự copy nguồn mới vào runtime**: crop hiện tại đo riêng thân solid của từng PNG cũ để các tầng không hở do padding. Không chạy `assets:export` để import v3: script cũ chỉ nhận `_v001`.

Ưu tiên gen 4 mid trước để kiểm tra cảm giác, rồi 4 base + 4 roof. C3 hiện dùng minis đã có; không cần gen lại toàn bộ 21 ảnh.

## Prompt MID — copy nguyên từng prompt

### bldg_residential_default_mid_v003.png

```text
Create ONE isolated compact residential building floor module for a 2D stacking game. Exactly one floor of ONE standalone narrow building, NOT a full tower, NOT a pair of buildings. Front orthographic elevation, completely flat front-facing view, zero isometric perspective. Final transparent RGBA canvas 512x256 pixels. The visible solid building body must be EXACTLY 192 pixels wide and 160 pixels tall, width-to-height ratio 1.2:1, centered at x=160..352 and y=48..208. Keep all pixels outside that rectangle transparent. Make the object almost square and slightly wider than tall, never a long horizontal block. A single cream/sand facade with blue #4B91D1 accents, at most two slim window columns, one window row, subtle inset balcony detail inside the body. Original daylight-city stylized cel shading, warm upper-left light, crisp readable outlines. The entire top and bottom edges are flat horizontal matching stacking seams. No roof, no ground, no hanging cable, no crane, no under-object shadow. ONE continuous compact silhouette. No second or third house, no detached wing, no side annex, no row houses, no shop strip, no extra bays, no text, no labels, no watermark, no checkerboard baked into the pixels.
```

### bldg_industrial_default_mid_v003.png

```text
Create ONE isolated compact industrial tower floor module for a 2D stacking game. Exactly one floor of ONE standalone narrow industrial building. This is NOT a long factory, warehouse, shed, multi-bay workshop or a row of buildings. Front orthographic elevation, completely flat front-facing view, zero isometric perspective. Final transparent RGBA canvas 512x256 pixels. The visible solid body must be EXACTLY 192 pixels wide and 160 pixels tall, width-to-height ratio 1.2:1, centered at x=160..352 and y=48..208. Keep everything outside that rectangle fully transparent. Near-square object, only one compact facade, at most two narrow window columns and one row. Red #C45B4E paneling, charcoal #38434D steel frame, inset vents and rivets inside the rectangle. Original daylight-city stylized cel shading, warm upper-left light, crisp readable outlines. Top and bottom are completely flat horizontal stacking seams. No roof, smokestack, ground, under-object shadow, crane or cable. No second building, no twin houses, no three factory halls, no horizontal extension, no detached wing, no repeated bays, no text, no labels, no watermark, no baked checkerboard.
```

### bldg_office_default_mid_v003.png

```text
Create ONE isolated compact office building floor module for a 2D stacking game. Exactly one floor of ONE standalone narrow office tower, NOT a pair of towers and NOT a wide office complex. Front orthographic elevation, flat front-facing view, zero isometric perspective. Final transparent RGBA canvas 512x256 pixels. The solid facade must be EXACTLY 192 pixels wide by 160 pixels tall, ratio 1.2:1, occupying x=160..352 and y=48..208. Outside this body rectangle must be fully transparent. Near-square compact object with at most two vertical glass window columns in one row. Green #4B9D89 slim framing, light glass #B9DBDF, clean single facade, architectural detail contained inside the body. Original daylight-city stylized cel shading, warm upper-left light, crisp readable edges. Flat horizontal top and bottom stacking seams. No roof, podium, ground, under-object shadow, crane or cable. No extra office tower, no twin facade, no annex, no three connected buildings, no long curtain-wall strip, no text, no labels, no watermark, no baked checkerboard.
```

### bldg_highrise_default_mid_v003.png

```text
Create ONE isolated compact high-rise building floor module for a 2D stacking game. Exactly one floor of ONE slender standalone tower, NOT an entire skyscraper. Front orthographic elevation, flat front-facing view, zero isometric perspective. Final transparent RGBA canvas 512x256 pixels. Solid body is EXACTLY 192 pixels wide and 160 pixels tall, ratio 1.2:1, centered at x=160..352 and y=48..208. All pixels outside the rectangle transparent. A compact near-square facade, at most two narrow elegant window columns in one row, yellow/gold #D9B34C vertical ribs and cream #F0E4C7 walls. All decorative ribs stay inside the body. Original daylight-city stylized cel shading, warm upper-left light, crisp readable outlines. Entire top and bottom edges flat horizontal stacking seams. No crown, spire, roof, ground, under-object shadow, crane or cable. No second tower, no connected buildings, no wings, no stretched horizontal facade, no text, no labels, no watermark, no baked checkerboard.
```

## Prompt BASE — copy nguyên từng prompt

Base là tầng trệt, không có nền đất riêng. Khi gen nên đính kèm mid cùng class để giữ vật liệu/màu/width. Không đính kèm nhiều class vào cùng một lượt.

### bldg_residential_default_base_v003.png

```text
ONE compact residential ground-floor module, ONE standalone building, front orthographic view. Transparent RGBA canvas 512x256. Body EXACTLY 192x160 pixels at x=160..352,y=48..208, near-square ratio 1.2:1, no pixels outside this rectangle. Sand/cream walls and blue #4B91D1 accents matching the residential mid module. One small centered entrance, at most two narrow windows, no porch extending beyond the body. Flat horizontal top seam to stack with the mid; flat bottom at y=208. Original daylight-city cel shading, warm upper-left light, crisp outlines. Not an entire building, not multiple houses, no wings, no long frontage, no roof, no ground plane, no pavement, no cast shadow, no text or watermark.
```

### bldg_industrial_default_base_v003.png

```text
ONE compact industrial tower ground-floor module, NOT a wide factory or warehouse. ONE standalone near-square body, front orthographic view. Transparent RGBA canvas 512x256. Body EXACTLY 192x160 pixels at x=160..352,y=48..208, ratio 1.2:1, all pixels outside transparent. Red #C45B4E and charcoal #38434D matching the industrial mid. One compact loading door centered inside the facade, narrow steel jambs, no extra factory bays. Flat top stacking seam; bottom at y=208. Original daylight-city cel shading, warm upper-left light, crisp outlines. No second building, no side halls, no roof, no ground plane, no pavement, no cast shadow, no text or watermark.
```

### bldg_office_default_base_v003.png

```text
ONE compact office tower ground-floor module, ONE standalone near-square facade, front orthographic view. Transparent RGBA canvas 512x256. Body EXACTLY 192x160 pixels at x=160..352,y=48..208, ratio 1.2:1, outside fully transparent. Green #4B9D89 frame and light #B9DBDF glass matching the office mid. One narrow centered glass entrance, at most two slim glass columns, no broad podium or extended lobby. Flat horizontal top stacking seam and bottom y=208. Original daylight-city cel shading, warm upper-left light, crisp outlines. No twin tower, no wings, no office complex, no roof, ground plane, pavement, cast shadow, text or watermark.
```

### bldg_highrise_default_base_v003.png

```text
ONE compact high-rise tower ground-floor module, ONE standalone near-square facade, front orthographic view. Transparent RGBA canvas 512x256. Body EXACTLY 192x160 pixels at x=160..352,y=48..208, ratio 1.2:1, outside fully transparent. Yellow/gold #D9B34C ribs and cream #F0E4C7 matching the highrise mid. One narrow elegant entrance and at most two slim window columns, all decoration inset within the body. Flat top stacking seam and bottom y=208. Original daylight-city cel shading, warm upper-left light, crisp outlines. No multiple towers, wings, long podium, roof, ground plane, pavement, cast shadow, text or watermark.
```

## Prompt ROOF — copy nguyên từng prompt

Một mái duy nhất, không cả tòa nhà. Footprint bắt buộc bằng mid/base. Phần cap phía dưới không được thò ngang.

### bldg_residential_default_roof_v003.png

```text
ONE isolated roof cap for ONE narrow residential tower, front orthographic view, not a house and not a full building. Transparent RGBA canvas 512x256. Roof footprint EXACTLY 192 pixels wide, x=160..352, horizontal bottom attachment seam at y=208. All roof details contained within x=160..352 and y=48..208, never wider or taller; outside transparent. Compact sand parapet and blue #4B91D1 trim, one tiny centered water tank inside the footprint. Match residential mid/base daylight-city cel shading, warm upper-left light, crisp outlines. No building floors below the cap, no twin roofs, no side wing, no ground, no cast shadow, no crane/cable, no text or watermark.
```

### bldg_industrial_default_roof_v003.png

```text
ONE isolated roof cap for ONE compact industrial tower, front orthographic view. Not a wide factory roof, not multiple sheds, not a complete building. Transparent RGBA canvas 512x256. Footprint EXACTLY 192 pixels wide at x=160..352; bottom seam horizontal at y=208. Roof and its one compact low vent stay entirely within x=160..352,y=48..208. Outside fully transparent. Red #C45B4E and charcoal #38434D, small utilitarian steel cap, no long chimneys. Match industrial mid/base daylight-city cel shading, warm upper-left light, crisp outlines. No lower floors, no extra roof, no wing, ground, cast shadow, crane/cable, text or watermark.
```

### bldg_office_default_roof_v003.png

```text
ONE isolated clean roof cap for ONE narrow office tower, front orthographic view, not a full building. Transparent RGBA canvas 512x256. Footprint EXACTLY 192 pixels wide at x=160..352, horizontal bottom seam y=208. All cap details confined to x=160..352,y=48..208; outside transparent. Green #4B9D89 frame and pale #B9DBDF accent, one compact centered service housing, no wide HVAC array. Match office mid/base daylight-city cel shading, warm upper-left light, crisp outlines. No lower floors, no second roof, no twin towers, no wings, no ground, cast shadow, crane/cable, text or watermark.
```

### bldg_highrise_default_roof_v003.png

```text
ONE isolated compact stepped crown roof cap for ONE slender high-rise tower, front orthographic view, not a complete skyscraper. Transparent RGBA canvas 512x256. Footprint EXACTLY 192 pixels wide at x=160..352; horizontal bottom seam y=208. The crown and one short centered spire remain entirely within x=160..352,y=48..208. All outside pixels transparent. Yellow/gold #D9B34C and cream #F0E4C7, clean original stepped crown, no lateral overhang. Match highrise mid/base daylight-city cel shading, warm upper-left light, crisp outlines. No lower floors, no second tower, no extra crown, no wings, ground, cast shadow, crane/cable, text or watermark.
```

## Checklist trước khi gửi import

- 12 ảnh riêng, không spritesheet và không 2–3 nhà trong một file.
- PNG thật có alpha, không nền trắng/checkerboard.
- Mid/base body đúng 192×160, x160/y48; ghép 3 mid không khe hoặc mái lặp.
- Một hoặc hai cột cửa sổ, không mô-típ nhiều căn nhà ghép ngang.
- Roof footprint đúng 192, chân tại y208. Bóng sáng nằm trong vật thể, không shadow dưới.
- Dùng tên `_v003` trong source. Sau khi gen, gửi thư mục này để QA/căn/export và cập nhật crop/hash.

## Population FX — người và dù theo từng loại nhà

C3.8 chưa triển khai animation. Bộ này là **8 ảnh mới**, ngoài 12 ảnh building ở trên. Gen người và dù thành hai file riêng để game có thể lắc dù, hạ người vào cửa sổ và thu/ẩn dù lúc đáp. Không gen một ảnh có nhiều người; không dùng chung một nhân vật/dù chỉ đổi tên file cho cả bốn class.

### Liên hệ với nhà

| Nhà | Người | Dù | Nhận diện chung |
|---|---|---|---|
| residential | Cư dân trưởng thành, áo casual xanh, quần màu cát | Xanh dương + kem, sọc panel mềm | Blue #4B91D1, sand #E8CF9E, thân thiện |
| industrial | Công nhân, mũ bảo hộ, đồ lao động đỏ/charcoal | Đỏ + charcoal, panel và viền kỹ thuật | Red #C45B4E, charcoal #38434D, một chút phản quang |
| office | Nhân viên văn phòng, business-casual xanh lá | Xanh lá + xanh kính nhạt, nhịp panel thẳng | Green #4B9D89, pale glass #B9DBDF, gọn sạch |
| highrise | Cư dân cao tầng, trang phục cream/navy tinh gọn | Vàng + kem, panel dọc thanh và đỉnh giữa nhẹ | Gold #D9B34C, cream #F0E4C7, tinh tế |

Màu, vật liệu gợi ý và ngôn ngữ hình khối phải lấy từ building **cùng class**. Có thể đính kèm ảnh mid/roof cùng class làm reference khi gen; chỉ tham chiếu palette/style, không biến nhà thành người hoặc vẽ nhà vào sprite. Tất cả dùng daylight-city cel shading, ánh sáng trên trái, front orthographic, không isometric. Đây là nhân vật vui vẻ trong harness an toàn, không rơi tự do.

### Kích thước từng vật thể, điểm nối và scale

| Sprite | Canvas PNG RGBA | Vật thể bên trong | Anchor |
|---|---|---|---|
| person | 128×192 | Một người tối đa 64×128, x=32..96,y=32..160; cả tay/chân/phụ kiện nằm trong vùng này | Harness giữa ngực (64,76); chân giữa (64,160) |
| parachute | 256×192 | Tán dù đúng 192×80 tại x=32..224,y=16..96; dây trong x=64..192,y=96..168 | Hai dây quy tụ về mắt nối (128,168) |

Tán dù rộng gấp **3 lần** bề rộng người; không được rộng bằng tòa nhà hoặc phủ kín màn hình. Scale đề xuất khi implement: source ×0,375 → người tối đa 24×48 world units, tán dù 72×30. Nhà rộng 144; dù rộng bằng nửa bề rộng nhà. Renderer sẽ nối anchor dù (128,168) với harness người (64,76), **không** nối vào đầu hoặc chân. Có thể vẽ đoạn dây rất ngắn bằng code để nối khớp sau QA.

Người không có dù/dây dài trong file person; dù không có người trong file parachute. Không tạo sprite sheet hoặc nhiều tư thế trong một ảnh. Một pose lơ lửng đủ cho prototype; animation bay/lắc/hạ xuống được tạo trong renderer, không cần generate từng frame. AI không bảo đảm pixel-perfect; artist phải căn bbox/anchor thực sau gen.

### Thư mục và tên file — thêm 8 ảnh

Nguồn: `D:\ANT_1\city-bloxx-main\art\source\fx\population\default\`.

| Class | Người | Dù |
|---|---|---|
| residential | person_residential_default_fall_v001.png | parachute_residential_default_open_v001.png |
| industrial | person_industrial_default_fall_v001.png | parachute_industrial_default_open_v001.png |
| office | person_office_default_fall_v001.png | parachute_office_default_open_v001.png |
| highrise | person_highrise_default_fall_v001.png | parachute_highrise_default_open_v001.png |

Sau QA: bỏ `_v001`, lưu `art/approved/fx/population/default/`, rồi đưa vào **cả hai** `<APP>/public/game/fx/population/default/`. Cập nhật manifest/hashes/target allowlist khi import. Game hiện chưa load các file này; script export cũ chưa hỗ trợ bộ population. Không tự copy vào runtime rồi coi animation đã hoàn thành. Tổng cần gen theo v3 hiện tại: **12 building + 8 population = 20 ảnh**.

### person_residential_default_fall_v001.png

```text
ONE cheerful adult residential citizen sprite for the population-arrival animation of a 2D City Bloxx stacking game. ONE person only, full body, front orthographic view, no perspective. Transparent RGBA canvas 128x192 pixels. The entire person including hands, shoes and harness must fit within an EXACT 64x128-pixel bounding box at x=32..96,y=32..160; everything outside transparent. Harness attachment centered at pixel (64,76), feet aligned to baseline y=160. Small readable stylized proportions, friendly simple face, blue #4B91D1 casual jacket and sand #E8CF9E trousers matching a compact blue residential facade. Cream accents, dark simple shoes. Secure visible parachute harness across the torso, hands resting on the shoulder straps, legs gently bent in a relaxed safely suspended pose. Daylight-city original 2D cel shading, warm upper-left light, crisp silhouette readable when reduced to 24x48 world units. No parachute canopy, no long suspension lines, no building, no background, no ground, no cast shadow, no second person, no crowd, no extra arms or legs, no lettering, no logo, no watermark, no baked checkerboard.
```

### parachute_residential_default_open_v001.png

```text
ONE open residential-themed parachute canopy with suspension lines, isolated sprite for the same daylight-city 2D game as a blue residential citizen. NO person in this image. Front orthographic view, symmetrical inflated cloth canopy, not an umbrella. Transparent RGBA canvas 256x192 pixels. Canopy EXACTLY 192 pixels wide and 80 pixels tall at x=32..224,y=16..96. Thin clearly readable suspension lines occupy only x=64..192,y=96..168 and converge at a small bottom connection eye exactly at (128,168). No pixels outside the specified canopy/line regions. Blue #4B91D1 and warm cream/sand #E8CF9E cloth panels, soft simple seams echoing residential balcony/window rhythm without literal windows or houses painted on the cloth. Original stylized cel shading, warm upper-left light, crisp small-scale silhouette. One canopy only, no person, no building, no crane, no logo or text, no extra parachute, no background, ground, cast shadow, watermark or baked checkerboard.
```

### person_industrial_default_fall_v001.png

```text
ONE cheerful adult industrial worker sprite for a 2D City Bloxx population-arrival animation. ONE person only, full body front orthographic view. Transparent RGBA canvas 128x192 pixels. Entire person, helmet, hands, boots and harness fit inside an EXACT 64x128-pixel box at x=32..96,y=32..160; outside transparent. Centered harness attachment at (64,76), feet baseline y=160. Compact stylized proportions, simple friendly face, red #C45B4E work coveralls with charcoal #38434D reinforced panels, small cream reflective strips, compact safety helmet and dark work boots. Match the palette and practical steel-panel character of the industrial building; no tools extending outside the body. Secure parachute harness, hands on shoulder straps, gently bent relaxed legs, safely suspended rather than freefall. Daylight-city original 2D cel shading, warm upper-left light, crisp silhouette at 24x48 world units. No canopy, no long lines, no factory, no scene, no ground or cast shadow, no second worker, no crowd, no extra limbs, no text, logo, watermark or baked checkerboard.
```

### parachute_industrial_default_open_v001.png

```text
ONE open industrial-themed parachute canopy with suspension lines, isolated 2D daylight-city sprite. NO person. Front orthographic view, one symmetrical inflated cloth canopy, not an umbrella, roof or metal structure. Transparent RGBA canvas 256x192 pixels. Canopy EXACTLY 192x80 pixels at x=32..224,y=16..96. Thin readable suspension lines confined to x=64..192,y=96..168 converge at connection eye (128,168). Outside those regions transparent. Red #C45B4E and charcoal #38434D cloth panels, practical reinforced seam pattern and tiny pale reflective trim matching the worker and industrial building. Fabric remains flexible, not steel. Original cel shading, warm upper-left light, bold readable outline. No worker, no factory painted on the canopy, no crane, no second parachute, no equipment dangling below the eye, no background, ground, shadow, lettering, logo, watermark or baked checkerboard.
```

### person_office_default_fall_v001.png

```text
ONE cheerful adult office employee sprite for a 2D City Bloxx population-arrival animation. ONE person only, full body front orthographic view. Transparent RGBA canvas 128x192 pixels. Entire person, hair, hands, shoes and safety harness contained in an EXACT 64x128-pixel box at x=32..96,y=32..160, outside transparent. Centered torso harness attachment (64,76), feet baseline y=160. Small stylized readable proportions, friendly simple face. Green #4B9D89 business-casual jacket, pale #B9DBDF shirt, charcoal slim trousers and simple dark shoes matching the clean green office tower palette. No loose tie or dangling accessories. Secure visible parachute harness, hands on shoulder straps, legs gently bent in a relaxed safe suspended pose. Daylight-city original 2D cel shading, warm upper-left light, crisp silhouette at 24x48 world units. No canopy, no long lines, no office building, no briefcase outside the silhouette, no background, ground, cast shadow, second employee, crowd, extra limbs, text, logo, watermark or baked checkerboard.
```

### parachute_office_default_open_v001.png

```text
ONE open office-themed parachute canopy with suspension lines, isolated 2D daylight-city sprite. NO person. Front orthographic view, one symmetrical inflated cloth canopy. Transparent RGBA canvas 256x192 pixels. Canopy EXACTLY 192x80 pixels at x=32..224,y=16..96. Thin suspension lines confined to x=64..192,y=96..168 converge at one small eye exactly at (128,168). Outside transparent. Green #4B9D89 and pale glass-color #B9DBDF cloth panels with clean evenly spaced vertical seams echoing office mullion rhythm, but the material is fabric, NOT actual glass. Match the office employee and office building palette. Original cel shading, warm upper-left light, crisp readable shape. No person, no literal windows, no office tower painted on the canopy, no second canopy, no umbrella handle, no background, ground, shadow, text, logo, watermark or baked checkerboard.
```

### person_highrise_default_fall_v001.png

```text
ONE cheerful adult high-rise resident sprite for a 2D City Bloxx population-arrival animation. ONE person only, full body front orthographic view. Transparent RGBA canvas 128x192 pixels. Entire person including hair, hands, shoes and harness fits inside an EXACT 64x128-pixel box at x=32..96,y=32..160; outside transparent. Centered torso harness attachment (64,76), feet baseline y=160. Compact stylized proportions, friendly simple face, cream #F0E4C7 smart-casual jacket with subtle gold #D9B34C trim, navy trousers and dark shoes. Elegant clean vertical costume accents matching the cream/gold high-rise facade and crown; no crown or building-shaped costume. Secure parachute harness, hands on shoulder straps, relaxed gently bent legs, safely suspended. Daylight-city original 2D cel shading, warm upper-left light, crisp silhouette readable at 24x48 world units. No canopy, long lines, skyscraper, oversized accessories, ground, background, cast shadow, second person, crowd, extra limbs, text, logo, watermark or baked checkerboard.
```

### parachute_highrise_default_open_v001.png

```text
ONE open high-rise-themed parachute canopy with suspension lines, isolated 2D daylight-city sprite. NO person. Front orthographic view, one symmetrical inflated cloth canopy. Transparent RGBA canvas 256x192 pixels. Canopy EXACTLY 192x80 pixels at x=32..224,y=16..96. Thin readable suspension lines remain in x=64..192,y=96..168 and converge at a small connection eye exactly at (128,168). Outside transparent. Gold #D9B34C and warm cream #F0E4C7 elegant narrow cloth panels, subtle navy seams, gently raised center arc and tidy vertical rhythm inspired by a high-rise crown without forming a hard roof or spire. Match the high-rise resident and building palette. Original cel shading, warm upper-left light, crisp small-scale silhouette. Flexible fabric, not metal. No person, tower, second parachute, umbrella handle, background, ground, shadow, text, logo, watermark or baked checkerboard.
```

### QA bộ population

- 8 PNG tách riêng, alpha thật; cùng style với 12 building, không background hoặc chữ.
- Mỗi ảnh chỉ một người hoặc một dù; đủ bốn class, không gen crowd/spritesheet.
- Kiểm tra bbox và anchor thật, không chỉ nhìn canvas; giữ tỷ lệ dù/người 3:1.
- Ghép thử eye dù với harness người: dây không đâm vào mặt, đầu không xuyên tán dù, tay/chân không bị cắt.
- Khi bỏ dù, sprite người vẫn có thể hạ vào cửa sổ; nền/nhà là lớp renderer riêng.
- Nhân vật không quyết định điểm: animation hiển thị nhóm đại diện có giới hạn, không một sprite cho từng đơn vị population.
