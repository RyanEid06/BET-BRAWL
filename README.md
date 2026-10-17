# Bet & BRAWL: Local Wi-Fi Party Game Engine

An offline, low-latency party game for 3 to 9 friends in the same physical room on the same local Wi-Fi network. Two players compete in fast 15-second mini-games while spectators place live secret wagers with dynamic odds.

---

## Windows Quick Start (Install & Host)

Open **PowerShell** or **Command Prompt** in the project directory:

```powershell
# 1. Install dependencies reproducibly using package-lock.json
npm ci

# 2. Build the production client
npm run build

# 3. Start the authoritative production server
npm start
```

For development mode with hot-reloading:
```powershell
npm run dev
```

### Windows Firewall Note
When running `npm start` for the first time, Windows Defender Firewall may display an alert:
- Check **"Private networks, such as home or work network"**
- Click **"Allow access"**
This permits incoming connections on port 3000 from mobile phones connected to the same Wi-Fi router or phone hotspot.

---

## How to Play

### 1. Requirements
- Node.js 20+ installed on the host computer.
- All 3 to 9 players connected to the **same local Wi-Fi network** (or a phone hotspot).
- Zero cloud servers, zero internet API keys, and zero external fonts needed.

### 2. Join the Game from Phones
1. Open the host browser at `http://localhost:3000`.
2. Click **HOST NEW GAME**. A room is created with a room code and a QR code pointing directly to the host computer's LAN IP address.
3. Friends on the same Wi-Fi network:
   - **Scan the QR code** with their phone camera, OR
   - Open the displayed local URL (e.g. `http://192.168.1.50:3000`) and enter the room code.
4. Enter an alias and choose an avatar.
5. In the lobby, each player taps **SET READY**.
6. When at least 3 connected players are ready (all connected players ready), the host clicks **START BRAWL MATCH!**.

---

## Tournament Format & Brawl Points

Bet & BRAWL features a structured tournament architecture:

**QUALIFIERS → TOP TWO SEEDS → CHAMPIONSHIP FINAL**

1. **Qualifier Scheduling:**
   - The server freezes the connected session roster of N players (3–9 players).
   - Generates a fair circular pairing graph (`P0 vs P1`, `P1 vs P2`, ..., `P(n-1) vs P0`).
   - Every player receives exactly 2 qualifier appearances against 2 distinct opponents.
   - Qualifier match bounty: +250 coins.
2. **Brawl Points Scoring:**
   - **Win:** 3 Brawl Points
   - **Tie:** 1 Brawl Point each
   - **Loss:** 0 Brawl Points
3. **Championship Qualification:**
   - Ranked primarily by Brawl Points earned in qualifiers.
   - Head-to-head qualifier outcomes serve as primary tiebreaker, followed by coin bankroll.
   - Top 2 ranked fighters advance to the Championship Final!
4. **Championship Final:**
   - High-stakes title brawl with a +500 coin victory bounty.
   - The victor is crowned **Tournament Champion** on the podium.

---

## Mini-Game Catalog (6 Active Games)

1. **Millisecond Stop:** A timer counts toward `05.000s`. At `03.000s`, the timer blinds out into `??.???` for **all clients** (fighters and spectators alike) to prevent room coaching. Players tap as close to `05.000s` as possible. Closest tap wins.
2. **Rapid Red Light, Green Light:** Fast traffic light simulator with authoritative server schedule. Mash tap on Green (+1 point); tapping on Red penalizes (-3 points). First to 40 or highest score at 15s timeout wins; explicit tie if equal.
3. **Speed Math:** Rapid 3-question mental arithmetic race with randomized questions. Wrong answers trigger an authoritative 1.5s freeze penalty with live UI countdown. First to 3 correct answers or highest at timeout wins.
4. **Higher or Lower:** Real-world stable trivia showdown (astronomy, physics, monument heights, geography, historic years). First to 3 correct locks wins (or highest score at timeout; explicit tie if equal).
5. **Blind Pinpoint:** Target city appears with an equirectangular world map. Tap your pin; genuine kilometer distance error is calculated with the Haversine formula. Smallest distance error wins.
6. **Quick Draw:** Both fighters see "WAIT...". When "DRAW!" flashes, tap instantly. Tapping even 1ms before "DRAW!" is an instant false-start disqualification! Lowest valid reaction time wins.

---

## Developer / Debug Mode
To test with fewer physical devices, open:
```
http://localhost:3000?debug=1
```
This enables the `+ Add Bot (debug)` button in the lobby, allowing a single developer to populate 3-9 players and test all gameplay loops.

---

## Automated Test Suite & Verification

Run the entire verification pipeline in one command:
```bash
npm run verify
```
This executes:
1. `npm run typecheck` (`tsc --noEmit`): 0 TypeScript errors.
2. `npm test` (`tsx --test ...`): 45 comprehensive tests covering:
   - **Production Server Integration:** Real WebSocket multi-client lifecycles exercising `createBrawlServer`, 3-player and 6-player tournament scheduling, token privacy, spectator wagering, fighter action processing, payout synchronization, and room closure.
   - **Tournament & Brawl Points Fairness:** Circular qualifier graph generation, N qualifiers for N players, head-to-head tiebreak resolution, top 2 finalist promotion, and championship crowning.
   - **Old-Socket Reconnect Race Protection:** Verified that a socket closing after reconnect replacement cannot disconnect the seat.
   - **Connection Grace Timers Separation:** Verified host reconnect grace timer survives round completion and mini-game resolution.
   - **Disconnected Seat Expiry:** Verified stale disconnected lobby seats automatically clean up after grace expiry to restore room capacity.
   - **Authoritative Deadlines:** Strict boundary tests for `bettingEndsAt` and `gameEndsAt`.
   - **Quick Draw Exploit Elimination:** Strict boundary tests at `drawAt - 100ms`, `drawAt - 40ms`, `drawAt - 1ms` (all fouls), `drawAt` (valid 0ms), and `drawAt + 1ms` (valid 1ms).
   - **Runtime Payload Sanity Validation:** Strict rejection of malformed guesses, invalid coordinates, and negative indices.
   - **LAN Network Discovery:** RFC1918 private IPv4 detection, link-local `169.254.x.x` rejection, candidate URL generation, and interface prioritization.
   - **Laplace Smoothing & Dynamic Odds:** Dynamic payout multipliers, underdog incentives, and bettor risk/reward balance.
   - **Room Lifecycle:** 3–9 player room constraints, strict rejection of fewer than 3 players in production mode, and genuine session awards.
3. `npm run build` (`vite build`): Generates static production assets in `dist/`.

---

## Assets & Attribution
- Equirectangular world map coastline geometries in Blind Pinpoint are derived from [Natural Earth](https://www.naturalearthdata.com/) vector data (Public Domain).
