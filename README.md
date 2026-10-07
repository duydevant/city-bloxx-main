# City Bloxx Online

Quick Tower và Build City dùng chung core, renderer và scene cho Next.js Web và YouTube Playable. Chọn **Build City** từ menu `/play` hoặc Playable để mở Downtown 5×5. Trạng thái mới nhất: [PROGRESS](PROGRESS.md); lịch sử C0–C2: [checklist nghiệm thu](C0_C1_C2_ACCEPTANCE.md). Plan các phase tiếp theo: [Development Plan](City_Bloxx_Development_Plan_v2.0.md).

## Chạy từ thư mục gốc

Để soát phần đã xong/còn thiếu và thứ tự công việc tiếp theo, xem [Project Review Checklist](PROJECT_REVIEW_CHECKLIST.md).

```powershell
npm.cmd ci
npm.cmd run dev:web
# Terminal khác:
npm.cmd run dev:playable
```

Web: `/play` trên cổng Next mặc định 3000. Playable: URL Vite in ra, thông thường 5173. Preview ngoài YouTube dùng mock SDK/localStorage.

Docker Web: cấu hình ở `.env` thư mục gốc, chạy `docker compose up -d --build web`, mặc định `http://localhost:3080/play`. Xem [DOCKER_WEB](DOCKER_WEB.md) để đổi port/domain và phân biệt cấu hình build/runtime.

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

Root workspace dùng npm và root `package-lock.json`. Các lockfile trong app là bản tham chiếu migration cũ; thao tác dependency mới thực hiện từ root với `--workspace`. Không cần chạy migration script lại.

## Browser smoke

Sau build, mở hai server trong hai terminal:

```powershell
npm.cmd --prefix base-game-nextjs run start -- --port 3010
npm.cmd --prefix base-playable-main run preview -- --host 127.0.0.1 --port 4173
```

Terminal thứ ba: `npm.cmd run test:browser`. Script dùng Chrome đã cài ở đường dẫn Windows chuẩn, profile riêng trong `tmp/c0-c2-qa`, chặn SDK ngoài để test mock preview. Báo cáo JSON/screenshot được lưu cùng thư mục đó. Không dùng profile Chrome cá nhân.

## Code và art

- `packages/city-bloxx-core/src`: pure simulation, rules, result, input/replay, save schema, port contracts.
- `packages/city-bloxx-renderer/src`: Canvas renderer, DOM scene, UI styles, web audio placeholder.
- `packages/city-bloxx-content`: building catalog và asset manifest.
- `base-game-nextjs/modules/city-bloxx/quick-tower.tsx`: Web local-save/clock/audio adapter.
- `base-playable-main/src/game/index.ts`: Playable host save/lifecycle/audio/score adapter.
- `art/source`: ảnh gốc có suffix version; `art/approved`: runtime đã duyệt; `public/game` trong hai app: bản đồng bộ.

`npm.cmd run assets:check` kiểm kích thước/hash/allowlist/budget trước build. `npm.cmd run assets:export` export lại từ nguồn v001; **không dùng để import ảnh compact v3**. Prompt building mới: [Art Prompts v3](City_Bloxx_Art_Prompts_v3.0.md); lưu tại `art/source/stack/compact-v3/`, QA/căn/import riêng để đổi crop và hash. Các ảnh hiện tại được giữ nguyên, renderer tạm thu gọn body 144×120. Asset khác: [Art Prompts v2](City_Bloxx_Art_Prompts_v2.0.md).

Playable package nằm tại `base-playable-main/dist.zip`. Build/package pass chưa thay cho test/certification SDK thật.
