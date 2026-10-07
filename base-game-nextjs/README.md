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

## Nối BE thật (auth)

`lib/api/api-client.ts` đã có interceptor refresh-token. `lib/api/auth.api.ts` vẫn là scaffold (throw lỗi, có `// TODO`). Khi có BE:

1. Implement `loginApi` / `refreshTokenApi` đúng response shape BE trả về.
2. Cập nhật `NEXT_PUBLIC_API_BASE_URL` trong `.env.local`.
3. Gọi `useAuthStore().setTokens()` sau khi login thành công (xem `app/(auth)/sign-in/page.tsx`).
