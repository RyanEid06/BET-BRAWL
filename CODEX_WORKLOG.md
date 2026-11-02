# BET & BRAWL V2.1 focused polish — in progress 2026-11-02

## Active objective / exact next action
User authorizes focused V2.1 gameplay polish, full shared/Worker/Android/browser verification, permanent-key signed APK, V2 code3 → V2.1 in-place update with data retained, green CI, then existing Cloudflare production deployment. No physical-device operations or uninstall/data reset. New version 2.1.0/code4, same com.betbrawl.app and pinned certificate. No persisted schema changes planned. User requests no progress commentary unless asked or input needed.

Start state: main at 0ba2e59, clean; one canonical worktree. v2-web is separate production branch; preserve main/v2-web/v1 arrangement. Plan: docs/superpowers/plans/2026-11-02-v2.1-polish.md. Next: implement paired TS/Kotlin randomized timing; focused UI/instructions/results/map regressions; check full suites; commit and CI; verify signed upgrade on owned emulator; port shared changes to v2-web and verify/deploy only after all gates. Keep previous V2 APK immutable as upgrade baseline.

## V2.1 implementation checkpoint
Focused TS/Kotlin timing, Quick Draw arena/one-shot/false-start clarity, dynamic Millisecond UI/countdown, full-world bounded pan/pinch/zoom with editable local draft then Lock, visible result errors/reasons, fighter-only reveal+betting instructions for all14 games implemented. No persisted Android schema/storage/package/signing changes. Existing web Millisecond checkpoints without new internal target retain fixed5-second scoring through explicit fallback+regression. Version2.1.0/code4. Independent Luna-high review found no important regressions; all later delegated work used Luna high at owner's request.

Observed local: typecheck PASS;115sharedtests PASS; browser32cases+11existinggroups+4viewportpolishmatrices+8mapgroups PASS, including actual CDP pinch/cancel and orientationclamp. Bundled build/sync PASS before final minor map guard/touch-target updates (CI will rebuild exact source). Snapshot screenshots in output/playwright; logs artifacts/v2.1-*.log. Local exact Android wrapper8.7 download stalled; portable Kotlin runtime attempted existingGradle9.3.1 withJDK17/21, both failed before task execution due Windows PipeImpl UnixDomainSockets invalid argument. No local Kotlin/Android pass claimed; require exact Linux CI. Existing owned API37 AVD running serialemulator-5580 (process2208), installed pinnedV2code3 still intact, not uninstalled/reset. New upgrade verifier scripts/android-upgrade-smoke.py syntax/help PASS with real Python313; actual signedupgrade still pending.

Next: commit/push main runtime, record exactCI, port sharedchanges to existingv2-web while CI runs; require build/nativeCI+webCIgreen, retrieve signedAPK, runupgradeverifier on5580 and native smoke, thenwebproductiondeploy. No physical device touched.

## Previous V2 release checkpoint

## Objective / result
Finished shared V2 fixes and Android-specific Back/IME/lifecycle/reconnect/foreground hosting/notification/LAN/deep-link review, permanent signing, verification and signed APK delivery. Existing React WebView/native authoritative Kotlin LAN architecture, protocol2, scoring and data compatibility retained. No PWA/iPhone scope or physical-device mutation. Owner authorized production pushes/deployment and exactly3branches; local and remote branches are now main (Android V2), v2-web (production web), v1 (history).

## Git / release provenance
Canonical checkout: C:/Users/Administrator/Desktop/Projects/BET-BRAWL; one worktree on main. Runtime/APK source c8a8ab0b845378e08536c4abaa78ea2b8b3b1531; final closure commit changes only this worklog and docs/ANDROID_V2_RELEASE.md. The documentation-only commit uses [skip ci] because all runtime gates passed at the immutable APK source; no runtime or test change follows that source. Checkout is intended clean after sealing/pushing these documents.

Preserved v1 exactly2ee6d66f4ecd49a66bf31530413919d550055f11. V1 tags remain v1.0.0-pre-v2-main (2ee6d66), v1.0.0-production-web (a60a79d), v1.0.0-web-final (e1f948c). Four aliases codex/v2-games-android, codex/v2-games-web, v1-web-cloudflare-ready and v1-web-final were deleted locally/remotely only after both release CIs were green, exact remote tips matched, and ancestry proved every tip retained. Evidence artifacts/v2/android-final-branch-retention.json. No history rewrite or force push.

## Delivered Android APK
artifacts/releases/BET-BRAWL-V2-2.0.0-code3.apk —5,206,966bytes. SHA256 dc7778c4746acfba706d872a6a55a5a49dc051ecb465475cc58a64436d3681df. Matching .sha256 and .verification.json accompany it. Package com.betbrawl.app; version2.0.0/code3; minimum Android7.0/API24; target/compile Android15/API35; non-debuggable, APKv2 signature verified.

Permanent RSA4096 certificate SHA256222a2459a560c966ab30ebc7a03d60008a5614692e84e726b7f1568f60caef51 matches app/release-signing.sha256. Protected local store is C:/Users/Administrator/.android/bet-brawl-release with DPAPI credentials. Owner explicitly authorized the4encrypted signing secrets in RyanEid06/BET-BRAWL. No secret values exported to Git/logs/artifacts; release fails closed without signing. Preserve this identity for updates; future versionCode must exceed3.

## Changes / decisions
- Circuit immediate reconciled rotations; Treasure direct controls/presets with unchanged10-energy scoring; compact payout/details and reachable next action; Mirror5x(4s choice+1s reveal)=25s native/TS authority and fixtures; scoped stale-action filtering; Memory reconnect draft/undo; separate deadline clock; Territory identities/weighted scores; visible V2 label and corrected production docs.
- Android Back hides IME, confirms explicit leave/cancel and minimizes at entry. Socket generations, healthy/silent resume checks, validated persisted LAN seat restoration and warm links retained. Connected-device foreground hosting starts before optional notification permission; denial does not block hosting; return/Stop notification and fullscreen restoration supported. API29 foreground-type guard and API33 manifest lint annotation preserve minimum24.
- Explicit leave now clears stale networkInfo so the entry screen does not reopen the closed room join form. Browser regression observed RED then GREEN. Driver corrections handle curly apostrophe, nearest clickable node, zero-area/offscreen controls and exact cleanup action.

## Observed verification
Exact-source Android CI41409082650 SUCCESS: https://github.com/RyanEid06/BET-BRAWL/actions/runs/41409082650 (verify-and-build125157727444; startup-and-native-smoke125159538454).
- Shared typecheck106tests/build/Android asset sync PASS; native Kotlin/server/parity77tests0failures0ignored.
- Debug/release lint each0errors14nonblockingwarnings; debug and permanently signed release builds PASS. Browser32cases0issues/console errors;11regressiongroups PASS.
- CI API36: debug3coldlaunches +signed release3coldlaunches PASS; full native smoke PASS.
- Exact downloaded signed APK locally installed only in task-owned API37 emulator5580:3coldlaunches and full native smoke PASS, including denied notification foreground hosting, native3-player same-seat reconnect, Back cancellation, HOME continuity, production-timed payout/next round, explicit host room closure and forward removal.
- Independent APK helper verified exact hash against CI, pinned release certificate, package/version/min-target/debuggability; debug/release bundled assets identical; CI/local JavaScript/CSS byte-identical and HTML equal except blank lines. Evidence artifacts/v2/android-final-c8a8ab0/verification.json, reports/, native-ci/, api37-startup/, api37-native/. Reproduction helper artifacts/v2/verify_production_apks.py uses existing real Python/JDK/SDK; no extra Android tooling installed.

## Web production / recovery
v2-web108d4b645009d31676edbe9470e7f785e00b420a; deployed source00b0572, Worker bet-brawl, https://bet-brawl.northstack-labs.workers.dev, version d349b03e-b847-4f13-a6b9-445c0c639230. Existing SQLite namespace retained. Web CI41310979378 SUCCESS;98shared+20Worker tests,32browser cases+8groups and public3-client two-game/reconnect/payout/next smoke12accepted/0rejected passed. 2026-11-02 public assets still match the verified V2 hashes (production-resume-integrity.json). V1 Cloudflare version e95923d1-b1e4-4566-9b90-c1cf2fddb49b recoverable. No unchanged redeployment was performed.

## Useful failed approaches / cleanup
Earlier exact CI failures were missing import, apksigner tool-label spelling, curly notification label, then stale-entry cleanup; all corrected and superseded by green41409082650. API37 service dump confirmed actual foreground state; no speculative service-order/parser rewrite was needed. Sandboxed local server tests could not run correctly; full106tests passed after rerun with local socket access. Only task synthetic emulator app data was reset. No other emulator/physical device touched.

Removed this session's disposable11MBraw logcat and duplicate initial signature report; retained signed deliverables, compact evidence, test environment and useful failure records. Owned Vite stopped; host room/adb forward cleaned by passing UI flow; owned emulator5580 stopped. Owner explicitly approved the exact10-minute continuation after earlier auto-review rejections; heartbeat finish-bet-brawl-android-release was deleted successfully at closure. No periodic task remains.

## Remaining acceptance / next action
Implementation and automated release work are complete. Owner follow-up: test3+physical phones on the same Wi-Fi for real-router NSD/UDP discovery, QR/deep-link joining, OEM battery/screen-off hosting, gesture navigation, audio and mixed phone/tablet play. Emulator/CI does not establish these hardware results. Older debug APKs use another certificate and cannot update in place; owner controls any backup/replacement on physical phones. See docs/ANDROID_V2_RELEASE.md and docs/ANDROID_SIGNING.md. No further automatic action is scheduled.
