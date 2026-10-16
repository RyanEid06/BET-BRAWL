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
Runs 20 native Node 22 test cases covering:
- Laplace smoothing and dynamic odds
- Server-side bet validation (non-integer, negative, duplicate, fighter bets, bankroll checks)
- Round payouts, honest net profit/loss, and tie refunds
- Room capacity (min 6, max 9)
- Fair fighter rotation across 6, 7, 8, and 9 players over 8 and 10 rounds
- Genuine session-only awards
