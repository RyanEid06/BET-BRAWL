# BET-BRAWL V2 checkpoint — 2026-10-27

## Objective / boundary
[Approved V2 plan](docs/superpowers/plans/2026-10-26-v2-games.md): milestones1–7 COMPLETE as reviewable 14-game web and Android/LAN candidates. User approved both branch pushes to RyanEid06/BET-BRAWL for CI. No merge/deploy/publication, device installation, new signing identity, dependencies/modes/accounts/redesign or Android tooling installation. Physical/public acceptance remains separate.

## Current state / provenance
- Canonical C:/Users/Administrator/Desktop/Projects/BET-BRAWL; current branch codex/v2-games-android, verified source f7ad2f91160bd71197d51675409ac5f90f5332b6 followed by final docs-only commits. No extra clone/worktree. Closure snapshot records final refs and clean state in artifacts/v2/closure.json.
- Final web source d20ccc4afd909818dfed88529c4fb8d776b8f508, CI40469684284 SUCCESS. Final Android source f7ad2f9, CI40469773003 SUCCESS:103 TS tests,76 Gradle tests, lint0errors/14warnings, debug/release assembly; established signing step skipped. Runtime e186e15 had prior green CI; f7ad2f9 pins only a legacy fixture/checkpoint.
- V1 main2ee6d66, web-ready a60a79d and frozen e1f948c/tag remain untouched. Preserve LAN/cloud routing separation; no branch merge. Final documentation-only heads can follow verified source; check runtime diff empty.

## Architecture / important files
- Pure src/engine/v2Games.ts and native server/engine/V2Games.kt: eight rules, absolute stages/deadlines, private recipient projections and simultaneous results. Shared GameEngine/RoomEngine +three hosts own identities/dedup and shuffled14-game bag.
- All14 network actions now scoped by match/stage/action identity (legacy stage0), with accepted/rejected acks and replay protection. Pure-rule/internal bot APIs keep trusted decision objects.
- Node and Worker keep published V2 clocks/generated puzzles through delayed callbacks. Worker persists schedule/private choices/rotation. Candidate Worker bet-brawl-v2-candidate isolated from V1.
- App/V2GameView/PayoutRecapModal support phone/PC, final explanations and authoritative forfeit/VOID outcomes. getRandomValues IDs work on ordinary LAN HTTP. Native service/discovery/deep links/WebView kept intact; all create/join paths send protocol2.
- Canonical fixtures src/engine/fixtures consumed by TS/Kotlin:8 traces,104 full-state/312 recipient checkpoints. Android version2.0.0/code2/protocol2; package com.betbrawl.app, min24/target35.

## Observed verification
- Final local web cf:verify PASS96 shared +19 Worker; typechecks/build/dryrun and actual local Wrangler/SQLite/WebSocket tournament/restart/privacy/replay. Exact CI40469684284 green. artifacts/v2/web-final-contract-verify.log.
- Final local Android shared verify PASS103 +build/assetsync; separate production/test native compiler modules PASS76/76 (existing JDK17/Kotlin2.2.10 language/API1.9). artifacts/v2/android-final-contract-verify.log and native-final-contract-green.log.
- Independent review fixes RED→GREEN: logical recovery, varied Circuit route, stale stage, visible final payout, Android native-host missing protocolVersion, explicit PASS nulls, HostService callback compatibility; final contract adds all14 legacy action identities/replay, Node delayed-start preservation, and no contradictory forfeit recap. No deferred review findings.
- Browser32 component cases at360x640/390x844/768x1024/1366x768; touch/mouse/roles/results/study transition/focus/reduced-motion/orientation, >=44px targets/no horizontal overflow. Mirror short-phone fixed; longer boards scroll.
- Actual App final browser smoke at e186e15: V1 taps stage0 with accepted acks/visible scores; Memory study→draft/lock/payout,6 accepted scoped inputs, zero page errors on insecure HTTP. Previous native hostGame hook simulated-bridge path also RED→GREEN. artifacts/v2/browser/REPORT.md. No physical/native Activity acceptance implied. All local test/browser/native processes ended.

## Artifacts / environment
- Final APKs/reports from CI40469773003 retained in artifacts/v2/android-candidate-f7ad2f9 and android-ci-reports-f7ad2f9. Both com.betbrawl.app/version2.0.0/code2/min24/target35; all8new game IDs; debug/release assets3/3 identical. CI/local JS+CSS byte-identical; HTML only a blank-line difference. aapt/apksigner/verification.json retained.
- Debug BET-BRAWL-V2-2.0.0-debug-f7ad2f9.apk:6482141bytes, SHA256 ea4cc72659935cc207dff08be8487da012640cf3a307e2d3d59d41cd4c4778f8; Android Debug certificate/APKv2 signature verifies.
- Release BET-BRAWL-V2-2.0.0-release-unsigned-f7ad2f9.apk:5194426bytes, SHA256 2aac354b45a798a99d91fe20fb93148fa3ae1cc0faf955ec6523f86bcf617a56; unsigned, established identity required before installation. Older b012a74 files are historical only.
- Used existing SDK37 aapt/apksigner and bundled Python C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe. Windows python alias/py has no installation. SDK35 absent locally; CI performed Gradle checks without local tooling installs.
- Loopback tests required approved escalation. GitHub uses Windows git/gh keyring. Initial push rejection resolved by direct approval. Recurring follow-up rejected; no automation created, handoff finished in-chat.
- Audited task-owned stage/transfer/compiler cleanup completed; manifests artifacts/v2/cleanup-manifest.json and cleanup-final-contract-manifest.json retained. Reports/logs/browser/CI/APKs/native runner dependency and all V1/user evidence preserved. No local test/browser/native process remains.

## Exact next action
Owner reviews the two candidates and performs physical Android/LAN +public online/manual acceptance per docs/V2_CANDIDATE.md. Established release signing, merge/deployment/publication and frozen-branch retirement require separate authorization. No further product implementation or automated follow-up is scheduled.
