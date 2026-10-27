# V2 candidate verification

[Approved plan](superpowers/plans/2026-10-26-v2-games.md): 14 games, version2.0.0/protocol2, Android code2. Eight new games extend the six V1 games while preserving tournament, spectator betting, championship and bankroll behavior. Both variants remain reviewable candidates; no merge, deployment or public release.

## Verified sources and checks

| Candidate | Source | Exact-source CI | Observed checks |
|---|---|---|---|
| Online web, codex/v2-games-web | d20ccc4afd909818dfed88529c4fb8d776b8f508 | [40469684284](https://github.com/RyanEid06/BET-BRAWL/actions/runs/40469684284), SUCCESS | 96 shared tests,19 Worker tests, typechecks/build, Wrangler dry run and actual local SQLite/WebSocket tournament/restart suite |
| Android/LAN, codex/v2-games-android | f7ad2f91160bd71197d51675409ac5f90f5332b6 | [40469773003](https://github.com/RyanEid06/BET-BRAWL/actions/runs/40469773003), SUCCESS | 103 shared tests,76 Gradle unit tests, lint0errors/14warnings, debug/release assembly |

The Android runtime at e186e15 also passed [CI40468986738](https://github.com/RyanEid06/BET-BRAWL/actions/runs/40468986738). The final f7ad2f9 checkpoint changes only the legacy Node timing fixture and worklog; the delivered APKs are from that final checkpoint. Final documentation commits follow these verified sources; runtime changes are checked to be empty.

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

Final directory: `artifacts/v2/android-candidate-f7ad2f9/`. Independently verified package `com.betbrawl.app`, version `2.0.0`, code `2`, minimum SDK24, target SDK35; source f7ad2f9 /CI40469773003.

| File | Bytes | SHA-256 | Signing |
|---|---:|---|---|
| `BET-BRAWL-V2-2.0.0-debug-f7ad2f9.apk` | 6,482,141 | `ea4cc72659935cc207dff08be8487da012640cf3a307e2d3d59d41cd4c4778f8` | Android Debug certificate; APK v2 signature verifies |
| `BET-BRAWL-V2-2.0.0-release-unsigned-f7ad2f9.apk` | 5,194,426 | `2aac354b45a798a99d91fe20fb93148fa3ae1cc0faf955ec6523f86bcf617a56` | Unsigned; established release identity required before installation |

Both APKs contain all eight new game IDs and byte-identical bundled assets (3/3). JavaScript/CSS match the verified local source build byte for byte; local HTML differs only by one blank line. Existing SDK aapt/apksigner logs and verification.json are retained beside the APKs; actual Gradle/lint reports are in artifacts/v2/android-ci-reports-f7ad2f9/. The established release-signing CI step was skipped; no release signing key was created. CI artifact retention is14days; local copies remain. Earlier b012a74 files under artifacts/v2/android-candidate/ are historical and are not the final corrected candidate.

All seven implementation milestones are complete as reviewable candidates. Both branch updates are pushed independently. There is no product merge, deployment, publication or device acceptance claim.

## Acceptance boundary

Installation follow-up (2026-10-27): the owner reported a package-conflict installer error. Shipped V1 and V2 have the same package ID but different debug signing certificates, so this V2 APK cannot update that V1 in place. A fresh install requires uninstalling the previous app, which can erase local data. Keeping V1 requires a separately packaged V2 candidate; an in-place update requires the original installed app's signing key. No device uninstall or package/signing change was performed. Signature verification above proves APK validity, not compatibility with an existing installation.

Before release, play all14 games with three or more real participants on phone/PC. Check fighter/opponent/spectator privacy, reconnect during study/answer/commit/reveal, bets, qualifiers, championship ties, disconnect-forfeit and VOID refunds. Confirm timed-game scrolling and orientation are comfortable.

Public HTTPS/WSS deployment and physical Android LAN discovery/hosting/joining remain owner acceptance. No device was installed, wiped or modified. Release signing requires the established identity; no signing key is created by this task. Candidate branches stay separate from V1 main/web/frozen refs. Merge, deployment, publication and frozen-branch retirement require separate authorization.
