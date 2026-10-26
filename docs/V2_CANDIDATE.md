# V2 candidate verification

Approved scope: [14-game expansion plan](superpowers/plans/2026-10-26-v2-games.md). Version 2.0.0 / protocol 2. Candidate branches remain separate from the maintained V1 branches. No merge, deployment or publication is authorized by this handoff.

## Web candidate

`codex/v2-games-web`, based on online V1 `a60a79d007b6c93acb49d49483b9f1c343f76d76`. Worker name `bet-brawl-v2-candidate` isolates future candidate storage from V1. All eight new games are connected to the existing React UI, Node reference host and Cloudflare room authority.

The implementation adds private recipient projections, absolute stage deadlines, match/action identities, immutable commitments, reconnect/restart state and a persisted shuffled bag of all 14 games. Existing tournament, betting and payout behavior remains covered.

### Review fixes

- Recovery retains published betting/start/end deadlines and the saved puzzle. A restart before start catches up directly to the correct phase or final settlement.
- Circuit puzzles generate varied self-avoiding source-to-sink routes. Both external ports initially close, requiring changes to at least two tiles.
- The shared engine catches up stages before checking the submitted stage identity.
- The payout screen includes the completed V2 game's revealed answers and explanation.
- Short-height phone layouts keep all Mirror choices visible without reducing interactive targets below 44px.

Each behavioral review fix has a focused regression observed failing before the correction and passing afterward. Legacy timing fixtures explicitly select the V1 game they exercise.

### Observed checks

- Focused rules/engine/payout regression suite: 50/50 passed.
- Worker core: 18/18 passed, including private Memory state and restart before game start, across missed phases and the full deadline.
- Browser component harness: 32 interaction cases (eight games at 360×640, 390×844, 768×1024, 1366×768); touch/mouse actions, recipient/finished states, phase transitions, keyboard focus, reduced motion and orientation checked. No horizontal overflow, sub-44px enabled targets or page errors. Mirror fits 360×640 with a 100px shell allowance. Memory/Circuit/Territory may scroll vertically.
- Full `npm run cf:verify`: passed (92 engine/client tests, 18 Worker tests, build/typechecks, Wrangler dry run, actual local SQLite/WebSocket suite). Includes real runtime restart with private Safecracker history, unchanged deadlines and one final settlement. Exact-source CI is pending push.

Local diagnostic artifacts: `artifacts/v2/resumed-cf-verify.log`, `artifacts/v2/web-review.md`, `artifacts/v2/browser/REPORT.md` and browser screenshots/metrics. These are ignored local evidence, not required runtime assets.

## Android/LAN candidate

Base `main` at `2ee6d66f4ecd49a66bf31530413919d550055f11`. Native rules staging passes 13 standalone JVM tests, including all eight shared traces plus 104 full-state and 312 recipient-projection comparisons. Integrated host, Android checks and APK provenance are pending; standalone parity does not establish Android acceptance.

## Manual acceptance

Before any release, play all 14 games with three or more real participants on phone and PC. Check private choices from fighter/opponent/spectator views, reconnect during study/answer/commit/reveal, betting, qualifiers, championship ties, forfeit and VOID refunds. Confirm short-screen scrolling and orientation are comfortable during timed games.

Public HTTPS/WSS deployment and real physical Android LAN discovery/hosting/joining remain separately recorded acceptance. No physical device was installed, wiped or modified during these checks. Release signing must use an established identity; unsigned release and debug-signed APKs must be labeled accurately.
