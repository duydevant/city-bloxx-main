# System Architecture

Web shell City Bloxx. Gameplay dùng chung `packages/city-bloxx-core`, renderer/content; auth dùng backend Nest hiện có qua gateway cùng origin.

## Các lớp

```
app/           — Next.js App Router: trang chủ, đăng nhập, đăng ký, profile.
components/    — shadcn/ui (`components/ui/`) và chrome dùng chung (`components/layout/`).
lib/           — i18n, routes, API client, auth store, SEO.
providers/     — React Query và các provider gốc.
```

`modules/city-bloxx/` nối shared game với Web, `modules/account/` chứa account forms/profile/dialog. Không đưa auth/HTTP vào shared core hoặc Playable.

## lib/ — hạ tầng app

- `lib/api/api-client.ts` — typed fetch cùng origin `/api/v1`, no-store, sanitized errors; `lib/api/auth.api.ts` nối register/verify/recovery thật.
- `lib/auth/session.ts` — JWT/profile trong memory, refresh HttpOnly cookie, Web Locks/BroadcastChannel và crash receipt; không hard redirect khi mất phiên. `lib/store/auth.store.ts` là React subscription, không persist token; key scaffold `auth-storage` cũ được xóa.
- `lib/i18n.tsx` — i18n tự viết (không dùng next-intl), en/vi. Thêm ngôn ngữ: thêm vào `locales` và một dictionary khớp `TranslationKey`.
- `lib/routes.tsx` — enum route tập trung.
- `lib/site.ts` — site config tĩnh đọc từ env. Khi có CMS, thay bằng fetch.
- `lib/seo/` — JSON-LD schema helpers.

## UI

- `components/ui/` — shadcn. Cài thêm bằng `cmd /c npx shadcn@latest add <name> --yes`.
- `components/layout/` — header, footer, chuyển ngôn ngữ, menu tài khoản.
- `components/common/` — empty state dùng lại.
- `components/seo/` — JSON-LD.

Chi tiết Web auth và local acceptance: [W1.2 guide](web-auth.md). Các account controls giữ native HTML form/dialog semantics phù hợp Web W0 để checkpoint/pause game tại chỗ; cloud/ranked còn ở các mốc tiếp theo.
