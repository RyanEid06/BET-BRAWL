# BET & BRAWL: Local Wi-Fi Android Party Game

**BET & BRAWL** is an offline, low-latency party game for 3 to 9 friends in the same physical room on the same local Wi-Fi network. Two brawlers compete in intense, 15-second mini-games while spectators place live secret wagers with dynamic odds.

---

## Architecture Overview (V1 Android Architecture)

BET & BRAWL has transitioned from a laptop-hosted web prototype into a **standalone native Android application**:

```
+-------------------------------------------------------------------------+
|                           ANDROID HOST PHONE                            |
|                                                                         |
|  +---------------------------+       +-------------------------------+  |
|  |     Android WebView       |       |  Authoritative Kotlin Server  |  |
|  |  (Bundled React/Vite UI)  | <---> |  (BrawlWebSocketServer:8080)  |  |
|  +---------------------------+  ws   |  (Foreground HostService)     |  |
|                                      +-------------------------------+  |
+--------------------------------------------------^----------------------+
                                                   |
                             Same Wi-Fi LAN        | ws://<host-ip>:8080/ws
                                                   |
+--------------------------------------------------v----------------------+
|                           ANDROID GUEST PHONES                          |
|                                                                         |
|  +---------------------------+       +-------------------------------+  |
|  |     Android WebView       | <---> |    LAN Discovery / QR Join    |  |
|  |  (Bundled React/Vite UI)  |       |    (mDNS NSD / UDP Beacon)    |  |
|  +---------------------------+       +-------------------------------+  |
+-------------------------------------------------------------------------+
```

### Key Architectural Pillars:
1. **Standalone Android Host:**
   - One Android device acts as the **authoritative room host**, running an embedded Kotlin WebSocket server (`org.java-websocket:Java-WebSocket`).
   - The hosting phone participates in the game as a normal player via local loopback (`ws://127.0.0.1:8080/ws`).
   - The authoritative server runs inside an Android **Foreground Service** (`HostService`) with an ongoing notification, keeping room state and timers alive through screen locks, rotations, and brief backgrounding.
2. **Same-LAN Guest Participation:**
   - Guest devices install the exact same APK and connect over local Wi-Fi (`ws://<host-ip>:8080/ws`).
   - **Zero laptop, zero Node.js, and zero internet** required during gameplay.
3. **Bundled React/Vite Frontend in WebView:**
   - The mature, high-polish BET & BRAWL V1 React frontend is fully bundled into the APK under `app/src/main/assets/web/`.
   - Loaded securely via `file:///android_asset/web/index.html`.
   - No external websites or CDNs are contacted.
4. **Zero-Config LAN Discovery & QR Joining:**
   - Android Network Service Discovery (`_brawl._tcp.` mDNS) and a lightweight UDP beacon broadcast host presence.
   - The lobby generates an in-app QR code and join link tailored to the host's LAN IP address, or users can tap one-click quick join from the title screen.
5. **Node.js Role:**
   - Node remains strictly for developer tooling, frontend asset compilation, and golden reference test suites.

---

## Application Specifications

| Parameter | Value |
|---|---|
| **Application ID** | `com.betbrawl.app` |
| **App Name** | `BET & BRAWL` |
| **Minimum SDK** | `24` (Android 7.0 Nougat) |
| **Target SDK** | `35` (Android 15) |
| **Compile SDK** | `35` (Android 15) |
| **JDK Required** | `Java 17+` |
| **Gradle Version** | `8.7` |
| **Core Libraries** | `org.java-websocket:Java-WebSocket:1.5.7`, `com.google.code.gson:gson:2.11.0`, `androidx.webkit:webkit:1.12.1`, Kotlin Coroutines |

---

## Source Control & Reference Points

The migration was performed on `main` while maintaining immutable reference points:
- **Preserved Web V1 Branch:** `v1-web-final`
- **Permanent Preserved Web Tag:** `v1.0.0-web-final`
- The golden Node test suite (`58 tests`) remains active and verified.

---

## Build Pipeline & Instructions

### 1. Build and Sync Frontend Assets into Android
```bash
# Install Node dependencies
npm ci

# Typecheck, run golden reference tests, build Vite bundle, and sync into Android assets
npm run verify
```

The sync script (`scripts/sync-android-assets.js`) automatically transfers Vite production outputs from `dist/` directly into `app/src/main/assets/web/`.

### 2. Run Android / JVM Unit Tests
```bash
gradle :app:testDebugUnitTest
```
Runs 20 automated Android test cases covering:
- Room creation and session token generation
- Player join flow and capacity constraints (3 to 9 players)
- Ready / start gating
- Authoritative circular qualifier scheduling
- 5-tier tournament ranking hierarchy (Brawl Points, Wins, Head-to-Head, Bankroll, Stable Roster Seed)
- Bankroll invariance (coins do not override higher tournament points)
- Finalist locking (top 2 advance to Championship)
- Championship Series first-to-2 decisive wins
- Tie awards zero Championship wins and extends the series
- Qualifier points invariance during Championship
- Third-place exclusion from Championship matches
- Podium standings (Champion, Runner-up, Third Place)
- Reconnect and session token seat recovery
- Complete 3-player lifecycle integration test

### 3. Build Android Debug APK
```bash
gradle :app:assembleDebug
```
Generates the debug APK at:
```
app/build/outputs/apk/debug/app-debug.apk
```

---

## Tournament Rules & Brawl Points

1. **Circular Qualifiers:**
   - The authoritative server freezes the session roster (3–9 players).
   - Generates a fair circular graph (`P0 vs P1`, `P1 vs P2`, ..., `P(n-1) vs P0`).
   - Every player fights exactly twice against 2 different opponents.
   - Match bounty: +250 coins.
2. **Brawl Points:**
   - **Win:** 3 Brawl Points
   - **Tie:** 1 Brawl Point each
   - **Loss:** 0 Brawl Points
3. **5-Tier Ranking Hierarchy:**
   - `1. Qualifier Brawl Points DESC`
   - `2. Qualifier Wins DESC`
   - `3. Decisive Head-to-Head Match Result (if exactly 2 players tied and they fought)`
   - `4. Total Bankroll / Coins DESC`
   - `5. Deterministic Roster Seed Order (frozen session seed)`
4. **Championship Series (First to 2 Decisive Wins):**
   - Locked top two finalists battle in a best-of series requiring **2 decisive wins**.
   - Ties award 0 wins and extend the series.
   - Qualifier points remain invariant.
   - Spectator betting active for every bout (+500 coin victory bounty).
   - Grand podium crowns Champion, Runner-up, and Third Place.

---

## Mini-Game Catalog (6 Active Games)

1. **Millisecond Stop (9s):** Counter counts toward `05.000s`. At `03.000s`, the timer blinds out into `??.???` for everyone. Closest tap to `05.000s` wins.
2. **Rapid Red Light, Green Light (15s):** Authoritative server schedule flips between Green (+1) and Red (-3). First to 40 or highest score wins.
3. **Speed Math (16s):** 3-question arithmetic race. Mistakes trigger a 1.5s server-enforced penalty freeze. First to 3 correct answers wins.
4. **Higher or Lower (18s):** Stable real-world trivia measurements (physics, monument heights, geography, astronomy). First to 3 correct answers wins.
5. **Blind Pinpoint (15s):** Equirectangular world map with genuine Haversine distance formula calculation in kilometers. Closest pin to target city wins.
6. **Quick Draw (10s):** Randomized "WAIT..." phase. When "DRAW!" flashes, tap instantly. Tapping even 1ms before "DRAW!" is an authoritative false-start foul.

---

## Physical Device QA Checklist

*(To be executed on physical Android phones connected to the same Wi-Fi router or phone hotspot)*

- [ ] **Host Game Creation:** Host phone creates room; verifies room code and LAN address generated.
- [ ] **Guest Discovery:** 2 guest phones open app; verify active room appears in quick-join on title screen.
- [ ] **QR Join:** Guest phone scans QR code from host lobby screen; verifies instant room join.
- [ ] **Ready Flow:** All 3 players toggle ready; host starts game.
- [ ] **Qualifier Round 1:** Active fighters engage in mini-game; spectators place live wagers; verify payouts and coin balances.
- [ ] **Qualifier Rounds 2 & 3:** Verify fighter rotation adheres to circular schedule; all players fight twice.
- [ ] **Championship Transition:** Top 2 qualifiers locked into Championship; third place excluded.
- [ ] **Championship Tie:** Simulate or observe tie; verify 0 wins awarded and series extended.
- [ ] **Championship Conclusion:** Finalist reaches 2 decisive wins; crowned Champion on podium.
- [ ] **Screen Lock / Reconnect:** Host phone briefly locked/unlocked; guest phone toggles Wi-Fi; verify player session recovered without duplicate seats.
