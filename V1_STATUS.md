# BET & BRAWL — V1 Status Tracker

Last Updated: Final Hardening & Championship Series Acceptance Pass

## 1. Summary of Completed Hardening Pass
- **Championship Series (First to 2 Decisive Wins):** Replaced the single championship bout with a proper Championship Series between the locked top two qualifier finalists. The championship is first to 2 decisive victories. Championship games that end in a tie or VOID extend the series without granting series wins to either brawler, strictly preventing ties from crowning a champion. Finalists remain locked and non-finalists never fight in the championship series. Qualifier Brawl Points remain invariant during all championship games.
- **Authoritative 5-Tier Qualifier Tiebreaker:** Rankings after circular qualifiers use an exact, deterministic 5-tier tiebreaker:
  1. Qualifier Brawl Points DESC (Win = 3, Tie = 1, Loss = 0)
  2. Qualifier Wins DESC
  3. Head-to-head match result, ONLY when tied players actually fought in a completed qualifier and produced a decisive winner
  4. Bankroll / coins DESC
  5. Stable server-generated session seed/order (frozen roster order)
- **Authoritative Final Standings & Podium:**
  - 1st Place: Champion (winner of Championship Series)
  - 2nd Place: Runner-up (loser of Championship Series)
  - 3rd Place: Third Place (highest-ranked non-finalist from qualifiers)
  - 4th+ Place: Remaining non-finalists in qualifier ranking order
- **Spectator Bet Protection on Disconnect & Void:** In `computeRoundPayouts`, when a round is resolved via `DISCONNECT_FORFEIT`, the surviving fighter receives the bounty, while all spectator bets are 100% refunded (0 net profit or loss). In `VOID` rounds, all spectator bets are similarly refunded.
- **Mini-Game Variety in Championship Series:** Mini-game selection for the championship series rotates across games and strictly prevents immediate back-to-back repetitions.
- **Entry Screen Clutter Removed:** Entry screen contains zero raw IP/port or technical jargon, providing clean player alias and avatar selection with "3–9 players · Same Wi-Fi · No internet needed".
- **Lobby Screen & QR Quality:** Removed raw localhost URLs from the main join invitation. QR codes are generated only for valid non-loopback reachable LAN IP addresses with graceful "Finding your local game…" fallback when network detection is running.
- **User-Friendly Error & Reconnect State:** Technical socket error strings replaced with clean, approachable messages ("Connection lost — reconnecting…", "Couldn’t connect to the game.").
- **Actual Production Server Integration Testing:** Refactored `server.ts` into a testable `createBrawlServer` factory. Real multi-client integration tests run against the exact same production WebSocket and Express handlers used by `npm start`.
- **Authoritative Deadlines Hardening:** Fixed betting validation to strictly reject bets when `serverNow >= round.bettingEndsAt` regardless of display counter state. Fixed gameplay action handler to reject actions when `now >= round.gameEndsAt`, and removed the +1000ms gameplay extension from timeout timers.
- **Quick Draw Early-Tap Exploit Fixed:** Replaced `drawAt - 40` allowance with strict `nowMs < drawAt` false-start foul. Pre-tap attempts can never yield a valid reaction. Added 5 boundary test cases (`-100ms`, `-40ms`, `-1ms`, `drawAt`, `+1ms`).
- **Old-Socket Reconnect Race Fixed:** The socket close handler verifies `room.clientSockets.get(boundToken) === ws` before disconnecting a seat. Stale close events fired after a new socket binds can no longer disconnect the seat or delete socket mapping.
- **Connection Grace Timers Separated:** Split timers into `roundTimers` and `connectionTimers`. Mini-game resolution calls `clearRoundTimers()` only. Host reconnect grace and fighter reconnect grace timers now properly survive round resolution.
- **Disconnected Lobby Seat Lifecycle:** Disconnected non-host seats in the lobby are reserved for a 60-second grace window, after which stale players are automatically removed from the room to free capacity for new players. Host `KICK_PLAYER` action also supported in lobby.
- **Podium Room Creation Safety:** Removed the exception in `CREATE_ROOM` during `FINAL_PODIUM`. An unauthenticated client cannot replace or destroy an active room in ANY phase.
- **Fixed Room Debug Mode:** Debug mode is now a fixed property on the room (`room.debugMode`), chosen at creation time. `START_GAME` cannot bypass minimum player count or readiness via payload spoofing.
- **Cryptographic Session Tokens:** Replaced `Math.random()` token generation with Node.js crypto (`randomUUID` / `randomBytes`). Private session tokens remain strictly confidential and are never broadcast in `ROOM_STATE`.
- **Runtime Payload Sanity Validation:** Added explicit runtime checks on the WebSocket boundary for all FighterActions (validating `guess === 'HIGHER' || 'LOWER'`, non-negative integer indices, finite valid coordinates, and correct action types).
- **Speed Math Penalty UI Fixed:** Real-time countdown derives remaining penalty using `serverTimeOffset` and automatically re-enables answer buttons at penalty expiry even without incoming server packets.
- **Millisecond Stop Clock Leak Fixed:** Strictly blinded out the timer display into `??.???` for ALL clients (both fighters and spectators) once 3.000s is reached, eliminating same-room clock cheating.
- **Secret Bets Kept Secret:** Secret bets array remains empty in all public broadcasts during betting and gameplay, revealed only at `PAYOUT_RECAP`.
- **Locked-Bet Wording Fixed:** Total Return and Net Profit are explicitly separated in the locked wager card.
- **Room Limit Updated to 3–9 Players:** Updated `MIN_PLAYERS_TO_START = 3` and `MAX_PLAYERS_CAPACITY = 9`. Production rooms strictly enforce a minimum of 3 connected ready players, rejecting attempts to start with fewer.
- **Tournament Format (Qualifiers → Top Two → Championship Series):** Fair circular tournament graph (`P0 vs P1`, `P1 vs P2`, ..., `P(n-1) vs P0`). Every player participates in exactly 2 qualifier brawls facing 2 different opponents. Top two advance to First-to-2 Championship Series.
- **Full 3-Player Tournament Lifecycle Integration Test:** Completed the genuine end-to-end multi-client WebSocket test driving the real production server through 3 circular qualifiers, 5-tier ranking resolution, locked finalists, a 2–1 Championship Series with an intervening tie that extends the series without granting series wins, qualifier points invariance across all championship brawls, and final podium crowning.
- **Authoritative Ranking Single Source of Truth in Recap Modal:** `PayoutRecapModal.tsx` now uses the server-provided `tournamentRank` as the single authoritative source of truth for ordering standings and identifying TOP 2 finalists, ensuring client standings never diverge from server advancement decisions even when spectator bankrolls differ.
- **Obsolete Screenshots and Artifacts Cleaned:** Removed stale development screenshots containing outdated UI labels ("Circular Graph", "Local Wi-Fi Server 127.0.0.1:3000", "Championship Final", "N + 1") and removed redundant `bun.lock` file.

---

## 2. Verification Status Breakdown

### AUTOMATED VERIFIED (PASSING IN THIS ENVIRONMENT)
- [x] `npm run typecheck`: **PASSING** (0 TypeScript errors)
- [x] `npm test`: **PASSING** (52/52 automated tests passing across 5 test files)
- [x] `npm run lint`: **PASSING** (`tsc --noEmit` clean)
- [x] `npm run build`: **PASSING** (Clean Vite static production bundle in `dist/`)
- [x] `npm run verify`: **PASSING** (typecheck + test [52/52 pass] + build pipeline)
- [x] Genuine Production Server WebSocket Integration Tests: **PASSING** (Multi-client integration tests exercising `createBrawlServer` across full 3-player and 6-player tournaments)
- [x] Production Server Standalone Launch (`npm start` / `server.ts`): **PASSING** (HTTP 200 on index, `/api/network-info` JSON payload verified, production `dist/` served directly)
- [x] Reproducible dependency locking: `package-lock.json` present and tested with `npm ci`

### MANUAL VERIFICATION REQUIRED (NOT PERFORMED IN CONTAINER ENVIRONMENT)
- [ ] **Physical Multi-Phone Wi-Fi Testing:** Because this development container has no physical radio hardware or physical smartphones connected to a home router, manual physical testing is recommended on a physical Windows/Mac/Linux host with 3–9 real phones. Specifically test:
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
  # tests 52
  # suites 0
  # pass 52
  # fail 0
  (exit code 0, duration_ms: ~13000ms)
  ```
- `npm run build`:
  ```
  dist/index.html                   0.96 kB │ gzip:   0.43 kB
  dist/assets/index-CXWPl50f.css   61.04 kB │ gzip:   9.65 kB
  dist/assets/index-BJwv8r-7.js   597.18 kB │ gzip: 170.08 kB
  ✓ built in 689ms
  (exit code 0)
  ```
- `npm run verify`:
  ```
  typecheck -> test (52/52 pass) -> build (clean dist)
  (exit code 0)
  ```
