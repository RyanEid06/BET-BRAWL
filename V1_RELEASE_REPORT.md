# BET & BRAWL — V1 Release Verification Report

**Date:** October 17, 2026  
**Status:** V1 Code Candidate Ready  
**Application:** Bet & BRAWL (Offline Local Wi-Fi Party Game Engine)

---

## 1. V1 Product Scope

Bet & BRAWL is a self-hosted, zero-cloud party game engine engineered specifically for 3 to 9 players sharing the same physical room and local Wi-Fi router (or mobile hotspot).

### Core Features Supported
- **Authoritative Node.js Server:** Built with Express + native WebSockets (`ws`). All game logic, timing, scoring, betting odds, and payouts are calculated server-side.
- **Dynamic Spectator Wagering:** When two fighters enter the arena, spectators place secret wagers during a 15-second betting window with real-time Laplace-smoothed dynamic odds. Bets remain secret until round payout recap.
- **LAN & QR Discovery:** Real RFC1918 private IPv4 network detection. Host screen renders a scannable QR code directing players straight to the host machine's LAN IP address.
- **Robust Reconnection Engine:** Handles socket reconnect races without ghost seats, supports host grace reconnects across mini-game round resolutions, and automatically recycles stale seats after 60 seconds.
- **6 Authoritative Mini-Games:**
  1. *Millisecond Stop:* Screen blinds out to `??.???` at 03.000s for all players; closest stop to 05.000s wins.
  2. *Rapid Red Light, Green Light:* Mash on Green (+1), freeze on Red (-3). First to 40 or high score at timeout.
  3. *Speed Math:* 3-question mental arithmetic race with 1.5s freeze penalty on mistakes.
  4. *Higher or Lower:* Real-world statistical trivia; secret stats scrubbed until player answers.
  5. *Blind Pinpoint:* Target world city pinpointing with Haversine spherical distance error.
  6. *Quick Draw:* Reflex showdown; pre-taps before "DRAW!" result in immediate false-start disqualification.
- **Kahoot-Style Final Podium:** Confetti fanfare, 1st (Gold/Champion), 2nd (Silver/Runner-up), and 3rd (Bronze) podium placement, accompanied by genuine session awards.

---

## 2. Authoritative Tournament Rules

1. **Roster & Qualifiers:**
   - Minimum 3 connected players to start. Maximum 9 players per room.
   - Circular pairing graph (`P0 vs P1`, `P1 vs P2`, ..., `P(n-1) vs P0`).
   - Every participant fights in exactly 2 qualifier matches facing 2 distinct opponents.
   - Bounties: +250 coins on qualifier win (+125 coins each on tie).
2. **Scoring:**
   - Win = 3 Brawl Points, Tie = 1 Brawl Point, Loss = 0 Brawl Points.
3. **Deterministic 5-Tier Tiebreaker:**
   1. Qualifier Brawl Points DESC
   2. Qualifier Wins DESC
   3. Applicable Head-to-Head match result (strictly applied to 2-player tied subgroups that fought)
   4. Current bankroll / coins DESC
   5. Frozen session roster seed order (avoids 3-way cyclic sorting traps)
4. **Championship Series (First to 2 Decisive Wins):**
   - The top two qualifier seeds become locked finalists for the entire series.
   - Non-finalists never enter the championship ring.
   - First finalist to earn 2 decisive victories is crowned Champion.
   - A tied championship brawl awards zero series wins and never ends the series.
   - Mini-game selection prevents immediate back-to-back repetitions.
   - Qualifier Brawl Points remain strictly invariant throughout the Championship Series.
   - +500 coins bounty per decisive championship game.
5. **Podium Standings:**
   - 1st Place: Champion (winner of Championship Series)
   - 2nd Place: Runner-up (loser of Championship Series)
   - 3rd Place: Third Place (highest-ranked non-finalist from qualifiers)
   - 4th+ Place: Remaining players in qualifier ranking order

---

## 3. Automated Verification Results

All automated test suites, type checking, linting, and production builds were executed and verified from a clean state.

| Check | Command | Result | Details |
|---|---|---|---|
| **TypeScript Typecheck** | `npm run typecheck` | **PASS** | 0 errors (`tsc --noEmit`) |
| **Code Linting** | `npm run lint` | **PASS** | Clean syntax and import graph |
| **Automated Test Suite** | `npm test` | **PASS** | **52 / 52 passing** across 5 suites (13.08s) |
| **Production Vite Build** | `npm run build` | **PASS** | Clean `dist/` bundle generated (689ms) |
| **Full Verification Pipeline** | `npm run verify` | **PASS** | Composite typecheck, test, and build pipeline |
| **AI Studio Applet Compilation**| `compile_applet` | **PASS** | Build succeeded |

---

## 4. Key Regression Coverage

1. **Full 3-Player WebSocket Tournament Lifecycle (`multiplayer.test.ts`):**
   - Exercises real `createBrawlServer` factory and WebSocket clients.
   - Drives all 3 qualifiers to completion with deterministic results.
   - Verifies 5-tier ranking generates locked finalists (P1 and P2) and 3rd place (P3).
   - Drives Championship Game 1 (P1 wins -> 1–0).
   - Drives Championship Game 2 (Tie -> score stays 1–0, series extended).
   - Drives Championship Game 3 (P2 wins -> 1–1).
   - Drives Championship Game 4 (P1 wins -> 2–1, championship clinched).
   - Asserts qualifier Brawl Points snapshot invariant after every championship game.
   - Asserts locked finalist invariant (P3 never fights in Championship).
   - Asserts no-immediate-repeat mini-game rule between rounds.
   - Reaches `FINAL_PODIUM` on all connected clients and confirms tournament cannot continue.
2. **Authoritative Standings Single Source of Truth (`PayoutRecapModal.tsx`, `roomEngine.test.ts`):**
   - Verified that recap leaderboard orders players by `tournamentRank` provided by the server.
   - Tested that a spectator with higher bankroll but fewer points/wins cannot displace a qualified finalist.
3. **Higher-or-Lower Information Security (`gameEngine.test.ts`):**
   - Verified that secret cards data (`isHigher`, `challengerStat`) is absent from public config before player submission.
4. **Authoritative 5-Tier Tiebreaker & Subgroups (`roomEngine.test.ts`):**
   - Verified 2-player head-to-head resolution.
   - Verified 3-way cyclic tie (A > B > C > A) safely falls through to bankroll / stable roster seed without infinite sort loops.
   - Subgroup isolation verified.
5. **Quick Draw False-Start Prevention (`gameEngine.test.ts`):**
   - Verified 5 boundary timestamps (`-100ms`, `-40ms`, `-1ms` are fouls; `drawAt` and `+1ms` are valid).
6. **Network & Connection Resilience (`multiplayer.test.ts`):**
   - Reconnect race protection tested (old socket close does not drop replaced seat).
   - Host reconnect grace timer survives mini-game round resolution.
   - Stale lobby seat automatic expiry tested.

---

## 5. Repository Cleanup Performed

1. **Obsolete Screenshots Removed:**
   - Removed `landing_screen.png`, `landing_screen_reloaded.png`, `landing_screen_updated.png`, `lobby_screen.png`, and `lobby_3_players.png` which contained obsolete UI ("Circular Graph", "Local Wi-Fi Server 127.0.0.1:3000", "Championship Final", "N + 1").
2. **Obsolete Package Lock Removed:**
   - Deleted `bun.lock` to maintain strict `npm` package management consistency.
3. **Obsolete Terminology Cleaned:**
   - Cleaned references to "Championship Final" and "Qualifiers + Finals" in `LobbyScreen.tsx` and `server.ts`.
4. **Documentation Aligned:**
   - `README.md` and `V1_STATUS.md` updated with real test counts (52 tests) and verified command results.

---

## 6. Physical Hardware QA Gate (Recommended for Production Deployment)

Automated tests prove the complete software lifecycle and protocol correctness. The following items require physical hardware verification on a real local Wi-Fi router:

- [ ] Host computer running `npm start` on Windows (confirm Windows Defender Firewall prompt "Allow access on private networks").
- [ ] At least 3 physical mobile devices (Android and iOS) connected to the same Wi-Fi.
- [ ] Verify Wi-Fi router AP Client Isolation is disabled (router permits device-to-device traffic).
- [ ] Scan QR code using physical phone camera and confirm instant lobby entry.
- [ ] Verify touch responsiveness and latency on all 6 mini-games across mobile Safari and mobile Chrome.
- [ ] Verify phone screen standby / lock reconnect behavior during an active match.
