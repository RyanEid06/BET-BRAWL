# BET & BRAWL V1 release report

2026-10-20. **GREEN** for the owner's corrected coding scope. Code, automated gates and CI builds pass. Cloudflare deployment/public acceptance and Android physical acceptance are USER FOLLOW-UP. No emulator, ADB, installation or extra Android tooling was used.

## 1. Repository cleanup

Canonical repository: `C:/Users/Administrator/Desktop/Projects/BET-BRAWL`. The nested `BET-BRAWL-Cloudflare/` was a clean independent clone. All refs were imported and objects verified before removing it; no unique local/ignored/stashed work existed. All 40 historical ZIP entries matched frozen Git blobs; the modern branches' existing ZIP removal was retained. No history rewrite, forced push, branch deletion or new signing identity.

Maintained targets are `main` (Android/LAN) and `v1-web-cloudflare-ready` (online web). Generated WebView assets, dependencies, builds, APKs/ZIPs, local SQLite, environment and signing files are ignored. Temporary managed Cloud worktree is outside the root and is archived at final closure after preserving useful logs in canonical `artifacts/`. `git fsck` found no corrupt objects; one harmless dangling tree was preserved. Skill junctions are retained.

## 2. Cloudflare web

Verified source: `v1-web-cloudflare-ready` at `51a7adf6af295a868760c37cc94ea5788797d774`. This contains the frozen web branch's complete reachable history; there are no frozen-only commits to merge. One Worker serves React/Vite assets and routes each room to an authoritative SQLite Durable Object over HTTPS/WSS.

Important changes: exact-round/idempotent qualifier resolution, revoked replacement-socket authority, duplicate-seat protection, offline next-fighter grace, frozen-roster rankings, strict deadlines, close handshake, minimum three even in debug, restarted-lobby expiry. Cloud/LAN mode, online copy/public QR URLs, stale socket/QR guards and championship/VOID recap wording corrected. Files include `worker/BrawlRoom.ts`, shared `src/engine/roomEngine.ts`, `server.ts`, `src/App.tsx`, recap component/tests, network helpers, `wrangler.jsonc`, locked package configuration and runtime tests.

PASS: clean install, 61 TS tests, 14 Worker tests, frontend/Worker typechecks, production build, Wrangler4.151.1 dry-run, actual local Worker/SQLite multiplayer tests and full `npm run cf:verify`. Runtime coverage includes all qualifiers, championship2–1 with a tie, private bets/deadlines/refunds/VOID, reconnect/authority/capacity/isolation, excluded nonparticipants, podium and process restart recovering active deadlines/bets. A readiness fixture race was fixed by waiting for every known participant, preserving all assertions.

[Exact source CI39485599127](https://github.com/RyanEid06/BET-BRAWL/actions/runs/39485599127): SUCCESS. Local and CI evidence: `artifacts/cloudflare-zero-stop-verify.log`, `artifacts/cloudflare-51a7adf-ci.log`. No live deployment, public URL or public smoke result is claimed.

From the canonical root after switching to the web branch:

```powershell
git switch v1-web-cloudflare-ready
npm ci
npm run cf:verify
npm exec wrangler whoami
# Only if authentication is needed, complete this interactive command:
npm exec wrangler login
npm run cf:deploy
```

Use the existing Cloudflare account/configuration. Owner then checks public HTTPS/WSS, QR and three clients across networks. Do not configure the test-only timing variable in production.

## 3. Android

Final Android source is the main branch head that includes the zero-time STOP boundary correction below; its exact head/run are recorded in canonical `artifacts/v1-closure.json` and the final handoff. Earlier fully verified candidate83d3cdf remains preserved as historical evidence. The original qualifier bug pre-marked Q1 completed, then the helper selected Q2 and completed it too. The helper now owns one exact scheduled qualifier identity and rejects replay; VOID completes that match without fighter statistics.

Kotlin fixes cover serialized callbacks/timers, round identity/deadlines, independent host grace, replacement ownership, offline next-fighter grace, frozen-roster rankings, Higher/Lower reveal-key crash, zero-time STOP/DNF misclassification, disconnected-seat kick and restarted-lobby cleanup. HostService announces readiness only after bind success, surfaces errors and handles notification permission; Activity restore/warm intents, strict deep-link/IPv4/port parsing, NSD liveness and UDP cancellation repaired. Shared recap handles championship ties/first wins and VOID accurately. Important files: Kotlin server/RoomEngine/HostService, MainActivity, join/discovery helpers, ServerProtocolTest and shared engine/UI tests.

PASS: 67 TS tests/typecheck/frontend build+sync; 52 Kotlin tests with production and tests compiled separately; GitHub Android lint and debug/release assembly. Twenty Kotlin protocol tests exercise actual JSON handlers/serialization, full qualifiers and championship2–1 with tie, VOID/refunds/deadlines/reconnect/authority/graces. CI test report:52 tests,0 failures,0 ignored. Lint:0 errors,14 warnings (API/dependency advisories, LAN cleartext policy, backup/icon/unused-resource suggestions). No warning suppression or dependency upgrades added to force green.

Local SDK35 is absent and existing Gradle launcher was unusable; CI supplied build/lint proof using the repository workflow. No extra local Android tooling installed. [Earlier candidate CI39483279215](https://github.com/RyanEid06/BET-BRAWL/actions/runs/39483279215): SUCCESS with51 Kotlin tests. Final boundary-source CI and APK verification are recorded in canonical `artifacts/v1-closure.json`; current main Actions must pass before final handoff.

Final Android artifacts, relative to canonical root:

- Debug APK: `artifacts/android-v1/final/apks/debug/app-debug.apk`.
- Unsigned release APK: `artifacts/android-v1/final/apks/release/app-release-unsigned.apk`.
- Exact source/run, SHA-256 hashes, byte sizes, signing/metadata/test/lint verification: `artifacts/android-v1/final/verification.json`; downloaded `ci.log` and `reports/` alongside it. Earlier83d3cdf artifacts remain historical evidence only.

Final artifacts are checked before handoff: com.betbrawl.app,1.0.0/code1,minSdk24,target/compileSdk35; three identical bundled web assets between debug/release. Debug signature must verify with Android Debug certificate. Release is explicitly unsigned; apksigner rejection is expected. No established signing secrets were available and no new key was created. No emulator/device/transport/LAN/QR/deep-link manual PASS is claimed.

## 4. Cross-platform parity

Preserved on both targets:3–9 players; two qualifiers versus distinct opponents; win/tie/loss3/1/0; deterministic five-level ranking; locked top two; first-to-two decisive championship wins; tie/VOID non-wins; invariant championship qualifier statistics; private betting/refunds; authoritative deadlines/reconnect ownership; champion/runner-up/best-ranked non-finalist podium. Debug also requires three players. Exact shared engine/catalog/odds/Node reference/recap files compare identical between verified heads.

Intentional difference: Cloudflare internet Worker/DO rooms versus Android Kotlin host on local Wi-Fi/LAN with bundled UI. CI/JVM/runtime tests are automated evidence; hardware and public deployment remain separate acceptance.

## 5. CI

Cloud `.github/workflows/ci.yml`: maintained branch/PR target, clean install, complete cf:verify. Android `.github/workflows/android-ci.yml`: locked install, TS tests, generated UI sync, Kotlin tests/lint/debug/release, optional established signing, APK/report uploads. Neither workflow deploys. Both verified source runs linked above succeeded. Earlier Android833a67d failed cross-module nullable smart casts in tests; fixed, reproduced RED locally with separated compilation, then51/51 GREEN and successful native CI. Historical failed runs are not presented as current proof.

Cloud final boundary source51a7adf passed CI39485599127. Cloud documentation rerun6666e3f previously failed a Node championship expectation; deterministic regressions proved STOP at exactly0ms was treated as DNF in both engines. Both now use recorded STOP flags; TS regression and full local67-test main/61-test Cloud gates pass, and native regression observed RED52/1 before the matching fix. The final main commit contains this correction, its52-test coverage and this report. Final CI/artifact result lives in canonical artifacts/v1-closure.json and final handoff; earlier artifacts/results remain historical.

## 6. Documentation

README, V1_STATUS, this report and CODEX_WORKLOG explain the correct architecture and user follow-up. Cloud verification/migration/deploy docs and UI metadata corrected. Original brief retained at `docs/V1_RELEASE_BRIEF.md`; later scope correction is recorded in worklogs. Removed stale Node-only counts, AI Studio/container build claims and unperformed physical acceptance claims. Frozen historical documentation remains untouched in its branch/tag.

## 7. Remaining blockers and user follow-up

No coding-scope blocker. Owner handles Cloudflare authentication/deployment/public HTTPS/WSS/QR/multi-client acceptance, Android physical/LAN/QR/deep-link acceptance, and established release signing if a signed production APK is wanted. The debug APK is available for manual testing. These manual items are USER FOLLOW-UP and do not block this coding task.

## 8. V1 verdict

**GREEN** — implementation, reconciled game rules, automated tests, lint, CI builds/APKs and Cloudflare dry-run passed under the corrected scope. This does not claim signed-production, live-provider or physical-device acceptance.

## 9. Old branch retirement

`v1-web-final safe to retire: NO` pending the owner's personal acceptance of both replacements and separate explicit deletion confirmation. Frozen SHA `e1f948c6c6e46355435fd70ea9ab8ee63031ebea` equals existing annotated tag `v1.0.0-web-final` target. It is an ancestor of the verified web replacement with no frozen-only commits. Frozen source typecheck/52 tests/build passed using repaired installed dependencies; frozen original lock lacks platform entries. No branch/tag deletion or unnecessary new tag was performed.
