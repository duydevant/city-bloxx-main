# Chạy Web bằng Docker

Chạy trong `D:\ANT_1\city-bloxx-main`, không phải thư mục Playable.

Đã có `.env` mẫu để chạy tại `http://localhost:3080/play`. Nếu chưa có `.env`, copy `.env.example` thành `.env` (không ghi đè cấu hình đang dùng).

```powershell
docker compose config --quiet
docker compose up -d --build web
docker compose ps
docker compose logs --tail 100 web
```

- `WEB_PORT`: port trên máy chủ; `PORT`: port bên trong container.
- `WEB_BIND_ADDRESS=127.0.0.1`: chỉ truy cập trên máy này. Muốn truy cập từ LAN, đổi thành `0.0.0.0` và kiểm tra firewall.
- `HOSTNAME=0.0.0.0`: giữ giá trị này để server lắng nghe trong container.
- Đổi `NEXT_PUBLIC_SITE_URL` cùng port/domain bên ngoài. Các biến `NEXT_PUBLIC_*` được đóng vào bản build; đổi xong phải `up -d --build web`.
- Đổi port, restart policy, image Node và healthcheck trong `.env`; compose không chứa giá trị port cố định.
- Auth/profile chưa có backend thật. `NEXT_PUBLIC_API_BASE_URL` là URL trình duyệt gọi, không phải tên service Docker; cấu hình này không tạo backend.
- Tiến trình/dân số lưu ở trình duyệt, không trong container. Đổi origin/domain/port sẽ có kho lưu riêng; không coi đó là mất save cũ.
- Không đưa token/mật khẩu vào `NEXT_PUBLIC_*`. `.env` không được copy vào image.

Dừng riêng Web:

```powershell
docker compose stop web
```

Image chạy Next standalone bằng user `node`, chỉ mang runtime và asset Web, không mang source art/dependencies dev vào runtime. Docker cần Linux containers. Nếu gặp `permission denied ... docker_engine`, mở Docker Desktop/kiểm tra quyền truy cập rồi chạy lại; ứng dụng chưa khởi động trong trường hợp đó.
