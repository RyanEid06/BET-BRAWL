# BET & BRAWL — Online Web V2 candidate

V2 adds **Memory Heist, Crowd Count, Mirror Trouble, Safecracker, Circuit Sprint, Split Decision, Treasure Tug, and Pocket Territory** to the six V1 games. All 14 share the existing tournament, betting, championship and bankroll rules. Games use phone taps or PC mouse/keyboard controls.

This is the `codex/v2-games-web` reviewable candidate, version **2.0.0**, using protocol **2** and the isolated Worker name `bet-brawl-v2-candidate`. It has not been deployed or published as a release. V1 remains on `v1-web-cloudflare-ready`; Android/LAN V2 is maintained separately on `codex/v2-games-android`.

The [approved plan](docs/superpowers/plans/2026-10-26-v2-games.md), [candidate evidence](docs/V2_CANDIDATE.md), and [worklog](CODEX_WORKLOG.md) record implementation and acceptance. New hosts explicitly reject incompatible clients; all participants need the same version. Secret drafts, guesses and choices are projected per viewer, and server deadlines survive reconnect/restart. A shuffled bag exhausts all games before repeating.

Both final candidates are verified: [web CI40469684284](https://github.com/RyanEid06/BET-BRAWL/actions/runs/40469684284) at `d20ccc4` (96 shared +19 Worker tests), and [Android CI40469773003](https://github.com/RyanEid06/BET-BRAWL/actions/runs/40469773003) at `f7ad2f9` (103 shared +76 Kotlin tests, lint and APK builds). The [handoff](docs/V2_CANDIDATE.md) records the final verified debug APK, unsigned release APK, hashes and remaining manual acceptance. V1 branches are unchanged; no candidate merge, deployment or release publication has occurred.

An online party game for 3–9 players, hosted on Cloudflare. React/Vite assets and a Worker share the HTTPS origin. Each room code routes to exactly one authoritative SQLite Durable Object; clients communicate over WSS. Players can use different networks. Internet is required.

The production web target does not use Express, Render, an Android host, or a laptop server. `server.ts` is a tested local Node/LAN behavioral reference and development option only.

## Verify from clean dependencies

Use Node 22+ and the committed lockfile. Wrangler 4.151.1 is a local pinned development dependency.

```powershell
npm ci
npm run typecheck
npm test
npm run test:worker-core
npm run build
npm run cf:typecheck
npm run cf:dry-run
npm run test:cloudflare
npm run cf:verify
```

`cf:verify` combines all release checks. Worker-core tests exercise authoritative handlers; the Wrangler suite uses actual local Workers/SQLite Durable Objects and WebSockets, plays a full tournament, and restarts the runtime to verify persisted state and pending deadlines. Test timing is supplied only by the local test process; production config contains no `BRAWL_TEST_FAST` variable.

## Deploy — owner follow-up

Run these from this branch's root after verification:

```powershell
git switch v1-web-cloudflare-ready
npm ci
npm run cf:verify
npm exec wrangler whoami
# Only if authentication is needed, complete this interactive step yourself:
npm exec wrangler login
npm run cf:deploy
```

Use the existing Cloudflare account/Worker configuration. `cf:deploy` builds the frontend and deploys the Worker plus assets. Record the URL and version printed by Wrangler. No API token belongs in source or chat. Do not set the test timing variable on the production Worker.

Then manually check `/`, static assets, `/api/network-info`, public WSS, room creation and at least three clients joining/synchronizing. QR links are public HTTP(S) invite URLs with one `room` parameter; opening the URL prefills the room. Deployment/public multi-client acceptance is USER FOLLOW-UP under the owner's corrected scope; a local runtime test is not public deployment evidence.

## V1 behavior

Each player fights two qualifiers against distinct opponents. Scoring is win 3 / tie 1 / loss 0. Five ranking levels: qualifier points, qualifier wins, applicable decisive head-to-head for a tied pair, bankroll, frozen roster order. Top two finalists lock. Championship requires two decisive wins; ties/VOID add no wins and never change qualifier statistics. Podium is champion, runner-up, best-ranked non-finalist.

Bets stay private until payout; VOID refunds bets without adding qualifier fighter statistics. Disconnect-forfeit refunds spectators. The server owns deadlines, seat tokens, reconnect replacement authority, and room closure.

## Branches and evidence

- `v1-web-cloudflare-ready`: this online target.
- `main`: Android bundled UI + Kotlin authoritative host, same Wi-Fi/LAN, no internet backend.
- `v1-web-final`: preserved Node/LAN reference at `e1f948c`, tagged `v1.0.0-web-final`; untouched until separate retirement confirmation.

[Release report](V1_RELEASE_REPORT.md), [verification](CLOUDFLARE_VERIFICATION.md), [migration decisions](CLOUDFLARE_MIGRATION.md), and [checkpoint](CODEX_WORKLOG.md) describe executed evidence and follow-up. Generated output, local SQLite/test data and credentials are ignored. Branches share one canonical Git repository; temporary worktrees live outside it.

Natural Earth map geometry used by Blind Pinpoint is public domain.
