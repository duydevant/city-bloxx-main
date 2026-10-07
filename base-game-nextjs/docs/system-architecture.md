# System Architecture

Khung app cho game mới. Không có luật chơi, board, hay engine nào trong base này.

## Các lớp

```
app/           — Next.js App Router: trang chủ, đăng nhập, đăng ký, profile.
components/    — shadcn/ui (`components/ui/`) và chrome dùng chung (`components/layout/`).
lib/           — i18n, routes, API client, auth store, SEO.
providers/     — React Query và các provider gốc.
```

Game cụ thể thêm sau, trong `modules/<ten-game>/` và một route dưới `app/(main)/`. Base không biết game đó chơi thế nào.

## lib/ — hạ tầng app

- `lib/api/api-client.ts` — axios instance + interceptor refresh-token khi 401. `lib/api/auth.api.ts` là scaffold (throw lỗi với TODO) cho đến khi nối BE.
- `lib/store/auth.store.ts` — zustand + persist, lưu access/refresh token vào localStorage key `auth-storage`. `api-client.ts` đọc key này ngoài React cho interceptor.
- `lib/i18n.tsx` — i18n tự viết (không dùng next-intl), en/vi. Thêm ngôn ngữ: thêm vào `locales` và một dictionary khớp `TranslationKey`.
- `lib/routes.tsx` — enum route tập trung.
- `lib/site.ts` — site config tĩnh đọc từ env. Khi có CMS, thay bằng fetch.
- `lib/seo/` — JSON-LD schema helpers.

## UI

- `components/ui/` — shadcn. Cài thêm bằng `cmd /c npx shadcn@latest add <name> --yes`.
- `components/layout/` — header, footer, chuyển ngôn ngữ, menu tài khoản.
- `components/common/` — empty state dùng lại.
- `components/seo/` — JSON-LD.
