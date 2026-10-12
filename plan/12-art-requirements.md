# Art requirements — danh sách, kích thước vật thể, prompt và nơi lưu

Trạng thái: C4.3 Brick đã approved/imported ngày 12/10/2026; Compact/Harbor/Winter và release QA còn Planned. Tất cả đường dẫn tương đối với `D:\ANT_1\city-bloxx-main\`.

Brick gồm 18 PNG thật sinh riêng bằng built-in `image_gen` và một SVG badge; source v001 giữ nguyên, importer Brick độc lập đồng bộ approved/manifest/hai target. Pack 1.095.236 bytes; 29 Default assets không thay đổi. [Prompt provenance](../art/source/brick-prompts.md), [import QA](../art/qa/brick-import.json), [C4.3 evidence](evidence/C4.3-validation.json). Rig socket approved đo tại (931,256), map về world anchor cũ; socket trong prompt là mục tiêu ban đầu. Alpha/canonical bbox/seam, gallery 3/20 tầng, mini 24px và cache headless đã kiểm; first-load/FPS trên điện thoại thật thuộc release gate.

## 1. Cần gen thêm gì và khi nào?

| Phase | Art cần | Có bắt buộc ngay không? |
|---|---|---|
| C4.0–C4.2 | Icon stats/XP/mission bằng SVG/code; reuse Default | Không cần PNG mới để phát triển |
| C4.3 | Brick: 12 modules + 4 minis + rig/hook + badge | Bắt buộc approved trước Verified cosmetics |
| Compact replacement riêng | Default compact còn 10/12 files; hai mids source chưa import | Không chặn Daily; không lẫn với Brick |
| Soft launch UI | Favicon/full-heart/empty-heart PNG | Optional vì vector hiện dùng được |
| C5 | Harbor map + thumbnail + Dock Clock Tower mini | Bắt buộc trước Verified Harbor |
| C6 | Share card/heatmap/ghost/Hall/Album | Render bằng code/data, không AI gen ảnh kết quả |
| C7 | Winter crane rig/hook, Residential winter roof, badge; season crane set | Theo từng subrelease, không gen full Winter theme |
| Population | 8 sprites person/parachute bốn class đã có | Reuse; không cần gen thêm bộ giống hệt |

Brick có 18 gameplay PNG + badge (PNG hoặc code-native). Không thêm background Brick bắt buộc, không đếm mái hai lần. Người/dù giữ class colors, không phải một sprite cho mỗi quality; số lượng FX do code quyết định.

## 2. Folder, filename và mapping

```text
art/
├── reference/                         reference đã chọn, không ship
├── source/
│   ├── stack/brick/                   bldg_<class>_brick_<part>_v001.png
│   ├── stack/compact-v3/              default revision v003 hiện có
│   ├── city/brick/                    city_<class>_brick_mini_v001.png
│   ├── rig/brick/                     crane_<rig|hook>_brick_sprite_v001.png
│   ├── ui/brick/                      ui_collection_brick_badge_v001.png
│   ├── bg/harbor/                     bg_harbor_default_map_v001.png
│   ├── city/harbor/                   landmark_dock_clock_tower_mini_v001.png
│   └── rig/winter/                    crane_<rig|hook>_winter_sprite_v001.png
├── approved/                          cùng nhánh nhưng filename bỏ _v001
└── exports/
    ├── web/                           promotional/share, không tự ship
    └── youtube/submission/            screenshot/thumbnail portal
```

Class IDs chính xác: `residential`, `industrial`, `office`, `highrise`; parts: `base`, `mid`, `roof`. Không dùng `high-rise` trong filename hoặc theme `classicbrick` khác catalog `brick`.

Mapping gameplay: `art/approved/<relative-path>` → `base-game-nextjs/public/game/<relative-path>` và `base-playable-main/public/game/<relative-path>`. Ví dụ `approved/stack/brick/bldg_office_brick_mid.png` → hai `public/game/stack/brick/bldg_office_brick_mid.png`.

Rig Brick mới đặt trong `rig/brick/`; default hiện tại vẫn ở `stack/default/`, không di chuyển default chỉ để thống nhất tên. Manifest/catalog resolver hỗ trợ path mới. SVG badge có thể nằm renderer/UI assets, không bắt buộc giả định mọi icon là PNG manifest.

Không đưa master/source/references/submission vào runtime. Không copy thẳng file `_v001` vào public hoặc chạy exporter cũ chỉ nhận default v001 để nhập Brick/compact. Importer phải tạo metadata/hash/dimensions/targets và sync hai bản output trong cùng task.

## 3. Quy cách pixel — canvas khác kích thước vật thể

Tọa độ từ góc trên trái. Bbox ghi dạng `[left,right) × [top,bottom)`, right/bottom là seam boundary, không phải thêm một pixel. Alpha outside body phải thật sự trong suốt.

| Asset | Canvas approved | Vùng vật thể / anchor |
|---|---|---|
| Base/mid | 512×256 RGBA | Body đúng 192×160 ở x=160..352, y=48..208; bottom origin (256,208) |
| Roof | 512×256 RGBA | Footprint 192, x=160..352; toàn cap trong y=48..208; bottom seam y=208 |
| City mini | 256×384 RGBA | Tối đa 192×256 ở x=32..224, y=64..320; ground anchor (128,320) |
| Crane rig Brick | 1024×512 RGBA | Assembly trong x=64..960, y=96..416; cable socket mục tiêu (896,288) |
| Hook Brick | 128×128 RGBA | Assembly trong x=40..88, y=16..112; cable socket (64,16), load anchor (64,112) |
| Collection badge | 256×256 RGBA | Silhouette 192×192 tại (32,32), không text |
| Harbor background | 1536×1024 opaque | Trung tâm 65% sạch để overlay grid; water/docks ở borders |
| Harbor thumbnail | 512×512 opaque | Crop/export từ background, không gen lặp |
| Dock Clock Tower | 256×384 RGBA | Bbox/ground anchor như mini; không số/chữ trên clock |

Runtime base/mid map body 192×160 → world 144×120 bằng scale đều 0,75. Không scale cả canvas thành body. Brick near-square, không dùng lại yêu cầu body 256×128 từ prompt v2.

AI không đảm bảo pixel-perfect. Nếu output lớn hơn, giữ cùng tỷ lệ rồi artist crop/căn đúng approved canvas; không kéo giãn mặt tiền để chữa ảnh nhiều gian. Rig/hook anchors cần đo lại trên approved art và khai báo metadata; renderer map về pivot/attachment hiện hành, không sửa world spawn hoặc rope length để khớp PNG.

## 4. Quy trình gen và QA

1. Gen Residential Brick mid trước, chọn style/cel shading/brick density rõ ở 144×120.
2. Dùng một mid đã chọn làm style/geometry reference, gen ba mid class còn lại. Reference chỉ một module, không board nhiều nhà.
3. Gen base/roof từng class với mid cùng class; mỗi lượt chỉ một file.
4. Gen minis rồi rig/hook. Badge có thể vẽ SVG trước, PNG là optional replacement.
5. QA alpha/seam/bbox/anchors, ghép ba và 20 tầng, preview mobile; source không ghi đè, revision tăng khi sửa.
6. Artist chuẩn hóa approved; importer khai báo manifest/catalog/crop; validation và build hai target.
7. Decode/raster cache trước run; kiểm warm animation và cold theme load trên thiết bị thật.

Budget target C4: runtime stack module ưu tiên ≤128 KiB, mini ≤128 KiB, rig ≤256 KiB, hook/badge ≤32 KiB; Brick pack mục tiêu ≤3 MiB. PNG lossless tối ưu, không full master lớn trong animation. New Harbor map ưu tiên ≤1 MiB. Tổng package/initial/save theo Y0–Y2, không coi tổng PNG bytes là texture RAM.

## 5. Prompt Brick — MID, mỗi khối là một ảnh

### `bldg_residential_brick_mid_v001.png`

```text
Create exactly ONE middle-floor module of ONE narrow residential tower for a 2D stacking game, not a whole house or multiple houses. Flat FRONT ORTHOGRAPHIC elevation, zero isometric perspective. Transparent RGBA canvas 512x256. The solid rectangular facade is EXACTLY 192x160 pixels at x=160..352, y=48..208, ratio 1.2:1; all pixels outside transparent. ONE compact facade, at most two slim window columns in one row. Warm buff brick with pale stone trim and blue #4B91D1 accents, subtle inset balcony inside the body only. Warm upper-left light, clean original cel shading, crisp edges and broad readable details. Entire top and bottom edges perfectly horizontal continuous stacking seams. No roof, ground, shadow outside the body, doorway, crane or cable. No second building, twin houses, third bay, wing, annex, long frontage, text, logo, watermark or baked checkerboard.
```

### `bldg_industrial_brick_mid_v001.png`

```text
Create exactly ONE middle-floor module of ONE compact narrow INDUSTRIAL TOWER, never a long factory, warehouse, shed or workshop complex. FRONT ORTHOGRAPHIC elevation, no perspective. Transparent RGBA canvas 512x256. ONE solid body EXACTLY 192x160 pixels at x=160..352, y=48..208, ratio 1.2:1, outside fully transparent. Red #C45B4E brick, charcoal #38434D inset steel framing, pale stone trim, one compact vent and at most two narrow windows in one row. Original friendly cel shading, warm upper-left daylight, readable crisp edges. Flat horizontal full-width top and bottom stacking seams. No roof, chimney, ground, under-object shadow, crane or cable. Absolutely no second building, twin factory, two or three factory halls, repeated bays, side wings, attached warehouse, long horizontal structure, text, watermark or baked checkerboard.
```

### `bldg_office_brick_mid_v001.png`

```text
Create exactly ONE middle-floor module of ONE standalone narrow OFFICE TOWER, not two towers or a wide office complex. Flat FRONT ORTHOGRAPHIC elevation, zero isometric view. Transparent RGBA canvas 512x256. Solid facade EXACTLY 192x160 pixels at x=160..352, y=48..208, ratio 1.2:1, outside fully transparent. ONE near-square facade with warm brick piers, pale stone trim, green #4B9D89 framing and light #B9DBDF glass, at most two slim window columns in one row. Original daylight-city cel shading and warm upper-left light, clean broad details. Full-width top and bottom edges are flat horizontal stacking seams. No roof, doorway, podium, ground, shadow, crane or cable. No twin facade, second tower, third office bay, annex, wing, long curtain wall, text, watermark or baked checkerboard.
```

### `bldg_highrise_brick_mid_v001.png`

```text
Create exactly ONE middle-floor module of ONE slender HIGH-RISE TOWER, not an entire skyscraper or several buildings. Flat FRONT ORTHOGRAPHIC view, zero perspective. Transparent RGBA canvas 512x256. ONE rectangular solid facade EXACTLY 192x160 pixels at x=160..352, y=48..208, ratio 1.2:1, outside fully transparent. Warm cream #F0E4C7 brick, pale stone trim, gold #D9B34C inset vertical ribs and at most two narrow elegant windows in one row. Original friendly cel shading, upper-left daylight, crisp readable silhouette. Top and bottom perfectly flat horizontal continuous stacking seams. All ornament stays inside the body. No crown, roof, spire, doorway, ground, shadow, crane, cable, second tower, connected buildings, side wing, long podium, text, watermark or baked checkerboard.
```

## 6. Prompt Brick — BASE

Dùng mid cùng class làm reference. Không reference ảnh cả skyline.

### `bldg_residential_brick_base_v001.png`

```text
Using the attached residential Brick middle-floor module, create exactly ONE matching GROUND-FLOOR module of ONE compact standalone tower. Preserve its front orthographic camera, warm brick, pale stone trim, blue #4B91D1 accents and upper-left cel-shaded light. Transparent RGBA canvas 512x256, solid body EXACTLY 192x160 at x=160..352,y=48..208; outside transparent. One small entrance and at most two slim windows contained inside the body. Top and bottom seams flat horizontal, no porch or steps protruding. No complete house, roof, ground slab, pavement, shadow, neighboring house, second facade, wing, text, watermark or checkerboard.
```

### `bldg_industrial_brick_base_v001.png`

```text
Using the attached industrial Brick middle-floor module, create exactly ONE GROUND-FLOOR module of ONE narrow INDUSTRIAL TOWER, not a warehouse or long multi-bay factory. Match red #C45B4E brick, charcoal #38434D steel, pale trim and upper-left cel shading. Front orthographic, transparent RGBA 512x256. ONE body EXACTLY 192x160 at x=160..352,y=48..208; outside transparent. One compact centered loading door wholly inside the facade. Flat full-width top/bottom seams. No extra hall, second building, twin loading doors as separate bays, wing, roof, ground, steps, shadow, crane, text, watermark or checkerboard.
```

### `bldg_office_brick_base_v001.png`

```text
Using the attached office Brick middle-floor module, create exactly ONE matching GROUND-FLOOR module of ONE narrow office tower. Front orthographic, transparent RGBA canvas 512x256, ONE solid body EXACTLY 192x160 at x=160..352,y=48..208; outside transparent. Match warm brick, pale stone, green #4B9D89 and glass #B9DBDF with upper-left cel shading. One narrow central glass entrance, at most two slim columns, no extended lobby. Full-width top and bottom seams flat horizontal. No whole tower, twin tower, third office bay, podium, annex, roof, ground, pavement, shadow, text, watermark or checkerboard.
```

### `bldg_highrise_brick_base_v001.png`

```text
Using the attached high-rise Brick middle-floor module, create exactly ONE matching GROUND-FLOOR module of ONE slender tower. Front orthographic, transparent RGBA 512x256, solid body EXACTLY 192x160 at x=160..352,y=48..208, outside transparent. Cream #F0E4C7 brick, pale stone trim, gold #D9B34C ribs, one elegant compact entrance and at most two slim windows. Warm upper-left cel shading, broad readable detail. Flat horizontal top/bottom seams. No full skyscraper, second building, wings, long podium, roof, ground slab, stairs outside body, shadow, crane, text, watermark or checkerboard.
```

## 7. Prompt Brick — ROOF

### `bldg_residential_brick_roof_v001.png`

```text
Create exactly ONE isolated ROOF CAP for the attached compact residential Brick floor module, not a whole house. Front orthographic, transparent RGBA canvas 512x256. Footprint EXACTLY 192 pixels wide at x=160..352, horizontal bottom attachment seam y=208. All cap detail inside x=160..352,y=48..208, outside transparent. Warm buff brick parapet, pale stone coping, blue #4B91D1 trim and one tiny centered low water tank. Match warm upper-left cel shading and line weight. No lower floor, overhanging side roof, second roof, neighboring house, ground, shadow, cable, crane, text, watermark or checkerboard.
```

### `bldg_industrial_brick_roof_v001.png`

```text
Create exactly ONE isolated ROOF CAP for ONE narrow industrial Brick tower, not a long factory roof or multiple sheds. Match the attached mid in front orthographic view. Transparent RGBA 512x256. Footprint EXACTLY 192 pixels at x=160..352, flat bottom seam y=208; all detail contained within y=48..208, outside transparent. Red #C45B4E brick parapet, charcoal #38434D low steel vent and pale stone coping. Warm upper-left cel shading, broad readable shape. No chimney extending out of bounds, second roof, lower floors, side halls, wings, ground, shadow, cable, text, watermark or checkerboard.
```

### `bldg_office_brick_roof_v001.png`

```text
Create exactly ONE isolated ROOF CAP for ONE compact office Brick tower matching the attached mid. Front orthographic, transparent RGBA canvas 512x256. Footprint EXACTLY 192 pixels at x=160..352, horizontal bottom attachment seam y=208; all roof detail within x=160..352,y=48..208, outside transparent. Warm brick low parapet, pale stone coping, green #4B9D89 trim and ONE small centered pale-glass service housing. Warm upper-left original cel shading. No broad HVAC row, twin roofs, whole tower, lower floors, wings, ground, shadow, crane, cable, text, watermark or checkerboard.
```

### `bldg_highrise_brick_roof_v001.png`

```text
Create exactly ONE isolated compact ROOF CAP for ONE slender high-rise Brick tower matching the attached mid. Front orthographic, transparent RGBA 512x256. Footprint EXACTLY 192 pixels at x=160..352, flat bottom seam y=208, every crown detail inside x=160..352,y=48..208; outside transparent. Cream brick and pale stone crown with gold #D9B34C trim and one short centered inset finial, never exceeding the bounding box. Warm upper-left cel shading, clean silhouette. No lower floor, full skyscraper, second crown, side wings, ground, shadow, crane, cable, text, watermark or checkerboard.
```

## 8. Minis, crane và badge

### Bốn minis — copy template rồi thay đúng một description

```text
Create exactly ONE complete miniature BUILDING_DESCRIPTION as a city-map token, not a floor module. Match the attached Brick class materials. Consistent 2:1 isometric projection with upright verticals and ONE compact square footprint. Transparent RGBA canvas 256x384. Entire silhouette fits x=32..224,y=64..320, ground anchor at (128,320). Warm upper-left daylight and clean broad cel shading readable at 24px. Whole structure visible with transparent padding. No neighboring building, detached wing, lot tile, ground plane, road, trees, people, cast shadow, text, watermark or baked checkerboard.
```

| Filename | Thay `BUILDING_DESCRIPTION` bằng |
|---|---|
| `city_residential_brick_mini_v001.png` | compact warm-buff brick apartment tower with pale stone trim, blue accents, two window columns and low water-tank roof |
| `city_industrial_brick_mini_v001.png` | narrow red-brick industrial tower with charcoal steel frame, one compact loading entrance and low rooftop vent, never a long factory |
| `city_office_brick_mini_v001.png` | upright compact office tower with warm brick piers, pale stone trim, green-framed glass and one small roof service housing |
| `city_highrise_brick_mini_v001.png` | slender cream-brick high-rise tower with pale stone ribs, gold trim and compact stepped crown |

Mini là nguyên tòa stylized, không cần vẽ đúng 10/20/30/40 floors. Chiều cao trong game hiển thị bằng UI/data.

### `crane_rig_brick_sprite_v001.png`

```text
Create exactly ONE upper assembly of a vintage yellow-painted tower crane for a 2D stacking game. Strict SIDE ORTHOGRAPHIC, no perspective convergence. Transparent RGBA canvas 1024x512. The entire assembly stays within x=64..960,y=96..416. ONE dark-steel lattice jib extends right from a compact yellow cabin and short upper mast, small left counterweight. The cable mounting socket is clearly located at source pixel (896,288); keep it empty, do not draw a cable. Warm upper-left cel shading, broad crisp simplified parts, match attached Daylight City Brick style. No ground mast, ground base, hook, rope, load, building, people, second crane, scenery, shadow, text, watermark or checkerboard.
```

### `crane_hook_brick_sprite_v001.png`

```text
Create exactly ONE compact lifting-hook assembly matching the attached Brick crane. Strict FRONT ORTHOGRAPHIC view. Transparent RGBA 128x128. Complete assembly within x=40..88,y=16..112. Cable socket centered at (64,16); load attachment centered at (64,112). Vintage yellow pulley housing and dark charcoal steel hook, broad crisp shapes, warm upper-left cel shading readable at tiny size. No long cable, rig, load, house, second hook, motion lines, ground, shadow, text, watermark or checkerboard. Preserve empty transparent padding and attachment axis.
```

### `ui_collection_brick_badge_v001.png` — optional PNG thay code badge

```text
Create exactly ONE collection-complete badge for a cheerful city stacking game. Transparent RGBA canvas 256x256. Entire badge fits a 192x192 box at x=32..224,y=32..224. ONE bold pale-gold medallion containing a single simple warm-brick tower silhouette with blue, red, green and gold accent bands. Flat front view, crisp broad cel shading, readable at 24px. No letters, numbers, words, ribbons outside the box, separate buildings, multiple badges, background, glow, cast shadow, watermark or checkerboard.
```

## 9. Harbor prompts

### `bg_harbor_default_map_v001.png`

```text
Create ONE original harbor background for a friendly 2D city-building game, full opaque 1536x1024 canvas. Elevated isometric-compatible camera, clean soft cel shading, warm upper-left daylight. Keep the central 65 percent broad, calm, dry and almost empty for a five-by-five interactive lot grid rendered separately. Suggest blue harbor water, distant docks, tiny simplified cranes and low warehouse silhouettes ONLY around the outer borders. No central water cutting through the build area, lot grid, roads crossing the center, foreground buildings, characters, UI, text, labels, logos or watermark. Low contrast background, readable game overlay takes priority.
```

### `landmark_dock_clock_tower_mini_v001.png`

```text
Create exactly ONE miniature original dock CLOCK TOWER landmark, not a real-world landmark replica. Consistent 2:1 isometric city-map projection, upright verticals, compact square footprint. Transparent RGBA canvas 256x384, entire silhouette within x=32..224,y=64..320, clean ground anchor (128,320). Warm stone and red-brick shaft, teal low roof, ONE large simple clock face with hands but absolutely NO numerals or letters. Upper-left daylight, broad clean cel shading readable at 24px, style matches attached city minis. No neighboring structures, ground tile, plaza, road, people, shadow, second tower, text, logo, watermark or checkerboard.
```

Thumbnail xuất từ approved map, không gen thêm. C7 Winter dùng các prompt Brick tương ứng nhưng material edit sang pale painted steel/cool blue/snow detail trong cùng bbox; tuyệt đối không thay silhouette/anchors. Season crane dùng material edit cream/gold trong cùng rig/hook anchors, không thêm paid branding.

## 10. UI đã có prompt và release QA

Favicon/tim: dùng [UI prompts v4](../City_Bloxx_UI_Art_Prompts_v4.0.md), đã có canvas/bbox/filename/approved/export sizes. Compact default: dùng [prompts v3](../City_Bloxx_Art_Prompts_v3.0.md), không trộn yêu cầu v2 2:1 vào body compact 1,2:1. Population hiện có: reuse theo class, harness/canopy render metadata hiện tại.

- [ ] Mỗi sprite chỉ một chủ thể; Industrial/Office không hai/ba gian nối nhau.
- [ ] Alpha thật, không nền caro hoặc shadow kéo dài; bbox không chỉ canvas.
- [ ] Base/mid seam không hở ở 3/20 tầng; roof width khớp, không overhang lợi thế.
- [ ] Crane socket/hook attachment đo thật và map về world anchor cũ.
- [ ] Source/approved/runtime filenames đúng, revision source giữ lại, hashes đúng hai targets.
- [ ] Preview class ở 144×120 và mini 24px; theme vẫn nhận biết bốn class.
- [ ] Asset, initial-load, decoded cache và save budgets đạt; test thực tế lúc theme first-load/swing/drop.
- [ ] Metadata submission YouTube không copy vào gameplay bundle, đúng portal spec tại ngày nộp.
