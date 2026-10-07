# Bỏ ảnh City Bloxx ở đâu?

Favicon + hai icon mạng: [UI Art v4](../City_Bloxx_UI_Art_Prompts_v4.0.md). Lưu favicon ở `art/source/brand/default/`, tim ở `art/source/ui/default/`; file hướng dẫn có kích thước vật thể, prompt riêng và đường dẫn xuất cho Web/Playable.

Quy chuẩn building mới: [Art Prompts v3](../City_Bloxx_Art_Prompts_v3.0.md), lưu 12 ảnh `_v003` tại `art/source/stack/compact-v3/`. Các loại asset khác dùng [Art Prompts v2](../City_Bloxx_Art_Prompts_v2.0.md). Roadmap: [Development Plan v2](../City_Bloxx_Development_Plan_v2.0.md).

Gốc project: `D:\ANT_1\city-bloxx-main\`.

Population FX mới: thêm **8 ảnh người/dù theo bốn class** theo mục Population FX trong [v3](../City_Bloxx_Art_Prompts_v3.0.md), lưu `art/source/fx/population/default/`. Người và dù tách file riêng, màu/trang phục đồng bộ nhà tương ứng. Đây là asset chuẩn bị cho C3.8, chưa có animation trong game.

## Ảnh vừa generate

Tạo thư mục khi bắt đầu nhận ảnh. Lưu ba asset đầu tiên tại:

```text
art/source/stack/default/bldg_residential_default_mid_v001.png
art/source/stack/default/crane_rig_default_sprite_v001.png
art/source/stack/default/crane_hook_default_sprite_v001.png
```

Style board lưu `art/source/style/anchor_daylight_city_v001.png`; bản được duyệt dùng làm reference ở `art/reference/anchor_daylight_city.png`.

## Ảnh đã căn và duyệt

Xuất PNG có alpha thật, đúng khổ và anchor theo art guide:

Với `bldg_*_mid` và `bldg_*_base`: canvas **512×256**, nhưng khối nhà duy nhất bên trong chỉ **256×128**, nằm giữa (padding trái/phải 128px, trên/dưới 64px). Khối nhà rộng:cao **2:1**, một tầng của một tòa nhà, không phải nhiều căn nối ngang. Dùng prompt đầy đủ đã sửa ở mục 7.1 của art guide; không dùng thông số body 384×96 cũ.

```text
art/approved/stack/default/bldg_residential_default_mid.png
art/approved/stack/default/crane_rig_default_sprite.png
art/approved/stack/default/crane_hook_default_sprite.png
```

Game không đọc trực tiếp thư mục `art/`. Bản nguồn giữ `_v001`, `_v002` để chọn lại; bản duyệt bỏ revision. Chưa có script tự động export/sync, phần đó thuộc phase C0–C3.

## Ảnh chạy trong game

Cập nhật 07/10/2026: 8 người/dù của bốn class đã có tại `art/approved/fx/population/default/*_v001.png`. Chạy `node scripts/import-population-assets.cjs` để copy nguyên PNG vào cả hai `public/game/fx/population/default/`, bỏ revision ở tên runtime và cập nhật manifest/hash; script không sửa ảnh hay export lại building. Audit alpha đọc-only: `node scripts/audit-population-assets.cjs`. C3.8 đã có animation; còn 12 ảnh building compact v3.

Sau tối ưu, copy các file default đã duyệt vào cả hai nơi:

```text
base-game-nextjs/public/game/stack/default/
base-playable-main/public/game/stack/default/
```

Nhóm khác thay `stack/default` bằng `city/default`, `ui/default`, `fx/default`, `bg/default`. Với theme mới, thay `default` bằng ID theme, nhưng chỉ copy sang target có bật theme đó trong manifest.

Ví dụ URL runtime:

- Web: `/game/stack/default/bldg_residential_default_mid.png`
- Playables: `./game/stack/default/bldg_residential_default_mid.png`

Không đưa ảnh master, file PSD, prompt, reference, OG hay submission thumbnail vào `public/game`. Ảnh marketing và bộ nộp YouTube có đường dẫn riêng ở mục 15 của art guide.
