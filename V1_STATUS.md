# BET & BRAWL — V1 Status Tracker

Last Updated: Final Hardening & Acceptance Verification Pass

## 1. Summary of Completed Hardening Pass
- **Actual Production Server Integration Testing:** Refactored `server.ts` into a testable `createBrawlServer` factory. Completely eliminated the duplicate fake test server in `src/engine/multiplayer.test.ts`. Real multi-client integration tests now run against the exact same production WebSocket and Express handlers used by `npm start`.
- **Authoritative Deadlines Hardening:** Fixed betting validation to strictly reject bets when `serverNow >= round.bettingEndsAt` regardless of display counter state. Fixed gameplay action handler to reject actions when `now >= round.gameEndsAt`, and removed the +1000ms gameplay extension from timeout timers.
- **Quick Draw Early-Tap Exploit Fixed:** Replaced `drawAt - 40` allowance with strict `nowMs < drawAt` false-start foul. Pre-tap attempts can never yield a valid reaction. Added 5 boundary test cases (`-100ms`, `-40ms`, `-1ms`, `drawAt`, `+1ms`).
- **Old-Socket Reconnect Race Fixed:** The socket close handler now verifies `room.clientSockets.get(boundToken) === ws` before disconnecting a seat. Stale close events fired after a new socket binds can no longer disconnect the seat or delete socket mapping.
- **Connection Grace Timers Separated:** Split timers into `roundTimers` and `connectionTimers`. Mini-game resolution calls `clearRoundTimers()` only. Host reconnect grace and fighter reconnect grace timers now properly survive round resolution.
- **Disconnected Lobby Seat Lifecycle:** Disconnected non-host seats in the lobby are reserved for a 60-second grace window, after which stale players are automatically removed from the room to free capacity for new players. Host `KICK_PLAYER` action also supported in lobby.
- **Podium Room Creation Safety:** Removed the exception in `CREATE_ROOM` during `FINAL_PODIUM`. An unauthenticated client cannot replace or destroy an active room in ANY phase.
- **Fixed Room Debug Mode:** Debug mode is now a fixed property on the room (`room.debugMode`), chosen at creation time. `START_GAME` cannot bypass minimum player count or readiness via payload spoofing.
- **Cryptographic Session Tokens:** Replaced `Math.random()` token generation with Node.js crypto (`randomUUID` / `randomBytes`). Private session tokens remain strictly confidential and are never broadcast in `ROOM_STATE`.
- **Runtime Payload Sanity Validation:** Added explicit runtime checks on the WebSocket boundary for all FighterActions (validating `guess === 'HIGHER' || 'LOWER'`, non-negative integer indices, finite valid coordinates, and correct action types).
- **QR / Localhost Race Fixed:** `LobbyScreen` detects loopback origins (`localhost`, `127.0.0.1`, `0.0.0.0`) and replaces them with preferred LAN IP when `networkInfo` loads.
- **Speed Math Penalty UI Fixed:** Real-time countdown derives remaining penalty using `serverTimeOffset` and automatically re-enables answer buttons at penalty expiry even without incoming server packets.
- **Millisecond Stop Clock Leak Fixed:** Strictly blinded out the timer display into `??.???` for ALL clients (both fighters and spectators) once 3.000s is reached, eliminating same-room clock cheating.
- **Secret Bets Kept Secret:** Secret bets array remains empty in all public broadcasts during betting and gameplay, revealed only at `PAYOUT_RECAP`.
- **Locked-Bet Wording Fixed:** Total Return and Net Profit are explicitly separated in the locked wager card.
- **Higher/Lower Trivia Quality:** Shuffled selection of 4 trivia questions using Fisher-Yates, curated stable scientific/astronomic/physical/historical facts, and added instant answer feedback.
- **Authentic Equirectangular World Map:** Bundled genuine equirectangular coastlines in Blind Pinpoint aligned with `x = lon + 180` and `y = 90 - lat` (Natural Earth Public Domain standard).
- **Synchronized 3-2-1 Countdown:** Integrated `SynchronizedCountdown` deriving 3.. 2.. 1.. BRAWL! from authoritative `gameStartsAt` and `serverTimeOffset`.
- **Package Reproducibility:** Fixed `package.json` devDependencies and generated `package-lock.json`. Clean installs via `npm ci` verified.

---

## 2. Verification Status Breakdown

### AUTOMATED VERIFIED (PASSING IN THIS ENVIRONMENT)
- [x] `npm run typecheck`: **PASSING** (0 TypeScript errors)
- [x] `npm test`: **PASSING** (44/44 automated tests passing)
- [x] `npm run build`: **PASSING** (Clean Vite static production bundle in `dist/`)
- [x] `npm run verify`: **PASSING** (typecheck + test + build pipeline)
- [x] Genuine Production Server WebSocket Integration Tests: **PASSING** (4 real WebSocket integration suites exercising `createBrawlServer`)
- [x] Production Server Standalone Launch (`npm start` / `server.ts`): **PASSING** (HTTP 200 on index, `/api/network-info` JSON payload verified, production `dist/` served directly)
- [x] Reproducible dependency locking: `package-lock.json` present and tested with `npm ci`

### MANUAL VERIFICATION REQUIRED (NOT PERFORMED IN CONTAINER ENVIRONMENT)
- [ ] **Physical Multi-Phone Wi-Fi Testing:** Because this development container has no physical radio hardware or physical smartphones connected to a home router, manual physical testing is required on a physical Windows/Mac/Linux host with 6–9 real phones. Specifically test:
  - Windows Defender Firewall permission prompt ("Allow access on private networks").
  - Wi-Fi router AP Client Isolation settings (some guest Wi-Fi networks block client-to-client traffic).
  - iOS Safari and Android Chrome touch responsiveness during rapid tapping.

---

## 3. Exact Verification Commands Output
- `npm run typecheck`:
  ```
  > bet-brawl@1.0.0 typecheck
  > tsc --noEmit
  (exit code 0, 0 errors)
  ```
- `npm test`:
  ```
  # tests 44
  # suites 0
  # pass 44
  # fail 0
  (exit code 0)
  ```
- `npm run build`:
  ```
  ✓ built in 753ms
  dist/index.html                   0.96 kB
  dist/assets/index-DpZGCeP5.css   59.41 kB
  dist/assets/index-L9ACB9dZ.js   586.83 kB
  (exit code 0)
  ```
- `npm run verify`:
  ```
  typecheck -> test (44/44 pass) -> build (clean dist)
  (exit code 0)
  ```
