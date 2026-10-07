# City Bloxx asset audit — 2026-10-06

Kết luận: **đủ bộ 21 asset hình cơ bản để bắt đầu Quick Tower và chuẩn bị Build City**.

## Đã có

| Nhóm | Có / cần | Kết quả |
|---|---:|---|
| Building stack: 4 class × base/mid/roof | 12 / 12 | Đủ; mỗi `mid` là một khối nhà duy nhất |
| Crane rig + hook | 2 / 2 | Đủ; source chưa có alpha, pipeline đã tách nền |
| City mini: 4 class | 4 / 4 | Đủ; đã chuẩn hóa về canvas 256×384 |
| Empty lot | 1 / 1 | Đủ; đã chuẩn hóa về 256×128 |
| Stack sky + Downtown map | 2 / 2 | Đủ |
| Style anchor | 1 reference | Có, không ship vào game |

## Vấn đề nguồn và cách xử lý

- `crane_rig_default_sprite_v001.png` và `crane_hook_default_sprite_v001.png` đang nằm trong `art/source/city/default/` dù thuộc nhóm stack. Không di chuyển source để tránh làm mất liên kết file người tạo; script export đọc hai file này và xuất đúng vào `stack/default/`.
- Crane/hook source là RGB nền trắng. `scripts/export-game-assets.cjs` tạo alpha khi xuất. Bản approved đã kiểm tra được trên nền trong suốt; khi có thời gian artist nên retouch cạnh trắng ở 200–400% zoom.
- 12 ảnh stack nguồn là 1774×887; các ảnh có alpha và footprint nhất quán đủ dùng. Pipeline resize toàn canvas về 512×256, giữ registration giữa base/mid/roof.
- City minis có canvas nguồn khác nhau. Pipeline trim, scale theo class và neo chân tại y=320 để đặt lên cùng lot.
- Background Downtown nguồn 1672×941, pipeline crop cover về 1536×1024. Stack sky đã đúng 1024×1536.

## Runtime output

```text
art/approved/...
base-game-nextjs/public/game/...
base-playable-main/public/game/...
```

Runtime có 21 file, khoảng 3.96 MiB. File lớn nhất là background; sprite riêng đều dưới khoảng 206 KiB. Chạy lại:

```text
node scripts/export-game-assets.cjs
```

## Chưa cần để bắt đầu code

- UI icons, medals và bitmap FX: đang dùng chữ/CSS/canvas trong alpha.
- Classic Brick/Modern Glass, landmark, marketing icon/OG: làm theo phase sau.
- `lot_selected`/valid/invalid: renderer vẽ outline bằng code.

## QA art còn lại trước public launch

- Xem crane/hook trên nền sáng và tối để sửa halo nếu có.
- Stack thử mỗi class 10 tầng; kiểm tra seam base → mid → roof.
- Đặt đủ 25 mini lên grid thật để chỉnh occlusion/scale.
- So sánh grayscale để chắc bốn class vẫn nhận ra bằng silhouette.
