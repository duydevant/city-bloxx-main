# City Bloxx — favicon và icon mạng

07/10/2026. Cần gen **3 ảnh riêng**: favicon, tim còn mạng, tim mất mạng. Hiện game đã dùng tim vector đỏ hồng/viền rỗng và Web có favicon vector ba khối xếp tháp để dùng ngay. Các PNG dưới đây là bộ art thay thế sau khi gen và QA; chưa được import tự động.

## Đề xuất hình ảnh

- Favicon: một biểu tượng tháp gồm ba khối xếp dọc, khối trên vàng, hai khối dưới xanh, nền vuông bo góc xanh đậm. Không chữ, cần cẩu, dây hay nhiều cửa sổ vì không đọc được ở 16 px.
- Mạng: ba trái tim đỏ hồng. Mất một mạng thì trái tim ngoài cùng bên phải thành viền xám rỗng; vẫn giữ đủ ba vị trí để HUD không xê dịch. Mỗi tim là một mạng, không có nửa tim.
- Chỉ đổi màu trạng thái, không nhấp nháy liên tục ở một mạng. Có nhãn đọc màn hình “Mạng: 2/3”. Không cần gen số 1/2/3, spritesheet, trạng thái hover hay ảnh animation.

## Kích thước vật thể và đường dẫn

Gốc: `D:\ANT_1\city-bloxx-main\`. Tọa độ tính từ góc trên trái. Bbox đã gồm đường viền và highlight; không được vẽ vượt khung.

| Ảnh | Canvas nguồn | Vùng vật thể bên trong | Lưu ảnh gen |
|---|---|---|---|
| Favicon | 1024×1024 RGBA | Tile 896×896 tại (64,64); tháp 448×704 tại (288,160) | `art/source/brand/default/icon_city_bloxx_default_v001.png` |
| Tim đầy | 512×512 RGBA | Một tim 384×352 tại (64,80), tâm (256,256), đáy y=432 | `art/source/ui/default/ui_life_heart_full_v001.png` |
| Tim rỗng | 512×512 RGBA | Cùng silhouette/bbox/anchor tim đầy, stroke 28 px nằm trong bbox | `art/source/ui/default/ui_life_heart_empty_v001.png` |

AI có thể không xuất chính xác số pixel. Giữ đúng tỷ lệ, xuất lớn rồi căn lại theo bbox. Không chỉ resize toàn canvas nếu vật thể bị bé hoặc lệch. Tim đầy và tim rỗng phải có cùng kích thước nhìn thấy.

Sau QA, giữ master nguồn và tạo bản runtime:

| Bản xuất | Kích thước | Đích |
|---|---|---|
| Favicon PNG | 512×512 | `base-game-nextjs/app/icon.png` |
| Favicon ICO | chứa 16×16, 32×32, 48×48 trong một file | `base-game-nextjs/app/favicon.ico` |
| Apple touch icon | 180×180, nền xanh đậm phủ kín, không alpha | `base-game-nextjs/app/apple-icon.png` |
| Tim đầy/rỗng | mỗi ảnh 64×64 RGBA; bbox 48×44 tại (8,10) | `art/approved/ui/default/ui_life_heart_full.png` và `ui_life_heart_empty.png` |
| Tim runtime dùng chung | cùng hai PNG 64×64 | `base-game-nextjs/public/game/ui/default/` và `base-playable-main/public/game/ui/default/` |

Khi import favicon PNG, thay `app/icon.svg` tạm hiện tại để trình duyệt không chọn lẫn hai bản. Tim hiển thị khoảng 15–21 CSS px; PNG 64 px đủ cho màn hình mật độ cao. PNG tim chỉ được nối vào HUD sau khi cập nhật hash/dimensions/targets trong `packages/city-bloxx-content/assets.manifest.json` và kiểm tra bố cục. Không copy master 512 px/1024 px vào HUD. Không chạy `assets:export` cũ để nhập bộ UI mới.

## 1. Prompt favicon — gen một ảnh

```text
Create ONE original favicon master for a cheerful 2D city tower stacking game called City Bloxx. Output exactly one icon, no presentation sheet. Square 1024x1024 RGBA canvas. One solid deep navy #17394B rounded-square tile occupies exactly x=64..960, y=64..960 (896x896 pixels), corner radius 176 pixels; pixels outside this tile are transparent. Inside the tile, show ONE compact tower symbol made of exactly THREE large rounded rectangular blocks stacked vertically. All blocks are exactly 448 pixels wide, x=288..736. Top floating golden block: y=160..384, color #FFD368. Middle sky-blue block: y=400..624, color #78C3EF. Bottom blue block: y=640..864, color #4B91D1. Each block is 448x224 pixels with gently rounded corners; keep the two 16-pixel gaps clear. Total tower silhouette is 448x704 pixels centered at (512,512). Flat front view, bold simple geometry, restrained cel shading, one broad cream highlight on the gold block. Design must remain recognizable at 16x16 and 32x32 pixels. No typography, no letters, no numbers, no windows, no crane, no hanging rope, no city skyline, no second icon, no heart, no glow, no ground shadow, no mockup, no watermark, no checkerboard painted into the image.
```

## 2. Prompt tim còn mạng — gen một ảnh

```text
Create exactly ONE isolated full-life HEART HUD icon for a cheerful 2D city stacking game. Transparent RGBA canvas exactly 512x512 pixels. The complete visible heart INCLUDING its outline must fit an exact 384x352-pixel bounding box at x=64..448, y=80..432, centered at (256,256). Broad symmetrical rounded lobes, clear top notch, soft pointed bottom exactly at (256,432). Front-facing flat icon, no tilt, no isometric perspective. Solid warm coral-pink fill #EF6680, restrained dark rose #A93251 outline 28 pixels thick contained INSIDE the bounding box, slightly darker lower-right cel-shaded edge, and ONE broad pale pink #FFD8E2 highlight on the upper-left lobe. Crisp smooth silhouette designed to read at 20x20 screen pixels. Friendly and polished, not anatomical, no wings, no face, no eyes, no cross, no plus sign, no number. Exactly ONE heart; no row of three hearts, no half-heart, no empty-heart variant in the same image, no frame, no backdrop, no ground, no cast shadow outside the silhouette, no glow, no text, no watermark, no baked checkerboard. All pixels outside the heart must be truly transparent. Keep the heart centered and preserve generous transparent padding.
```

## 3. Prompt tim mất mạng — dùng tim đầy làm reference

Đính kèm tim đầy đã chọn khi gen tim rỗng, để giữ silhouette giống hệt.

```text
Using the attached full-life heart as the exact shape reference, create ONE empty-life HEART HUD icon. Preserve its silhouette, proportions, top notch, rounded lobes, bottom point, position and scale exactly. Transparent RGBA canvas 512x512 pixels. Outer visible bounds INCLUDING outline: x=64..448, y=80..432 (384x352 pixels), centered at (256,256), bottom point (256,432). Replace the filled pink body with an EMPTY transparent interior and a muted slate-gray #9CABB9 outline, exactly 28 pixels thick, drawn entirely inside the outer silhouette. Remove the pink highlight and all pink fill. The interior opening and every pixel outside the heart must be truly transparent, not white. Flat front-facing vector-like cel-game icon, clean crisp shape, readable at 20x20 pixels. Exactly ONE whole empty heart. No broken heart, no half-heart, no cracks, no fragments, no face, no number, no plus sign, no cross, no circle frame, no background, no shadow, no glow, no text, no other hearts, no sprite sheet, no watermark, no baked checkerboard. Do not shift, shrink or widen the reference silhouette.
```

## Kiểm tra trước khi import

- Mỗi file chỉ một icon, đúng alpha, không dính nền caro.
- Tim đầy/rỗng chồng lên nhau trùng biên; preview 20 px trên nền HUD sáng.
- Favicon vẫn phân biệt ba khối ở 16 px; nếu khe quá mảnh, bản ICO 16 px cần pixel-hint riêng để mỗi khe còn tối thiểu một pixel. Không ép AI phải tự xuất ICO.
- Kiểm tra favicon trên tab sáng/tối; apple icon dùng nền kín. Đây là ba lần gen, các size nhỏ được export từ ảnh nguồn.
