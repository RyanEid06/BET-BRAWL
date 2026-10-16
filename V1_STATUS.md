# BET & BRAWL — V1 Status Tracker

Last Updated: Phase 28 Complete (Production Ready)

## 1. Summary of Completed Work
- Express local server + `ws` WebSocket server architecture established.
- 6-game rotation catalog defined (Millisecond Stop, Rapid Red/Green, Speed Math, Higher/Lower, Blind Pinpoint, Quick Draw).
- Pure server-authoritative adjudicator for all 6 active mini-games (`src/engine/gameEngine.ts`). All client-side opponent bot simulation code completely eliminated.
- Dynamic odds calculations with Laplace smoothing, strict bet validation rules, and honest net profit/loss calculations (`src/engine/odds.ts`).
- Clean session statistics starting at 0, starting bankroll 1000 coins.
- Session awards computation based solely on genuine current session stats (`src/engine/roomEngine.ts`).
- Public player security: `sessionToken` stripped from all public broadcasts (`PublicPlayer`), preventing identity spoofing and unauthorized actions.
- Resilient local Wi-Fi discovery (`src/engine/networkDiscovery.ts`): filters out link-local `169.254.x.x` addresses, exposes prioritized candidate URLs, and supports host network info in UI.
- Comprehensive automated test suite: 36 unit and multi-client integration tests passing (`npm test`).
- Production build verified (`npm run build`).

## 2. Completed Milestones
- [x] Phase 1: Clean project / remove AI residue (`@google/genai`, metadata capability, dead `CoinFlipGame.tsx`, unused dependencies, clean package.json).
- [x] Phase 2: Fix npm test, typecheck, build, dev, start, verify scripts; tsconfig node/vite type separation; fix `RoomNetworkInfo` TS types.
- [x] Phase 3: Real LAN address discovery (filter 169.254.x.x link-local, prefer RFC1918 private IPv4, expose candidate URLs, window.location origin fallback).
- [x] Phase 4: Room lifecycle safety (prevent random clients wiping active room via `CREATE_ROOM`, phase-check all host actions, proper `ROOM_CLOSED` handling).
- [x] Phase 5: Prevent session token leaks (create `PublicPlayer` stripped of `sessionToken`, bind ws to player identity, prevent impersonation).
- [x] Phase 6: Client connection & reconnect resilience (fix stale closure in `onclose`, support immediate retry on open socket, handle reconnect with saved token).
- [x] Phase 7: Connected player semantics (visualize connection status, require connected humans to start, handle fighter/host disconnect grace windows).
- [x] Phase 8 & 10: Rebuild gameplay protocol around ACTIONS, not claimed scores; remove all client-side opponent bot simulations from normal gameplay.
- [x] Mini-Games Authoritative Overhaul:
  - [x] 1. Millisecond Stop: Server calculates stop elapsed from `gameStartsAt`, handles ties and DNF.
  - [x] 2. Rapid Red Light / Green Light: Server evaluates taps against schedule timestamp (+1 green, -3 red, floor 0), first to 40 or timeout.
  - [x] 3. Speed Math: Server validates answers against private correct answers, 1500ms penalty on wrong answer, first to 3.
  - [x] 4. Higher or Lower: Server validates guesses against sequence, first to 3.
  - [x] 5. Blind Pinpoint: Client sends normalized (x,y), server computes Haversine distance, accurate local equirectangular SVG map.
  - [x] 6. Quick Draw: Server authoritative `drawAt` timestamp, early tap = false start, lowest reaction wins, fair tie handling.
- [x] Phase 11: Public game state for spectators (real-time progress, no fake simulations).
- [x] Phase 12 & 13: Secret betting state (broadcast aggregates during betting window, private `BET_ACCEPTED`, show rejected bet reasons, server-authoritative `bettingEndsAt`).
- [x] Phase 14: Fighter reveal automatic countdown / remove non-functional continue button.
- [x] Phase 15: Server timer safety tied to roomId / roundId.
- [x] Phase 16: Fisher-Yates shuffle for fighter rotation.
- [x] Phase 17: Host lobby match length control (8 vs 10 rounds).
- [x] Phase 18: Payout / tie refund UX (`BET_REFUND`, honest net 0).
- [x] Phase 24 & 25: Expanded unit test suite + multi-client WebSocket integration test (36 tests).
- [x] Phase 28: Accurate, comprehensive README.

## 3. Verification Commands & Final Status
- `npm run typecheck`: PASSING (0 errors)
- `npm test`: PASSING (36/36 tests passing)
- `npm run build`: PASSING (clean Vite production bundle)
- `npm run verify`: PASSING (typecheck + test + build)
- Multi-client integration test: PASSING
