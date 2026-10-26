# BET-BRAWL V2 checkpoint

## Objective / scope
Owner approved [canonical V2 plan](docs/superpowers/plans/2026-10-26-v2-games.md): V1 six plus eight new =14 games, phone/PC, web then Android/LAN. Retain tournament/bets/bankroll. No merge/deploy/publication, new dependencies/modes/accounts/redesign, or physical-device installation.

## State / topology
- Canonical checkout C:/Users/Administrator/Desktop/Projects/BET-BRAWL, started clean at online a60a79d007b6c93acb49d49483b9f1c343f76d76. Current private branch codex/v2-games-web; V1 refs/ignored artifacts preserved.
- Android main base2ee6d66f4ecd49a66bf31530413919d550055f11; later codex/v2-games-android. Shared React/TS, cloud Worker only web, Kotlin host only Android. Never wholesale merge cloud routing into LAN.
- Ruling: reuse clean canonical checkout on private branches to avoid unnecessary worktrees/dependency copies. Git metadata needs sandbox escalation; branch creation tool review approved.
- V1 history/evidence: V1_RELEASE_REPORT.md, CLOUDFLARE_VERIFICATION.md, artifacts/v1-closure.json. No new public/device acceptance claimed.

## Architecture / preflight
- Focused pure V2 rules module and UI; root owns Node/DO integration, protocol/rotation/persistence; Kotlin port after web.
- Unique tournament/match IDs; match/stage/action-scoped inputs. Hidden projections include score fields. Absolute deadlines; catch up stages before timeout, persist before effects.
- Circuit reciprocal straight/elbow masks, source row1-left/sink row2-right (0-based), generated solvable. Shared fixtures pin language parity.
| Tasks | Shared contract | Ruling |
|---|---|---|
|Rules/host|typed state/action/view/advance|Fix interfaces in task brief before edits.|
|Rules/UI|recipient config/state and decisions|UI never computes authoritative score/time.|
|Web/Android|shared files + Kotlin fixtures|Scoped transfer; preserve discovery/WebView/host.|
|All|14 games, exact mechanics, boundaries|Plan consistent; no release side effects.|
- Root worklog is the progress ledger; no competing planning system.

## Progress / evidence
- Plan saved; private candidate branch created. Baseline npm test 61/61 pass (`artifacts/v2/baseline-escalated.log`).
- Pure rules for all eight games, recipient projections, bots, and language-neutral fixtures added in `src/engine/v2Games.ts`, `.test.ts`, and `src/engine/fixtures/v2-parity.json`; 28 focused tests and typecheck pass (`artifacts/v2/rules-report.md`).
- Web/Node and Cloudflare hosts now carry protocol V2, action/match/stage identity checks and acknowledgments, persisted shuffled game bag, projected state, V2 phase scheduling and bot actions. TDD rotation, engine, and Worker coverage added. Cloudflare typecheck and Worker core tests passed at earlier checkpoint.
- React V2 component and CSS implemented for all eight; isolated typecheck, build, and 96 server-rendered projections pass (`artifacts/v2/ui-report.md` pending). App wiring and real browser checks pending.
- Full npm test initially 61 pass/2 fail because old V1 lifecycle fixtures drew random V2 games. Those fixtures now pin V1 games; targeted live WebSocket suite 7/7 passes. Full suite must be rerun.
- All changes uncommitted on `codex/v2-games-web`; no deployment/merge/publication.

## Resumed 2026-10-26
- Recovered the approved implementation request from chat `01a17814-b5f8-7c22-a8a2-c1d5685b0ea0`; its interrupted run stopped during web verification, not planning. Preserve its uncommitted changes.
- App V2 view, candidate Worker name, CI filters and scripts were already wired. Fresh typecheck found the unfinished Cloudflare fixture widened its action union; fixed with `satisfies ClientMessage`.
- Fresh loopback-enabled run: 91/91 engine/client tests pass. Worker suite exposed another old V1 timing fixture selecting a random V2 duration; fixed by explicitly pinning its intended V1 game. Full `cf:verify` rerunning (`artifacts/v2/resumed-cf-verify.log`). Sandboxed socket EACCES is environment-only; local networking checks use approved escalation.
- Focused workers: isolated Kotlin rules staging in `artifacts/v2/android-port/`, browser controls/layout evidence in `artifacts/v2/browser/`, independent web review in `artifacts/v2/web-review.md`. No worker switches branches or edits shared tracked files.
- GitHub keyring authentication verified with network access; remote ref check pending. No push/merge/deploy/publication yet.

## Latest web milestone
- `npm run cf:verify` PASS: 92/92 engine/client, 18/18 Worker; production build, worker typecheck, dry run and actual local Wrangler/SQLite/WebSocket lifecycle/restart all pass (`artifacts/v2/resumed-cf-verify.log`). No provider deployment.
- Independent web review: four important findings fixed with RED→GREEN regressions: persisted logical start/deadlines/puzzles, varied Circuit route, catch-up before stage validation, visible V2 payout explanation. Focused suite 50/50 passed. No deferred reviewer findings.
- Browser: 32 game/viewport interactions pass; touch/mouse, roles, result/study transition, focus/reduced motion/orientation, >=44px targets/no horizontal overflow. Compact CSS fixes Mirror short-screen choices. Longer games/results can scroll; full App smoke ongoing (`artifacts/v2/browser/REPORT.md`).
- Version 2.0.0 set in package/lock; no dependency changes. V2 client action IDs use getRandomValues to support LAN HTTP as well as HTTPS/WebView. Typecheck/build rerun after that edit pass.
- Kotlin rules staged, 13/13 native JVM tests pass (8 shared traces, 104 state/312 projection comparisons); host integration staging ongoing. See `artifacts/v2/android-port/REPORT.md` and `artifacts/v2/android-host/`.

## Next exact action
Checkpoint/push web candidate and record exact-source CI, finish full App smoke, then create Android candidate from verified main. Apply only the V2 shared delta, preserving LAN routing/discovery/bridge; integrate staged Kotlin rules/host, test/build and record candidate provenance. No merge/deploy/publication or device installation.
