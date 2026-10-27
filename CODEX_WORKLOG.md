# BET-BRAWL V2 candidate checkpoint

## Final contract correction — 2026-10-27 (overrides prior handoff below)
- Final shared/native patch scopes all14 network fighter actions (current match/stage0legacy/action identity, dedup and acknowledgments), retains published Node V2 deadlines/puzzle after delayed callbacks, and hides recomputed played results for forfeit/VOID recaps.
- Android runtime e186e154334e4109d958c15b76544714943b5b15 pushed; local shared verify103/103 +build/sync PASS, separate-module native76/76 PASS. Exact-source Android CI40468986738 SUCCESS. Prior b012a74 APKs below are historical and must be replaced for final handoff.
- Actual App browser smoke at e186e15 passes V1 rapid_red_green scoped TAPs/visible scores and Memory study/draft/lock/payout with6 accepted scoped acknowledgments, no page errors. No remaining local native/browser process.
- Current branch codex/v2-games-web: applied only six-file shared delta (preserved web routing), plus reviewed Worker files. Full local cf:verify PASS96/96 engine/client +19/19 Worker, typechecks/build/dryrun and actual SQLite/WebSocket restart/protocol suite (artifacts/v2/web-final-contract-verify.log). A remaining random host-grace fixture was pinned to its intended V1 game; transfer that one test-only line to Android as well. Commit/push final web source, then record both final exact-source CI runs and refreshed APKs.
- Evidence: artifacts/v2/{android-final-contract-verify.log,native-final-contract-green.log,payout-forfeit-red.log,payout-forfeit-green.log,android-final-protocol.md,final-web/REPORT.md,browser/final-protocol-results.json}. No merge/deploy/release/device actions.

## Outcome and boundary
[Approved 14-game plan](docs/superpowers/plans/2026-10-26-v2-games.md), milestones1–7 COMPLETE as reviewable web and Android/LAN candidates. Version2.0.0/protocol2, Android code2. No merge, deployment, public release, device installation, signing identity creation or Android tooling installation. Physical/public/manual acceptance remains separate. User explicitly approved pushes of both V2 branches to RyanEid06/BET-BRAWL for CI.

## Branch and source provenance
- Canonical C:/Users/Administrator/Desktop/Projects/BET-BRAWL; current branch codex/v2-games-web. Private candidate branches reused the canonical checkout; no extra worktree/clone.
- Web verified runtime source c1e03cfae7078488cc2f44daac0523e34664e84b, pushed codex/v2-games-web; exact CI40361090266 SUCCESS.
- Android verified runtime source b012a74a26d2bcf9c48b787af0d3ebca9b4f324f, pushed codex/v2-games-android; exact CI40362713620 SUCCESS.
- Final documentation-only commits may follow those sources; verify runtime diff is empty. V1 main2ee6d66, web-ready a60a79d and frozen e1f948c/tag remain unchanged. Never merge Cloudflare routing into LAN or retire frozen refs without fresh authorization.

## Architecture and important files
- src/engine/v2Games.ts + native server/engine/V2Games.kt: eight pure authoritative games; explicit recipient projections, absolute phases/deadlines, immutable choices, simultaneous resolution, no arrival-time tiebreakers.
- Shared GameEngine/RoomEngine and three hosts: match/action/stage identities, catch-up before stage validation, dedup, shuffled14-game bag spanning qualifiers/finals, fresh tournament reset. Cloud DO persists private state/rotation/schedule; candidate Worker name bet-brawl-v2-candidate isolates future storage.
- src/components/games/V2GameView.tsx/.css, PayoutRecapModal and App expose phone/PC controls and finished explanations. Client IDs use getRandomValues for ordinary LAN HTTP. Android bridge/deep links/discovery/HostService retained; all create/join paths send protocol2.
- Canonical src/engine/fixtures/v2-parity.json and v2-projections.json are used by TS and Kotlin (8 traces,104 full-state checkpoints,312 recipient views). Gradle resources point to the canonical fixtures.

## Observed evidence
- Web full cf:verify PASS:92 engine/client +18 Worker tests, build/typechecks, dry run, actual local SQLite/WebSocket tournament/private-action/restart/deadline recovery. CI40361090266 green.
- Android shared verify PASS100/100, typecheck/build/asset sync. Separate-module native compile on existing JDK17/compiler2.2.10 language/API1.9 PASS75/75. CI40362713620 confirms75 Gradle tests, lint0errors/14warnings, debug/release assembly.
- Browser32 game/viewport cases at360x640/390x844/768x1024/1366x768; touch/mouse/roles/results/phase transitions/focus/reduced-motion/orientation, >=44px targets, no horizontal overflow. Compact Mirror fits short phone; longer boards/results scroll.
- Actual App rooms: three real browser clients +debug bot, Memory/Safecracker actions/privacy/payout. Wi-Fi HTTP confirms insecure-context IDs. Actual Android hostGame hook with simulated bridge RED→GREEN protocol rejection/create/join/start/Memory/payout. No native Activity/service/physical acceptance implied.
- Independent reviews: four web findings fixed RED→GREEN (logical recovery, varied Circuit route, stale stage, payout explanation); one Android host payload finding fixed via actual hook reproduction. Explicit PASS-null serialization and HostService constructor callback compatibility also regression-tested. No deferred important/minor review findings.

## APK handoff
Directory artifacts/v2/android-candidate, source b012a74 /CI40362713620. Both package com.betbrawl.app/version2.0.0/code2/min24/target35; all8new IDs present.
- BET-BRAWL-V2-2.0.0-debug-b012a74.apk:6482185bytes, SHA256 d63392e5acc6504ba1a9cfc9c3d54141aabcb39bb4281954b0aa6b2899ec8475. Android Debug certificate/APKv2 signature verifies.
- BET-BRAWL-V2-2.0.0-release-unsigned-b012a74.apk:5194806bytes, SHA256 bf068fa0fea5548aec0dd6854019219e964d3df62a02693ad2bd8b7a3eca6e98. Unsigned; existing release identity needed before installation. Signing CI step skipped, no key created.
- Debug/release assets3/3 byte-identical. Local JS/CSS byte-identical to CI; HTML differs only by one blank line. Independent aapt/apksigner logs +verification.json retained. artifacts/v2/android-ci-reports contains actual75-test and lint reports. See docs/V2_CANDIDATE.md for links/provenance/manual steps.

## Environment and useful evidence
- Local SDK35 absent (only37); CI performed required Gradle checks. Existing SDK37 tools verified artifacts. Bundled real Python: C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe. Windows python alias/py has no installation.
- Loopback tests need approved escalation; GitHub uses Windows git/gh keyring. Initial push rejection resolved by direct owner approval. Recurring follow-up rejected as persistent actions; no automation was created, handoff completed in-chat.
- Removed13 task-created staged duplicate/script/patch files and6 staging/compiler directories after absolute-path audit (artifacts/v2/cleanup-manifest.json). Preserved reports/logs/browser evidence/APKs and the integrated native runner/dependency. All artifacts/v1 and other user evidence untouched.

## Next action
Owner reviews the two candidates and performs physical Android/LAN +public online manual acceptance. Established release signing, merge/deployment/publication and frozen-branch retirement require separate authorization. No further product implementation is scheduled.
