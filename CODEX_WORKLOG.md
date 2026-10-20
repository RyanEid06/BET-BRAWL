# BET & BRAWL V1 Cloudflare checkpoint

## Objective / owner constraints
Execute `docs/V1_RELEASE_BRIEF.md` with later owner correction: code/config/tests/build/typecheck/dry-run and exact deployment commands; live login/deploy/public smoke are USER FOLLOW-UP. Android uses existing tools only, no ADB/emulator/install/physical tests/extra tooling. Keep main Android/LAN and this branch Worker/SQLite DO online; preserve game rules/timing. Never delete frozen v1-web-final without separate explicit confirmation.

## Current state
- Canonical repository `C:/Users/Administrator/Desktop/Projects/BET-BRAWL`; this temporary managed external worktree is `C:/Users/Administrator/.codex/worktrees/brawl-cloudflare/BET-BRAWL`, branch v1-web-cloudflare-ready, base 9aa66f1, source changes ready for local commit.
- Main source committed 833a67d (plus hygiene 6c727fb) and pushed successfully after reviewer was shown explicit original user push instruction at brief line 1162. CI to be observed.
- Nested clone removed only after every ref imported/verified and clean/ignored/stash/fsck audit; historical ZIP 40/40 hash-identical to frozen, current upstream removal retained. Frozen e1f948c +tag v1.0.0-web-final untouched. One canonical Git database, no nested clone.

## Implemented
Exact round/idempotent shared qualifier helper (Node+Worker), VOID invariance, replacement attachment revocation/current-open ownership, repeated-seat protection, offline fighter grace, roster-only finalists/third, close handshake, exact deadlines without early tolerance, three-player minimum even debug, and disconnected lobby expiry after restart. UI has explicit cloud/LAN mode, neutral loading state, correct online copy/public URL QR and stale socket/QR guards. Production timers unchanged. Config retains current declarative SQLite export, adds logs/traces, pins local Wrangler 4.151.1; no deployment/test timing vars.

## Executed evidence
- Final npm ci: 213 packages, zero reported vulnerabilities.
- Final npm run cf:verify: PASS 58/58 TS tests, 14/14 Worker tests,typechecks,production build,Wrangler dry-run and actual local runtime. Log artifacts/cloud-final-verify.log; process 1331 terminal0.
- Real Wrangler: full 3qualifiers/championship 2–1/tie/podium, secret bets/deadlines, authority/min/max/reconnect/seat reuse, VOID/refund/stat invariance, offline-next-round forfeit, absent nonparticipant exclusion, room isolation, authenticated close, process restart/SQLite podium plus active deadline/bet recovery.
- RED→GREEN: original seven helper/socket/roster/grace failures; early deadline/action guard; debug minimum; restart lobby. Worker14/14 final pass in cloud-review-green.log.
- Main fresh observed 64/64 TS,typecheck,build/sync and 51/51 Kotlin via existing cachedcompiler/JUnit, including full actual JSON-handler protocol (not device/TCP acceptance). SDK 35 absent/Gradle daemon loopback unavailable; no Android tooling installed. CI will supply lint/APK evidence if possible; no signing secrets/key created.
- Fresh reviewer Important KICK crash and solo debug tournament fixed with regressions. Existing two-player Node host-grace fixture updated to three ready players; all original grace assertions preserved. Failed pre-correction runs are not final evidence.

## Decisions / safety
Use one root worklog per branch and original brief; no duplicate plan system. Keep current SQLite exports (installed schema/current docs verified). Debug minimum has no exception. Auto-review rejected whole-file cross-branch copies; all source edits narrowed to inspected regions. Reports were inspected and rewritten in place to preserve branch-specific truth; old evidence remains in Git.

## Next action
Commit this verified cloud source locally, push under original explicit brief authorization, inspect exact-head CI for both targets, resolve any real failure, finish 9-section report/current SHAs, preserve useful logs, archive temporary worktree, and return canonical root clean. Deployment/manual acceptance remain USER FOLLOW-UP; frozen retirement safe: NO until acceptance and owner approval.
