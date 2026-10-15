# Base Game Next.js

Khung Next.js để bắt đầu một game mới. Base này chỉ có component UI, layout, và các thư viện app đã nối sẵn. Logic game nằm ở project con, khi bạn đã có ý tưởng.

## Bắt đầu

```bash
npm install
cp .env.example .env.local
npm run dev
```

Mở `http://localhost:3000`.

## Scripts

```bash
npm run dev     # dev server (Turbopack)
npm run build   # production build
npm run lint    # eslint
npm test        # vitest run
npm run test:watch
npx tsc --noEmit
```

## Cấu trúc

```
app/           # Next.js App Router: trang chủ, auth, profile
components/    # shadcn/ui + layout (header, footer, language, account menu)
lib/           # i18n, routes, API client, auth store, SEO
providers/     # React Query + app providers
docs/          # code standards, system architecture
```

Thêm game mới: tạo route trong `app/(main)/` và module trong `modules/<ten-game>/`. Thêm mục nav trong `components/layout/game-header.tsx` khi game đã có trang.

## Auth Web

W1.2 đã nối Nest auth thật qua gateway `/api/v1`: đăng ký/đăng nhập, email verify/reset, profile và logout. JWT chỉ nằm trong memory; refresh dùng HttpOnly cookie. Web Locks tuần tự hóa cookie operations giữa tabs, và refresh response không rõ kết quả sẽ yêu cầu đăng nhập lại. Không dùng token trong localStorage hoặc hard redirect giữa lượt chơi.

Chạy stack gateway theo [hướng dẫn backend](../backend/docs/city-bloxx-infrastructure.md); dùng cùng một origin với `GAME_PUBLIC_URL`. Next standalone thiếu API vẫn chơi Guest; auth không được giả lập. Cloud save/verified leaderboard thuộc các mốc sau.

Chi tiết giao thức và acceptance: [Web auth](docs/web-auth.md). Từ repo root chạy `npm run evidence:auth` để kiểm browser + backend thật trên database/container tạm; không thay deployment đang chạy.
