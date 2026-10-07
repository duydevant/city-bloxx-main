# Population sprites — 8 ảnh mới

Prompt từng file và thông số chính xác: [Art Prompts v3](../../../../../City_Bloxx_Art_Prompts_v3.0.md), mục Population FX.

- `person_<class>_default_fall_v001.png`: canvas 128×192, một người tối đa 64×128 tại (32,32), harness (64,76).
- `parachute_<class>_default_open_v001.png`: canvas 256×192, một tán dù 192×80 tại (32,16), mắt nối (128,168).
- `<class>`: residential / industrial / office / highrise. Tổng 8 PNG RGBA, không crowd hoặc spritesheet.

07/10/2026: cả 8 PNG đã được người dùng cung cấp trực tiếp tại `art/approved/fx/population/default/`, kích thước thực tế person 1024×1536 và parachute 1448×1086, RGBA. Đã import nguyên bản sang hai `public/game/fx/population/default/`, bỏ `_v001` trong basename runtime, cập nhật manifest. Renderer dùng crop/anchor đo riêng và cache ở kích thước nhỏ, không kéo ảnh nguồn về bbox prompt bằng ghi đè. C3.8 đã triển khai, xem PROGRESS.
