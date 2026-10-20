# BET & BRAWL V1 release checkpoint

## Objective and scope
Complete docs/V1_RELEASE_BRIEF.md under the owner's correction: Android code/shared rules/tests/lint/builds using existing tools only; NO ADB/emulator/install/physical tests/extra Android tooling. Cloud code/config/tests/typechecks/build/dry-run and exact deploy commands; live authentication/deployment and manual public/Android acceptance are USER FOLLOW-UP. Owner sequencing: web handoff first, then Android closure. Preserve frozen v1-web-final until personal acceptance and separate explicit deletion authorization. Original brief explicitly permits pushing finished commits.

## Current stage
Implementation and both source CIs GREEN. Web readiness/deploy command handed off; Android CI APKs downloaded/independently verified. Code and documentation are complete. Documentation-head CI and managed-worktree archive are checked at final closure; final heads/run IDs and clean-state snapshot are recorded locally in artifacts/v1-closure.json. Detailed nine-section evidence: V1_RELEASE_REPORT.md.

## Git/topology
- Canonical C:/Users/Administrator/Desktop/Projects/BET-BRAWL, branch main; verified source83d3cdf6bdeab20e6e6db3ec534697755bc52779, pushed. Prior source833a67d/hygiene6c727fb retained.
- Temporary managed Cloud worktree C:/Users/Administrator/.codex/worktrees/brawl-cloudflare/BET-BRAWL; v1-web-cloudflare-ready verified sourcec910cb909920bfa9a4dbd90655219917b9ff07e7, pushed; prior9b72160 CI also green.
- Nested clone removed after every ref imported/object verified and no unique dirty/ignored/stash work. Historical ZIP40/40 equal frozen. One canonical Git database. Skill junctions retained. Generated assets/builds/secrets/SQLite/APKs/ZIPs ignored, not committed.
- Frozen v1-web-final=e1f948c6c6e46355435fd70ea9ab8ee63031ebea, existing v1.0.0-web-final tag target identical. Ancestor of Cloud target, no unique commits. NEVER delete without fresh owner confirmation. No force push/history rewrite/new signing identity. fsck no corruption, harmless dangling tree retained.

## Implementation/decisions
- Exact round/idempotent qualifier helper sole completion owner (previous Q1 pre-mark caused Q2 double completion); VOID stats invariant. Shared TS engine/catalog/odds/Node reference/recap sources match between verified branches.
- Native server serialized callbacks/timers/identity/deadlines; independent host grace; socket ownership; offline-next-fighter grace; roster-only rankings; Higher/Lower key crash; disconnected KICK and restarted-lobby expiry. HostService bind/readiness/error/permission, Activity restoration, strict join parsing, discovery lifecycle repaired.
- Worker attachment revocation/current-open ownership/repeated seats, exact deadlines/early actions, close handshake, offline fighters/roster/expiry fixed. Current declarative SQLite exports retained (verified pinnedWrangler4.151.1 schema); production timings unchanged.
- Minimum3 even debug, no solo fallback. Existing host-grace test now3 real ready players with assertions preserved. Runtime readiness fixture requires actual intended players rather than vacuous old snapshot. UI cloud/LAN signal, online QR/copy, stale socket/QR guards; championship/VOID recap correctness.

## Observed evidence
- Cloud sourceCI39483447180 SUCCESS https://github.com/RyanEid06/BET-BRAWL/actions/runs/39483447180 . Clean install,60TS+14Worker,typechecks/build/dry-run/full actual Wrangler/SQLite multiplayer and restart/deadline/bet recovery PASS. Canonical artifacts/cloudflare-c910cb9-verify.log and cloudflare-c910cb9-ci.log.
- Android sourceCI39483279215 SUCCESS https://github.com/RyanEid06/BET-BRAWL/actions/runs/39483279215 .66TS,typecheck/build/sync;51Kotlin;lint0errors/14warnings;debug/release assembly PASS. reports/tests confirms51/0/0. Local separated compiler modules51/51 (artifacts/android-separated-final.log); main verify66/66 (artifacts/android-final-verify.log). Local dist/bundled3/3 hash match.
- APKs canonical artifacts/android-v1/83d3cdf/apks/debug/app-debug.apk and release/app-release-unsigned.apk. Metadata com.betbrawl.app1.0.0/code1,min24/target35; debug signature verifies; release unsigned confirmed; both bundled asset sets3/3 identical. Exact hashes/bytes recorded verification.json and release report. No signing secrets; no key created. No installation/device/public deployment evidence claimed.
- Frozen source52tests/typecheck/build PASS with repaired installed dependencies, original lock missing platform entries (artifacts/frozen-baseline.log). Frozen untouched; exported scratch source removed only after audited manifest equality, external evidence preserved.

## Useful failures/environment
- Android833a67d CI39480706652 failed nullable smart casts across separate production/test modules; local co-compilation initially masked this. Split runner reproduces RED; explicit test assertions fixed,51/51 +native CI GREEN.
- Local SDK35 absent (only37 installed); wrapper8.7 download stalled and stopped exact task, cached8.14.3 daemon loopback unusable. No local Android tooling added. Existing compiler2.2.10 language/API1.9/JDK17 tests +CI provide evidence, not local Gradle/lint claim.
- Auto-review rejected whole-file cross-branch copy, unknown scratch delete and ambiguous shared-main push. Resolved with narrow edits, exact manifest audit and original explicit push authorization. No blocked action remains.

## Next action
Owner: deploy the verified web branch with README commands and manually test public HTTPS/WSS/QR/multiplayer; manually test Android using the verified debug APK; supply the established signing identity if a signed release is desired. Frozen retirement remains NO until personal acceptance and separate explicit confirmation. Final agent closure checks the documentation-head Actions, preserves artifacts, archives the temporary managed checkout and records local artifacts/v1-closure.json; no further product code is planned.

## Final boundary follow-up
Cloud documentation CI39484678029 exposed a zero-millisecond STOP treated as DNF. TS and Kotlin deterministic regressions both observed RED (native52tests/1failure); timeout now uses recorded action flags on both platforms. Shared Node tie fixture no longer assumes sub5ms delivery. Cloud full local cf:verify61TS+14Worker/all runtime PASS, source51a7adf pushed and exactCI39485599127 SUCCESS. Main shared verify67TS/typecheck/build/sync PASS. Native52-test GREEN compilation running next, then push main/CI/new APKs. Canonical checkout only; archived worktree restore missing snapshot, but all pushed source refs intact; no source lost. Prior artifacts83d3cdf are historical, must obtain final boundary source APKs.

Native boundary follow-up GREEN: separated production/test modules52/52 PASS (artifacts/android-zero-stop-green.log), shared main67TS/typecheck/build/sync PASS. Final maintained source includes action-flag timeout semantics and matching regression; no rule/timing change. Commit/push main, let exact CI run lint/build, download fresh artifacts into artifacts/android-v1/final (earlier83d3cdf historical only), independently inspect/hash them and update artifacts/v1-closure.json. Cloud source51a7adf exactCI39485599127 is GREEN. Final docs/refs cleanup must remain source-free; frozen preserved.
