# BET & BRAWL V2 production finalization — 2026-11-01

## Objective / authorization
Owner authorized the ten fixes, full green local/CI/browser verification, V1 history preservation, V2 integration into main, replacement of the live V1 Cloudflare Worker, and post-deploy multi-client smoke. Do not deploy with any red gate. Preserve architecture, scoring and storage. No Android release/device actions requested.

## Verified starting state
- Clean checkout switched from codex/v2-games-android 7fc31ab to codex/v2-games-web 1bfc5d3. No extra worktree. GitHub refs refreshed; Windows keyring authenticated.
- main 2ee6d66 (V1 Android/LAN), v1-web-cloudflare-ready a60a79d (V1 online), frozen v1-web-final e1f948c / v1.0.0-web-final unchanged. Preserve V1 refs and exact pre-production anchors before main integration.
- Production config now targets bet-brawl; same BRAWL_ROOMS/BrawlRoom SQLite binding as V1. Authenticated Wrangler confirmed existing live version e95923d1-b1e4-4566-9b90-c1cf2fddb49b, compatibility date 2026-10-18 and ASSETS. Actual URL will be retrieved from deployment output.
- Canonical [V2 plan](docs/superpowers/plans/2026-10-26-v2-games.md). Prior verification/handoffs are historical in Git and artifacts/v2/; rerun for this source.

## Decisions / important files
- Keep TS rules and Worker/Node authority. Circuit optimistic rotations reconcile snapshots/rejects/solved/reconnect. Memory reconnect resets draft/undo to server projection; disable offline submissions.
- Scope feedback to locally sent action identity, match, stage and phase; clear on transition/reconnect.
- Isolate deadline clock rendering, using absolute server-adjusted time. Treasure direct controls/presets still require exactly 10 energy. Mirror 1-second authoritative reveal with five 4-second puzzle windows (25 seconds total).
- Collapse standings/final boards behind View details; keep personal outcome/host continuation visible. Territory avatar/name ownership + weighted score. Visible V2 badge.
- Files: src/components/games/V2GameView.tsx, src/engine/useBrawlClient.ts, src/components/PayoutRecapModal.tsx, src/engine/v2Games.ts, worker/roomCore.ts, wrangler.jsonc, docs and CI.

## Progress / checks
- Source confirms reported causes. Storage audit: activeRoom key/data shape compatible via additive fields; V1 clients require refresh for protocol 2. Add V1 snapshot restoration regression.
- Implemented all ten requested changes. Full local lint/cf:verify PASS:98 shared +20 Worker, production build, Worker typecheck, dry-run, actual Wrangler/SQLite/WebSocket tournament/restart/privacy/replay. Evidence artifacts/v2/production-cf-verify.log. Initial sandbox loopback test could not run; escalated actual release gate passed.
- Real Chrome 32-case matrix PASS at four sizes, no page errors/overflow/undersized controls. New hook/component regressions PASS: rapid/partial/batched/rejected/solved Circuit, zero Circuit rerenders during1.25s clock sampling, Memory reconnect draft/undo and disabled actions before seat restoration, stale stage/match errors, Mirror reveal, allocation preset/slider, weighted scores, reachable payout continuation at360/390/1366. output/playwright/{results,regressions}.json; visual screenshots inspected.
- Synthetic V1 restoration initially found a stale-host test fixture; corrected and full20Worker passed. Browser fixture-only failures (Node crypto import, offline Memory controls absent, repeated payout mount) corrected. No remaining observed test failure.
- Review caught socket-open-before-seat-restore gap, fixed by CONNECTING until authoritative ROOM_STATE. Focused browser regression passes. Final review also found rejected-rejoin CONNECTING hang; fixed by returning to entry with an explicit error and closing that unauthenticated socket. Negative browser reconnect regression passes. No unresolved review blocker.
- CI now includes lint/full cf:verify plus the committed real Chromium matrix/regressions, using isolated pinned Playwright tooling. No production dependency added.
- Automatic approval review rejected direct credential-file access for custom Cloudflare API metadata; no credential read performed. Native Wrangler whoami/version/deployment commands succeeded. Continue through native Wrangler.
- Pending: exact-source CI; V1 preservation anchors and main integration; deploy; public smoke; final evidence.

## Exact next action
Commit/push reviewed web source for full CI. Preserve exact V1 main/web refs, integrate web production tree into main without rewriting either history, wait for green main CI, then deploy existing bet-brawl and smoke three public clients. Record all identifiers. Production mutation authorized; do not deploy with red checks.
