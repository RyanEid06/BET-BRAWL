# BET & BRAWL V2 production checkpoint — 2026-11-01

## Objective / status
COMPLETE: ten requested fixes implemented in the current V2 web architecture; full local/CI/browser gates passed; V1 history preserved; main promoted; existing Cloudflare production replaced; public three-client smoke passed. No remaining implementation or deployment action. This final checkpoint/release-evidence change is documentation only.

## Production / Git provenance
- Canonical C:/Users/Administrator/Desktop/Projects/BET-BRAWL; production branch main; no extra worktree. V2 deployed source00b0572bcbbd31a42f17c0d86094413c96e1e526. Final documentation-only commits may follow; runtime/config trees must equal this source.
- Main retains web production tree with former main as merge parent (ours strategy then fast-forward, no force/history rewrite). Prior V1 Android main is preserved by annotated tag v1.0.0-pre-v2-main ->2ee6d66f4ecd49a66bf31530413919d550055f11. Android V2 remains on codex/v2-games-android7fc31ab; no APK/device changes requested/performed.
- Preserved online V1: v1-web-cloudflare-ready and annotated v1.0.0-production-web ->a60a79d007b6c93acb49d49483b9f1c343f76d76. Frozen v1-web-final and v1.0.0-web-final ->e1f948c6c6e46355435fd70ea9ab8ee63031ebea. Remote branch/tag hashes rechecked after deployment; unchanged.
- Worker/site bet-brawl; https://bet-brawl.northstack-labs.workers.dev; V2 version d349b03e-b847-4f13-a6b9-445c0c639230. Previous live V1 version e95923d1-b1e4-4566-9b90-c1cf2fddb49b remains in Cloudflare history. Native Wrangler deploy --strict --keep-vars succeeded. BRAWL_ROOMS/BrawlRoom SQLite, activeRoom key, room-code routing and compatibility date2026-10-18 retained; no destructive migration/new namespace.

## Changes / decisions
- Circuit optimistic rotations/power/moves reconcile using authoritative move counts; rejects/solved/reconnect safely reset. Memory reconnect/rejection mounts from server board and clears undo. Offline/unauthenticated restoration controls pause; failed reconnect returns to entry with recoverable error.
- Action results require locally known action ID/current match/stage/phase. Clear feedback at transitions/reconnect.
- Deadline clock samples absolute server-adjusted time every100ms independently; integer seconds avoid game rerendering.
- Treasure sliders +Balanced3/3/4 +Clear retain exact10-energy rules/scoring. Mirror five4-second puzzles each gain1-second authoritative correct/wrong reveal (25s total).
- Compact payout keeps winner/personal result/host continuation visible; View details contains standings/final boards/history. Territory avatars/names/colors +weighted live scores. Visible BET & BRAWL V2 badge and API2.0.0/protocol2.
- README/release/deployment docs target main/bet-brawl; no deployment instruction switches to the V1 branch. Historical V1 docs labeled. [Release](docs/V2_RELEASE.md), [storage/rollback](CLOUDFLARE_MIGRATION.md), [checks](CLOUDFLARE_VERIFICATION.md), original [V2 plan](docs/superpowers/plans/2026-10-26-v2-games.md).

## Observed verification / evidence
- Local lint/full cf:verify PASS:98shared tests +20Worker tests, TS/Worker typechecks, production build/dry-run, actual Wrangler SQLite/WebSocket tournaments/privacy/replay/reconnect/restart/pending alarms. artifacts/v2/production-cf-verify.log. Synthetic V1 snapshot restore proves identity/bankroll/bet/schedule retention, one-time timeout/refund and next identified V2 round.
- Real Chrome32-case matrix at360x640/390x844/768x1024/1366x768 PASS, no page errors/overflow/undersized controls.8focused hook/component groups PASS: rapid/partial/batched/reject/solve Circuit, zero Circuit rerenders during1.25s clock sampling, Memory draft/undo reconnect, pre-join pause/failed restoration, stale feedback, Mirror reveal, allocation, territory scores and reachable payout continuation. Screenshots visually inspected. output/playwright/{results,regressions}.json.
- CI41309586042 SUCCESS at453c028; main CI41309915087 and same-source web CI41309915029 SUCCESS at00b0572. Each clean npm ci, lint/full cf:verify and real Chromium matrix/regressions; browser tooling isolated/pinned1.62.1. Logs/artifacts under artifacts/v2/production-{ci-453c028,main-ci-00b0572}*. Final documentation CI is visible in main Actions; runtime remains the tested/deployed tree.
- Actual App local multi-client Node browser smoke PASS: Red/Green and Memory private role/scoped actions/study/draft/lock/payout, no page errors. artifacts/v2/production-app-smoke.log and browser/production-protocol-results.json. All local browser/Node/Vite processes ended.
- Public HTTPS/WSS smoke PASS:3isolated Chrome clients, normal room create/join/ready/start, same fighter seat reconnect, Rapid Red/Green and Split Decision completion/payout/next-round twice.12accepted actions,0rejected,0page/Join errors; own test-room CLOSE_ROOM requested. output/playwright/production-smoke.json and artifacts/v2/production-public-smoke.log.
- Public home200, visibleV2 and API2.0.0/protocol2; public JS/CSS match local SHA-256 exactly. artifacts/v2/production-integrity.json; deployment log artifacts/v2/production-deploy.log.

## Limits / useful context
- V1 tabs must refresh for protocol2. Existing V1 stored rounds can settle/refund from retained alarms; legacy rounds lack current action identity, so seamless in-progress V1 interaction is not claimed. Code rollback does not roll back room data; prefer roll-forward or quiet room boundary.
- Public smoke used isolated browser contexts on one computer, not physical phones or participants on different networks. Android/LAN/established signing remain separate.
- Native Wrangler auth/deployment succeeded. Automatic approval review rejected direct credential-file access for custom metadata; no credential was read by that rejected action. Used native CLI thereafter. No secrets printed/committed.
- Fixed test-only stale host/Node-crypto/mount assertions during regression development; final suites green. Initial sandbox loopback restriction required approved local server execution. Useful logs/reports preserved; disposable dry-run/helper artifacts may be removed after exact-path audit.

## Exact next action
No further product work required. Verify final documentation-only main CI succeeds, retain final status under artifacts/v2/, report final HEAD and production/recovery identifiers. Keep V1 history and Android branch intact. No further deployment needed for documentation-only changes.
