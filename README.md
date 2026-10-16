# Bet & BRAWL: Local Wi-Fi Party Game Engine

An offline, low-latency party game for 6 to 9 friends in the same physical room on the same local Wi-Fi network. Two players compete in fast 15-second mini-games while spectators place live secret wagers with dynamic odds.

---

## How to Host & Play

### 1. Requirements
- Node.js 20+ installed on the host computer / phone.
- All 6 to 9 players must be connected to the **same local Wi-Fi network** (or phone hotspot).
- Zero cloud servers, zero internet API keys, and zero external fonts needed.

### 2. Start the Local Host Server
On the host machine, run:
```bash
npm install
npm run build
npm start
```
*(Or for development mode: `npm run dev`)*

The server automatically detects your computer's local IPv4 network address (e.g. `192.168.1.50`) and binds to `0.0.0.0:3000`.

### 3. Join the Game from Phones
1. Open your browser on the host machine (`http://localhost:3000`).
2. Click **HOST NEW GAME**. A room is created with a room code and a large join QR code.
3. Friends on the same Wi-Fi simply:
   - **Scan the QR code** with their phone camera, OR
   - Open the displayed local URL (e.g. `http://192.168.1.50:3000`) and tap **JOIN GAME WITH CODE**.
4. Enter their player alias and pick an avatar.
5. In the lobby, each player taps **SET READY**.
6. When at least 6 players are ready, the host taps **START BRAWL MATCH!**.

---

## Mini-Game Catalog (6 Active Games)

1. **Millisecond Stop:** A timer counts toward `05.000s`. At `03.000s`, the timer blinds out into `??.???`. Players tap at what they feel is exactly `05.000s`. Closest tap wins.
2. **Rapid Red Light, Green Light:** Unpredictable traffic light simulator with authoritative server schedule. Mash tap on Green (+1 point); tapping on Red penalizes (-3 points). First to 40 or leader at 15s wins.
3. **Speed Math:** Rapid 3-question mental arithmetic race with randomized questions. Mistakes trigger a 1.5s freeze penalty. First to 3 correct answers wins.
4. **Higher or Lower:** Real-world stable trivia showdown (mountain elevations, monument heights, historical dates). First to 3 correct locks wins.
5. **Blind Pinpoint:** Target city appears with an equirectangular world map. Tap your pin; genuine kilometer distance error is calculated with the Haversine formula. Smallest distance error wins.
6. **Quick Draw:** Both fighters see "WAIT...". When "DRAW!" flashes, tap instantly. Tapping early triggers an immediate false-start disqualification! Fastest reaction wins.

---

## Developer / Debug Mode
To test with fewer than 6 devices, append `?debug=1` to the URL:
```
http://localhost:3000?debug=1
```
This enables the `+ Add Test Bot` button in the lobby, allowing a single developer to populate 6-9 players and test all gameplay loops.

---

## Running the Automated Test Suite
```bash
npm test
```
Runs 36 comprehensive test cases covering:
- **Authoritative Mini-Game Engine:** Pure server rule adjudication for all 6 games (Millisecond Stop elapsed timing & DNF timeout handling, Red Light Green Light schedule boundaries & score penalization, Speed Math question generation & 1.5s freeze penalty, Higher/Lower server-side validation against stable trivia dataset, Blind Pinpoint normalized coordinates & server-side Haversine kilometer distances, Quick Draw false-start foul detection & reaction time comparisons).
- **Multi-Client WebSocket Integration:** Real WebSocket client/server lifecycle, connection authentication, token privacy enforcement (session tokens never leaked to public states), spectator wagering, and authoritative brawl resolution.
- **LAN Network Discovery:** RFC1918 private IPv4 detection, link-local `169.254.x.x` rejection, candidate URL generation, and interface prioritization.
- **Laplace Smoothing & Dynamic Odds:** Dynamic payout multipliers, underdog incentives, and bettor risk/reward balance.
- **Strict Bet Validation:** Prevention of duplicate bets, self-betting by fighters, over-bankroll stakes, and invalid round phases.
- **Authoritative Payouts & Refunds:** Honest net profit calculation (+net on wins, -stake on loss) and 0-net coin refunds on ties.
- **Room Lifecycle & Fair Rotation:** 6–9 player room constraints, Fisher-Yates match scheduling across 8 and 10 rounds with equal opportunity distribution, and session awards calculated strictly from current session statistics.

## Verification
```bash
npm run verify
```
Runs TypeScript verification (`tsc --noEmit`), the 36-test automated suite, and the Vite production build (`vite build`) in one command.
