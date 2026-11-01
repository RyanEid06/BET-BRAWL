# V2 release — 2.0.0

V2 is the production web version on main, targeting the existing Cloudflare Worker/site bet-brawl. V2 is deployed at [bet-brawl.northstack-labs.workers.dev](https://bet-brawl.northstack-labs.workers.dev). The public multi-client smoke passed.

## Changes

1. Circuit Sprint rotates immediately with optimistic tiles/power/move count; authoritative move counts reconcile partial/batched snapshots, while rejects/reconnect/solved snapshots reset safely.
2. Treasure Tug gains per-lane sliders and Balanced 3 / 3 / 4 and Clear controls. Existing +/- controls remain; exactly ten energy and all scoring rules remain unchanged.
3. Payout keeps winner, personal outcome and host continuation above collapsed View details containing standings and final boards/history.
4. Mirror Trouble retains five four-second puzzles and adds one second of authoritative correct/wrong reveal after each (25 seconds total).
5. Action feedback accepts only locally known action IDs in the current match/stage/phase and clears at transitions/reconnect.
6. Memory Heist resets local draft and undo history to authoritative state on reconnect/rejection; offline controls pause.
7. A separate deadline clock retains 100 ms sampling against absolute server-adjusted time; integer seconds update independently of game controls.
8. Pocket Territory uses fighter avatars/names on tiles and a live weighted-score legend with distinct player colors.
9. Small visible BET & BRAWL V2 indicator plus version 2.0.0/protocol 2 network metadata.
10. README/deployment/release docs describe production main and bet-brawl; V1 is preserved history. Production keeps the existing Durable Object namespace and storage shape.

## Verification and deployment record

- Pre-upgrade live Worker version: e95923d1-b1e4-4566-9b90-c1cf2fddb49b (2026-10-20), retrieved through Wrangler. BRAWL_ROOMS/BrawlRoom and ASSETS confirmed.
- Local lint/full cf:verify PASS:98 shared +20 Worker, typechecks/build/dry-run and actual Wrangler SQLite/WebSocket tournament/restart. Real Chrome matrix32cases and8 focused regression groups PASS; zero page errors.
- Exact-source [CI41309586042 SUCCESS](https://github.com/RyanEid06/BET-BRAWL/actions/runs/41309586042) at453c02836add4a0b5223de92f43dd97f471171fb includes clean-install full gate and Chromium matrix/regressions.
- Published recovery tags: v1.0.0-production-web at a60a79d007b6c93acb49d49483b9f1c343f76d76; v1.0.0-pre-v2-main at2ee6d66f4ecd49a66bf31530413919d550055f11. Existing V1 branches/frozen tag verified unchanged.
- Production source:00b0572bcbbd31a42f17c0d86094413c96e1e526. [Main CI41309915087 SUCCESS](https://github.com/RyanEid06/BET-BRAWL/actions/runs/41309915087) and [same-head web CI41309915029 SUCCESS](https://github.com/RyanEid06/BET-BRAWL/actions/runs/41309915029), each including clean-install full verification and Chromium. Final release-evidence commits change documentation only; runtime/config remain identical to this deployed source.
- Cloudflare Worker/site:bet-brawl, version d349b03e-b847-4f13-a6b9-445c0c639230, deployed2026-11-01 with strict remote-config checks and preserved dashboard variables. The old V1 version remains in deployment history. Existing BRAWL_ROOMS/BrawlRoom SQLite storage is retained.
- Public smoke:3isolated Chrome clients created/joined a normal room, marked ready, started tournament, reconnected the same fighter seat, played Rapid Red/Green and Split Decision, finished both games, synchronized payout and advanced to the next round after each.12accepted actions,0rejected,0page/Join errors. Test-room CLOSE_ROOM sent during cleanup. Evidence:output/playwright/production-smoke.json and artifacts/v2/production-public-smoke.log.
- Public integrity:home200, visible V2 badge/title, /api/network-info version2.0.0/protocol2. Public JS/CSS SHA-256 match the tested local deployment build exactly (artifacts/v2/production-integrity.json).
- V1 remote branch and dereferenced tag hashes rechecked after deployment; unchanged. Final main documentation CI can be inspected in [Actions](https://github.com/RyanEid06/BET-BRAWL/actions?query=branch%3Amain).

## Recovery and boundaries

Existing V1 web-ready/frozen branches and frozen tag remain untouched. Exact pre-promotion anchors are recorded above. Protocol 1 clients must refresh to V2. Storage is preserved; rollback of Worker code does not roll back room data. Android/LAN code and device acceptance stay on their separate branch; this release does not create a new APK or claim phone testing.
