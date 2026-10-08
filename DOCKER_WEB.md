# Chạy Web bằng Docker

Chạy trong `D:\ANT_1\city-bloxx-main`, không phải thư mục Playable.

Đã có `.env` mẫu để chạy tại `http://localhost:56789/play`. Nếu chưa có `.env`, copy `.env.example` thành `.env` (không ghi đè cấu hình đang dùng). Khởi động Docker Desktop ở chế độ Linux containers trước khi chạy.

```powershell
docker compose config --quiet
docker compose up -d --build web
docker compose ps
docker compose logs --tail 100 web
```

Cấu hình hiện tại trong `.env`:

```dotenv
WEB_BIND_ADDRESS=127.0.0.1
WEB_PORT=56789
PORT=3000
HOSTNAME=0.0.0.0
NEXT_PUBLIC_SITE_URL=http://localhost:56789/
```

## Đưa lên VPS hoặc máy chủ

Copy mã nguồn (gồm các thư mục `packages`, `base-game-nextjs`, public của `base-playable-main`, `scripts`, lockfile và cấu hình Docker) lên máy chủ có Docker Engine + Compose. Không copy `node_modules`, `.next`, `dist`, `tmp`; Docker sẽ tự build. Tạo `.env` tại thư mục gốc từ `.env.example` và đặt địa chỉ truy cập thực tế trước khi build.

Nếu truy cập trực tiếp qua IP ở port 56789:

```dotenv
WEB_BIND_ADDRESS=0.0.0.0
WEB_PORT=56789
PORT=3000
NEXT_PUBLIC_SITE_URL=http://YOUR_SERVER_IP:56789/
```

Thay `YOUR_SERVER_IP` bằng IP máy chủ, mở TCP 56789 trên firewall/security group của máy chủ, rồi chạy `docker compose up -d --build web` ở thư mục gốc. Truy cập `http://YOUR_SERVER_IP:56789/play`.

Nếu dùng domain/HTTPS qua reverse proxy chạy trên cùng máy chủ, giữ bind `127.0.0.1`, trỏ proxy tới `http://127.0.0.1:56789`, đặt `NEXT_PUBLIC_SITE_URL=https://your-domain.example/` rồi build lại. Nếu proxy nằm trong container riêng, phải cấu hình mạng Docker giữa proxy và Web thay vì dùng localhost của container proxy.

Kiểm tra server đang chạy:

```powershell
docker compose ps
curl.exe -I http://localhost:56789/play
```

Trên Linux, dùng `curl -I http://localhost:56789/play`. Sau mỗi lần cập nhật code, chạy lại `docker compose up -d --build web`.

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
