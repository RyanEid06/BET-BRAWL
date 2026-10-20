# BET & BRAWL V1 release checkpoint

## Objective and constraints
- Execute the final-release brief in `docs/V1_RELEASE_BRIEF.md` (source: supplied attachment).
- Maintain `main` as Android/Kotlin authoritative LAN V1 and `v1-web-cloudflare-ready` as Worker/SQLite Durable Object online V1. Preserve game-rule parity and production timing.
- Keep `v1-web-final` untouched; deletion requires a separate explicit owner confirmation after all replacement gates pass.
- Preserve unique nested/archive work before cleanup; never expose credentials or rewrite shared history.

## Current stage: repository topology and baseline
- Scope correction (owner, 2026-10-20): Android automated code/tests/lint/builds only using existing tools; NO ADB, emulator, installs or physical/LAN/QR/deep-link runtime testing. Cloud deployment-ready code/config/tests/build/typecheck/dry-run and exact commands; interactive login/live deployment/public smoke are USER FOLLOW-UP, not coding-task release blockers.
- Canonical root: `C:/Users/Administrator/Desktop/Projects/BET-BRAWL`.
- Root `main` is stale at `e1f948c`, equal to frozen `v1-web-final` and tag `v1.0.0-web-final`.
- Nested `BET-BRAWL-Cloudflare/` is a separate clean clone, not a worktree. Its checked-out Cloudflare branch is `9aa66f1`; its `origin/main` contains Android at `9ac170b`. No nested stash or uncommitted files observed.
- Root has a tracked historical `BET-BRAWL-v1.0.0.zip`; content comparison pending. `.agents/skills` entries are local skill links, not application copies.
- No previous worklog existed. Initial root dirty state: only untracked nested clone.
- Root and nested remotes point to `https://github.com/RyanEid06/BET-BRAWL.git`.
- Initial sandbox remote check failed DNS and reported invalid gh authentication; an unsandboxed verification is pending, so authentication is not yet classified as missing.

## Execution plan
1. Finish topology audit: compare every ZIP entry and nested Git refs/files; import reachable refs into canonical Git; verify live remote; safely remove/move only proven duplicates. Baseline frozen tests without modifying its branch.
2. Audit Cloudflare shared qualifier resolution, production DO persistence/socket authority, UI mode/QR, actual runtime tests, and CI. Add failing regressions before fixes; run clean-install and every requested real Cloudflare command; deploy and public multi-client smoke if authenticated.
3. On current Android `main`, reproduce qualifier double completion through real Kotlin protocol; assign one completion owner and add full three-player championship/VOID/authority tests. Verify discovery, links, HostService, frontend asset sync, unit tests/lint/debug/release and signing using existing identity; smoke available authorized device.
4. Cross-check immutable game rules and preserved frozen behavior; correct branch documentation and hygiene, make logical commits, push if permitted, inspect exact-head CI.
5. Finish cleanup, produce `V1_RELEASE_REPORT.md` with exact evidence/limits and retirement verdict. Never call green without executed gates.

## Evidence and open work
- Inspected root status, branches, all-ref graph (100), remotes, worktrees, stashes, tracked files, tags, filesystem, packages, and old reports.
- Frozen reference: `e1f948c`; historical docs claim 52 tests, not yet rerun here.
- Topology completed: nested clean clone had no ignored/untracked work or fsck issues; every ref object was imported/verified in canonical Git before native PowerShell removal. All 40 ZIP entries hash-identical to frozen `e1f948c`; current Android upstream already removes ZIP, so fast-forwarding main to `9ac170b` removed it safely. Frozen ref/tag remain unchanged.
- Live GitHub refs verified: main `9ac170b`, cloud `9aa66f1`, frozen `e1f948c`. Windows keyring gh authentication works outside sandbox.
- One managed external worktree for parallel platform work: `C:/Users/Administrator/.codex/worktrees/brawl-cloudflare/BET-BRAWL`, branch `v1-web-cloudflare-ready`; canonical root on `main`.
- Frozen `npm ci` failed: original lock omits platform-specific optional dependencies (Windows oxide/esbuild/rolldown/TypeScript etc.). Repairing lock on maintained branches only. Baseline source tests still pending using repaired dependency installation; frozen branch will not be modified.
- Existing Android SDK and JDK17 found; baseline Gradle task running, no device tools used.
- Kotlin audit confirmed double completion (server marks Q1 then helper marks Q2), invalid helper declarations in GameEngine `when`, timer concurrency/host grace issues; focused agent owns server/engine/tests. Parent owns lifecycle/discovery/deep-link source fixes and CI/build/docs.
- Cloud audit found closing-socket authority, offline fighter grace, pre-start offline finalist and repeated-join issues; focused backend agent owns Worker/shared helper/runtime tests, UI agent owns mode/copy/QR/client. Parent owns locked Wrangler/config/CI/docs.
- Ruling: use this root worklog as canonical plan/ledger, as owner requests; no competing Superpowers planning files. Preserve current Cloudflare declarative SQLite `exports` (verified current docs), not older migrations sample.
- Next action: inspect baseline Gradle output, complete dependency installs, fix parent-owned Android lifecycle/discovery/deep-link and CI, then verify both branches.

## Milestone: topology complete, baselines and regression evidence
- Frozen `e1f948c`: `npm run verify` on untouched exported source passed typecheck, 52/52 tests, production build using repaired installed dependencies. Its original clean install fails due incomplete optional-platform lock entries; frozen branch remains unchanged. Evidence: `artifacts/frozen-baseline.log`.
- Maintained Android starting source: TS typecheck/build passed and tests 58/58 passed (`artifacts/android-ts-baseline.log`). Initial sandbox socket EACCES disappeared under authorized outside-sandbox test execution.
- Both maintained lockfiles repaired; Android `npm ci` 184 packages, Cloudflare `npm ci` 213 packages, both zero reported vulnerabilities. Cloud Wrangler is now pinned locally at 4.151.1 (previously npx downloaded each time).
- Kotlin RED via installed compiler/JUnit: 42 tests, 7 failures; confirmed Q1+Q2 double completion plus authority/grace bugs. Evidence `build/kotlin-jvm/red.log`. Agent fixing and extending actual protocol suite.
- Cloud RED: 24 helper/core tests, 7 expected failures, then GREEN 24/24 after exact-round helper/socket/roster/grace fixes. Full TS 57/57 passed. Actual Wrangler full tournament/restart suite still running.
- Android parent TS LAN validation: 3 added regressions failed for malformed IPs/unsafe guest links/ambiguous join endpoints, then passed 8/8 focused tests; typecheck passed. No device test performed.
- Parent source fixes: readiness-aware HostService, startup failure notification/Toast, Activity restore and singleTop warm intents, strict parser/IPv4/port/query validation, discovery socket cleanup/NSD lifecycle.
- Existing local Android tools do not support repository build as configured: SDK35 absent (only37.0), wrapper8.7 download stalled and was stopped. Cached Gradle8.14.3 could not create its loopback daemon. No SDK/tool install or ADB/emulator used. Pure Kotlin compile/JUnit uses existing compiler/JDK; Android lint/APKs will be verified by existing CI if possible.
- Prior Android CI39138709254 failed its stale committed generated asset diff; old Cloudflare CI39401613473 failed an obsolete BrawlRoom test type reference. Corrected generated asset tracking/workflow and cloud PR target; no auto deployment.
- Signing: GitHub secret names list is empty; no established release key has been found or created. Unsigned release build remains useful; signing/manual acceptance are owner follow-up.
