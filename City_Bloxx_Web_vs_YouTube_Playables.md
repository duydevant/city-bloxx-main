# CITY BLOXX — WEB VS YOUTUBE PLAYABLES

**Document Type:** Platform Comparison / Technical Product Planning  
**Project:** City Bloxx Online  
**Targets:** Standalone Web + YouTube Playables  
**Version:** 1.0  
**Date:** 2026-10-06  

---

# 1. MỤC TIÊU

Tài liệu này mô tả sự khác biệt giữa:

```text
1. Standalone Web Game
2. YouTube Playables
```

Kiến trúc khuyến nghị:

> **Một gameplay core dùng chung, nhưng có hai platform adapter khác nhau.**

```text
CITY BLOXX CORE
      │
      ├── WEB BUILD
      └── YOUTUBE PLAYABLE BUILD
```

Không nên phát triển thành hai codebase độc lập.

---

# 2. TÓM TẮT KHÁC BIỆT

| Hạng mục | Web riêng | YouTube Playables |
|---|---|---|
| Core gameplay | Full control | Full control trong giới hạn web platform |
| Canvas / WebGL | Có | Có |
| Backend riêng | Có | Hiện không được external calls mặc định |
| REST API | Có | Không nên phụ thuộc |
| WebSocket | Có | Không nên phụ thuộc |
| Account riêng | Có | Không nên phụ thuộc |
| Database riêng | Có | Không trực tiếp |
| Cloud save | Backend/local | `saveData/loadData` |
| Score submission | Custom | `sendScore` nếu dùng |
| Public replay | Có | Không nên giả định |
| Custom leaderboard | Có | Platform-dependent |
| Friends | Có | Không nên coi là available |
| Async PvP | Có | Không phù hợp nếu cần backend ngoài |
| Realtime PvP | Có | Không phù hợp hiện tại |
| Remote LiveOps | Có | Bị hạn chế |
| Remote config | Có | Không nên phụ thuộc |
| CDN asset delivery | Có | Content chủ yếu phải nằm trong bundle |
| External links | Có | Không được clickable external links |
| In-game share prompt | Có | Không được |
| External monetization | Có | Không được |
| External ad network | Có | Không được |
| YouTube-provided ads | Không | Có |
| Responsive | Tùy product | Bắt buộc rộng |
| Touch + Mouse | Tùy target | Bắt buộc |
| Pause/resume | Browser lifecycle | Playables SDK callbacks |
| Certification | Không | Có |

---

# 3. CORE GAMEPLAY DÙNG CHUNG

Các hệ thống sau nên share code:

```text
Drop Physics
Tower Sway
Perfect / Great / Good
Combo
Population
Roof
Building Classes
City Grid
District Rules
Missions Logic
Achievements Logic
Building Skins
Crane Skins
Architecture Collection
Replay Event Model
Scoring
```

Core gameplay không nên biết đang chạy trên Web hay YouTube.

---

# 4. KIẾN TRÚC KHUYẾN NGHỊ

```text
CITY BLOXX
│
├── core/
│   ├── physics/
│   ├── tower/
│   ├── scoring/
│   ├── city/
│   ├── missions/
│   ├── cosmetics/
│   ├── replay/
│   └── rules/
│
├── services/
│   ├── SaveService
│   ├── LeaderboardService
│   ├── ReplayService
│   ├── ProfileService
│   ├── AnalyticsService
│   ├── PvPService
│   ├── ShareService
│   └── MonetizationService
│
├── platforms/
│   ├── web/
│   └── youtube/
│
└── ui/
```

---

# 5. SAVE SYSTEM

## Web

Có thể dùng:

```text
Local Storage
IndexedDB
Backend API
Database
Cloud Save
```

## YouTube Playables

Persistent progress nên đi qua:

```text
loadData()
saveData()
```

Nên abstract:

```ts
interface SaveProvider {
  load(): Promise<GameSave>;
  save(data: GameSave): Promise<void>;
}
```

Web dùng `BackendSaveProvider`, Playables dùng `YouTubeSaveProvider`.

Không hard-code localStorage/database vào gameplay logic.

---

# 6. SAVE SIZE

Playables:

```text
MUST < 3 MiB
SHOULD < 500 KiB
```

Nên lưu:

```text
city layout
unlocked skins
mastery
missions
stats
compact replay events
```

Không nên lưu hàng nghìn full physics snapshots.

---

# 7. BACKEND

## Web

Có thể có đầy đủ:

```text
Auth
Profile
Leaderboard
Replay Storage
PvP
Events
LiveOps
Inventory
Shop
Analytics
Matchmaking
```

## Playables

Hiện external calls không được hỗ trợ mặc định.

Không nên phụ thuộc vào:

```text
custom REST backend
WebSocket server
remote database
external analytics endpoint
```

---

# 8. CONTENT / REMOTE DATA

## Web

```text
CDN
Remote JSON
Remote Event Config
Lazy Asset Download
```

## Playables

Content chủ yếu cần nằm trong bundle.

Remote-data access đang được pilot hạn chế, không nên coi là capability mặc định.

---

# 9. REPLAY

## Web

Có thể làm:

```text
Record
→ Upload
→ Public Replay URL
→ Beat This Tower
→ Ghost
```

## Playables

Nên ưu tiên:

```text
Current Replay
Personal Best Replay
Compact Saved Replay
```

Không nên mặc định có public replay DB hoặc global ghost DB.

---

# 10. LEADERBOARD

## Web

Có thể có nhiều bảng:

```text
Population
Height
Perfect Rate
Perfect Streak
Fastest
Daily
Season
City Population
PvP Rating
```

## Playables

Có thể dùng `sendScore()` nếu phù hợp.

Không nên giả định full custom multi-column leaderboard như backend riêng.

---

# 11. DAILY CHALLENGE

## Web

```text
Server generates Daily Seed
→ clients fetch
→ server leaderboard
```

## Playables

Có thể generate deterministic local:

```text
seed = hash(date + rulesetVersion)
```

Tất cả player vẫn có cùng challenge mà không cần backend.

---

# 12. LIVEOPS

## Web

Có thể remote-config:

```text
Halloween ON
Winter Event ON
New Skin
New Blueprint
Balance Update
```

## Playables

Nên dùng:

```text
bundled configs
+
date-based activation
```

New content thường cần updated bundle.

---

# 13. SKINS / ASSETS

Cả hai target dùng chung:

```text
Building Skin
Crane Skin
Roof Skin
Theme Set
Architecture Collection
```

Web có thể lazy-download từ CDN.

Playables phải chú ý bundle size, nên dùng:

```text
Sprite Atlases
Compressed Audio
Modular Buildings
Shared Materials
Packaged Lazy-loading
```

---

# 14. PLAYABLES BUNDLE LIMITS

```text
Initial bundle MUST < 30 MiB
Initial bundle SHOULD < 15 MiB
Total bundle default MUST < 250 MiB
Individual file MUST < 30 MiB
Individual file SHOULD < 512 KiB
Save MUST < 3 MiB
Save SHOULD < 500 KiB
Interactive load SHOULD < 5 seconds
```

---

# 15. UI / RESPONSIVE

Playables phải chạy trên nhiều ratio, ví dụ:

```text
9:32
9:21
9:16
3:4
1:1
4:3
16:9
21:9
32:9
```

Không lock orientation.

Bắt buộc support:

```text
Touch
Mouse
```

UI nên layout theo zones thay vì fixed pixel.

---

# 16. PLAYABLES LIFECYCLE

Các API/callback quan trọng:

```text
firstFrameReady()
gameReady()
onPause()
onResume()
isAudioEnabled
onAudioEnabledChange
```

Trong Playables, lifecycle nên đi qua SDK thay vì Page Visibility API.

---

# 17. SHARE

## Web

```text
Share Result
Share Replay
Copy Link
Beat This Tower
```

## Playables

Không được hiển thị:

```text
in-game sharing prompts
clickable external links
```

Nên dùng feature flag:

```ts
if (platform.supportsExternalShare) {
  showShareButton();
}
```

---

# 18. MONETIZATION

## Web

Có thể tự chọn:

```text
Ad Networks
Stripe
Subscriptions
Cosmetic Shop
Season Pass
```

## Playables

Không được dùng off-platform monetization hoặc off-platform ads/IAP.

Có thể dùng:

```text
YouTube-provided ad functions
```

---

# 19. FEATURE FLAGS

Playables example:

```json
{
  "externalApi": false,
  "pvp": false,
  "friends": false,
  "externalShare": false,
  "externalShop": false,
  "youtubeSave": true,
  "youtubeAds": true
}
```

Web example:

```json
{
  "externalApi": true,
  "pvp": true,
  "friends": true,
  "externalShare": true,
  "externalShop": true,
  "youtubeSave": false,
  "youtubeAds": false
}
```

---

# 20. PVP — WEB

Web có thể support:

```text
Matchmaking
Room
WebSocket
Rating
Reconnect
Server Authority
Anti-cheat
Replay Validation
```

Recommended modes:

## Parallel Tower Race

Cùng:

```text
seed
building
swing
wind
```

Winner:

```text
first to 30 floors
```

hoặc:

```text
highest population after 2 minutes
```

## Score Duel

Compare:

```text
Population
Perfect Rate
Time
Misses
```

## Async Duel

```text
Player A plays
→ result/replay stored
→ Player B plays same seed
→ compare
```

Đây là PvP nên làm đầu tiên.

---

# 21. PVP — PLAYABLES

Realtime PvP thường cần:

```text
WebSocket
Matchmaking Server
Room State
Opponent Sync
Reconnect
Rating Backend
```

Do external networking hiện bị hạn chế, nên baseline:

```text
WEB: PvP enabled
PLAYABLES: PvP disabled
```

cho tới khi platform hỗ trợ capability phù hợp.

---

# 22. MULTIPLAYER ROADMAP

```text
Phase 1
Solo

↓

Phase 2
Daily Leaderboard

↓

Phase 3
Beat This Tower

↓

Phase 4
Async Duel

↓

Phase 5
Realtime Tower Race
```

Async Duel nên đi trước realtime vì:

- ít latency;
- backend đơn giản hơn;
- replay dễ validate;
- rất hợp same-seed challenge.

---

# 23. ACCOUNT / CROSS-PLATFORM SAVE

Không nên giả định:

```text
Web Profile = Playables Save
```

Ban đầu:

```text
Web Profile
≠
YouTube Playables Save
```

Nếu sau này platform mở integration phù hợp thì sync thêm.

---

# 24. BUILD STRATEGY

```text
ONE REPOSITORY
ONE CORE
TWO BUILD TARGETS
```

Example:

```text
build:web
build:youtube
```

Build pipeline:

```text
Core
+
Platform Adapter
+
Feature Flags
+
Platform Assets
→ Output
```

---

# 25. CAPABILITY MATRIX

| Feature | Web | Playables |
|---|:---:|:---:|
| Quick Tower | ✓ | ✓ |
| Build City | ✓ | ✓ |
| Districts | ✓ | ✓ |
| Building Skins | ✓ | ✓ |
| Crane Skins | ✓ | ✓ |
| Roof Skins | ✓ | ✓ |
| Architecture Book | ✓ | ✓ |
| Mastery | ✓ | ✓ |
| Achievements | ✓ | ✓ |
| Local Stats | ✓ | ✓ |
| Daily deterministic | ✓ | ✓ |
| Custom backend Daily | ✓ | △ |
| Full custom Leaderboard | ✓ | △ |
| `sendScore` | ✕ | ✓ |
| Local Replay | ✓ | ✓ |
| Public Replay | ✓ | ✕ currently |
| Beat This Tower server | ✓ | ✕ currently |
| Friends | ✓ | ✕ currently |
| Async PvP | ✓ | ✕ currently |
| Realtime PvP | ✓ | ✕ currently |
| Tournament backend | ✓ | ✕ currently |
| Remote Event Config | ✓ | ✕ currently |
| Bundled Events | ✓ | ✓ |
| Remote Skin Download | ✓ | ✕ currently |
| External Share | ✓ | ✕ |
| External Shop | ✓ | ✕ |
| External Ad Network | ✓ | ✕ |
| YouTube Ads | ✕ | ✓ |

Legend:

```text
✓ = supported/recommended
✕ = unavailable/not recommended hiện tại
△ = platform-dependent / limited
```

---

# 26. RECOMMENDED PRODUCT SPLIT

## Shared Core

```text
Quick Tower
Build City
Physics
Population
Combo
Mastery
Skins
Crane Skins
Architecture Collection
Achievements
Daily Seed Logic
Basic Replay
```

## Web Enhanced

```text
Account
Backend Profile
Full Leaderboards
Friends
Public Replay
Beat This Tower
Async PvP
Realtime PvP
Tournament
LiveOps
Remote Config
Remote Content
Shop
Season Pass
Advanced Analytics
```

## YouTube Playables Layer

```text
Playables SDK
saveData/loadData
sendScore
YouTube lifecycle
YouTube audio
YouTube ads
Responsive certification requirements
Bundled content
Compact progression
```

---

# 27. MVP SPLIT

## Web MVP

```text
Quick Tower
Build City
Daily
Building Skins
Crane Skins
Architecture Collection
Account
Leaderboard
Replay
My Towers
Missions
Achievements
Stats
```

## Playables MVP

```text
Quick Tower
Build City
Daily deterministic
Building Skins
Crane Skins
Architecture Collection
Playables Save
Score Submission
Missions
Achievements
Stats
```

Avoid ở Playables MVP:

```text
PvP
Friends
Public Replay
External Share
External Shop
Remote LiveOps dependency
```

---

# 28. TECHNICAL PRINCIPLES

1. Core game không biết platform.
2. Save phải qua interface.
3. Leaderboard phải qua interface.
4. PvP phải optional.
5. Replay event model phải shared.
6. Physics phải versioned.
7. Playables bundle size phải tính từ đầu.
8. Cosmetics phải modular.
9. UI phải responsive đủ rộng.
10. Feature availability dùng capability checks.
11. Không hard-code external links trong shared UI.
12. Không hard-code backend dependency vào core.
13. Web là full-feature platform.
14. Playables là constrained distribution platform.
15. Multiplayer nên Web-first.

---

# 29. ONE-SENTENCE RULE

> **Phát triển City Bloxx như một game core duy nhất; Web là bản full-service có backend/PvP/LiveOps, còn YouTube Playables là build tối ưu cho SDK, cloud save, score, bundle và các giới hạn platform hiện tại.**

---

# 30. OFFICIAL REFERENCES

Các policy/capability cần kiểm tra lại trước mỗi major release vì YouTube Playables có thể thay đổi:

- YouTube Playables Integration Requirements
- YouTube Playables Design Requirements
- YouTube Playables Stability & Performance Requirements
- YouTube Playables Monetization Requirements
- YouTube Playables Certification FAQ
- YouTube Playables Trust & Safety Requirements

**Verified against documentation on: 2026-10-06**
