# Code Standards

## Nguyên tắc chung

- YAGNI / KISS / DRY.
- File dưới 200 dòng khi hợp lý — tách thành module nhỏ theo ranh giới logic (không tách máy móc).
- Tên file kebab-case, mô tả rõ mục đích (ưu tiên tên dài dễ hiểu hơn tên ngắn mơ hồ).
- Logic game thuộc `modules/<ten-game>/`, không nhét vào `components/ui/` hay `lib/`.

## Testing

- Vitest đã cấu hình. Đặt file `.test.ts` cạnh module nó kiểm tra.
- `npm test` chạy toàn bộ test, `npm run test:watch` cho dev loop.

## UI Components

- Dùng shadcn/ui (`components/ui/`) cho mọi primitive UI — không viết lại button/dialog/card thủ công.
- Cài component thiếu qua `npx shadcn@latest add <name> --yes` (Windows: `cmd /c npx shadcn@latest add <name> --yes` nếu PowerShell chặn execution policy).
- Component tuỳ biến đặt ở `components/layout/` hoặc trong `modules/<feature>/`, không đặt trong `components/ui/`.

## React/Next.js

- `.map()` trong JSX ưu tiên implicit return (arrow function trả thẳng JSX), chỉ dùng block body khi cần biến phức tạp không inline được.
- Component tự tính toán logic nội bộ từ props đã có, không để component cha tính sẵn rồi truyền xuống những gì con có thể tự suy ra.
- Next.js 16 (App Router, Turbopack) — API/convention có thể khác bản cũ, kiểm tra `node_modules/next/dist/docs/` khi không chắc.

## Git

- Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`), không có AI reference trong message.
- Không commit `.env`, `.env.local`, credentials.
