# BET & BRAWL V1 release checkpoint

## Objective and owner constraints
- Execute `docs/V1_RELEASE_BRIEF.md`, with the owner's 2026-10-20 correction taking precedence: Android code/shared rules/tests/lint/builds with EXISTING tools only; NO ADB, emulator, installs, physical LAN/QR/deep-link testing or extra Android tooling. Cloudflare code/config/tests/build/typecheck/dry-run + exact deploy commands; live deployment/manual acceptance are USER FOLLOW-UP, not coding-task blockers.
- `main` = bundled React UI + Kotlin authoritative Android phone/LAN. `v1-web-cloudflare-ready` = online Worker + one SQLite Durable Object per room. Preserve immutable V1 rules and production timing.
- Keep `v1-web-final` untouched until separate explicit deletion approval. Never expose signing/auth secrets, lose unique work or rewrite shared history.

## Current stage
Implementation and fresh review fixes complete; final local gates running/observed below. Next: commit source changes, push both maintained branches, inspect exact CI jobs, resolve any real lint/build failure, finish evidence/docs and clean temporary worktree.

## Repository / Git topology
- Canonical: `C:/Users/Administrator/Desktop/Projects/BET-BRAWL`, branch `main`, base `origin/main=9ac170b`; local infrastructure commit `6c727fb` plus current source/docs changes.
- Temporary managed external worktree: `C:/Users/Administrator/.codex/worktrees/brawl-cloudflare/BET-BRAWL`, branch `v1-web-cloudflare-ready`, base `9aa66f1`. No nested clone remains.
- Original root was stale Node/web `e1f948c`; nested `BET-BRAWL-Cloudflare/` was a separate clean clone (not a worktree), no uncommitted/ignored/stashed or fsck-unique work. Imported and verified every nested ref in canonical Git before deletion; root main fast-forwarded to existing Android upstream.
- Historical ZIP: all 40 entries byte/hash-identical to frozen `e1f948c`; current upstream already removed it. No unique archive content discarded. Original frozen branch and tag `v1.0.0-web-final` unchanged.
- Windows git/gh keyring works outside sandbox; remote `https://github.com/RyanEid06/BET-BRAWL.git`. Do not use GitHub connector. Secret-name list was empty; no signing identity created.
- `.gitignore` covers dependencies/builds/SQLite/dev vars/secrets/APKs/ZIPs/tests; generated Android WebView assets untracked and rebuilt by CI.

## Completed source changes
- Kotlin: exact qualifier match owner/idempotency; serialized mutation/timer transitions; round identity/deadlines; host grace kept independent; stale socket authority/rejoins; offline-next-round fighter grace; frozen roster rankings; compile-error repair; Higher/Lower Int-key reveal crash; disconnected-seat KICK null safety; stale-seat expiry when a tournament restarts.
- Native shell: HostService publishes ready only after bind success, visible startup failure, main-thread shutdown; Activity restores bundled WebView and uses singleTop warm intents; strict deep-link/IPv4/port/duplicate-query parsing; discovery sockets close on cancellation and NSD liveness persists until loss. Notification updates respect Android13 permission.
- TS shared helper `applyQualifierMatchResolution(sched,players,roundNumber,fighterIds,winnerId,isTie,reason):boolean` completes only the exact scheduled qualifier once, including VOID without fighter statistics. Used by both maintained Node references and Worker.
- Cloud Worker: revoked replacement attachments/current-open ownership; repeated JOIN cannot orphan seats; offline fighter grace; roster-only finalists/third; strict deadlines (no 10ms early tolerance); close handshake completion; stale lobby cleanup after restart.
- Cloud UI: explicit cloud/LAN mode, neutral loading copy, online wording/public QR links, URL parameter replacement, old socket/QR result guards. Android retains same-Wi-Fi/offline copy.
- Fresh independent review: Important disconnected-seat KICK crash and debug solo-tournament rule violation both addressed with observed RED→GREEN. Minimum 3 applies even in debug; debug bots remain available. Old two-player host-grace fixture updated to3 real ready players and still verifies grace survives resolution.

## Observed local verification
- Frozen untouched source `e1f948c`: typecheck,52/52 tests, production build PASS (`artifacts/frozen-baseline.log`); original `npm ci` fails missing optional-platform lock entries. Maintained branches repair locks; frozen unchanged.
- Main `npm ci`:184 packages, zero reported vulnerabilities. `npm run verify`: typecheck,64/64 TS tests, production frontend build+sync PASS (`artifacts/android-final-verify.log`, latest handle39012 completed0). Bundled assets previously hash-matched dist3/3 files; final recheck at closure.
- Kotlin via EXISTING cached compiler2.2.10 with language/API1.9,JVM17 + JUnit:51/51 PASS (`artifacts/android-kotlin-final.log`, latest handle99013 completed0). Includes20 real JSON-handler protocol tests,22 tournament tests,7 security/helper tests,2 join-target tests; virtual time, no device/transport runtime claims.
- Kotlin RED evidence: initial42/7 failures (`build/kotlin-jvm/red.log`); offline pre-start roster48/1; disconnected KICK51/1 (`artifacts/android-kick-red.log`); restart cleanup51/1 (`artifacts/android-restart-red.log`), then51/51.
- Main TS new malformed-IP/unsafe-QR/query tests3RED→8/8 focused GREEN. Debug-minimum Node fixture RED then2/2 GREEN; host-grace test corrected under invariant and isolated PASS.
- Cloud `npm ci`:213 packages, zero reported vulnerabilities. Worker14/14 PASS after final debug/restart fixes. Earlier complete cf:verify PASS with TS57/Worker12/full local runtime; final current code `npm run cf:verify` handle1331 completed0:58/58 TS,14/14 Worker, build/typechecks/dry-run and all actual-runtime scenarios PASS. Evidence `artifacts/cloud-final-verify.log` in external worktree. Prior failed full gate diagnosed as obsolete2-player host-grace fixture, fixed; do not report that failed run as final green.
- Actual Wrangler suite already proved full3qualifier progression + championship2–1 with tie, VOID/refunds, reconnect/isolation/authority/capacity, roster parity, and runtime restart preserving podium AND active deadline/bets. Latest full gate must pass before commit.
- Current dry-run config verified with pinned Wrangler4.151.1, BrawlRoom SQLite export +ASSETS; observability logs/traces enabled; no production test vars, no deploy.

## Local Android environment / CI
- SDK35 absent (only37.0 installed), wrapper8.7 download stalled and stopped; cached Gradle8.14.3 cannot establish its daemon loopback even outside sandbox. No tooling installed. Pure Kotlin fallback uses existing compiler/JDK and existing SDK jar as stubs; reusable optional JVM harness `scripts/kotlin-tests` config not locally executed successfully.
- Android lint/APKs will be checked by GitHub Actions using the repository's existing workflow/tool setup. Do not call local lint/build PASS.
- Prior exact Android CI39138709254 failed stale committed generated asset diff; now assets generated/ignored. Prior Cloud CI39401613473 failed obsolete BrawlRoom test type. Updated cloud PR target to maintained cloud branch; neither workflow deploys.
- Android CI now always checks unit/lint/debug/unsigned-release, signs only when all established secrets exist, uploads artifacts and reports. No CI source push yet in this checkpoint.

## Decisions and next action
- Ruling: root worklog is the sole plan/ledger, per owner; no competing plan system. Existing canonical brief retained.
- Ruling: preserve current declarative SQLite `exports` (verified installed schema/current Cloudflare docs), not older migrations sample.
- Ruling: no debug minimum exception; immutable3–9/two distinct opponents also holds for debug rooms. Existing normal-game and host-grace assertions preserved.
- Auto-review rejected wholesale root-to-cloud file copy; used inspected, narrow per-branch edits instead. No blocked action remains.
- No frozen branch retirement yet; manual modern-target acceptance and final uniqueness comparison still required before any deletion confirmation.
- NEXT: poll cloud handle1331, commit/push source on both active branches, inspect exact-head CI (no duplicate runs); write final9-section report and cleanup only proven disposable outputs.

- Final local gates complete: main verify64/64 TS plus build/sync; Kotlin51/51 after restart/KICK fixes; cloud full cf:verify58/58 TS+14/14 Worker+actual Wrangler suite PASS. Initial combined commit/push auto-review rejected shared-main push for perceived missing authorization; task brief explicitly says push finished commits if credentials permit. Preserve local commits, then provide exact authorization/evidence for narrowly scoped push review.
