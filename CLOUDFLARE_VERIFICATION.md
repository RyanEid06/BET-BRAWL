# Cloudflare V1 verification — 2026-10-20

This is the maintained online web target. Node 24/Windows local evidence is separate from GitHub CI and public deployment.

| Executed command | Observed result |
|---|---|
| npm ci | PASS: 213 packages, zero reported vulnerabilities |
| npm run typecheck | PASS |
| npm test | PASS: 58/58 TS/Node protocol tests |
| npm run test:worker-core | PASS: 14/14 Worker tests |
| npm run build | PASS |
| npm run cf:typecheck | PASS |
| npm run cf:dry-run | PASS: Wrangler 4.151.1, SQLite BrawlRoom +ASSETS |
| npm run test:cloudflare | PASS: actual local Wrangler/SQLite runtime |
| npm run cf:verify | PASS: complete pipeline |

The real-runtime suite checks min/max/ready/host authority, seat cleanup/replacement, all three qualifiers, secret bets/reveal/deadlines, locked finalists and a 2–1 championship with an intervening tie, podium, VOID/refund/stat invariance, offline-next-round forfeit, pre-start nonparticipant exclusion, room isolation, authenticated close, and process restart recovering SQLite room/podium plus an active bet and pending deadline. It uses isolated temporary storage and test-only timing. Production timings remain unchanged.

Worker regressions additionally reject old closing-socket commands, repeated joins, early alarm transitions/actions, solo/two-player debug starts, and stale seats after returning to lobby. Exact-round shared qualifier tests reject replay/incorrect identity.

Local evidence: `artifacts/cloud-final-verify.log` (ignored diagnostics). CI runs the same complete gate from clean dependencies; inspect the current branch's Actions result separately. No workflow deploys automatically.

## Preserved history

Frozen `v1-web-final` is `e1f948c6c6e46355435fd70ea9ab8ee63031ebea`, tagged `v1.0.0-web-final`. Its untouched source passed typecheck, 52/52 tests and build using repaired installed dependencies; its original lock lacks optional-platform entries. Earlier migration-only reports/hashes remain recoverable in Git at `9aa66f1`; their 46-test/4-test counts and unexecuted-Wrangler statements no longer describe current verification.

## Owner follow-up

Authenticate/deploy using README commands, then test public HTTPS/WSS/QR and multiple clients on different networks. No production deployment URL or success is claimed. These manual steps are USER FOLLOW-UP under the owner's corrected scope.
