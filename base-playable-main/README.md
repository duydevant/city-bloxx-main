# Base Playable — YouTube Playables template

Moi yeu cau cua YouTube Playables (SDK, lifecycle, cloud save, ads, score, i18n,
audio, pause/resume, health, dong goi) da duoc lam san. **Lam game moi = chi viet
`src/game/`.**

Game hien tai: **City Bloxx Online — Quick Tower alpha**. Gameplay dung shared core o
`../packages/city-bloxx-core`, renderer o `../packages/city-bloxx-renderer`, va asset runtime
trong `public/game/`.

---

## 1. Bat dau nhanh

```bash
cp .env.example .env     # Windows: copy .env.example .env
npm install
npm run dev              # http://localhost:3000
```

> **Quan trong:** de test voi Test Suite thi dung `npm run preview` (port 4173),
> **KHONG** dung `npm run dev`. Xem muc 6.

Lam game that:

```bash
npm run package          # typecheck + build + kiem tra MUST + tao dist.zip
```

`dist.zip` la file nop len Test Suite / Developer Portal.

---

## 2. Lam game moi trong 4 buoc

1. **Doi ten + key save** trong `.env`:
   ```
   VITE_GAME_NAME=My Game
   VITE_SAVE_KEY=mygame_save_v1
   VITE_SAVE_VERSION=1
   VITE_REWARD_EXTRA_TIME=<rewardId dang ky tren Developer Portal>
   ```
2. **Viet game** trong `src/game/index.ts` (+ `src/game/styles.css`).
   Xoa ruot file demo, giu nguyen dong:
   ```ts
   export const game: PlayableGame = { autoReady: true, create(host) { ... } };
   ```
   Moi thu game can deu nam trong `host`. Khong import gi tu `src/platform/`.
3. **Them chu** vao `src/i18n/en.ts` va `src/i18n/vi.ts`.
4. `npm run package` → lay `dist.zip`.

**Khong can dong vao:** `src/main.ts`, `src/platform/*`, `index.html`, `vite.config.ts`.

---

## 3. API cua `host`

```ts
create(host: PlayableHost): void | Promise<void>
```

| Nhom | API | Ghi chu |
|---|---|---|
| DOM | `host.stage` | Vung ve cua game (da tinh safe-area, `role=application`, focus duoc) |
| | `host.root` | Phan tu goc `#app` |
| Lifecycle | `host.firstFrameReady()` / `host.gameReady()` | Base tu goi khi `autoReady: true`. Chi dung khi ban co animation intro |
| Luu tru | `await host.load<T>(fallback)` | Tu dong boc `{v, d}`, bo save cu neu `VITE_SAVE_VERSION` doi |
| | `await host.save<T>(data)` | Validate well-formed + gioi han 3 MiB |
| | `host.saveLater<T>(data)` | Debounce 250 ms — dung trong vong lap |
| | `await host.clearSave()` | |
| Diem | `host.sendScore(n)` | Debounce 800 ms, chi gui khi diem tang, tu bo so le/am |
| | `await host.flushScore(n)` | Gui ngay — dung khi game over / pause |
| Ads | `await host.showInterstitial()` | `{ok:true}` hoac `{ok:false, reason}` |
| | `await host.interstitialThen(fn)` | Co cooldown 60 s, **luon luon** chay `fn` |
| | `await host.showRewarded(rewardId)` | `rewarded: true` chi khi nguoi xem xem het quang cao |
| Audio | `host.isAudioEnabled()` / `host.onAudioEnabled(cb)` | Ton trong nut mute cua YouTube |
| | `host.beep("tap" \| "merge" \| "win" \| "lose" \| "reward" \| "error")` | SFX WebAudio, khong ton byte asset nao |
| i18n | `host.t("key", { bien })` | `"{bien}"` trong chuoi se duoc thay |
| | `host.locale` | Tu `ytgame.system.getLanguage()` |
| System | `host.onPause(cb)` / `host.onResume(cb)` / `host.isPaused()` | Pause tu dong flush save + score |
| | `host.onResize(cb)` / `host.getViewport()` | `{width,height,dpr,orientation}` |
| UI | `host.overlay().show({title, body, buttons})` | Modal generic, co `variant: "primary"\|"secondary"\|"ad"`, `disableOnClick` chong double-tap |
| | `host.toast(msg)` | |
| | `host.loading().hide()` | |
| Debug | `host.logError(ctx, err)` / `host.logWarning(ctx)` | Day len `ytgame.health` |
| | `host.inPlayables` | `true` khi chay that trong YouTube |

---

## 4. Bang doi chieu yeu cau YouTube ↔ file

| YouTube yeu cau | Da xu ly o |
|---|---|
| SDK phai load truoc moi game code | `index.html` (script dau tien trong `<head>`) |
| `firstFrameReady()` roi `gameReady()`, khong goi khi con loading | `src/main.ts` + `src/platform/lifecycle.ts` |
| Khong duoc override `window.ytgame` | `src/platform/ytgame.ts` → `ensureMock()` chi cai khi SDK vang mat |
| Cloud save ≤ 3 MiB, phai well-formed | `src/platform/save.ts` |
| Luu khi bi pause / thoat | `src/platform/system.ts` (pause, `visibilitychange`, `pagehide`) |
| `sendScore` so nguyen, khong spam | `src/platform/engagement.ts` |
| `getLanguage()` de lay ngon ngu | `src/platform/i18n.ts` |
| `isAudioEnabled()` / `onAudioEnabledChange()` | `src/platform/audio.ts` + `src/platform/sfx.ts` |
| `requestInterstitialAd()` / `requestRewardedAd(id)` | `src/platform/ads.ts` |
| `health.logError` / `logWarning` + bat moi loi JS | `src/platform/health.ts` (`installErrorReporting`) |
| Ten file chi chua ky tu hop le | `vite.config.ts` + `scripts/check-package.mjs` |
| Bundle < 30 MiB, khong request ra ngoai | `scripts/check-package.mjs` |
| Khong CSP / X-Frame-Options chan iframe | `index.html`, `vite.config.ts`, `nginx.conf` |
| `index.html` nam o goc file zip | `scripts/zip-dist.mjs` |

---

## 5. Cau truc thu muc

```
index.html              SDK script + man hinh loading (critical CSS inline)
vite.config.ts          base "./", port tu env, khong header tuy chinh
Dockerfile / nginx.conf / docker-compose.yml   deploy, moi port tu .env
.env.example            tat ca bien
scripts/
  check-package.mjs     kiem tra MUST tren dist/
  zip-dist.mjs          tao dist.zip (index.html o goc, duong dan "/")
src/
  main.ts               bootstrap — DUNG SUA
  platform/             TAT CA code lien quan YouTube — DUNG SUA
    ytgame.ts           type SDK + mock
    types.ts            PlayableHost / PlayableGame (hop dong cua game)
    config.ts           doc VITE_*
    host.ts             lap rap host
    lifecycle.ts save.ts audio.ts sfx.ts i18n.ts
    engagement.ts ads.ts system.ts health.ts
  ui/                   loading.ts overlay.ts toast.ts
  styles/               tokens.css base.css
  i18n/                 en.ts vi.ts index.ts
  game/                 << CODE CUA BAN O DAY >>
    index.ts            export const game: PlayableGame
    styles.css
```

---

## 6. Test voi Playables Test Suite

1. `npm run build`
2. `npm run preview` → `http://localhost:4173`
3. Mo Test Suite, dan URL do vao.

**Tai sao khong dung `npm run dev`?**
Dev server cua Vite tiem `@vite/client` (HMR). Ten file co ky tu `@` → rot MUST
`filenames must only contain supported characters`. Day la loi cua dev server,
khong phai loi game. `dist/` sach 100%.

Hoac: `npm run zip` roi upload `dist.zip` len Test Suite.

Test Suite con co san cac nut de ban thu: Show Preroll Ad, Reply to all messages
with Error, Pause/Resume, Audio, Rotate, Fullscreen, Set language, Clear save.
Base xu ly het — chi can bam va xem game co dung lai / luu dung khong.

Debug ngoai YouTube: trong console go
```js
__playableMock.pause();  __playableMock.resume();
__playableMock.mute();   __playableMock.unmute();
```

---

## 7. Deploy bang Docker

```bash
cp .env.example .env
# sua HOST_PORT / CONTAINER_PORT / VITE_* trong .env
docker compose up -d --build
```

Mo `http://localhost:${HOST_PORT}` (mac dinh 8080).

Moi thu deu tu `.env`:

| Bien | Mac dinh | Y nghia |
|---|---|---|
| `HOST_PORT` | 8080 | Port tren may host |
| `CONTAINER_PORT` | 80 | Port nginx trong container |
| `DEV_PORT` | 3000 | `npm run dev` |
| `PREVIEW_PORT` | 4173 | `npm run preview` |
| `IMAGE_NAME` / `IMAGE_TAG` | base-playable / latest | Ten image |
| `CONTAINER_NAME` | base-playable | Ten container |
| `RESTART_POLICY` | unless-stopped | |
| `VITE_GAME_NAME` | Playable | Tieu de game |
| `VITE_SAVE_KEY` | playable_save_v1 | Key localStorage |
| `VITE_SAVE_VERSION` | 1 | Phien ban save |
| `VITE_REWARD_EXTRA_TIME` | extra_time | rewardId quang cao thuong |

`VITE_*` duoc truyen vao **build stage** qua `build.args`, nen doi `.env` xong phai
`docker compose up -d --build` de build lai.

---

## 8. Du lieu nguoi choi nam o dau

Khong co server, khong co database.

| Moi truong | Noi luu | Chi tiet |
|---|---|---|
| Trong YouTube Playables | Cloud save cua YouTube | `ytgame.game.saveData(string)` / `loadData()`, theo tai khoan nguoi dung, gioi han 3 MiB |
| Chay local (`dev`/`preview`) | `localStorage` | key = `VITE_SAVE_KEY` |
| Leaderboard | YouTube | `ytgame.engagement.sendScore({value})`, phai la so nguyen va chi gui khi diem tang |

Payload luu luon co dang `{"v":<VITE_SAVE_VERSION>,"d":{...}}`. Doi cau truc du lieu
thi tang `VITE_SAVE_VERSION` — save cu se bi bo qua thay vi lam game crash.

---

## 9. Checklist truoc khi nop

- [ ] `npm run package` chay het, khong co `[FAIL]`
- [ ] Test Suite: MUST pass het (dung `npm run preview` hoac `dist.zip`)
- [ ] `gameReady` trong 5 s (SHOULD) — base bao ready ngay sau frame thu 2
- [ ] Da dang ky `rewardId` tren Developer Portal va doi `VITE_REWARD_EXTRA_TIME`
- [ ] Quang cao khong co san thi game van choi duoc (base luon fallback, khong chan)
- [ ] Pause → tien do duoc luu; vao lai van tiep tuc
- [ ] Doi ngon ngu trong Test Suite → chu trong game doi theo
- [ ] Asset (neu co) nam trong `public/`, duong dan **tuong doi** (`./sfx/x.mp3`),
      va khong co request ra domain ngoai
- [ ] Metadata: icon 512x512, screenshot, privacy policy
