# V2 candidate verification

[Approved plan](superpowers/plans/2026-10-26-v2-games.md): 14 games, version2.0.0/protocol2, Android code2. Eight new games extend the six V1 games while preserving tournament, spectator betting, championship and bankroll behavior. Both variants remain reviewable candidates; no merge, deployment or public release.

## Verified sources and checks

| Candidate | Source | Exact-source CI | Observed checks |
|---|---|---|---|
| Online web, codex/v2-games-web | d20ccc4afd909818dfed88529c4fb8d776b8f508 | [40469684284](https://github.com/RyanEid06/BET-BRAWL/actions/runs/40469684284), SUCCESS | 96 shared tests,19 Worker tests, typechecks/build, Wrangler dry run and actual local SQLite/WebSocket tournament/restart suite |
| Android/LAN, codex/v2-games-android | 8b0fc98f0165317ccfcfeddfca183a9e887d7c39 | [40522679066](https://github.com/RyanEid06/BET-BRAWL/actions/runs/40522679066), SUCCESS | 103 shared tests,76 Gradle unit tests, lint0errors/14warnings, debug/release builds, three Android16 visible-home cold launches |

Earlier e186e15/f7ad2f9 builds passed compilation and unit checks but did not exercise Activity startup. The owner reported immediate launch failure on Honor X9d / Android16 / MagicOS10. The exact f7ad2f9 APK reproduced a fatal null DecorView in PhoneWindow.getInsetsController on the existing API37 emulator: MainActivity requested fullscreen before creating window content. Source f9ecbd8 moves that call after setContentView. Its process-only smoke passed but a visible-screen check exposed a second inherited defect: file-origin CORS blocked the bundled Vite modules and left home blank. That intermediate APK was withdrawn.

Source ac58281 loads the bundle through the existing AndroidX WebViewAssetLoader and an intercepted local HTTP appassets origin, preserving native LAN ws:// connections. File/content access is disabled and deep-link query parameters are preserved. The smoke now requires visible HOST NEW GAME text on every launch, dismisses Android's first-run fullscreen tip using UI-tree bounds, and waits up to 60s for WebView readiness. The one-shot checks in CI40512730087/40514936496 failed; their build jobs passed. Final test correction 8b0fc98 changes no app/runtime source from 500293c. Exact 500293c APK passed three fresh API37 cold launches and a native HostService/lobby UI flow; hash, screenshots, UI trees and app logs are retained in artifacts/v2/startup-crash/resumed-readiness-local/. Final 8b0fc98 CI passed three visible-home cold launches on Android16/API36. Its exact downloaded APK also passed three local API37 launches and the native HostService/lobby flow; installed hash matched the delivered APK. Evidence: startup-crash/ci-8b0fc98/ and final-8b0fc98-local/. Physical Honor verification remains separate.

## Authority, privacy and recovery

- All14 games enforce current match/stage/action identities at the network boundary, including stage0 for legacy games. Spectator/stale/invalid/late inputs reject; accepted effects deduplicate across reconnect and Worker persistence. Acknowledgments carry identities; invalid choices do not lock. Trusted pure-rule/bot APIs retain their decision objects.
- Host-owned puzzles, drafts, commitments, scores and deadlines project separately for each viewer. Memory study content disappears after4s, including reconnect. Safecracker history is private; repeated choices reveal only at deadlines. Secret-derived scores are hidden until permitted.
- Shuffled14-game bag spans qualifiers/championship, exhausts before refill, prevents adjacent refill repeats, resets with a new tournament, and persists online.
- Worker and Node delayed events retain published deadlines and generated puzzles, catch up stages chronologically, and settle once. Circuit routes vary and require changes to at least two tiles. New games use simultaneous/score-based outcomes rather than network arrival speed.
- Actual payout includes completed game explanations; forfeit/VOID uses the authoritative round outcome and suppresses a contradictory recomputed played result.
- Candidate Worker bet-brawl-v2-candidate isolates future V2 storage. Existing Android LAN discovery, native service, deep links and WebView routing remain intact. Native constructor callback compatibility and explicit territory-Pass null serialization are covered.

Canonical fixtures in src/engine/fixtures are consumed by TypeScript and Kotlin: eight complete action traces,104 full-state checkpoints and312 recipient projections. Local JVM production and test modules compile separately using existing JDK17/compiler2.2.10 language/API1.9. CI performs the required SDK35 Gradle checks; no local SDK/tooling installation.

## Browser evidence

The real React component passed32 game/viewport cases at360x640,390x844,768x1024,1366x768: touch/mouse, active/spectator/results, phase transitions, keyboard focus, reduced motion and orientation. Enabled targets remain at least44px, with no horizontal overflow. Mirror choices fit short phones; longer boards/results may scroll.

Actual App rooms used three browser clients plus a UI-added bot, including Memory/Safecracker and final legacy rapid_red_green +Memory protocol flows. Six final inputs carried scoped identities and matching accepted acknowledgments; legacy scores updated visibly, Memory study content disappeared, and payout explanations appeared. No browser errors. Insecure HTTP works using getRandomValues IDs. A simulated Android bridge exercised the actual native hostGame JavaScript path, including a reproduced/fixed missing-version rejection. This is browser-to-Node evidence, not physical native-service/device acceptance.

Reports, frame/role evidence and screenshots remain in artifacts/v2/browser/. Focused RED-to-GREEN logs cover review findings, legacy replay protection, delayed Node start, explicit nulls, callback compatibility and forfeit recaps. Whole-project logs: web-final-contract-verify.log, android-final-contract-verify.log, native-final-contract-green.log.

## APK handoff

Current directory: `artifacts/v2/android-candidate-8b0fc98/`. Independently verified package `com.betbrawl.app`, version `2.0.0`, code `2`, minimum SDK24, target SDK35; source 8b0fc98 / CI40522679066. Desktop installable file: `C:/Users/Administrator/Desktop/BET-BRAWL-V2-2.0.0-startup-fixed-8b0fc98.apk`.

| File | Bytes | SHA-256 | Signing |
|---|---:|---|---|
| `BET-BRAWL-V2-2.0.0-debug-8b0fc98.apk` | 6,482,621 | `6ab98089c6ce2085a14fb67cea1d551c50dc5f4e4f7e89893b0651fb671af273` | Android Debug certificate; APK v2 signature verifies |
| `BET-BRAWL-V2-2.0.0-release-unsigned-8b0fc98.apk` | 5,194,438 | `6b2c9bac7408dc4a1be12a04b62d0dc369d3fe64ea7e6a99cfb401422fc8135d` | Unsigned; established release identity required before installation |

Both APKs contain all eight new game IDs and byte-identical bundled assets (3/3). JavaScript/CSS match the verified local source build byte for byte; local HTML differs only by one blank line. Existing SDK aapt/apksigner logs and verification.json are retained beside the APKs; actual Gradle/lint reports are in artifacts/v2/android-ci-reports-8b0fc98/. The established release-signing CI step was skipped; no release signing key was created. CI artifact retention is14days; local copies remain. Earlier b012a74/f7ad2f9/f9ecbd8/500293c APKs are historical; f7ad2f9 has the reproduced startup crash and f9ecbd8 opens blank. The Desktop copy was verified byte for byte; desktop-delivery.json records the path/hash.

The corrected debug APK signer SHA256 is `8785b7cbc2fe59735ff244a2e9c2438295c85a03c254b7102c0cb337eeea2120`, different from the previous V2 CI debug signer. These ephemeral CI debug keys prevent in-place updates: replacing the earlier test installation requires owner uninstall (erases local app data). No automatic phone uninstall or new signing identity was performed; stable established signing is still needed for reliable future updates.

All seven implementation milestones are complete as reviewable candidates. Both branch updates are pushed independently. There is no product merge, deployment, publication or device acceptance claim.

## Acceptance boundary

Installation follow-up (2026-10-27): the owner reported a package-conflict installer error. Shipped V1 and V2 have the same package ID but different debug signing certificates, so this V2 APK cannot update that V1 in place. A fresh install requires uninstalling the previous app, which can erase local data. Keeping V1 requires a separately packaged V2 candidate; an in-place update requires the original installed app's signing key. No device uninstall or package/signing change was performed. Signature verification above proves APK validity, not compatibility with an existing installation.

Before release, play all14 games with three or more real participants on phone/PC. Check fighter/opponent/spectator privacy, reconnect during study/answer/commit/reveal, bets, qualifiers, championship ties, disconnect-forfeit and VOID refunds. Confirm timed-game scrolling and orientation are comfortable.

Public HTTPS/WSS deployment and physical Android LAN discovery/hosting/joining remain owner acceptance. Only isolated emulators were used; no physical device was installed, wiped or modified. Release signing requires the established identity; no signing key is created by this task. Candidate branches stay separate from V1 main/web/frozen refs. Merge, deployment, publication and frozen-branch retirement require separate authorization.
